import type { ToolExecutor, ToolResult } from '../types'
import { isExternalBrowserConfigured, externalBrowserSnapshot } from '../../services/externalBrowserProxy'

export const browser_snapshot: ToolExecutor = async (args): Promise<ToolResult> => {
  if (!isExternalBrowserConfigured()) {
    return {
      success: false,
      message: '浏览器控制未启用：请在配置中设置 browser.enabled 为 true',
      code: 503
    }
  }
  try {
    const result = await externalBrowserSnapshot({
      targetId: typeof args.targetId === 'string' ? args.targetId : undefined,
      format: typeof args.format === 'string' ? args.format : undefined,
      mode: typeof args.mode === 'string' ? args.mode : undefined,
      maxChars: typeof args.maxChars === 'number' ? args.maxChars : undefined,
      profile: typeof args.profile === 'string' ? args.profile : undefined,
      timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined
    })
    return { success: true, data: result }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'browser_snapshot 失败'
    return { success: false, message, code: 500 }
  }
}
