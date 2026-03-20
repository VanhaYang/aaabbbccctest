import * as path from 'path'
import { SearchMatch, SearchContextLine, RipgrepEvent } from './searchTypes'

// ---------------------------------------------------------------------------
// 路径与行文本工具
// ---------------------------------------------------------------------------

/** 将 filePath 转为相对 workspacePath 的路径（统一 / 分隔） */
export function normalizeRelativePath(workspacePath: string, filePath: string): string {
  const relativePath = path.relative(workspacePath, filePath).replace(/\\/g, '/')
  return relativePath || '.'
}

function normalizeLineText(text: string): string {
  return text.replace(/\r?\n$/, '')
}

// ---------------------------------------------------------------------------
// ripgrep JSON 解析入口
// ---------------------------------------------------------------------------

/** 解析 ripgrep --json 输出，返回 matches / matchCount / fileCount */
export function parseRipgrepJson(
  stdout: string,
  workspacePath: string,
  includeContext: boolean
): { matches: SearchMatch[]; matchCount: number; fileCount: number } {
  const matches: SearchMatch[] = []
  const files = new Set<string>()
  const pendingBefore: SearchContextLine[] = []
  let lastMatch: SearchMatch | null = null
  let lastMatchFile: string | null = null

  const lines = stdout.split(/\r?\n/)
  for (const line of lines) {
    if (!line.trim()) continue

    let event: RipgrepEvent | null = null
    try {
      event = JSON.parse(line) as RipgrepEvent
    } catch (error) {
      continue
    }

    if (event.type === 'begin') {
      pendingBefore.length = 0
      lastMatch = null
      lastMatchFile = event.data?.path?.text ?? null
      continue
    }

    if (event.type === 'end') {
      pendingBefore.length = 0
      lastMatch = null
      lastMatchFile = null
      continue
    }

    if (event.type === 'context' && includeContext) {
      handleContextEvent(
        event as Extract<RipgrepEvent, { type: 'context' }>,
        lastMatch,
        lastMatchFile,
        pendingBefore
      )
      continue
    }

    if (event.type === 'match') {
      const matchEvent = event as Extract<RipgrepEvent, { type: 'match' }>
      const match = handleMatchEvent(matchEvent, workspacePath, includeContext, pendingBefore)
      matches.push(match)
      files.add(match.filePath)
      lastMatch = match
      lastMatchFile = matchEvent.data.path.text
    }
  }

  return {
    matches,
    matchCount: matches.length,
    fileCount: files.size
  }
}

// ---------------------------------------------------------------------------
// 事件处理：context / match
// ---------------------------------------------------------------------------

function handleContextEvent(
  event: Extract<RipgrepEvent, { type: 'context' }>,
  lastMatch: SearchMatch | null,
  lastMatchFile: string | null,
  pendingBefore: SearchContextLine[]
): void {
  const filePath = event.data.path.text
  const lineText = normalizeLineText(event.data.lines.text)
  const contextLine: SearchContextLine = {
    lineNumber: event.data.line_number,
    lineText
  }

  if (lastMatch && lastMatchFile === filePath) {
    if (!lastMatch.after) {
      lastMatch.after = []
    }
    lastMatch.after.push(contextLine)
  } else {
    pendingBefore.push(contextLine)
  }
}

/** ripgrep path.text 相对 cwd，需先按 workspacePath 拼成绝对路径再 relative，避免 process.cwd() 导致错误 ../ */
function resolvePathRelativeToWorkspace(workspacePath: string, filePath: string): string {
  const absolutePath = path.isAbsolute(filePath)
    ? path.normalize(filePath)
    : path.join(workspacePath, filePath)
  return normalizeRelativePath(workspacePath, absolutePath)
}

function handleMatchEvent(
  event: Extract<RipgrepEvent, { type: 'match' }>,
  workspacePath: string,
  includeContext: boolean,
  pendingBefore: SearchContextLine[]
): SearchMatch {
  const filePath = event.data.path.text
  const lineText = normalizeLineText(event.data.lines.text)
  const relativePath = resolvePathRelativeToWorkspace(workspacePath, filePath)
  const submatches =
    event.data.submatches?.map(submatch => ({
      matchText: submatch.match.text,
      start: submatch.start,
      end: submatch.end
    })) ?? []

  const match: SearchMatch = {
    filePath: relativePath,
    lineNumber: event.data.line_number,
    lineText,
    submatches
  }

  if (includeContext && pendingBefore.length > 0) {
    match.before = pendingBefore.splice(0, pendingBefore.length)
  } else {
    pendingBefore.length = 0
  }

  return match
}
