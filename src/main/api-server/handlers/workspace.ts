import type http from 'http'
import * as fs from 'fs'
import * as path from 'path'
import log from '../../logger'
import { configManager } from '../../configManager'
import { filePermissionManager } from '../../filePermission'
import { searchWorkspace } from '../../services/searchService'
import { isPathInside } from '../../pathGuards'
import {
  applyEditsToContent,
  computeContentHash,
  getFileLanguage,
  getFileType,
  getMimeType,
  parseRequestBody,
  resolveTextEncoding,
  resolveWorkspaceFilePath,
  sendJsonResponse,
  writeTextFile
} from '../utils'

export async function handleWorkspaceFilesRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const workspacePath = configManager.getWorkspacePath()
    if (!workspacePath) {
      sendJsonResponse(res, 400, null, '未配置工作区路径', false)
      return
    }

    const urlString = req.url || '/workspace/files'
    const queryIndex = urlString.indexOf('?')
    let recursive = false
    let subPath = ''
    let format: 'list' | 'tree' | 'treeText' = 'list'
    let compact = false
    let includeMeta = false
    let maxDepth: number | undefined

    if (queryIndex !== -1) {
      const queryString = urlString.substring(queryIndex + 1)
      const params = new URLSearchParams(queryString)
      recursive = params.get('recursive') === 'true'
      subPath = params.get('path') || ''
      const formatParam = params.get('format')
      if (formatParam === 'tree' || formatParam === 'treeText') format = formatParam
      compact = params.get('compact') === 'true'
      includeMeta = params.get('includeMeta') === 'true'
      const maxDepthParam = params.get('maxDepth')
      if (maxDepthParam !== null) {
        const n = parseInt(maxDepthParam, 10)
        if (!Number.isNaN(n) && n >= 1) maxDepth = n
      }
    }

    const targetPath = path.resolve(workspacePath, subPath || '.')
    if (!isPathInside(workspacePath, targetPath)) {
      sendJsonResponse(res, 403, null, '路径不在工作区内', false)
      return
    }

    if (!filePermissionManager.hasDirectoryReadPermission(targetPath)) {
      sendJsonResponse(res, 403, null, '没有读取该目录的权限', false)
      return
    }

    if (!fs.existsSync(targetPath)) {
      sendJsonResponse(res, 404, null, '目录不存在', false)
      return
    }

    const stats = fs.statSync(targetPath)
    if (!stats.isDirectory()) {
      sendJsonResponse(res, 400, null, '路径不是目录', false)
      return
    }

    const files = readDirectoryRecursive(targetPath, workspacePath, recursive, 0, maxDepth)

    const listLimit = 30
    const treeLimit = 600 // tree / treeText 最多展示条数，超出则只返回前 600 条
    const limit = format === 'list' ? listLimit : treeLimit
    const overLimit = recursive && files.length > limit

    if (format === 'list' && overLimit) {
      sendJsonResponse(
        res,
        400,
        null,
        `结果超过${listLimit}条（共${files.length}条），请更换检索方式。建议：1) 使用更具体的 path 参数；2) 使用 /workspace/search 搜索；3) 使用 format=tree 或 format=treeText 可展示更多（最多 ${treeLimit} 条）。`,
        false
      )
      return
    }

    const filesToUse = format !== 'list' && overLimit ? files.slice(0, limit) : files
    const totalCount = format !== 'list' && overLimit ? files.length : undefined

    const currentRelativePath = path.relative(workspacePath, targetPath).replace(/\\/g, '/') || '.'

    if (format === 'treeText') {
      const treeText = buildTreeText(filesToUse, currentRelativePath)
      const truncatedPaths = filesToUse.filter(f => f.truncated).map(f => f.relativePath)
      sendJsonResponse(res, 200, {
        currentPath: currentRelativePath,
        treeText,
        ...(truncatedPaths.length > 0 && { truncatedPaths }),
        ...(totalCount !== undefined && { totalCount, truncated: true })
      })
      return
    }

    if (format === 'tree') {
      const tree = buildTreeFromFiles(filesToUse)
      const truncatedPaths = filesToUse.filter(f => f.truncated).map(f => f.relativePath)
      const payload: {
        currentPath: string
        tree: unknown
        truncatedPaths?: string[]
        totalCount?: number
        truncated?: boolean
      } = {
        currentPath: currentRelativePath,
        tree,
        ...(truncatedPaths.length > 0 && { truncatedPaths }),
        ...(totalCount !== undefined && { totalCount, truncated: true })
      }
      sendJsonResponse(res, 200, payload)
      return
    }

    const list = files.map(f => {
      if (compact) {
        const item: Record<string, unknown> = {
          n: f.name,
          r: f.relativePath,
          d: f.isDirectory,
          dp: f.depth
        }
        if (f.truncated) item.tr = true
        if (includeMeta) {
          if (f.size !== undefined) item.s = f.size
          if (f.modifiedTime !== undefined) item.t = f.modifiedTime
        }
        return item
      }
      const item: Record<string, unknown> = {
        name: f.name,
        relativePath: f.relativePath,
        isDirectory: f.isDirectory,
        depth: f.depth
      }
      if (f.truncated) item.truncated = true
      if (includeMeta) {
        if (f.size !== undefined) item.size = f.size
        if (f.modifiedTime !== undefined) item.modifiedTime = f.modifiedTime
      }
      return item
    })

    const truncatedPaths = files.filter(f => f.truncated).map(f => f.relativePath)
    sendJsonResponse(res, 200, {
      currentPath: currentRelativePath,
      ...(maxDepth !== undefined && { maxDepth }),
      ...(truncatedPaths.length > 0 && { truncatedPaths }),
      files: list
    })
  } catch (error) {
    log.error('[API Server] 获取工作区文件列表失败:', error)
    const errorMessage = error instanceof Error ? error.message : '获取文件列表失败'
    sendJsonResponse(res, 500, null, errorMessage, false)
  }
}

