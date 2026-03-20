import React from 'react'
import './App.css'
import { useAIBotChat } from './hooks/useAIBotChat'
import type { AIBotConfig } from '../../shared/types'

interface AppWithAIBotProps {
  config: AIBotConfig
}

/**
 * 带 AI Bot 的应用组件
 */
const AppWithAIBot: React.FC<AppWithAIBotProps> = ({ config }) => {
  // 使用 AI Bot Hook
  const { iframeRef } = useAIBotChat(config)

  return (
    <div className="app">
      {/* AI Bot iframe 全屏容器 */}
      <div className="aibot-container">
        <iframe
          ref={iframeRef}
          src={config.aiagentBaseUrl}
          className="aibot-iframe"
          title="AI Bot"
        />
      </div>
    </div>
  )
}

export default AppWithAIBot

