/**
 * 项目内浏览器控制（Playwright + 本机 Chrome）
 * 与 OpenClaw browser 的 navigate/snapshot/screenshot/act 行为一致，无外部 OpenClaw 依赖
 */
import { configManager } from '../configManager'
import { ensureChromeLaunched } from './launch'
import { connectBrowser, getDefaultPage, navigate, snapshot, screenshot, act } from './session'

export type BrowserConfig = {
  enabled?: boolean
  executablePath?: string
  userDataDir?: string
  port?: number
  headless?: boolean
}

function getBrowserConfig(): BrowserConfig {
  const cfg = configManager.getConfig()
  return (cfg as { browser?: BrowserConfig }).browser ?? {}
}

export function isBrowserControlEnabled(): boolean {
  const c = getBrowserConfig()
  return c.enabled !== false
}

async function ensurePage(): Promise<{ page: Awaited<ReturnType<typeof getDefaultPage>>; cdpUrl: string }> {
  const c = getBrowserConfig()
  if (!isBrowserControlEnabled()) {
    throw new Error('浏览器控制未启用：请在配置中设置 browser.enabled 为 true')
  }
  const { cdpUrl } = await ensureChromeLaunched({
    executablePath: c.executablePath,
    userDataDir: c.userDataDir,
    port: c.port,
    headless: c.headless
  })
  const browser = await connectBrowser(cdpUrl)
  const page = await getDefaultPage(browser)
  return { page, cdpUrl }
}

export async function playwrightNavigate(params: {
  url: string
  targetId?: string
}): Promise<{ ok: boolean; targetId: string }> {
  const { page } = await ensurePage()
  return navigate(page, params.url)
}

export async function playwrightSnapshot(params?: {
  targetId?: string
  format?: string
  maxChars?: number
}): Promise<{ snapshot?: string; refs?: Record<string, { role: string; name?: string }>; full?: string }> {
  const { page } = await ensurePage()
  return snapshot(page, { maxChars: params?.maxChars })
}

export async function playwrightScreenshot(params?: {
  targetId?: string
  fullPage?: boolean
  ref?: string
  element?: string
  type?: 'png' | 'jpeg'
}): Promise<{ buffer: Buffer; contentType: string; path?: string }> {
  const { page } = await ensurePage()
  const result = await screenshot(page, {
    fullPage: params?.fullPage,
    ref: params?.ref,
    element: params?.element,
    type: params?.type === 'jpeg' ? 'jpeg' : 'png'
  })
  return result
}

export async function playwrightAct(params: {
  kind: string
  targetId?: string
  ref?: string
  text?: string
  key?: string
  value?: string
  button?: string
  doubleClick?: boolean
  submit?: boolean
}): Promise<{ ok: boolean }> {
  const { page } = await ensurePage()
  return act(page, {
    kind: params.kind,
    ref: params.ref,
    text: params.text,
    key: params.key,
    value: params.value,
    button: params.button,
    doubleClick: params.doubleClick,
    submit: params.submit
  })
}

export { ensureChromeLaunched, getRunningChrome, stopChrome } from './launch'
export { resolveChromeExecutable } from './executable'
