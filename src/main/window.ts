import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import log from './logger'
import { shouldOpenDevTools, loadRendererPage } from './utils'
import { getWebPreferencesWithPreload } from './window/webPreferences'

/**
 * 截图窗口管理模块
 * 职责：专注于截图窗口的创建、管理和多屏幕支持
 */
export class WindowManager {
  private mainWindow: BrowserWindow | null = null
  private captureWindows: BrowserWindow[] = []
  private preloadedCaptureWindows: Map<number, BrowserWindow> = new Map()
  private isPreloading = false
  // 窗口与显示器的映射关系（用于快速查找）
  private windowDisplayMap: Map<BrowserWindow, number> = new Map()

  /**
   * 设置主窗口引用（用于截图后恢复）
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  /**
   * 获取主窗口引用
   */
  getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  /**
   * 预加载截图窗口（在应用启动时调用）
   * 为每个显示器预创建窗口，保持隐藏状态，提升截图响应速度
   */
  preloadCaptureWindows(): void {
    if (this.isPreloading) {
      return
    }

    this.isPreloading = true

    const displays = screen.getAllDisplays()
    const preloadPromises: Promise<void>[] = []

    displays.forEach(display => {
      const { x, y, width, height } = display.bounds

      // 检查是否已存在预加载窗口
      if (this.preloadedCaptureWindows.has(display.id)) {
        const existingWindow = this.preloadedCaptureWindows.get(display.id)
        if (existingWindow && !existingWindow.isDestroyed()) {
          // 更新窗口位置和大小（如果显示器配置变化）
          existingWindow.setBounds({ x, y, width, height }, false)
          return
        }
      }

      // 创建预加载窗口
      const promise = this.createSingleCaptureWindow(display, null, true)
      preloadPromises.push(promise)
    })

    Promise.all(preloadPromises)
      .then(() => {
        this.isPreloading = false
      })
      .catch(error => {
        log.error('[WindowManager] 预加载窗口失败:', error)
        this.isPreloading = false
      })
  }

