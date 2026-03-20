import log from '../logger'
import { ipcMain } from 'electron'
import { terminalWindowManager } from '../terminalWindow'
import { registerTerminalHandlers as registerTerminalCommandHandlers } from '../services/terminalIpcHandlers'

export const registerTerminalIpcHandlers = (): void => {
  // 注册命令执行相关的 IPC 处理器
  registerTerminalCommandHandlers()

  // 打开终端窗口
  ipcMain.handle('terminal:open-window', async () => {
    try {
      terminalWindowManager.show()
      return { success: true }
    } catch (error) {
      log.error('[IPC] 打开终端窗口失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  })

  // 关闭终端窗口
  ipcMain.handle('terminal:close-window', async () => {
    try {
      terminalWindowManager.close()
      return { success: true }
    } catch (error) {
      log.error('[IPC] 关闭终端窗口失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  })
}
