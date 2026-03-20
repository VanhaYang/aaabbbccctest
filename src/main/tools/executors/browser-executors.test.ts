/**
 * 浏览器工具执行器测试：browser_navigate、browser_snapshot、browser_screenshot、browser_act
 * 通过 mock 项目内 browser 与 externalBrowserProxy，不启动真实 Chrome
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { browser_navigate } from './browser-navigate'
import { browser_snapshot } from './browser-snapshot'
import { browser_screenshot } from './browser-screenshot'
import { browser_act } from './browser-act'

const externalNavigateMock = vi.fn()
const externalSnapshotMock = vi.fn()
const externalScreenshotMock = vi.fn()
const externalActMock = vi.fn()
const isConfiguredMock = vi.fn()

vi.mock('../../services/externalBrowserProxy', () => ({
  isExternalBrowserConfigured: () => isConfiguredMock(),
  externalBrowserNavigate: (...args: unknown[]) => externalNavigateMock(...args),
  externalBrowserSnapshot: (...args: unknown[]) => externalSnapshotMock(...args),
  externalBrowserScreenshot: (...args: unknown[]) => externalScreenshotMock(...args),
  externalBrowserAct: (...args: unknown[]) => externalActMock(...args)
}))

describe('tools/executors/browser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isConfiguredMock.mockReturnValue(true)
  })

  describe('browser_navigate', () => {
    it('未启用浏览器控制时返回 503', async () => {
      isConfiguredMock.mockReturnValue(false)
      const result = await browser_navigate({ url: 'https://example.com' })
      expect(result.success).toBe(false)
      expect(result.code).toBe(503)
      expect(result.message).toContain('browser.enabled')
      expect(externalNavigateMock).not.toHaveBeenCalled()
    })

    it('缺少 url 时返回 400', async () => {
      const result = await browser_navigate({})
      expect(result.success).toBe(false)
      expect(result.code).toBe(400)
      expect(result.message).toContain('url')
      expect(externalNavigateMock).not.toHaveBeenCalled()
    })

    it('url 为空字符串时返回 400', async () => {
      const result = await browser_navigate({ url: '   ' })
      expect(result.success).toBe(false)
      expect(result.code).toBe(400)
    })

    it('启用且参数正确时调用代理并返回成功', async () => {
      externalNavigateMock.mockResolvedValue({ ok: true, targetId: 'default' })
      const result = await browser_navigate({
        url: 'https://example.com',
        targetId: 't1'
      })
      expect(externalNavigateMock).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://example.com', targetId: 't1' })
      )
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ ok: true, targetId: 'default' })
    })

    it('代理抛错时返回 500', async () => {
      externalNavigateMock.mockRejectedValue(new Error('launch failed'))
      const result = await browser_navigate({ url: 'https://x.com' })
      expect(result.success).toBe(false)
      expect(result.code).toBe(500)
      expect(result.message).toContain('launch failed')
    })
  })

  describe('browser_snapshot', () => {
    it('未启用时返回 503', async () => {
      isConfiguredMock.mockReturnValue(false)
      const result = await browser_snapshot({})
      expect(result.success).toBe(false)
      expect(result.code).toBe(503)
      expect(externalSnapshotMock).not.toHaveBeenCalled()
    })

    it('启用时调用代理并返回 data', async () => {
      externalSnapshotMock.mockResolvedValue({ snapshot: 'e1 div', refs: {} })
      const result = await browser_snapshot({ maxChars: 1000 })
      expect(externalSnapshotMock).toHaveBeenCalled()
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ snapshot: 'e1 div', refs: {} })
    })
  })

  describe('browser_screenshot', () => {
    it('未启用时返回 503', async () => {
      isConfiguredMock.mockReturnValue(false)
      const result = await browser_screenshot({})
      expect(result.success).toBe(false)
      expect(result.code).toBe(503)
    })

    it('启用时调用代理并返回 data', async () => {
      externalScreenshotMock.mockResolvedValue({
        ok: true,
        path: '/tmp/s.png',
        imageBase64: 'abc',
        mimeType: 'image/png'
      })
      const result = await browser_screenshot({
        fullPage: true,
        type: 'png'
      })
      expect(externalScreenshotMock).toHaveBeenCalledWith(
        expect.objectContaining({ fullPage: true, type: 'png' })
      )
      expect(result.success).toBe(true)
      expect((result.data as { path: string }).path).toBe('/tmp/s.png')
    })
  })

  describe('browser_act', () => {
    it('未启用时返回 503', async () => {
      isConfiguredMock.mockReturnValue(false)
      const result = await browser_act({ kind: 'click', ref: 'e1' })
      expect(result.success).toBe(false)
      expect(result.code).toBe(503)
      expect(externalActMock).not.toHaveBeenCalled()
    })

    it('缺少 kind 时返回 400', async () => {
      const result = await browser_act({})
      expect(result.success).toBe(false)
      expect(result.code).toBe(400)
      expect(result.message).toContain('kind')
      expect(externalActMock).not.toHaveBeenCalled()
    })

    it('kind 为空字符串时返回 400', async () => {
      const result = await browser_act({ kind: '   ' })
      expect(result.success).toBe(false)
      expect(result.code).toBe(400)
    })

    it('启用且 kind/ref 正确时调用代理', async () => {
      externalActMock.mockResolvedValue({ ok: true, targetId: 'default' })
      const result = await browser_act({
        kind: 'click',
        ref: 'e1',
        button: 'left',
        doubleClick: false
      })
      expect(externalActMock).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'click',
          ref: 'e1',
          button: 'left',
          doubleClick: false
        })
      )
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ ok: true, targetId: 'default' })
    })
  })
})
