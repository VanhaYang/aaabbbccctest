import { BrowserWindow } from 'electron'

/**
 * 基础窗口管理器
 * 提供通用窗口生命周期方法，子类负责具体创建逻辑
 */
export abstract class BaseWindowManager {
  protected window: BrowserWindow | null = null

  protected showExisting(): boolean {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show()
      this.window.focus()
      return true
    }
    return false
  }

  getWindow(): BrowserWindow | null {
    return this.window
  }

  hide(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide()
    }
  }

  close(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close()
    }
  }

  isValid(): boolean {
    return this.window !== null && !this.window.isDestroyed()
  }

  isVisible(): boolean {
    return this.isValid() && this.window!.isVisible()
  }

  destroy(): void {
    if (this.isValid()) {
      this.window!.destroy()
      this.window = null
    }
  }
}
