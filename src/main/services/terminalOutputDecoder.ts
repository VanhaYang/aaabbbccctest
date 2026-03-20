/**
 * 终端输出解码：将 Buffer/string 统一解码为 UTF-8 字符串。
 * 在 Windows 上优先使用 GBK（cmd 等系统输出），避免乱码。
 * 抽离为独立模块便于单测覆盖所有输入情况。
 */
import iconv from 'iconv-lite'
import { WINDOWS_FALLBACK_ENCODING } from '../../shared/terminalConfig'

export function isLikelyGarbled(text: string): boolean {
  if (!text || text.length === 0) {
    return false
  }
  if (text.includes('\uFFFD')) {
    return true
  }
  const controlCharPattern = /[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g
  const controlChars = text.match(controlCharPattern)
  if (controlChars && controlChars.length > text.length * 0.1) {
    return true
  }
  const suspiciousPattern = /[^\x20-\x7E\u4E00-\u9FFF\n\r\t]{3,}/g
  if (suspiciousPattern.test(text)) {
    return true
  }
  return false
}

export function looksLikeValidText(text: string): boolean {
  if (!text || text.length === 0) {
    return true
  }
  if (/[\u4E00-\u9FFF]/.test(text)) {
    return true
  }
  const printablePattern = /[\x20-\x7E\n\r\t]/g
  const printableCount = (text.match(printablePattern) || []).length
  if (printableCount > text.length * 0.8) {
    return true
  }
  return false
}

/**
 * 将单块输出（实时流或最终结果）解码为字符串。
 * @param chunk 字符串则原样返回；Buffer 在 Windows 上优先按 GBK 解码。
 * @param isWindows 是否 Windows 平台（仅 Windows 做 GBK/UTF-8 双尝试）
 */
export function decodeOutput(
  chunk: string | Buffer,
  isWindows: boolean
): string {
  if (typeof chunk === 'string') {
    return chunk
  }
  if (!isWindows) {
    return chunk.toString('utf-8')
  }

  const utf8Text = chunk.toString('utf-8')
  // 若 UTF-8 解码已明显有效（无乱码且含中文或可打印），优先采用，避免误用 GBK
  if (!isLikelyGarbled(utf8Text) && /[\u4E00-\u9FFF]/.test(utf8Text)) {
    return utf8Text
  }
  if (!isLikelyGarbled(utf8Text) && looksLikeValidText(utf8Text)) {
    return utf8Text
  }

  try {
    const gbkText = iconv.decode(chunk, WINDOWS_FALLBACK_ENCODING)
    if (!isLikelyGarbled(gbkText) && /[\u4E00-\u9FFF]/.test(gbkText)) {
      return gbkText
    }
    if (!isLikelyGarbled(gbkText) && looksLikeValidText(gbkText)) {
      return gbkText
    }
    if (isLikelyGarbled(utf8Text) && !isLikelyGarbled(gbkText)) {
      return gbkText
    }
  } catch (error) {
    // GBK 解码失败，用 UTF-8
  }

  if (!isLikelyGarbled(utf8Text) && looksLikeValidText(utf8Text)) {
    return utf8Text
  }
  try {
    const gbkText = iconv.decode(chunk, WINDOWS_FALLBACK_ENCODING)
    if (/[\u4E00-\u9FFF]/.test(gbkText)) {
      return gbkText
    }
  } catch (error) {
    // 忽略
  }
  return utf8Text
}

/**
 * 解码 execa 返回的 stdout/stderr（可能是 string | Buffer）。
 * 保证返回字符串，便于 API 序列化、避免乱码。
 */
export function decodeResultOutput(result: unknown, isWindows: boolean): string {
  if (!result) return ''
  if (typeof result === 'string') return result
  if (Buffer.isBuffer(result)) return decodeOutput(result, isWindows)
  return String(result)
}
