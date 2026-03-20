import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { getIconPath, shouldOpenDevTools, loadRendererPage } from './utils'
import { BaseWindowManager } from './window/BaseWindowManager'
import { getWebPreferencesWithPreload } from './window/webPreferences'

/**
 * HTML预览窗口管理器
 * 负责创建和管理代码预览窗口
 */
export class PreviewWindowManager extends BaseWindowManager {

  /**
   * 创建预览窗口
   * @param code 初始代码内容
   * @param language 代码语言
   */
  create(code: string = '', language: string = 'html'): void {
    // 如果窗口已存在，则显示并聚焦，并更新代码
    if (this.showExisting()) {
      this.window!.webContents.send('preview:update-code', { code, language })
      return
    }

    // 创建新窗口
    this.window = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      title: 'HTML 预览器',
      icon: getIconPath(), // 设置窗口图标
      autoHideMenuBar: true,
      resizable: true,
      frame: true,
      show: false,
      backgroundColor: '#ffffff',
      webPreferences: {
        ...getWebPreferencesWithPreload(join(__dirname, '../preload/index.js')),
        webSecurity: true,
        allowRunningInsecureContent: false
      }
    })

    // 加载页面
    loadRendererPage(this.window, 'preview.html')

    // 窗口准备好后显示并发送初始代码
    this.window.once('ready-to-show', () => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.show()
        this.window.focus()
        // 发送初始代码
        this.window.webContents.send('preview:update-code', { code, language })
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
   * 更新代码内容
   */
  updateCode(code: string, language: string = 'html'): void {
    if (this.isValid()) {
      this.window!.webContents.send('preview:update-code', { code, language })
    }
  }

  /**
   * 打开媒体文件预览（图片、视频、音频）
   */
  openMedia(dataUrl: string, fileType: 'image' | 'video' | 'audio', fileName: string): void {
    if (this.isValid()) {
      this.window!.webContents.send('preview:open-media', { dataUrl, fileType, fileName })
    } else {
      // 如果窗口不存在，创建新窗口
      this.create('', 'html')
      // 等待窗口准备好后发送媒体数据
      this.window!.once('ready-to-show', () => {
        if (this.window && !this.window.isDestroyed()) {
          this.window.webContents.send('preview:open-media', { dataUrl, fileType, fileName })
        }
      })
    }
  }

}

// 导出单例
export const previewWindowManager = new PreviewWindowManager()

