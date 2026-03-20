import { registerScreenshotIpcHandlers } from './ipc/screenshot'
import { registerWindowIpcHandlers } from './ipc/window'
import { registerConfigIpcHandlers } from './ipc/config'
import { registerSettingsIpcHandlers } from './ipc/settings'
import { registerPreviewIpcHandlers } from './ipc/preview'
import { registerTerminalIpcHandlers } from './ipc/terminal'
import { registerUpdateIpcHandlers } from './ipc/update'
import { registerFileExplorerIpcHandlers } from './ipc/fileExplorer'
import { registerFilePermissionIpcHandlers } from './ipc/filePermission'
import { registerFileIpcHandlers } from './ipc/file'

/**
 * IPC 通信管理模块
 * 职责：处理主进程和渲染进程之间的通信，协调各个模块
 */
export class IPCManager {
  /**
   * 注册所有 IPC 监听器
   */
  registerAll(): void {
    registerScreenshotIpcHandlers()
    registerWindowIpcHandlers()
    registerConfigIpcHandlers()
    registerSettingsIpcHandlers()
    registerPreviewIpcHandlers()
    registerFileIpcHandlers()
    registerUpdateIpcHandlers()
    registerFileExplorerIpcHandlers()
    registerFilePermissionIpcHandlers()
    registerTerminalIpcHandlers()
  }

}

export const ipcManager = new IPCManager()
