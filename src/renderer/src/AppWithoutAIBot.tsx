import React from 'react'
import './App.css'

/**
 * 不带 AI Bot 的应用组件
 */
const AppWithoutAIBot: React.FC = () => {
  /**
   * 开始截图
   */
  const handleStartScreenshot = async () => {
    try {
      const result = await window.electronAPI.screenshot.start()
      if (result.success && result.imagePath) {
      } else if (!result.success) {
        alert('截图失败: ' + (result.error || '未知错误'))
      }
    } catch (error) {
      console.error('截图失败:', error)
      alert('截图失败: ' + (error instanceof Error ? error.message : '未知错误'))
    }
  }

  /**
   * 打开设置窗口
   */
  const openSettings = async () => {
    await window.electronAPI.settings.open()
  }

  return (
    <div className="app">
      {/* 主界面 */}
      <main className="app-main">
        <div className="button-container">
          <button className="primary-button" onClick={handleStartScreenshot}>
            开始截图
          </button>

          <button className="secondary-button settings-button" onClick={openSettings}>
            设置
          </button>
        </div>
      </main>
    </div>
  )
}

export default AppWithoutAIBot

