import * as path from 'path'
import * as fs from 'fs'
import { randomUUID } from 'crypto'
import type { TerminalCommand } from '../types/terminal'
import log from '../logger'
import { configManager } from '../configManager'
import { TERMINAL_HISTORY_LIMIT } from '../../shared/terminalConfig'

/**
 * 终端会话状态管理
 *
 * ⚠️ 重要点：
 * - 每个会话有唯一的 sessionId
 * - 维护当前工作目录（cwd）
 * - 支持 cd 命令的本地处理（不实际执行，只更新 cwd）
 * - 保存有上限的命令历史
 *
 * 💡 优化点：
 * - 可以持久化命令历史到本地文件
 * - 可以支持多个会话实例
 *
 * 🔌 扩展点：
 * - 支持环境变量管理
 * - 支持会话快照和恢复
 * - 支持命令别名和函数定义
 */
export class TerminalSession {
  sessionId: string
  cwd: string
  env: Record<string, string>
  history: TerminalCommand[]
  isRunning: boolean
  private static createSessionId(): string {
    try {
      return typeof randomUUID === 'function' ? randomUUID() : `session-${Date.now()}`
    } catch (error) {
      log.warn('[TerminalSession] 生成会话 ID 失败，使用时间戳:', error)
      return `session-${Date.now()}`
    }
  }

  constructor() {
    this.sessionId = TerminalSession.createSessionId()

    // 使用工作区路径作为初始工作目录
    const workspacePath = configManager.getWorkspacePath()
    if (!workspacePath) {
      // 如果没有工作区路径，抛出错误
      throw new Error('未配置工作区路径，请在设置中配置工作区路径')
    }

    // 验证工作区路径是否存在
    if (!fs.existsSync(workspacePath)) {
      throw new Error(`工作区路径不存在: ${workspacePath}`)
    }

    // 验证工作区路径是否为目录
    const stats = fs.statSync(workspacePath)
    if (!stats.isDirectory()) {
      throw new Error(`工作区路径不是目录: ${workspacePath}`)
    }

    this.cwd = workspacePath
    this.env = Object.fromEntries(
      Object.entries(process.env).filter(([_, value]) => value !== undefined)
    ) as Record<string, string>
    this.history = []
    this.isRunning = false
  }

  /** updateCwd 的返回类型：失败时带 attemptedPath 便于排查 */
  updateCwdResult(newPath: string): { success: true } | { success: false; attemptedPath: string } {
    try {
      // 获取工作区路径
      const workspacePath = configManager.getWorkspacePath()
      if (!workspacePath) {
        const resolved = path.isAbsolute(newPath) ? path.normalize(newPath) : path.resolve(this.cwd, newPath)
        return { success: false, attemptedPath: resolved }
      }

      // 处理相对路径
      const resolvedPath = path.isAbsolute(newPath)
        ? path.normalize(newPath)
        : path.resolve(this.cwd, newPath)

      // 规范化工作区路径和解析后的路径，确保路径格式一致
      // 使用 path.resolve 确保路径比较的准确性（处理相对路径、.. 等）
      const normalizedWorkspace = path.normalize(workspacePath)
      const normalizedFilePath = path.normalize(resolvedPath)
      const resolvedWorkspace = path.resolve(normalizedWorkspace)
      const resolvedFilePath = path.resolve(normalizedFilePath)

      // 限制目录不能超出工作区路径
      // 检查解析后的路径是否在工作区路径内（或等于工作区路径）
      // 在 Windows 上，路径比较应该不区分大小写
      const workspaceLower = resolvedWorkspace.toLowerCase()
      const filePathLower = resolvedFilePath.toLowerCase()
      const isInWorkspace =
        filePathLower === workspaceLower || filePathLower.startsWith(workspaceLower + path.sep)

      if (!isInWorkspace) {
        log.warn('[TerminalSession] 不能退出工作区路径:', {
          workspacePath: resolvedWorkspace,
          attemptedPath: resolvedFilePath,
          currentCwd: this.cwd
        })
        return { success: false, attemptedPath: resolvedFilePath }
      }

      // 验证路径是否存在且为目录
      if (!fs.existsSync(resolvedPath)) {
        return { success: false, attemptedPath: resolvedPath }
      }

      const stats = fs.statSync(resolvedPath)
      if (!stats.isDirectory()) {
        log.warn('[TerminalSession] 路径不是目录:', resolvedPath)
        return { success: false, attemptedPath: resolvedPath }
      }

      // 更新当前工作目录
      this.cwd = resolvedPath
      return { success: true }
    } catch (error) {
      log.error('[TerminalSession] 更新工作目录失败:', error)
      const resolved = path.isAbsolute(newPath) ? path.normalize(newPath) : path.resolve(this.cwd, newPath)
      return { success: false, attemptedPath: resolved }
    }
  }

  /**
   * 更新当前工作目录（兼容旧接口）
   * @param newPath 新的工作目录路径（相对或绝对路径）
   * @returns 是否成功更新
   */
  updateCwd(newPath: string): boolean {
    return this.updateCwdResult(newPath).success
  }

  /**
   * 处理 cd 命令
   * 解析 cd 命令参数并更新工作目录
   *
   * @param command cd 命令字符串（如 "cd /path/to/dir" 或 "cd .."）
   * @returns 成功为 { success: true }，失败为 { success: false, attemptedPath }
   */
  handleCdCommand(
    command: string
  ): { success: true } | { success: false; attemptedPath: string } {
    const cdMatch = command.match(/^cd\s+(.+)$/i)
    if (!cdMatch) {
      return { success: false, attemptedPath: '' }
    }

    const targetPath = cdMatch[1].trim()

    // 处理特殊路径
    if (targetPath === '~' || targetPath === '$HOME') {
      const homeDir = process.env.HOME || process.env.USERPROFILE || this.cwd
      return this.updateCwdResult(homeDir)
    }

    return this.updateCwdResult(targetPath)
  }

  /**
   * 将命令添加到历史记录
   * 超出上限时删除最旧的记录
   *
   * @param cmd 要添加的命令
   */
  addCommandToHistory(cmd: TerminalCommand): void {
    // 限制历史记录最多 50 条
    if (this.history.length >= TERMINAL_HISTORY_LIMIT) {
      this.history.shift()
    }
    this.history.push(cmd)
  }

  /**
   * 获取当前环境变量
   *
   * @returns 环境变量的副本
   */
  getCurrentEnv(): Record<string, string> {
    return { ...this.env }
  }

  /**
   * 更新环境变量
   *
   * @param key 环境变量名
   * @param value 环境变量值
   */
  setEnv(key: string, value: string): void {
    this.env[key] = value
  }

  /**
   * 获取命令历史（只返回命令字符串数组）
   *
   * @returns 命令字符串数组
   */
  getCommandHistory(): string[] {
    return this.history.map(cmd => cmd.command)
  }

  /**
   * 清空命令历史
   */
  clearHistory(): void {
    this.history = []
  }

  /**
   * 重置会话状态
   */
  reset(): void {
    // 使用工作区路径作为初始工作目录
    const workspacePath = configManager.getWorkspacePath()
    if (workspacePath && fs.existsSync(workspacePath)) {
      const stats = fs.statSync(workspacePath)
      if (stats.isDirectory()) {
        this.cwd = workspacePath
      } else {
        this.cwd = process.cwd()
      }
    } else {
      this.cwd = process.cwd()
    }

    this.env = Object.fromEntries(
      Object.entries(process.env).filter(([_, value]) => value !== undefined)
    ) as Record<string, string>
    this.history = []
    this.isRunning = false
  }
}