  /**
   * 创建单个截图窗口（内部方法）
   * @param display 显示器信息
   * @param imageData 图片数据（Buffer 或 DataURL，可选，预加载时为 null）
   * @param isPreload 是否为预加载模式
   */
  private async createSingleCaptureWindow(
    display: Electron.Display,
    imageData: Buffer | string | null,
    isPreload: boolean = false
  ): Promise<void> {
    const { x, y, width, height } = display.bounds

    // 为每个显示器创建独立的全屏窗口
    // 使用 display.bounds（而不是 workAreaSize）来覆盖整个屏幕包括任务栏
    const captureWindow = new BrowserWindow({
      width,
      height,
      x,
      y,
      frame: false,
      transparent: true, // 透明窗口
      backgroundColor: '#00000000', // 完全透明背景
      show: false, // 先不显示，设置好后再显示
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      focusable: true, // 允许获取焦点
      hasShadow: false, // 禁用阴影，避免影响透明效果
      webPreferences: getWebPreferencesWithPreload(join(__dirname, '../preload/index.js'))
    })

    // 监听窗口失去焦点事件，重新置顶
    captureWindow.on('blur', () => {
      if (!captureWindow.isDestroyed()) {
        captureWindow.setAlwaysOnTop(true, 'screen-saver', 1)
      }
    })

    // 禁用右键菜单
    captureWindow.setMenu(null)
    
    // 禁用 webContents 的上下文菜单（防止系统右键菜单）
    captureWindow.webContents.on('context-menu', (e) => {
      e.preventDefault()
    })

    // 确保窗口精确覆盖整个显示器（包括任务栏）
    captureWindow.setBounds({ x, y, width, height }, false)

    // 窗口隐藏事件 - 通知渲染进程重置状态
    captureWindow.on('hide', () => {
      if (!captureWindow.isDestroyed()) {
        try {
          captureWindow.webContents.send('screenshot:window-hidden')
          log.info(`[截图窗口] 窗口隐藏，已通知渲染进程重置状态，显示器ID: ${display.id}`)
        } catch (error) {
          log.error(`[截图窗口] 发送 window-hidden 消息失败，显示器ID: ${display.id}:`, error)
        }
      }
    })

    // 窗口关闭事件
    captureWindow.on('closed', () => {
      const windowIndex = this.captureWindows.indexOf(captureWindow)
      if (windowIndex > -1) {
        this.captureWindows.splice(windowIndex, 1)
      }
      // 清理映射关系
      this.windowDisplayMap.delete(captureWindow)
    })

    // 监听窗口错误
    captureWindow.webContents.on('crashed', () => {
      log.error('[截图窗口] 窗口崩溃')
    })

    captureWindow.on('unresponsive', () => {
      log.error('[截图窗口] 窗口无响应')
    })

    // 加载截图页面
    const isDev = process.env.NODE_ENV === 'development'
    loadRendererPage(captureWindow, 'capture.html').catch(err => {
      log.error('[截图窗口] 加载页面失败:', err)
    })

    // 开发者工具（默认关闭，可通过环境变量开启，仅主显示器）
    const allDisplays = screen.getAllDisplays()
    const displayIndex = allDisplays.findIndex(d => d.id === display.id)
    if (isDev && displayIndex === 0 && shouldOpenDevTools()) {
      captureWindow.webContents.openDevTools({ mode: 'detach' })
    }

    // 优化：使用 ready-to-show 事件提前显示窗口，提升用户体验
    // ready-to-show 在窗口准备好显示时就会触发，不需要等待页面完全加载
    if (!isPreload) {
      captureWindow.once('ready-to-show', () => {
        if (!captureWindow.isDestroyed()) {
          // 立即显示窗口，不等待页面完全加载
          captureWindow.setAlwaysOnTop(true, 'screen-saver', 1)
          captureWindow.show()
          captureWindow.focus()
        }
      })
    }

    // 优化：在 dom-ready 时就可以发送数据，不需要等到 did-finish-load
    // dom-ready 在 DOM 构建完成时触发，比 did-finish-load 更早
    captureWindow.webContents.once('dom-ready', () => {
      if (!captureWindow.isDestroyed()) {
        if (!isPreload && imageData) {
          // 正常模式：在 DOM 准备好时就发送图片数据，提升响应速度
          // 注意：此时截图已完成，不会截到窗口本身
          // 如果 imageData 是 Buffer，直接发送 Buffer（Electron IPC 支持）
          // 如果 imageData 是字符串（DataURL），保持兼容性
          captureWindow.webContents.send('screenshot:image-data', {
            imageData,
            displayId: display.id,
            displayBounds: display.bounds,
            scaleFactor: display.scaleFactor,
            isPrimary: display.id === screen.getPrimaryDisplay().id
          })
        }
      }
    })

    // 窗口加载完成后的处理
    captureWindow.webContents.on('did-finish-load', () => {
      if (!captureWindow.isDestroyed()) {
        if (isPreload) {
          // 预加载模式：只标记为就绪，不发送数据和显示
          this.preloadedCaptureWindows.set(display.id, captureWindow)
        }
        // 注意：正常模式的数据发送已经在 dom-ready 时完成，窗口显示在 ready-to-show 时完成
        // 这里不需要再做任何处理，避免重复发送数据
      }
    })

    if (isPreload) {
      // 预加载模式：保存到预加载映射
      // 窗口会在 did-finish-load 时添加到 preloadedCaptureWindows
      return Promise.resolve()
    } else {
      // 正常模式：添加到活动窗口列表
      this.captureWindows.push(captureWindow)
      // 保存窗口与显示器的映射
      this.windowDisplayMap.set(captureWindow, display.id)
      return Promise.resolve()
    }
  }

