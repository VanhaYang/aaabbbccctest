import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { DrawToolType, DrawObject } from '../../../shared/types'
import './ScreenCaptureEditor.css'

interface SelectionRect {
  startX: number
  startY: number
  width: number
  height: number
}

type ResizeHandle = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | null
type DragMode = 'create' | 'move' | 'resize' | 'draw' | null

// 功能开关：是否启用编辑功能（false=隐藏，true=显示）
const ENABLE_EDIT_FEATURE = false

// 颜色选项
const COLORS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff', '#000000']

// 线宽选项
const LINE_WIDTHS = [2, 4, 6, 8]

/**
 * 异步将 Canvas 转换为 DataURL（避免阻塞主线程）
 * @param canvas Canvas 元素
 * @param quality 图片质量 (0-1)，默认 0.95
 * @returns Promise<string> DataURL 字符串
 */
const canvasToDataURLAsync = (canvas: HTMLCanvasElement, quality: number = 0.95): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      // 使用 toBlob 异步处理，避免阻塞主线程
      canvas.toBlob(
        blob => {
          if (!blob) {
            reject(new Error('Canvas 转换失败'))
            return
          }
          const reader = new FileReader()
          reader.onloadend = () => {
            resolve(reader.result as string)
          }
          reader.onerror = () => {
            reject(new Error('读取 Blob 失败'))
          }
          reader.readAsDataURL(blob)
        },
        'image/png',
        quality
      )
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * 合成最终图片（从选区中提取图片）
 * @param imageRef 背景图片 ref
 * @param drawCanvasRef 绘制层 canvas ref（可选）
 * @param selection 选区信息
 * @param isEditMode 是否处于编辑模式
 * @returns Promise<HTMLCanvasElement> 合成后的 canvas
 */
const compositeImage = async (
  imageRef: React.RefObject<HTMLImageElement | null>,
  drawCanvasRef: React.RefObject<HTMLCanvasElement | null>,
  selection: SelectionRect,
  isEditMode: boolean
): Promise<HTMLCanvasElement> => {
  if (!imageRef.current || !imageRef.current.complete) {
    throw new Error('背景图片不可用或未加载完成')
  }

  // 创建临时 canvas 来合成最终图片
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = selection.width
  tempCanvas.height = selection.height
  const tempCtx = tempCanvas.getContext('2d')

  if (!tempCtx) {
    throw new Error('无法创建 Canvas Context')
  }

  // 1. 绘制背景图片（从 img 元素提取选区）
  tempCtx.drawImage(
    imageRef.current,
    selection.startX,
    selection.startY,
    selection.width,
    selection.height,
    0,
    0,
    selection.width,
    selection.height
  )

  // 2. 绘制编辑内容（如果存在）
  if (isEditMode && drawCanvasRef.current) {
    tempCtx.drawImage(
      drawCanvasRef.current,
      selection.startX,
      selection.startY,
      selection.width,
      selection.height,
      0,
      0,
      selection.width,
      selection.height
    )
  }

  return tempCanvas
}

