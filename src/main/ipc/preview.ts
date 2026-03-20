import log from '../logger'
import { ipcMain } from 'electron'
import { previewWindowManager } from '../previewWindow'

export const registerPreviewIpcHandlers = (): void => {
  // 监听来自渲染进程的预览窗口打开请求（通过ipcRenderer.send发送）
  ipcMain.on('preview:open-with-code', (_event, data: { code: string; language: string }) => {
    try {
      const code = data.code || ''
      const language = data.language || 'html'
      previewWindowManager.create(code, language)
      log.info('[IPC] 预览窗口已打开，代码长度:', code.length, '语言:', language)
    } catch (error) {
      log.error('[IPC] 打开预览窗口失败:', error)
    }
  })

  // 打开预览窗口（通过ipcRenderer.invoke调用）
  ipcMain.handle('preview:open', async (_event, code?: string, language?: string) => {
    try {
      previewWindowManager.create(code || '', language || 'html')
      return { success: true }
    } catch (error) {
      log.error('[IPC] 打开预览窗口失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '未知错误' }
    }
  })

  // 关闭预览窗口
  ipcMain.handle('preview:close', async () => {
    try {
      previewWindowManager.close()
      return { success: true }
    } catch (error) {
      log.error('[IPC] 关闭预览窗口失败:', error)
      return { success: false }
    }
  })

  // 更新预览窗口代码
  ipcMain.handle('preview:update-code', async (_event, code: string, language?: string) => {
    try {
      previewWindowManager.updateCode(code, language || 'html')
      return { success: true }
    } catch (error) {
      log.error('[IPC] 更新预览窗口代码失败:', error)
      return { success: false }
    }
  })

  // 打开媒体文件预览
  ipcMain.handle(
    'preview:open-media',
    async (_event, dataUrl: string, fileType: string, fileName: string) => {
      try {
        previewWindowManager.openMedia(dataUrl, fileType as 'image' | 'video' | 'audio', fileName)
        return { success: true }
      } catch (error) {
        log.error('[IPC] 打开媒体预览失败:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : '未知错误'
        }
      }
    }
  )
}
