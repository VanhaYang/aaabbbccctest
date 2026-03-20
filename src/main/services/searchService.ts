import * as path from 'path'
import log from '../logger'
import { DEFAULT_COMMAND_TIMEOUT_MS } from '../../shared/terminalConfig'
import type { SearchRequest, SearchResult, SearchMatch } from './searchTypes'
import {
  validateSearchPaths,
  normalizeMaxResults,
  buildRipgrepArgs,
  normalizeSearchPath,
  createMaxResultsWarning
} from './searchParams'
import { processPattern } from './patternProcessor'
import {
  getRipgrepBinary,
  executeRipgrep,
  buildExecutedCommand,
  validateRipgrepResult
} from './ripgrepExecutor'
import { parseRipgrepJson, normalizeRelativePath } from './resultParser'

export type {
  SearchRequest,
  SearchSubmatch,
  SearchContextLine,
  SearchMatch,
  SearchResult
} from './searchTypes'

// ---------------------------------------------------------------------------
// 后处理常量（执行 ripgrep 拿到结果后用）
// ---------------------------------------------------------------------------

const LONG_LINE_LENGTH_THRESHOLD = 500 // 单行超过此长度视为疑似混淆/压缩，后处理筛掉
const MAX_SUBMATCHES_PER_MATCH = 10 // 每条匹配最多保留的子匹配数，省 token

// ---------------------------------------------------------------------------
// 后处理：过滤 + 精简（拿到 ripgrep 结果后统一在此处理）
// ---------------------------------------------------------------------------

function truncateLineText(text: string, maxLen: number): string {
  if (maxLen <= 0 || text.length <= maxLen) return text
  return text.slice(0, maxLen) + '…'
}

/**
 * 后处理：1) 筛掉单行过长匹配 2) 限制 submatches 数量 3) 截断行文本、精简 submatches
 */
function postProcessMatches(matches: SearchMatch[], request: SearchRequest): SearchMatch[] {
  const lineTextMaxLength = Number.isFinite(request.lineTextMaxLength)
    ? Math.max(0, Math.floor(Number(request.lineTextMaxLength)))
    : 0
  const compactSubmatches = request.compactSubmatches === true

  const filtered = matches.filter(m => m.lineText.length <= LONG_LINE_LENGTH_THRESHOLD)

  return filtered.map(m => {
    const submatches =
      m.submatches.length > MAX_SUBMATCHES_PER_MATCH
        ? m.submatches.slice(0, MAX_SUBMATCHES_PER_MATCH)
        : m.submatches
    const finalSubmatches =
      compactSubmatches && submatches.length > 0
        ? submatches.map(s => ({ matchText: s.matchText }))
        : submatches

    const lineText = truncateLineText(m.lineText, lineTextMaxLength)
    const result: SearchMatch = { ...m, lineText, submatches: finalSubmatches }

    if (m.before && lineTextMaxLength > 0) {
      result.before = m.before.map(b => ({
        ...b,
        lineText: truncateLineText(b.lineText, lineTextMaxLength)
      }))
    }
    if (m.after && lineTextMaxLength > 0) {
      result.after = m.after.map(a => ({
        ...a,
        lineText: truncateLineText(a.lineText, lineTextMaxLength)
      }))
    }
    return result
  })
}

// ---------------------------------------------------------------------------
// 主流程：searchWorkspace
// ---------------------------------------------------------------------------

/**
 * 搜索工作区文件：预处理 → 执行 ripgrep → 解析 → 后处理 → 组装响应
 */
export async function searchWorkspace(request: SearchRequest): Promise<SearchResult> {
  const {
    pattern,
    searchPath,
    workspacePath,
    caseSensitive,
    contextLines = 0,
    maxResults = 30,
    timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS
  } = request

  // ---------- 预处理：校验 + 参数规范化 + 构建命令 ----------
  validateSearchPaths(workspacePath, searchPath)
  const { normalizedMaxResults, maxResultsCorrected } = normalizeMaxResults(maxResults)

  const args = buildRipgrepArgs(request, normalizedMaxResults)
  const finalPattern = processPattern(pattern, caseSensitive)
  const searchPathArg = normalizeSearchPath(workspacePath, searchPath)
  const pathToSearch = path.isAbsolute(searchPath)
    ? searchPath
    : path.join(workspacePath, searchPath)
  args.push('--', finalPattern, pathToSearch)

  // ---------- 执行 ripgrep ----------
  const preferredBinary = await getRipgrepBinary()
  const { result, actualBinary } = await executeRipgrep(
    preferredBinary,
    args,
    workspacePath,
    timeoutMs
  )
  validateRipgrepResult(result, args, workspacePath, searchPath, searchPathArg, finalPattern)

  // ---------- 解析 ripgrep 输出 ----------
  const parsed = parseRipgrepJson(result.stdout, workspacePath, contextLines > 0)
  if (parsed.matchCount === 0) {
    log.warn('[searchWorkspace] 无匹配，调试信息:', {
      workspacePath,
      pathToSearch,
      finalPattern,
      exitCode: result.exitCode,
      stdoutLines: result.stdout ? result.stdout.trim().split(/\r?\n/).length : 0,
      stderr: result.stderr || '(无)'
    })
  }

  // ---------- 后处理：截断条数 + 过滤长行 + 限制 submatches + 截断行文本与精简格式 ----------
  const truncated = parsed.matchCount > normalizedMaxResults
  let matches = truncated ? parsed.matches.slice(0, normalizedMaxResults) : parsed.matches
  matches = postProcessMatches(matches, request)

  // ---------- 组装响应 ----------
  const executedCommand = buildExecutedCommand(actualBinary, args, workspacePath)
  // 仅在有匹配或发生截断时提示 maxResults 被纠正，避免无结果时造成误解
  const warning =
    matches.length > 0 || truncated
      ? createMaxResultsWarning(maxResultsCorrected, normalizedMaxResults)
      : undefined
  const searchResult: SearchResult = {
    matches,
    truncated,
    stats: {
      matchCount: matches.length,
      fileCount: new Set(matches.map(m => m.filePath)).size
    },
    searchRoot: normalizeRelativePath(workspacePath, searchPath),
    ...(warning && { warning })
  }
  // 无匹配时始终返回实际执行的命令，便于排查“明明有却搜不到”的问题
  if (request.includeExecutedCommand !== false || matches.length === 0) {
    searchResult.executedCommand = executedCommand
  }
  return searchResult
}
