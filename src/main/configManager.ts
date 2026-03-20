import { app, dialog } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { AIBotConfig } from '../shared/types'
import log from './logger'

/**
 * 配置文件接口（仅应用配置，窗口状态由 windowStateManager 存储）
 */
export interface AppConfig {
  aiBot?: AIBotConfig
  autoStart?: boolean // 开机自启动
  floatingTriggerEnabled?: boolean // 悬浮触发器启用状态
  /** 打开网页时是否显示内部浏览器窗口（REST /browser/* 或 browser_navigate 等） */
  showBrowserWindow?: boolean
  workspacePath?: string // 工作区路径
  /** 浏览器控制（Playwright + 本机 Chrome）：browser_* 工具在项目内执行，不依赖外部 OpenClaw */
  browser?: {
    enabled?: boolean
    executablePath?: string
    userDataDir?: string
    port?: number
    headless?: boolean
  }
  lastUpdated: number
  version: string
}

/**
 * 配置管理器
 * 负责配置的持久化、导出、导入
 */
export class ConfigManager {
  private configPath: string
  private config: AppConfig

  constructor(userDataPath?: string) {
    const base = userDataPath ?? app.getPath('userData')
    this.configPath = path.join(base, 'config.json')

    // 初始化配置
    this.config = this.loadConfig()
  }

  /**
   * 获取配置文件路径
   */
  getConfigPath(): string {
    return this.configPath
  }

