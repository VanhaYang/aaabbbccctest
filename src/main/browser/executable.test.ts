/**
 * 浏览器可执行路径解析测试
 * 通过 mock fs 控制 existsSync，避免 ESM 下 spy 不可用
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as path from 'path'
import {
  resolveChromeExecutable,
  findChromeExecutableWindows,
  findChromeExecutableMac,
  findChromeExecutableLinux
} from './executable'

const existsSyncMock = vi.fn()
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    existsSync: (p: string) => existsSyncMock(p)
  }
})

describe('browser/executable', () => {
  const originalPlatform = process.platform

  afterEach(() => {
    existsSyncMock.mockReset()
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
  })

  describe('resolveChromeExecutable', () => {
    it('未传 customPath 时按当前平台查找', () => {
      existsSyncMock.mockReturnValue(false)
      const result = resolveChromeExecutable()
      expect(result).toBe(null)
    })

    it('customPath 为空字符串时按平台查找', () => {
      existsSyncMock.mockReturnValue(false)
      expect(resolveChromeExecutable('')).toBe(null)
      expect(resolveChromeExecutable('   ')).toBe(null)
    })

    it('customPath 指定且文件存在时返回解析后的绝对路径', () => {
      const custom = path.join(path.sep, 'custom', 'chrome.exe')
      const resolved = path.resolve(custom)
      existsSyncMock.mockImplementation((p: string) => p === resolved)
      const result = resolveChromeExecutable(custom)
      expect(result).toBe(resolved)
    })

    it('customPath 指定但文件不存在时返回 null', () => {
      existsSyncMock.mockReturnValue(false)
      const result = resolveChromeExecutable('/nonexistent/chrome.exe')
      expect(result).toBe(null)
    })

    it('customPath 去除首尾空格后解析', () => {
      const custom = path.join(path.sep, 'my', 'chrome')
      const resolved = path.resolve(custom)
      existsSyncMock.mockImplementation((p: string) => p === resolved)
      expect(resolveChromeExecutable('  /my/chrome  ')).toBe(resolved)
    })
  })

  describe('findChromeExecutableWindows', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    })

    it('无任何候选路径存在时返回 null', () => {
      existsSyncMock.mockReturnValue(false)
      expect(findChromeExecutableWindows()).toBe(null)
    })

    it('第一个候选存在时返回该路径', () => {
      const first = path.win32.join(
        process.env.LOCALAPPDATA ?? '',
        'Google',
        'Chrome',
        'Application',
        'chrome.exe'
      )
      existsSyncMock.mockImplementation((p: string) => p === first)
      expect(findChromeExecutableWindows()).toBe(first)
    })
  })

  describe('findChromeExecutableMac', () => {
    it('无候选存在时返回 null', () => {
      existsSyncMock.mockReturnValue(false)
      expect(findChromeExecutableMac()).toBe(null)
    })

    it('存在 /Applications/Google Chrome.app 时返回其路径', () => {
      const p = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      existsSyncMock.mockImplementation((filePath: string) => filePath === p)
      expect(findChromeExecutableMac()).toBe(p)
    })
  })

  describe('findChromeExecutableLinux', () => {
    it('无候选存在时返回 null', () => {
      existsSyncMock.mockReturnValue(false)
      expect(findChromeExecutableLinux()).toBe(null)
    })

    it('存在 /usr/bin/chromium 时返回该路径', () => {
      const p = '/usr/bin/chromium'
      existsSyncMock.mockImplementation((filePath: string) => filePath === p)
      expect(findChromeExecutableLinux()).toBe(p)
    })
  })
})