export async function handleWorkspaceSearchRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const body = await parseRequestBody(req)
    const {
      pattern,
      path: subPath = '',
      caseSensitive,
      contextLines = 0,
      glob,
      type,
      maxResults = 30,
      multiline = false,
      noIgnore = true,
      lineTextMaxLength = 400,
      includeExecutedCommand = false,
      compactSubmatches = true
    } = body || {}

    if (!pattern || typeof pattern !== 'string' || pattern.trim().length === 0) {
      sendJsonResponse(res, 400, null, '参数错误：pattern 不能为空', false)
      return
    }

    const workspacePath = configManager.getWorkspacePath()
    if (!workspacePath) {
      sendJsonResponse(res, 400, null, '未配置工作区路径', false)
      return
    }

    const targetPath = path.resolve(workspacePath, subPath || '.')
    if (!isPathInside(workspacePath, targetPath)) {
      sendJsonResponse(res, 403, null, '路径不在工作区内', false)
      return
    }

    if (!fs.existsSync(targetPath)) {
      sendJsonResponse(res, 404, null, '路径不存在', false)
      return
    }

    const stats = fs.statSync(targetPath)
    if (stats.isDirectory()) {
      if (!filePermissionManager.hasDirectoryReadPermission(targetPath)) {
        sendJsonResponse(res, 403, null, '没有读取该目录的权限', false)
        return
      }
    } else if (stats.isFile()) {
      if (!filePermissionManager.hasReadPermission(targetPath)) {
        sendJsonResponse(res, 403, null, '没有读取该文件的权限', false)
        return
      }
    } else {
      sendJsonResponse(res, 400, null, '路径不是文件或目录', false)
      return
    }

    const result = await searchWorkspace({
      pattern: pattern.trim(),
      searchPath: targetPath,
      workspacePath,
      caseSensitive: typeof caseSensitive === 'boolean' ? caseSensitive : undefined,
      contextLines: Number.isFinite(contextLines) ? Number(contextLines) : 0,
      glob,
      type,
      maxResults: Number.isFinite(maxResults) ? Number(maxResults) : 30,
      multiline: typeof multiline === 'boolean' ? multiline : false,
      noIgnore: typeof noIgnore === 'boolean' ? noIgnore : true,
      lineTextMaxLength: Number.isFinite(lineTextMaxLength) ? Number(lineTextMaxLength) : 400,
      includeExecutedCommand:
        typeof includeExecutedCommand === 'boolean' ? includeExecutedCommand : false,
      compactSubmatches: typeof compactSubmatches === 'boolean' ? compactSubmatches : true
    })

    sendJsonResponse(res, 200, result)
  } catch (error) {
    log.error('[API Server] 搜索工作区失败:', error)
    const errorMessage = error instanceof Error ? error.message : '搜索失败'
    sendJsonResponse(res, 500, null, errorMessage, false)
  }
}

