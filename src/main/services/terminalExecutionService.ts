import * as path from 'path'
import log from '../logger'
import { CommandExecutor } from './CommandExecutor'
import { CommandQueue } from './CommandQueue'
import { TerminalSession } from './TerminalSession'
import { OutputParser } from './OutputParser'
import { configManager } from '../configManager'
import type {
  ExecuteOptions,
  ExecuteCommandResponse,
  ExecutionResult,
  OutputData,
  ParsedOutput
} from '../types/terminal'
import { DEFAULT_COMMAND_TIMEOUT_MS, GIT_CLONE_TIMEOUT_MS } from '../../shared/terminalConfig'

export type TerminalExecuteHooks = {
  onOutput?: (data: OutputData) => void
  onCwdChanged?: (cwd: string) => void
}

export type TerminalExecutionResult = {
  success: boolean
  result?: ExecutionResult
  parsed?: ParsedOutput
  /** 当前 shell 工作目录（pwd），失败时供调用方/AI 排查用 */
  cwd?: string
  /** 当前系统工作区根目录，失败时供调用方/AI 排查用 */
  workspacePath?: string
  /** cd 失败时，尝试进入的路径（便于排查「目录不存在或无法访问」） */
  attemptedPath?: string
  error?: string
}

type TerminalInitResult =
  | { success: true; executor: CommandExecutor; session: TerminalSession }
  | { success: false; error: string }

// 全局实例（延迟初始化，需要工作区路径）
let executor: CommandExecutor | null = null
let session: TerminalSession | null = null
const parser = new OutputParser()
const commandQueue = new CommandQueue()

function isCwdInWorkspace(cwd: string, workspacePath: string): boolean {
  const normalizedWorkspace = path.normalize(path.resolve(workspacePath))
  const normalizedCwd = path.normalize(path.resolve(cwd))
  return (
    normalizedCwd.toLowerCase().startsWith(normalizedWorkspace.toLowerCase() + path.sep) ||
    normalizedCwd.toLowerCase() === normalizedWorkspace.toLowerCase()
  )
}

/**
 * 初始化终端会话（需要工作区路径）
 */
function ensureTerminalContext(): TerminalInitResult {
  try {
    const workspacePath = configManager.getWorkspacePath()
    if (!workspacePath) {
      return {
        success: false,
        error: '未配置工作区路径，请在设置中配置工作区路径'
      }
    }

    if (session && executor) {
      if (isCwdInWorkspace(session.cwd, workspacePath)) {
        return { success: true, executor, session }
      }
    }

    executor = new CommandExecutor()
    session = new TerminalSession()
    return { success: true, executor, session }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '初始化终端会话失败'
    log.error('[Terminal Service] 初始化终端会话失败:', errorMessage)
    return { success: false, error: errorMessage }
  }
}

function getContextForError(): { cwd?: string; workspacePath?: string } {
  const workspacePath = configManager.getWorkspacePath() ?? undefined
  const cwd = session?.cwd
  return { cwd, workspacePath }
}

async function executeCommandInternal(
  command: string,
  hooks?: TerminalExecuteHooks,
  options?: ExecuteOptions
): Promise<TerminalExecutionResult> {
  try {
    if (!command || command.trim().length === 0) {
      const ctx = getContextForError()
      return { success: false, ...ctx, error: '命令不能为空' }
    }

    const initResult = ensureTerminalContext()
    if (!initResult.success) {
      const ctx = getContextForError()
      return {
        success: false,
        ...ctx,
        error: initResult.error || '终端初始化失败'
      }
    }
    const { executor, session } = initResult
    const workspacePath = configManager.getWorkspacePath() ?? undefined

    if (executor.isRunning()) {
      return {
        success: false,
        cwd: session.cwd,
        workspacePath,
        error: '另一个命令正在执行中，请稍后再试'
      }
    }

    session.addCommandToHistory({
      command,
      timestamp: Date.now()
    })
    session.isRunning = true

    let trimmedCommand = command.trim()
    const hasComplexOperators = /(\|\||[()])/.test(trimmedCommand)
    while (!hasComplexOperators && trimmedCommand.toLowerCase().startsWith('cd ')) {
      const chainMatch = trimmedCommand.match(/^cd\s+(.+?)\s*(?:(?:&&|;)\s*(.+))?$/i)
      if (!chainMatch) {
        break
      }

      const cdCommand = `cd ${chainMatch[1]}`
      const followupCommand = chainMatch[2]
      const cdResult = session.handleCdCommand(cdCommand)
      const success = cdResult.success

      const result: ExecutionResult = {
        exitCode: success ? 0 : 1,
        stdout: '',
        stderr: success ? '' : '目录不存在或无法访问',
        duration: 0,
        killed: false
      }
      const parsed = parser.parse(result.stdout, result.stderr, result.exitCode)

      if (success && hooks?.onCwdChanged) {
        try {
          hooks.onCwdChanged(session.cwd)
        } catch (error) {
          log.error('[Terminal Service] 发送 cwd 更新失败:', error)
        }
      }

      if (!success) {
        session.isRunning = false
        const attemptedPath = 'attemptedPath' in cdResult ? cdResult.attemptedPath : undefined
        return {
          success,
          result,
          parsed,
          cwd: session.cwd,
          workspacePath: configManager.getWorkspacePath() ?? undefined,
          attemptedPath: attemptedPath || undefined,
          error: '目录不存在或无法访问'
        }
      }

      if (!followupCommand || followupCommand.trim().length === 0) {
        session.isRunning = false
        return {
          success,
          result,
          parsed,
          cwd: session.cwd,
          workspacePath: configManager.getWorkspacePath() ?? undefined
        }
      }

      trimmedCommand = followupCommand.trim()
      if (!trimmedCommand.toLowerCase().startsWith('cd ')) {
        break
      }
    }

    session.isRunning = true
    const isGitClone = trimmedCommand.trim().toLowerCase().startsWith('git clone')
    const timeoutMs = options?.timeout ?? (isGitClone ? GIT_CLONE_TIMEOUT_MS : DEFAULT_COMMAND_TIMEOUT_MS)
    const result = await executor.execute(
      trimmedCommand,
      {
        cwd: session.cwd,
        timeout: timeoutMs,
        signal: options?.signal
      },
      outputData => {
        if (hooks?.onOutput) {
          try {
            hooks.onOutput(outputData)
          } catch (error) {
            log.error('[Terminal Service] 推送输出失败:', error)
          }
        }
      }
    )

    const parsed = parser.parse(result.stdout, result.stderr, result.exitCode)

    session.isRunning = false

    return {
      success: true,
      result,
      parsed,
      cwd: session.cwd,
      workspacePath: configManager.getWorkspacePath() ?? undefined
    }
  } catch (error) {
    if (session) {
      session.isRunning = false
    }
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    log.error('[Terminal Service] 执行命令失败:', errorMessage)
    const ctx = getContextForError()
    return { success: false, ...ctx, error: errorMessage }
  }
}

