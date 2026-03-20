import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import log from './logger'

/**
 * 主窗口状态（位置、大小、最大化/全屏）
 */
export interface WindowState {
  x?: number
  y?: number
  width?: number
  height?: number
  isMaximized?: boolean
  isFullScreen?: boolean
}

const DEFAULT_FILENAME = 'window-state.json'

/**
 * 窗口状态管理器
 * 负责主窗口状态的持久化，与 config.json 分离存储
 */
export class WindowStateManager {
  private statePath: string

  constructor(userDataPath?: string) {
    const base = userDataPath ?? app.getPath('userData')
    this.statePath = path.join(base, DEFAULT_FILENAME)
  }

  getStatePath(): string {
    return this.statePath
  }

  /**
   * 加载主窗口状态
   */
  load(): WindowState | undefined {
    try {
      if (fs.existsSync(this.statePath)) {
        const data = fs.readFileSync(this.statePath, 'utf-8')
        const state = JSON.parse(data) as WindowState
        return state
      }
    } catch (error) {
      log.error('加载窗口状态失败:', error)
    }
    return undefined
  }

  /**
   * 保存主窗口状态
   */
  save(state: WindowState): boolean {
    try {
      const dir = path.dirname(this.statePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2), 'utf-8')
      return true
    } catch (error) {
      log.error('保存窗口状态失败:', error)
      return false
    }
  }

  /**
   * 删除窗口状态文件（可选，用于重置）
   */
  clear(): boolean {
    try {
      if (fs.existsSync(this.statePath)) {
        fs.unlinkSync(this.statePath)
      }
      return true
    } catch (error) {
      log.error('删除窗口状态文件失败:', error)
      return false
    }
  }
}

export const windowStateManager = new WindowStateManager()
