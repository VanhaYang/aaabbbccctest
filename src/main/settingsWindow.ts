import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { getIconPath, shouldOpenDevTools, loadRendererPage } from './utils'
import { BaseWindowManager } from './window/BaseWindowManager'
import { getWebPreferencesWithPreload } from './window/webPreferences'

/**
 * 设置窗口管理器
 * 负责创建和管理设置窗口
 */
export class SettingsWindowManager extends BaseWindowManager {

  /**
   * 创建设置窗口
   */
  create(): void {
    // 如果窗口已存在，则显示并聚焦
    if (this.showExisting()) {
      return
    }

    // 创建新窗口
    this.window = new BrowserWindow({
      width: 800,
      height: 700,
      minWidth: 600,
      minHeight: 500,
      title: '设置 - Electron Screenshot',
      icon: getIconPath(), // 设置窗口图标
      autoHideMenuBar: true,
      resizable: true,
      frame: true,
      show: false,
      backgroundColor: '#ffffff',
      webPreferences: getWebPreferencesWithPreload(join(__dirname, '../preload/index.js'))
    })

    // 加载页面
    loadRendererPage(this.window, 'settings.html')

    // 窗口准备好后显示
    this.window.once('ready-to-show', () => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.show()
      }
    })

    // 在浏览器中打开外部链接
    this.window.webContents.setWindowOpenHandler(details => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    // 窗口关闭时清理引用
    this.window.on('closed', () => {
      this.window = null
    })

    // 开发者工具（默认关闭，可通过环境变量开启）
    if (shouldOpenDevTools()) {
      this.window.webContents.openDevTools()
    }
  }

  /**
   * 显示设置窗口
   */
  show(): void {
    if (!this.showExisting()) {
      this.create()
    }
  }

  /**
   * 切换窗口显示/隐藏
   */
  toggle(): void {
    if (this.isVisible()) {
      this.hide()
    } else {
      this.show()
    }
  }

  /**
   * 发送消息到设置窗口
   */
  sendMessage(channel: string, ...args: any[]): void {
    if (this.isValid()) {
      this.window!.webContents.send(channel, ...args)
    }
  }

}

// 导出单例
export const settingsWindowManager = new SettingsWindowManager()
