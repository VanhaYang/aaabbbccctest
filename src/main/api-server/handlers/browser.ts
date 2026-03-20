import type http from 'http'
import { parseRequestBody, sendJsonResponse } from '../utils'
import {
  internalBrowserNavigate,
  internalBrowserSnapshot,
  internalBrowserScreenshot,
  internalBrowserAct
} from '../../services/internalBrowserService'

/**
 * POST /browser/navigate
 * 内部浏览器：加载 URL，与 OpenClaw POST /navigate 参数一致
 */
export async function handleBrowserNavigate(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const body = await parseRequestBody(req)
    const url = typeof body?.url === 'string' ? body.url.trim() : ''
    const targetId = typeof body?.targetId === 'string' ? body.targetId.trim() : undefined
    if (!url) {
      sendJsonResponse(res, 400, null, 'url is required', false)
      return
    }
    const result = await internalBrowserNavigate(url, targetId)
    sendJsonResponse(res, 200, { ok: result.ok, targetId: result.targetId })
  } catch (error) {
    const message = error instanceof Error ? error.message : '导航失败'
    sendJsonResponse(res, 500, null, message, false)
  }
}

/**
 * GET /browser/snapshot
 * 内部浏览器：页面快照，与 OpenClaw GET /snapshot 参数对齐
 */
export async function handleBrowserSnapshot(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const url = req.url || ''
    const query = url.includes('?') ? new URLSearchParams(url.slice(url.indexOf('?') + 1)) : null
    const targetId = query?.get('targetId') ?? undefined
    const format = (query?.get('format') === 'aria' || query?.get('format') === 'ai') ? query.get('format') as 'aria' | 'ai' : undefined
    const maxCharsRaw = query?.get('maxChars')
    const maxChars = maxCharsRaw ? parseInt(maxCharsRaw, 10) : undefined

    const result = await internalBrowserSnapshot({
      targetId,
      format: format ?? 'ai',
      maxChars: Number.isFinite(maxChars) ? maxChars! : undefined
    })
    const payload: Record<string, unknown> = { ...result }
    if (result.browserContextRecreated !== undefined) payload.browserContextRecreated = result.browserContextRecreated
    if (result.message !== undefined) payload.message = result.message
    sendJsonResponse(res, 200, payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : '快照失败'
    sendJsonResponse(res, 500, null, message, false)
  }
}

/**
 * POST /browser/screenshot
 * 内部浏览器：页面截图，与 OpenClaw POST /screenshot 参数一致
 */
export async function handleBrowserScreenshot(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const body = await parseRequestBody(req)
    const targetId = typeof body?.targetId === 'string' ? body.targetId : undefined
    const fullPage = body?.fullPage === true
    const ref = typeof body?.ref === 'string' ? body.ref : undefined
    const element = typeof body?.element === 'string' ? body.element : undefined
    const type = body?.type === 'jpeg' ? 'jpeg' as const : 'png' as const

    const result = await internalBrowserScreenshot({
      targetId,
      fullPage,
      ref,
      element,
      type
    })
    const payload: Record<string, unknown> = {
      ok: result.ok,
      targetId: result.targetId,
      path: result.path,
      imageBase64: result.imageBase64,
      mimeType: result.mimeType
    }
    if (result.browserContextRecreated !== undefined) payload.browserContextRecreated = result.browserContextRecreated
    if (result.message !== undefined) payload.message = result.message
    sendJsonResponse(res, 200, payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : '截图失败'
    sendJsonResponse(res, 500, null, message, false)
  }
}

/**
 * POST /browser/act
 * 内部浏览器：页面操作，与 OpenClaw POST /act 参数一致
 */
export async function handleBrowserAct(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const body = await parseRequestBody(req)
    const kind = typeof body?.kind === 'string' ? body.kind : ''
    if (!kind) {
      sendJsonResponse(res, 400, null, 'kind is required', false)
      return
    }
    const targetId = typeof body?.targetId === 'string' ? body.targetId : undefined
    const ref = typeof body?.ref === 'string' ? body.ref : undefined
    const text = typeof body?.text === 'string' ? body.text : undefined
    const key = typeof body?.key === 'string' ? body.key : undefined
    const value = typeof body?.value === 'string' ? body.value : undefined
    const button = typeof body?.button === 'string' ? body.button : undefined
    const doubleClick = body?.doubleClick === true
    const modifiers = Array.isArray(body?.modifiers) ? body.modifiers.filter((m: unknown) => typeof m === 'string') as string[] : undefined
    const submit = body?.submit === true
    const slowly = body?.slowly === true
    const timeoutMs = typeof body?.timeoutMs === 'number' ? body.timeoutMs : undefined
    const delayMs = typeof body?.delayMs === 'number' ? body.delayMs : undefined

    const result = await internalBrowserAct({
      kind,
      targetId,
      ref,
      text,
      key,
      value,
      button,
      doubleClick,
      modifiers,
      submit,
      slowly,
      timeoutMs,
      delayMs
    })
    const payload: Record<string, unknown> = { ok: result.ok, targetId: result.targetId }
    if (result.browserContextRecreated !== undefined) payload.browserContextRecreated = result.browserContextRecreated
    if (result.message !== undefined) payload.message = result.message
    sendJsonResponse(res, 200, payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : '操作失败'
    sendJsonResponse(res, 500, null, message, false)
  }
}