const ScreenCaptureEditor: React.FC = () => {
  const [imageData, setImageData] = useState<string>('')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [displayInfo, setDisplayInfo] = useState<any>(null)
  const [selection, setSelection] = useState<SelectionRect | null>(null)
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [dragMode, setDragMode] = useState<DragMode>(null)
  const [resizeHandle, setResizeHandle] = useState<ResizeHandle>(null)
  const [originalSelection, setOriginalSelection] = useState<SelectionRect | null>(null)

  // 绘制工具状态
  const [currentTool, setCurrentTool] = useState<DrawToolType>(DrawToolType.SELECT)
  const [currentColor, setCurrentColor] = useState('#ff0000')
  const [currentLineWidth, setCurrentLineWidth] = useState(4)
  const [drawObjects, setDrawObjects] = useState<DrawObject[]>([])
  const [currentDrawObject, setCurrentDrawObject] = useState<DrawObject | null>(null)

  const imageRef = useRef<HTMLImageElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const drawCanvasRef = useRef<HTMLCanvasElement>(null)
  const rafIdRef = useRef<number | null>(null)
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)

  // 重置所有状态的辅助函数
  const resetAllStates = useCallback(() => {
    setSelection(null)
    setStartPoint(null)
    setIsEditMode(false)
    setDragMode(null)
    setResizeHandle(null)
    setOriginalSelection(null)
    setDrawObjects([])
    setCurrentDrawObject(null)
    setCurrentTool(DrawToolType.SELECT)
    setCurrentColor('#ff0000')
    setCurrentLineWidth(4)
  }, [])

  // 监听窗口隐藏事件，在窗口隐藏时重置状态
  useEffect(() => {
    window.electronAPI.screenshot.onWindowHidden(() => {
      // 窗口隐藏时重置所有状态，确保下次打开时不会保留之前的框选
      resetAllStates()
    })

    return () => {
      window.electronAPI.screenshot.removeWindowHiddenListener()
    }
  }, [resetAllStates])

  // 接收截图数据（支持多屏幕）
  useEffect(() => {
    window.electronAPI.screenshot.onImageData(async (data: any) => {
      // 兼容旧格式（纯字符串）和新格式（对象）
      // 支持 Buffer/Uint8Array 和 DataURL 两种格式
      let imageDataUrl: string

      if (typeof data === 'string') {
        // 旧格式：直接是 DataURL 字符串
        imageDataUrl = data
      } else if (data.imageData) {
        // 检查是否为 Buffer 或 Uint8Array（Electron IPC 会将 Buffer 转换为 Uint8Array）
        if (data.imageData instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(data.imageData))) {
          // 新格式：Buffer/Uint8Array，需要转换为 DataURL（异步处理，避免阻塞）
          // 使用 Blob 和 FileReader 异步转换，性能更好
          const blob = new Blob([data.imageData], { type: 'image/png' })
          imageDataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.onerror = () => reject(new Error('Buffer 转换失败'))
            reader.readAsDataURL(blob)
          })
        } else if (typeof data.imageData === 'string') {
          // 兼容：DataURL 字符串
          imageDataUrl = data.imageData
        } else {
          console.error('不支持的图片数据格式:', typeof data.imageData, data.imageData)
          return
        }
        setDisplayInfo(data)
      } else {
        return
      }

      setImageData(imageDataUrl)
      setImageLoaded(false) // 重置加载状态
    })

    return () => {
      window.electronAPI.screenshot.removeImageDataListener()
    }
  }, [])

  // 图片加载完成后的处理（同步 overlay canvas 尺寸）
  useEffect(() => {
    if (!imageLoaded || !imageRef.current) return

    const img = imageRef.current
    const naturalWidth = img.naturalWidth
    const naturalHeight = img.naturalHeight

    // 同步 overlay canvas 的尺寸
    if (overlayCanvasRef.current) {
      overlayCanvasRef.current.width = naturalWidth
      overlayCanvasRef.current.height = naturalHeight
      overlayCanvasRef.current.style.width = '100%'
      overlayCanvasRef.current.style.height = '100%'
    }
    if (drawCanvasRef.current) {
      drawCanvasRef.current.width = naturalWidth
      drawCanvasRef.current.height = naturalHeight
      drawCanvasRef.current.style.width = '100%'
      drawCanvasRef.current.style.height = '100%'
    }
  }, [imageLoaded])

  // 图片加载处理函数
  const handleImageLoad = useCallback(() => {
    setImageLoaded(true)
  }, [])

  // 使用 CSS 遮罩替代 Canvas 遮罩（性能更好）
  // 选区边框和角点仍然使用 Canvas 绘制
  useEffect(() => {
    const overlayCanvas = overlayCanvasRef.current
    if (!overlayCanvas) return

    const ctx = overlayCanvas.getContext('2d')
    if (!ctx) return

    // 清空画布（只用于绘制选区边框和角点）
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)

    if (!isEditMode && selection) {
      // 绘制选区边框
      ctx.strokeStyle = '#00a8ff'
      ctx.lineWidth = 2
      ctx.strokeRect(selection.startX, selection.startY, selection.width, selection.height)

      // 绘制四个角的控制点
      const cornerSize = 8
      const corners = [
        { x: selection.startX, y: selection.startY },
        { x: selection.startX + selection.width, y: selection.startY },
        { x: selection.startX, y: selection.startY + selection.height },
        { x: selection.startX + selection.width, y: selection.startY + selection.height }
      ]

      ctx.fillStyle = '#00a8ff'
      corners.forEach(corner => {
        ctx.fillRect(corner.x - cornerSize / 2, corner.y - cornerSize / 2, cornerSize, cornerSize)
      })
    }
  }, [selection, isEditMode])

  // 绘制编辑对象
  useEffect(() => {
    if (!isEditMode) return

    const drawCanvas = drawCanvasRef.current
    if (!drawCanvas || !selection) return

    const ctx = drawCanvas.getContext('2d')
    if (!ctx) return

    // 清空画布
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height)

    // 绘制所有对象
    drawObjects.forEach(obj => {
      drawObject(ctx, obj)
    })

    // 绘制当前正在绘制的对象
    if (currentDrawObject) {
      drawObject(ctx, currentDrawObject)
    }
  }, [drawObjects, currentDrawObject, isEditMode, selection])

  // 绘制单个对象
  const drawObject = (ctx: CanvasRenderingContext2D, obj: DrawObject) => {
    ctx.strokeStyle = obj.color
    ctx.fillStyle = obj.color
    ctx.lineWidth = obj.lineWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    switch (obj.type) {
      case DrawToolType.RECT:
        if (obj.endX !== undefined && obj.endY !== undefined) {
          const width = obj.endX - obj.startX
          const height = obj.endY - obj.startY
          ctx.strokeRect(obj.startX, obj.startY, width, height)
        }
        break

      case DrawToolType.CIRCLE:
        if (obj.endX !== undefined && obj.endY !== undefined) {
          const radius = Math.sqrt(
            Math.pow(obj.endX - obj.startX, 2) + Math.pow(obj.endY - obj.startY, 2)
          )
          ctx.beginPath()
          ctx.arc(obj.startX, obj.startY, radius, 0, 2 * Math.PI)
          ctx.stroke()
        }
        break

      case DrawToolType.LINE:
        if (obj.endX !== undefined && obj.endY !== undefined) {
          ctx.beginPath()
          ctx.moveTo(obj.startX, obj.startY)
          ctx.lineTo(obj.endX, obj.endY)
          ctx.stroke()
        }
        break

      case DrawToolType.ARROW:
        if (obj.endX !== undefined && obj.endY !== undefined) {
          drawArrow(ctx, obj.startX, obj.startY, obj.endX, obj.endY, obj.lineWidth)
        }
        break

      case DrawToolType.PEN:
        if (obj.points && obj.points.length > 1) {
          ctx.beginPath()
          ctx.moveTo(obj.points[0].x, obj.points[0].y)
          for (let i = 1; i < obj.points.length; i++) {
            ctx.lineTo(obj.points[i].x, obj.points[i].y)
          }
          ctx.stroke()
        }
        break

      case DrawToolType.TEXT:
        if (obj.text) {
          ctx.font = `${obj.fontSize || 20}px Arial`
          ctx.fillText(obj.text, obj.startX, obj.startY)
        }
        break
    }
  }

  // 绘制箭头
  const drawArrow = (
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    lineWidth: number
  ) => {
    const headLength = lineWidth * 3
    const angle = Math.atan2(toY - fromY, toX - fromX)

    // 绘制线条
    ctx.beginPath()
    ctx.moveTo(fromX, fromY)
    ctx.lineTo(toX, toY)
    ctx.stroke()

    // 绘制箭头
    ctx.beginPath()
    ctx.moveTo(toX, toY)
    ctx.lineTo(
      toX - headLength * Math.cos(angle - Math.PI / 6),
      toY - headLength * Math.sin(angle - Math.PI / 6)
    )
    ctx.moveTo(toX, toY)
    ctx.lineTo(
      toX - headLength * Math.cos(angle + Math.PI / 6),
      toY - headLength * Math.sin(angle + Math.PI / 6)
    )
    ctx.stroke()
  }

  // 检查点击位置是否在角点上
  const getResizeHandle = (x: number, y: number, sel: SelectionRect): ResizeHandle => {
    const cornerSize = 8
    const threshold = cornerSize

    if (Math.abs(x - sel.startX) <= threshold && Math.abs(y - sel.startY) <= threshold) {
      return 'top-left'
    }
    if (Math.abs(x - (sel.startX + sel.width)) <= threshold && Math.abs(y - sel.startY) <= threshold) {
      return 'top-right'
    }
    if (Math.abs(x - sel.startX) <= threshold && Math.abs(y - (sel.startY + sel.height)) <= threshold) {
      return 'bottom-left'
    }
    if (Math.abs(x - (sel.startX + sel.width)) <= threshold && Math.abs(y - (sel.startY + sel.height)) <= threshold) {
      return 'bottom-right'
    }
    return null
  }

  // 获取图片边界尺寸（基于自然尺寸）
  const getImageBounds = () => {
    const img = imageRef.current
    if (!img || !img.complete) return { width: 0, height: 0 }
    return { width: img.naturalWidth, height: img.naturalHeight }
  }

  // 将鼠标坐标转换为图片坐标（基于实际渲染尺寸）
  const getImageCoordinates = (e: React.MouseEvent<HTMLDivElement>): { x: number; y: number } => {
    const img = imageRef.current
    if (!img || !img.complete) {
      return { x: 0, y: 0 }
    }

    const rect = e.currentTarget.getBoundingClientRect()

    // 安全检查：避免除以零
    if (rect.width === 0 || rect.height === 0) {
      return { x: 0, y: 0 }
    }

    // 鼠标相对于元素的坐标（CSS像素/逻辑像素）
    const displayX = e.clientX - rect.left
    const displayY = e.clientY - rect.top

    // 计算缩放比例：图片自然尺寸 / 显示尺寸
    const scaleX = img.naturalWidth / rect.width
    const scaleY = img.naturalHeight / rect.height

    // 转换为图片实际坐标（物理像素）
    let imageX = displayX * scaleX
    let imageY = displayY * scaleY

    // 安全检查：确保坐标有效
    if (!isFinite(imageX) || !isFinite(imageY)) {
      return { x: 0, y: 0 }
    }

    // 限制坐标在图片范围内
    imageX = Math.max(0, Math.min(imageX, img.naturalWidth))
    imageY = Math.max(0, Math.min(imageY, img.naturalHeight))

    return { x: imageX, y: imageY }
  }

  // 边界约束：确保选区在图片范围内
  const constrainSelection = (sel: SelectionRect): SelectionRect => {
    const bounds = getImageBounds()

    // 安全检查
    if (bounds.width === 0 || bounds.height === 0) return sel

    // 确保选区不超出边界
    let { startX, startY, width, height } = sel

    // 确保值有效
    if (!isFinite(startX) || !isFinite(startY) || !isFinite(width) || !isFinite(height)) {
      return { startX: 0, startY: 0, width: 0, height: 0 }
    }

    // 确保宽高为正
    width = Math.abs(width)
    height = Math.abs(height)

    // 限制最小尺寸
    const minSize = 10
    width = Math.max(minSize, width)
    height = Math.max(minSize, height)

    // 限制起始位置
    startX = Math.max(0, Math.min(startX, bounds.width - width))
    startY = Math.max(0, Math.min(startY, bounds.height - height))

    // 限制宽高
    width = Math.min(width, bounds.width - startX)
    height = Math.min(height, bounds.height - startY)

    return { startX, startY, width, height }
  }

  // 智能定位工具栏：确保工具栏不超出窗口边界
  const getToolbarPosition = (sel: SelectionRect, toolbarWidth: number = 400, toolbarHeight: number = 60) => {
    const img = imageRef.current
    if (!img || !img.complete) return { left: 0, top: 0, placement: 'bottom' as const }

    const rect = img.getBoundingClientRect()

    // 转换为显示坐标（逻辑像素）
    const displayStartX = (sel.startX / img.naturalWidth) * rect.width
    const displayStartY = (sel.startY / img.naturalHeight) * rect.height
    const displayWidth = (sel.width / img.naturalWidth) * rect.width
    const displayHeight = (sel.height / img.naturalHeight) * rect.height
    const displayBoundsWidth = rect.width
    const displayBoundsHeight = rect.height

    // 默认右对齐到选区右边界
    let left = displayStartX + displayWidth - toolbarWidth
    let top = displayStartY + displayHeight + 10
    let placement: 'bottom' | 'top' | 'inside' = 'bottom'

    // 检查是否接近全屏（选区占屏幕 90% 以上）
    const isNearFullscreen = (displayWidth / displayBoundsWidth > 0.9 || displayHeight / displayBoundsHeight > 0.9)

    // 如果接近全屏，或者下方空间不足，放在选区内部
    if (isNearFullscreen || top + toolbarHeight > displayBoundsHeight) {
      // 放在选区内部底部
      top = displayStartY + displayHeight - toolbarHeight - 10
      placement = 'inside'

      // 如果内部底部还是不够，放在选区内部顶部
      if (top < displayStartY) {
        top = displayStartY + 10
      }
    }

    // 如果下方空间不足但不是全屏，尝试放在上方
    if (!isNearFullscreen && placement === 'bottom' && top + toolbarHeight > displayBoundsHeight && displayStartY > toolbarHeight + 20) {
      top = displayStartY - toolbarHeight - 10
      placement = 'top'
    }

    // 确保工具栏完整显示在屏幕内
    // 如果右对齐导致左侧超出，则调整到左边界
    if (left < 10) {
      left = 10
    }
    // 如果右对齐导致右侧超出，则向左移动
    if (left + toolbarWidth > displayBoundsWidth - 10) {
      left = displayBoundsWidth - toolbarWidth - 10
    }
    // 最终确保至少有 10px 边距
    left = Math.max(10, Math.min(left, displayBoundsWidth - toolbarWidth - 10))

    return { left, top, placement }
  }

  // 智能定位选区信息：确保不超出窗口边界
  const getSelectionInfoPosition = (sel: SelectionRect, infoWidth: number = 120, infoHeight: number = 30) => {
    const img = imageRef.current
    if (!img || !img.complete) return { left: 0, top: 0 }

    const rect = img.getBoundingClientRect()

    // 转换为显示坐标（逻辑像素）
    const displayStartX = (sel.startX / img.naturalWidth) * rect.width
    const displayStartY = (sel.startY / img.naturalHeight) * rect.height
    const displayWidth = (sel.width / img.naturalWidth) * rect.width
    const displayBoundsWidth = rect.width
    const displayBoundsHeight = rect.height

    let left = displayStartX + displayWidth + 10
    let top = displayStartY

    // 如果右侧空间不足，显示在选区左侧
    if (left + infoWidth > displayBoundsWidth) {
      left = displayStartX - infoWidth - 10

      // 如果左侧也不足，显示在选区内部
      if (left < 0) {
        left = displayStartX + 10
      }
    }

    // 确保不超出顶部和底部
    top = Math.max(10, Math.min(top, displayBoundsHeight - infoHeight - 10))

    return { left, top }
  }

  // 智能定位编辑工具栏
  const getEditToolbarPosition = (sel: SelectionRect, toolbarHeight: number = 60) => {
    const img = imageRef.current
    if (!img || !img.complete) return { left: 0, top: 0, placement: 'top' as const }

    const rect = img.getBoundingClientRect()

    // 转换为显示坐标（逻辑像素）
    const displayStartX = (sel.startX / img.naturalWidth) * rect.width
    const displayStartY = (sel.startY / img.naturalHeight) * rect.height
    const displayHeight = (sel.height / img.naturalHeight) * rect.height
    const displayBoundsHeight = rect.height

    let left = displayStartX
    let top = displayStartY - toolbarHeight - 10
    let placement: 'top' | 'inside' = 'top'

    // 如果上方空间不足，放在选区内部顶部
    if (top < 10) {
      top = displayStartY + 10
      placement = 'inside'
    }

    // 如果选区太小，强制放在选区上方
    if (displayHeight < 100 && displayStartY > toolbarHeight + 20) {
      top = displayStartY - toolbarHeight - 10
      placement = 'top'
    }

    // 确保不超出底部
    if (placement === 'inside') {
      top = Math.min(top, displayBoundsHeight - toolbarHeight - 10)
    }

    return { left, top, placement }
  }

  // 检查点击位置是否在选区内
  const isInsideSelection = (x: number, y: number, sel: SelectionRect): boolean => {
    return x >= sel.startX && x <= sel.startX + sel.width &&
      y >= sel.startY && y <= sel.startY + sel.height
  }

  // 鼠标按下
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // 检查点击目标是否是UI元素（按钮、工具栏等）
    const target = e.target as HTMLElement
    const isUIElement = target.closest('button') ||
      target.closest('.toolbar') ||
      target.closest('.edit-toolbar') ||
      target.closest('.selection-info') ||
      target.closest('.hint')

    if (isUIElement) {
      return
    }

    const { x, y } = getImageCoordinates(e)

    setStartPoint({ x, y })

    if (!isEditMode) {
      // 选择模式
      if (selection) {
        // 检查是否点击在角点上（调整大小）
        const handle = getResizeHandle(x, y, selection)
        if (handle) {
          setDragMode('resize')
          setResizeHandle(handle)
          setOriginalSelection({ ...selection })
          return
        }

        // 检查是否点击在选区内（移动选区）
        if (isInsideSelection(x, y, selection)) {
          setDragMode('move')
          setOriginalSelection({ ...selection })
          return
        }

        // 点击在选区外，保持选区不变
      } else {
        // 没有选区，开始创建新选区
        setDragMode('create')
        setSelection(null)
      }
    } else {
      // 编辑模式
      if (!selection || currentTool === DrawToolType.SELECT) return

      // 检查是否在选区内
      if (isInsideSelection(x, y, selection)) {
        setDragMode('draw')

        const newObj: DrawObject = {
          id: Date.now().toString(),
          type: currentTool,
          color: currentColor,
          lineWidth: currentLineWidth,
          startX: x,
          startY: y,
          points: currentTool === DrawToolType.PEN ? [{ x, y }] : undefined
        }

        setCurrentDrawObject(newObj)
      }
    }
  }

  // 实际的鼠标移动处理逻辑
  const processMouseMove = (x: number, y: number, currentTarget: HTMLDivElement) => {
    if (!dragMode || !startPoint) {
      // 更新光标样式
      if (!isEditMode && selection) {
        const handle = getResizeHandle(x, y, selection)
        if (handle) {
          if (handle === 'top-left' || handle === 'bottom-right') {
            currentTarget.style.cursor = 'nwse-resize'
          } else {
            currentTarget.style.cursor = 'nesw-resize'
          }
        } else if (isInsideSelection(x, y, selection)) {
          currentTarget.style.cursor = 'move'
        } else {
          currentTarget.style.cursor = 'default'
        }
      } else if (!selection) {
        currentTarget.style.cursor = 'crosshair'
      }
      return
    }

    if (dragMode === 'create') {
      // 创建新选区
      const width = x - startPoint.x
      const height = y - startPoint.y

      const newSelection = constrainSelection({
        startX: width > 0 ? startPoint.x : x,
        startY: height > 0 ? startPoint.y : y,
        width: Math.abs(width),
        height: Math.abs(height)
      })
      setSelection(newSelection)
    } else if (dragMode === 'move' && originalSelection) {
      // 移动选区（带边界检测）
      const deltaX = x - startPoint.x
      const deltaY = y - startPoint.y

      const newSelection = constrainSelection({
        startX: originalSelection.startX + deltaX,
        startY: originalSelection.startY + deltaY,
        width: originalSelection.width,
        height: originalSelection.height
      })
      setSelection(newSelection)
    } else if (dragMode === 'resize' && originalSelection && resizeHandle) {
      // 调整选区大小
      let newSelection = { ...originalSelection }
      const deltaX = x - startPoint.x
      const deltaY = y - startPoint.y

      switch (resizeHandle) {
        case 'top-left':
          newSelection.startX = originalSelection.startX + deltaX
          newSelection.startY = originalSelection.startY + deltaY
          newSelection.width = originalSelection.width - deltaX
          newSelection.height = originalSelection.height - deltaY
          break
        case 'top-right':
          newSelection.startY = originalSelection.startY + deltaY
          newSelection.width = originalSelection.width + deltaX
          newSelection.height = originalSelection.height - deltaY
          break
        case 'bottom-left':
          newSelection.startX = originalSelection.startX + deltaX
          newSelection.width = originalSelection.width - deltaX
          newSelection.height = originalSelection.height + deltaY
          break
        case 'bottom-right':
          newSelection.width = originalSelection.width + deltaX
          newSelection.height = originalSelection.height + deltaY
          break
      }

      // 确保宽高不为负
      if (newSelection.width < 0) {
        newSelection.startX += newSelection.width
        newSelection.width = -newSelection.width
      }
      if (newSelection.height < 0) {
        newSelection.startY += newSelection.height
        newSelection.height = -newSelection.height
      }

      // 应用边界约束
      setSelection(constrainSelection(newSelection))
    } else if (dragMode === 'draw' && currentDrawObject) {
      // 编辑模式绘制
      if (currentTool === DrawToolType.PEN) {
        // 画笔工具：添加点
        setCurrentDrawObject({
          ...currentDrawObject,
          points: [...(currentDrawObject.points || []), { x, y }]
        })
      } else {
        // 其他工具：更新终点
        setCurrentDrawObject({
          ...currentDrawObject,
          endX: x,
          endY: y
        })
      }
    }
  }

  // 鼠标移动（使用 requestAnimationFrame 节流）
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    // 安全检查：确保事件有效
    if (!e || !e.currentTarget) return

    const { x, y } = getImageCoordinates(e)

    // 安全检查：确保坐标有效
    if (!isFinite(x) || !isFinite(y)) return

    // 保存当前鼠标位置和目标元素
    lastMousePosRef.current = { x, y }
    const currentTarget = e.currentTarget

    // 如果已经有待处理的帧，跳过
    if (rafIdRef.current !== null) return

    // 使用 requestAnimationFrame 节流
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null

      if (lastMousePosRef.current) {
        const { x, y } = lastMousePosRef.current
        processMouseMove(x, y, currentTarget)
      }
    })
  }

  // 鼠标抬起
  const handleMouseUp = () => {
    // 取消待处理的动画帧
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }

    if (dragMode === 'draw' && currentDrawObject) {
      setDrawObjects([...drawObjects, currentDrawObject])
      setCurrentDrawObject(null)
    }
    setDragMode(null)
    setResizeHandle(null)
    setOriginalSelection(null)
  }

  // 进入编辑模式
  const enterEditMode = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!selection) return
    setIsEditMode(true)
  }

  // 撤销
  const handleUndo = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation()
    setDrawObjects(prev => {
      if (prev.length > 0) {
        return prev.slice(0, -1)
      }
      return prev
    })
  }, [])

  // 更新 ref
  useEffect(() => {
    handleUndoRef.current = handleUndo
  }, [handleUndo])

  // 取消截图
  const handleCancel = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    await window.electronAPI.screenshot.cancel()
  }, [])

  // 更新 ref
  useEffect(() => {
    handleCancelRef.current = handleCancel
  }, [handleCancel])

  // 确认截图
  const handleConfirm = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    const currentSelection = selectionRef.current
    if (!currentSelection || !imageRef.current || !imageRef.current.complete) return

    try {
      // 使用异步合成函数，避免阻塞
      const tempCanvas = await compositeImage(imageRef, drawCanvasRef, currentSelection, isEditModeRef.current)

      // 异步转换为 DataURL
      const finalImageData = await canvasToDataURLAsync(tempCanvas)

      // 发送到主进程
      await window.electronAPI.screenshot.finish(finalImageData)
    } catch (error) {
      console.error('确认截图失败:', error)
    }
  }, [])

  // 更新 ref
  useEffect(() => {
    handleConfirmRef.current = handleConfirm
  }, [handleConfirm])

  // 保存截图
  const handleSave = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!selection || !imageRef.current || !imageRef.current.complete) return

    try {
      // 使用异步合成函数，避免阻塞
      const tempCanvas = await compositeImage(imageRef, drawCanvasRef, selection, isEditMode)

      // 异步转换为 DataURL
      const finalImageData = await canvasToDataURLAsync(tempCanvas)

      const result = await window.electronAPI.screenshot.save(finalImageData)
      if (result.success) {
        await window.electronAPI.screenshot.cancel()
      }
    } catch (error) {
      console.error('保存截图失败:', error)
    }
  }, [selection, isEditMode])

  // 复制到剪贴板
  const handleCopy = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!selection || !imageRef.current || !imageRef.current.complete) return

    try {
      // 使用异步合成函数，避免阻塞
      const tempCanvas = await compositeImage(imageRef, drawCanvasRef, selection, isEditMode)

      // 异步转换为 DataURL
      const finalImageData = await canvasToDataURLAsync(tempCanvas)

      const result = await window.electronAPI.screenshot.copy(finalImageData)
      if (result.success) {
        await window.electronAPI.screenshot.cancel(false)
      }
      return result
    } catch (error) {
      console.error('复制截图失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '未知错误' }
    }
  }, [selection, isEditMode])

  // 问AI - 复制到剪贴板、打开主窗口并上传图片到网站
  const handleAskAI = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!selection || !imageRef.current || !imageRef.current.complete) return

    try {
      // 使用异步合成函数，避免阻塞
      const tempCanvas = await compositeImage(imageRef, drawCanvasRef, selection, isEditMode)

      // 异步转换为 DataURL
      const finalImageData = await canvasToDataURLAsync(tempCanvas)

      // 复制到剪贴板
      const copyResult = await window.electronAPI.screenshot.copy(finalImageData)

      // 上传图片到网站（通过 BroadcastChannel）
      const uploadResult = await window.electronAPI.screenshot.uploadToWebsite(finalImageData)

      if (copyResult.success || uploadResult.success) {
        await window.electronAPI.screenshot.cancel(true)
      }

      return {
        success: copyResult.success || uploadResult.success,
        copySuccess: copyResult.success,
        uploadSuccess: uploadResult.success
      }
    } catch (error) {
      console.error('问AI操作失败:', error)
      return {
        success: false,
        copySuccess: false,
        uploadSuccess: false
      }
    }
  }, [selection, isEditMode])

  // 使用 useRef 存储稳定的回调函数，避免频繁重新注册事件监听器
  const handleCancelRef = useRef<(() => Promise<void>) | undefined>(undefined)
  const handleConfirmRef = useRef<(() => Promise<void>) | undefined>(undefined)
  const handleUndoRef = useRef<(() => void) | undefined>(undefined)
  const selectionRef = useRef<SelectionRect | null>(null)
  const isEditModeRef = useRef<boolean>(false)

  // 更新 ref 值
  useEffect(() => {
    selectionRef.current = selection
    isEditModeRef.current = isEditMode
  }, [selection, isEditMode])

  // 使用 useMemo 缓存工具栏位置计算结果
  const toolbarPosition = useMemo(() => {
    if (!selection || selection.width <= 20 || selection.height <= 20 || isEditMode) return null
    return getToolbarPosition(selection, 500, 60)
  }, [selection, isEditMode, displayInfo])

  const selectionInfoPosition = useMemo(() => {
    if (!selection || isEditMode) return null
    return getSelectionInfoPosition(selection)
  }, [selection, isEditMode, displayInfo])

  const editToolbarPosition = useMemo(() => {
    if (!ENABLE_EDIT_FEATURE || !isEditMode || !selection) return null
    return getEditToolbarPosition(selection, 60)
  }, [selection, isEditMode, displayInfo])

  // 键盘事件 - 使用稳定的回调避免频繁重新注册
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancelRef.current?.()
      } else if (e.key === 'Enter' && selectionRef.current) {
        handleConfirmRef.current?.()
      } else if (e.key === 'z' && e.ctrlKey && isEditModeRef.current) {
        handleUndoRef.current?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, []) // 空依赖数组，只注册一次

  // 计算遮罩样式（CSS 遮罩）
  const maskStyle = useMemo(() => {
    if (isEditMode || !selection) {
      return { display: 'none' }
    }

    // 获取图片的实际尺寸和显示尺寸
    const img = imageRef.current
    if (!img || !img.complete) {
      return { display: 'none' }
    }

    const rect = img.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      return { display: 'none' }
    }

    // 计算缩放比例：显示尺寸 / 自然尺寸
    const scaleX = rect.width / img.naturalWidth
    const scaleY = rect.height / img.naturalHeight

    // 将图片坐标转换为显示像素坐标
    const left = selection.startX * scaleX
    const top = selection.startY * scaleY
    const width = selection.width * scaleX
    const height = selection.height * scaleY

    return {
      clipPath: `polygon(
        0% 0%,
        0% 100%,
        ${left}px 100%,
        ${left}px ${top}px,
        ${left + width}px ${top}px,
        ${left + width}px ${top + height}px,
        ${left}px ${top + height}px,
        ${left}px 100%,
        100% 100%,
        100% 0%
      )`
    }
  }, [selection, isEditMode, imageLoaded])

  // 阻止默认的右键菜单
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      return false
    }

    document.addEventListener('contextmenu', handleContextMenu)
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [])

  return (
    <div className="screen-capture">
      <div
        className="capture-area"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        {/* 背景图片 - 使用 img 标签，浏览器自动优化渲染 */}
        <img
          ref={imageRef}
          src={imageData}
          alt="Screenshot"
          className="background-image"
          onLoad={handleImageLoad}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: imageData ? 'block' : 'none'
          }}
        />

        {/* CSS 遮罩层 */}
        {!isEditMode && (
          <div className="css-mask" style={maskStyle} />
        )}

        {/* 选区边框和角点 canvas */}
        <canvas
          ref={overlayCanvasRef}
          className="overlay-canvas"
          width={window.innerWidth}
          height={window.innerHeight}
        />

        {/* 绘制层 canvas */}
        <canvas
          ref={drawCanvasRef}
          className="draw-canvas"
          width={window.innerWidth}
          height={window.innerHeight}
        />

        {/* 选区信息 */}
        {selectionInfoPosition && selection && (
          <div
            className="selection-info"
            style={{
              left: `${selectionInfoPosition.left}px`,
              top: `${selectionInfoPosition.top}px`
            }}
          >
            {(() => {
              const scaleFactor = displayInfo?.scaleFactor || window.devicePixelRatio || 1
              return `${Math.round(selection.width / scaleFactor)} × ${Math.round(selection.height / scaleFactor)}`
            })()}
          </div>
        )}

        {/* 基础工具栏 */}
        {toolbarPosition && (
          <div
            className="toolbar"
            style={{
              left: `${toolbarPosition.left}px`,
              top: `${toolbarPosition.top}px`
            }}
          >
            {ENABLE_EDIT_FEATURE && (
              <button className="toolbar-btn edit" onClick={enterEditMode} title="编辑">
                ✏️ 编辑
              </button>
            )}
            <button className="toolbar-btn" onClick={handleAskAI} title="问AI">
              🤖 问AI
            </button>
            <button className="toolbar-btn" onClick={handleCopy} title="复制">
              📋 复制
            </button>
            <button className="toolbar-btn" onClick={handleSave} title="保存">
              💾 保存
            </button>
            <button className="toolbar-btn cancel" onClick={handleCancel} title="取消">
              ❌ 取消
            </button>
          </div>
        )}

        {/* 编辑工具栏 */}
        {editToolbarPosition && (
          <div
            className="edit-toolbar"
            style={{
              left: `${editToolbarPosition.left}px`,
              top: `${editToolbarPosition.top}px`
            }}
          >
            {/* 工具选择 */}
            <div className="tool-group">
              <button
                className={`tool-btn ${currentTool === DrawToolType.RECT ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setCurrentTool(DrawToolType.RECT)
                }}
                title="矩形"
              >
                ⬜
              </button>
              <button
                className={`tool-btn ${currentTool === DrawToolType.CIRCLE ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setCurrentTool(DrawToolType.CIRCLE)
                }}
                title="圆形"
              >
                ⭕
              </button>
              <button
                className={`tool-btn ${currentTool === DrawToolType.ARROW ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setCurrentTool(DrawToolType.ARROW)
                }}
                title="箭头"
              >
                ➡️
              </button>
              <button
                className={`tool-btn ${currentTool === DrawToolType.LINE ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setCurrentTool(DrawToolType.LINE)
                }}
                title="直线"
              >
                📏
              </button>
              <button
                className={`tool-btn ${currentTool === DrawToolType.PEN ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setCurrentTool(DrawToolType.PEN)
                }}
                title="画笔"
              >
                ✏️
              </button>
            </div>

            {/* 颜色选择 */}
            <div className="color-group">
              {COLORS.map(color => (
                <button
                  key={color}
                  className={`color-btn ${currentColor === color ? 'active' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setCurrentColor(color)
                  }}
                  title={color}
                />
              ))}
            </div>

            {/* 线宽选择 */}
            <div className="linewidth-group">
              {LINE_WIDTHS.map(width => (
                <button
                  key={width}
                  className={`linewidth-btn ${currentLineWidth === width ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setCurrentLineWidth(width)
                  }}
                  title={`${width}px`}
                >
                  <div style={{ width: width, height: width, backgroundColor: '#333', borderRadius: '50%' }} />
                </button>
              ))}
            </div>

            {/* 操作按钮 */}
            <div className="action-group">
              <button className="action-btn" onClick={handleUndo} title="撤销 (Ctrl+Z)">
                ↶
              </button>
              <button className="action-btn" onClick={handleAskAI} title="问AI">
                🤖
              </button>
              <button className="action-btn" onClick={handleCopy} title="复制">
                📋
              </button>
              <button className="action-btn" onClick={handleSave} title="保存">
                💾
              </button>
              <button className="action-btn cancel" onClick={handleCancel} title="取消">
                ❌
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 提示信息 */}
      {!selection && !isEditMode && (
        <div className="hint">
          <p>拖动鼠标选择截图区域</p>
          <p className="hint-small">按 ESC 取消截图</p>
        </div>
      )}
    </div>
  )
}

export default ScreenCaptureEditor
