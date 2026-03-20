import log from '../logger'
import { ipcMain, dialog, clipboard, nativeImage, app } from 'electron'
import { screenshotManager } from '../screenshot'
import { windowManager } from '../window'
import { mainWindowManager } from '../mainWindow'
import { escapeScriptString } from '../utils'

export const registerScreenshotIpcHandlers = (): void => {
  // 开始截图
  ipcMain.handle('screenshot:start', async () => {
    try {
      await screenshotManager.startCapture()
      return { success: true }
    } catch (error) {
      log.error('截图失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  })

  // 完成截图（区域选择完成后）
  ipcMain.handle('screenshot:finish', async (_event, imageData: string) => {
    try {
      screenshotManager.finishCapture()

      // 关闭截图窗口
      windowManager.closeCaptureWindow()

      // 恢复主窗口
      // mainWindowManager.show()

      return { success: true, data: imageData }
    } catch (error) {
      log.error('完成截图失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  })

  // 保存截图到文件
  ipcMain.handle('screenshot:save', async (_event, imageData: string) => {
    try {
      // 显示保存对话框
      const mainWindow = mainWindowManager.getWindow()
      if (!mainWindow || mainWindow.isDestroyed()) {
        throw new Error('主窗口不可用')
      }

      const result = await dialog.showSaveDialog(mainWindow, {
        title: '保存截图',
        defaultPath: `screenshot-${Date.now()}.png`,
        filters: [
          { name: '图片', extensions: ['png', 'jpg', 'jpeg'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      })

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true }
      }

      const filePath = await screenshotManager.saveScreenshot(imageData, result.filePath)
      return { success: true, path: filePath }
    } catch (error) {
      log.error('保存截图失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  })

  // 复制截图到剪贴板
  ipcMain.handle('screenshot:copy', async (_event, imageData: string) => {
    try {
      const image = nativeImage.createFromDataURL(imageData)
      clipboard.writeImage(image)

      return { success: true }
    } catch (error) {
      log.error('复制到剪贴板失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  })

  // 取消截图
  ipcMain.handle('screenshot:cancel', async (_event, showMainWindow: boolean = false) => {
    try {
      screenshotManager.cancelCapture(showMainWindow)
      return { success: true }
    } catch (error) {
      log.error('取消截图失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  })

  // 获取显示器信息
  ipcMain.handle('screenshot:get-displays', async () => {
    try {
      const displays = screenshotManager.getDisplays()
      return { success: true, displays }
    } catch (error) {
      log.error('获取显示器信息失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  })

  // 上传图片到网站（通过 BroadcastChannel）
  ipcMain.handle('screenshot:upload-to-website', async (_event, imageData: string) => {
    try {
      const mainWindow = mainWindowManager.getWindow()
      if (!mainWindow || mainWindow.isDestroyed()) {
        mainWindowManager.createWindow()
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      const window = mainWindowManager.getWindow()
      if (!window || window.isDestroyed()) {
        throw new Error('主窗口不可用')
      }

      // 显示并聚焦主窗口（不强制重新加载，避免页面跳转）
      mainWindowManager.show(false)

      await new Promise(resolve => setTimeout(resolve, 300))

      const appVersion = app.getVersion() || '1.0.0'
      const appName = app.getName() || 'Electron Screenshot'
      const escapedVersion = escapeScriptString(appVersion)
      const escapedName = escapeScriptString(appName)
      const escapedImageData = escapeScriptString(imageData)

      const uploadScript = `
        (function() {
          try {
            if (typeof BroadcastChannel === 'undefined') {
              log.error('[客户端集成] 浏览器不支持 BroadcastChannel');
              return;
            }

            const channel = new BroadcastChannel('fileUpload');

            if (!window.__CLIENT_CHANNEL_READY__) {
              channel.postMessage({
                type: 'clientReady',
                source: 'client',
                data: {
                  version: '${escapedVersion}',
                  name: '${escapedName}'
                },
                timestamp: Date.now()
              });
              window.__CLIENT_CHANNEL_READY__ = true;
            }

            const imageData = '${escapedImageData}';
            const fileName = 'screenshot_' + Date.now() + '.png';

            const base64Data = imageData.replace(/^data:image\\/\\w+;base64,/, '');
            const fileSize = Math.ceil((base64Data.length * 3) / 4);

            channel.postMessage({
              type: 'fileUpload',
              source: 'client',
              data: {
                files: [{
                  name: fileName,
                  mimeType: 'image/png',
                  data: imageData,
                  size: fileSize
                }],
                timestamp: Date.now()
              },
              timestamp: Date.now()
            });

            channel.onmessage = (event) => {
              const { type, source, data } = event.data || {};
              if (source === 'website') {
                if (type === 'fileUploadReceived') {
                  setTimeout(() => {
                    const textareas = document.getElementsByClassName('arco-textarea');
                    if (textareas.length > 0) {
                      textareas[0].focus();
                    }
                  }, 300);
                }
              }
            };
          } catch (error) {
            log.error('[客户端集成] 上传文件失败:', error);
          }
        })();
      `

      await window.webContents.executeJavaScript(uploadScript)

      setTimeout(() => {
        if (window && !window.isDestroyed()) {
          const focusScript = `
            (function() {
              try {
                const textareas = document.getElementsByClassName('arco-textarea');
                if (textareas.length > 0) {
                  textareas[0].focus();
                  return true;
                }
                setTimeout(() => {
                  const retryTextareas = document.getElementsByClassName('arco-textarea');
                  if (retryTextareas.length > 0) {
                    retryTextareas[0].focus();
                  }
                }, 500);
                return false;
              } catch (error) {
                log.error('[聚焦输入框] 失败:', error);
                return false;
              }
            })();
          `
          window.webContents.executeJavaScript(focusScript).catch(err => {
            log.error('[IPC] 聚焦输入框失败:', err)
          })
        }
      }, 800)

      return { success: true }
    } catch (error) {
      log.error('[IPC] 上传图片到网站失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  })
}
