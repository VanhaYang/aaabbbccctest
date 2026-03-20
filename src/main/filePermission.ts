import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import log from './logger'
import { configManager } from './configManager'
import { isPathInside } from './pathGuards'

/**
 * 路径验证结果
 */
export interface PathValidationResult {
  valid: boolean
  error?: string
  warnings?: string[]
}

/**
 * 文件权限检查模块
 * 负责检查文件是否在工作区内，以及是否有读写权限
 */
export class FilePermissionManager {
  /**
   * 检查文件路径是否在工作区内
   * @param filePath 要检查的文件路径
   * @returns 如果文件在工作区内返回 true，否则返回 false
   */
  /**
   * 与 pathGuards.isPathInside 一致：先 resolve 再 path.relative 判断，
   * 避免误杀含 ".." 的合法文件名，并在 Windows 上正确处理大小写。
   */
  isPathInWorkspace(filePath: string): boolean {
    const workspacePath = configManager.getWorkspacePath()
    if (!workspacePath) return false
    try {
      return isPathInside(workspacePath, filePath)
    } catch (error) {
      log.error('[文件权限] 检查路径失败:', error)
      return false
    }
  }

  /**
   * 检查文件是否有读权限
   * @param filePath 要检查的文件路径
   * @returns 如果有读权限返回 true，否则返回 false
   */
  hasReadPermission(filePath: string): boolean {
    // 首先检查是否在工作区内
    if (!this.isPathInWorkspace(filePath)) {
      return false
    }

    try {
      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        return false
      }

      // 检查文件是否可读
      fs.accessSync(filePath, fs.constants.R_OK)
      return true
    } catch (error) {
      log.error('[文件权限] 检查读权限失败:', error)
      return false
    }
  }

  /**
   * 检查文件是否有写权限
   * @param filePath 要检查的文件路径
   * @returns 如果有写权限返回 true，否则返回 false
   */
  hasWritePermission(filePath: string): boolean {
    // 首先检查是否在工作区内
    if (!this.isPathInWorkspace(filePath)) {
      return false
    }

    try {
      // 如果文件不存在，检查父目录是否有写权限
      if (!fs.existsSync(filePath)) {
        const dir = path.dirname(filePath)
        if (!fs.existsSync(dir)) {
          return false
        }
        fs.accessSync(dir, fs.constants.W_OK)
        return true
      }

      // 检查文件是否可写
      fs.accessSync(filePath, fs.constants.W_OK)
      return true
    } catch (error) {
      log.error('[文件权限] 检查写权限失败:', error)
      return false
    }
  }

  /**
   * 检查目录是否有读权限
   * @param dirPath 要检查的目录路径
   * @returns 如果有读权限返回 true，否则返回 false
   */
  hasDirectoryReadPermission(dirPath: string): boolean {
    // 首先检查是否在工作区内
    if (!this.isPathInWorkspace(dirPath)) {
      return false
    }

    try {
      // 检查目录是否存在
      if (!fs.existsSync(dirPath)) {
        return false
      }

      // 检查是否为目录
      const stats = fs.statSync(dirPath)
      if (!stats.isDirectory()) {
        return false
      }

      // 检查目录是否可读
      fs.accessSync(dirPath, fs.constants.R_OK)
      return true
    } catch (error) {
      log.error('[文件权限] 检查目录读权限失败:', error)
      return false
    }
  }

  /**
   * 获取工作区路径
   * @returns 工作区路径，如果未配置则返回 undefined
   */
  getWorkspacePath(): string | undefined {
    return configManager.getWorkspacePath()
  }

  /**
   * 验证工作区路径是否合理
   * @param workspacePath 要验证的工作区路径
   * @returns 验证结果
   */
  validateWorkspacePath(workspacePath: string): PathValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    try {
      // 1. 检查路径是否为空
      if (!workspacePath || workspacePath.trim().length === 0) {
        return {
          valid: false,
          error: '工作区路径不能为空'
        }
      }

      // 2. 规范化路径
      const normalizedPath = path.normalize(workspacePath.trim())
      const resolvedPath = path.resolve(normalizedPath)

      // 3. 检查路径长度（Windows 路径最大长度 260 字符）
      if (resolvedPath.length > 260) {
        return {
          valid: false,
          error: '路径过长，Windows 系统路径最大长度为 260 字符'
        }
      }

      // 4. 检查是否为系统文件夹（Windows）
      if (process.platform === 'win32') {
        const systemPaths = this.getWindowsSystemPaths()
        const lowerPath = resolvedPath.toLowerCase()
        
        for (const systemPath of systemPaths) {
          if (lowerPath === systemPath || lowerPath.startsWith(systemPath + '\\')) {
            return {
              valid: false,
              error: `不能选择系统文件夹：${systemPath}`
            }
          }
        }
      }

      // 5. 检查路径是否在应用目录内（避免选择应用自身目录）
      try {
        const appPath = app.getAppPath()
        const appPathLower = appPath.toLowerCase()
        const resolvedPathLower = resolvedPath.toLowerCase()
        
        if (resolvedPathLower === appPathLower || resolvedPathLower.startsWith(appPathLower + path.sep)) {
          warnings.push('建议不要选择应用安装目录')
        }
      } catch (err) {
        // 忽略错误，继续验证
      }

      // 6. 检查目录是否存在
      if (!fs.existsSync(resolvedPath)) {
        // 如果目录不存在，检查父目录是否存在且可写
        const parentDir = path.dirname(resolvedPath)
        if (!fs.existsSync(parentDir)) {
          return {
            valid: false,
            error: '父目录不存在，无法创建工作区目录'
          }
        }

        // 检查父目录是否可写
        try {
          fs.accessSync(parentDir, fs.constants.W_OK)
        } catch (err) {
          return {
            valid: false,
            error: '父目录没有写权限，无法创建工作区目录'
          }
        }

        // 目录不存在但父目录可写，这是允许的（会在使用时创建）
        warnings.push('目录不存在，将在使用时自动创建')
      } else {
        // 7. 检查是否为目录
        const stats = fs.statSync(resolvedPath)
        if (!stats.isDirectory()) {
          return {
            valid: false,
            error: '路径不是目录'
          }
        }

        // 8. 检查目录是否可读
        try {
          fs.accessSync(resolvedPath, fs.constants.R_OK)
        } catch (err) {
          return {
            valid: false,
            error: '目录没有读权限'
          }
        }

        // 9. 检查目录是否可写
        try {
          fs.accessSync(resolvedPath, fs.constants.W_OK)
        } catch (err) {
          return {
            valid: false,
            error: '目录没有写权限'
          }
        }

        // 10. 尝试在目录中创建测试文件（验证写权限）
        try {
          const testFilePath = path.join(resolvedPath, '.workspace-test-' + Date.now() + '.tmp')
          fs.writeFileSync(testFilePath, 'test', 'utf-8')
          fs.unlinkSync(testFilePath)
        } catch (err) {
          return {
            valid: false,
            error: '无法在目录中创建文件，请检查写权限'
          }
        }
      }

      return {
        valid: true,
        warnings: warnings.length > 0 ? warnings : undefined
      }
    } catch (error) {
      log.error('[文件权限] 验证工作区路径失败:', error)
      return {
        valid: false,
        error: error instanceof Error ? error.message : '验证路径时发生未知错误'
      }
    }
  }

  /**
   * 获取 Windows 系统路径列表
   * @returns 系统路径数组（小写）
   */
  private getWindowsSystemPaths(): string[] {
    const systemPaths: string[] = []

    // Windows 系统目录
    const systemRoot = process.env.SYSTEMROOT || process.env.WINDIR || 'C:\\Windows'
    systemPaths.push(systemRoot.toLowerCase())

    // Program Files 目录
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
    systemPaths.push(programFiles.toLowerCase())

    // Program Files (x86) 目录
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
    systemPaths.push(programFilesX86.toLowerCase())

    // ProgramData 目录
    const programData = process.env.ProgramData || 'C:\\ProgramData'
    systemPaths.push(programData.toLowerCase())

    // 用户目录下的系统文件夹
    const userProfile = process.env.USERPROFILE || process.env.HOME || ''
    if (userProfile) {
      const userProfileLower = userProfile.toLowerCase()
      systemPaths.push(path.join(userProfileLower, 'appdata', 'local').toLowerCase())
      systemPaths.push(path.join(userProfileLower, 'appdata', 'roaming').toLowerCase())
      systemPaths.push(path.join(userProfileLower, 'appdata', 'locallow').toLowerCase())
    }

    // 其他常见系统目录
    systemPaths.push('c:\\windows\\system32')
    systemPaths.push('c:\\windows\\syswow64')
    systemPaths.push('c:\\windows\\temp')
    systemPaths.push('c:\\programdata')

    return systemPaths
  }
}

// 导出单例
export const filePermissionManager = new FilePermissionManager()

