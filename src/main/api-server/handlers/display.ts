import type http from 'http'
import log from '../../logger'
import { screenshotManager } from '../../screenshot'
import { sendJsonResponse } from '../utils'

export function handleDisplaysRequest(_req: http.IncomingMessage, res: http.ServerResponse): void {
  try {
    const displays = screenshotManager.getDisplays()
    const response = {
      data: displays,
      code: 200,
      message: '',
      success: true
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(response))
  } catch (error) {
    log.error('[API Server] 获取显示器列表失败:', error)
    const errorMessage = error instanceof Error ? error.message : '获取显示器列表失败'

    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(
      JSON.stringify({
        data: [],
        code: 500,
        message: errorMessage,
        success: false
      })
    )
  }
}

export async function handleSourcesRequest(
  _req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const sources = await screenshotManager.getCapturerSources()
    const displays = screenshotManager.getDisplays()

    const mapping = sources.map((source, index) => {
      const display = displays[index] || null
      return {
        source_index: index,
        source_display_id: source.display_id,
        source_name: source.name,
        screen_id: display?.id ?? null,
        screen_bounds: display?.bounds ?? null
      }
    })

    const response = {
      data: {
        sources,
        displays,
        mapping
      },
      code: 200,
      message: '',
      success: true
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(response, null, 2))
  } catch (error) {
    log.error('[API Server] 获取屏幕源信息失败:', error)
    const errorMessage = error instanceof Error ? error.message : '获取屏幕源信息失败'
    sendJsonResponse(res, 500, null, errorMessage, false)
  }
}
