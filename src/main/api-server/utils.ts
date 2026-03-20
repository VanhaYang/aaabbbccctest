import { createHash } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import log from '../logger'
import { filePermissionManager } from '../filePermission'
import { isPathInside } from '../pathGuards'

export function parseRequestBody(req: import('http').IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk.toString()
    })
    req.on('end', () => {
      try {
        if (body) {
          resolve(JSON.parse(body))
        } else {
          resolve({})
        }
      } catch (error) {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

export function sendJsonResponse(
  res: import('http').ServerResponse,
  statusCode: number,
  data: any,
  message: string = '',
  success: boolean = true
): void {
  const response = {
    data,
    code: statusCode,
    message,
    success
  }
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(response))
}

/**
 * 将请求中的路径参数解析为工作区内的绝对路径。
 * 采用 OpenClaw 风格：先 path.resolve 再按 path.relative 判断是否在工作区内，
 * 避免误杀文件名中含 ".." 的合法路径（如 my..file.txt）。
 */
export function resolveWorkspaceFilePath(
  filePathParam: string,
  workspacePath: string
): { ok: true; filePath: string } | { ok: false; statusCode: number; message: string } {
  const rawPath = filePathParam.trim()
  if (!rawPath) {
    return { ok: false, statusCode: 400, message: '路径参数不能为空' }
  }

  const isWindowsDrive = /^[a-zA-Z]:[\\/]/.test(rawPath)
  const isUNC = rawPath.startsWith('\\\\')
  const resolvedWorkspace = path.resolve(workspacePath)

  let resolvedPath: string
  if (path.isAbsolute(rawPath) && (isWindowsDrive || isUNC)) {
    resolvedPath = path.resolve(rawPath)
  } else {
    const relativePart = rawPath.replace(/^[/\\]+/, '')
    resolvedPath = path.resolve(resolvedWorkspace, relativePart)
  }

  if (!isPathInside(resolvedWorkspace, resolvedPath)) {
    return { ok: false, statusCode: 403, message: '文件不在工作区内' }
  }

  return { ok: true, filePath: resolvedPath }
}

export function computeContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export function resolveTextEncoding(value: unknown): BufferEncoding | null {
  if (typeof value === 'string' && Buffer.isEncoding(value)) {
    return value as BufferEncoding
  }
  return null
}

function createTempFilePath(targetPath: string, suffix: string): string {
  const dirPath = path.dirname(targetPath)
  const baseName = path.basename(targetPath)
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return path.join(dirPath, `.${baseName}.${suffix}.${unique}.tmp`)
}

export function writeTextFile(options: {
  filePath: string
  content: string
  encoding: BufferEncoding
  atomic: boolean
  overwrite: boolean
}): { created: boolean; overwritten: boolean; size: number } {
  const { filePath, content, encoding, atomic, overwrite } = options
  const exists = fs.existsSync(filePath)
  const size = Buffer.byteLength(content, encoding)

  if (!atomic) {
    fs.writeFileSync(filePath, content, { encoding })
    return { created: !exists, overwritten: exists && overwrite, size }
  }

  const tempPath = createTempFilePath(filePath, 'write')
  const tempOldPath = exists && overwrite ? createTempFilePath(filePath, 'old') : null
  const fd = fs.openSync(tempPath, 'w')
  try {
    fs.writeFileSync(fd, content, { encoding })
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }

  try {
    if (tempOldPath) {
      fs.renameSync(filePath, tempOldPath)
    }
    fs.renameSync(tempPath, filePath)
    if (tempOldPath) {
      fs.unlinkSync(tempOldPath)
    }
  } catch (error) {
    if (tempOldPath && fs.existsSync(tempOldPath)) {
      try {
        fs.renameSync(tempOldPath, filePath)
      } catch (restoreError) {
        log.error('[API Server] 恢复旧文件失败:', restoreError)
      }
    }
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath)
    }
    throw error
  }

  return { created: !exists, overwritten: exists && overwrite, size }
}

export function applyEditsToContent(
  content: string,
  edits: Array<Record<string, any>>,
  strict: boolean
): { content: string; appliedEdits: number } {
  let updated = content
  let appliedEdits = 0

  for (const edit of edits) {
    if (!edit || typeof edit !== 'object') {
      if (strict) {
        throw new Error('无效的 edits 项')
      }
      continue
    }

    const type = edit.type
    if (type === 'range') {
      updated = applyRangeEdit(updated, edit, strict)
      appliedEdits += 1
      continue
    }

    if (type === 'anchor') {
      updated = applyAnchorEdit(updated, edit, strict)
      appliedEdits += 1
      continue
    }

    if (strict) {
      throw new Error('不支持的 edits 类型')
    }
  }

  return { content: updated, appliedEdits }
}

