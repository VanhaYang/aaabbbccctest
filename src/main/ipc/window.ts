import log from '../logger'
import { ipcMain } from 'electron'
import { mainWindowManager } from '../mainWindow'

export const registerWindowIpcHandlers = (): void => {
  // 最小化窗口
  ipcMain.handle('window:minimize', async () => {
    try {
      mainWindowManager.minimize()
      return { success: true }
    } catch (error) {
      log.error('最小化窗口失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '最小化窗口失败' }
    }
  })

  // 最大化/还原窗口
  ipcMain.handle('window:maximize', async () => {
    try {
      mainWindowManager.maximize()
      return { success: true }
    } catch (error) {
      log.error('最大化窗口失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '最大化窗口失败' }
    }
  })

  // 关闭窗口
  ipcMain.handle('window:close', async () => {
    try {
      mainWindowManager.close()
      return { success: true }
    } catch (error) {
      log.error('关闭窗口失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '关闭窗口失败' }
    }
  })

  // 显示主窗口
  ipcMain.handle('window:show-main', async () => {
    try {
      mainWindowManager.show()
      return { success: true }
    } catch (error) {
      log.error('显示主窗口失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '显示主窗口失败' }
    }
  })

  // 隐藏主窗口
  ipcMain.handle('window:hide-main', async () => {
    try {
      mainWindowManager.hide()
      return { success: true }
    } catch (error) {
      log.error('隐藏主窗口失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '隐藏主窗口失败' }
    }
  })

  // 获取窗口是否最大化
  ipcMain.handle('window:is-maximized', async () => {
    try {
      return { success: true, isMaximized: mainWindowManager.isMaximized() }
    } catch (error) {
      log.error('获取窗口最大化状态失败:', error)
      return { success: false, isMaximized: false, error: error instanceof Error ? error.message : '获取窗口最大化状态失败' }
    }
  })
}
