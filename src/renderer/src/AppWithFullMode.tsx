import React, { useEffect, useRef, useState, useCallback } from 'react'
import './App.css'
import { validateFiles } from './utils/fileValidator'

/**
 * 完整模式应用组件
 * 直接加载 AI 助手官网，支持文件拖拽和剪切板功能
 */
const AppWithFullMode: React.FC = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const FULL_MODE_URL = 'https://aizs.sailvan.com/default/chat'

  /**
   * 处理文件请求
   */
  const handleFileRequest = useCallback(async (data: any) => {
    try {
      // 可以在这里通过 IPC 打开文件选择对话框
      // 暂时通过拖拽来实现
    } catch (error) {
      console.error('处理文件请求失败:', error)
    }
  }, [])

  /**
   * 处理剪切板请求
   */
  const handleClipboardRequest = useCallback(async (data: any) => {
    try {
      if (data.action === 'read') {
        // 读取剪切板内容
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText()
          // 发送回 iframe
          iframeRef.current?.contentWindow?.postMessage(
            {
              type: 'clipboard-content',
              data: text
            },
            FULL_MODE_URL
          )
        }
      } else if (data.action === 'write' && data.content) {
        // 写入剪切板
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(data.content)
          // 通知 iframe 写入成功
          iframeRef.current?.contentWindow?.postMessage(
            {
              type: 'clipboard-written',
              success: true
            },
            FULL_MODE_URL
          )
        }
      }
    } catch (error) {
      console.error('处理剪切板请求失败:', error)
      // 通知 iframe 失败
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: 'clipboard-error',
          error: error instanceof Error ? error.message : '未知错误'
        },
        FULL_MODE_URL
      )
    }
  }, [])

  useEffect(() => {
    // 监听来自 iframe 的消息（用于文件拖拽等功能）
    const handleMessage = (event: MessageEvent) => {
      // 只接受来自目标域名的消息
      if (!event.origin.includes('aizs.sailvan.com')) {
        return
      }


      // 处理文件拖拽请求
      if (event.data && event.data.type === 'request-file') {
        handleFileRequest(event.data)
      }

      // 处理剪切板请求
      if (event.data && event.data.type === 'request-clipboard') {
        handleClipboardRequest(event.data)
      }

      // 处理 iframe 请求接收拖拽文件的信号
      if (event.data && event.data.type === 'ready-for-files') {
      }
    }

    window.addEventListener('message', handleMessage)

    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [handleFileRequest, handleClipboardRequest])

  /**
   * 处理拖拽事件
   */
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDragging(true)
      }
    }

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy'
      }
    }

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      // 只有当离开容器时才隐藏拖拽提示
      if (!container.contains(e.relatedTarget as Node)) {
        setIsDragging(false)
      }
    }

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return

      // 验证文件：检查文件类型、大小和数量
      const fileArray = Array.from(files)
      const validationResult = validateFiles(fileArray)

      // 记录验证失败的文件
      if (validationResult.invalidFiles.length > 0) {
        console.warn('[完整模式] 以下文件验证失败:')
        validationResult.invalidFiles.forEach(({ file, error }) => {
          console.warn(`  - ${file.name}: ${error}`)
        })
      }

      // 如果总共有被跳过的文件（不符合规范的文件 + 超过数量限制的符合规范的文件）
      if (validationResult.invalidCount > validationResult.invalidFiles.length) {
        const skippedValidCount = validationResult.invalidCount - validationResult.invalidFiles.length
        console.warn(`[完整模式] 超过最大文件数量限制，已跳过 ${skippedValidCount} 个符合规范的文件`)
      }

      // 如果没有有效文件，直接返回
      if (validationResult.validFiles.length === 0) {
        console.error('[完整模式] 没有有效的文件可以上传')
        return
      }

      // 将有效文件转换为可传输的格式
      const fileData = await Promise.all(
        validationResult.validFiles.map(async (file) => {
          try {
            // 读取文件为 base64 Data URL
            const dataUrl = await readFileAsDataURL(file)
            return {
              name: file.name,
              size: file.size,
              type: file.type,
              lastModified: file.lastModified,
              data: dataUrl
            }
          } catch (error) {
            console.error(`读取文件 ${file.name} 失败:`, error)
            return {
              name: file.name,
              size: file.size,
              type: file.type,
              lastModified: file.lastModified,
              error: '文件读取失败'
            }
          }
        })
      )

      // 过滤掉读取失败的文件
      const validFileData = fileData.filter(file => !file.error)

      if (validFileData.length === 0) {
        console.error('[完整模式] 没有成功读取的文件')
        return
      }

      // 发送文件数据到 iframe
      const iframe = iframeRef.current
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(
          {
            type: 'electron-files-dropped',
            files: validFileData,
            timestamp: Date.now()
          },
          FULL_MODE_URL
        )
      }
    }

    // 监听容器的拖拽事件
    container.addEventListener('dragenter', handleDragEnter)
    container.addEventListener('dragover', handleDragOver)
    container.addEventListener('dragleave', handleDragLeave)
    container.addEventListener('drop', handleDrop)

    return () => {
      container.removeEventListener('dragenter', handleDragEnter)
      container.removeEventListener('dragover', handleDragOver)
      container.removeEventListener('dragleave', handleDragLeave)
      container.removeEventListener('drop', handleDrop)
    }
  }, [])

  /**
   * 读取文件为 Data URL (base64)
   */
  const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        resolve(result)
      }
      reader.onerror = () => {
        reject(new Error(`读取文件失败: ${file.name}`))
      }
      reader.readAsDataURL(file)
    })
  }

  return (
    <div className="app">
      {/* 完整模式 iframe 全屏容器 */}
      <div className="aibot-container" ref={containerRef}>
        {isDragging && (
          <div className="drag-overlay">
            <div className="drag-indicator">
              <div className="drag-icon">📁</div>
              <div className="drag-text">拖拽文件到这里上传</div>
            </div>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={FULL_MODE_URL}
          className="aibot-iframe"
          title="AI 助手 - 完整模式"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  )
}

export default AppWithFullMode

