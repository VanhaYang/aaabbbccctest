import type { ToolExecutor, ToolResult } from '../types'
import { isExternalBrowserConfigured, externalBrowserAct } from '../../services/externalBrowserProxy'

export const browser_act: ToolExecutor = async (args): Promise<ToolResult> => {
  if (!isExternalBrowserConfigured()) {
    return {
      success: false,
      message: '浏览器控制未启用：请在配置中设置 browser.enabled 为 true',
      code: 503
    }
  }
  const kind = typeof args.kind === 'string' ? args.kind.trim() : ''
  if (!kind) {
    return { success: false, message: 'kind is required', code: 400 }
  }
  try {
    const modifiers = Array.isArray(args.modifiers)
      ? (args.modifiers as unknown[]).filter((m): m is string => typeof m === 'string')
      : undefined
    const result = await externalBrowserAct({
      kind,
      targetId: typeof args.targetId === 'string' ? args.targetId : undefined,
      ref: typeof args.ref === 'string' ? args.ref : undefined,
      text: typeof args.text === 'string' ? args.text : undefined,
      key: typeof args.key === 'string' ? args.key : undefined,
      value: typeof args.value === 'string' ? args.value : undefined,
      button: typeof args.button === 'string' ? args.button : undefined,
      doubleClick: args.doubleClick === true,
      modifiers,
      submit: args.submit === true,
      slowly: args.slowly === true,
      timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined,
      delayMs: typeof args.delayMs === 'number' ? args.delayMs : undefined,
      profile: typeof args.profile === 'string' ? args.profile : undefined
    })
    return { success: true, data: result }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'browser_act 失败'
    return { success: false, message, code: 500 }
  }
}
