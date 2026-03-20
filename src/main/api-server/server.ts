import http from 'http'
import { networkInterfaces } from 'os'
import { handleDisplaysRequest, handleSourcesRequest } from './handlers/display'
import { handleScreenshotRequest } from './handlers/screenshot'
import {
  handleClickMouse,
  handleDragMouse,
  handleGetMousePosition,
  handleGetPixelColor,
  handleGetScreenSize,
  handleMoveMouse,
  handleScrollMouse
} from './handlers/mouse'
import {
  handleTerminalExecute,
  handleTerminalKill,
  handleTerminalSession
} from './handlers/terminal'
import {
  handleWorkspaceEditsRequest,
  handleWorkspaceFileRequest,
  handleWorkspaceFilesRequest,
  handleWorkspaceSearchRequest,
  handleWorkspaceWriteRequest
} from './handlers/workspace'
import {
  getToolIdFromPath,
  handleToolsExecuteRequest,
  handleToolsListRequest,
  handleToolsMethodRequest
} from './handlers/tools'
import {
  handleBrowserNavigate,
  handleBrowserSnapshot,
  handleBrowserScreenshot,
  handleBrowserAct
} from './handlers/browser'
import log from '../logger'
import { sendJsonResponse } from './utils'

/**
 * API 服务器管理模块
 * 职责：提供外部 HTTP 接口服务
 */

export interface ApiServerConfig {
  port: number
  host?: string
  authToken?: string
}

export class ApiServer {
  private server: http.Server | null = null
  private port: number
  private host: string
  private authToken?: string

  constructor(config: ApiServerConfig) {
    this.port = config.port
    this.host = config.host || '0.0.0.0'
    this.authToken = config.authToken
  }

  /**
   * 启动服务器
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        resolve()
        return
      }

      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res)
      })

      this.server.listen(this.port, this.host, () => {
        resolve()
      })

      this.server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          log.error(`[API Server] 端口 ${this.port} 已被占用，请更换端口`)
        } else {
          log.error('[API Server] 服务器启动失败:', error)
        }
        reject(error)
      })
    })
  }

  /**
   * 停止服务器
   */
  stop(): Promise<void> {
    return new Promise(resolve => {
      if (!this.server) {
        resolve()
        return
      }

      this.server.close(() => {
        this.server = null
        resolve()
      })
    })
  }

