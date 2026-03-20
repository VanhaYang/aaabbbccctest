import type http from 'http'
import {
  executeTerminalCommand,
  getTerminalSessionInfo,
  killTerminalCommand
} from '../../services/terminalExecutionService'
import log from '../../logger'
import { parseRequestBody, sendJsonResponse } from '../utils'

export async function handleTerminalExecute(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const body = await parseRequestBody(req)
    const { command } = body || {}

    if (!command || typeof command !== 'string' || command.trim().length === 0) {
      sendJsonResponse(res, 400, null, '参数错误：command 不能为空', false)
      return
    }

    const result = await executeTerminalCommand(command.trim())

    if (!result.success) {
      sendJsonResponse(res, 400, {
        cwd: result.cwd,
        workspacePath: result.workspacePath,
        ...(result.attemptedPath !== undefined && { attemptedPath: result.attemptedPath })
      }, result.error || '命令执行失败', false)
      return
    }

    sendJsonResponse(res, 200, {
      result: result.result,
      parsed: result.parsed,
      cwd: result.cwd,
      workspacePath: result.workspacePath
    })
  } catch (error) {
    log.error('[API Server] 终端执行失败:', error)
    const errorMessage = error instanceof Error ? error.message : '终端执行失败'
    sendJsonResponse(res, 500, null, errorMessage, false)
  }
}

export function handleTerminalKill(_req: http.IncomingMessage, res: http.ServerResponse): void {
  const result = killTerminalCommand()
  if (result.success) {
    sendJsonResponse(res, 200, { success: true })
    return
  }
  sendJsonResponse(res, 400, null, result.error || '中断命令失败', false)
}

export function handleTerminalSession(_req: http.IncomingMessage, res: http.ServerResponse): void {
  const result = getTerminalSessionInfo()
  if (!result.success) {
    sendJsonResponse(res, 400, null, result.error || '终端初始化失败', false)
    return
  }
  sendJsonResponse(res, 200, result)
}
