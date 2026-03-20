import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BaseWindowManager } from './BaseWindowManager'
import { DEFAULT_WEB_PREFERENCES, getWebPreferencesWithPreload } from './webPreferences'

/** 测试用子类，用于注入 mock 窗口 */
class TestWindowManager extends BaseWindowManager {
  setWindow(w: ReturnType<typeof createMockWindow>): void {
    this.window = w as any
  }
}

function createMockWindow(overrides: { isDestroyed?: boolean; isVisible?: boolean } = {}) {
  const { isDestroyed = false, isVisible = true } = overrides
  return {
    isDestroyed: () => isDestroyed,
    isVisible: () => isVisible,
    show: vi.fn(),
    focus: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    destroy: vi.fn()
  }
}

describe('BaseWindowManager', () => {
  let manager: TestWindowManager

  beforeEach(() => {
    manager = new TestWindowManager()
  })

  it('getWindow 返回当前窗口，未设置时为 null', () => {
    expect(manager.getWindow()).toBeNull()
    const mock = createMockWindow()
    manager.setWindow(mock)
    expect(manager.getWindow()).toBe(mock)
  })

  it('isValid 在无窗口或已销毁时为 false', () => {
    expect(manager.isValid()).toBe(false)
    manager.setWindow(createMockWindow({ isDestroyed: true }))
    expect(manager.isValid()).toBe(false)
    manager.setWindow(createMockWindow({ isDestroyed: false }))
    expect(manager.isValid()).toBe(true)
  })

  it('isVisible 依赖 isValid 与 window.isVisible', () => {
    expect(manager.isVisible()).toBe(false)
    manager.setWindow(createMockWindow({ isVisible: true }))
    expect(manager.isVisible()).toBe(true)
    manager.setWindow(createMockWindow({ isVisible: false }))
    expect(manager.isVisible()).toBe(false)
  })

  it('showExisting 在窗口存在时调用 show 与 focus 并返回 true', () => {
    const mock = createMockWindow()
    manager.setWindow(mock)
    expect(manager.showExisting()).toBe(true)
    expect(mock.show).toHaveBeenCalled()
    expect(mock.focus).toHaveBeenCalled()
  })

  it('showExisting 在无窗口或已销毁时返回 false', () => {
    expect(manager.showExisting()).toBe(false)
    manager.setWindow(createMockWindow({ isDestroyed: true }))
    expect(manager.showExisting()).toBe(false)
  })

  it('hide 调用 window.hide', () => {
    const mock = createMockWindow()
    manager.setWindow(mock)
    manager.hide()
    expect(mock.hide).toHaveBeenCalled()
  })

  it('close 调用 window.close', () => {
    const mock = createMockWindow()
    manager.setWindow(mock)
    manager.close()
    expect(mock.close).toHaveBeenCalled()
  })

  it('destroy 调用 window.destroy 并置空引用', () => {
    const mock = createMockWindow()
    manager.setWindow(mock)
    manager.destroy()
    expect(mock.destroy).toHaveBeenCalled()
    expect(manager.getWindow()).toBeNull()
    expect(manager.isValid()).toBe(false)
  })
})

describe('webPreferences', () => {
  it('DEFAULT_WEB_PREFERENCES 包含 contextIsolation: true, nodeIntegration: false', () => {
    expect(DEFAULT_WEB_PREFERENCES.contextIsolation).toBe(true)
    expect(DEFAULT_WEB_PREFERENCES.nodeIntegration).toBe(false)
    expect(DEFAULT_WEB_PREFERENCES.sandbox).toBe(false)
  })

  it('getWebPreferencesWithPreload 返回带 preload 的默认选项', () => {
    const preloadPath = '/path/to/preload.js'
    const prefs = getWebPreferencesWithPreload(preloadPath)
    expect(prefs.preload).toBe(preloadPath)
    expect(prefs.contextIsolation).toBe(true)
    expect(prefs.nodeIntegration).toBe(false)
  })
})
