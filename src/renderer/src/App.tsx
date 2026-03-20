import React, { useState, useEffect } from 'react'
import './App.css'
import type { AIBotConfig } from '../../shared/types'
import AppWithAIBot from './AppWithAIBot.tsx'
import AppWithoutAIBot from './AppWithoutAIBot.tsx'
import AppWithFullMode from './AppWithFullMode.tsx'

/**
 * 主应用组件
 * 根据配置状态决定渲染哪个子组件
 */
const App: React.FC = () => {
  // AI Bot 配置状态
  const [config, setConfig] = useState<AIBotConfig | null>(null)

  // 加载持久化配置
  useEffect(() => {
    loadConfig()

    // 监听配置更新
    window.electronAPI.config.onUpdated((newConfig: AIBotConfig) => {
      setConfig(newConfig)
    })

    window.electronAPI.config.onCleared(() => {
      setConfig(null)
    })

    window.electronAPI.config.onImported((importedConfig: any) => {
      if (importedConfig.aiBot) {
        setConfig(importedConfig.aiBot)
      }
    })

    window.electronAPI.config.onReset(() => {
      setConfig(null)
    })

    return () => {
      window.electronAPI.config.removeListeners()
    }
  }, [])

  const loadConfig = async () => {
    const result = await window.electronAPI.config.getAIBot()
    if (result.success && result.config) {
      setConfig(result.config)
    }
  }

  // 根据配置渲染不同的组件
  if (!config) {
    return <AppWithoutAIBot />
  }

  // 完整模式
  if (config.mode === 'full') {
    return <AppWithFullMode />
  }

  // Guest 或 API 模式
  return <AppWithAIBot config={config} />
}

export default App
