import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import './floating-panel.css'

/**
 * 浮窗面板组件
 */
const FloatingPanel: React.FC = () => {
    const [aiConfig, setAiConfig] = useState<any>(null)

    useEffect(() => {
        // 加载 AI Bot 配置
        const loadConfig = async () => {
            const result = await window.electronAPI.config.getAIBot()
            if (result.success && result.config) {
                setAiConfig(result.config)
            } else {
                setAiConfig(null)
            }
        }

        loadConfig()

        // 监听配置更新
        window.electronAPI.config.onUpdated((newConfig: any) => {
            setAiConfig(newConfig)
        })

        window.electronAPI.config.onCleared(() => {
            setAiConfig(null)
        })

        window.electronAPI.config.onImported((importedConfig: any) => {
            if (importedConfig.aiBot) {
                setAiConfig(importedConfig.aiBot)
            }
        })

        return () => {
            window.electronAPI.config.removeListeners()
        }
    }, [])

    const handleScreenshot = async () => {
        await window.electronAPI.screenshot.start()
        handleClose()
    }

    const handleSettings = async () => {
        await window.electronAPI.settings.open()
        handleClose()
    }

    const handleAIChat = async () => {
        // 打开/显示主窗口（主窗口中有 AI Bot iframe）
        await window.electronAPI.ipcRenderer.invoke('window:show-main')
        handleClose()
    }

    const handleClose = () => {
        window.electronAPI.ipcRenderer.invoke('floating:panel-leave')
    }

    return (
        <div className="floating-panel">
            <div className="panel-container">
                {/* 头部 */}
                <div className="panel-header">
                    <h2>快捷操作</h2>
                    <button className="close-btn" onClick={handleClose}>
                        ✕
                    </button>
                </div>

                {/* 功能按钮 */}
                <div className="panel-content">
                    <button className="action-card screenshot-card" onClick={handleScreenshot}>
                        <div className="card-icon">📸</div>
                        <div className="card-info">
                            <h3>截图</h3>
                            <p>快速截取屏幕内容</p>
                        </div>
                    </button>

                    {aiConfig && (
                        <button className="action-card ai-chat-card" onClick={handleAIChat}>
                            <div className="card-icon">🤖</div>
                            <div className="card-info">
                                <h3>AI 聊天</h3>
                                <p>与 AI Bot 对话交流</p>
                            </div>
                            <div className="card-badge">{aiConfig.mode.toUpperCase()}</div>
                        </button>
                    )}

                    <button className="action-card settings-card" onClick={handleSettings}>
                        <div className="card-icon">⚙️</div>
                        <div className="card-info">
                            <h3>设置</h3>
                            <p>配置应用程序选项</p>
                        </div>
                    </button>

                    {!aiConfig && (
                        <div className="info-card">
                            <div className="info-icon">💡</div>
                            <div className="info-text">
                                <p>未配置 AI Bot</p>
                                <button className="link-button" onClick={handleSettings}>
                                    立即配置 →
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* 底部提示 */}
                <div className="panel-footer">
                    <p>点击关闭按钮隐藏面板</p>
                </div>
            </div>
        </div>
    )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <FloatingPanel />
    </React.StrictMode>
)

