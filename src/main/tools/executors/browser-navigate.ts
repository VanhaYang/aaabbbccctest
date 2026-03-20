import type { ToolExecutor, ToolResult } from '../types'
import { isExternalBrowserConfigured, externalBrowserNavigate } from '../../services/externalBrowserProxy'

export const browser_navigate: ToolExecutor = async (args): Promise<ToolResult> => {
  if (!isExternalBrowserConfigured()) {
    return {
      success: false,
      message: '浏览器控制未启用：请在配置中设置 browser.enabled 为 true',
      code: 503
    }
  }
  const url = typeof args.url === 'string' ? args.url.trim() : ''
  if (!url) {
    return { success: false, message: 'url is required', code: 400 }
  }
  try {
    const result = await externalBrowserNavigate({
      url,
      targetId: typeof args.targetId === 'string' ? args.targetId : undefined,
      profile: typeof args.profile === 'string' ? args.profile : undefined,
      timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined
    })
    return { success: true, data: result }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'browser_navigate 失败'
    return { success: false, message, code: 500 }
  }
}
