import type http from 'http'
import log from '../../logger'
import { mouseController } from '../../mouseController'
import { parseRequestBody, sendJsonResponse } from '../utils'

export async function handleGetMousePosition(
  _req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const pos = await mouseController.getMousePos()
    sendJsonResponse(res, 200, pos)
  } catch (error) {
    log.error('[API Server] 获取鼠标位置失败:', error)
    const errorMessage = error instanceof Error ? error.message : '获取鼠标位置失败'
    sendJsonResponse(res, 500, null, errorMessage, false)
  }
}

export async function handleMoveMouse(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const body = await parseRequestBody(req)
    const { x, y, smooth = false, displayId } = body

    if (typeof x !== 'number' || typeof y !== 'number') {
      sendJsonResponse(res, 400, null, '参数错误：x 和 y 必须是数字', false)
      return
    }

    let targetX = x
    let targetY = y

    if (typeof displayId === 'number') {
      const globalPos = mouseController.convertDisplayCoordsToGlobal(displayId, x, y)
      if (!globalPos) {
        sendJsonResponse(res, 400, null, '无效的显示器 ID', false)
        return
      }
      targetX = globalPos.x
      targetY = globalPos.y
    }

    await mouseController.moveMouse(targetX, targetY, smooth)
    sendJsonResponse(res, 200, { x: targetX, y: targetY })
  } catch (error) {
    log.error('[API Server] 移动鼠标失败:', error)
    const errorMessage = error instanceof Error ? error.message : '移动鼠标失败'
    sendJsonResponse(res, 500, null, errorMessage, false)
  }
}

export async function handleClickMouse(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const body = await parseRequestBody(req)
    const { x, y, button = 'left', double = false, displayId } = body

    if (x !== undefined && y !== undefined) {
      if (typeof x !== 'number' || typeof y !== 'number') {
        sendJsonResponse(res, 400, null, '参数错误：x 和 y 必须是数字', false)
        return
      }

      let targetX = x
      let targetY = y

      if (typeof displayId === 'number') {
        const globalPos = mouseController.convertDisplayCoordsToGlobal(displayId, x, y)
        if (!globalPos) {
          sendJsonResponse(res, 400, null, '无效的显示器 ID', false)
          return
        }
        targetX = globalPos.x
        targetY = globalPos.y
      }

      await mouseController.clickMouse(targetX, targetY, { button, double })
    } else {
      await mouseController.clickMouse(undefined, undefined, { button, double })
    }

    sendJsonResponse(res, 200, { success: true })
  } catch (error) {
    log.error('[API Server] 点击鼠标失败:', error)
    const errorMessage = error instanceof Error ? error.message : '点击鼠标失败'
    sendJsonResponse(res, 500, null, errorMessage, false)
  }
}

export async function handleDragMouse(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const body = await parseRequestBody(req)
    const { startX, startY, endX, endY, duration = 100, displayId } = body

    if (
      typeof startX !== 'number' ||
      typeof startY !== 'number' ||
      typeof endX !== 'number' ||
      typeof endY !== 'number'
    ) {
      sendJsonResponse(res, 400, null, '参数错误：坐标必须是数字', false)
      return
    }

    let globalStartX = startX
    let globalStartY = startY
    let globalEndX = endX
    let globalEndY = endY

    if (typeof displayId === 'number') {
      const globalStart = mouseController.convertDisplayCoordsToGlobal(displayId, startX, startY)
      const globalEnd = mouseController.convertDisplayCoordsToGlobal(displayId, endX, endY)
      if (!globalStart || !globalEnd) {
        sendJsonResponse(res, 400, null, '无效的显示器 ID', false)
        return
      }
      globalStartX = globalStart.x
      globalStartY = globalStart.y
      globalEndX = globalEnd.x
      globalEndY = globalEnd.y
    }

    await mouseController.dragMouse(globalStartX, globalStartY, globalEndX, globalEndY, {
      duration
    })
    sendJsonResponse(res, 200, { success: true })
  } catch (error) {
    log.error('[API Server] 拖动鼠标失败:', error)
    const errorMessage = error instanceof Error ? error.message : '拖动鼠标失败'
    sendJsonResponse(res, 500, null, errorMessage, false)
  }
}

export async function handleScrollMouse(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const body = await parseRequestBody(req)
    const { x, y, direction = 'down', amount = 3, displayId } = body

    if (typeof x !== 'number' || typeof y !== 'number') {
      sendJsonResponse(res, 400, null, '参数错误：x 和 y 必须是数字', false)
      return
    }

    if (direction !== 'up' && direction !== 'down') {
      sendJsonResponse(res, 400, null, '参数错误：direction 必须是 "up" 或 "down"', false)
      return
    }

    let targetX = x
    let targetY = y

    if (typeof displayId === 'number') {
      const globalPos = mouseController.convertDisplayCoordsToGlobal(displayId, x, y)
      if (!globalPos) {
        sendJsonResponse(res, 400, null, '无效的显示器 ID', false)
        return
      }
      targetX = globalPos.x
      targetY = globalPos.y
    }

    await mouseController.scrollMouse(targetX, targetY, direction, amount)
    sendJsonResponse(res, 200, { success: true })
  } catch (error) {
    log.error('[API Server] 滚动鼠标失败:', error)
    const errorMessage = error instanceof Error ? error.message : '滚动鼠标失败'
    sendJsonResponse(res, 500, null, errorMessage, false)
  }
}

export async function handleGetPixelColor(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const urlString = req.url || '/mouse/pixel'
    const queryIndex = urlString.indexOf('?')
    if (queryIndex === -1) {
      sendJsonResponse(res, 400, null, '参数错误：需要提供 x 和 y 坐标', false)
      return
    }

    const queryString = urlString.substring(queryIndex + 1)
    const params = new URLSearchParams(queryString)
    const x = params.get('x')
    const y = params.get('y')
    const displayIdParam = params.get('displayId')

    if (!x || !y) {
      sendJsonResponse(res, 400, null, '参数错误：需要提供 x 和 y 坐标', false)
      return
    }

    const xNum = parseInt(x, 10)
    const yNum = parseInt(y, 10)

    if (isNaN(xNum) || isNaN(yNum)) {
      sendJsonResponse(res, 400, null, '参数错误：x 和 y 必须是数字', false)
      return
    }

    let targetX = xNum
    let targetY = yNum

    if (displayIdParam) {
      const displayId = parseInt(displayIdParam, 10)
      if (!isNaN(displayId)) {
        const globalPos = mouseController.convertDisplayCoordsToGlobal(displayId, xNum, yNum)
        if (!globalPos) {
          sendJsonResponse(res, 400, null, '无效的显示器 ID', false)
          return
        }
        targetX = globalPos.x
        targetY = globalPos.y
      }
    }

    const color = await mouseController.getPixelColor(targetX, targetY)
    sendJsonResponse(res, 200, { x: targetX, y: targetY, color: `#${color}` })
  } catch (error) {
    log.error('[API Server] 获取像素颜色失败:', error)
    const errorMessage = error instanceof Error ? error.message : '获取像素颜色失败'
    sendJsonResponse(res, 500, null, errorMessage, false)
  }
}

export async function handleGetScreenSize(
  _req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const size = await mouseController.getScreenSize()
    sendJsonResponse(res, 200, size)
  } catch (error) {
    log.error('[API Server] 获取屏幕尺寸失败:', error)
    const errorMessage = error instanceof Error ? error.message : '获取屏幕尺寸失败'
    sendJsonResponse(res, 500, null, errorMessage, false)
  }
}
