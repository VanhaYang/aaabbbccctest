import { useEffect, useRef, useState, useCallback } from 'react'
import type {
  AIBotConfig,
  AIBotMessage,
  AIBotGuestInitData,
  AIBotAPIInitData
} from '../../../shared/types'
import { AIBotStatus, AIBotMessageType } from '../../../shared/types'

/**
 * AI Bot 聊天 Hook
 * 实现类似 JSSDK 的握手通信机制
 */
export function useAIBotChat(config: AIBotConfig) {
  const [status, setStatus] = useState<AIBotStatus>(AIBotStatus.IDLE)
  const [error, setError] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const refreshTokenRef = useRef<string | null>(null)
  const appInstanceRef = useRef<string>('')

  /**
   * 发送消息到 iframe
   */
  const sendMessage = useCallback(
    (type: string, data: any = {}) => {
      if (!iframeRef.current?.contentWindow) {
        console.warn('iframe 未就绪，无法发送消息:', type)
        return
      }

      iframeRef.current.contentWindow.postMessage(
        {
          type,
          data,
          appInstance: appInstanceRef.current
        },
        config.aiagentBaseUrl
      )
    },
    [config.aiagentBaseUrl]
  )

  /**
   * Guest 模式初始化
   */
  const initGuestMode = useCallback(() => {
    if (config.mode !== 'guest') return

    // 验证必要字段
    if (!config.appId || !config.appKey) {
      console.error('Guest 模式缺少必要配置: appId 或 appKey')
      setError('Guest 模式配置不完整')
      setStatus(AIBotStatus.ERROR)
      return
    }

    const guestInitData: AIBotGuestInitData = {
      app_id: config.appId,
      access_token: config.appKey,
      app_instance: config.appInstance || `app${config.appId}`,
      user: btoa(encodeURIComponent(JSON.stringify(config.user || {})))
    }

    appInstanceRef.current = guestInitData.app_instance
    setStatus(AIBotStatus.READY)
    sendMessage(AIBotMessageType.GUEST_INIT, guestInitData)
  }, [config, sendMessage])

  /**
   * API 模式初始化
   */
  const initAPIMode = useCallback(async () => {
    if (config.mode !== 'api') return

    // 验证必要字段
    if (!config.chatInitPath || !config.renewTokenPath) {
      console.error('API 模式缺少必要配置: chatInitPath 或 renewTokenPath')
      setError('API 模式配置不完整')
      setStatus(AIBotStatus.ERROR)
      return
    }

    try {
      setStatus(AIBotStatus.INITIALIZING)

      // 调用初始化接口
      const response = await fetch(config.chatInitPath, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          app_instance: config.appInstance || 'eip_ai'
        })
      })

      if (!response.ok) {
        throw new Error(`初始化失败: ${response.statusText}`)
      }

      const result = await response.json()
      if (result.code !== 'SUCCESS') {
        throw new Error(result.message || '初始化失败')
      }

      const data: AIBotAPIInitData = result.data
      refreshTokenRef.current = data.refresh_token
      appInstanceRef.current = config.appInstance || 'eip_ai'

      setStatus(AIBotStatus.READY)

      // 发送初始化数据到 iframe
      sendMessage(AIBotMessageType.CHAT_INIT, {
        access_token: data.access_token,
        unique_id: data.unique_id,
        user: data.user,
        app_id: data.app_id,
        name: data.user_name,
        oauth_token_time_out: data.expired_in,
        app_instance: appInstanceRef.current
      })
    } catch (err) {
      console.error('API 模式初始化失败:', err)
      setError(err instanceof Error ? err.message : '初始化失败')
      setStatus(AIBotStatus.ERROR)
    }
  }, [config, sendMessage])

  /**
   * Guest 模式刷新 Token
   */
  const reloadGuestToken = useCallback(() => {
    if (config.mode !== 'guest' || !config.appId || !config.appKey) return

    const guestInitData: AIBotGuestInitData = {
      app_id: config.appId,
      access_token: config.appKey,
      app_instance: config.appInstance || `app${config.appId}`,
      user: btoa(encodeURIComponent(JSON.stringify(config.user || {})))
    }

    sendMessage(AIBotMessageType.GUEST_RELOAD_TOKEN, guestInitData)
  }, [config, sendMessage])

  /**
   * API 模式刷新 Token
   */
  const reloadAPIToken = useCallback(async () => {
    if (config.mode !== 'api' || !config.renewTokenPath || !refreshTokenRef.current) return

    try {
      const response = await fetch(config.renewTokenPath, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          app_instance: appInstanceRef.current,
          refresh_token: refreshTokenRef.current
        })
      })

      if (!response.ok) {
        throw new Error(`刷新 Token 失败: ${response.statusText}`)
      }

      const result = await response.json()
      if (result.code !== 'SUCCESS') {
        throw new Error(result.message || '刷新 Token 失败')
      }

      const { access_token, refresh_token } = result.data
      refreshTokenRef.current = refresh_token

      sendMessage(AIBotMessageType.RELOAD_TOKEN, { access_token })
    } catch (err) {
      console.error('刷新 Token 失败:', err)
      sendMessage(AIBotMessageType.MESSAGE, {
        content: '用户信息获取失败，请刷新重试',
        type: 'warning'
      })
    }
  }, [config, sendMessage])

  /**
   * 处理来自 iframe 的消息
   */
  const handleMessage = useCallback(
    (event: MessageEvent<AIBotMessage>) => {
      // 验证消息来源
      if (event.origin !== new URL(config.aiagentBaseUrl).origin) {
        return
      }

      // 验证消息来源窗口
      if (event.source !== iframeRef.current?.contentWindow) {
        return
      }

      const { type, data, appInstance } = event.data

      // 验证 appInstance
      if (appInstance && appInstance !== appInstanceRef.current && appInstance !== '') {
        return
      }


      // 处理不同类型的消息
      switch (type) {
        case AIBotMessageType.CHAT_INIT:
          // iframe 准备就绪，开始初始化
          if (config.mode === 'guest') {
            initGuestMode()
          } else if (config.mode === 'api') {
            initAPIMode()
          }
          break

        case AIBotMessageType.ON_CLOSE:
          // AI Bot 请求关闭主窗口
          window.electronAPI.ipcRenderer.invoke('window:hide-main')
          break

        case AIBotMessageType.CHAT_OPEN:
          // AI Bot 打开
          break

        case AIBotMessageType.API_ERROR:
          // API 错误处理
          try {
            const errorData = JSON.parse(data)
            if (errorData.status === 401 || errorData.status === 403) {
              // Token 过期，重新获取
              if (config.mode === 'guest') {
                reloadGuestToken()
              } else if (config.mode === 'api') {
                reloadAPIToken()
              }
            }
          } catch (err) {
            console.error('处理 API 错误失败:', err)
          }
          break

        case AIBotMessageType.COPY_TEXT:
          // 复制文本到剪贴板
          handleCopyToClipboard(data)
          break

        default:
      }
    },
    [config, initGuestMode, initAPIMode, reloadGuestToken, reloadAPIToken]
  )

  /**
   * 处理复制到剪贴板
   */
  const handleCopyToClipboard = useCallback(
    (data: string) => {
      try {
        let textToCopy = data
        try {
          textToCopy = JSON.parse(data)
        } catch {
          // 如果不是 JSON，直接使用原始数据
        }

        if (navigator.clipboard) {
          navigator.clipboard
            .writeText(textToCopy)
            .then(() => {
              sendMessage(AIBotMessageType.MESSAGE, {
                content: '复制成功',
                type: 'success'
              })
            })
            .catch(() => {
              sendMessage(AIBotMessageType.MESSAGE, {
                content: '复制失败',
                type: 'warning'
              })
            })
        } else {
          sendMessage(AIBotMessageType.MESSAGE, {
            content: '复制失败',
            type: 'warning'
          })
        }
      } catch (err) {
        console.error('复制到剪贴板失败:', err)
        sendMessage(AIBotMessageType.MESSAGE, {
          content: '复制失败',
          type: 'warning'
        })
      }
    },
    [sendMessage]
  )

  // 使用 useRef 存储稳定的 handleMessage 回调，避免频繁重新注册监听器
  const handleMessageRef = useRef(handleMessage)
  
  // 更新 ref
  useEffect(() => {
    handleMessageRef.current = handleMessage
  }, [handleMessage])

  /**
   * 设置消息监听器 - 使用稳定的回调避免频繁重新注册
   */
  useEffect(() => {
    const stableHandler = (event: MessageEvent<AIBotMessage>) => {
      handleMessageRef.current(event)
    }

    window.addEventListener('message', stableHandler)

    return () => {
      window.removeEventListener('message', stableHandler)
    }
  }, []) // 空依赖数组，只注册一次

  /**
   * 打开聊天
   */
  const openChat = useCallback(() => {
    if (status !== AIBotStatus.READY) return
    sendMessage(AIBotMessageType.CHAT_OPEN, { app_instance: appInstanceRef.current })
  }, [sendMessage, status])

  /**
   * 关闭聊天
   */
  const closeChat = useCallback(() => {
    if (status !== AIBotStatus.READY) return
    sendMessage(AIBotMessageType.CHAT_CLOSE, { app_instance: appInstanceRef.current })
  }, [sendMessage, status])

  // 使用 useRef 存储稳定的回调
  const openChatRef = useRef(openChat)
  const closeChatRef = useRef(closeChat)

  // 更新 ref
  useEffect(() => {
    openChatRef.current = openChat
    closeChatRef.current = closeChat
  }, [openChat, closeChat])

  /**
   * 监听窗口可见性变化，通知 iframe - 使用稳定的回调避免频繁重新注册
   */
  useEffect(() => {
    const handleVisibilityChange = (visible: boolean) => {
      if (visible) {
        openChatRef.current()
      } else {
        closeChatRef.current()
      }
    }

    window.electronAPI.window.onVisibilityChanged(handleVisibilityChange)

    return () => {
      window.electronAPI.window.removeVisibilityListener()
    }
  }, []) // 空依赖数组，只注册一次

  return {
    iframeRef,
    status,
    error,
    sendMessage,
    openChat,
    closeChat
  }
}