export async function handleWorkspaceFileRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const workspacePath = configManager.getWorkspacePath()
    if (!workspacePath) {
      sendJsonResponse(res, 400, null, '未配置工作区路径', false)
      return
    }

    const urlString = req.url || '/workspace/file'
    const queryIndex = urlString.indexOf('?')
    if (queryIndex === -1) {
      sendJsonResponse(res, 400, null, '参数错误：需要提供文件路径', false)
      return
    }

    const queryString = urlString.substring(queryIndex + 1)
    const params = new URLSearchParams(queryString)
    const filePathParam = params.get('path')
    const startLineParam = params.get('startLine')
    const endLineParam = params.get('endLine')

    if (!filePathParam) {
      sendJsonResponse(res, 400, null, '参数错误：需要提供文件路径', false)
      return
    }

    const resolved = resolveWorkspaceFilePath(filePathParam, workspacePath)
    if (!resolved.ok) {
      sendJsonResponse(res, resolved.statusCode, null, resolved.message, false)
      return
    }
    const filePath = resolved.filePath

    if (!filePermissionManager.hasReadPermission(filePath)) {
      sendJsonResponse(res, 403, null, '没有读取该文件的权限', false)
      return
    }

    if (!fs.existsSync(filePath)) {
      sendJsonResponse(res, 404, null, '文件不存在', false)
      return
    }

    const stats = fs.statSync(filePath)
    if (!stats.isFile()) {
      sendJsonResponse(res, 400, null, '路径不是文件', false)
      return
    }

    const ext = path.extname(filePath).toLowerCase()
    const fileType = getFileType(ext)
    const hasLineRange = startLineParam !== null || endLineParam !== null

    let startLine: number | undefined
    let endLine: number | undefined
    if (hasLineRange) {
      if (startLineParam === null || endLineParam === null) {
        sendJsonResponse(res, 400, null, '参数错误：startLine/endLine 必须同时提供', false)
        return
      }
      startLine = Number.parseInt(startLineParam, 10)
      endLine = Number.parseInt(endLineParam, 10)
      if (
        !Number.isFinite(startLine) ||
        !Number.isFinite(endLine) ||
        startLine < 1 ||
        endLine < startLine
      ) {
        sendJsonResponse(res, 400, null, '参数错误：startLine/endLine 范围无效', false)
        return
      }
    }

    if (fileType === 'image' || fileType === 'video' || fileType === 'audio') {
      if (hasLineRange) {
        sendJsonResponse(res, 400, null, '参数错误：startLine/endLine 仅支持文本文件', false)
        return
      }
      const maxMediaSize = 50 * 1024 * 1024 // 50MB
      if (stats.size > maxMediaSize) {
        sendJsonResponse(
          res,
          400,
          null,
          `文件过大（${Math.round(stats.size / 1024 / 1024)}MB），超过 50MB 限制`,
          false
        )
        return
      }

      const buffer = fs.readFileSync(filePath)
      const base64 = buffer.toString('base64')
      const mimeType = getMimeType(ext)
      const dataUrl = `data:${mimeType};base64,${base64}`

      sendJsonResponse(res, 200, {
        fileName: path.basename(filePath),
        relativePath: path.relative(workspacePath, filePath).replace(/\\/g, '/'),
        fileType,
        mimeType,
        size: stats.size,
        content: dataUrl,
        language: fileType
      })
    } else {
      const maxTextSize = 10 * 1024 * 1024 // 10MB
      if (stats.size > maxTextSize) {
        sendJsonResponse(
          res,
          400,
          null,
          `文件过大（${Math.round(stats.size / 1024 / 1024)}MB），超过 10MB 限制`,
          false
        )
        return
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
          sendJsonResponse(res, 400, null, '参数错误：startLine/endLine 超出文件范围', false)
          return
        }
        finalContent = lines.slice(startLine - 1, endLine).join(lineEnding)
      } else {
        contentOmitted = true
      }
      const language = getFileLanguage(ext)

      sendJsonResponse(res, 200, {
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
      })
    }
  } catch (error) {
    log.error('[API Server] 读取工作区文件失败:', error)
    const errorMessage = error instanceof Error ? error.message : '读取文件失败'
    sendJsonResponse(res, 500, null, errorMessage, false)
  }
}

