import log from '../logger'
import { ipcMain, shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { fileExplorerWindowManager } from '../fileExplorerWindow'
import { filePermissionManager } from '../filePermission'

const copyDirectoryRecursive = async (sourceDir: string, targetDir: string): Promise<void> => {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true })
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)
    if (entry.isDirectory()) {
      await copyDirectoryRecursive(sourcePath, targetPath)
    } else {
      fs.copyFileSync(sourcePath, targetPath)
    }
  }
}

const getFileType = (ext: string): 'text' | 'image' | 'video' | 'audio' => {
  const imageExts = [
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.bmp',
    '.webp',
    '.svg',
    '.ico',
    '.tiff',
    '.tif'
  ]
  const videoExts = [
    '.mp4',
    '.avi',
    '.mov',
    '.wmv',
    '.flv',
    '.mkv',
    '.webm',
    '.m4v',
    '.3gp',
    '.ogv'
  ]
  const audioExts = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma', '.opus', '.amr']

  if (imageExts.includes(ext)) return 'image'
  if (videoExts.includes(ext)) return 'video'
  if (audioExts.includes(ext)) return 'audio'
  return 'text'
}

const getMimeType = (ext: string): string => {
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
    '.mp4': 'video/mp4',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.m4v': 'video/x-m4v',
    '.3gp': 'video/3gpp',
    '.ogv': 'video/ogg',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.m4a': 'audio/mp4',
    '.wma': 'audio/x-ms-wma',
    '.opus': 'audio/opus',
    '.amr': 'audio/amr'
  }

  return mimeTypes[ext] || 'application/octet-stream'
}

const getFileLanguage = (ext: string): string => {
  const languageMap: Record<string, string> = {
    '.html': 'html',
    '.htm': 'html',
    '.md': 'markdown',
    '.markdown': 'markdown',
    '.json': 'json',
    '.txt': 'text',
    '.log': 'text',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.css': 'css',
    '.scss': 'scss',
    '.sass': 'sass',
    '.less': 'less',
    '.xml': 'xml',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.py': 'python',
    '.java': 'java',
    '.cpp': 'cpp',
    '.cxx': 'cpp',
    '.cc': 'cpp',
    '.c': 'c',
    '.h': 'c',
    '.hpp': 'cpp',
    '.go': 'go',
    '.rs': 'rust',
    '.php': 'php',
    '.rb': 'ruby',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.sh': 'shell',
    '.bash': 'bash',
    '.zsh': 'zsh',
    '.ps1': 'powershell',
    '.sql': 'sql',
    '.dockerfile': 'dockerfile',
    '.makefile': 'makefile',
    '.ini': 'ini',
    '.toml': 'toml',
    '.conf': 'ini',
    '.config': 'ini'
  }

  return languageMap[ext] || 'text'
}