  /**
   * 创建全屏截图窗口（多屏幕支持）
   * 优先使用预加载的窗口，如果没有则创建新窗口
   * @param imageDataMap 图片数据映射（Buffer 或 DataURL），必须包含图片数据
   */
  createCaptureWindow(imageDataMap: Map<number, Buffer | string>): void {
    const createStart = Date.now()
    // 先关闭所有已存在的活动截图窗口
    this.closeCaptureWindow()

    const displays = screen.getAllDisplays()
    const createPromises: Promise<void>[] = []

    displays.forEach(display => {
      const imageData = imageDataMap.get(display.id)
      if (!imageData) {
        log.warn(`[WindowManager] 显示器 ${display.id} 没有图片数据，跳过创建窗口`)
        return
      }

      // 检查是否有预加载的窗口
      const preloadedWindow = this.preloadedCaptureWindows.get(display.id)

      if (preloadedWindow && !preloadedWindow.isDestroyed()) {
        // 使用预加载的窗口
        const preloadStart = Date.now()

        // 更新窗口位置和大小（如果显示器配置变化）
        const { x, y, width, height } = display.bounds
        preloadedWindow.setBounds({ x, y, width, height }, false)

        // 发送图片数据
        const sendStart = Date.now()
        // 计算数据大小（Buffer 或字符串）
        const dataSize = Buffer.isBuffer(imageData) ? imageData.length : imageData.length
        try {
          preloadedWindow.webContents.send('screenshot:image-data', {
            imageData,
            displayId: display.id,
            displayBounds: display.bounds,
            scaleFactor: display.scaleFactor,
            isPrimary: display.id === screen.getPrimaryDisplay().id
          })
          log.info(
            `[性能] 发送图片数据到预加载窗口耗时: ${Date.now() - sendStart}ms, 数据大小: ${Math.round(
              dataSize / 1024
            )}KB`
          )
        } catch (error) {
          log.error(`[WindowManager] 发送图片数据失败，显示器ID: ${display.id}:`, error)
        }

        // 显示窗口（预加载窗口已经加载完成，可以直接显示）
        // 使用 setImmediate 确保在下一个事件循环中执行，避免阻塞
        setImmediate(() => {
          if (!preloadedWindow.isDestroyed()) {
            preloadedWindow.setAlwaysOnTop(true, 'screen-saver', 1)
            preloadedWindow.show()
            preloadedWindow.focus()
          }
        })
        log.info(`[性能] 使用预加载窗口耗时: ${Date.now() - preloadStart}ms`)

        // 添加到活动窗口列表
        this.captureWindows.push(preloadedWindow)
        // 保存窗口与显示器的映射
        this.windowDisplayMap.set(preloadedWindow, display.id)
      } else {
        // 没有预加载窗口，创建新窗口（此时图片数据已准备好）
        const promise = this.createSingleCaptureWindow(display, imageData, false)
        createPromises.push(promise)
      }
    })

    // 等待所有新窗口创建完成
    if (createPromises.length > 0) {
      Promise.all(createPromises)
        .then(() => {
          log.info(`[性能] 创建新窗口总耗时: ${Date.now() - createStart}ms`)
        })
        .catch(error => {
          log.error('[WindowManager] 创建窗口失败:', error)
        })
    } else {
      log.info(`[性能] 创建窗口总耗时: ${Date.now() - createStart}ms`)
    }
  }

  /**
   * 向已创建的窗口发送图片数据（用于异步加载）
   * @param imageDataMap 图片数据映射（Buffer 或 DataURL）
   */
  sendImageDataToWindows(imageDataMap: Map<number, Buffer | string>): void {
    imageDataMap.forEach((imageData, displayId) => {
      // 优先从活动窗口列表查找
      let targetWindow: BrowserWindow | null = null

      for (const window of this.captureWindows) {
        if (!window.isDestroyed() && this.windowDisplayMap.get(window) === displayId) {
          targetWindow = window
          break
        }
      }

      // 如果没找到，检查预加载窗口
      if (!targetWindow) {
        const preloadedWindow = this.preloadedCaptureWindows.get(displayId)
        if (preloadedWindow && !preloadedWindow.isDestroyed()) {
          targetWindow = preloadedWindow
          // 如果预加载窗口还没添加到活动列表，添加它
          if (!this.captureWindows.includes(preloadedWindow)) {
            this.captureWindows.push(preloadedWindow)
            this.windowDisplayMap.set(preloadedWindow, displayId)
          }
        }
      }

      // 发送图片数据
      if (targetWindow && !targetWindow.isDestroyed()) {
        const display = screen.getAllDisplays().find(d => d.id === displayId)
        if (display) {
          targetWindow.webContents.send('screenshot:image-data', {
            imageData,
            displayId: display.id,
            displayBounds: display.bounds,
            scaleFactor: display.scaleFactor,
            isPrimary: display.id === screen.getPrimaryDisplay().id
          })
        }
      }
    })
  }

  /**
   * 获取所有截图窗口
   */
  getCaptureWindows(): BrowserWindow[] {
    return this.captureWindows
  }

  /**
   * 获取截图窗口（兼容旧API，返回第一个窗口）
   */
  getCaptureWindow(): BrowserWindow | null {
    return this.captureWindows[0] || null
  }

  /**
   * 关闭所有截图窗口（隐藏而不是销毁，保留预加载窗口）
   */
  closeCaptureWindow(): void {
    log.info(`[WindowManager] 关闭截图窗口，活动窗口数: ${this.captureWindows.length}`)
    this.captureWindows.forEach(window => {
      if (window && !window.isDestroyed()) {
        // 隐藏窗口而不是关闭，保留预加载窗口
        const isPreloaded = Array.from(this.preloadedCaptureWindows.entries()).find(
          ([_, w]) => w === window
        )?.[0]
        
        if (isPreloaded) {
          window.hide()
        } else {
          window.close()
        }
      }
    })

    this.captureWindows = []
  }

  /**
   * 清理所有预加载窗口（应用退出时调用）
   */
  destroyPreloadedWindows(): void {
    this.preloadedCaptureWindows.forEach(window => {
      if (window && !window.isDestroyed()) {
        window.close()
      }
    })
    this.preloadedCaptureWindows.clear()
  }
}

export const windowManager = new WindowManager()
