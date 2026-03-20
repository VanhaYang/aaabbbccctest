import * as fs from 'fs'
import * as path from 'path'
import { configManager } from '../../configManager'
import { filePermissionManager } from '../../filePermission'
import {
  applyEditsToContent,
  computeContentHash,
  getFileType,
  resolveTextEncoding,
  resolveWorkspaceFilePath,
  writeTextFile
} from '../../api-server/utils'
import type { ToolExecutor, ToolResult } from '../types'

const MAX_TEXT_SIZE = 10 * 1024 * 1024 // 10MB

function normalizeEdits(edits: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(edits) || edits.length === 0) return []
  return edits.map(edit => {
    if (!edit || typeof edit !== 'object') return edit as Record<string, unknown>
    const e = edit as Record<string, unknown>
    if (typeof e.type === 'string') return e
    if (Number.isFinite(e.startLine) || Number.isFinite(e.endLine)) {
      return { ...e, type: 'range' }
    }
    if (typeof e.oldText === 'string' && e.oldText.length > 0) {
      return { ...e, type: 'anchor' }
    }
    return e
  })
}

export const edit: ToolExecutor = async (args): Promise<ToolResult> => {
  const pathParam = typeof args.path === 'string' ? args.path : undefined
  if (!pathParam) {
    return { success: false, message: '参数错误：需要提供 path', code: 400 }
  }

  let rawEdits = args.edits
  if (rawEdits === null || rawEdits === undefined) {
    return {
      success: false,
      message: '参数错误：edits 不能为空或未提供',
      code: 400
    }
  }
  // 与 OpenClaw 一致：字符串仅表示「JSON 数组」一种含义，解析失败即报错，不做整文件替换回退
  if (typeof rawEdits === 'string') {
    try {
      rawEdits = JSON.parse(rawEdits) as unknown
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'JSON 解析失败'
      return {
        success: false,
        message: `参数错误：edits 为字符串时须为合法 JSON 数组（${msg}）。推荐请求体直接传 edits 数组；newText 内双引号需转义为 \\\"`,
        code: 400
      }
    }
  }
  if (!Array.isArray(rawEdits) || rawEdits.length === 0) {
    return { success: false, message: '参数错误：edits 不能为空', code: 400 }
  }

  const workspacePath = configManager.getWorkspacePath()
  if (!workspacePath) {
    return { success: false, message: '未配置工作区路径', code: 400 }
  }

  const resolved = resolveWorkspaceFilePath(pathParam, workspacePath)
  if (!resolved.ok) {
    return {
      success: false,
      message: resolved.message,
      code: resolved.statusCode
    }
  }
  const filePath = resolved.filePath

  const encoding = typeof args.encoding === 'string' ? args.encoding : 'utf-8'
  const resolvedEncoding = resolveTextEncoding(encoding)
  if (!resolvedEncoding) {
    return { success: false, message: '参数错误：encoding 不支持', code: 400 }
  }

  const ext = path.extname(filePath).toLowerCase()
  const fileType = getFileType(ext)
  if (fileType !== 'text') {
    return { success: false, message: '不支持编辑媒体文件', code: 400 }
  }

  if (!filePermissionManager.hasWritePermission(filePath)) {
    return { success: false, message: '没有写入该文件的权限', code: 403 }
  }

  const fileExists = fs.existsSync(filePath)
  let originalContent: string
  if (fileExists) {
    originalContent = fs.readFileSync(filePath, { encoding: resolvedEncoding })
    const baseHash = typeof args.baseHash === 'string' ? args.baseHash : undefined
    if (baseHash && baseHash.length > 0) {
      const currentHash = computeContentHash(originalContent)
      if (currentHash !== baseHash) {
        return {
          success: false,
          message: '文件已被修改，baseHash 不匹配',
          code: 409
        }
      }
    }
  } else {
    const dirPath = path.dirname(filePath)
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }
    originalContent = ''
  }

  const normalizedEdits = normalizeEdits(rawEdits) as Array<Record<string, any>>
  let applyResult: { content: string; appliedEdits: number }
  try {
    applyResult = applyEditsToContent(originalContent, normalizedEdits, args.strict !== false)
  } catch (editError) {
    const message = editError instanceof Error ? editError.message : '编辑匹配失败'
    return { success: false, message, code: 400 }
  }

  const nextContent = applyResult.content
  const nextSize = Buffer.byteLength(nextContent, resolvedEncoding)
  if (nextSize > MAX_TEXT_SIZE) {
    return {
      success: false,
      message: `文件过大（${Math.round(nextSize / 1024 / 1024)}MB），超过 10MB 限制`,
      code: 400
    }
  }

  writeTextFile({
    filePath,
    content: nextContent,
    encoding: resolvedEncoding,
    atomic: args.atomic !== false,
    overwrite: true
  })

  return {
    success: true,
    data: {
      fileName: path.basename(filePath),
      relativePath: path.relative(workspacePath, filePath).replace(/\\/g, '/'),
      fileType: 'text',
      size: nextSize,
      created: !fileExists,
      overwritten: fileExists,
      hash: computeContentHash(nextContent),
      appliedEdits: applyResult.appliedEdits
    }
  }
}
