// ⚠️ execa v8 也是 ES Module，需要使用动态 import
// 使用 v8 而不是 v9，因为 v9 需要 Node.js 18.19.0+，Electron 27.1.3 可能不支持
// v8 没有 addAbortListener 的问题，兼容性更好
import type { ExecuteOptions, ExecutionResult, OutputData } from '../types/terminal'
import log from '../logger'
import { DEFAULT_COMMAND_TIMEOUT_MS, KILL_GRACE_PERIOD_MS } from '../../shared/terminalConfig'
import { decodeOutput, decodeResultOutput } from './terminalOutputDecoder'

// 动态导入的类型
type ExecaCommand = (command: string, options?: any) => Promise<any>
type ExecaChildProcess = any
type ExecaError = any

/**
 * Shell 命令执行引擎
 *
 * ⚠️ 重要点：
 * - 使用 execa 执行命令，支持跨平台（Windows/macOS/Linux）
 * - 实时推送 stdout 和 stderr，分离处理
 * - 支持超时和中断信号
 * - 记录执行耗时
 *
 * 💡 优化点：
 * - 可以考虑添加命令白名单/黑名单机制
 * - 可以添加命令执行前的验证逻辑
 *
 * 🔌 扩展点：
 * - 支持命令别名
 * - 支持管道操作
 * - 支持后台执行
 */
export class CommandExecutor {
  private process: ExecaChildProcess | null = null
  private startTime: number = 0
  private abortController: AbortController | null = null
  private execaCommandCache: ExecaCommand | null = null
  private readonly isWindows = process.platform === 'win32'

  /**
   * 动态加载 execaCommand
   * 使用缓存避免重复导入
   */
  private async getExecaCommand(): Promise<ExecaCommand> {
    if (this.execaCommandCache) {
      return this.execaCommandCache
    }

    // 动态导入 ES Module
    const execaModule = await import('execa')
    this.execaCommandCache = execaModule.execaCommand
    return this.execaCommandCache
  }

  /**
   * 执行 Shell 命令
   *
   * @param command 要执行的命令字符串
   * @param options 执行选项（工作目录、超时时间、中断信号）
   * @param onOutput 实时输出回调函数
   * @returns 执行结果（退出码、输出、耗时等）
   */
  async execute(
    command: string,
    options: ExecuteOptions = {},
    onOutput?: (data: OutputData) => void
  ): Promise<ExecutionResult> {
    const { cwd = process.cwd(), timeout = DEFAULT_COMMAND_TIMEOUT_MS, signal } = options
    this.startTime = Date.now()

    // 创建 AbortController 用于中断执行
    this.abortController = new AbortController()
    const abortSignal = signal || this.abortController.signal

    try {
      // 动态获取 execaCommand
      const execaCommand = await this.getExecaCommand()

      const env = this.buildExecutionEnv()
      const finalCommand = this.preprocessCommand(command)

      this.process = execaCommand(finalCommand, {
        cwd,
        timeout,
        signal: abortSignal,
        // 分离 stdout 和 stderr
        all: false,
        // Windows 下先使用 Buffer，后续再做编码识别
        encoding: this.isWindows ? 'buffer' : 'utf8',
        // 使用准备好的环境变量
        env,
        // Windows 上使用 cmd.exe，Unix 上使用 sh
        shell: process.platform === 'win32' ? true : false
        // 注意：execa 默认使用 pipe 模式，不需要显式设置 stdio
      })

      // 监听 stdout 实时输出
      // ⚠️ execa v9 中，stdout 和 stderr 是流对象
      if (this.process.stdout) {
        this.process.stdout.on('data', (chunk: string | Buffer) => {
          const content = decodeOutput(chunk, this.isWindows)
          onOutput?.({ type: 'stdout', content })
        })
      }

      // 监听 stderr 实时输出
      if (this.process.stderr) {
        this.process.stderr.on('data', (chunk: string | Buffer) => {
          const content = decodeOutput(chunk, this.isWindows)
          onOutput?.({ type: 'stderr', content })
        })
      }

      // 等待命令执行完成
      const result = await this.process
      const duration = Date.now() - this.startTime

      // execa v8 中 stdout 和 stderr 可能是字符串或 Buffer（encoding: 'buffer' 时）
      const stdout = decodeResultOutput(result.stdout, this.isWindows)
      const stderr = decodeResultOutput(result.stderr, this.isWindows)

      return {
        exitCode: result.exitCode ?? 0,
        stdout,
        stderr,
        duration,
        killed: result.killed || false
      }
    } catch (error: unknown) {
      const duration = Date.now() - this.startTime
      const execaError = error as ExecaError

      // 处理超时错误
      if (execaError.timedOut) {
        return {
          exitCode: -1,
          stdout: '',
          stderr: `命令执行超时（${timeout}ms）`,
          duration,
          killed: true
        }
      }

      // 处理被中断的错误
      if (execaError.isCanceled || execaError.signal) {
        return {
          exitCode: -1,
          stdout: decodeResultOutput(execaError.stdout, this.isWindows) || '',
          stderr: decodeResultOutput(execaError.stderr, this.isWindows) || '命令被中断',
          duration,
          killed: true
        }
      }

      // 其他错误（execa 在 encoding: 'buffer' 时 stdout/stderr 可能是 Buffer，必须解码后返回，避免 API 返回乱码或序列化 Buffer）
      return {
        exitCode: execaError.exitCode ?? -1,
        stdout: decodeResultOutput(execaError.stdout, this.isWindows) || '',
        stderr: decodeResultOutput(execaError.stderr, this.isWindows) || execaError.message || '未知错误',
        duration,
        killed: execaError.killed || false
      }
    } finally {
      // 清理资源
      this.process = null
      this.abortController = null
    }
  }

