import { contextBridge, ipcRenderer } from 'electron'
import type { CaptureWindowData, DisplayInfo } from '../shared/types'
import type { AIBotConfig } from '../shared/types'

/**
 * 预加载脚本
 * 在渲染进程中暴露安全的 API
 */

/** IPC 通用成功响应 */
export interface IpcSuccess<T = unknown> {
  success: true
  config?: T
  [key: string]: unknown
}

/** IPC 通用失败响应 */
export interface IpcError {
  success: false
  error: string
}

/** 配置回调接收的配置结构（与主进程 AppConfig 对齐） */
export interface AppConfigPayload {
  aiBot?: AIBotConfig
  autoStart?: boolean
  floatingTriggerEnabled?: boolean
  showBrowserWindow?: boolean
  workspacePath?: string
  lastUpdated?: number
  version?: string
}

/** 更新状态事件载荷 */
export interface UpdateStatusPayload {
  event: string
  data?: { version?: string; releaseNotes?: string; [key: string]: unknown }
}

/** 终端执行完成载荷 */
export interface TerminalExecutionCompletePayload {
  result: { exitCode: number; stdout: string; stderr: string; duration: number; killed: boolean }
  parsed?: { raw: string; cleaned: string; isError: boolean }
}

// 定义暴露给渲染进程的 API
const api = {
  // 截图相关 API
  screenshot: {
    start: (): Promise<IpcSuccess | IpcError> => ipcRenderer.invoke('screenshot:start'),
    finish: (imageData: string): Promise<IpcSuccess | IpcError> =>
      ipcRenderer.invoke('screenshot:finish', imageData),
    save: (imageData: string): Promise<IpcSuccess | IpcError> =>
      ipcRenderer.invoke('screenshot:save', imageData),
    copy: (imageData: string): Promise<IpcSuccess | IpcError> =>
      ipcRenderer.invoke('screenshot:copy', imageData),
    cancel: (showMainWindow: boolean = false): Promise<IpcSuccess | IpcError> =>
      ipcRenderer.invoke('screenshot:cancel', showMainWindow),
    getDisplays: (): Promise<IpcSuccess<DisplayInfo[]> | IpcError> =>
      ipcRenderer.invoke('screenshot:get-displays'),
    uploadToWebsite: (imageData: string): Promise<IpcSuccess | IpcError> =>
      ipcRenderer.invoke('screenshot:upload-to-website', imageData),
    // 监听截图数据（支持多屏幕）
    onImageData: (callback: (data: CaptureWindowData) => void) => {
      ipcRenderer.on('screenshot:image-data', (_event, data: CaptureWindowData) => callback(data))
    },
    // 移除监听器
    removeImageDataListener: () => {
      ipcRenderer.removeAllListeners('screenshot:image-data')
    },
    // 监听窗口隐藏事件
    onWindowHidden: (callback: () => void) => {
      ipcRenderer.on('screenshot:window-hidden', () => callback())
    },
    // 移除窗口隐藏监听器
    removeWindowHiddenListener: () => {
      ipcRenderer.removeAllListeners('screenshot:window-hidden')
    }
  },

  // 窗口相关 API
  window: {
    minimize: (): Promise<IpcSuccess | IpcError> => ipcRenderer.invoke('window:minimize'),
    maximize: (): Promise<IpcSuccess | IpcError> => ipcRenderer.invoke('window:maximize'),
    close: (): Promise<IpcSuccess | IpcError> => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<IpcSuccess<boolean> | IpcError> =>
      ipcRenderer.invoke('window:is-maximized'),
    // 监听窗口可见性变化
    onVisibilityChanged: (callback: (visible: boolean) => void) => {
      ipcRenderer.on('window:visibility-changed', (_event, visible) => callback(visible))
    },
    removeVisibilityListener: () => {
      ipcRenderer.removeAllListeners('window:visibility-changed')
    },
    // 监听窗口最大化状态变化
    onMaximizedChanged: (callback: (isMaximized: boolean) => void) => {
      ipcRenderer.on('window:maximized-changed', (_event, isMaximized) => callback(isMaximized))
    },
    removeMaximizedListener: () => {
      ipcRenderer.removeAllListeners('window:maximized-changed')
    }
  },

  // 配置相关 API
  config: {
    get: (): Promise<IpcSuccess<AppConfigPayload> | IpcError> => ipcRenderer.invoke('config:get'),
    getAIBot: (): Promise<IpcSuccess<AIBotConfig | null> | IpcError> =>
      ipcRenderer.invoke('config:get-aibot'),
    saveAIBot: (config: AIBotConfig): Promise<IpcSuccess | IpcError> =>
      ipcRenderer.invoke('config:save-aibot', config),
    clearAIBot: (): Promise<IpcSuccess | IpcError> => ipcRenderer.invoke('config:clear-aibot'),
    export: (): Promise<IpcSuccess | IpcError> => ipcRenderer.invoke('config:export'),
    import: (): Promise<IpcSuccess | IpcError> => ipcRenderer.invoke('config:import'),
    reset: (): Promise<IpcSuccess | IpcError> => ipcRenderer.invoke('config:reset'),
    restartApp: (): Promise<IpcSuccess | IpcError> => ipcRenderer.invoke('config:restart-app'),
    getAutoStart: (): Promise<IpcSuccess<boolean> | IpcError> =>
      ipcRenderer.invoke('config:get-auto-start'),
    setAutoStart: (enabled: boolean): Promise<IpcSuccess | IpcError> =>
      ipcRenderer.invoke('config:set-auto-start', enabled),
    getFloatingTriggerEnabled: (): Promise<IpcSuccess<boolean> | IpcError> =>
      ipcRenderer.invoke('config:get-floating-trigger-enabled'),
    setFloatingTriggerEnabled: (enabled: boolean): Promise<IpcSuccess | IpcError> =>
      ipcRenderer.invoke('config:set-floating-trigger-enabled', enabled),
    getShowBrowserWindow: (): Promise<IpcSuccess<boolean> | IpcError> =>
      ipcRenderer.invoke('config:get-show-browser-window'),
    setShowBrowserWindow: (show: boolean): Promise<IpcSuccess | IpcError> =>
      ipcRenderer.invoke('config:set-show-browser-window', show),
    getWorkspacePath: (): Promise<IpcSuccess<string> | IpcError> =>
      ipcRenderer.invoke('config:get-workspace-path'),
    setWorkspacePath: (path: string): Promise<IpcSuccess | IpcError> =>
      ipcRenderer.invoke('config:set-workspace-path', path),
    selectWorkspacePath: (): Promise<IpcSuccess<string | null> | IpcError> =>
      ipcRenderer.invoke('config:select-workspace-path'),
    validateWorkspacePath: (path: string): Promise<IpcSuccess<{ valid: boolean; error?: string; warnings?: string[] }> | IpcError> =>
      ipcRenderer.invoke('config:validate-workspace-path', path),
    // 监听配置更新
    onUpdated: (callback: (config: AppConfigPayload) => void) => {
      ipcRenderer.on('config:updated', (_event, config: AppConfigPayload) => callback(config))
    },
    onCleared: (callback: () => void) => {
      ipcRenderer.on('config:cleared', () => callback())
    },
    onImported: (callback: (config: AppConfigPayload) => void) => {
      ipcRenderer.on('config:imported', (_event, config: AppConfigPayload) => callback(config))
    },
    onReset: (callback: () => void) => {
      ipcRenderer.on('config:reset', () => callback())
    },
    removeListeners: () => {
      ipcRenderer.removeAllListeners('config:updated')
      ipcRenderer.removeAllListeners('config:cleared')
      ipcRenderer.removeAllListeners('config:imported')
      ipcRenderer.removeAllListeners('config:reset')
    }
  },

  // 设置窗口相关 API
  settings: {
    open: (): Promise<IpcSuccess | IpcError> => ipcRenderer.invoke('settings:open'),
    close: (): Promise<IpcSuccess | IpcError> => ipcRenderer.invoke('settings:close')
  },

  // 更新相关 API
  update: {
    check: (): Promise<{ available: boolean; version?: string; error?: string }> =>
      ipcRenderer.invoke('update:check'),
    download: (): Promise<unknown> => ipcRenderer.invoke('update:download'),
    install: (): Promise<unknown> => ipcRenderer.invoke('update:install'),
    getInfo: (): Promise<unknown> => ipcRenderer.invoke('update:info'),
    // 监听更新状态
    onStatus: (callback: (data: UpdateStatusPayload) => void) => {
      ipcRenderer.on('update:status', (_event, data: UpdateStatusPayload) => callback(data))
    },
    removeStatusListener: () => {
      ipcRenderer.removeAllListeners('update:status')
    }
  },

  // 预览窗口相关 API
  preview: {
    open: (code?: string, language?: string): Promise<IpcSuccess | IpcError> =>
      ipcRenderer.invoke('preview:open', code, language),
    close: (): Promise<IpcSuccess | IpcError> => ipcRenderer.invoke('preview:close'),
    updateCode: (code: string, language?: string): Promise<IpcSuccess | IpcError> =>
      ipcRenderer.invoke('preview:update-code', code, language),
    openMedia: (dataUrl: string, fileType: string, fileName: string): Promise<IpcSuccess | IpcError> =>
      ipcRenderer.invoke('preview:open-media', dataUrl, fileType, fileName),
    // 监听代码更新
    onCodeUpdate: (callback: (data: { code: string; language: string }) => void) => {
      ipcRenderer.on('preview:update-code', (_event, data) => callback(data))
    },
    // 监听媒体预览
    onMediaOpen: (callback: (data: { dataUrl: string; fileType: string; fileName: string }) => void) => {
      ipcRenderer.on('preview:open-media', (_event, data) => callback(data))
    },
    removeCodeUpdateListener: () => {
      ipcRenderer.removeAllListeners('preview:update-code')
      ipcRenderer.removeAllListeners('preview:open-media')
    }
  },

  // 文件管理器相关 API
  fileExplorer: {
    open: (): Promise<IpcSuccess | IpcError> => ipcRenderer.invoke('file-explorer:open'),
    close: (): Promise<IpcSuccess | IpcError> => ipcRenderer.invoke('file-explorer:close'),
    refresh: (): Promise<IpcSuccess | IpcError> => ipcRenderer.invoke('file-explorer:refresh'),
    // 监听目录变化
    onDirectoryChanged: (callback: (data: { eventType: string; filename?: string; path: string }) => void) => {
      ipcRenderer.on('file-explorer:directory-changed', (_event, data) => callback(data))
    },
    // 监听刷新事件
    onRefresh: (callback: () => void) => {
      ipcRenderer.on('file-explorer:refresh', () => callback())
    },
    removeListeners: () => {
      ipcRenderer.removeAllListeners('file-explorer:directory-changed')
      ipcRenderer.removeAllListeners('file-explorer:refresh')
    },
    readFile: (filePath: string): Promise<IpcSuccess<{ content: string; encoding?: string }> | IpcError> =>
      ipcRenderer.invoke('file-explorer:read-file', filePath),
    openWithSystem: (filePath: string): Promise<IpcSuccess | IpcError> =>
      ipcRenderer.invoke('file-explorer:open-with-system', filePath)
  },

  // 文件权限相关 API
  filePermission: {
    isInWorkspace: (filePath: string): Promise<IpcSuccess<boolean> | IpcError> =>
      ipcRenderer.invoke('file-permission:is-in-workspace', filePath),
    hasRead: (filePath: string): Promise<IpcSuccess<boolean> | IpcError> =>
      ipcRenderer.invoke('file-permission:has-read', filePath),
    hasWrite: (filePath: string): Promise<IpcSuccess<boolean> | IpcError> =>
      ipcRenderer.invoke('file-permission:has-write', filePath),
    hasDirectoryRead: (dirPath: string): Promise<IpcSuccess<boolean> | IpcError> =>
      ipcRenderer.invoke('file-permission:has-directory-read', dirPath),
    getWorkspacePath: (): Promise<IpcSuccess<string> | IpcError> =>
      ipcRenderer.invoke('file-permission:get-workspace-path')
  },

  // IPC 事件监听（通用）
  ipcRenderer: {
    on: (channel: string, callback: (...args: unknown[]) => void) => {
      ipcRenderer.on(channel, (_event, ...args: unknown[]) => {
        if (args.length > 0 && args[0] !== undefined) {
          callback(...args)
        } else {
          console.warn(`[IPC Preload] 收到空数据 (channel: ${channel}):`, args)
        }
      })
    },
    once: (channel: string, callback: (...args: unknown[]) => void) => {
      ipcRenderer.once(channel, (_event, ...args: unknown[]) => callback(...args))
    },
    removeListener: (channel: string) => {
      ipcRenderer.removeAllListeners(channel)
    },
    invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
      return ipcRenderer.invoke(channel, ...args)
    },
    send: (channel: string, ...args: unknown[]) => {
      ipcRenderer.send(channel, ...args)
    }
  },

  // 终端相关 API
  terminal: {
    openWindow: (): Promise<IpcSuccess | IpcError> => ipcRenderer.invoke('terminal:open-window'),
    closeWindow: (): Promise<IpcSuccess | IpcError> => ipcRenderer.invoke('terminal:close-window'),
    executeCommand: (request: {
      command: string
      options?: { cwd?: string; timeout?: number }
    }): Promise<unknown> => ipcRenderer.invoke('terminal:execute-command', request),
    killCommand: (): Promise<IpcSuccess | IpcError> => ipcRenderer.invoke('terminal:kill-command'),
    changeCwd: (path: string): Promise<IpcSuccess | IpcError> =>
      ipcRenderer.invoke('terminal:change-cwd', path),
    getSessionInfo: (): Promise<unknown> => ipcRenderer.invoke('terminal:get-session-info'),
    clearHistory: (): Promise<IpcSuccess | IpcError> => ipcRenderer.invoke('terminal:clear-history'),
    // 监听实时输出
    onOutput: (callback: (data: { type: 'stdout' | 'stderr'; content: string }) => void) => {
      ipcRenderer.on('terminal:output', (_event, data) => {
        // 添加安全检查，防止 data 为 undefined
        if (data && typeof data === 'object' && 'content' in data) {
          callback(data)
        } else {
          console.warn('[Terminal Preload] 收到无效的输出数据:', data)
        }
      })
    },
    // 监听执行完成
    onExecutionComplete: (callback: (data: TerminalExecutionCompletePayload) => void) => {
      ipcRenderer.on('terminal:execution-complete', (_event, data: TerminalExecutionCompletePayload) => {
        if (data && typeof data === 'object' && 'result' in data) {
          callback(data)
        } else {
          console.warn('[Terminal Preload] 收到无效的执行完成数据:', data)
        }
      })
    },
    // 监听工作目录变化
    onCwdChanged: (callback: (data: { cwd: string }) => void) => {
      ipcRenderer.on('terminal:cwd-changed', (_event, data) => {
        // 添加安全检查，防止 data 为 undefined
        if (data && typeof data === 'object' && 'cwd' in data) {
          callback(data)
        } else {
          console.warn('[Terminal Preload] 收到无效的工作目录变化数据:', data)
        }
      })
    },
    // 移除所有监听器
    removeListeners: () => {
      ipcRenderer.removeAllListeners('terminal:output')
      ipcRenderer.removeAllListeners('terminal:execution-complete')
      ipcRenderer.removeAllListeners('terminal:cwd-changed')
    }
  }
}

// 将 API 暴露给渲染进程
contextBridge.exposeInMainWorld('electronAPI', api)

// 类型声明（供渲染进程使用）
export type ElectronAPI = typeof api
