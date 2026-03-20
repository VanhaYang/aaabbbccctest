import { mouseController } from '../../mouseController'
import type { ToolExecutor, ToolResult } from '../types'

function resolveGlobalCoords(
  x: number,
  y: number,
  displayId?: number
): { x: number; y: number } | null {
  if (typeof displayId === 'number') {
    const globalPos = mouseController.convertDisplayCoordsToGlobal(displayId, x, y)
    return globalPos
  }
  return { x, y }
}

export const mouse_move: ToolExecutor = async (args): Promise<ToolResult> => {
  const x = typeof args.x === 'number' ? args.x : undefined
  const y = typeof args.y === 'number' ? args.y : undefined
  if (x === undefined || y === undefined) {
    return { success: false, message: '参数错误：x 和 y 必须是数字', code: 400 }
  }

  const displayId =
    typeof args.displayId === 'number' ? args.displayId : undefined
  const pos = resolveGlobalCoords(x, y, displayId)
  if (!pos) {
    return { success: false, message: '无效的显示器 ID', code: 400 }
  }

  const smooth = args.smooth === true
  await mouseController.moveMouse(pos.x, pos.y, smooth)
  return {
    success: true,
    data: { x: pos.x, y: pos.y }
  }
}

export const mouse_click: ToolExecutor = async (args): Promise<ToolResult> => {
  const x = typeof args.x === 'number' ? args.x : undefined
  const y = typeof args.y === 'number' ? args.y : undefined
  const button =
    args.button === 'right' ? 'right' : 'left'
  const double = args.double === true
  const displayId =
    typeof args.displayId === 'number' ? args.displayId : undefined

  let targetX: number | undefined
  let targetY: number | undefined
  if (x !== undefined && y !== undefined) {
    const pos = resolveGlobalCoords(x, y, displayId)
    if (!pos) {
      return { success: false, message: '无效的显示器 ID', code: 400 }
    }
    targetX = pos.x
    targetY = pos.y
  }

  await mouseController.clickMouse(targetX, targetY, { button, double })
  return { success: true, data: { success: true } }
}
