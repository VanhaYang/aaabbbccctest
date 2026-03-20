import { screen, desktopCapturer, nativeImage } from 'electron'
import { writeFile } from 'fs/promises'
import { windowManager } from './window'
import { floatingPanelManager } from './floatingPanel'
import type { DisplayInfo } from '../shared/types'
import log from './logger'

/**
 * 截图管理模块
 */

// 缓存的屏幕源信息
interface CachedSourceInfo {
  id: string
  display_id: string
  name: string
  thumbnailSize: { width: number; height: number }
}

export class ScreenshotManager {
  private isCapturing = false
  // 缓存的屏幕源信息（按显示器ID映射，在启动时预加载）
  // 包含 id、display_id、尺寸等信息，不包含截图数据
  private cachedSourceInfo: Map<number, CachedSourceInfo> = new Map()

  /**
   * 预加载屏幕源信息（在应用初始化时调用）
   * 获取所有显示器的源信息（id、display_id、尺寸等）并缓存，不缓存截图
   * 截图时直接使用缓存的屏幕信息获取截图
   */
  async preloadSources(): Promise<void> {
    try {
      const displays = screen.getAllDisplays()
      const preloadPromises = displays.map(async display => {
        try {
          // 获取该显示器的尺寸
          const requestedSize = this.getThumbnailSize(display.id)

          // 使用最小尺寸快速获取源信息（只获取元数据，不获取实际截图）
          const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: 1, height: 1 }
          })

          // 查找对应的源
          let source = sources.find(s => s.display_id === display.id.toString())
          if (!source && sources.length > 0) {
            const displayIndex = displays.findIndex(d => d.id === display.id)
            if (displayIndex >= 0 && displayIndex < sources.length) {
              source = sources[displayIndex]
            } else {
              source = sources[0]
            }
          }

          if (source) {
            // 缓存源信息（包括 id、display_id、尺寸等，不包含截图）
            this.cachedSourceInfo.set(display.id, {
              id: source.id,
              display_id: source.display_id,
              name: source.name,
              thumbnailSize: requestedSize
            })
            log.info(
              `[Screenshot] 预加载显示器 ${display.id} 源信息完成，尺寸: ${requestedSize.width}x${requestedSize.height}`
            )
          }
        } catch (error) {
          log.error(`[Screenshot] 预加载显示器 ${display.id} 源信息失败:`, error)
        }
      })

      await Promise.all(preloadPromises)
      log.info(`[Screenshot] 预加载所有显示器源信息完成，共 ${this.cachedSourceInfo.size} 个`)
    } catch (error) {
      log.error('[Screenshot] 预加载屏幕源信息失败:', error)
      // 失败不影响后续使用，会在截图时重新获取
    }
  }

  /**
   * 获取所有显示器信息
   */
  getDisplays(): DisplayInfo[] {
    const displays = screen.getAllDisplays()
    return displays.map(display => ({
      id: display.id,
      bounds: display.bounds,
      scaleFactor: display.scaleFactor
    }))
  }

  /**
   * 获取 desktopCapturer 的屏幕源信息（用于调试和匹配）
   */
  async getCapturerSources(): Promise<Array<{ id: string; name: string; display_id: string }>> {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 } // 最小尺寸，只获取信息
    })
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      display_id: source.display_id
    }))
  }

  /**
   * 捕获屏幕截图（返回 Buffer，性能更优）
   *
   * 注意：由于 desktopCapturer 的 thumbnailSize 是全局设置，
   * 当返回多个屏幕源时，它们都会被缩放到相同的 thumbnailSize。
   *
   * 如果需要准确的多屏幕捕获，应该为每个屏幕单独调用此方法。
   */
  async captureScreen(displayId?: number): Promise<Buffer> {
    try {
      // 获取所有显示器信息
      const displays = screen.getAllDisplays()

      // 确定目标显示器ID
      const targetDisplayId = displayId !== undefined ? displayId : screen.getPrimaryDisplay().id

      // 从缓存中获取该显示器的源信息
      const cachedInfo = this.cachedSourceInfo.get(targetDisplayId)

      if (cachedInfo) {
        // 使用缓存的屏幕信息直接获取截图
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: cachedInfo.thumbnailSize
        })

        if (sources.length === 0) {
          throw new Error('未找到可用的屏幕源')
        }

        // 使用缓存的 source id 快速查找
        const source = sources.find(s => s.id === cachedInfo.id)
        if (source) {
          // 获取截图数据 - 使用 toPNG() 获取 Buffer，比 toDataURL() 快得多
          const image = source.thumbnail
          const toPngStart = Date.now()
          // toPNG() 是同步操作，但比 toDataURL() 快，因为不需要 base64 编码
          const buffer = image.toPNG()
          log.info(
            `[性能] toPNG() 耗时: ${Date.now() - toPngStart}ms, 数据大小: ${Math.round(
              buffer.length / 1024
            )}KB`
          )
          return buffer
        } else {
          log.warn(`[Screenshot] 缓存的源 id 不匹配，回退到查找模式，displayId: ${targetDisplayId}`)
        }
      }

      // 如果缓存中没有信息，使用原来的方式获取
      const requestedSize = this.getThumbnailSize(displayId)
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: requestedSize
      })

      if (sources.length === 0) {
        throw new Error('未找到可用的屏幕源')
      }

      // 查找对应的源
      let source = sources[0] // 默认使用第一个屏幕

      if (displayId !== undefined) {
        let targetSource = sources.find(s => s.display_id === displayId.toString())
        if (!targetSource) {
          const targetDisplay = displays.find(d => d.id === displayId)
          if (targetDisplay) {
            const displayIndex = displays.findIndex(d => d.id === displayId)
            if (displayIndex >= 0 && displayIndex < sources.length) {
              targetSource = sources[displayIndex]
            }
          }
        }
        if (targetSource) {
          source = targetSource
        } else {
          log.warn(`[Screenshot] 未找到匹配的屏幕源，displayId: ${displayId}，将使用默认屏幕源`)
        }
      } else {
        const primaryDisplay = screen.getPrimaryDisplay()
        let primarySource = sources.find(s => s.display_id === primaryDisplay.id.toString())
        if (!primarySource) {
          const primaryIndex = displays.findIndex(d => d.id === primaryDisplay.id)
          if (primaryIndex >= 0 && primaryIndex < sources.length) {
            primarySource = sources[primaryIndex]
          }
        }
        if (primarySource) {
          source = primarySource
        }
      }

      // 获取截图数据 - 使用 toPNG() 获取 Buffer，比 toDataURL() 快得多
      const image = source.thumbnail
      const toPngStart = Date.now()
      // toPNG() 是同步操作，但比 toDataURL() 快，因为不需要 base64 编码
      const buffer = image.toPNG()
      log.info(
        `[性能] toPNG() 耗时: ${Date.now() - toPngStart}ms, 数据大小: ${Math.round(
          buffer.length / 1024
        )}KB`
      )

      return buffer
    } catch (error) {
      log.error('屏幕捕获失败:', error)
      throw error
    }
  }

  /**
   * 捕获屏幕截图（返回 DataURL，用于兼容旧代码）
   * 注意：此方法性能较差，建议使用 captureScreen() 获取 Buffer
   */
  async captureScreenAsDataURL(displayId?: number): Promise<string> {
    const buffer = await this.captureScreen(displayId)
    // 将 Buffer 转换为 DataURL（异步处理，避免阻塞）
    return `data:image/png;base64,${buffer.toString('base64')}`
  }

  /**
   * 获取缩略图尺寸
   *
   * 重要说明：desktopCapturer 的 thumbnailSize 是全局设置！
   * 它会将所有屏幕源的 thumbnail 都强制缩放到这个尺寸，而不管屏幕实际大小。
   *
   * 这是 Electron API 的限制，无法避免。
   *
   * 因此，当指定了 displayId 时，我们只使用该显示器的尺寸，
   * 其他屏幕源的尺寸会不准确（但我们不会使用它们）。
   */
  private getThumbnailSize(displayId?: number) {
    const displays = screen.getAllDisplays()

    if (displayId !== undefined) {
      // 如果指定了显示器，使用该显示器的尺寸
      const display = displays.find(d => d.id === displayId)
      if (display) {
        return {
          width: Math.ceil(display.bounds.width * display.scaleFactor),
          height: Math.ceil(display.bounds.height * display.scaleFactor)
        }
      }
    }

    // 如果没有指定显示器，默认使用主显示器的尺寸
    const primaryDisplay = screen.getPrimaryDisplay()
    return {
      width: Math.ceil(primaryDisplay.bounds.width * primaryDisplay.scaleFactor),
      height: Math.ceil(primaryDisplay.bounds.height * primaryDisplay.scaleFactor)
    }
  }

  /**
   * 开始截图流程（多屏幕支持）
   * 为每个显示器分别捕获截图并创建窗口
   */
  async startCapture(): Promise<void> {
    if (this.isCapturing) {
      return
    }

    const perfStart = Date.now()

    try {
      this.isCapturing = true

      // 1. 隐藏主窗口
      const hideStart = Date.now()
      const mainWindow = windowManager.getMainWindow()
      // 在隐藏前检查窗口是否可见
      const wasVisible = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide()
      }

      // 2. 隐藏浮窗触发器和浮窗面板
      floatingPanelManager.closeTriggerWindow()
      floatingPanelManager.closePanelWindow()

      // 3. 等待窗口关闭动画完成
      // 如果窗口之前是可见的，需要等待关闭动画完成（Windows 系统通常需要 200-300ms）
      if (wasVisible) {
        await new Promise(resolve => setTimeout(resolve, 350))
      }
      log.info(`[性能] 隐藏窗口耗时: ${Date.now() - hideStart}ms`)

      // 4. 获取所有显示器
      const displays = screen.getAllDisplays()

      // 5. 先完成截图，再显示窗口（避免截到编辑窗口本身）
      // 并行捕获所有显示器的截图
      const captureStart = Date.now()
      const capturePromises = displays.map(async display => {
        const displayStart = Date.now()
        try {
          // 使用 Buffer 格式，性能更优
          const imageBuffer = await this.captureScreen(display.id)
          log.info(`[性能] 显示器 ${display.id} 截图耗时: ${Date.now() - displayStart}ms`)
          return { displayId: display.id, imageBuffer }
        } catch (error) {
          log.error(`显示器 ${display.id} 截图失败:`, error)
          return null
        }
      })

      // 等待所有截图完成
      const captureResults = await Promise.all(capturePromises)
      log.info(`[性能] 所有截图总耗时: ${Date.now() - captureStart}ms`)

      // 构建图片数据映射（使用 Buffer）
      const imageDataMap = new Map<number, Buffer>()
      for (const result of captureResults) {
        if (result) {
          imageDataMap.set(result.displayId, result.imageBuffer)
        }
      }

      // 6. 截图完成后再创建并显示窗口
      const windowStart = Date.now()
      if (imageDataMap.size > 0) {
        windowManager.createCaptureWindow(imageDataMap)
        log.info(`[性能] 创建窗口耗时: ${Date.now() - windowStart}ms`)
      } else {
        log.error('没有成功捕获任何屏幕')
        // 如果截图失败，恢复主窗口
        const mainWindow = windowManager.getMainWindow()
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show()
        }
        this.isCapturing = false
      }

      log.info(`[性能] 总耗时: ${Date.now() - perfStart}ms`)
    } catch (error) {
      log.error('截图流程失败:', error)
      this.isCapturing = false

      // 恢复主窗口
      const mainWindow = windowManager.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show()
      }

      throw error
    }
  }

  /**
   * 完成截图
   */
  finishCapture(): void {
    this.isCapturing = false

    // 恢复浮窗触发器（如果之前是启用状态）
    if (floatingPanelManager.getEnabled()) {
      floatingPanelManager.createTriggerWindow()
    }
  }

  /**
   * 取消截图
   * @param showMainWindow 是否显示主窗口
   */
  cancelCapture(showMainWindow: boolean = false): void {
    this.isCapturing = false

    // 关闭截图窗口
    windowManager.closeCaptureWindow()

    // 根据参数决定是否恢复主窗口
    if (showMainWindow) {
      const mainWindow = windowManager.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show()
        mainWindow.focus()
      }
    }

    // 恢复浮窗触发器（如果之前是启用状态）
    if (floatingPanelManager.getEnabled()) {
      floatingPanelManager.createTriggerWindow()
    }
  }

  /**
   * 保存截图到文件
   */
  async saveScreenshot(dataUrl: string, filePath: string): Promise<string> {
    try {
      // 将 Data URL 转换为 Buffer
      const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')

      // 写入文件
      await writeFile(filePath, buffer)

      return filePath
    } catch (error) {
      log.error('保存截图失败:', error)
      throw error
    }
  }

  /**
   * 复制截图到剪贴板
   */
  copyToClipboard(dataUrl: string): void {
    try {
      // 将 Data URL 转换为 NativeImage
      const image = nativeImage.createFromDataURL(dataUrl)

      // 避免未使用变量警告
      void image

      // 这里需要在后续添加剪贴板操作
      // clipboard.writeImage(image)
    } catch (error) {
      log.error('复制到剪贴板失败:', error)
      throw error
    }
  }
}

export const screenshotManager = new ScreenshotManager()
