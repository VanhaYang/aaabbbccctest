import { executeTerminalCommand } from '../../services/terminalExecutionService'
import type { ToolExecutor, ToolResult } from '../types'

export const exec: ToolExecutor = async (args): Promise<ToolResult> => {
  const command = typeof args.command === 'string' ? args.command.trim() : ''
  if (!command) {
    return { success: false, message: '参数错误：command 不能为空', code: 400 }
  }

  const workdir =
    typeof args.workdir === 'string' && args.workdir.trim()
      ? args.workdir.trim()
      : undefined
  const timeoutMs =
    typeof args.timeout === 'number' && Number.isFinite(args.timeout)
      ? args.timeout
      : undefined

  const result = await executeTerminalCommand(command, undefined, {
    cwd: workdir,
    timeout: timeoutMs
  })

  if (!result.success) {
    return {
      success: false,
      message: result.error || '命令执行失败',
      code: 400,
      data: {
        cwd: result.cwd,
        workspacePath: result.workspacePath,
        ...(result.attemptedPath !== undefined && {
          attemptedPath: result.attemptedPath
        })
      }
    }
  }

  return {
    success: true,
    data: {
      result: result.result,
      parsed: result.parsed,
      cwd: result.cwd,
      workspacePath: result.workspacePath
    }
  }
}
