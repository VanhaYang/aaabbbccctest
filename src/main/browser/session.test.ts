/**
 * Playwright 会话层测试：navigate / snapshot / screenshot / act（mock Playwright）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  connectBrowser,
  getDefaultPage,
  navigate,
  snapshot,
  screenshot,
  act,
  clearBrowserCache
} from './session'

const { mockPage, mockContext, mockBrowser } = vi.hoisted(() => {
  const page = {
    goto: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue({ snapshot: 'e1 div', refs: { e1: { role: 'div', name: '' } }, full: 'hello' }),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('png')),
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    hover: vi.fn().mockResolvedValue(undefined),
    keyboard: { press: vi.fn().mockResolvedValue(undefined) },
    $: vi.fn().mockResolvedValue(null),
    selectOption: vi.fn().mockResolvedValue(undefined)
  }
  const context = {
    pages: vi.fn().mockReturnValue([page]),
    newPage: vi.fn().mockResolvedValue(page)
  }
  const browser = {
    contexts: vi.fn().mockReturnValue([context]),
    newContext: vi.fn().mockResolvedValue(context),
    isConnected: vi.fn().mockReturnValue(true),
    on: vi.fn()
  }
  return { mockPage: page, mockContext: context, mockBrowser: browser }
})

vi.mock('playwright-core', () => ({
  chromium: {
    connectOverCDP: vi.fn().mockResolvedValue(mockBrowser)
  }
}))

describe('browser/session', () => {
  beforeEach(() => {
    clearBrowserCache()
    vi.mocked(mockPage.goto).mockClear()
    vi.mocked(mockPage.evaluate).mockClear()
    vi.mocked(mockPage.screenshot).mockClear()
    vi.mocked(mockPage.click).mockClear()
    vi.mocked(mockPage.fill).mockClear()
    vi.mocked(mockPage.hover).mockClear()
    vi.mocked(mockPage.keyboard.press).mockClear()
  })

  afterEach(() => {
    clearBrowserCache()
  })

  describe('connectBrowser', () => {
    it('连接 CDP 并返回 browser', async () => {
      const browser = await connectBrowser('http://127.0.0.1:9321')
      expect(browser).toBe(mockBrowser)
    })
  })

  describe('getDefaultPage', () => {
    it('返回已有 context 的第一个 page', async () => {
      const browser = await connectBrowser('http://127.0.0.1:9321')
      const page = await getDefaultPage(browser)
      expect(page).toBe(mockPage)
      expect(mockContext.pages).toHaveBeenCalled()
    })
  })

  describe('navigate', () => {
    it('调用 page.goto 并返回 ok + targetId', async () => {
      const result = await navigate(mockPage as any, 'https://example.com')
      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', expect.any(Object))
      expect(result).toEqual({ ok: true, targetId: 'default' })
    })
  })

  describe('snapshot', () => {
    it('调用 page.evaluate 并返回 snapshot/refs/full', async () => {
      const result = await snapshot(mockPage as any, { maxChars: 1000 })
      expect(mockPage.evaluate).toHaveBeenCalled()
      expect(result.snapshot).toBeDefined()
      expect(result.refs).toEqual({ e1: { role: 'div', name: '' } })
      expect(result.full).toBe('hello')
    })
  })

  describe('screenshot', () => {
    it('无选项时调用 page.screenshot 返回 buffer', async () => {
      const result = await screenshot(mockPage as any)
      expect(mockPage.screenshot).toHaveBeenCalledWith({ fullPage: false, type: 'png' })
      expect(result.buffer).toBeInstanceOf(Buffer)
      expect(result.contentType).toBe('image/png')
    })

    it('fullPage 为 true 时传 fullPage', async () => {
      await screenshot(mockPage as any, { fullPage: true })
      expect(mockPage.screenshot).toHaveBeenCalledWith(
        expect.objectContaining({ fullPage: true })
      )
    })

    it('type 为 jpeg 时返回 jpeg', async () => {
      const result = await screenshot(mockPage as any, { type: 'jpeg' })
      expect(mockPage.screenshot).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'jpeg' })
      )
      expect(result.contentType).toBe('image/jpeg')
    })
  })

  describe('act', () => {
    it('kind=click 且 ref 存在时调用 page.click', async () => {
      const result = await act(mockPage as any, {
        kind: 'click',
        ref: 'e1',
        button: 'left'
      })
      expect(mockPage.click).toHaveBeenCalledWith(
        '[data-aria-ref="e1"]',
        expect.objectContaining({ button: 'left', clickCount: 1 })
      )
      expect(result).toEqual({ ok: true })
    })

    it('kind=type 时调用 page.fill 并可 submit', async () => {
      await act(mockPage as any, {
        kind: 'type',
        ref: 'e1',
        text: 'hello',
        submit: true
      })
      expect(mockPage.fill).toHaveBeenCalledWith('[data-aria-ref="e1"]', 'hello')
      expect(mockPage.keyboard.press).toHaveBeenCalledWith('Enter')
    })

    it('kind=fill 时调用 page.fill', async () => {
      await act(mockPage as any, {
        kind: 'fill',
        ref: 'e2',
        value: 'value'
      })
      expect(mockPage.fill).toHaveBeenCalledWith('[data-aria-ref="e2"]', 'value')
    })

    it('kind=press 时调用 keyboard.press', async () => {
      await act(mockPage as any, { kind: 'press', key: 'Enter' })
      expect(mockPage.keyboard.press).toHaveBeenCalledWith('Enter')
    })

    it('kind=hover 时调用 page.hover', async () => {
      await act(mockPage as any, { kind: 'hover', ref: 'e1' })
      expect(mockPage.hover).toHaveBeenCalledWith('[data-aria-ref="e1"]')
    })
  })
})
