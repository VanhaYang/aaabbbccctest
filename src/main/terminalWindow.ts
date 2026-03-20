import { BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { getIconPath, shouldOpenDevTools, loadRendererPage } from './utils'
import { configManager } from './configManager'
import { settingsWindowManager } from './settingsWindow'
import { BaseWindowManager } from './window/BaseWindowManager'
import { getWebPreferencesWithPreload } from './window/webPreferences'

/**
 * 终端窗口管理器
 * 负责创建和管理终端窗口
 */
export class TerminalWindowManager extends BaseWindowManager {

  /**
   * 创建终端窗口
   */
  create(): void {
    // 检查工作区路径
    const workspacePath = configManager.getWorkspacePath()
    if (!workspacePath) {
      // 如果没有工作区路径，显示提示对话框
      dialog.showMessageBox({
        type: 'warning',
        title: '无法打开终端',
        message: '未配置工作区路径',
        detail: '请先在设置中配置工作区路径，然后才能使用终端功能。',
        buttons: ['打开设置', '取消'],
        defaultId: 0,
        cancelId: 1
      }).then(result => {
        if (result.response === 0) {
          // 用户选择打开设置，打开设置窗口
          settingsWindowManager.show()
        }
      })
      return
    }

    // 如果窗口已存在，则显示并聚焦
    if (this.showExisting()) {
      return
    }

    // 创建新窗口
    this.window = new BrowserWindow({
      width: 1000,
      height: 700,
      minWidth: 800,
      minHeight: 500,
      title: '智能终端 - Electron Screenshot',
      icon: getIconPath(), // 设置窗口图标
      autoHideMenuBar: true,
      resizable: true,
      frame: true,
      show: false,
      backgroundColor: '#1e1e1e', // 深色背景，匹配终端主题
      webPreferences: {
        ...getWebPreferencesWithPreload(join(__dirname, '../preload/index.js')),
        webSecurity: true
      }
    })

    // 加载页面
    loadRendererPage(this.window, 'terminal.html')

    // 窗口准备好后显示
    this.window.once('ready-to-show', () => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.show()
      }
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
   * 显示终端窗口
   */
  show(): void {
    if (!this.showExisting()) {
      this.create()
    }
  }
}

// 导出单例
export const terminalWindowManager = new TerminalWindowManager()