export async function handleWorkspaceWriteRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const workspacePath = configManager.getWorkspacePath()
    if (!workspacePath) {
      sendJsonResponse(res, 400, null, '未配置工作区路径', false)
      return
    }

    const body = await parseRequestBody(req)
    const {
      path: filePathParam,
      content,
      encoding = 'utf-8',
      overwrite = false,
      createParentDirs = true,
      atomic = true,
      baseHash
    } = body || {}

    if (!filePathParam || typeof filePathParam !== 'string') {
      sendJsonResponse(res, 400, null, '参数错误：需要提供文件路径', false)
      return
    }

    if (typeof content !== 'string') {
      sendJsonResponse(res, 400, null, '参数错误：content 必须是字符串', false)
      return
    }

    const resolvedEncoding = resolveTextEncoding(encoding)
    if (!resolvedEncoding) {
      sendJsonResponse(res, 400, null, '参数错误：encoding 不支持', false)
      return
    }

    const resolved = resolveWorkspaceFilePath(filePathParam, workspacePath)
    if (!resolved.ok) {
      sendJsonResponse(res, resolved.statusCode, null, resolved.message, false)
      return
    }

    const filePath = resolved.filePath
    const ext = path.extname(filePath).toLowerCase()
    const fileType = getFileType(ext)
    if (fileType !== 'text') {
      sendJsonResponse(res, 400, null, '不支持写入媒体文件', false)
      return
    }

    const maxTextSize = 10 * 1024 * 1024 // 10MB
    const contentSize = Buffer.byteLength(content, resolvedEncoding)
    if (contentSize > maxTextSize) {
      sendJsonResponse(
        res,
        400,
        null,
        `文件过大（${Math.round(contentSize / 1024 / 1024)}MB），超过 10MB 限制`,
        false
      )
      return
    }

    const dirPath = path.dirname(filePath)
    if (!fs.existsSync(dirPath)) {
      if (!createParentDirs) {
        sendJsonResponse(res, 400, null, '父目录不存在', false)
        return
      }
      fs.mkdirSync(dirPath, { recursive: true })
    }

    if (!filePermissionManager.hasWritePermission(filePath)) {
      sendJsonResponse(res, 403, null, '没有写入该文件的权限', false)
      return
    }

    const exists = fs.existsSync(filePath)
    if (exists && !overwrite) {
      sendJsonResponse(res, 400, null, '文件已存在', false)
      return
    }

    if (typeof baseHash === 'string' && baseHash.length > 0 && exists) {
      const currentContent = fs.readFileSync(filePath, { encoding: resolvedEncoding })
      const currentHash = computeContentHash(currentContent)
      if (currentHash !== baseHash) {
        sendJsonResponse(res, 409, null, '文件已被修改，baseHash 不匹配', false)
        return
      }
    }

    const result = writeTextFile({
      filePath,
      content,
      encoding: resolvedEncoding,
      atomic: Boolean(atomic),
      overwrite: Boolean(overwrite)
    })

    const response = {
      fileName: path.basename(filePath),
      relativePath: path.relative(workspacePath, filePath).replace(/\\/g, '/'),
      fileType: 'text',
      size: result.size,
      created: result.created,
      overwritten: result.overwritten,
      hash: computeContentHash(content)
    }
    sendJsonResponse(res, 200, response)
  } catch (error) {
    log.error('[API Server] 写入工作区文件失败:', error)
    const errorMessage = error instanceof Error ? error.message : '写入文件失败'
    sendJsonResponse(res, 500, null, errorMessage, false)
  }
}