  /**
   * 加载配置
   */
  private loadConfig(): AppConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8')
        const config = JSON.parse(data) as AppConfig
        return config
      }
    } catch (error) {
      log.error('加载配置失败:', error)
    }

    // 返回默认配置
    return {
      version: app.getVersion(),
      lastUpdated: Date.now()
    }
  }

  /**
   * 保存配置
   */
  private saveConfig(): boolean {
    try {
      this.config.lastUpdated = Date.now()
      this.config.version = app.getVersion()

      const data = JSON.stringify(this.config, null, 2)
      fs.writeFileSync(this.configPath, data, 'utf-8')
      return true
    } catch (error) {
      log.error('保存配置失败:', error)
      return false
    }
  }

  /**
   * 获取完整配置
   */
  getConfig(): AppConfig {
    return { ...this.config }
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<AppConfig>): boolean {
    try {
      this.config = {
        ...this.config,
        ...updates
      }
      return this.saveConfig()
    } catch (error) {
      log.error('更新配置失败:', error)
      return false
    }
  }

  /**
   * 获取 AI Bot 配置
   */
  getAIBotConfig(): AIBotConfig | undefined {
    return this.config.aiBot
  }

  /**
   * 保存 AI Bot 配置
   */
  saveAIBotConfig(config: AIBotConfig): boolean {
    return this.updateConfig({ aiBot: config })
  }

  /**
   * 清除 AI Bot 配置
   */
  clearAIBotConfig(): boolean {
    const { aiBot, ...rest } = this.config
    this.config = rest as AppConfig
    return this.saveConfig()
  }

  /**
   * 导出配置到文件
   */
  async exportConfig(parentWindow?: Electron.BrowserWindow): Promise<{
    success: boolean
    path?: string
    error?: string
  }> {
    try {
      const result = await dialog.showSaveDialog(parentWindow || (null as any), {
        title: '导出配置',
        defaultPath: `electron-screenshot-config-${Date.now()}.json`,
        filters: [
          { name: '配置文件', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      })

      if (result.canceled || !result.filePath) {
        return { success: false }
      }

      // 导出配置（可能包含敏感信息，添加确认）
      const exportData = {
        ...this.config,
        exportedAt: Date.now(),
        exportedFrom: app.getName(),
        exportedVersion: app.getVersion()
      }

      fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf-8')

      return {
        success: true,
        path: result.filePath
      }
    } catch (error) {
      log.error('导出配置失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '导出失败'
      }
    }
  }

  /**
   * 从文件导入配置
   */
  async importConfig(parentWindow?: Electron.BrowserWindow): Promise<{
    success: boolean
    config?: AppConfig
    error?: string
  }> {
    try {
      const result = await dialog.showOpenDialog(parentWindow || (null as any), {
        title: '导入配置',
        filters: [
          { name: '配置文件', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] }
        ],
        properties: ['openFile']
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false }
      }

      const filePath = result.filePaths[0]
      const data = fs.readFileSync(filePath, 'utf-8')
      const importedConfig = JSON.parse(data)

      // 验证配置格式
      if (!this.validateConfig(importedConfig)) {
        return {
          success: false,
          error: '配置文件格式无效'
        }
      }

      // 提取有效配置（移除导出元数据）
      const { exportedAt, exportedFrom, exportedVersion, ...validConfig } = importedConfig
      this.config = validConfig as AppConfig
      this.saveConfig()

      return {
        success: true,
        config: this.config
      }
    } catch (error) {
      log.error('导入配置失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '导入失败'
      }
    }
  }

  /**
   * 验证配置格式
   */
  private validateConfig(config: any): boolean {
    try {
      // 基本字段验证
      if (typeof config !== 'object' || config === null) {
        return false
      }

      // AI Bot 配置验证
      if (config.aiBot) {
        const aiBot = config.aiBot
        if (!aiBot.mode) {
          return false
        }

        // 完整模式不需要验证任何字段
        if (aiBot.mode === 'full') {
          return true
        }

        // Guest 和 API 模式需要验证 aiagentBaseUrl
        if (!aiBot.aiagentBaseUrl) {
          return false
        }

        // 根据模式验证必要字段
        if (aiBot.mode === 'guest') {
          // Guest 模式需要 appId 和 appKey
          if (!aiBot.appId || !aiBot.appKey) {
            return false
          }
        } else if (aiBot.mode === 'api') {
          // API 模式需要 chatInitPath 和 renewTokenPath
          if (!aiBot.chatInitPath || !aiBot.renewTokenPath) {
            return false
          }
        } else {
          return false
        }
      }

      return true
    } catch (error) {
      log.error('配置验证失败:', error)
      return false
    }
  }

  /**
   * 获取开机自启动配置
   */
  getAutoStart(): boolean {
    return this.config.autoStart ?? false
  }

  /**
   * 设置开机自启动配置
   */
  setAutoStart(enabled: boolean): boolean {
    return this.updateConfig({ autoStart: enabled })
  }

  /**
   * 获取悬浮触发器启用状态
   */
  getFloatingTriggerEnabled(): boolean {
    return this.config.floatingTriggerEnabled ?? true // 默认启用
  }

  /**
   * 设置悬浮触发器启用状态
   */
  setFloatingTriggerEnabled(enabled: boolean): boolean {
    return this.updateConfig({ floatingTriggerEnabled: enabled })
  }

  /**
   * 获取「显示浏览器窗口」配置（打开网页时是否显示内部浏览器窗口）
   */
  getShowBrowserWindow(): boolean {
    return this.config.showBrowserWindow ?? true
  }

  /**
   * 设置「显示浏览器窗口」
   */
  setShowBrowserWindow(show: boolean): boolean {
    return this.updateConfig({ showBrowserWindow: show })
  }

  /**
   * 重置配置为默认值
   */
  resetConfig(): boolean {
    try {
      this.config = {
        version: app.getVersion(),
        lastUpdated: Date.now()
      }
      return this.saveConfig()
    } catch (error) {
      log.error('重置配置失败:', error)
      return false
    }
  }

  /**
   * 删除配置文件
   */
  deleteConfigFile(): boolean {
    try {
      if (fs.existsSync(this.configPath)) {
        fs.unlinkSync(this.configPath)
      }
      this.config = {
        version: app.getVersion(),
        lastUpdated: Date.now()
      }
      return true
    } catch (error) {
      log.error('删除配置文件失败:', error)
      return false
    }
  }

  /**
   * 获取工作区路径
   */
  getWorkspacePath(): string | undefined {
    return this.config.workspacePath
  }

  /**
   * 设置工作区路径
   */
  setWorkspacePath(path: string): boolean {
    return this.updateConfig({ workspacePath: path })
  }
}

// 导出单例
export const configManager = new ConfigManager()
