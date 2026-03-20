import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerm } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { useTerminal } from '../hooks/useTerminal'
import './Terminal.css'

/**
 * 终端 UI 组件
 * 
 * ⚠️ 重要点：
 * - 使用 xterm.js 显示终端输出
 * - 支持实时输出更新
 * - 支持命令输入和执行
 * - 支持 Ctrl+C 中断命令
 * - 支持上下箭头浏览历史
 * 
 * 💡 优化点：
 * - 可以添加主题切换
 * - 可以添加字体大小调整
 * - 可以添加输出搜索功能
 * 
 * 🔌 扩展点：
 * - 支持多标签页
 * - 支持输出导出
 * - 支持命令自动补全
 */
const Terminal: React.FC = () => {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [inputValue, setInputValue] = useState('')
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [tempInput, setTempInput] = useState('')

  const {
    output,
    isRunning,
    cwd,
    history,
    executeCommand,
    killCommand,
    clearOutput,
    changeCwd
  } = useTerminal()

  /**
   * 初始化 xterm.js
   * ⚠️ 需要确保容器元素已经完全渲染并有尺寸后再初始化
   */
  useEffect(() => {
    if (!terminalRef.current) return

    let xterm: XTerm | null = null
    let fitAddon: FitAddon | null = null
    let handleResize: (() => void) | null = null

    // 使用 setTimeout 确保 DOM 完全渲染
    const initTimer = setTimeout(() => {
      if (!terminalRef.current) return

      try {
        // 创建 xterm 实例
        xterm = new XTerm({
          cols: 120,
          rows: 30,
          disableStdin: true, // 禁用 xterm 的输入，使用自定义输入框
          cursorBlink: false,
          theme: {
            background: '#1e1e1e',
            foreground: '#d4d4d4',
            cursor: '#aeafad',
            selection: '#264f78'
          },
          fontSize: 14,
          fontFamily: 'Consolas, "Courier New", monospace',
          // 确保换行符被正确处理
          convertEol: true, // 将 \n 转换为 \r\n，确保换行符正确显示
          // 确保文本正确显示，避免字距和行距异常
          letterSpacing: 0, // 字符间距为 0，避免字符分散
          lineHeight: 1.0, // 行高为 1.0，避免行距过大
          // 启用右键选择单词功能
          rightClickSelectsWord: true,
          // 允许文本选择
          allowProposedApi: true
        })

        // 添加 fit addon 用于自适应大小
        fitAddon = new FitAddon()
        xterm.loadAddon(fitAddon)
        
        // 打开终端到容器
        xterm.open(terminalRef.current)

        // 添加右键菜单和键盘快捷键支持复制
        if (terminalRef.current) {
          const terminalElement = terminalRef.current.querySelector('.xterm') as HTMLElement
          if (terminalElement) {
            // 复制文本到剪贴板的辅助函数
            const copyToClipboard = async (text: string) => {
              try {
                // 使用现代剪贴板 API
                await navigator.clipboard.writeText(text)
                console.log('[Terminal] 已复制选中文本到剪贴板')
                return true
              } catch (error) {
                console.error('[Terminal] 复制失败:', error)
                // 降级方案：使用传统方法
                const textArea = document.createElement('textarea')
                textArea.value = text
                textArea.style.position = 'fixed'
                textArea.style.left = '-999999px'
                textArea.style.top = '-999999px'
                document.body.appendChild(textArea)
                textArea.focus()
                textArea.select()
                try {
                  document.execCommand('copy')
                  console.log('[Terminal] 已使用降级方案复制文本')
                  document.body.removeChild(textArea)
                  return true
                } catch (err) {
                  console.error('[Terminal] 降级复制方案也失败:', err)
                  document.body.removeChild(textArea)
                  return false
                }
              }
            }

            // 右键菜单：复制选中的文本
            terminalElement.addEventListener('contextmenu', async (e) => {
              e.preventDefault()
              
              // 获取选中的文本
              let selectedText = ''
              try {
                // 优先使用 xterm.js 的 getSelection 方法
                if (typeof xterm.getSelection === 'function') {
                  selectedText = xterm.getSelection() || ''
                }
              } catch (error) {
                console.warn('[Terminal] xterm.getSelection() 失败，使用降级方案:', error)
              }
              
              // 降级方案：使用 DOM 的 window.getSelection()
              if (!selectedText || selectedText.length === 0) {
                const domSelection = window.getSelection()
                if (domSelection) {
                  selectedText = domSelection.toString()
                }
              }
              
              if (selectedText && selectedText.length > 0) {
                await copyToClipboard(selectedText)
              }
            })

            // Ctrl+C：在终端区域有选中文本时复制
            // 注意：xterm.js 在 disableStdin: true 时，Ctrl+C 会自动复制选中的文本
            // 这里添加额外的支持以确保复制功能正常工作
            terminalElement.addEventListener('keydown', async (e) => {
              if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
                let selectedText = ''
                try {
                  // 优先使用 xterm.js 的 getSelection 方法
                  if (typeof xterm.getSelection === 'function') {
                    selectedText = xterm.getSelection() || ''
                  }
                } catch (error) {
                  console.warn('[Terminal] xterm.getSelection() 失败，使用降级方案:', error)
                }
                
                // 降级方案：使用 DOM 的 window.getSelection()
                if (!selectedText || selectedText.length === 0) {
                  const domSelection = window.getSelection()
                  if (domSelection) {
                    selectedText = domSelection.toString()
                  }
                }
                
                if (selectedText && selectedText.length > 0) {
                  // 有选中文本，确保复制功能正常工作
                  e.preventDefault()
                  e.stopPropagation()
                  await copyToClipboard(selectedText)
                }
              }
            }, true) // 使用捕获阶段，确保优先处理
          }
        }

        // 延迟调用 fit，确保容器有尺寸
        requestAnimationFrame(() => {
          if (fitAddon && terminalRef.current) {
            try {
              fitAddon.fit()
            } catch (error) {
              console.warn('[Terminal] Fit addon 调用失败，使用默认尺寸:', error)
            }
          }
        })

        // 监听窗口大小变化
        handleResize = () => {
          if (fitAddon && terminalRef.current) {
            try {
              fitAddon.fit()
            } catch (error) {
              // 忽略 resize 时的错误
            }
          }
        }
        window.addEventListener('resize', handleResize)

        xtermRef.current = xterm
        fitAddonRef.current = fitAddon

        // 显示欢迎信息
        xterm.writeln('欢迎使用智能终端')
        xterm.writeln(`当前工作目录: ${cwd}`)
        xterm.writeln('')
      } catch (error) {
        console.error('[Terminal] 初始化 xterm 失败:', error)
      }
    }, 100) // 延迟 100ms 确保 DOM 渲染完成

    return () => {
      clearTimeout(initTimer)
      if (handleResize) {
        window.removeEventListener('resize', handleResize)
      }
      if (xterm) {
        try {
          xterm.dispose()
        } catch (error) {
          console.error('[Terminal] 清理 xterm 失败:', error)
        }
      }
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, [cwd])

  /**
   * 更新工作目录显示
   */
  useEffect(() => {
    if (xtermRef.current && cwd) {
      // 可以在这里更新提示符显示
    }
  }, [cwd])

  /**
   * 实时更新输出
   * 使用 useRef 跟踪上次的输出长度，只写入新增部分
   */
  const lastOutputLengthRef = useRef<number>(0)
  const outputInitializedRef = useRef<boolean>(false)
  
  useEffect(() => {
    if (!xtermRef.current) return

    // 如果输出为空，重置跟踪
    if (!output || output.length === 0) {
      lastOutputLengthRef.current = 0
      outputInitializedRef.current = false
      return
    }

    // 如果是第一次有输出，直接写入全部
    if (!outputInitializedRef.current) {
      // xterm.js 的 write() 方法可以正确处理 \n 换行符
      // 确保输出被正确写入
      xtermRef.current.write(output)
      lastOutputLengthRef.current = output.length
      outputInitializedRef.current = true
    } else {
      // 只写入新增的内容，避免重复
      const newContent = output.slice(lastOutputLengthRef.current)
      if (newContent && newContent.length > 0) {
        // xterm.js 的 write() 方法可以正确处理 \n 换行符
        // 确保新增内容被正确写入
        xtermRef.current.write(newContent)
        lastOutputLengthRef.current = output.length
      }
    }
  }, [output])

  /**
   * 处理命令执行
   */
  const handleExecute = useCallback(async () => {
    if (!inputValue.trim() || isRunning) return

    const command = inputValue.trim()
    setInputValue('')
    setHistoryIndex(-1)
    setTempInput('')

    try {
      await executeCommand(command)
    } catch (error) {
      console.error('[Terminal] 执行命令失败:', error)
    }

    // 聚焦输入框
    inputRef.current?.focus()
  }, [inputValue, isRunning, executeCommand])

  /**
   * 处理键盘事件
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    // Enter - 执行命令
    if (e.key === 'Enter') {
      e.preventDefault()
      handleExecute()
      return
    }

    // Ctrl+C - 中断命令
    if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault()
      if (isRunning) {
        killCommand()
      }
      return
    }

    // 上箭头 - 浏览历史（向上）
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (history.length === 0) return

      let newIndex = historyIndex === -1 ? history.length - 1 : historyIndex - 1
      if (newIndex < 0) newIndex = 0

      // 保存当前输入（如果还没有保存）
      if (historyIndex === -1) {
        setTempInput(inputValue)
      }

      setHistoryIndex(newIndex)
      setInputValue(history[newIndex])
      return
    }

    // 下箭头 - 浏览历史（向下）
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (history.length === 0) return

      let newIndex = historyIndex + 1
      if (newIndex >= history.length) {
        newIndex = -1
        setInputValue(tempInput)
      } else {
        setInputValue(history[newIndex])
      }
      setHistoryIndex(newIndex)
      return
    }
  }, [inputValue, isRunning, history, historyIndex, tempInput, handleExecute, killCommand])

  /**
   * 清空终端
   */
  const handleClear = useCallback(() => {
    if (xtermRef.current) {
      xtermRef.current.clear()
    }
    clearOutput()
  }, [clearOutput])

  // 如果没有工作区路径，显示提示信息
  if (!cwd) {
    return (
      <div className="terminal-container">
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '40px',
          textAlign: 'center',
          color: '#d4d4d4'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚠️</div>
          <h2 style={{ marginBottom: '16px', fontSize: '20px' }}>未配置工作区路径</h2>
          <p style={{ marginBottom: '24px', fontSize: '14px', color: '#808080' }}>
            请先在设置中配置工作区路径，然后才能使用终端功能。
          </p>
          <button
            className="terminal-btn terminal-btn-primary"
            onClick={async () => {
              // 打开设置窗口
              await window.electronAPI.settings.open()
            }}
            style={{ padding: '8px 24px', fontSize: '14px' }}
          >
            打开设置
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="terminal-container">
      {/* 顶部信息栏 */}
      <div className="terminal-header">
        <div className="terminal-info">
          <span className="terminal-cwd">📁 {cwd}</span>
          <span className={`terminal-status ${isRunning ? 'running' : 'idle'}`}>
            {isRunning ? '● 执行中' : '○ 空闲'}
          </span>
        </div>
        <div className="terminal-actions">
          <button
            className="terminal-btn"
            onClick={handleClear}
            disabled={isRunning}
            title="清空终端"
          >
            清屏
          </button>
          <button
            className="terminal-btn terminal-btn-danger"
            onClick={killCommand}
            disabled={!isRunning}
            title="中断命令 (Ctrl+C)"
          >
            停止
          </button>
        </div>
      </div>

      {/* xterm.js 显示区域 */}
      <div ref={terminalRef} className="terminal-display" />

      {/* 输入区域 */}
      <div className="terminal-input-area">
        <span className="terminal-prompt">$</span>
        <input
          ref={inputRef}
          type="text"
          className="terminal-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入命令..."
          disabled={isRunning}
          autoFocus
        />
        <button
          className="terminal-btn terminal-btn-primary"
          onClick={handleExecute}
          disabled={!inputValue.trim() || isRunning}
        >
          执行
        </button>
      </div>

      {/* 命令历史下拉菜单（可选） */}
      {history.length > 0 && (
        <div className="terminal-history">
          <details>
            <summary>命令历史 ({history.length})</summary>
            <ul className="terminal-history-list">
              {history.slice().reverse().map((cmd, index) => (
                <li
                  key={index}
                  className="terminal-history-item"
                  onClick={() => {
                    setInputValue(cmd)
                    inputRef.current?.focus()
                  }}
                >
                  {cmd}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  )
}

export default Terminal