export async function executeTerminalCommand(
  command: string,
  hooks?: TerminalExecuteHooks,
  options?: ExecuteOptions
): Promise<TerminalExecutionResult> {
  return commandQueue.enqueue(() => executeCommandInternal(command.trim(), hooks, options))
}

export function killTerminalCommand(): { success: boolean; error?: string } {
  try {
    const initResult = ensureTerminalContext()
    if (!initResult.success) {
      return {
        success: false,
        error: initResult.error || '终端初始化失败'
      }
    }

    const { executor, session } = initResult
    executor.kill()
    session.isRunning = false
    return { success: true }
  } catch (error) {
    log.error('[Terminal Service] 中断命令失败:', error)
    return { success: false, error: error instanceof Error ? error.message : '中断命令失败' }
  }
}

export function changeTerminalCwd(newCwd: string): {
  success: boolean
  cwd?: string
  workspacePath?: string
  attemptedPath?: string
  error?: string
} {
  try {
    const initResult = ensureTerminalContext()
    if (!initResult.success) {
      return {
        success: false,
        error: initResult.error || '终端初始化失败'
      }
    }

    const { session } = initResult
    const workspacePath = configManager.getWorkspacePath() ?? undefined
    const updateResult = session.updateCwdResult(newCwd)
    if (updateResult.success) {
      return { success: true, cwd: session.cwd }
    }
    return {
      success: false,
      cwd: session.cwd,
      workspacePath,
      attemptedPath: updateResult.attemptedPath,
      error: '目录不存在或无法访问'
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    log.error('[Terminal Service] 改变工作目录失败:', errorMessage)
    const ctx = getContextForError()
    return { success: false, ...ctx, error: errorMessage }
  }
}

export function getTerminalSessionInfo(): {
  success: boolean
  sessionId?: string
  cwd?: string
  isRunning?: boolean
  history?: string[]
  error?: string
} {
  const initResult = ensureTerminalContext()
  if (!initResult.success) {
    return {
      success: false,
      error: initResult.error || '终端初始化失败'
    }
  }

  const { session } = initResult
  return {
    success: true,
    sessionId: session.sessionId,
    cwd: session.cwd,
    isRunning: session.isRunning,
    history: session.getCommandHistory()
  }
}

export function clearTerminalHistory(): { success: boolean; error?: string } {
  try {
    const initResult = ensureTerminalContext()
    if (!initResult.success) {
      return {
        success: false,
        error: initResult.error || '终端初始化失败'
      }
    }

    const { session } = initResult
    session.clearHistory()
    return { success: true }
  } catch (error) {
    log.error('[Terminal Service] 清空历史失败:', error)
    return { success: false, error: error instanceof Error ? error.message : '清空历史失败' }
  }
}

export function toExecuteCommandResponse(result: TerminalExecutionResult): ExecuteCommandResponse {
  return {
    success: result.success,
    result: result.result,
    cwd: result.cwd,
    workspacePath: result.workspacePath,
    attemptedPath: result.attemptedPath,
    error: result.error
  }
}
