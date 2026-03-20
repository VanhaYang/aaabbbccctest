import { screenshotManager } from '../../screenshot'
import type { ToolExecutor, ToolResult } from '../types'

export const screenshot: ToolExecutor = async (args): Promise<ToolResult> => {
  let displayId: number | undefined
  if (typeof args.displayId === 'number' && Number.isFinite(args.displayId)) {
    displayId = args.displayId
  }

  try {
    const imageBuffer = await screenshotManager.captureScreen(displayId)
    const base64 = imageBuffer.toString('base64')
    return {
      success: true,
      data: {
        imageBase64: base64,
        mimeType: 'image/png',
        size: imageBuffer.length
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '截图失败'
    return { success: false, message, code: 500 }
  }
}
