import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom/client'
import './floating-trigger.css'
import { validateFiles } from './utils/fileValidator'

/**
 * 浮窗触发器组件 - 悬浮球
 */
const FloatingTrigger: React.FC = () => {
  const [isActive, setIsActive] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false) // 文件上传中状态
  const [uploadCount, setUploadCount] = useState(0) // 文件上传计数

  // 点击触发器按钮，切换面板
  const handleClick = () => {
    setIsActive(prev => {
      const newState = !prev
      return newState
    })
    window.electronAPI.ipcRenderer.invoke('floating:toggle')
      .catch(err => console.error('[触发器] 切换面板失败:', err))
  }

  // 文件拖拽事件处理
  useEffect(() => {
    const container = document.getElementById('root')
    if (!container) return

    let dragCounter = 0 // 用于跟踪拖拽进入/离开的次数

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter++

      // 检查是否包含文件
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
      dragCounter--

      // 只有当拖拽计数器归零时才取消拖拽状态
      // 这样可以避免在拖拽经过子元素时误触发
      if (dragCounter === 0) {
        setIsDragging(false)
      }
    }

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter = 0 // 重置拖拽计数器
      setIsDragging(false) // 先清除拖拽状态

      const files = e.dataTransfer?.files
      if (!files || files.length === 0) {
        return
      }

      // 验证文件：检查文件类型、大小和数量
      const fileArray = Array.from(files)
      const validationResult = validateFiles(fileArray)

      // 记录验证失败的文件
      if (validationResult.invalidFiles.length > 0) {
        console.warn('[触发器] 以下文件验证失败:')
        validationResult.invalidFiles.forEach(({ file, error }) => {
          console.warn(`  - ${file.name}: ${error}`)
        })
      }

      // 如果总共有被跳过的文件（不符合规范的文件 + 超过数量限制的符合规范的文件）
      if (validationResult.invalidCount > validationResult.invalidFiles.length) {
        const skippedValidCount = validationResult.invalidCount - validationResult.invalidFiles.length
        console.warn(`[触发器] 超过最大文件数量限制，已跳过 ${skippedValidCount} 个符合规范的文件`)
      }

      // 如果没有有效文件，直接返回
      if (validationResult.validFiles.length === 0) {
        console.error('[触发器] 没有有效的文件可以上传')
        return
      }

      // 读取所有有效文件并转换为 base64
      const fileData = await Promise.all(
        validationResult.validFiles.map(async (file) => {
          try {
            // 读取文件为 base64 Data URL
            const dataUrl = await readFileAsDataURL(file)
            return {
              name: file.name,
              size: file.size,
              type: file.type || getMimeTypeFromFileName(file.name),
              data: dataUrl
            }
          } catch (error) {
            console.error(`[触发器] 读取文件 ${file.name} 失败:`, error)
            return null
          }
        })
      )

      // 过滤掉读取失败的文件
      const validFileData = fileData.filter((file): file is NonNullable<typeof file> => file !== null)

      if (validFileData.length === 0) {
        console.error('[触发器] 没有成功读取的文件')
        return
      }

      // 通过 IPC 发送文件到主进程进行上传
      try {
        // 开始上传，显示上传动画
        setIsUploading(true)
        const result = await window.electronAPI.ipcRenderer.invoke('file:upload-to-website', validFileData)
        if (result.success) {
          // 上传成功后增加计数（不打开主窗口）
          setUploadCount(prev => prev + validFileData.length)
          // 添加上传成功动画反馈
          setTimeout(() => {
            setIsUploading(false)
          }, 500) // 短暂延迟以显示成功反馈
        } else {
          console.error('[触发器] 文件上传失败:', result.error)
          setIsUploading(false)
        }
      } catch (error) {
        console.error('[触发器] 发送文件上传请求失败:', error)
        setIsUploading(false)
      }
    }

    // 读取文件为 base64 Data URL 的辅助函数
    const readFileAsDataURL = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result
          if (typeof result === 'string') {
            resolve(result)
          } else {
            reject(new Error('读取文件失败：结果不是字符串'))
          }
        }
        reader.onerror = () => {
          reject(new Error(`读取文件失败: ${file.name}`))
        }
        reader.readAsDataURL(file)
      })
    }

    // 根据文件名获取 MIME 类型
    const getMimeTypeFromFileName = (fileName: string): string => {
      const ext = fileName.split('.').pop()?.toLowerCase() || ''
      const mimeTypes: Record<string, string> = {
        // 图片
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        svg: 'image/svg+xml',
        webp: 'image/webp',
        // 文档
        pdf: 'application/pdf',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        doc: 'application/msword',
        md: 'text/markdown',
        txt: 'text/plain',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        html: 'text/html',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        xls: 'application/vnd.ms-excel',
        csv: 'text/csv',
        // 视频
        mp4: 'video/mp4',
        avi: 'video/x-msvideo',
        mov: 'video/quicktime',
        wmv: 'video/x-ms-wmv',
        flv: 'video/x-flv',
        mkv: 'video/x-matroska',
        // 音频
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        m4a: 'audio/mp4',
        ogg: 'audio/ogg',
        flac: 'audio/flac',
        mpeg: 'audio/mpeg'
      }
      return mimeTypes[ext] || 'application/octet-stream'
    }

    // 添加事件监听器
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

  // 拖拽手柄的鼠标事件
  useEffect(() => {

    const dragHandle = document.querySelector('.drag-handle') as HTMLElement
    if (!dragHandle) {
      console.warn('[触发器] 未找到拖拽手柄元素')
      return
    }

    const handleDragStart = () => {
      window.electronAPI.ipcRenderer.invoke('floating:trigger-drag-start')
        .catch(err => console.error('[触发器] 通知主进程失败:', err))
    }

    const handleDragEnd = () => {
      window.electronAPI.ipcRenderer.invoke('floating:trigger-drag-end')
        .catch(err => console.error('[触发器] 结束拖拽失败:', err))
    }

    dragHandle.addEventListener('mousedown', handleDragStart)
    dragHandle.addEventListener('mouseup', handleDragEnd)

    return () => {
      dragHandle.removeEventListener('mousedown', handleDragStart)
      dragHandle.removeEventListener('mouseup', handleDragEnd)
    }
  }, [])

  // 监听主窗口显示事件，当主窗口显示时清除计数
  useEffect(() => {
    const handleVisibilityChanged = (visible: boolean) => {
      if (visible) {
        setUploadCount(0)
      }
    }

    window.electronAPI.window.onVisibilityChanged(handleVisibilityChanged)

    return () => {
      window.electronAPI.window.removeVisibilityListener()
    }
  }, [])

  // 监听来自主进程的清除计数消息（当主窗口通过其他方式打开时）
  useEffect(() => {
    const handleClearCount = () => {
      setUploadCount(0)
    }

    window.electronAPI.ipcRenderer.on('trigger:clear-upload-count', handleClearCount)

    return () => {
      window.electronAPI.ipcRenderer.removeListener('trigger:clear-upload-count')
    }
  }, [])

  // 点击角标打开主窗口并清除计数
  const handleBadgeClick = (e: React.MouseEvent) => {
    e.stopPropagation() // 阻止事件冒泡，避免触发触发器按钮的点击
    setUploadCount(0) // 清除计数
    window.electronAPI.ipcRenderer.invoke('window:show-main')
      .catch(err => console.error('[触发器] 显示主窗口失败:', err))
  }


  return (
    <div className={`floating-trigger ${isActive ? 'active' : ''} ${isDragging ? 'dragging' : ''} ${isUploading ? 'uploading' : ''}`}>
      {/* 主按钮 - 点击展开面板 */}
      <div className="trigger-button" onClick={handleClick}>
        <div className="trigger-icon">
          {isDragging ? (
            // 拖拽时显示上传图标
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polyline
                points="17 8 12 3 7 8"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <line
                x1="12"
                y1="3"
                x2="12"
                y2="15"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg
              className="icon"
              viewBox="0 0 1024 1024"
              version="1.1"
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
            >
              <path
                d="M920.43032373 169.25291601c9.79277398 0.47769635 23.88481382 3.10502634 31.05025785 5.73235493 8.35968492 2.86617817 18.39130707 9.31507763 26.98984016 17.43591436 9.55392581 8.59853309 16.48052163 17.67476253 21.49633341 28.18408106 6.68774765 13.85319167 7.64314037 17.91361072 7.4042922 35.82722142 0 11.70355943-2.86617817 35.58837326-6.68774766 56.12931395-3.82157088 19.82439614-8.12083673 37.26031051-9.5539258 38.93224638-2.14963361 2.62732998-14.56973619 3.10502634-63.53360614 2.3884818-60.4285798-0.71654454-61.14512434-0.71654454-74.04292466-7.16544402-7.16544402-3.34387452-17.91361072-10.98701488-23.64596564-16.7193698-5.73235492-5.73235492-13.3754953-16.24167345-16.71936981-23.40711885-5.49350675-11.46471124-6.2100513-16.24167345-6.2100513-37.02146234 0-22.69057294 0.47769635-25.07905472 8.35968491-40.60418365 4.53811404-9.31507763 13.61434348-21.97402977 20.30209113-28.66177742 6.44889947-6.68774765 18.86900343-15.52512891 27.46753652-19.82439476 8.59853309-4.29926723 21.01863705-8.83738127 27.46753653-10.03162216 6.68774765-1.1942409 20.06324433-1.67193726 29.8560183-1.1942409z m-414.40152683 35.82722142l13.13664712 6.44889948c7.16544402 3.34387452 16.7193698 10.03162215 21.01863704 14.80858438 4.06041906 4.77696221 9.79277398 12.65895215 12.1812544 17.43591435 2.38848178 5.01581039 14.80858438 49.44156491 27.7063847 98.64428302 12.65895215 49.20271673 28.9006256 112.73632286 36.3049178 140.92040392 7.16544402 28.18408106 20.06324433 78.3421905 28.42292923 111.06438699 8.59853309 32.96104326 24.36251018 95.3004085 35.58837326 138.53192213 16.00282528 63.29475795 19.58554797 80.49182413 18.15245888 87.17957177-0.95539271 4.53811404-3.5827227 11.94240761-5.73235492 16.24167345-2.38848178 4.06041906-7.64314037 10.27047035-11.70355943 13.37549668-4.29926723 3.34387452-12.65895215 6.92659582-18.63015525 8.35968492-5.9712031 1.43308907-29.85601831 2.62732998-53.2631358 2.62732997-25.55675108 0-46.81423632-1.1942409-53.50198396-2.86617816-7.16544402-1.91078544-14.80858438-6.2100513-20.06324432-11.46471124-6.92659582-6.44889947-10.03162215-12.89780032-14.80858438-28.66177743-3.34387452-11.22586306-14.33088802-50.39695762-24.12366201-87.17957177-9.79277398-36.78261415-29.85601831-111.54208195-44.42575452-165.99945865-14.56973619-54.45737669-29.13947378-109.39244973-32.4833483-121.81255231-3.34387452-12.42010397-7.88198854-24.60135837-10.03162078-26.98984015-2.38848178-2.38848178-6.44889947-4.29926723-9.31507761-4.06041906-3.10502634 0-6.92659582 2.38848178-8.83738127 5.49350813-1.91078544 2.86617817-32.96104326 65.44439157-69.26596245 139.00961849-36.30491779 73.5652283-65.92208793 135.90459354-65.92208655 138.53192213-0.23884817 2.62732998 1.67193726 6.44889947 3.8215695 8.3596849 3.34387452 2.86617817 14.09203984 3.5827227 112.01977971 4.7769636l10.7481667 6.68774765c6.68774765 4.06041906 12.89780032 10.7481667 16.7193698 17.19706616 4.06041906 7.4042922 5.73235492 14.33088802 5.73235493 22.69057432 0 9.55392581-3.10502634 19.10785162-15.28628074 46.57538674-9.79277398 21.73518159-18.63015525 37.97685504-23.8848152 43.70920998-4.53811404 5.01581039-12.65895215 10.7481667-17.91360932 12.65895215-8.12083673 3.10502634-30.57256287 3.34387452-149.28009021 2.86617817-139.72616301-0.71654454-139.72616301-0.71654454-149.75778521-5.9712045-5.73235492-3.10502634-13.61434348-10.03162215-17.43591434-15.52512892-4.06041906-5.73235492-8.59853309-14.56973619-10.03162216-19.82439615-1.1942409-5.25465858-1.67193726-14.09203984-0.95539136-19.58554797 0.95539271-6.2100513 19.58554797-47.76962902 45.38114587-101.51045981 24.12366201-50.39695762 59.23433889-123.24564139 77.86449553-161.93904097 18.63015525-38.69339958 47.29193267-97.92773849 63.29475658-131.36647812 16.00282528-33.43873964 41.08188001-85.02993817 55.41276938-114.64710829 14.33088802-29.61717013 29.37832195-57.32355484 33.19989147-61.86166887 3.82157088-4.29926723 11.70355943-10.7481667 17.67476253-14.09203984 5.9712031-3.5827227 14.09203984-6.92659582 17.91361072-7.88198856 4.06041906-0.95539271 44.90345087-1.67193726 174.35914494-0.95539271z m382.15702672 229.53306478c22.45172476 0.71654454 44.90345087 2.38848178 50.15811083 3.82156949 6.2100513 1.43308907 13.61434348 6.44889947 20.54093932 13.61434487 7.64314037 7.4042922 12.18125578 14.56973619 14.09204122 21.7351802 2.38848178 8.83738127 2.14963361 18.1524589-0.95539273 51.35235173-2.14963361 22.45172476-6.2100513 58.27894618-8.59853309 80.01412639-2.62732998 21.73518159-9.07622944 78.81988687-14.33088802 127.30606043-6.44889947 58.99549071-10.7481667 90.28459811-13.37549668 95.5392567-2.14963361 4.06041906-7.88198854 11.70355943-12.65895214 16.7193698-5.49350675 5.9712031-12.65895215 10.27047035-20.54093931 12.42010398-8.35968492 2.62732998-23.16826928 3.5827227-48.96386993 3.58272269-20.30209251 0-41.79842454-1.1942409-47.76962764-2.62732997-5.9712031-1.1942409-14.56973619-5.01581039-19.10785162-8.12083675-4.53811404-3.10502634-11.46471124-11.46471124-15.28628074-18.39130707-5.01581039-9.07622944-6.92659582-16.00282528-7.16544539-24.60135836 0-6.44889947 3.5827227-39.40994412 7.64314176-72.84868375 4.29926723-33.43873964 9.79277398-76.90910143 12.42010257-96.73349759 2.62732998-19.58554797 6.92659582-54.93507305 9.55392581-78.10334233 2.62732998-23.40711746 6.44889947-53.26313578 8.35968491-66.39978429 1.91078544-13.1366485 5.25465858-27.22868834 7.16544401-31.05025783 1.91078544-3.82157088 7.88198854-10.7481667 13.13664851-14.80858576 5.01581039-4.29926723 12.89780032-9.31507763 17.19706618-10.74816532 5.73235492-2.14963361 19.3466998-2.62732998 48.48617217-1.67193726z"
                fill="white"
              />
            </svg>
          )}
        </div>
        {/* 拖拽时显示提示文字 */}
        {isDragging && (
          <div className="drag-hint">
            <span>松开以上传</span>
          </div>
        )}
      </div>

      {/* 拖拽手柄 - 右上角小图标 */}
      <div className="drag-handle" title="拖动以移动位置">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* 十字箭头图标 - 四个方向的箭头表示可拖拽 */}
          {/* 上箭头 */}
          <path
            d="M12 2L12 8M12 2L9 5M12 2L15 5"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* 下箭头 */}
          <path
            d="M12 22L12 16M12 22L9 19M12 22L15 19"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* 左箭头 */}
          <path
            d="M2 12L8 12M2 12L5 9M2 12L5 15"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* 右箭头 */}
          <path
            d="M22 12L16 12M22 12L19 9M22 12L19 15"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* 文件上传计数角标 - 左下角 */}
      {uploadCount > 0 && (
        <div className="upload-badge" onClick={handleBadgeClick} title="点击打开主窗口">
          <span className="upload-badge-count">
            {uploadCount > 99 ? '99+' : uploadCount}
          </span>
        </div>
      )}
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FloatingTrigger />
  </React.StrictMode>
)

