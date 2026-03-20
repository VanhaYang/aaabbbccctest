import log from '../logger'
import { ipcMain } from 'electron'
import { updateManager } from '../updateManager'

export const registerUpdateIpcHandlers = (): void => {
  // 检查更新
  ipcMain.handle('update:check', async () => {
    try {
      return await updateManager.checkForUpdates()
    } catch (error) {
      log.error('[IPC] 检查更新失败:', error)
      return {
        available: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  })

  // 下载更新
  ipcMain.handle('update:download', async () => {
    try {
      return await updateManager.downloadUpdate()
    } catch (error) {
      log.error('[IPC] 下载更新失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  })

  // 安装更新并重启
  ipcMain.handle('update:install', () => {
    try {
      updateManager.quitAndInstall()
      return { success: true }
    } catch (error) {
      log.error('[IPC] 安装更新失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  })

  // 获取更新信息
  ipcMain.handle('update:info', () => {
    try {
      const info = updateManager.getUpdateInfo()
      return {
        success: true,
        info: info || null
      }
    } catch (error) {
      log.error('[IPC] 获取更新信息失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  })
}
