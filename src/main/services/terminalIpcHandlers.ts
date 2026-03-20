import { ipcMain, IpcMainInvokeEvent } from 'electron'
import log from '../logger'
import type { ExecuteCommandRequest, ExecuteCommandResponse } from '../types/terminal'
import {
  changeTerminalCwd,
  clearTerminalHistory,
  executeTerminalCommand,
  getTerminalSessionInfo,
  killTerminalCommand,
  toExecuteCommandResponse
} from './terminalExecutionService'

/**
 * 终端 IPC 事件处理器
 *
 * ⚠️ 重要点：
 * - 创建全局的 CommandExecutor 和 TerminalSession 实例
 * - 使用 ipcMain.handle() 处理请求-响应式调用
 * - 使用 event.sender.send() 推送实时输出
 * - 防止多个命令并发执行（队列机制）
 * - 记录所有执行的命令日志
 * - 需要工作区路径才能使用终端
 *
 * 💡 优化点：
 * - 可以支持多个终端会话
 * - 可以添加命令执行前的验证和过滤
 *
 * 🔌 扩展点：
 * - 支持命令历史查询
 * - 支持会话管理（创建、切换、删除）
 * - 支持命令执行统计和分析
 */

/**
 * 注册终端相关的 IPC 处理器
 */
export function registerTerminalHandlers(): void {
  /**
   * 执行命令
   * 事件名：terminal:execute-command
   * 方向：渲染进程 → 主进程
   */
  ipcMain.handle(
    'terminal:execute-command',
    async (
      event: IpcMainInvokeEvent,
      request: ExecuteCommandRequest
    ): Promise<ExecuteCommandResponse> => {
      const { command } = request

      // 验证命令不为空
      if (!command || command.trim().length === 0) {
        return {
          success: false,
          error: '命令不能为空'
        }
      }

      try {
        const result = await executeTerminalCommand(command.trim(), {
          onOutput: outputData => {
            try {
              if (!event.sender.isDestroyed()) {
                event.sender.send('terminal:output', outputData)
              }
            } catch (error) {
              log.error('[Terminal IPC] 推送输出失败:', error)
            }
          },
          onCwdChanged: cwd => {
            try {
              if (!event.sender.isDestroyed()) {
                event.sender.send('terminal:cwd-changed', { cwd })
              }
            } catch (error) {
              log.error('[Terminal IPC] 推送 cwd 更新失败:', error)
            }
          }
        })

        if (result.result && result.parsed) {
          try {
            if (!event.sender.isDestroyed()) {
              event.sender.send('terminal:execution-complete', {
                result: result.result,
                parsed: result.parsed
              })
            }
          } catch (error) {
            log.error('[Terminal IPC] 推送执行完成失败:', error)
          }
        }

        return toExecuteCommandResponse(result)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误'
        return { success: false, error: errorMessage }
      }
    }
  )

  /**
   * 杀死当前正在执行的命令
   * 事件名：terminal:kill-command
   * 方向：渲染进程 → 主进程
   */
  ipcMain.handle('terminal:kill-command', (): { success: boolean; error?: string } => {
    return killTerminalCommand()
  })

  /**
   * 改变工作目录
   * 事件名：terminal:change-cwd
   * 方向：渲染进程 → 主进程
   */
  ipcMain.handle(
    'terminal:change-cwd',
    (
      event: IpcMainInvokeEvent,
      newCwd: string
    ): { success: boolean; cwd?: string; error?: string } => {
      const result = changeTerminalCwd(newCwd)
      if (result.success && result.cwd) {
        try {
          if (!event.sender.isDestroyed()) {
            event.sender.send('terminal:cwd-changed', { cwd: result.cwd })
          }
        } catch (error) {
          log.error('[Terminal IPC] 推送 cwd 更新失败:', error)
        }
      }
      return result
    }
  )

  /**
   * 获取终端会话信息
   * 事件名：terminal:get-session-info
   * 方向：渲染进程 → 主进程
   */
  ipcMain.handle(
    'terminal:get-session-info',
    (): {
      success: boolean
      sessionId?: string
      cwd?: string
      isRunning?: boolean
      history?: string[]
      error?: string
    } => {
      return getTerminalSessionInfo()
    }
  )

  /**
   * 清空命令历史
   * 事件名：terminal:clear-history
   * 方向：渲染进程 → 主进程
   */
  ipcMain.handle('terminal:clear-history', (): { success: boolean; error?: string } => {
    return clearTerminalHistory()
  })
}