export const registerFileExplorerIpcHandlers = (): void => {
  // 打开文件管理器窗口
  ipcMain.handle('file-explorer:open', async () => {
    try {
      fileExplorerWindowManager.show()
      return { success: true }
    } catch (error) {
      log.error('打开文件管理器失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  })

  // 关闭文件管理器窗口
  ipcMain.handle('file-explorer:close', async () => {
    try {
      fileExplorerWindowManager.close()
      return { success: true }
    } catch (error) {
      log.error('关闭文件管理器失败:', error)
      return { success: false }
    }
  })

  // 刷新文件管理器
  ipcMain.handle('file-explorer:refresh', async () => {
    try {
      fileExplorerWindowManager.refresh()
      return { success: true }
    } catch (error) {
      log.error('刷新文件管理器失败:', error)
      return { success: false }
    }
  })

  // 读取文件内容
  ipcMain.handle('file-explorer:read-file', async (_event, filePath: string) => {
    try {
      if (!filePermissionManager.hasReadPermission(filePath)) {
        return {
          success: false,
          error: '没有读取该文件的权限'
        }
      }

      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: '文件不存在'
        }
      }

      const stats = fs.statSync(filePath)
      if (!stats.isFile()) {
        return {
          success: false,
          error: '路径不是文件'
        }
      }

      const ext = path.extname(filePath).toLowerCase()
      const fileType = getFileType(ext)

      if (fileType === 'image' || fileType === 'video' || fileType === 'audio') {
        const maxMediaSize = 50 * 1024 * 1024
        if (stats.size > maxMediaSize) {
          return {
            success: false,
            error: `文件过大（${Math.round(stats.size / 1024 / 1024)}MB），超过 50MB 限制`
          }
        }

        const buffer = fs.readFileSync(filePath)
        const base64 = buffer.toString('base64')
        const mimeType = getMimeType(ext)
        const dataUrl = `data:${mimeType};base64,${base64}`

        return {
          success: true,
          content: dataUrl,
          language: fileType,
          fileName: path.basename(filePath),
          fileType,
          mimeType
        }
      }

      const maxTextSize = 10 * 1024 * 1024
      if (stats.size > maxTextSize) {
        return {
          success: false,
          error: `文件过大（${Math.round(stats.size / 1024 / 1024)}MB），超过 10MB 限制`
        }
      }

      const content = fs.readFileSync(filePath, 'utf-8')
      const language = getFileLanguage(ext)

      return {
        success: true,
        content,
        language,
        fileName: path.basename(filePath),
        fileType: 'text'
      }
    } catch (error) {
      log.error('读取文件失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '读取文件失败'
      }
    }
  })

  // 读取目录内容
  ipcMain.handle('file-explorer:read-directory', async (_event, dirPath: string) => {
    try {
      if (!filePermissionManager.hasDirectoryReadPermission(dirPath)) {
        return {
          success: false,
          error: '没有读取该目录的权限'
        }
      }

      if (!fs.existsSync(dirPath)) {
        return {
          success: false,
          error: '目录不存在'
        }
      }

      const stats = fs.statSync(dirPath)
      if (!stats.isDirectory()) {
        return {
          success: false,
          error: '路径不是目录'
        }
      }

      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      const items = entries.map(entry => {
        const fullPath = path.join(dirPath, entry.name)
        return {
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory()
        }
      })

      return {
        success: true,
        items
      }
    } catch (error) {
      log.error('读取目录失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '读取目录失败'
      }
    }
  })

  // 使用系统默认程序打开文件
  ipcMain.handle('file-explorer:open-with-system', async (_event, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: '文件不存在'
        }
      }

      const blockedExtensions = [
        '.exe',
        '.bat',
        '.cmd',
        '.com',
        '.scr',
        '.msi',
        '.appx',
        '.appxbundle',
        '.dll',
        '.sys',
        '.drv',
        '.ocx',
        '.cpl',
        '.reg',
        '.deb',
        '.rpm',
        '.pkg',
        '.dmg',
        '.vbs',
        '.wsf',
        '.wsh',
        '.jar',
        '.app',
        '.run',
        '.bin'
      ]

      const ext = path.extname(filePath).toLowerCase()
      if (blockedExtensions.includes(ext)) {
        return {
          success: false,
          error: '出于安全考虑，不允许打开可执行文件和系统文件'
        }
      }

      if (!filePermissionManager.hasReadPermission(filePath)) {
        return {
          success: false,
          error: '没有读取该文件的权限'
        }
      }

      const error = await shell.openPath(filePath)
      if (error) {
        return {
          success: false,
          error: error || '无法打开文件'
        }
      }

      return { success: true }
    } catch (error) {
      log.error('使用系统默认程序打开文件失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '打开文件失败'
      }
    }
  })

  // 复制文件到工作区
  ipcMain.handle(
    'file-explorer:copy-files',
    async (_event, filePaths: string[], targetDir: string) => {
      try {
        if (!filePermissionManager.hasWritePermission(targetDir)) {
          return {
            success: false,
            error: '没有写入目标目录的权限'
          }
        }

        if (!fs.existsSync(targetDir)) {
          return {
            success: false,
            error: '目标目录不存在'
          }
        }

        const targetStats = fs.statSync(targetDir)
        if (!targetStats.isDirectory()) {
          return {
            success: false,
            error: '目标路径不是目录'
          }
        }

        let copiedCount = 0
        let failedCount = 0
        const errors: string[] = []

        for (const filePath of filePaths) {
          try {
            if (!fs.existsSync(filePath)) {
              failedCount++
              errors.push(`文件不存在: ${filePath}`)
              continue
            }

            const sourceStats = fs.statSync(filePath)
            const fileName = path.basename(filePath)
            let targetPath = path.join(targetDir, fileName)

            if (fs.existsSync(targetPath)) {
              const ext = path.extname(fileName)
              const nameWithoutExt = path.basename(fileName, ext)
              let counter = 1
              do {
                targetPath = path.join(targetDir, `${nameWithoutExt} (${counter})${ext}`)
                counter++
              } while (fs.existsSync(targetPath) && counter < 1000)

              if (counter >= 1000) {
                failedCount++
                errors.push(`无法生成唯一文件名: ${fileName}`)
                continue
              }
            }

            if (sourceStats.isDirectory()) {
              await copyDirectoryRecursive(filePath, targetPath)
            } else {
              fs.copyFileSync(filePath, targetPath)
            }

            copiedCount++
          } catch (error) {
            failedCount++
            const errorMsg = error instanceof Error ? error.message : '未知错误'
            errors.push(`复制 ${path.basename(filePath)} 失败: ${errorMsg}`)
            log.error(`复制文件失败 ${filePath}:`, error)
          }
        }

        return {
          success: true,
          copiedCount,
          failedCount,
          errors: errors.length > 0 ? errors : undefined
        }
      } catch (error) {
        log.error('复制文件失败:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : '复制文件失败'
        }
      }
    }
  )
}
