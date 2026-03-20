import { app, BrowserWindow } from 'electron'
import { mainWindowManager } from './mainWindow'
import log, { initializeLogger } from './logger'
import { AutoStartService } from './services/AutoStartService'
import { contributions } from './contributions'

/**
 * 应用主入口
 * 职责：应用生命周期管理和模块初始化编排
 */

// 捕获未处理的异常（使用 sync 确保在进程退出前写入）
process.on('uncaughtException', error => {
  log.sync.error('[进程] 未捕获的异常:', error)
  if (error.stack) {
    log.sync.error('[进程] 错误堆栈:', error.stack)
  }
})

// 捕获未处理的 Promise rejection
process.on('unhandledRejection', (reason, promise) => {
  log.sync.error('[进程] 未处理的 Promise rejection:', reason, promise)
  if (reason instanceof Error && reason.stack) {
    log.sync.error('[进程] 错误堆栈:', reason.stack)
  }
})

/**
 * 初始化应用：按贡献列表顺序执行 onAppReady 与 registerIpc
 */
async function initializeApp(): Promise<void> {
  for (const c of contributions) {
    if (c.onAppReady) {
      await (c.onAppReady() ?? Promise.resolve())
    }
    if (c.registerIpc) {
      c.registerIpc()
    }
  }
}

/**
 * 清除所有窗口的 sessionStorage
 * 在应用退出前执行，不区分模式
 */
function clearAllWindowsSessionStorage(): void {
  const clearStorageScript = `
    (function() {
      try {
        // 清除 sessionStorage 中的相关数据
        if (window.sessionStorage) {
          window.sessionStorage.removeItem('isGuest');
          window.sessionStorage.removeItem('isSSO');
        }
      } catch (e) {
        log.error('[应用退出] 清除 sessionStorage 失败:', e);
      }
    })();
  `

  // 获取所有窗口并清除 sessionStorage
  const allWindows = BrowserWindow.getAllWindows()
  allWindows.forEach(win => {
    if (win && !win.isDestroyed()) {
      try {
        // 尝试执行清除脚本
        win.webContents.executeJavaScript(clearStorageScript).catch(err => {
          log.error(`[应用退出] 清除窗口 ${win.id} 的 sessionStorage 失败:`, err)
        })
      } catch (error) {
        log.error(`[应用退出] 清除窗口 ${win.id} 的 sessionStorage 时出错:`, error)
      }
    }
  })

  // 额外调用主窗口的清除方法（如果存在）
  if (mainWindowManager.getWindow() && !mainWindowManager.getWindow()!.isDestroyed()) {
    mainWindowManager.clearSessionStorage()
  }
}

/**
 * 清理应用资源：先执行同步清理，再遍历贡献点的 onBeforeQuit
 */
function cleanupApp(): void {
  mainWindowManager.setQuitting(true)
  clearAllWindowsSessionStorage()
  AutoStartService.syncOnQuit()
  for (const c of contributions) {
    if (c.onBeforeQuit) {
      c.onBeforeQuit()
    }
  }
}

/**
 * 处理第二个实例启动
 * 当用户尝试启动第二个实例时，激活现有窗口而不是创建新实例
 */
function handleSecondInstance(): void {
  // 使用主窗口管理器的 show 方法，它会自动处理窗口状态和配置检查
  mainWindowManager.show()
}

/**
 * 启用单实例模式
 * 确保只有一个应用实例在运行
 */
function enableSingleInstanceLock(): boolean {
  // 请求单实例锁
  const gotTheLock = app.requestSingleInstanceLock()

  if (!gotTheLock) {
    // 如果获取锁失败，说明已经有一个实例在运行
    app.quit()
    return false
  }

  // 监听第二个实例的启动请求
  app.on('second-instance', () => {
    handleSecondInstance()
  })

  return true
}

/**
 * 应用准备就绪
 */
// 在 app.whenReady() 之前启用单实例锁
if (!enableSingleInstanceLock()) {
  // 如果已经有实例在运行，直接退出
  process.exit(0)
}

app
  .whenReady()
  .then(async () => {
    try {
      log.sync.info('[应用启动] 开始初始化应用...')
      // 首先初始化日志系统（最早初始化，确保所有日志都能记录）
      initializeLogger()
      log.info('[应用启动] 日志系统初始化完成')

      // 注意：应用图标已通过 BrowserWindow 的 icon 选项设置（在 mainWindow.ts 中）
      // Electron 35 已移除 app.setIcon 方法，不再需要单独设置

      // 开机自启配置延后到应用就绪后执行，避免阻塞首屏（参照 VS Code 安装时处理、运行时少做重活）
      setImmediate(() => AutoStartService.initialize())

      log.info('[应用启动] 开始初始化应用模块...')
      await initializeApp()
      log.info('[应用启动] 应用初始化完成')

      // macOS 特性：点击 dock 图标时重新创建窗口
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          mainWindowManager.createWindow()
        } else {
          // 如果有窗口存在，激活主窗口
          mainWindowManager.show()
        }
      })
    } catch (error) {
      log.error('[应用启动] 应用初始化失败:', error)
      if (error instanceof Error && error.stack) {
        log.error('[应用启动] 错误堆栈:', error.stack)
      }
      app.quit()
    }
  })
  .catch(error => {
    log.sync.error('[应用启动] whenReady 失败:', error)
    if (error instanceof Error && error.stack) {
      log.sync.error('[应用启动] 错误堆栈:', error.stack)
    }
    app.quit()
  })

/**
 * 所有窗口关闭时的处理
 * 由于有系统托盘，所以不自动退出应用
 */
app.on('window-all-closed', () => {
  // 有托盘时，关闭所有窗口不退出应用
  // 用户需要从托盘菜单选择"退出"来关闭应用
})

/**
 * 应用准备退出前
 */
app.on('before-quit', () => {
  cleanupApp()
})