export async function handleWorkspaceEditsRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const workspacePath = configManager.getWorkspacePath()
    if (!workspacePath) {
      sendJsonResponse(res, 400, null, '未配置工作区路径', false)
      return
    }

    let body = await parseRequestBody(req)
    // 支持以 editWorkspaceFile 为 key 的包装格式：{"editWorkspaceFile": "{\"path\":\"...\",\"edits\":...}"}
    if (body && typeof body.editWorkspaceFile === 'string') {
      try {
        const inner = JSON.parse(body.editWorkspaceFile) as Record<string, unknown>
        body = { ...body, ...inner }
      } catch {
        // 解析失败则继续用原 body，后面会按 path/edits 缺失报错
      }
    }
    const {
      path: filePathParam,
      edits,
      strict = true,
      baseHash,
      encoding = 'utf-8',
      atomic = true
    } = body || {}

    if (!filePathParam || typeof filePathParam !== 'string') {
      sendJsonResponse(res, 400, null, '参数错误：需要提供文件路径', false)
      return
    }

    if (edits === null || edits === undefined) {
      sendJsonResponse(
        res,
        400,
        null,
        '参数错误：edits 不能为空或未提供（请提供非空数组或合法 JSON 字符串，不能为 null）',
        false
      )
      return
    }

    let resolvedEdits: unknown = edits
    if (typeof edits === 'string') {
      const trimmed = edits.trim()
      if (trimmed.startsWith('[')) {
        try {
          resolvedEdits = JSON.parse(edits)
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'JSON 解析失败'
          sendJsonResponse(
            res,
            400,
            null,
            `参数错误：edits 字符串不是合法的 JSON（${msg}）。请检查转义，例如 newText 内的双引号需为 \\\"`,
            false
          )
          return
        }
      } else {
        try {
          resolvedEdits = JSON.parse(edits)
        } catch {
          try {
            resolvedEdits = parseEditsFromString(edits)
          } catch {
            resolvedEdits = [{ type: 'anchor' as const, oldText: '', newText: edits }]
          }
        }
      }
    }

    if (!Array.isArray(resolvedEdits) || resolvedEdits.length === 0) {
      sendJsonResponse(res, 400, null, '参数错误：edits 不能为空', false)
      return
    }

    const resolvedEncoding = resolveTextEncoding(encoding)
    if (!resolvedEncoding) {
      sendJsonResponse(res, 400, null, '参数错误：encoding 不支持', false)
      return
    }

    const resolved = resolveWorkspaceFilePath(filePathParam, workspacePath)
    if (!resolved.ok) {
      sendJsonResponse(res, resolved.statusCode, null, resolved.message, false)
      return
    }

    const filePath = resolved.filePath
    const ext = path.extname(filePath).toLowerCase()
    const fileType = getFileType(ext)
    if (fileType !== 'text') {
      sendJsonResponse(res, 400, null, '不支持编辑媒体文件', false)
      return
    }

    if (!filePermissionManager.hasWritePermission(filePath)) {
      sendJsonResponse(res, 403, null, '没有写入该文件的权限', false)
      return
    }

    const fileExists = fs.existsSync(filePath)
    let originalContent: string
    if (fileExists) {
      originalContent = fs.readFileSync(filePath, { encoding: resolvedEncoding })
      if (typeof baseHash === 'string' && baseHash.length > 0) {
        const currentHash = computeContentHash(originalContent)
        if (currentHash !== baseHash) {
          sendJsonResponse(res, 409, null, '文件已被修改，baseHash 不匹配', false)
          return
        }
      }
    } else {
      // 文件不存在时视为在空内容上应用编辑并创建文件
      const dirPath = path.dirname(filePath)
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
      }
      originalContent = ''
    }

    const normalizedEdits = resolvedEdits.map(edit => {
      if (!edit || typeof edit !== 'object') return edit
      const editRecord = edit as Record<string, unknown>
      if (typeof editRecord.type === 'string') return editRecord
      if (
        Number.isFinite(editRecord.startLine as number) ||
        Number.isFinite(editRecord.endLine as number)
      ) {
        return { ...editRecord, type: 'range' }
      }
      if (typeof editRecord.oldText === 'string' && editRecord.oldText.length > 0) {
        return { ...editRecord, type: 'anchor' }
      }
      return editRecord
    })

    let applyResult: { content: string; appliedEdits: number }
    try {
      applyResult = applyEditsToContent(
        originalContent,
        normalizedEdits as Array<Record<string, any>>,
        Boolean(strict)
      )
    } catch (editError) {
      const message = editError instanceof Error ? editError.message : '编辑匹配失败'
      sendJsonResponse(res, 400, null, message, false)
      return
    }
    const nextContent = applyResult.content
    const maxTextSize = 10 * 1024 * 1024 // 10MB
    const nextSize = Buffer.byteLength(nextContent, resolvedEncoding)
    if (nextSize > maxTextSize) {
      sendJsonResponse(
        res,
        400,
        null,
        `文件过大（${Math.round(nextSize / 1024 / 1024)}MB），超过 10MB 限制`,
        false
      )
      return
    }

    const result = writeTextFile({
      filePath,
      content: nextContent,
      encoding: resolvedEncoding,
      atomic: Boolean(atomic),
      overwrite: true
    })

    const response = {
      fileName: path.basename(filePath),
      relativePath: path.relative(workspacePath, filePath).replace(/\\/g, '/'),
      fileType: 'text',
      size: result.size,
      created: result.created,
      overwritten: result.overwritten,
      hash: computeContentHash(nextContent),
      appliedEdits: applyResult.appliedEdits
    }
    sendJsonResponse(res, 200, response)
  } catch (error) {
    log.error('[API Server] 精准编辑文件失败:', error)
    const errorMessage = error instanceof Error ? error.message : '编辑文件失败'
    sendJsonResponse(res, 500, null, errorMessage, false)
  }
}

