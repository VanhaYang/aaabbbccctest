import * as fs from 'fs'
import log from '../logger'

/**
 * 获取 ripgrep 二进制路径
 */
export async function getRipgrepBinary(): Promise<string> {
  try {
    const { rgPath } = await import('@vscode/ripgrep')
    if (rgPath) {
      return rgPath
    }
  } catch (error) {
    // 忽略，回退系统 rg
  }
  return 'rg'
}

/**
 * 执行 ripgrep 命令
 */
export async function runRipgrep(
  rgBinary: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const { execa } = await import('execa')
  const result = await execa(rgBinary, args, {
    cwd,
    timeout: timeoutMs,
    encoding: 'utf8',
    reject: false
  })
  return {
    exitCode: result.exitCode ?? 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  }
}

/**
 * 打包后 rg 在 app.asar.unpacked 内可执行；@vscode/ripgrep 的 rgPath 指向 app.asar 内，
 * 且 Electron 的 fs 对 asar 内路径 existsSync 可能为 true（虚拟文件系统），但系统无法执行 asar 内的 exe，
 * 故只要路径包含 app.asar（且非 unpacked），优先用 app.asar.unpacked 路径。
 */
function resolveRipgrepBinary(preferredBinary: string): string {
  if (preferredBinary === 'rg') return preferredBinary
  if (
    preferredBinary.includes('app.asar') &&
    !preferredBinary.includes('app.asar.unpacked')
  ) {
    const unpackedPath = preferredBinary.replace(/app\.asar([/\\])/g, 'app.asar.unpacked$1')
    if (fs.existsSync(unpackedPath)) return unpackedPath
  }
  if (fs.existsSync(preferredBinary)) return preferredBinary
  return 'rg'
}

/**
 * 执行 ripgrep，如果首选二进制不存在则尝试 unpacked 路径或回退到系统 rg
 */
export async function executeRipgrep(
  preferredBinary: string,
  args: string[],
  workspacePath: string,
  timeoutMs: number
): Promise<{ result: { exitCode: number; stdout: string; stderr: string }; actualBinary: string }> {
  const binaryToUse = resolveRipgrepBinary(preferredBinary)
  let result: { exitCode: number; stdout: string; stderr: string }

  try {
    result = await runRipgrep(binaryToUse, args, workspacePath, timeoutMs)
  } catch (error: any) {
    if (binaryToUse !== 'rg' && error?.code === 'ENOENT') {
      result = await runRipgrep('rg', args, workspacePath, timeoutMs)
      return { result, actualBinary: 'rg' }
    }
    throw error
  }

  return { result, actualBinary: binaryToUse }
}

/**
 * 构建实际执行的命令字符串（用于返回给 AI 了解执行语句）
 */
export function buildExecutedCommand(
  binary: string,
  args: string[],
  workspacePath: string
): string {
  const commandParts = [binary, ...args]
  return `cd "${workspacePath}" && ${commandParts
    .map((arg, index) => {
      // 对于模式参数（在 -- 之后），需要加引号保护
      const prevArg = index > 0 ? args[index - 1] : null
      if (prevArg === '--') {
        return `"${arg.replace(/"/g, '\\"')}"`
      }
      // 对包含空格、管道符或其他特殊字符的参数进行转义
      if (
        arg.includes(' ') ||
        arg.includes('|') ||
        arg.includes('&') ||
        arg.includes('*') ||
        arg.includes('?')
      ) {
        return `"${arg.replace(/"/g, '\\"')}"`
      }
      return arg
    })
    .join(' ')}`
}

/**
 * 验证 ripgrep 执行结果，如果失败则抛出错误
 */
export function validateRipgrepResult(
  result: { exitCode: number; stdout: string; stderr: string },
  args: string[],
  workspacePath: string,
  searchPath: string,
  searchPathArg: string,
  pattern: string
): void {
  if (result.exitCode > 1) {
    // ripgrep 退出码 1 表示没有找到匹配（这是正常的），>1 才是错误
    const message = result.stderr || result.stdout || 'ripgrep 执行失败'
    // 添加调试信息：记录实际执行的命令和路径
    log.error('[searchWorkspace] ripgrep 执行失败:', {
      exitCode: result.exitCode,
      stderr: result.stderr,
      stdout: result.stdout,
      args,
      workspacePath,
      searchPath,
      searchPathArg,
      pattern
    })
    throw new Error(message)
  }
}