  /**
   * 准备执行环境变量
   */
  private buildExecutionEnv(): Record<string, string> {
    return {
      ...process.env,
      // 强制 Git 显示进度信息（即使不在 TTY 中）
      GIT_PROGRESS_FORCE: '1',
      // 强制 Git 显示进度信息（通过 stderr）
      GIT_PROGRESS: '1',
      // 禁用 Git 的进度缓冲
      GIT_TERMINAL_PROMPT: '0',
      // Windows 下确保 Python 输出不被缓冲
      ...(this.isWindows && {
        PYTHONUNBUFFERED: '1'
      })
    }
  }

  /**
   * 对命令进行预处理（如 Git 进度和 Windows 编码）
   */
  private preprocessCommand(command: string): string {
    const commandWithGitProgress = this.ensureGitCloneProgress(command)
    return this.ensureWindowsUtf8(commandWithGitProgress)
  }

  private ensureGitCloneProgress(command: string): string {
    const trimmedCommand = command.trim()
    if (
      trimmedCommand.startsWith('git clone') &&
      !trimmedCommand.includes('--progress') &&
      !trimmedCommand.includes('--quiet') &&
      !trimmedCommand.includes('-q')
    ) {
      return trimmedCommand.replace(/^git clone\s+/, 'git clone --progress ')
    }
    return command
  }

  private ensureWindowsUtf8(command: string): string {
    if (!this.isWindows) {
      return command
    }
    return `chcp 65001>nul & ${command}`
  }

  /**
   * 杀死当前正在执行的命令进程
   */
  kill(): void {
    try {
      if (this.process && !this.process.killed) {
        this.process.kill('SIGTERM')

        // 如果进程在 3 秒内没有退出，强制杀死
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            this.process.kill('SIGKILL')
          }
        }, KILL_GRACE_PERIOD_MS)
      }

      // 触发中断信号
      if (this.abortController) {
        this.abortController.abort()
      }
    } catch (error) {
      log.error('[CommandExecutor] 杀死进程失败:', error)
    }
  }

  /**
   * 检查是否有命令正在执行
   */
  isRunning(): boolean {
    return this.process !== null && !this.process.killed
  }
}
