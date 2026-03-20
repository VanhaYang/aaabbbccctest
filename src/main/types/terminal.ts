/**
 * 终端模块类型定义
 */

/**
 * 终端命令历史记录项
 */
export interface TerminalCommand {
  command: string
  timestamp: number
}

/**
 * 命令执行结果
 */
export interface ExecutionResult {
  exitCode: number
  stdout: string
  stderr: string
  duration: number
  killed: boolean
}

/**
 * 输出数据类型
 */
export type OutputType = 'stdout' | 'stderr'

/**
 * 实时输出数据
 */
export interface OutputData {
  type: OutputType
  content: string
  /**
   * 是否为流式输出（实时输出，可能不完整）
   * false 表示最终完整输出
   */
  isStreaming?: boolean
}

/**
 * 解析后的输出结果
 */
export interface ParsedOutput {
  raw: string
  cleaned: string
  isError: boolean
  errorType?: ErrorType
}

/**
 * 错误类型枚举
 */
export enum ErrorType {
  NotFound = 'NotFound',
  PermissionDenied = 'PermissionDenied',
  SyntaxError = 'SyntaxError',
  FileNotFound = 'FileNotFound',
  Timeout = 'Timeout',
  Unknown = 'Unknown'
}

/**
 * 命令执行选项
 */
export interface ExecuteOptions {
  cwd?: string
  timeout?: number
  signal?: AbortSignal
}

/**
 * IPC 执行命令请求参数
 */
export interface ExecuteCommandRequest {
  command: string
  options?: ExecuteOptions
}

/**
 * IPC 执行命令响应
 */
export interface ExecuteCommandResponse {
  success: boolean
  result?: ExecutionResult
  /** 当前 shell 工作目录（pwd） */
  cwd?: string
  /** 当前系统工作区根目录 */
  workspacePath?: string
  /** cd 失败时，尝试进入的路径（便于排查「目录不存在或无法访问」） */
  attemptedPath?: string
  error?: string
}

