/**
 * 工具层类型定义
 * 与 OpenClaw tool-catalog 的 id/参数约定对齐，便于决策端复用 schema
 */

/** 工具执行器：接收参数对象，返回统一结果 */
export type ToolExecutor = (
  args: Record<string, unknown>
) => Promise<ToolResult> | ToolResult

/** 工具执行结果，与 API 响应 data/code/message/success 对齐 */
export interface ToolResult {
  success: boolean
  data?: unknown
  message?: string
  code?: number
}

/** 首期支持的工具 id（与 OpenClaw 一致）；browser_* 为外部浏览器，与 OpenClaw browser 行为一致 */
export type ToolId =
  | 'read'
  | 'write'
  | 'edit'
  | 'exec'
  | 'screenshot'
  | 'mouse_move'
  | 'mouse_click'
  | 'apply_patch'
  | 'browser_navigate'
  | 'browser_snapshot'
  | 'browser_screenshot'
  | 'browser_act'