function parseEditsFromString(editsText: string): Array<Record<string, any>> {
  const lines = editsText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)

  if (lines.length === 0) return []

  const edits: Array<Record<string, any>> = []
  for (const line of lines) {
    if (line.startsWith('replace:')) {
      const rest = line.slice('replace:'.length).trim()
      const arrowIndex = rest.indexOf('→')
      const plainArrowIndex = arrowIndex === -1 ? rest.indexOf('->') : -1
      const splitIndex = arrowIndex !== -1 ? arrowIndex : plainArrowIndex
      const arrowLength = arrowIndex !== -1 ? 1 : 2
      if (splitIndex === -1) {
        throw new Error('edits 解析失败：replace 语法需要使用 "旧内容 → 新内容"')
      }
      const oldText = rest.slice(0, splitIndex).trim()
      const newText = rest.slice(splitIndex + arrowLength).trim()
      if (!oldText) {
        throw new Error('edits 解析失败：replace 旧内容为空')
      }
      edits.push({ type: 'anchor', oldText, newText })
      continue
    }

    if (line.startsWith('s/')) {
      const match = line.match(/^s\/([^\/]*)\/([^\/]*)\/g$/)
      if (!match) {
        throw new Error('edits 解析失败：s/old/new/g 语法无效或包含 "/" 字符')
      }
      edits.push({ type: 'anchor', oldText: match[1], newText: match[2] })
      continue
    }

    throw new Error('edits 解析失败：仅支持 replace: 与 s/old/new/g 两种语法')
  }

  return edits
}

