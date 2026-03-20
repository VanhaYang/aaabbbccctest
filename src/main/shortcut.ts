import { globalShortcut } from 'electron'
import log from './logger'
import { screenshotManager } from './screenshot'

/**
 * 全局快捷键管理模块
 */

export class ShortcutManager {
  private screenshotShortcut = ''

  /**
   * 注册所有快捷键
   */
  registerAll(): void {
    this.registerScreenshotShortcut()
  }

  /**
   * 注册截图快捷键
   */
  private registerScreenshotShortcut(): void {
    // Windows/Linux: Ctrl+Alt+A
    // macOS: Command+Shift+A (因为 Command+Alt 在 macOS 上可能有冲突)
    this.screenshotShortcut = process.platform === 'darwin' ? 'Command+Shift+A' : 'Ctrl+Alt+A'

    try {
      const ret = globalShortcut.register(this.screenshotShortcut, () => {

        // 调用截图逻辑
        screenshotManager.startCapture().catch(error => {
          log.error('快捷键触发截图失败:', error)
        })
      })

      if (ret) {
      } else {
        log.error(`快捷键注册失败: ${this.screenshotShortcut}`)
      }
    } catch (error) {
      log.error('注册快捷键时发生错误:', error)
    }
  }

  /**
   * 检查快捷键是否已注册
   */
  isRegistered(): boolean {
    return globalShortcut.isRegistered(this.screenshotShortcut)
  }

  /**
   * 注销所有快捷键
   */
  unregisterAll(): void {
    globalShortcut.unregisterAll()
  }
}

export const shortcutManager = new ShortcutManager()
