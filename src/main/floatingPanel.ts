import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import log from './logger'
import { shouldOpenDevTools, loadRendererPage } from './utils'
import { getWebPreferencesWithPreload } from './window/webPreferences'

/**
 * 悬浮面板管理模块
 * 职责：管理屏幕边缘的悬浮触发器和悬浮面板窗口
 */
export class FloatingPanelManager {
  private triggerWindow: BrowserWindow | null = null
  private panelWindow: BrowserWindow | null = null
  private isEnabled = true
  private snapTimeout: NodeJS.Timeout | null = null

  /**
   * 创建悬浮触发器窗口（屏幕边缘的触发区域）
   */
  createTriggerWindow(): void {
    if (this.triggerWindow && !this.triggerWindow.isDestroyed()) {
      return
    }

    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

    // 创建一个圆形触发区域在屏幕右下角
    this.triggerWindow = new BrowserWindow({
      width: 70, // 触发区域宽度（圆形按钮）
      height: 70, // 触发区域高度
      x: screenWidth - 90, // 距离右边缘 20px
      y: screenHeight - 90, // 距离底部边缘 20px
      frame: false,
      transparent: true, // 透明窗口
      backgroundColor: '#00000000', // 完全透明背景色 (RGBA: 0,0,0,0)
      alwaysOnTop: true,
      skipTaskbar: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      hasShadow: false,
      focusable: false,
      title: '', // 设置空标题，避免显示默认标题
      // titleBarStyle: 'hidden', // 隐藏标题栏样式
      // titleBarOverlay: {
      //   color: '#000000',
      //   symbolColor: '#000000',
      //   height: 1
      // },
      webPreferences: getWebPreferencesWithPreload(join(__dirname, '../preload/index.js'))
    })

    // 设置窗口穿透（除了触发区域）
    this.triggerWindow.setIgnoreMouseEvents(false)
    this.triggerWindow.setMenu(null)

    // 开发者工具（默认关闭，可通过环境变量开启）
    if (shouldOpenDevTools()) {
      this.triggerWindow.webContents.openDevTools({ mode: 'detach' })
    }

    // 加载触发器页面
    this.loadTriggerPage()

    // 监听窗口关闭
    this.triggerWindow.on('closed', () => {
      this.triggerWindow = null
    })
  }

  /**
   * 创建悬浮面板窗口
   */
  createPanelWindow(): void {
    if (this.panelWindow && !this.panelWindow.isDestroyed()) {
      this.showPanel()
      return
    }

    // 计算面板位置（跟随触发器）
    const panelPosition = this.calculatePanelPosition()

    // 创建圆角卡片样式的面板
    this.panelWindow = new BrowserWindow({
      width: 320,
      height: 480,
      x: panelPosition.x,
      y: panelPosition.y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      show: false,
      hasShadow: false,
      focusable: false, // 窗口不可获得焦点
      title: '', // 设置空标题，避免显示默认标题
      titleBarStyle: 'hidden', // 隐藏标题栏样式
      webPreferences: getWebPreferencesWithPreload(join(__dirname, '../preload/index.js'))
    })

    this.panelWindow.setMenu(null)

    // Windows 特定：移除窗口边框和标题栏
    if (process.platform === 'win32') {
      // 延迟执行，确保窗口已完全创建
      setTimeout(() => {
        if (this.panelWindow && !this.panelWindow.isDestroyed()) {
          this.panelWindow.setMenuBarVisibility(false)
        }
      }, 100)
    }

    // 开发模式下可以按 F12 打开开发者工具
    if (process.env.NODE_ENV === 'development' && shouldOpenDevTools()) {
      this.panelWindow.webContents.on('before-input-event', (_event, input) => {
        if (input.key === 'F12') {
          this.panelWindow?.webContents.toggleDevTools()
        }
      })
    }

    // 加载面板页面
    this.loadPanelPage()

    // 监听窗口关闭
    this.panelWindow.on('closed', () => {
      this.panelWindow = null
    })
  }

