import log from '../logger'
import { ApiServer, ApiServerConfig } from './server'

/**
 * API 服务器管理器
 * 单例模式，统一管理 API 服务器
 */

class ApiServerManager {
  private server: ApiServer | null = null
  private defaultPort = 28473 // 使用特殊端口，降低被扫描风险
  private defaultHost = '0.0.0.0'

  /**
   * 初始化并启动 API 服务器
   */
  async start(config?: Partial<ApiServerConfig>): Promise<void> {
    if (this.server) {
      return
    }

    const serverConfig: ApiServerConfig = {
      port: config?.port || this.defaultPort,
      host: config?.host || process.env.API_SERVER_HOST || this.defaultHost,
      authToken: config?.authToken || process.env.API_SERVER_TOKEN
    }

    this.server = new ApiServer(serverConfig)

    try {
      await this.server.start()
    } catch (error) {
      log.error('[API Server Manager] 启动失败:', error)
      this.server = null
      throw error
    }
  }

  /**
   * 停止 API 服务器
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return
    }

    try {
      await this.server.stop()
      this.server = null
    } catch (error) {
      log.error('[API Server Manager] 停止失败:', error)
    }
  }

  /**
   * 获取服务器信息
   */
  getServerInfo(): { port: number; host: string; localIP: string | null } | null {
    if (!this.server) {
      return null
    }
    return this.server.getServerInfo()
  }

  /**
   * 检查服务器是否运行中
   */
  isRunning(): boolean {
    return this.server !== null
  }
}

// 导出单例
export const apiServerManager = new ApiServerManager()
