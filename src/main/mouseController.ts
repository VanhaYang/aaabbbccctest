import { mouse, screen as nutScreen, Point, Button } from '@nut-tree/nut-js'
import { screen } from 'electron'

/**
 * 鼠标控制器
 * 提供鼠标操作相关的功能，包括移动、点击、拖拽、滚动等
 */
class MouseController {
  /**
   * 获取当前鼠标位置
   */
  async getMousePos(): Promise<{ x: number; y: number }> {
    const pos = await mouse.getPosition()
    return { x: pos.x, y: pos.y }
  }

  /**
   * 将相对于指定显示器的坐标转换为全局坐标
   * @param displayId 显示器 ID
   * @param x 相对于显示器的 x 坐标
   * @param y 相对于显示器的 y 坐标
   * @returns 全局坐标，如果显示器不存在则返回 null
   */
  convertDisplayCoordsToGlobal(
    displayId: number,
    x: number,
    y: number
  ): { x: number; y: number } | null {
    const displays = screen.getAllDisplays()
    const display = displays.find(d => d.id === displayId)

    if (!display) {
      return null
    }

    // 将相对于显示器的坐标转换为全局坐标
    const globalX = display.bounds.x + x
    const globalY = display.bounds.y + y

    return { x: globalX, y: globalY }
  }

  /**
   * 移动鼠标
   * @param x 目标 x 坐标
   * @param y 目标 y 坐标
   * @param smooth 是否平滑移动
   */
  async moveMouse(x: number, y: number, smooth?: boolean): Promise<void> {
    if (smooth) {
      await mouse.move([new Point(x, y)])
    } else {
      await mouse.setPosition(new Point(x, y))
    }
  }

  /**
   * 点击鼠标
   * @param x 可选的 x 坐标，如果不提供则使用当前位置
   * @param y 可选的 y 坐标，如果不提供则使用当前位置
   * @param options 点击选项
   */
  async clickMouse(
    x?: number,
    y?: number,
    options?: { button?: 'left' | 'right' | 'middle'; double?: boolean }
  ): Promise<void> {
    const { button = 'left', double = false } = options || {}

    // 如果提供了坐标，先移动鼠标
    if (x !== undefined && y !== undefined) {
      await mouse.setPosition(new Point(x, y))
    }

    // 根据按钮类型执行点击
    if (double) {
      const buttonEnum =
        button === 'left' ? Button.LEFT : button === 'right' ? Button.RIGHT : Button.MIDDLE
      await mouse.doubleClick(buttonEnum)
    } else {
      if (button === 'left') {
        await mouse.leftClick()
      } else if (button === 'right') {
        await mouse.rightClick()
      } else if (button === 'middle') {
        await mouse.click(Button.MIDDLE)
      }
    }
  }

  /**
   * 拖拽鼠标
   * @param startX 起始 x 坐标
   * @param startY 起始 y 坐标
   * @param endX 结束 x 坐标
   * @param endY 结束 y 坐标
   * @param options 拖拽选项
   */
  async dragMouse(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    options?: { duration?: number }
  ): Promise<void> {
    const { duration = 100 } = options || {}

    // 移动到起始位置
    await mouse.setPosition(new Point(startX, startY))

    // 按下鼠标左键
    await mouse.pressButton(Button.LEFT)

    // 如果 duration > 0，使用平滑移动；否则直接移动到目标位置
    if (duration > 0) {
      await mouse.move([new Point(endX, endY)])
    } else {
      await mouse.setPosition(new Point(endX, endY))
    }

    // 释放鼠标左键
    await mouse.releaseButton(Button.LEFT)
  }

  /**
   * 滚动鼠标
   * @param x 目标 x 坐标
   * @param y 目标 y 坐标
   * @param direction 滚动方向 'up' 或 'down'
   * @param amount 滚动量
   */
  async scrollMouse(x: number, y: number, direction: 'up' | 'down', amount: number): Promise<void> {
    // 移动到目标位置
    await mouse.setPosition(new Point(x, y))

    // 执行滚动
    if (direction === 'up') {
      await mouse.scrollUp(amount)
    } else {
      await mouse.scrollDown(amount)
    }
  }

  /**
   * 获取指定位置的像素颜色
   * @param x x 坐标
   * @param y y 坐标
   * @returns 颜色值（十六进制字符串，不包含 #）
   */
  async getPixelColor(x: number, y: number): Promise<string> {
    const color = await nutScreen.colorAt(new Point(x, y))
    // nut-js 返回 RGB 对象，需要转换为十六进制字符串
    const hex = ((color.R << 16) | (color.G << 8) | color.B).toString(16).padStart(6, '0')
    return hex
  }

  /**
   * 获取屏幕尺寸
   * @returns 屏幕尺寸
   */
  async getScreenSize(): Promise<{ width: number; height: number }> {
    const width = await nutScreen.width()
    const height = await nutScreen.height()
    return { width, height }
  }
}

export const mouseController = new MouseController()
