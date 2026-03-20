/**
 * apply_patch 工具执行器：使用 OpenClaw 格式的 patch，通过 DesktopBridge 应用。
 */
import { createDesktopBridge } from '../openclaw/adapter'
import { applyPatch } from '../openclaw/apply-patch'
import type { ToolExecutor, ToolResult } from '../types'

export const apply_patch: ToolExecutor = async (args): Promise<ToolResult> => {
  const input = typeof args.input === 'string' ? args.input : ''
  if (!input.trim()) {
    return { success: false, message: '参数错误：需要提供 input（patch 内容）', code: 400 }
  }

  try {
    const bridge = createDesktopBridge()
    const result = await applyPatch(input.trim(), bridge)
    return {
      success: true,
      data: {
        summary: result.summary,
        text: result.text
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'apply_patch 执行失败'
    return { success: false, message, code: 400 }
  }
}
