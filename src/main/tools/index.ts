/**
 * 工具层入口：注册所有执行器，供 API 层调用
 * 与 OpenClaw tool-catalog 的 id 对齐
 */
import { registerTool } from './registry'
import { read } from './executors/read'
import { write } from './executors/write'
import { edit } from './executors/edit'
import { exec } from './executors/exec'
import { screenshot } from './executors/screenshot'
import { mouse_move, mouse_click } from './executors/mouse'
import { apply_patch } from './executors/apply-patch'
import { browser_navigate } from './executors/browser-navigate'
import { browser_snapshot } from './executors/browser-snapshot'
import { browser_screenshot } from './executors/browser-screenshot'
import { browser_act } from './executors/browser-act'

function initTools(): void {
  registerTool('read', read)
  registerTool('write', write)
  registerTool('edit', edit)
  registerTool('exec', exec)
  registerTool('screenshot', screenshot)
  registerTool('mouse_move', mouse_move)
  registerTool('mouse_click', mouse_click)
  registerTool('apply_patch', apply_patch)
  registerTool('browser_navigate', browser_navigate)
  registerTool('browser_snapshot', browser_snapshot)
  registerTool('browser_screenshot', browser_screenshot)
  registerTool('browser_act', browser_act)
}

let initialized = false
export function ensureToolsInitialized(): void {
  if (!initialized) {
    initTools()
    initialized = true
  }
}

export { executeTool } from './dispatcher'
export { listToolIds } from './registry'
export type { ToolId, ToolResult } from './types'
