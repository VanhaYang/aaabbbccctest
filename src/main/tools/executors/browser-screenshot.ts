import type { ToolExecutor, ToolResult } from '../types'
import { isExternalBrowserConfigured, externalBrowserScreenshot } from '../../services/externalBrowserProxy'

export const browser_screenshot: ToolExecutor = async (args): Promise<ToolResult> => {
  if (!isExternalBrowserConfigured()) {
    return {
      success: false,
      message: '浏览器控制未启用：请在配置中设置 browser.enabled 为 true',
      code: 503
    }
  }
  try {
    const result = await externalBrowserScreenshot({
      targetId: typeof args.targetId === 'string' ? args.targetId : undefined,
      fullPage: args.fullPage === true,
      ref: typeof args.ref === 'string' ? args.ref : undefined,
      element: typeof args.element === 'string' ? args.element : undefined,
      type: args.type === 'jpeg' ? 'jpeg' : 'png',
      profile: typeof args.profile === 'string' ? args.profile : undefined,
      timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined
    })
    return { success: true, data: result }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'browser_screenshot 失败'
    return { success: false, message, code: 500 }
  }
}
