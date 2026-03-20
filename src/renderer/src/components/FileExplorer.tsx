import React, { useState, useEffect } from 'react'
import './FileExplorer.css'

/**
 * 文件/目录项接口
 */
interface FileItem {
  name: string
  path: string
  isDirectory: boolean
  children?: FileItem[]
  expanded?: boolean
  loaded?: boolean
}

/**
 * 文件管理器组件
 */
const FileExplorer: React.FC = () => {
  const [workspacePath, setWorkspacePath] = useState<string>('')
  const [fileTree, setFileTree] = useState<FileItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [dragCounter, setDragCounter] = useState<number>(0)

  // 加载工作区路径
  useEffect(() => {
    loadWorkspacePath()
  }, [])

  // 监听文件系统变化
  useEffect(() => {
    if (!workspacePath) {
      return
    }

    // 监听文件系统变化
    const handleDirectoryChanged = () => {
      // 延迟刷新，避免频繁刷新（防抖）
      setTimeout(() => {
        loadDirectoryTree(workspacePath)
      }, 300)
    }

    const handleRefresh = () => {
      loadDirectoryTree(workspacePath)
    }

    if (window.electronAPI?.fileExplorer) {
      window.electronAPI.fileExplorer.onDirectoryChanged(handleDirectoryChanged)
      window.electronAPI.fileExplorer.onRefresh(handleRefresh)
    }

    return () => {
      if (window.electronAPI?.fileExplorer) {
        window.electronAPI.fileExplorer.removeListeners()
      }
    }
  }, [workspacePath])

  // 处理文件拖拽事件
  useEffect(() => {
    const container = document.getElementById('root')
    if (!container) return

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // 检查是否拖拽的是文件
      if (e.dataTransfer?.types.includes('Files')) {
        setDragCounter(prev => prev + 1)
        setIsDragging(true)
      }
    }

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // 设置拖拽效果为复制
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy'
      }
    }

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      setDragCounter(prev => {
        const newCount = prev - 1
        if (newCount === 0) {
          setIsDragging(false)
        }
        return newCount
      })
    }

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragCounter(0)
      setIsDragging(false)

      const files = e.dataTransfer?.files
      if (!files || files.length === 0 || !workspacePath) {
        return
      }

      try {
        // 将 FileList 转换为文件路径数组
        const filePaths: string[] = []

        // 在 Electron 中，从系统资源管理器拖拽的文件，File 对象有 path 属性
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          const filePath = (file as any).path

          if (filePath) {
            filePaths.push(filePath)
            console.log(`检测到文件路径: ${filePath}`)
          } else {
            console.warn(`文件 ${file.name} 没有路径属性，可能不是从系统资源管理器拖拽的`)
          }
        }

        if (filePaths.length === 0) {
          console.warn('没有检测到有效的文件路径')
          alert('无法获取文件路径，请确保从系统资源管理器拖拽文件')
          return
        }

        console.log(`准备复制 ${filePaths.length} 个文件到: ${workspacePath}`)

        // 调用 IPC 复制文件
        const result = await window.electronAPI.ipcRenderer.invoke(
          'file-explorer:copy-files',
          filePaths,
          workspacePath
        )

        if (result.success) {
          // 复制成功后刷新文件树
          await loadDirectoryTree(workspacePath)

          // 显示成功提示
          if (result.copiedCount > 0) {
            console.log(`✅ 成功复制 ${result.copiedCount} 个文件`)
          }
          if (result.failedCount > 0) {
            console.warn(`⚠️ 复制失败 ${result.failedCount} 个文件`)
            if (result.errors && result.errors.length > 0) {
              console.warn('错误详情:', result.errors)
            }
            alert(`复制完成：成功 ${result.copiedCount} 个，失败 ${result.failedCount} 个`)
          } else if (result.copiedCount > 0) {
            // 只在全部成功时显示成功提示
            console.log(`所有文件复制成功`)
          }
        } else {
          console.error('复制文件失败:', result.error)
          alert(result.error || '复制文件失败')
        }
      } catch (error) {
        console.error('处理文件拖拽失败:', error)
        alert(`处理文件拖拽时发生错误: ${error instanceof Error ? error.message : '未知错误'}`)
      }
    }

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
  }, [workspacePath])

  // 加载工作区路径
  const loadWorkspacePath = async () => {
    try {
      const result = await window.electronAPI.filePermission.getWorkspacePath()
      if (result.success && result.path) {
        setWorkspacePath(result.path)
        loadDirectoryTree(result.path)
      } else {
        setError('未配置工作区路径，请在设置中配置工作区路径')
        setLoading(false)
      }
    } catch (err) {
      setError('加载工作区路径失败')
      setLoading(false)
    }
  }

  // 加载目录树
  const loadDirectoryTree = async (rootPath: string) => {
    try {
      setLoading(true)
      setError(null)

      // 检查目录读权限
      const permissionResult = await window.electronAPI.filePermission.hasDirectoryRead(rootPath)
      if (!permissionResult.success || !permissionResult.hasRead) {
        setError('没有读取该目录的权限')
        setLoading(false)
        return
      }

      // 加载根目录
      const rootItem: FileItem = {
        name: rootPath.split(/[/\\]/).pop() || rootPath,
        path: rootPath,
        isDirectory: true,
        expanded: true,
        loaded: false,
        children: []
      }

      // 加载根目录的子项
      await loadDirectoryChildren(rootItem)

      setFileTree([rootItem])
      setLoading(false)
    } catch (err) {
      setError('加载目录树失败')
      setLoading(false)
    }
  }

  // 加载目录的子项
  const loadDirectoryChildren = async (parentItem: FileItem): Promise<void> => {
    try {
      // 通过 IPC 获取目录内容
      const result = await window.electronAPI.ipcRenderer.invoke('file-explorer:read-directory', parentItem.path)

      if (!result.success) {
        console.error('读取目录失败:', result.error)
        parentItem.children = []
        parentItem.loaded = true
        return
      }

      const items: FileItem[] = result.items.map((item: any) => ({
        name: item.name,
        path: item.path,
        isDirectory: item.isDirectory,
        expanded: false,
        loaded: false,
        children: []
      }))

      // 排序：目录在前，文件在后，按名称排序
      items.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1
        }
        return a.name.localeCompare(b.name, 'zh-CN')
      })

      parentItem.children = items
      parentItem.loaded = true
    } catch (err) {
      console.error('加载目录子项失败:', err)
      parentItem.children = []
      parentItem.loaded = true
    }
  }

  // 切换目录展开/收起
  const toggleDirectory = async (item: FileItem) => {
    if (!item.isDirectory) return

    // 切换展开状态
    item.expanded = !item.expanded

    // 如果展开且未加载，则加载子项
    if (item.expanded && !item.loaded) {
      await loadDirectoryChildren(item)
    }

    // 更新状态
    setFileTree([...fileTree])
  }

  // 处理文件双击
  const handleFileDoubleClick = async (item: FileItem) => {
    if (item.isDirectory) return

    try {
      // 判断文件类型，确定是否可以预览
      const previewableExtensions = [
        // 文本文件
        '.html', '.htm', '.md', '.markdown', '.txt', '.log',
        '.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.sass', '.less',
        '.json', '.xml', '.yaml', '.yml',
        '.py', '.java', '.cpp', '.cxx', '.cc', '.c', '.h', '.hpp',
        '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.scala',
        '.sh', '.bash', '.zsh', '.ps1', '.sql',
        '.dockerfile', '.makefile', '.ini', '.toml', '.conf', '.config',
        // 图片
        '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff', '.tif',
        // 视频
        '.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.webm', '.m4v', '.3gp', '.ogv',
        // 音频
        '.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma', '.opus', '.amr'
      ]

      const ext = item.path.substring(item.path.lastIndexOf('.')).toLowerCase()
      const canPreview = previewableExtensions.includes(ext)

      // 安全检查：禁止打开可执行文件和系统文件
      const blockedExtensions = [
        // Windows 可执行文件
        '.exe', '.bat', '.cmd', '.com', '.scr', '.msi', '.appx', '.appxbundle',
        // 系统文件
        '.dll', '.sys', '.drv', '.ocx', '.cpl',
        // 注册表文件
        '.reg',
        // 安装包
        '.deb', '.rpm', '.pkg', '.dmg',
        // Windows 脚本可执行文件（.sh, .bash, .ps1 等可以预览，但 .vbs 等不能）
        '.vbs', '.wsf', '.wsh', '.jar',
        // 其他可执行文件
        '.app', '.run', '.bin'
      ]

      if (blockedExtensions.includes(ext)) {
        alert('出于安全考虑，不允许打开可执行文件和系统文件')
        return
      }

      // 如果不支持预览，使用系统默认程序打开
      if (!canPreview) {
        const result = await window.electronAPI.fileExplorer.openWithSystem(item.path)
        if (!result.success) {
          alert(result.error || '无法打开文件')
        }
        return
      }

      // 支持预览的文件类型，读取文件内容并预览
      const result = await window.electronAPI.fileExplorer.readFile(item.path)

      if (!result.success) {
        alert(result.error || '读取文件失败')
        return
      }

      // 根据文件类型选择预览方式
      if (result.fileType === 'image' || result.fileType === 'video' || result.fileType === 'audio') {
        // 媒体文件：使用媒体预览
        const previewResult = await window.electronAPI.preview.openMedia(
          result.content!,
          result.fileType!,
          result.fileName || item.name
        )

        if (!previewResult.success) {
          alert('打开预览失败')
        }
      } else {
        // 文本文件：使用代码预览
        const previewResult = await window.electronAPI.preview.open(result.content, result.language || 'text')

        if (!previewResult.success) {
          alert('打开预览失败')
        }
      }
    } catch (error) {
      console.error('处理文件双击失败:', error)
      alert(`处理文件时发生错误: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  // 渲染文件树节点
  const renderFileTree = (items: FileItem[], level: number = 0): React.ReactNode => {
    return items.map((item, index) => (
      <div key={`${item.path}-${index}`} className="file-tree-item">
        <div
          className={`file-item ${item.isDirectory ? 'directory' : 'file'}`}
          style={{ paddingLeft: `${level * 20 + 8}px` }}
          onClick={() => item.isDirectory && toggleDirectory(item)}
          onDoubleClick={() => !item.isDirectory && handleFileDoubleClick(item)}
          title={item.isDirectory ? '单击展开/收起' : '双击预览文件'}
        >
          <span className="file-item-icon">
            {item.isDirectory ? (
              item.expanded ? '📂' : '📁'
            ) : (
              '📄'
            )}
          </span>
          <span className="file-item-name">{item.name}</span>
        </div>
        {item.isDirectory && item.expanded && item.children && (
          <div className="file-tree-children">
            {renderFileTree(item.children, level + 1)}
          </div>
        )}
      </div>
    ))
  }

  // 手动刷新
  const handleRefresh = async () => {
    if (workspacePath) {
      await loadDirectoryTree(workspacePath)
    }
  }

  return (
    <div className={`file-explorer-container ${isDragging ? 'dragging' : ''}`}>
      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-overlay-content">
            <div className="drag-icon">📁</div>
            <div className="drag-text">将文件拖拽到这里复制到工作区</div>
          </div>
        </div>
      )}
      <div className="file-explorer-header">
        <div className="header-left">
          <h1>文件管理器</h1>
          {workspacePath && (
            <div className="workspace-path">
              <span className="workspace-label">工作区：</span>
              <span className="workspace-value">{workspacePath}</span>
            </div>
          )}
        </div>
        {/* <div className="header-actions">
          <button className="refresh-button" onClick={handleRefresh} title="刷新">
            🔄 刷新
          </button>
        </div> */}
      </div>

      <div className="file-explorer-content">
        {loading && (
          <div className="loading">
            <p>加载中...</p>
          </div>
        )}

        {error && (
          <div className="error">
            <p>{error}</p>
            {!workspacePath && (
              <button
                onClick={() => {
                  window.electronAPI.settings.open()
                }}
                className="settings-button"
              >
                打开设置
              </button>
            )}
          </div>
        )}

        {!loading && !error && fileTree.length > 0 && (
          <div className="file-tree">
            {renderFileTree(fileTree)}
          </div>
        )}
      </div>
    </div>
  )
}

export default FileExplorer

