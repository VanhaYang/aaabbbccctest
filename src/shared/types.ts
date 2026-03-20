/**
 * 共享类型定义
 */

/**
 * 截图结果
 */
export interface ScreenshotResult {
  success: boolean
  data?: Buffer
  path?: string
  error?: string
}

/**
 * 显示器信息
 */
export interface DisplayInfo {
  id: number
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
  scaleFactor: number
}

/**
 * 截图窗口接收的数据
 */
export interface CaptureWindowData {
  imageData: string
  displayId: number
  displayBounds: {
    x: number
    y: number
    width: number
    height: number
  }
  scaleFactor: number
  isPrimary: boolean
}

/**
 * 截图配置
 */
export interface ScreenshotOptions {
  format?: 'png' | 'jpg'
  quality?: number
  displayId?: number
}

/**
 * 绘制工具类型
 */
export enum DrawToolType {
  SELECT = 'select', // 选择
  RECT = 'rect', // 矩形
  CIRCLE = 'circle', // 圆形
  ARROW = 'arrow', // 箭头
  LINE = 'line', // 直线
  TEXT = 'text', // 文字
  PEN = 'pen', // 画笔
  MOSAIC = 'mosaic' // 马赛克
}

/**
 * 绘制对象基类
 */
export interface DrawObject {
  id: string
  type: DrawToolType
  color: string
  lineWidth: number
  startX: number
  startY: number
  endX?: number
  endY?: number
  points?: Array<{ x: number; y: number }>
  text?: string
  fontSize?: number
}

/**
 * 绘制数据
 */
export interface DrawData {
  type: DrawToolType
  color?: string
  lineWidth?: number
  points?: Array<{ x: number; y: number }>
  text?: string
}

/**
 * AI Bot 相关类型定义
 */

/**
 * AI Bot 消息类型
 */
export enum AIBotMessageType {
  CHAT_INIT = 'chatInit',
  GUEST_INIT = 'guestInit',
  GUEST_RELOAD_TOKEN = 'guestIReloadToken',
  RELOAD_TOKEN = 'reloadToken',
  SEND_MESSAGE = 'sendMessage',
  CHAT_OPEN = 'chatopen',
  CHAT_CLOSE = 'chatclose',
  ON_CLOSE = 'onclose',
  API_ERROR = 'apiError',
  COPY_TEXT = 'copyTextToClipboard',
  MESSAGE = 'message'
}

/**
 * AI Bot 消息结构
 */
export interface AIBotMessage {
  type: string
  data?: any
  appInstance?: string
}

/**
 * AI Bot 配置 - Guest 模式专属字段
 */
export interface AIBotGuestFields {
  appId?: string
  appKey?: string
  user?: {
    workcode?: string
    username?: string
    company?: string
    email?: string
  }
}

/**
 * AI Bot 配置 - API 模式专属字段
 */
export interface AIBotAPIFields {
  chatInitPath?: string
  renewTokenPath?: string
}

/**
 * AI Bot 统一配置结构
 * 同时保存两种模式的配置，通过 mode 字段切换
 */
export interface AIBotConfig {
  mode: 'guest' | 'api' | 'full'
  // 通用字段
  aiagentBaseUrl: string
  appInstance?: string
  // Guest 模式字段
  appId?: string
  appKey?: string
  user?: {
    workcode?: string
    username?: string
    company?: string
    email?: string
  }
  // API 模式字段
  chatInitPath?: string
  renewTokenPath?: string
  // 完整模式 SSO 登录凭证（可选）
  ssoCredentials?: {
    username?: string
    password?: string
  }
  // 完整模式环境选择（可选）
  fullModeEnvironment?: 'prod' | 'preview' | 'test' | 'dev'
}

/**
 * @deprecated 使用 AIBotConfig 代替
 */
export interface AIBotGuestConfig {
  mode: 'guest'
  appId: string
  appKey: string
  aiagentBaseUrl: string
  appInstance?: string
  user?: {
    workcode?: string
    username?: string
    company?: string
    email?: string
  }
}

/**
 * @deprecated 使用 AIBotConfig 代替
 */
export interface AIBotAPIConfig {
  mode: 'api'
  aiagentBaseUrl: string
  chatInitPath: string
  renewTokenPath: string
  appInstance?: string
}

/**
 * AI Bot 初始化响应 - Guest 模式
 */
export interface AIBotGuestInitData {
  app_id: string
  access_token: string
  app_instance: string
  user: string // Base64 编码的用户信息
}

/**
 * AI Bot 初始化响应 - API 模式
 */
export interface AIBotAPIInitData {
  refresh_token: string
  app_id: string
  access_token: string
  expired_in: number
  unique_id: string
  user: string
  user_name: string
}

/**
 * AI Bot 状态
 */
export enum AIBotStatus {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  READY = 'ready',
  ERROR = 'error'
}
