/**
 * 贡献点：应用就绪时与退出时的扩展点
 * 各功能模块通过贡献点接入，主入口只做遍历调度
 */

import type { IContribution } from './contributions.types'
import { CONTRIBUTION_IDS } from './contributions.types'
import { mainWindowManager } from './mainWindow'
import { windowManager } from './window'
import { ipcManager } from './ipc'
import { shortcutManager } from './shortcut'
import { trayManager } from './tray'
import { floatingPanelManager } from './floatingPanel'
import { configManager } from './configManager'
import { apiServerManager } from './api-server'
import { updateManager } from './updateManager'
import { screenshotManager } from './screenshot'
import log from './logger'

export type { IContribution }

function runDelayedCleanup(): void {
  updateManager.destroy()
  apiServerManager.stop().catch(error => {
    log.error('[应用退出] 停止 API 服务器失败:', error)
  })
  floatingPanelManager.destroy()
  shortcutManager.unregisterAll()
  trayManager.destroy()
  windowManager.closeCaptureWindow()
  windowManager.destroyPreloadedWindows()
}

/**
 * 贡献列表（顺序即初始化顺序）
 */
export const contributions: IContribution[] = [
  {
    id: 'mainWindow',
    onAppReady() {
      log.info('[应用初始化] 步骤 1: 开始创建主窗口...')
      const mainWindow = mainWindowManager.createWindow()
      log.info('[应用初始化] 步骤 1: 主窗口创建成功')
      log.info('[应用初始化] 步骤 2: 注册主窗口到窗口管理器...')
      windowManager.setMainWindow(mainWindow)
      log.info('[应用初始化] 步骤 2: 主窗口注册成功')
    }
  },
  {
    id: 'ipc',
    registerIpc() {
      log.info('[应用初始化] 步骤 3: 注册 IPC 处理器...')
      ipcManager.registerAll()
      log.info('[应用初始化] 步骤 3: IPC 处理器注册成功')
    }
  },
  {
    id: 'floatingPanel',
    onAppReady() {
      log.info('[应用初始化] 步骤 4: 注册悬浮面板 IPC 处理器...')
      floatingPanelManager.registerIPC()
      const floatingTriggerEnabled = configManager.getFloatingTriggerEnabled()
      floatingPanelManager.setEnabled(floatingTriggerEnabled)
      log.info('[应用初始化] 步骤 4: 悬浮面板 IPC 处理器注册成功')
    }
  },
  {
    id: 'shortcut',
    onAppReady() {
      log.info('[应用初始化] 步骤 5: 注册全局快捷键...')
      shortcutManager.registerAll()
      log.info('[应用初始化] 步骤 5: 全局快捷键注册成功')
    }
  },
  {
    id: 'tray',
    onAppReady() {
      log.info('[应用初始化] 步骤 6: 创建系统托盘...')
      trayManager.createTray()
      log.info('[应用初始化] 步骤 6: 系统托盘创建成功')
    }
  },
  {
    id: 'apiServer',
    onAppReady() {
      apiServerManager.start().catch(error => {
        log.error('[应用初始化] API 服务器启动失败:', error)
      })
    }
  },
  {
    id: 'update',
    onAppReady() {
      setTimeout(() => {
        updateManager.startPeriodicCheck()
      }, 5000)
    }
  },
  {
    id: 'screenshotPreload',
    onAppReady() {
      setTimeout(() => {
        windowManager.preloadCaptureWindows()
        screenshotManager.preloadSources().catch(error => {
          log.error('[应用初始化] 预加载屏幕源信息失败:', error)
        })
      }, 1000)
    }
  },
  {
    id: 'cleanup',
    onBeforeQuit() {
      setTimeout(runDelayedCleanup, 200)
    }
  }
]
