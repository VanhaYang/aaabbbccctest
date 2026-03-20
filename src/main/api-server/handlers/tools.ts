import type http from 'http'
import {
  ensureToolsInitialized,
  executeTool,
  listToolIds
} from '../../tools'
import type { ToolId } from '../../tools'
import { parseRequestBody, sendJsonResponse } from '../utils'

/** 允许的按方法路径：与 ToolId 一一对应，便于 function calling 与 HTTP 一一对应 */
const TOOL_METHOD_PATHS: readonly ToolId[] = [
  'read',
  'write',
  'edit',
  'exec',
  'screenshot',
  'mouse_move',
  'mouse_click',
  'apply_patch',
  'browser_navigate',
  'browser_snapshot',
  'browser_screenshot',
  'browser_act'
] as const

/**
 * POST /tools/{toolId}
 * Body 即为该工具的 arguments，与 function calling 一一对应，避免 toolId 与 arguments 混淆
 * 例如 POST /tools/read body: { path, startLine?, endLine? }；POST /tools/write body: { path, content, ... }
 */
export async function handleToolsMethodRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  toolId: ToolId
): Promise<void> {
  try {
    const body = await parseRequestBody(req)
    const args = typeof body === 'object' && body !== null ? body : {}

    ensureToolsInitialized()
    const result = await executeTool(toolId, args as Record<string, unknown>)

    const statusCode = result.code ?? (result.success ? 200 : 400)
    sendJsonResponse(
      res,
      statusCode,
      result.data ?? null,
      result.message ?? '',
      result.success
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '工具执行失败'
    sendJsonResponse(res, 500, null, message, false)
  }
}

/** 判断 path 是否为合法的 /tools/{toolId} 且返回该 toolId，否则返回 null */
export function getToolIdFromPath(urlPath: string): ToolId | null {
  if (!urlPath.startsWith('/tools/') || urlPath.length <= 7) return null
  const segment = urlPath.slice(7)
  if (segment.includes('/')) return null
  const id = segment as ToolId
  return TOOL_METHOD_PATHS.includes(id) ? id : null
}

/**
 * POST /tools/execute
 * Body: { toolId: string, arguments: Record<string, unknown> }
 * 与 OpenClaw 统一入口语义一致，便于决策端同一套工具描述调用桌面执行
 * 推荐优先使用按方法拆开的 POST /tools/read、POST /tools/write 等，与 function calling 一一对应
 */
export async function handleToolsExecuteRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const body = await parseRequestBody(req)
    const toolId = body?.toolId
    const args = body?.arguments

    if (!toolId || typeof toolId !== 'string' || !toolId.trim()) {
      sendJsonResponse(res, 400, null, '参数错误：需要提供 toolId', false)
      return
    }

    ensureToolsInitialized()
    const result = await executeTool(toolId.trim() as ToolId, typeof args === 'object' && args !== null ? args : {})

    const statusCode = result.code ?? (result.success ? 200 : 400)
    sendJsonResponse(
      res,
      statusCode,
      result.data ?? null,
      result.message ?? '',
      result.success
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '工具执行失败'
    sendJsonResponse(res, 500, null, message, false)
  }
}

/**
 * GET /tools/list
 * 返回已注册工具 id 列表，便于决策端发现能力
 */
export function handleToolsListRequest(
  _req: http.IncomingMessage,
  res: http.ServerResponse
): void {
  ensureToolsInitialized()
  const ids = listToolIds()
  sendJsonResponse(res, 200, { toolIds: ids })
}
