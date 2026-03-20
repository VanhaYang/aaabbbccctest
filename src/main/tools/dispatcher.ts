import log from '../logger'
import type { ToolId, ToolResult } from './types'
import { getTool } from './registry'

/**
 * 执行指定工具
 * @param toolId 工具 id（与 OpenClaw 一致）
 * @param args 参数对象
 * @returns 统一格式的 ToolResult
 */
export async function executeTool(
  toolId: ToolId,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const executor = getTool(toolId)
  if (!executor) {
    return {
      success: false,
      message: `未知工具: ${toolId}`,
      code: 404
    }
  }

  try {
    const result = await Promise.resolve(executor(args))
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : '工具执行失败'
    log.error(`[Tools] ${toolId} 执行异常:`, error)
    return {
      success: false,
      message,
      code: 500
    }
  }
}
