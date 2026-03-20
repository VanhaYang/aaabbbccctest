/**
 * browser_* 工具执行层：在项目内通过 Playwright + 本机 Chrome 实现，不依赖外部 OpenClaw
 * 与 OpenClaw browser 的 参数/响应 约定一致，便于后续同步迁移
 */
import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'
import {
  isBrowserControlEnabled,
  playwrightNavigate,
  playwrightSnapshot,
  playwrightScreenshot,
  playwrightAct
} from '../browser'

export function isExternalBrowserConfigured(): boolean {
  return isBrowserControlEnabled()
}

export async function externalBrowserNavigate(params: {
  url: string
  targetId?: string
  profile?: string
  timeoutMs?: number
  authToken?: string
}): Promise<{ ok: boolean; targetId?: string }> {
  const result = await playwrightNavigate({ url: params.url, targetId: params.targetId })
  return { ok: result.ok, targetId: result.targetId }
}

export async function externalBrowserSnapshot(params: {
  targetId?: string
  format?: string
  mode?: string
  maxChars?: number
  profile?: string
  timeoutMs?: number
  authToken?: string
}): Promise<unknown> {
  const result = await playwrightSnapshot({
    targetId: params.targetId,
    maxChars: params.maxChars
  })
  return result
}

export async function externalBrowserScreenshot(params: {
  targetId?: string
  fullPage?: boolean
  ref?: string
  element?: string
  type?: 'png' | 'jpeg'
  profile?: string
  timeoutMs?: number
  authToken?: string
}): Promise<unknown> {
  const result = await playwrightScreenshot({
    targetId: params.targetId,
    fullPage: params.fullPage,
    ref: params.ref,
    element: params.element,
    type: params.type === 'jpeg' ? 'jpeg' : 'png'
  })
  const dir = path.join(app.getPath('temp'), 'electron-screenshot-browser')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const ext = result.contentType === 'image/jpeg' ? '.jpg' : '.png'
  const filePath = path.join(dir, `screenshot-${Date.now()}${ext}`)
  fs.writeFileSync(filePath, result.buffer)
  return {
    ok: true,
    targetId: 'default',
    path: filePath,
    imageBase64: result.buffer.toString('base64'),
    mimeType: result.contentType
  }
}

export async function externalBrowserAct(params: {
  kind: string
  targetId?: string
  ref?: string
  text?: string
  key?: string
  value?: string
  button?: string
  doubleClick?: boolean
  modifiers?: string[]
  submit?: boolean
  slowly?: boolean
  timeoutMs?: number
  delayMs?: number
  profile?: string
  authToken?: string
}): Promise<unknown> {
  const result = await playwrightAct({
    kind: params.kind,
    targetId: params.targetId,
    ref: params.ref,
    text: params.text,
    key: params.key,
    value: params.value,
    button: params.button,
    doubleClick: params.doubleClick,
    submit: params.submit
  })
  return { ok: result.ok, targetId: 'default' }
}
