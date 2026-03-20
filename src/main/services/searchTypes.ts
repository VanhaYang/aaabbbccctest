export type SearchRequest = {
  pattern: string
  searchPath: string
  workspacePath: string
  caseSensitive?: boolean
  contextLines?: number
  glob?: string | string[]
  type?: string | string[]
  maxResults?: number
  multiline?: boolean
  timeoutMs?: number
  /** 为 true 时传 --no-ignore，不遵守 .gitignore/.ignore（与常见编辑器不启用“使用忽略文件”时行为一致）；API 默认 true */
  noIgnore?: boolean
  /** 单行文本最大字符数，超过则截断并加 "…"；0 表示不限制。建议 300～500 以节省 token */
  lineTextMaxLength?: number
  /** 是否在响应中包含 executedCommand；false 可节省 token */
  includeExecutedCommand?: boolean
  /** 为 true 时 submatches 只含 matchText（不含 start/end），可节省 token */
  compactSubmatches?: boolean
}

export type SearchSubmatch = {
  matchText: string
  start?: number
  end?: number
}

export type SearchContextLine = {
  lineNumber: number
  lineText: string
}

export type SearchMatch = {
  filePath: string
  lineNumber: number
  lineText: string
  submatches: SearchSubmatch[]
  before?: SearchContextLine[]
  after?: SearchContextLine[]
}

export type SearchResult = {
  matches: SearchMatch[]
  truncated: boolean
  stats: {
    matchCount: number
    fileCount: number
  }
  searchRoot: string
  executedCommand?: string
  warning?: string
}

export type RipgrepEvent =
  | { type: 'begin'; data: { path?: { text: string } } }
  | { type: 'end'; data: { path?: { text: string } } }
  | {
      type: 'match'
      data: {
        path: { text: string }
        lines: { text: string }
        line_number: number
        submatches?: Array<{ match: { text: string }; start: number; end: number }>
      }
    }
  | {
      type: 'context'
      data: {
        path: { text: string }
        lines: { text: string }
        line_number: number
      }
    }
  | { type: string; data?: any }

export const DEFAULT_MAX_RESULTS = 30
export const MAX_MAX_RESULTS = 50
