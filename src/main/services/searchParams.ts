import * as path from 'path'
import * as fs from 'fs'
import { SearchRequest, MAX_MAX_RESULTS, DEFAULT_MAX_RESULTS } from './searchTypes'

// ---------------------------------------------------------------------------
// 路径校验
// ---------------------------------------------------------------------------

/** 验证搜索路径和工作区路径 */
export function validateSearchPaths(workspacePath: string, searchPath: string): void {
  if (!workspacePath || !fs.existsSync(workspacePath)) {
    throw new Error(`工作区路径不存在或无效: ${workspacePath}`)
  }
  if (!fs.existsSync(searchPath)) {
    throw new Error(`搜索路径不存在: ${searchPath}`)
  }
}

// ---------------------------------------------------------------------------
// maxResults 规范化
// ---------------------------------------------------------------------------

/** 规范化并纠正 maxResults，返回 { normalizedMaxResults, maxResultsCorrected } */
export function normalizeMaxResults(maxResults?: number): {
  normalizedMaxResults: number
  maxResultsCorrected: boolean
} {
  const requestedMax = Math.floor(maxResults ?? DEFAULT_MAX_RESULTS)
  const normalizedMaxResults = Math.min(
    Math.max(1, Number.isFinite(requestedMax) ? requestedMax : DEFAULT_MAX_RESULTS),
    MAX_MAX_RESULTS
  )
  const maxResultsCorrected = requestedMax > MAX_MAX_RESULTS

  return { normalizedMaxResults, maxResultsCorrected }
}

// ---------------------------------------------------------------------------
// glob 大括号展开（ripgrep -g 在部分环境下不展开 {a,b}，服务端展开保证一致）
// ---------------------------------------------------------------------------

/** 将单个 glob 中的 {a,b,c} 展开为多个 glob 字符串，无大括号则返回 [glob] */
export function expandGlobBraces(globPattern: string): string[] {
  const braceMatch = globPattern.match(/\{([^{}]+)\}/)
  if (!braceMatch) return [globPattern]
  const choices = braceMatch[1].split(',').map(s => s.trim()).filter(Boolean)
  if (choices.length <= 1) return [globPattern]
  const prefix = globPattern.slice(0, braceMatch.index)
  const suffix = globPattern.slice(braceMatch.index! + braceMatch[0].length)
  return choices.map(c => `${prefix}${c}${suffix}`)
}

/** 将可能含大括号的多个 glob 合并为展开后的扁平列表 */
function expandGlobList(globs: (string | undefined | null)[]): string[] {
  const result: string[] = []
  for (const g of globs) {
    if (g == null || String(g).trim() === '') continue
    result.push(...expandGlobBraces(String(g).trim()))
  }
  return result
}

// ---------------------------------------------------------------------------
// ripgrep 参数构建
// ---------------------------------------------------------------------------

/** 根据请求构建 ripgrep 命令行参数（不含 pattern 与 path） */
export function buildRipgrepArgs(request: SearchRequest, normalizedMaxResults: number): string[] {
  const { caseSensitive, multiline, contextLines, glob, type, noIgnore } = request
  const args: string[] = ['--json']

  // 默认不遵守 .gitignore，使 API 与常见编辑器“不启用忽略文件”时的搜索结果一致
  if (noIgnore !== false) {
    args.push('--no-ignore')
  }
  // 将可能被误判为二进制的文件也按文本搜索（默认 UTF-8），减少漏搜
  args.push('-a')
  if (caseSensitive === false) {
    args.push('-i')
  }
  if (multiline) {
    args.push('-U')
  }
  if (contextLines && contextLines > 0) {
    args.push('-C', String(Math.min(Math.max(0, Math.floor(contextLines)), 10)))
  }
  if (normalizedMaxResults > 0) {
    args.push('--max-count', String(normalizedMaxResults))
  }
  if (glob) {
    const rawGlobs = Array.isArray(glob) ? glob : [glob]
    const expanded = expandGlobList(rawGlobs)
    expanded.forEach(item => args.push('-g', item))
  }
  if (type) {
    const types = Array.isArray(type) ? type : [type]
    types.filter(Boolean).forEach(item => args.push('-t', item))
  }

  return args
}

// ---------------------------------------------------------------------------
// 搜索路径规范化
// ---------------------------------------------------------------------------

/** 将绝对路径转为相对 workspace 的路径（若在工作区内），否则返回原绝对路径 */
export function normalizeSearchPath(workspacePath: string, searchPath: string): string {
  if (!path.isAbsolute(searchPath)) {
    return searchPath
  }

  // 如果是绝对路径，检查是否在工作区内
  const relativePath = path.relative(workspacePath, searchPath)
  if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
    // 在工作区内，使用相对路径（更安全）
    return relativePath || '.'
  }

  // 否则使用绝对路径（ripgrep 支持）
  return searchPath
}

// ---------------------------------------------------------------------------
// 警告信息
// ---------------------------------------------------------------------------

/** maxResults 被纠正时生成警告文案 */
export function createMaxResultsWarning(
  maxResultsCorrected: boolean,
  normalizedMaxResults: number
): string | undefined {
  return maxResultsCorrected
    ? `maxResults 超过最大限制 ${MAX_MAX_RESULTS}，已自动纠正为 ${normalizedMaxResults} 条`
    : undefined
}
