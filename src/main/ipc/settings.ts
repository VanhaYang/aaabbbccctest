import log from '../logger'
import { ipcMain } from 'electron'
import { settingsWindowManager } from '../settingsWindow'

export const registerSettingsIpcHandlers = (): void => {
  // 打开设置窗口
  ipcMain.handle('settings:open', async () => {
    try {
      settingsWindowManager.show()
      return { success: true }
    } catch (error) {
      log.error('打开设置窗口失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '打开设置窗口失败' }
    }
  })

  // 关闭设置窗口
  ipcMain.handle('settings:close', async () => {
    try {
      settingsWindowManager.close()
      return { success: true }
    } catch (error) {
      log.error('关闭设置窗口失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '关闭设置窗口失败' }
    }
  })
}
