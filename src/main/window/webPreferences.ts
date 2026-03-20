import type { WebPreferences } from 'electron'

/**
 * 默认 webPreferences，保证主进程所有窗口安全选项一致
 * 各窗口创建时展开此对象并覆盖 preload 等可选项
 */
export const DEFAULT_WEB_PREFERENCES: WebPreferences = {
  sandbox: false,
  contextIsolation: true,
  nodeIntegration: false
}

/**
 * 带 preload 的 webPreferences（用于需要与主进程 IPC 的窗口）
 */
export function getWebPreferencesWithPreload(preloadPath: string): WebPreferences {
  return {
    ...DEFAULT_WEB_PREFERENCES,
    preload: preloadPath
  }
}
