import type { ParsedOutput } from '../types/terminal'
import { ErrorType } from '../types/terminal'

/**
 * 输出解析和错误识别
 *
 * ⚠️ 重要点：
 * - 去除 ANSI 转义码，清理输出内容
 * - 识别常见错误类型（NotFound、PermissionDenied 等）
 * - 区分 stdout 和 stderr
 *
 * 💡 优化点：
 * - 可以使用更强大的 ANSI 解析库（如 strip-ansi）
 * - 可以添加更多错误类型的识别规则
 *
 * 🔌 扩展点：
 * - 支持输出格式化（高亮、颜色等）
 * - 支持输出过滤和搜索
 * - 支持输出统计和分析
 */
export class OutputParser {
  /**
   * 去除 ANSI 转义码
   * ANSI 转义码格式：\x1b[...m 或 \u001b[...m
   *
   * @param text 包含 ANSI 转义码的文本
   * @returns 清理后的文本
   */
  private stripAnsi(text: string): string {
    if (typeof text !== 'string') {
      text = text === null || text === undefined ? '' : String(text)
    }
    // 匹配 ANSI 转义序列的正则表达式
    // 包括：\x1b[...m, \u001b[...m, \033[...m 等格式
    return text
      .replace(/\u001b\[[0-9;]*m/g, '')
      .replace(/\x1b\[[0-9;]*m/g, '')
      .replace(/\033\[[0-9;]*m/g, '')
  }

  /**
   * 识别错误类型
   * 根据输出内容匹配常见的错误模式
   *
   * @param cleanedOutput 清理后的输出内容
   * @param exitCode 命令退出码
   * @returns 错误类型（如果识别到）
   */
  private identifyErrorType(cleanedOutput: string, exitCode: number): ErrorType | undefined {
    if (exitCode === 0) {
      return undefined
    }

    const lowerOutput = cleanedOutput.toLowerCase()

    // NotFound - 命令未找到
    if (
      /command not found/i.test(cleanedOutput) ||
      /不是内部或外部命令/i.test(cleanedOutput) ||
      /未找到命令/i.test(cleanedOutput) ||
      /not found/i.test(cleanedOutput)
    ) {
      return ErrorType.NotFound
    }

    // PermissionDenied - 权限被拒绝
    if (
      /permission denied/i.test(cleanedOutput) ||
      /access denied/i.test(cleanedOutput) ||
      /权限被拒绝/i.test(cleanedOutput) ||
      /拒绝访问/i.test(cleanedOutput) ||
      /eacces/i.test(lowerOutput)
    ) {
      return ErrorType.PermissionDenied
    }

    // SyntaxError - 语法错误
    if (
      /syntax error/i.test(cleanedOutput) ||
      /语法错误/i.test(cleanedOutput) ||
      /unexpected token/i.test(cleanedOutput) ||
      /parse error/i.test(cleanedOutput)
    ) {
      return ErrorType.SyntaxError
    }

    // FileNotFound - 文件或目录不存在
    if (
      /no such file or directory/i.test(cleanedOutput) ||
      /cannot find/i.test(cleanedOutput) ||
      /文件不存在/i.test(cleanedOutput) ||
      /目录不存在/i.test(cleanedOutput) ||
      /找不到文件/i.test(cleanedOutput) ||
      /系统找不到指定的文件/i.test(cleanedOutput) ||
      /enoent/i.test(lowerOutput)
    ) {
      return ErrorType.FileNotFound
    }

    // Timeout - 超时
    if (
      /timeout/i.test(cleanedOutput) ||
      /超时/i.test(cleanedOutput) ||
      /timed out/i.test(cleanedOutput)
    ) {
      return ErrorType.Timeout
    }

    // 如果退出码不为 0 但没有匹配到具体错误类型，返回 Unknown
    if (exitCode !== 0) {
      return ErrorType.Unknown
    }

    return undefined
  }

  /**
   * 解析命令输出
   *
   * @param stdout 标准输出内容
   * @param stderr 标准错误输出内容
   * @param exitCode 命令退出码
   * @returns 解析后的输出结果
   */
  parse(stdout: string, stderr: string, exitCode: number): ParsedOutput {
    // 合并原始输出
    const raw = stdout + (stderr ? `\n${stderr}` : '')

    // 清理 ANSI 转义码
    const cleanedStdout = this.stripAnsi(stdout)
    const cleanedStderr = this.stripAnsi(stderr)
    const cleaned = cleanedStdout + (cleanedStderr ? `\n${cleanedStderr}` : '')

    // 判断是否存在错误
    // 退出码不为 0 或 stderr 有内容都视为错误
    const isError = exitCode !== 0 || stderr.length > 0

    // 识别错误类型
    const errorType = this.identifyErrorType(cleaned, exitCode)

    return {
      raw,
      cleaned,
      isError,
      errorType
    }
  }

  /**
   * 格式化输出（用于显示）
   * 可以根据错误类型添加颜色标记等
   *
   * @param parsed 解析后的输出
   * @returns 格式化后的输出字符串
   */
  format(parsed: ParsedOutput): string {
    if (parsed.isError && parsed.errorType) {
      return `[错误: ${parsed.errorType}]\n${parsed.cleaned}`
    }
    return parsed.cleaned
  }
}
