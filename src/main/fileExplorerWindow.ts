import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import { filePermissionManager } from './filePermission'
import log from './logger'
import { getIconPath, shouldOpenDevTools, loadRendererPage } from './utils'
import { BaseWindowManager } from './window/BaseWindowManager'
import { getWebPreferencesWithPreload } from './window/webPreferences'

/**
 * 文件管理器窗口管理器
 * 负责创建和管理文件管理器窗口
 */
export class FileExplorerWindowManager extends BaseWindowManager {
  private fileWatcher: fs.FSWatcher | null = null
  private watchedPath: string | null = null

  /**
   * 创建文件管理器窗口
   */
  create(): void {
    // 如果窗口已存在，则显示并聚焦
    if (this.window && !this.window.isDestroyed()) {
      this.window.show()
      this.window.focus()
      return
    }

    // 检查工作区是否已配置
    const workspacePath = filePermissionManager.getWorkspacePath()
    if (!workspacePath) {
      // 如果没有配置工作区，可以显示提示或打开设置窗口
      // 这里先创建窗口，由渲染进程处理提示
    }

    // 创建新窗口
    this.window = new BrowserWindow({
      width: 1000,
      height: 700,
      minWidth: 800,
      minHeight: 600,
      title: '文件管理器 - Electron Screenshot',
      icon: getIconPath(), // 设置窗口图标
      autoHideMenuBar: true,
      resizable: true,
      frame: true,
      show: false,
      backgroundColor: '#ffffff',
      webPreferences: {
        ...getWebPreferencesWithPreload(join(__dirname, '../preload/index.js')),
        webSecurity: true
      }
    })

    // 启用文件拖拽（默认已启用，但明确设置以确保兼容性）
    // Electron 默认支持从系统资源管理器拖拽文件到窗口

    // 加载页面
    loadRendererPage(this.window, 'file-explorer.html')

    // 窗口准备好后显示
    this.window.once('ready-to-show', () => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.show()
        this.window.focus()
      }
    })

    // 在浏览器中打开外部链接
    this.window.webContents.setWindowOpenHandler(details => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    // 窗口关闭时清理引用和文件监听器
    this.window.on('closed', () => {
      this.stopWatching()
      this.window = null
    })

    // 窗口显示时启动文件系统监听
    this.window.on('show', () => {
      this.startWatching(workspacePath)
    })

    // 窗口隐藏时停止文件系统监听
    this.window.on('hide', () => {
      this.stopWatching()
    })

    // 开发者工具（默认关闭，可通过环境变量开启）
    if (shouldOpenDevTools()) {
      this.window.webContents.openDevTools()
    }
  }

  /**
   * 显示文件管理器窗口
   */
  show(): void {
    if (this.showExisting()) {
      const workspacePath = filePermissionManager.getWorkspacePath()
      if (workspacePath) {
        this.startWatching(workspacePath)
      }
      return
    }
    this.create()
  }

  /**
   * 隐藏文件管理器窗口
   */
  hide(): void {
    super.hide()
    this.stopWatching()
  }

  /**
   * 关闭文件管理器窗口
   */
  close(): void {
    super.close()
  }

  /**
   * 销毁窗口
   */
  destroy(): void {
    this.stopWatching()
    super.destroy()
  }

  /**
   * 检查窗口是否可见
   */
  isVisible(): boolean {
    return super.isVisible()
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
   * 发送消息到文件管理器窗口
   */
  sendMessage(channel: string, ...args: any[]): void {
    if (this.isValid()) {
      this.window!.webContents.send(channel, ...args)
    }
  }

  /**
   * 启动文件系统监听
   */
  private startWatching(workspacePath: string): void {
    // 停止之前的监听
    this.stopWatching()

    if (!workspacePath) {
      return
    }

    try {
      // 检查目录是否存在
      if (!fs.existsSync(workspacePath)) {
        return
      }

      // 创建文件系统监听器（递归监听子目录）
      this.fileWatcher = fs.watch(
        workspacePath,
        { recursive: true },
        (eventType, filename) => {
          // 忽略临时文件和系统文件
          if (filename && (filename.startsWith('.') || filename.includes('~'))) {
            return
          }

          // 通知渲染进程刷新
          if (this.isValid()) {
            this.window!.webContents.send('file-explorer:directory-changed', {
              eventType,
              filename,
              path: workspacePath
            })
          }
        }
      )

      this.watchedPath = workspacePath
      log.info('[文件管理器] 已启动文件系统监听:', workspacePath)
    } catch (error) {
      log.error('[文件管理器] 启动文件系统监听失败:', error)
    }
  }

  /**
   * 停止文件系统监听
   */
  private stopWatching(): void {
    if (this.fileWatcher) {
      try {
        this.fileWatcher.close()
        log.info('[文件管理器] 已停止文件系统监听')
      } catch (error) {
        log.error('[文件管理器] 停止文件系统监听失败:', error)
      }
      this.fileWatcher = null
      this.watchedPath = null
    }
  }

  /**
   * 刷新文件管理器
   */
  refresh(): void {
    if (this.isValid()) {
      this.window!.webContents.send('file-explorer:refresh')
    }
  }

}

// 导出单例
export const fileExplorerWindowManager = new FileExplorerWindowManager()

