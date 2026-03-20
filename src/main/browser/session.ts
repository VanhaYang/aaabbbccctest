/**
 * Playwright 连接与会话：navigate / snapshot / screenshot / act
 * 行为与 OpenClaw browser 的 agent 接口一致，便于后续同步迁移
 */
import { chromium, type Browser, type Page } from 'playwright-core'
import log from '../logger'

let cachedBrowser: Browser | null = null
let cachedCdpUrl: string | null = null

export async function connectBrowser(cdpUrl: string): Promise<Browser> {
  if (cachedBrowser && cachedCdpUrl === cdpUrl) {
    if (cachedBrowser.isConnected()) return cachedBrowser
    cachedBrowser = null
    cachedCdpUrl = null
  }
  const timeout = 10000
  const browser = await chromium.connectOverCDP(cdpUrl, { timeout })
  cachedBrowser = browser
  cachedCdpUrl = cdpUrl
  browser.on('disconnected', () => {
    if (cachedBrowser === browser) {
      cachedBrowser = null
      cachedCdpUrl = null
    }
  })
  return browser
}

export async function getDefaultPage(browser: Browser): Promise<Page> {
  const contexts = browser.contexts()
  const pages = contexts.flatMap(c => c.pages())
  if (pages.length > 0) return pages[0]
  const context = contexts[0] ?? await browser.newContext()
  return context.newPage()
}

export async function navigate(page: Page, url: string): Promise<{ ok: boolean; targetId: string }> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  return { ok: true, targetId: 'default' }
}

/** 与 OpenClaw snapshot 语义一致：返回可访问性快照与 refs（e1, e2...） */
export async function snapshot(page: Page, options?: { maxChars?: number }): Promise<{
  snapshot?: string
  refs?: Record<string, { role: string; name?: string }>
  full?: string
}> {
  const maxChars = options?.maxChars ?? 50000
  const result = await page.evaluate(
    ({ maxChars: limit }) => {
      function getRoleAndName(el: Element): { role: string; name: string } {
        const role = (el.getAttribute && el.getAttribute('role')) || (el.tagName && (el.tagName as string).toLowerCase()) || 'unknown'
        const name =
          (el.getAttribute && ((el.getAttribute('aria-label') as string) || (el.getAttribute('title') as string))) ||
          (el as HTMLElement).innerText?.trim().slice(0, 80) ||
          ''
        return { role, name }
      }
      const refs: Record<string, { role: string; name?: string }> = {}
      function walk(root: Element, depth: number, prefix: string): string[] {
        if (depth > 10) return []
        const out: string[] = []
        const children = Array.from(root.children || [])
        children.forEach((el, i) => {
          const rn = getRoleAndName(el)
          const ref = prefix + (i + 1)
          refs[ref] = { role: rn.role, name: rn.name || undefined }
          try {
            ;(el as HTMLElement).setAttribute?.('data-aria-ref', ref)
          } catch {}
          out.push(ref + ' ' + rn.role + (rn.name ? ' "' + rn.name.replace(/"/g, '') + '"' : ''))
          out.push(...walk(el, depth + 1, ref + '.'))
        })
        return out
      }
      const body = document.body
      if (!body) return { snapshot: '', refs, full: '' }
      const lines = walk(body, 0, 'e')
      const snapshot = lines.join('\n').slice(0, limit)
      const full = (body.innerText || body.textContent || '').trim().slice(0, limit)
      return { snapshot, refs, full }
    },
    { maxChars }
  )
  return result
}

export async function screenshot(page: Page, options?: {
  fullPage?: boolean
  ref?: string
  element?: string
  type?: 'png' | 'jpeg'
}): Promise<{ buffer: Buffer; contentType: string }> {
  const imageType = options?.type === 'jpeg' ? 'jpeg' : 'png'
  if (options?.ref || options?.element) {
    const selector = options.element || (options.ref ? `[data-aria-ref="${options.ref}"]` : '')
    if (selector) {
      const el = await page.$(selector)
      if (el) {
        const buf = await el.screenshot({ type: imageType })
        await el.dispose()
        return {
          buffer: Buffer.from(buf),
          contentType: imageType === 'jpeg' ? 'image/jpeg' : 'image/png'
        }
      }
    }
  }
  const buf = await page.screenshot({
    fullPage: options?.fullPage ?? false,
    type: imageType
  })
  return {
    buffer: Buffer.from(buf),
    contentType: imageType === 'jpeg' ? 'image/jpeg' : 'image/png'
  }
}

export async function act(
  page: Page,
  params: {
    kind: string
    ref?: string
    text?: string
    key?: string
    value?: string
    button?: string
    doubleClick?: boolean
    submit?: boolean
  }
): Promise<{ ok: boolean }> {
  const kind = params.kind.toLowerCase()
  const selector = params.ref ? `[data-aria-ref="${params.ref}"]` : null

  if (kind === 'click' && selector) {
    const opts = { button: (params.button as 'left' | 'right') || 'left', clickCount: params.doubleClick ? 2 : 1 }
    await page.click(selector, opts)
    return { ok: true }
  }
  if (kind === 'type' && selector && params.text != null) {
    await page.fill(selector, params.text)
    if (params.submit) {
      await page.keyboard.press('Enter')
    }
    return { ok: true }
  }
  if (kind === 'fill' && selector && params.value != null) {
    await page.fill(selector, params.value)
    return { ok: true }
  }
  if (kind === 'press' && params.key) {
    await page.keyboard.press(params.key)
    return { ok: true }
  }
  if (kind === 'hover' && selector) {
    await page.hover(selector)
    return { ok: true }
  }
  if (kind === 'select' && selector && params.value != null) {
    await page.selectOption(selector, params.value)
    return { ok: true }
  }
  log.warn('[Browser] act kind not implemented:', kind)
  return { ok: true }
}

export function clearBrowserCache(): void {
  cachedBrowser = null
  cachedCdpUrl = null
}