function applyRangeEdit(
  content: string,
  edit: { startLine?: number; endLine?: number; newText?: string },
  strict: boolean
): string {
  const { startLine, endLine, newText = '' } = edit
  if (!Number.isFinite(startLine) || !Number.isFinite(endLine)) {
    if (strict) {
      throw new Error('range 编辑需要 startLine/endLine')
    }
    return content
  }

  const start = Number(startLine)
  const end = Number(endLine)
  if (start < 1 || end < start) {
    if (strict) {
      throw new Error('range 编辑的行号范围无效')
    }
    return content
  }

  const lineEnding = content.includes('\r\n') ? '\r\n' : '\n'
  const lines = content.split(/\r?\n/)
  if (start > lines.length || end > lines.length) {
    if (strict) {
      throw new Error('range 编辑的行号超出范围')
    }
    return content
  }

  const replacementLines = newText === '' ? [] : String(newText).split(/\r?\n/)
  lines.splice(start - 1, end - start + 1, ...replacementLines)
  return lines.join(lineEnding)
}

function applyAnchorEdit(
  content: string,
  edit: { before?: string; after?: string; oldText?: string; newText?: string },
  strict: boolean
): string {
  const before = typeof edit.before === 'string' ? edit.before : ''
  const after = typeof edit.after === 'string' ? edit.after : ''
  const oldText = typeof edit.oldText === 'string' ? edit.oldText : ''
  const newText = typeof edit.newText === 'string' ? edit.newText : ''

  // 空 oldText + 有 newText：视为整文件替换（与 workspace handler 中「edits 为纯文本时」的约定一致）
  if (!oldText) {
    if (newText) {
      return newText
    }
    if (strict) {
      throw new Error('anchor 编辑需要 oldText 或 newText')
    }
    return content
  }

  if (before || after) {
    const target = `${before}${oldText}${after}`
    const count = countOccurrences(content, target)
    if (count === 0) {
      throw new Error('anchor 编辑未匹配到目标内容')
    }
    if (strict && count > 1) {
      throw new Error('anchor 编辑匹配到多个目标内容')
    }
    const index = content.indexOf(target)
    return (
      content.slice(0, index) + `${before}${newText}${after}` + content.slice(index + target.length)
    )
  }

  const count = countOccurrences(content, oldText)
  if (count === 0) {
    throw new Error('anchor 编辑未匹配到目标内容')
  }
  if (strict && count > 1) {
    throw new Error('anchor 编辑匹配到多个目标内容')
  }

  const index = content.indexOf(oldText)
  return content.slice(0, index) + newText + content.slice(index + oldText.length)
}

function countOccurrences(content: string, target: string): number {
  if (!target) return 0
  let count = 0
  let index = content.indexOf(target)
  while (index !== -1) {
    count += 1
    index = content.indexOf(target, index + target.length)
  }
  return count
}

export function getFileType(ext: string): 'text' | 'image' | 'video' | 'audio' {
  const imageExts = [
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.bmp',
    '.webp',
    '.svg',
    '.ico',
    '.tiff',
    '.tif'
  ]
  const videoExts = [
    '.mp4',
    '.avi',
    '.mov',
    '.wmv',
    '.flv',
    '.mkv',
    '.webm',
    '.m4v',
    '.3gp',
    '.ogv'
  ]
  const audioExts = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma', '.opus', '.amr']

  if (imageExts.includes(ext)) return 'image'
  if (videoExts.includes(ext)) return 'video'
  if (audioExts.includes(ext)) return 'audio'
  return 'text'
}

export function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
    '.mp4': 'video/mp4',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.m4v': 'video/x-m4v',
    '.3gp': 'video/3gpp',
    '.ogv': 'video/ogg',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.m4a': 'audio/mp4',
    '.wma': 'audio/x-ms-wma',
    '.opus': 'audio/opus',
    '.amr': 'audio/amr'
  }

  return mimeTypes[ext] || 'application/octet-stream'
}

export function getFileLanguage(ext: string): string {
  const languageMap: Record<string, string> = {
    '.html': 'html',
    '.htm': 'html',
    '.md': 'markdown',
    '.markdown': 'markdown',
    '.json': 'json',
    '.txt': 'text',
    '.log': 'text',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.css': 'css',
    '.scss': 'scss',
    '.sass': 'sass',
    '.less': 'less',
    '.xml': 'xml',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.py': 'python',
    '.java': 'java',
    '.cpp': 'cpp',
    '.cxx': 'cpp',
    '.cc': 'cpp',
    '.c': 'c',
    '.h': 'c',
    '.hpp': 'cpp',
    '.go': 'go',
    '.rs': 'rust',
    '.php': 'php',
    '.rb': 'ruby',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.sh': 'shell',
    '.bash': 'bash',
    '.zsh': 'zsh',
    '.ps1': 'powershell',
    '.sql': 'sql',
    '.dockerfile': 'dockerfile',
    '.makefile': 'makefile',
    '.ini': 'ini',
    '.toml': 'toml',
    '.conf': 'ini',
    '.config': 'ini'
  }

  return languageMap[ext] || 'text'
}