  /**
   * 计算面板应该显示的位置（跟随触发器）
   */
  private calculatePanelPosition(): { x: number; y: number } {
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

    const panelWidth = 320
    const panelHeight = 480
    const spacing = 12 // 面板与触发器的间距

    // 如果触发器窗口不存在，默认显示在右下角
    if (!this.triggerWindow || this.triggerWindow.isDestroyed()) {
      log.info('[主进程-面板] 触发器不存在，使用默认位置（右下角）')
      return {
        x: screenWidth - panelWidth - 20,
        y: screenHeight - panelHeight - 20
      }
    }

    const triggerBounds = this.triggerWindow.getBounds()
    log.info('[主进程-面板] 触发器位置:', triggerBounds)

    let panelX = triggerBounds.x
    let panelY = triggerBounds.y

    // 判断触发器在屏幕的哪个区域，决定面板显示位置
    const isInLeftHalf = triggerBounds.x < screenWidth / 2

    // 水平方向：触发器在左侧，面板显示在右侧；触发器在右侧，面板显示在左侧
    if (isInLeftHalf) {
      // 面板显示在触发器右侧
      panelX = triggerBounds.x + triggerBounds.width + spacing
    } else {
      // 面板显示在触发器左侧
      panelX = triggerBounds.x - panelWidth - spacing
    }

    // 垂直方向：尽量与触发器顶部对齐，但要确保不超出屏幕
    panelY = triggerBounds.y

    // 边界检查：确保面板不超出屏幕
    if (panelX + panelWidth > screenWidth) {
      panelX = screenWidth - panelWidth - 10
    }
    if (panelX < 10) {
      panelX = 10
    }
    if (panelY + panelHeight > screenHeight) {
      panelY = screenHeight - panelHeight - 10
    }
    if (panelY < 10) {
      panelY = 10
    }

    log.info('[主进程-面板] 计算面板位置:', { x: panelX, y: panelY })
    return { x: panelX, y: panelY }
  }

  /**
   * 处理触发器窗口吸附到边缘
   */
  private snapTriggerToEdge(): void {
    if (!this.triggerWindow || this.triggerWindow.isDestroyed()) return

    const bounds = this.triggerWindow.getBounds()
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

    const snapThreshold = 80 // 吸附阈值（像素）
    const edgePadding = 10 // 边缘留白

    let newX = bounds.x
    let newY = bounds.y
    let snapped = false

    // 左侧吸附
    if (bounds.x < snapThreshold) {
      newX = edgePadding
      snapped = true
    }
    // 右侧吸附
    else if (bounds.x + bounds.width > screenWidth - snapThreshold) {
      newX = screenWidth - bounds.width - edgePadding
      snapped = true
    }

    // 顶部吸附
    if (bounds.y < snapThreshold) {
      newY = edgePadding
      snapped = true
    }
    // 底部吸附
    else if (bounds.y + bounds.height > screenHeight - snapThreshold) {
      newY = screenHeight - bounds.height - edgePadding
      snapped = true
    }

    // 如果需要吸附，设置新位置
    if (snapped) {
      // 添加动画效果
      this.triggerWindow.setBounds(
        {
          x: newX,
          y: newY,
          width: bounds.width,
          height: bounds.height
        },
        true
      ) // true 表示使用动画
    }
  }

  /**
   * 加载触发器页面
   */
  private loadTriggerPage(): void {
    if (!this.triggerWindow) return
    loadRendererPage(this.triggerWindow, 'floating-trigger.html')
  }

  /**
   * 加载面板页面
   */
  private loadPanelPage(): void {
    if (!this.panelWindow) return
    loadRendererPage(this.panelWindow, 'floating-panel.html')
  }

  /**
   * 显示悬浮面板
   */
  showPanel(): void {
    log.info('[主进程-面板] 显示面板')
    if (!this.panelWindow || this.panelWindow.isDestroyed()) {
      log.info('[主进程-面板] 面板窗口不存在，创建新窗口1')
      this.createPanelWindow()
    } else {
      log.info('[主进程-面板] 更新面板位置并显示')
      // 更新面板位置，跟随触发器
      const newPosition = this.calculatePanelPosition()
      this.panelWindow.setPosition(newPosition.x, newPosition.y)
      this.panelWindow.show()
    }
  }

  /**
   * 隐藏悬浮面板
   */
  hidePanel(): void {
    log.info('[主进程-面板] 隐藏面板')
    if (this.panelWindow && !this.panelWindow.isDestroyed()) {
      this.panelWindow.hide()
      log.info('[主进程-面板] 面板已隐藏')
    }
  }

  /**
   * 切换悬浮面板显示状态
   */
  togglePanel(): void {
    log.info('[主进程-面板] 切换面板显示状态')
    if (this.panelWindow && !this.panelWindow.isDestroyed()) {
      const isVisible = this.panelWindow.isVisible()
      log.info('[主进程-面板] 当前面板可见性:', isVisible)
      if (isVisible) {
        this.hidePanel()
      } else {
        this.showPanel()
      }
    } else {
      log.info('[主进程-面板] 面板窗口不存在，创建新窗口')
      this.createPanelWindow()

      this.togglePanel()
    }
  }

