import type http from 'http'
import log from '../../logger'
import { screenshotManager } from '../../screenshot'

export async function handleScreenshotRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    let displayId: number | undefined = undefined
    const urlString = req.url || '/screenshot'
    const queryIndex = urlString.indexOf('?')
    if (queryIndex !== -1) {
      const queryString = urlString.substring(queryIndex + 1)
      const params = new URLSearchParams(queryString)
      const displayIdParam = params.get('displayId')
      if (displayIdParam) {
        displayId = parseInt(displayIdParam, 10)
        if (isNaN(displayId)) {
          displayId = undefined
        }
      }
    }

    const imageBuffer = await screenshotManager.captureScreen(displayId)

    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': imageBuffer.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0'
    })
    res.end(imageBuffer)
  } catch (error) {
    log.error('[API Server] 截图失败:', error)
    const errorMessage = error instanceof Error ? error.message : '截图失败'

    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(
      JSON.stringify({
        data: '',
        code: 500,
        message: errorMessage,
        success: false
      })
    )
  }
}