  /**
   * 处理 HTTP 请求
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // 设置 CORS 头，允许跨域访问
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    // 处理 OPTIONS 预检请求
    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }

    // 支持 GET 和 POST 请求
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          data: '',
          code: 405,
          message: 'Method Not Allowed',
          success: false
        })
      )
      return
    }

    // 鉴权检查（如果设置了 Token）
    if (!this.isAuthorized(req)) {
      sendJsonResponse(res, 401, null, 'Unauthorized', false)
      return
    }

    const url = req.url || '/'
    let urlPath = url.split('?')[0] // 获取路径部分，忽略查询参数
    // 规范化路径：移除尾随斜杠（除了根路径）
    if (urlPath.length > 1 && urlPath.endsWith('/')) {
      urlPath = urlPath.slice(0, -1)
    }

    // 处理 /displays 接口
    if (urlPath === '/displays') {
      handleDisplaysRequest(req, res)
      return
    }

    // 处理 /sources 接口（调试用，查看 desktopCapturer 的实际 display_id）
    if (urlPath === '/sources') {
      handleSourcesRequest(req, res)
      return
    }

    // 处理 /screenshot 接口
    if (urlPath === '/screenshot' || url.startsWith('/screenshot?')) {
      handleScreenshotRequest(req, res)
      return
    }

    // 处理鼠标控制接口（需要 POST 请求）
    if (urlPath === '/mouse/position' && req.method === 'GET') {
      handleGetMousePosition(req, res)
      return
    }

    if (urlPath === '/mouse/move' && req.method === 'POST') {
      handleMoveMouse(req, res)
      return
    }

    if (urlPath === '/mouse/click' && req.method === 'POST') {
      handleClickMouse(req, res)
      return
    }

    if (urlPath === '/mouse/drag' && req.method === 'POST') {
      handleDragMouse(req, res)
      return
    }

    if (urlPath === '/mouse/scroll' && req.method === 'POST') {
      handleScrollMouse(req, res)
      return
    }

    if (urlPath === '/mouse/pixel' && req.method === 'GET') {
      handleGetPixelColor(req, res)
      return
    }

    if (urlPath === '/screen/size' && req.method === 'GET') {
      handleGetScreenSize(req, res)
      return
    }

    // 处理终端执行接口
    if (urlPath === '/terminal/execute' && req.method === 'POST') {
      handleTerminalExecute(req, res)
      return
    }

    if (urlPath === '/terminal/kill' && req.method === 'POST') {
      handleTerminalKill(req, res)
      return
    }

    if (urlPath === '/terminal/session' && req.method === 'GET') {
      handleTerminalSession(req, res)
      return
    }

    // 处理工作区文件列表接口
    if (urlPath === '/workspace/files' && req.method === 'GET') {
      handleWorkspaceFilesRequest(req, res)
      return
    }

    // 处理工作区搜索接口
    if (urlPath === '/workspace/search' && req.method === 'POST') {
      handleWorkspaceSearchRequest(req, res)
      return
    }

    // 处理工作区读取文件接口
    if (urlPath === '/workspace/file' && req.method === 'GET') {
      handleWorkspaceFileRequest(req, res)
      return
    }

    // 处理工作区写入文件接口
    if (urlPath === '/workspace/write' && req.method === 'POST') {
      handleWorkspaceWriteRequest(req, res)
      return
    }

    // 处理工作区精准编辑接口
    if (urlPath === '/workspace/edits' && req.method === 'POST') {
      handleWorkspaceEditsRequest(req, res)
      return
    }

    // 内部浏览器（Electron BrowserWindow），与 OpenClaw browser 参数约定一致
    if (urlPath === '/browser/navigate' && req.method === 'POST') {
      void handleBrowserNavigate(req, res)
      return
    }
    if (urlPath === '/browser/snapshot' && req.method === 'GET') {
      void handleBrowserSnapshot(req, res)
      return
    }
    if (urlPath === '/browser/screenshot' && req.method === 'POST') {
      void handleBrowserScreenshot(req, res)
      return
    }
    if (urlPath === '/browser/act' && req.method === 'POST') {
      void handleBrowserAct(req, res)
      return
    }

    // 工具层：按方法拆开的接口（与 function calling 一一对应，推荐）
    if (req.method === 'POST') {
      const toolId = getToolIdFromPath(urlPath)
      if (toolId) {
        void handleToolsMethodRequest(req, res, toolId)
        return
      }
    }
    // 工具层统一入口（兼容）与列表
    if (urlPath === '/tools/execute' && req.method === 'POST') {
      handleToolsExecuteRequest(req, res)
      return
    }
    if (urlPath === '/tools/list' && req.method === 'GET') {
      handleToolsListRequest(req, res)
      return
    }

    // 404 处理
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        data: '',
        code: 404,
        message: 'Not Found',
        success: false
      })
    )
  }

  /**
   * 获取本机 IP 地址
   */
  private getLocalIP(): string | null {
    const interfaces = networkInterfaces()

    for (const name of Object.keys(interfaces)) {
      const nets = interfaces[name]
      if (!nets) continue

      for (const net of nets) {
        // 跳过内部（即 127.0.0.1）和非 IPv4 地址
        if (net.family === 'IPv4' && !net.internal) {
          return net.address
        }
      }
    }

    return null
  }

  private isAuthorized(req: http.IncomingMessage): boolean {
    if (!this.authToken) {
      return true
    }

    const authHeader = req.headers.authorization || ''
    if (!authHeader) {
      return false
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : authHeader.trim()
    return token.length > 0 && token === this.authToken
  }

  /**
   * 获取服务器信息
   */
  getServerInfo(): { port: number; host: string; localIP: string | null } {
    return {
      port: this.port,
      host: this.host,
      localIP: this.getLocalIP()
    }
  }
}
