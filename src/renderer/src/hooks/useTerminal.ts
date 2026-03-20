import { useState, useEffect, useCallback, useRef } from 'react'
import type { ExecutionResult, OutputData } from '../../../main/types/terminal'
import { TERMINAL_HISTORY_LIMIT } from '../../../shared/terminalConfig'
import { mergeFinalResultOutput } from './terminalOutput'

/**
 * 终端 Hook 返回值
 */
export interface UseTerminalReturn {
  output: string
  isRunning: boolean
  sessionId: string
  cwd: string
  history: string[]
  executeCommand: (cmd: string) => Promise<ExecutionResult>
  killCommand: () => void
  clearOutput: () => void
  changeCwd: (path: string) => Promise<boolean>
}

/**
 * 终端自定义 Hook
 *
 * ⚠️ 重要点：
 * - 使用 useState 管理终端状态
 * - 调用 IPC 执行命令
 * - 监听 terminal:output 事件，实时更新输出
 * - useEffect cleanup 时注销 IPC 监听器
 * - 维护命令历史队列（有固定上限）
 *
 * 💡 优化点：
 * - 可以使用 Zustand 进行全局状态管理
 * - 可以添加输出缓冲机制，避免频繁更新
 *
 * 🔌 扩展点：
 * - 支持输出搜索和过滤
 * - 支持输出导出
 * - 支持多标签页终端
 */
export function useTerminal(): UseTerminalReturn {
  const [output, setOutput] = useState<string>('')
  const [isRunning, setIsRunning] = useState<boolean>(false)
  const [sessionId, setSessionId] = useState<string>('')
  const [cwd, setCwd] = useState<string>('')
  const [history, setHistory] = useState<string[]>([])

  // 使用 ref 保存最新的输出，避免闭包问题
  const outputRef = useRef<string>('')

  /**
   * 初始化会话信息
   */
  useEffect(() => {
    const initSession = async () => {
      try {
        const info = await window.electronAPI.ipcRenderer.invoke('terminal:get-session-info')

        // 检查是否成功初始化
        if (!info.success) {
          // 如果没有工作区路径，显示错误提示
          const errorMessage = info.error || '终端初始化失败'
          console.error('[useTerminal] 初始化会话失败:', errorMessage)

          // 可以在这里显示错误提示给用户
          // 例如：通过设置一个错误状态，在 UI 中显示
          setCwd('')
          return
        }

        setSessionId(info.sessionId || '')
        setCwd(info.cwd || '')
        setHistory(info.history || [])
      } catch (error) {
        console.error('[useTerminal] 初始化会话失败:', error)
        setCwd('')
      }
    }

    initSession()
  }, [])

  /**
   * 监听实时输出
   */
  useEffect(() => {
    const handleOutput = (_event: unknown, data?: OutputData) => {
      // 添加安全检查
      if (!data || typeof data !== 'object' || !('content' in data)) {
        console.warn('[useTerminal] 收到无效的输出数据:', data)
        return
      }

      const content = data.content || ''
      // 流式输出：实时累积显示
      outputRef.current += content
      setOutput(outputRef.current)
    }

    const handleExecutionComplete = (
      _event: unknown,
      data?: {
        result: ExecutionResult
        parsed: unknown
      }
    ) => {
      setIsRunning(false)

      // 添加安全检查
      if (!data || typeof data !== 'object' || !('result' in data)) {
        console.warn('[useTerminal] 收到无效的执行完成数据:', data)
        return
      }

      const result = data.result as ExecutionResult

      const merged = mergeFinalResultOutput(outputRef.current, result)

      if (merged.changed) {
        outputRef.current = merged.output
        setOutput(outputRef.current)
      }
    }

    const handleCwdChanged = (_event: unknown, data?: { cwd: string }) => {
      // 添加安全检查
      if (!data || typeof data !== 'object' || !('cwd' in data)) {
        console.warn('[useTerminal] 收到无效的工作目录变化数据:', data)
        return
      }
      setCwd(data.cwd)
    }

    // 注册 IPC 监听器
    // ⚠️ 注意：ipcRenderer.on 的回调函数接收 (event, data) 参数
    // 但 preload 包装后，回调函数直接接收 data 作为第一个参数
    window.electronAPI.ipcRenderer.on('terminal:output', data => {
      handleOutput(null, data)
    })
    window.electronAPI.ipcRenderer.on('terminal:execution-complete', data => {
      handleExecutionComplete(null, data)
    })
    window.electronAPI.ipcRenderer.on('terminal:cwd-changed', data => {
      handleCwdChanged(null, data)
    })

    // 清理函数：注销监听器
    return () => {
      window.electronAPI.ipcRenderer.removeListener('terminal:output')
      window.electronAPI.ipcRenderer.removeListener('terminal:execution-complete')
      window.electronAPI.ipcRenderer.removeListener('terminal:cwd-changed')
      // 也可以使用 removeAllListeners 清理所有终端相关监听器
      // window.electronAPI.terminal.removeListeners()
    }
  }, [])

  /**
   * 执行命令
   */
  const executeCommand = useCallback(async (cmd: string): Promise<ExecutionResult> => {
    if (!cmd || cmd.trim().length === 0) {
      throw new Error('命令不能为空')
    }

    try {
      setIsRunning(true)

      // 添加命令提示符到输出
      const prompt = `$ ${cmd}\n`
      outputRef.current += prompt
      setOutput(outputRef.current)

      // 调用 IPC 执行命令
      const response = await window.electronAPI.ipcRenderer.invoke('terminal:execute-command', {
        command: cmd
      })

      if (!response.success) {
        throw new Error(response.error || '命令执行失败')
      }

      // 更新历史记录
      if (response.result) {
        setHistory(prev => {
          const newHistory = [...prev, cmd]
          // 限制历史记录最多 50 条
          return newHistory.slice(-TERMINAL_HISTORY_LIMIT)
        })
      }

      return (
        response.result || {
          exitCode: -1,
          stdout: '',
          stderr: response.error || '未知错误',
          duration: 0,
          killed: false
        }
      )
    } catch (error) {
      setIsRunning(false)
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      outputRef.current += `\n错误: ${errorMessage}\n`
      setOutput(outputRef.current)
      throw error
    }
  }, [])

  /**
   * 杀死当前正在执行的命令
   */
  const killCommand = useCallback(() => {
    try {
      window.electronAPI.ipcRenderer.invoke('terminal:kill-command')
      setIsRunning(false)
      outputRef.current += '\n[命令已中断]\n'
      setOutput(outputRef.current)
    } catch (error) {
      console.error('[useTerminal] 中断命令失败:', error)
    }
  }, [])

  /**
   * 清空输出
   */
  const clearOutput = useCallback(() => {
    outputRef.current = ''
    setOutput('')
  }, [])

  /**
   * 改变工作目录
   */
  const changeCwd = useCallback(async (path: string): Promise<boolean> => {
    try {
      const response = await window.electronAPI.ipcRenderer.invoke('terminal:change-cwd', path)
      if (response.success && response.cwd) {
        setCwd(response.cwd)
        return true
      }
      return false
    } catch (error) {
      console.error('[useTerminal] 改变工作目录失败:', error)
      return false
    }
  }, [])

  return {
    output,
    isRunning,
    sessionId,
    cwd,
    history,
    executeCommand,
    killCommand,
    clearOutput,
    changeCwd
  }
}
