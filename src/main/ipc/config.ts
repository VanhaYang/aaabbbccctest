import { ipcMain, dialog, app, BrowserWindow } from 'electron'
import log from '../logger'
import { configManager } from '../configManager'
import { floatingPanelManager } from '../floatingPanel'
import { mainWindowManager } from '../mainWindow'
import { settingsWindowManager } from '../settingsWindow'
import { filePermissionManager } from '../filePermission'
import { AutoStartService } from '../services/AutoStartService'

export const registerConfigIpcHandlers = (): void => {
  // 获取配置
  ipcMain.handle('config:get', async () => {
    try {
      const config = configManager.getConfig()
      return { success: true, config }
    } catch (error) {
      log.error('获取配置失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取配置失败'
      }
    }
  })

  // 获取 AI Bot 配置
  ipcMain.handle('config:get-aibot', async () => {
    try {
      const config = configManager.getAIBotConfig()
      return { success: true, config }
    } catch (error) {
      log.error('获取 AI Bot 配置失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取配置失败'
      }
    }
  })

  // 保存 AI Bot 配置
  ipcMain.handle('config:save-aibot', async (_event, config) => {
    try {
      const currentConfig = configManager.getAIBotConfig()
      const isModeChanged = currentConfig && currentConfig.mode !== config.mode
      const isEnvironmentChanged =
        currentConfig &&
        currentConfig.mode === 'full' &&
        config.mode === 'full' &&
        (currentConfig.fullModeEnvironment || 'prod') !== (config.fullModeEnvironment || 'prod')

      const success = configManager.saveAIBotConfig(config)
      if (success) {
        if (!isModeChanged && !isEnvironmentChanged) {
          const mainWindow = mainWindowManager.getWindow()
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('config:updated', config)
          }

          const floatingPanel = floatingPanelManager.getPanelWindow()
          if (floatingPanel && !floatingPanel.isDestroyed()) {
            floatingPanel.webContents.send('config:updated', config)
          }
        }
      }
      return { success, modeChanged: isModeChanged || isEnvironmentChanged || false }
    } catch (error) {
      log.error('保存 AI Bot 配置失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '保存配置失败'
      }
    }
  })

  // 清除 AI Bot 配置
  ipcMain.handle('config:clear-aibot', async () => {
    try {
      const currentConfig = configManager.getAIBotConfig()
      const wasFullMode = currentConfig?.mode === 'full'

      const success = configManager.clearAIBotConfig()
      if (success) {
        const mainWindow = mainWindowManager.getWindow()
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (wasFullMode) {
            mainWindowManager.reloadPage()
          } else {
            mainWindow.webContents.send('config:cleared')
          }
        }
      }
      return { success }
    } catch (error) {
      log.error('清除 AI Bot 配置失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '清除配置失败'
      }
    }
  })

  // 导出配置
  ipcMain.handle('config:export', async () => {
    try {
      const settingsWindow = settingsWindowManager.getWindow()
      const result = await configManager.exportConfig(settingsWindow || undefined)
      return result
    } catch (error) {
      log.error('导出配置失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '导出失败'
      }
    }
  })

  // 导入配置
  ipcMain.handle('config:import', async () => {
    try {
      const currentConfig = configManager.getAIBotConfig()
      const wasFullMode = currentConfig?.mode === 'full'

      const settingsWindow = settingsWindowManager.getWindow()
      const result = await configManager.importConfig(settingsWindow || undefined)

      if (result.success && result.config) {
        if (result.config.floatingTriggerEnabled !== undefined) {
          floatingPanelManager.setEnabled(result.config.floatingTriggerEnabled)
        }

        if (settingsWindow && !settingsWindow.isDestroyed()) {
          settingsWindow.webContents.send('config:imported', result.config)
        }

        const mainWindow = mainWindowManager.getWindow()
        if (mainWindow && !mainWindow.isDestroyed()) {
          const importedConfig = result.config.aiBot
          const isFullMode = importedConfig?.mode === 'full'

          if (isFullMode !== wasFullMode) {
            mainWindowManager.reloadPage()
          } else {
            mainWindow.webContents.send('config:imported', result.config)
          }
        }
      }

      return result
    } catch (error) {
      log.error('导入配置失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '导入失败'
      }
    }
  })

  // 重置配置
  ipcMain.handle('config:reset', async () => {
    try {
      const success = configManager.resetConfig()
      if (success) {
        floatingPanelManager.setEnabled(true)

        const settingsWindow = settingsWindowManager.getWindow()
        if (settingsWindow && !settingsWindow.isDestroyed()) {
          settingsWindow.webContents.send('config:reset')
        }

        const mainWindow = mainWindowManager.getWindow()
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('config:reset')
        }
      }
      return { success }
    } catch (error) {
      log.error('重置配置失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '重置失败'
      }
    }
  })

  // 重启应用
  ipcMain.handle('config:restart-app', async () => {
    try {
      const clearStorageScript = `
        (function() {
          try {
            if (window.sessionStorage) {
              window.sessionStorage.removeItem('isGuest');
              window.sessionStorage.removeItem('isSSO');
            }
          } catch (e) {
            log.error('[应用重启] 清除 sessionStorage 失败:', e);
          }
        })();
      `

      const allWindows = BrowserWindow.getAllWindows()
      allWindows.forEach(win => {
        if (win && !win.isDestroyed()) {
          try {
            win.webContents.executeJavaScript(clearStorageScript).catch(() => {
              // 忽略错误，因为窗口可能正在关闭
            })
          } catch (error) {
            // 忽略错误
          }
        }
      })

      setTimeout(() => {
        app.relaunch()
        app.exit(0)
      }, 300)
      return { success: true }
    } catch (error) {
      log.error('重启应用失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '重启失败'
      }
    }
  })

  // 获取开机自启动状态
  ipcMain.handle('config:get-auto-start', async () => {
    try {
      const autoStart = AutoStartService.getConfigEnabled()
      return { success: true, autoStart }
    } catch (error) {
      log.error('获取开机自启动状态失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取失败'
      }
    }
  })

  // 设置开机自启动
  ipcMain.handle('config:set-auto-start', async (_event, enabled: boolean) => {
    try {
      const success = AutoStartService.setConfigAndApply(enabled)
      return { success }
    } catch (error) {
      log.error('设置开机自启动失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '设置失败'
      }
    }
  })

  // 获取悬浮触发器启用状态
  ipcMain.handle('config:get-floating-trigger-enabled', async () => {
    try {
      const enabled = configManager.getFloatingTriggerEnabled()
      return { success: true, enabled }
    } catch (error) {
      log.error('获取悬浮触发器状态失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取失败'
      }
    }
  })

  // 设置悬浮触发器启用状态
  ipcMain.handle('config:set-floating-trigger-enabled', async (_event, enabled: boolean) => {
    try {
      const success = configManager.setFloatingTriggerEnabled(enabled)
      if (success) {
        floatingPanelManager.setEnabled(enabled)
      }
      return { success }
    } catch (error) {
      log.error('设置悬浮触发器状态失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '设置失败'
      }
    }
  })

  // 获取「显示浏览器窗口」配置
  ipcMain.handle('config:get-show-browser-window', async () => {
    try {
      const show = configManager.getShowBrowserWindow()
      return { success: true, show }
    } catch (error) {
      log.error('获取显示浏览器窗口配置失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取失败'
      }
    }
  })

  // 设置「显示浏览器窗口」
  ipcMain.handle('config:set-show-browser-window', async (_event, show: boolean) => {
    try {
      const success = configManager.setShowBrowserWindow(show)
      return { success }
    } catch (error) {
      log.error('设置显示浏览器窗口失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '设置失败'
      }
    }
  })

  // 获取工作区路径
  ipcMain.handle('config:get-workspace-path', async () => {
    try {
      const path = configManager.getWorkspacePath()
      return { success: true, path: path || '' }
    } catch (error) {
      log.error('获取工作区路径失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取失败'
      }
    }
  })

  // 设置工作区路径
  ipcMain.handle('config:set-workspace-path', async (_event, path: string) => {
    try {
      const success = configManager.setWorkspacePath(path)
      return { success }
    } catch (error) {
      log.error('设置工作区路径失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '设置失败'
      }
    }
  })

  // 选择工作区路径
  ipcMain.handle('config:select-workspace-path', async () => {
    try {
      const settingsWindow = settingsWindowManager.getWindow()!
      const result = await dialog.showOpenDialog(settingsWindow, {
        title: '选择工作区目录',
        properties: ['openDirectory']
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true }
      }

      const selectedPath = result.filePaths[0]

      const validation = filePermissionManager.validateWorkspacePath(selectedPath)
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error || '路径验证失败'
        }
      }

      if (validation.warnings && validation.warnings.length > 0) {
        log.warn('[工作区路径] 验证警告:', validation.warnings)
      }

      const success = configManager.setWorkspacePath(selectedPath)

      if (success) {
        return {
          success: true,
          path: selectedPath,
          warnings: validation.warnings
        }
      }

      return {
        success: false,
        error: '保存工作区路径失败'
      }
    } catch (error) {
      log.error('选择工作区路径失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '选择失败'
      }
    }
  })

  // 验证工作区路径
  ipcMain.handle('config:validate-workspace-path', async (_event, workspacePath: string) => {
    try {
      const validation = filePermissionManager.validateWorkspacePath(workspacePath)
      return {
        success: true,
        validation
      }
    } catch (error) {
      log.error('验证工作区路径失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '验证失败'
      }
    }
  })
}
