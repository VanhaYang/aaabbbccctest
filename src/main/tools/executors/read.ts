import * as fs from 'fs'
import * as path from 'path'
import { configManager } from '../../configManager'
import { filePermissionManager } from '../../filePermission'
import {
  computeContentHash,
  getFileLanguage,
  getFileType,
  getMimeType,
  resolveWorkspaceFilePath
} from '../../api-server/utils'
import type { ToolExecutor, ToolResult } from '../types'

const MAX_TEXT_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_MEDIA_SIZE = 50 * 1024 * 1024 // 50MB

export const read: ToolExecutor = async (args): Promise<ToolResult> => {
  const pathParam = typeof args.path === 'string' ? args.path.trim() : undefined
  if (!pathParam) {
    return { success: false, message: '参数错误：需要提供 path', code: 400 }
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

  if (!filePermissionManager.hasReadPermission(filePath)) {
    return { success: false, message: '没有读取该文件的权限', code: 403 }
  }

  if (!fs.existsSync(filePath)) {
    return { success: false, message: '文件不存在', code: 404 }
  }

  const stats = fs.statSync(filePath)
  if (!stats.isFile()) {
    return { success: false, message: '路径不是文件', code: 400 }
  }

  const ext = path.extname(filePath).toLowerCase()
  const fileType = getFileType(ext)
  const startLine =
    typeof args.startLine === 'number' && Number.isFinite(args.startLine)
      ? args.startLine
      : undefined
  const endLine =
    typeof args.endLine === 'number' && Number.isFinite(args.endLine)
      ? args.endLine
      : undefined
  const hasLineRange = startLine !== undefined && endLine !== undefined

  if (hasLineRange && (startLine! < 1 || endLine! < startLine!)) {
    return { success: false, message: '参数错误：startLine/endLine 范围无效', code: 400 }
  }

  if (fileType === 'image' || fileType === 'video' || fileType === 'audio') {
    if (hasLineRange) {
      return {
        success: false,
        message: '参数错误：startLine/endLine 仅支持文本文件',
        code: 400
      }
    }
    if (stats.size > MAX_MEDIA_SIZE) {
      return {
        success: false,
        message: `文件过大（${Math.round(stats.size / 1024 / 1024)}MB），超过 50MB 限制`,
        code: 400
      }
    }
    const buffer = fs.readFileSync(filePath)
    const base64 = buffer.toString('base64')
    const mimeType = getMimeType(ext)
    const dataUrl = `data:${mimeType};base64,${base64}`
    return {
      success: true,
      data: {
        fileName: path.basename(filePath),
        relativePath: path.relative(workspacePath, filePath).replace(/\\/g, '/'),
        fileType,
        mimeType,
        size: stats.size,
        content: dataUrl,
        language: fileType
      }
    }
  }

  if (stats.size > MAX_TEXT_SIZE) {
    return {
      success: false,
      message: `文件过大（${Math.round(stats.size / 1024 / 1024)}MB），超过 10MB 限制`,
      code: 400
    }
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  const lineEnding = content.includes('\r\n') ? '\r\n' : '\n'
  const lines = content.length === 0 ? [] : content.split(/\r?\n/)
  const totalLines = lines.length
  const hash = computeContentHash(content)
  let finalContent = ''
  let contentOmitted = false
  if (hasLineRange && startLine !== undefined && endLine !== undefined) {
    if (startLine > totalLines || endLine > totalLines) {
      return {
        success: false,
        message: '参数错误：startLine/endLine 超出文件范围',
        code: 400
      }
    }
    finalContent = lines.slice(startLine - 1, endLine).join(lineEnding)
  } else {
    contentOmitted = true
  }
  const language = getFileLanguage(ext)

  return {
    success: true,
    data: {
      fileName: path.basename(filePath),
      relativePath: path.relative(workspacePath, filePath).replace(/\\/g, '/'),
      fileType: 'text',
      size: stats.size,
      content: finalContent,
      language,
      totalLines,
      lineEnding,
      hash,
      contentOmitted
    }
  }
}
