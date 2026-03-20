import type { ElectronAPI } from './index'

/**
 * 全局类型声明
 */
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
