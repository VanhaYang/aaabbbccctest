import * as fs from 'fs'
import * as path from 'path'
import { configManager } from '../../configManager'
import { filePermissionManager } from '../../filePermission'
import {
  computeContentHash,
  getFileType,
  resolveTextEncoding,
  resolveWorkspaceFilePath,
  writeTextFile
} from '../../api-server/utils'
import type { ToolExecutor, ToolResult } from '../types'

const MAX_TEXT_SIZE = 10 * 1024 * 1024 // 10MB

export const write: ToolExecutor = async (args): Promise<ToolResult> => {
  const pathParam = typeof args.path === 'string' ? args.path : undefined
  const content = typeof args.content === 'string' ? args.content : undefined
  if (!pathParam) {
    return { success: false, message: '参数错误：需要提供 path', code: 400 }
  }
  if (content === undefined) {
    return { success: false, message: '参数错误：content 必须是字符串', code: 400 }
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

  const encoding =
    typeof args.encoding === 'string' ? args.encoding : 'utf-8'
  const resolvedEncoding = resolveTextEncoding(encoding)
  if (!resolvedEncoding) {
    return { success: false, message: '参数错误：encoding 不支持', code: 400 }
  }

  const ext = path.extname(filePath).toLowerCase()
  const fileType = getFileType(ext)
  if (fileType !== 'text') {
    return { success: false, message: '不支持写入媒体文件', code: 400 }
  }

  const contentSize = Buffer.byteLength(content, resolvedEncoding)
  if (contentSize > MAX_TEXT_SIZE) {
    return {
      success: false,
      message: `文件过大（${Math.round(contentSize / 1024 / 1024)}MB），超过 10MB 限制`,
      code: 400
    }
  }

  const dirPath = path.dirname(filePath)
  const createParentDirs = args.createParentDirs !== false
  if (!fs.existsSync(dirPath)) {
    if (!createParentDirs) {
      return { success: false, message: '父目录不存在', code: 400 }
    }
    fs.mkdirSync(dirPath, { recursive: true })
  }

  if (!filePermissionManager.hasWritePermission(filePath)) {
    return { success: false, message: '没有写入该文件的权限', code: 403 }
  }

  const overwrite = Boolean(args.overwrite)
  const exists = fs.existsSync(filePath)
  if (exists && !overwrite) {
    return { success: false, message: '文件已存在', code: 400 }
  }

  const baseHash = typeof args.baseHash === 'string' ? args.baseHash : undefined
  if (baseHash && baseHash.length > 0 && exists) {
    const currentContent = fs.readFileSync(filePath, { encoding: resolvedEncoding })
    const currentHash = computeContentHash(currentContent)
    if (currentHash !== baseHash) {
      return { success: false, message: '文件已被修改，baseHash 不匹配', code: 409 }
    }
  }

  const result = writeTextFile({
    filePath,
    content,
    encoding: resolvedEncoding,
    atomic: args.atomic !== false,
    overwrite
  })

  return {
    success: true,
    data: {
      fileName: path.basename(filePath),
      relativePath: path.relative(workspacePath, filePath).replace(/\\/g, '/'),
      fileType: 'text',
      size: result.size,
      created: result.created,
      overwritten: result.overwritten,
      hash: computeContentHash(content)
    }
  }
}