function readDirectoryRecursive(
  dirPath: string,
  workspacePath: string,
  recursive: boolean,
  currentDepth: number = 0,
  maxDepth?: number
): Array<{
  name: string
  relativePath: string
  isDirectory: boolean
  depth: number
  truncated?: boolean
  size?: number
  modifiedTime?: number
}> {
  const files: Array<{
    name: string
    relativePath: string
    isDirectory: boolean
    depth: number
    truncated?: boolean
    size?: number
    modifiedTime?: number
  }> = []

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    const shouldRecurse = recursive && (maxDepth === undefined || currentDepth < maxDepth - 1)

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      const relativePath = path.relative(workspacePath, fullPath)
      const truncatedDueToMaxDepth =
        entry.isDirectory() && recursive && maxDepth !== undefined && currentDepth >= maxDepth - 1

      if (entry.name.startsWith('.')) {
        continue
      }

      const stats = fs.statSync(fullPath)
      const fileInfo = {
        name: entry.name,
        relativePath: relativePath.replace(/\\/g, '/'),
        isDirectory: entry.isDirectory(),
        depth: currentDepth,
        ...(truncatedDueToMaxDepth && { truncated: true }),
        size: entry.isFile() ? stats.size : undefined,
        modifiedTime: stats.mtimeMs
      }

      files.push(fileInfo)

      if (entry.isDirectory() && shouldRecurse) {
        const subFiles = readDirectoryRecursive(
          fullPath,
          workspacePath,
          recursive,
          currentDepth + 1,
          maxDepth
        )
        files.push(...subFiles)
      }
    }
  } catch (error) {
    log.error(`[API Server] 读取目录失败 ${dirPath}:`, error)
  }

  return files
}

function buildTreeFromFiles(
  files: Array<{
    name: string
    relativePath: string
    isDirectory: boolean
    size?: number
    modifiedTime?: number
  }>
): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  for (const f of files) {
    const segments = f.relativePath.split('/').filter(Boolean)
    let node = root
    for (let i = 0; i < segments.length; i++) {
      const key = segments[i]
      const isLast = i === segments.length - 1
      if (isLast) {
        node[key] = f.isDirectory
          ? { _: 'dir' }
          : {
              _: 'file',
              ...(f.size !== undefined && { s: f.size }),
              ...(f.modifiedTime !== undefined && { t: f.modifiedTime })
            }
      } else {
        if (!(key in node) || typeof node[key] !== 'object') {
          node[key] = {}
        }
        node = node[key] as Record<string, unknown>
      }
    }
  }
  return root
}

function buildTreeText(
  files: Array<{
    relativePath: string
    isDirectory: boolean
    name: string
    truncated?: boolean
  }>,
  currentPath: string
): string {
  if (files.length === 0) return currentPath || '.'

  const lines: string[] = []
  const base = currentPath && currentPath !== '.' ? currentPath + '/' : ''
  const sorted = [...files].sort((a, b) => a.relativePath.localeCompare(b.relativePath))

  for (const f of sorted) {
    const r = f.relativePath
    const depth = (r.match(/\//g) || []).length
    const prefix = '  '.repeat(depth)
    let name = f.name + (f.isDirectory ? '/' : '')
    if (f.truncated) name += ' (…)'
    lines.push(prefix + name)
  }
  return (base ? base + '\n' : '') + lines.join('\n')
}