  /**
   * 启用/禁用悬浮面板功能
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled

    if (enabled) {
      this.createTriggerWindow()
    } else {
      this.closeTriggerWindow()
      this.hidePanel()
    }
  }

  /**
   * 获取启用状态
   */
  getEnabled(): boolean {
    return this.isEnabled
  }

  /**
   * 关闭触发器窗口
   */
  closeTriggerWindow(): void {
    if (this.triggerWindow && !this.triggerWindow.isDestroyed()) {
      this.triggerWindow.close()
    }
    this.triggerWindow = null
  }

  /**
   * 获取触发器窗口实例
   */
  getTriggerWindow(): BrowserWindow | null {
    return this.triggerWindow && !this.triggerWindow.isDestroyed() ? this.triggerWindow : null
  }

  /**
   * 获取面板窗口实例
   */
  getPanelWindow(): BrowserWindow | null {
    return this.panelWindow && !this.panelWindow.isDestroyed() ? this.panelWindow : null
  }

  /**
   * 关闭面板窗口
   */
  closePanelWindow(): void {
    if (this.panelWindow && !this.panelWindow.isDestroyed()) {
      this.panelWindow.close()
    }
    this.panelWindow = null
  }

  /**
   * 注册 IPC 处理器
   */
  registerIPC(): void {
    // 鼠标进入触发区域
    ipcMain.handle('floating:trigger-enter', async () => {
      try {
        this.showPanel()
        return { success: true }
      } catch (error) {
        log.error('显示悬浮面板失败:', error)
        return { success: false }
      }
    })

    // 鼠标离开面板区域
    ipcMain.handle('floating:panel-leave', async () => {
      try {
        this.hidePanel()
        return { success: true }
      } catch (error) {
        log.error('隐藏悬浮面板失败:', error)
        return { success: false }
      }
    })

    // 切换悬浮面板
    ipcMain.handle('floating:toggle', async () => {
      try {
        this.togglePanel()
        return { success: true }
      } catch (error) {
        log.error('切换悬浮面板失败:', error)
        return { success: false }
      }
    })

    // 启用/禁用悬浮面板
    ipcMain.handle('floating:set-enabled', async (_event, enabled: boolean) => {
      try {
        this.setEnabled(enabled)
        return { success: true }
      } catch (error) {
        log.error('设置悬浮面板状态失败:', error)
        return { success: false }
      }
    })

    // 触发器开始拖拽
    ipcMain.handle('floating:trigger-drag-start', async () => {
      try {
        log.info('[主进程-触发器] 开始拖拽')
        // 清除之前的吸附定时器
        if (this.snapTimeout) {
          log.info('[主进程-触发器] 清除之前的吸附定时器')
          clearTimeout(this.snapTimeout)
          this.snapTimeout = null
        }
        return { success: true }
      } catch (error) {
        log.error('[主进程-触发器] 开始拖拽失败:', error)
        return { success: false }
      }
    })

    // 触发器结束拖拽
    ipcMain.handle('floating:trigger-drag-end', async () => {
      try {
        log.info('[主进程-触发器] 结束拖拽')
        // 清除之前的吸附定时器
        if (this.snapTimeout) {
          log.info('[主进程-触发器] 清除之前的吸附定时器')
          clearTimeout(this.snapTimeout)
          this.snapTimeout = null
        }

        // 拖拽结束后3秒执行吸附
        log.info('[主进程-触发器] 设置3秒后吸附定时器')
        this.snapTimeout = setTimeout(() => {
          log.info('[主进程-触发器] 执行吸附')
          if (this.triggerWindow && !this.triggerWindow.isDestroyed()) {
            this.snapTriggerToEdge()
          } else {
            log.info('[主进程-触发器] 触发器窗口不存在，跳过吸附')
          }
          this.snapTimeout = null
        }, 3000) // 3秒后执行吸附

        return { success: true }
      } catch (error) {
        log.error('[主进程-触发器] 结束拖拽失败:', error)
        return { success: false }
      }
    })
  }

  /**
   * 销毁所有悬浮窗口
   */
  destroy(): void {
    // 清除吸附定时器
    if (this.snapTimeout) {
      clearTimeout(this.snapTimeout)
      this.snapTimeout = null
    }
    this.closeTriggerWindow()
    this.closePanelWindow()
  }
}

// 导出单例
export const floatingPanelManager = new FloatingPanelManager()
