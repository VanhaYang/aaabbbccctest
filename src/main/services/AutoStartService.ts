import { app } from 'electron'
import log from '../logger'
import { configManager } from '../configManager'

/**
 * 开机自启动服务
 * 负责系统启动项管理与配置同步
 */
export class AutoStartService {
  /** 应用内设置启动项延后时间，避免与首屏渲染争抢导致卡顿 */
  private static readonly enableDelayMs = 500
  private static readonly quitEnableDelayMs = 50

  static isProduction(): boolean {
    return app.isPackaged
  }

  static getConfigEnabled(): boolean {
    return configManager.getAutoStart()
  }

  static updateConfig(enabled: boolean): boolean {
    return configManager.setAutoStart(enabled)
  }

  static clearSystemAutoStart(): void {
    try {
      app.setLoginItemSettings({
        openAtLogin: false
      })
    } catch (error) {
      log.error('[开机自启] 清理启动项失败:', error)
    }
  }

  static applySystemAutoStart(enabled: boolean, delayMs = AutoStartService.enableDelayMs): void {
    if (!this.isProduction()) {
      return
    }

    this.clearSystemAutoStart()

    if (!enabled) {
      return
    }

    setTimeout(() => {
      try {
        app.setLoginItemSettings({
          openAtLogin: true,
          openAsHidden: false
        })
      } catch (error) {
        log.error('[开机自启] 设置启动项失败:', error)
      }
    }, delayMs)
  }

  /**
   * 应用启动时初始化：开发环境清理，生产环境按配置应用
   */
  static initialize(): void {
    if (!this.isProduction()) {
      this.clearSystemAutoStart()
      return
    }

    const enabled = this.getConfigEnabled()
    this.applySystemAutoStart(enabled)
  }

  /**
   * 应用退出时同步系统启动项
   * 生产环境：按配置确保唯一条目；开发环境：清理残留
   */
  static syncOnQuit(): void {
    const enabled = this.getConfigEnabled()

    if (!this.isProduction()) {
      this.clearSystemAutoStart()
      return
    }

    this.clearSystemAutoStart()

    if (enabled) {
      setTimeout(() => {
        try {
          app.setLoginItemSettings({
            openAtLogin: true,
            openAsHidden: false
          })
        } catch (error) {
          log.error('[开机自启] 退出时设置启动项失败:', error)
        }
      }, this.quitEnableDelayMs)
    }
  }

  /**
   * 更新配置并在生产环境应用系统设置
   */
  static setConfigAndApply(enabled: boolean): boolean {
    const success = this.updateConfig(enabled)
    if (!success) {
      return false
    }

    if (!this.isProduction()) {
      return true
    }

    this.applySystemAutoStart(enabled)
    return true
  }
}
