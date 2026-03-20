import React, { useState, useEffect } from 'react'
import './Settings.css'
import type { AIBotConfig } from '../../../shared/types'

/**
 * 设置页面组件
 */
const Settings: React.FC = () => {
  const [aiBotConfig, setAiBotConfig] = useState<AIBotConfig | null>(null)
  const [originalMode, setOriginalMode] = useState<'guest' | 'api' | 'full' | null>(null) // 记录原始模式
  const [originalEnvironment, setOriginalEnvironment] = useState<
    'prod' | 'preview' | 'test' | null
  >(null) // 记录原始环境
  const [hasChanges, setHasChanges] = useState(false)
  const [message, setMessage] = useState<{
    type: 'success' | 'error' | 'info'
    text: string
  } | null>(null)
  const [autoStart, setAutoStart] = useState<boolean>(false)
  const [floatingTriggerEnabled, setFloatingTriggerEnabled] = useState<boolean>(true)
  const [showBrowserWindow, setShowBrowserWindow] = useState<boolean>(true)
  const [workspacePath, setWorkspacePath] = useState<string>('')

  // 加载配置
  useEffect(() => {
    loadConfig()
    loadAutoStart()
    loadFloatingTriggerEnabled()
    loadShowBrowserWindow()
    loadWorkspacePath()

    // 监听配置更新
    const handleConfigImported = (config: any) => {
      if (config.aiBot) {
        setAiBotConfig(prevConfig => {
          const oldMode = prevConfig?.mode || null
          const newMode = config.aiBot.mode

          setOriginalMode(newMode) // 更新原始模式
          setOriginalEnvironment(config.aiBot.fullModeEnvironment || 'prod') // 更新原始环境
          setHasChanges(false)

          // 如果模式发生变化，提示需要重启
          if (oldMode && oldMode !== newMode) {
            showMessage(
              'info',
              `配置已导入。模式已从 ${oldMode.toUpperCase()} 切换到 ${newMode.toUpperCase()}，请重启应用以生效`
            )
          } else {
            showMessage('success', '配置已导入')
          }

          return config.aiBot
        })
      }
    }

    window.electronAPI.config.onImported(handleConfigImported)

    return () => {
      window.electronAPI.config.removeListeners()
    }
  }, [])

  const loadConfig = async () => {
    const result = await window.electronAPI.config.getAIBot()
    if (result.success && result.config) {
      setAiBotConfig(result.config)
      setOriginalMode(result.config.mode) // 记录原始模式
      setOriginalEnvironment(result.config.fullModeEnvironment || 'prod') // 记录原始环境
    }
  }

  const loadAutoStart = async () => {
    const result = await window.electronAPI.config.getAutoStart()
    if (result.success) {
      setAutoStart(result.autoStart ?? false)
    }
  }

  const loadFloatingTriggerEnabled = async () => {
    const result = await window.electronAPI.config.getFloatingTriggerEnabled()
    if (result.success) {
      setFloatingTriggerEnabled(result.enabled ?? true)
    }
  }

  const loadShowBrowserWindow = async () => {
    const result = await window.electronAPI.config.getShowBrowserWindow()
    if (result.success && result.show !== undefined) {
      setShowBrowserWindow(result.show)
    }
  }

  const loadWorkspacePath = async () => {
    const result = await window.electronAPI.config.getWorkspacePath()
    if (result.success) {
      setWorkspacePath(result.path || '')
    }
  }

  const handleAutoStartChange = async (enabled: boolean) => {
    setAutoStart(enabled)
    const result = await window.electronAPI.config.setAutoStart(enabled)
    if (result.success) {
      showMessage('success', `开机自启动已${enabled ? '启用' : '禁用'}`)
    } else {
      showMessage('error', result.error || '设置失败')
      // 恢复原状态
      loadAutoStart()
    }
  }

  const handleFloatingTriggerChange = async (enabled: boolean) => {
    setFloatingTriggerEnabled(enabled)
    const result = await window.electronAPI.config.setFloatingTriggerEnabled(enabled)
    if (result.success) {
      showMessage('success', `悬浮触发器已${enabled ? '启用' : '禁用'}`)
    } else {
      showMessage('error', result.error || '设置失败')
      loadFloatingTriggerEnabled()
    }
  }

  const handleShowBrowserWindowChange = async (show: boolean) => {
    setShowBrowserWindow(show)
    const result = await window.electronAPI.config.setShowBrowserWindow(show)
    if (result.success) {
      showMessage('success', `打开网页时${show ? '显示' : '不显示'}浏览器窗口`)
    } else {
      showMessage('error', result.error || '设置失败')
      loadShowBrowserWindow()
    }
  }

  const handleSelectWorkspacePath = async () => {
    const result = await window.electronAPI.config.selectWorkspacePath()
    if (result.success && result.path) {
      setWorkspacePath(result.path)

      // 如果有警告，显示警告信息
      if (result.warnings && result.warnings.length > 0) {
        showMessage('info', `工作区路径已设置，但存在警告：${result.warnings.join('；')}`)
      } else {
        showMessage('success', '工作区路径已设置')
      }
    } else if (result.error) {
      showMessage('error', result.error)
    }
  }

  const handleClearWorkspacePath = async () => {
    if (!confirm('确定要清除工作区路径吗？')) {
      return
    }
    const result = await window.electronAPI.config.setWorkspacePath('')
    if (result.success) {
      setWorkspacePath('')
      showMessage('success', '工作区路径已清除')
    } else {
      showMessage('error', result.error || '清除失败')
    }
  }

  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const copyErrorToClipboard = async () => {
    if (message?.type === 'error' && message.text) {
      try {
        await navigator.clipboard.writeText(message.text)
        showMessage('success', '已复制到剪贴板')
      } catch {
        showMessage('error', '复制失败')
      }
    }
  }

  const handleSaveAIBot = async () => {
    if (!aiBotConfig) {
      showMessage('error', '请先配置 AI Bot')
      return
    }

    // 检测是否是模式切换
    const isModeChanged = originalMode !== null && originalMode !== aiBotConfig.mode
    // 检测是否是完整模式的环境变化
    const isEnvironmentChanged =
      originalMode === 'full' &&
      aiBotConfig.mode === 'full' &&
      (originalEnvironment || 'prod') !== (aiBotConfig.fullModeEnvironment || 'prod')

    const result = await window.electronAPI.config.saveAIBot(aiBotConfig)
    if (result.success) {
      setHasChanges(false)
      setOriginalMode(aiBotConfig.mode) // 更新原始模式
      setOriginalEnvironment(aiBotConfig.fullModeEnvironment || 'prod') // 更新原始环境

      if (isModeChanged || isEnvironmentChanged || result.modeChanged) {
        // 模式或环境已切换，需要重启应用
        const changeType = isEnvironmentChanged ? '环境已切换' : '模式已切换'
        showMessage('info', `${changeType}，应用将在 2 秒后重启以生效...`)
        // 通知主进程重启应用
        setTimeout(async () => {
          const restartResult = await window.electronAPI.config.restartApp()
          if (restartResult.success) {
          }
        }, 2000)
      } else {
        showMessage('success', '保存成功')
      }
    } else {
      showMessage('error', result.error || '保存失败')
    }
  }

  const handleSwitchMode = () => {
    if (!aiBotConfig) return

    // 切换模式，保留所有数据
    let newMode: 'guest' | 'api' | 'full'
    if (aiBotConfig.mode === 'guest') {
      newMode = 'api'
    } else if (aiBotConfig.mode === 'api') {
      newMode = 'full'
    } else {
      newMode = 'guest'
    }

    const updatedConfig = {
      ...aiBotConfig,
      mode: newMode
    }

    setAiBotConfig(updatedConfig)
    setHasChanges(true) // 标记为有更改

    // 显示提示信息：需要保存后重启
    showMessage(
      'info',
      `已切换到 ${newMode.toUpperCase()} 模式，请点击保存按钮以应用更改（应用将自动重启）`
    )
  }

  const handleClearAIBot = async () => {
    if (!confirm('确定要清除 AI Bot 配置吗？')) {
      return
    }

    const result = await window.electronAPI.config.clearAIBot()
    if (result.success) {
      setAiBotConfig(null)
      setHasChanges(false)
      showMessage('success', '已清除配置')
    } else {
      showMessage('error', result.error || '清除失败')
    }
  }

  const handleExport = async () => {
    const result = await window.electronAPI.config.export()
    if (result.success) {
      showMessage('success', `配置已导出到: ${result.path}`)
    } else if (result.error) {
      showMessage('error', result.error)
    }
  }

  const handleImport = async () => {
    const result = await window.electronAPI.config.import()
    if (result.success) {
      showMessage('success', '配置已导入')
      await loadConfig()
    } else if (result.error) {
      showMessage('error', result.error)
    }
  }

  const handleGuestFormChange = (field: string, value: string) => {
    if (!aiBotConfig) return

    if (field.startsWith('user.')) {
      const userField = field.split('.')[1]
      setAiBotConfig({
        ...aiBotConfig,
        user: {
          ...aiBotConfig.user,
          [userField]: value
        }
      })
    } else {
      setAiBotConfig({
        ...aiBotConfig,
        [field]: value
      })
    }
    setHasChanges(true)
  }

  const handleAPIFormChange = (field: string, value: string) => {
    if (!aiBotConfig) return

    setAiBotConfig({
      ...aiBotConfig,
      [field]: value
    })
    setHasChanges(true)
  }

  const initGuestMode = () => {
    setAiBotConfig({
      mode: 'guest',
      appId: '',
      appKey: '',
      aiagentBaseUrl: '',
      user: {},
      // API 模式字段保留为空
      chatInitPath: '',
      renewTokenPath: '',
      appInstance: ''
    })
    setHasChanges(true)
  }

  const initAPIMode = () => {
    setAiBotConfig({
      mode: 'api',
      aiagentBaseUrl: '',
      chatInitPath: '',
      renewTokenPath: '',
      appInstance: 'eip_ai',
      // Guest 模式字段保留为空
      appId: '',
      appKey: '',
      user: {}
    })
    setHasChanges(true)
  }

  const initFullMode = async () => {
    const fullConfig = {
      mode: 'full' as const,
      aiagentBaseUrl: '',
      appInstance: '',
      // 所有字段都可选，完整模式无需配置
      appId: '',
      appKey: '',
      user: {},
      chatInitPath: '',
      renewTokenPath: '',
      ssoCredentials: {},
      fullModeEnvironment: 'prod' as const
    }
    setAiBotConfig(fullConfig)
    // 完整模式自动保存
    const result = await window.electronAPI.config.saveAIBot(fullConfig)
    if (result.success) {
      setHasChanges(false)
      showMessage('success', '完整模式已启用并保存')
    } else {
      setHasChanges(true)
      showMessage('error', result.error || '保存失败')
    }
  }

  return (
    <div className="settings-container">
      {/* 消息提示（错误时提供复制错误信息） */}
      {message && (
        <div className={`message-toast message-${message.type}`}>
          <span>{message.text}</span>
          {message.type === 'error' && (
            <button
              type="button"
              className="message-toast-copy"
              onClick={copyErrorToClipboard}
              title="复制错误信息"
            >
              复制错误信息
            </button>
          )}
        </div>
      )}

      {/* 主内容区 */}
      <div className="settings-content">
        <div className="settings-panel">
          {/* 顶部标题 */}
          <div className="panel-header">
            <h3 className="panel-title">AI Bot 配置</h3>
            <p className="panel-description">
              配置 AI Bot 的连接方式。支持 Guest 模式、API 模式和完整模式。
            </p>
          </div>

          {!aiBotConfig ? (
            <div className="empty-state">
              <p>🎯 暂无配置，请选择一种模式开始配置</p>
              <div className="mode-buttons">
                <button className="mode-btn" onClick={initGuestMode}>
                  👤 Guest 模式
                </button>
                <button className="mode-btn" onClick={initAPIMode}>
                  🔌 API 模式
                </button>
                <button className="mode-btn" onClick={initFullMode}>
                  ✨ 完整模式
                </button>
              </div>
            </div>
          ) : (
            <div className="config-form">
              {/* 模式切换 */}
              <div className="mode-switch">
                <span className="mode-label">当前模式：</span>
                <span className="mode-badge">{aiBotConfig.mode.toUpperCase()}</span>
                <button className="switch-mode-btn" onClick={handleSwitchMode}>
                  切换到{' '}
                  {aiBotConfig.mode === 'guest'
                    ? 'API'
                    : aiBotConfig.mode === 'api'
                    ? '完整'
                    : 'GUEST'}{' '}
                  模式
                </button>
              </div>

              {/* 完整模式：显示 SSO 登录凭证配置 */}
              {aiBotConfig.mode === 'full' && (
                <div className="full-mode-info">
                  <p className="full-mode-text">✨ 完整模式已启用</p>
                  <p className="full-mode-desc">在此模式下，无需进行任何配置即可使用所有功能。</p>

                  <div className="form-section" style={{ marginTop: '24px' }}>
                    <h4>环境选择</h4>
                    <p
                      className="full-mode-desc"
                      style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}
                    >
                      选择完整模式要连接的环境
                    </p>

                    <div className="form-group">
                      <label>环境</label>
                      <select
                        value={aiBotConfig.fullModeEnvironment || 'prod'}
                        onChange={e => {
                          setAiBotConfig({
                            ...aiBotConfig,
                            fullModeEnvironment: e.target.value as
                              | 'prod'
                              | 'preview'
                              | 'test'
                              | 'dev'
                          })
                          setHasChanges(true)
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          fontSize: '14px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          backgroundColor: '#fff'
                        }}
                      >
                        <option value="prod">生产环境 (https://aizs.sailvan.com)</option>
                        <option value="preview">预览环境 (https://aizs-preview.sailvan.com)</option>
                        <option value="test">测试环境 (https://test-aizs.sailvan.com)</option>
                        <option value="dev">开发环境 (http://localhost:5173)</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-section" style={{ marginTop: '24px' }}>
                    <h4>SSO 自动登录配置（可选）</h4>
                    <p
                      className="full-mode-desc"
                      style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}
                    >
                      配置后，当 token 过期跳转到 SSO 登录页面时将自动填写账号密码并登录
                    </p>

                    <div className="form-group">
                      <label>SSO 用户名</label>
                      <input
                        type="text"
                        value={aiBotConfig.ssoCredentials?.username || ''}
                        onChange={e => {
                          setAiBotConfig({
                            ...aiBotConfig,
                            ssoCredentials: {
                              ...aiBotConfig.ssoCredentials,
                              username: e.target.value
                            }
                          })
                          setHasChanges(true)
                        }}
                        placeholder="请输入 SSO 用户名"
                      />
                    </div>

                    <div className="form-group">
                      <label>SSO 密码</label>
                      <input
                        type="password"
                        value={aiBotConfig.ssoCredentials?.password || ''}
                        onChange={e => {
                          setAiBotConfig({
                            ...aiBotConfig,
                            ssoCredentials: {
                              ...aiBotConfig.ssoCredentials,
                              password: e.target.value
                            }
                          })
                          setHasChanges(true)
                        }}
                        placeholder="请输入 SSO 密码"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Guest 模式表单 */}
              {aiBotConfig.mode === 'guest' && (
                <>
                  <div className="form-group">
                    <label>AI Agent 基础 URL *</label>
                    <input
                      type="text"
                      value={aiBotConfig.aiagentBaseUrl || ''}
                      onChange={e => handleGuestFormChange('aiagentBaseUrl', e.target.value)}
                      placeholder="https://example.com"
                    />
                  </div>

                  <div className="form-group">
                    <label>App ID *</label>
                    <input
                      type="text"
                      value={aiBotConfig.appId || ''}
                      onChange={e => handleGuestFormChange('appId', e.target.value)}
                      placeholder="应用 ID"
                    />
                  </div>

                  <div className="form-group">
                    <label>App Key *</label>
                    <input
                      type="password"
                      value={aiBotConfig.appKey || ''}
                      onChange={e => handleGuestFormChange('appKey', e.target.value)}
                      placeholder="应用密钥"
                    />
                  </div>

                  <div className="form-group">
                    <label>App Instance</label>
                    <input
                      type="text"
                      value={aiBotConfig.appInstance || ''}
                      onChange={e => handleGuestFormChange('appInstance', e.target.value)}
                      placeholder={`默认为 app${aiBotConfig.appId}`}
                    />
                  </div>

                  <div className="form-section">
                    <h4>用户信息（可选）</h4>

                    <div className="form-group">
                      <label>工号</label>
                      <input
                        type="text"
                        value={aiBotConfig.user?.workcode || ''}
                        onChange={e => handleGuestFormChange('user.workcode', e.target.value)}
                        placeholder="用户工号"
                      />
                    </div>

                    <div className="form-group">
                      <label>用户名</label>
                      <input
                        type="text"
                        value={aiBotConfig.user?.username || ''}
                        onChange={e => handleGuestFormChange('user.username', e.target.value)}
                        placeholder="用户名"
                      />
                    </div>

                    <div className="form-group">
                      <label>公司</label>
                      <input
                        type="text"
                        value={aiBotConfig.user?.company || ''}
                        onChange={e => handleGuestFormChange('user.company', e.target.value)}
                        placeholder="公司名称"
                      />
                    </div>

                    <div className="form-group">
                      <label>邮箱</label>
                      <input
                        type="email"
                        value={aiBotConfig.user?.email || ''}
                        onChange={e => handleGuestFormChange('user.email', e.target.value)}
                        placeholder="用户邮箱"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* API 模式表单 */}
              {aiBotConfig.mode === 'api' && (
                <>
                  <div className="form-group">
                    <label>AI Agent 基础 URL *</label>
                    <input
                      type="text"
                      value={aiBotConfig.aiagentBaseUrl || ''}
                      onChange={e => handleAPIFormChange('aiagentBaseUrl', e.target.value)}
                      placeholder="https://example.com"
                    />
                  </div>

                  <div className="form-group">
                    <label>聊天初始化路径 *</label>
                    <input
                      type="text"
                      value={aiBotConfig.chatInitPath || ''}
                      onChange={e => handleAPIFormChange('chatInitPath', e.target.value)}
                      placeholder="/api/chat/init"
                    />
                  </div>

                  <div className="form-group">
                    <label>刷新 Token 路径 *</label>
                    <input
                      type="text"
                      value={aiBotConfig.renewTokenPath || ''}
                      onChange={e => handleAPIFormChange('renewTokenPath', e.target.value)}
                      placeholder="/api/token/renew"
                    />
                  </div>

                  <div className="form-group">
                    <label>App Instance</label>
                    <input
                      type="text"
                      value={aiBotConfig.appInstance || 'eip_ai'}
                      onChange={e => handleAPIFormChange('appInstance', e.target.value)}
                      placeholder="默认为 eip_ai"
                    />
                  </div>
                </>
              )}

              {/* 保存按钮 */}
              <div className="form-actions">
                <button className="save-btn" onClick={handleSaveAIBot} disabled={!hasChanges}>
                  {hasChanges ? '💾 保存配置' : '✅ 已保存'}
                  {hasChanges &&
                    ((originalMode !== null && originalMode !== aiBotConfig.mode) ||
                      (aiBotConfig.mode === 'full' &&
                        originalEnvironment !== null &&
                        (originalEnvironment || 'prod') !==
                          (aiBotConfig.fullModeEnvironment || 'prod'))) && (
                      <span className="restart-hint"> (将自动重启)</span>
                    )}
                </button>
                <button className="clear-btn" onClick={handleClearAIBot}>
                  🗑️ 清除配置
                </button>
              </div>
              {/* 模式切换提示 */}
              {hasChanges && originalMode !== null && originalMode !== aiBotConfig.mode && (
                <div className="mode-change-notice">
                  <p className="notice-icon">⚠️</p>
                  <p className="notice-text">
                    您已切换到 <strong>{aiBotConfig.mode.toUpperCase()}</strong> 模式。
                    点击保存后，应用将自动重启以使更改生效。
                  </p>
                </div>
              )}
              {/* 环境切换提示 */}
              {hasChanges &&
                aiBotConfig.mode === 'full' &&
                originalMode === 'full' &&
                originalEnvironment !== null &&
                (originalEnvironment || 'prod') !== (aiBotConfig.fullModeEnvironment || 'prod') && (
                  <div className="mode-change-notice">
                    <p className="notice-icon">⚠️</p>
                    <p className="notice-text">
                      您已切换完整模式环境为{' '}
                      <strong>
                        {aiBotConfig.fullModeEnvironment === 'prod'
                          ? '生产环境'
                          : aiBotConfig.fullModeEnvironment === 'preview'
                          ? '预览环境'
                          : aiBotConfig.fullModeEnvironment === 'test'
                          ? '测试环境'
                          : '开发环境'}
                      </strong>
                      。 点击保存后，应用将自动重启以使更改生效。
                    </p>
                  </div>
                )}
            </div>
          )}

          {/* 应用设置 - 始终显示 */}
          <div className="app-settings-section">
            <h4 className="section-title">应用设置</h4>
            <div className="app-setting-item">
              <div className="app-setting-content">
                <div className="app-setting-label">
                  <span className="app-setting-name">开机自启动</span>
                  <span className="app-setting-desc">系统启动时自动运行应用</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={autoStart}
                    onChange={e => handleAutoStartChange(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
            <div className="app-setting-item">
              <div className="app-setting-content">
                <div className="app-setting-label">
                  <span className="app-setting-name">悬浮触发器</span>
                  <span className="app-setting-desc">在桌面右下角显示悬浮图标</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={floatingTriggerEnabled}
                    onChange={e => handleFloatingTriggerChange(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
            <div className="app-setting-item">
              <div className="app-setting-content">
                <div className="app-setting-label">
                  <span className="app-setting-name">显示浏览器窗口</span>
                  <span className="app-setting-desc">通过“打开网页”或 browser_navigate 时是否显示浏览器窗口</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={showBrowserWindow}
                    onChange={e => handleShowBrowserWindowChange(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
            <div className="app-setting-item workspace-setting-item">
              <div className="app-setting-content workspace-setting-content">
                <div className="app-setting-label">
                  <span className="app-setting-name">工作区路径</span>
                  <span className="app-setting-desc">设置应用可以读写文件的工作区目录</span>
                </div>
                <div className="workspace-controls">
                  <div className="workspace-input-wrapper">
                    <input
                      type="text"
                      className="workspace-input"
                      value={workspacePath}
                      readOnly
                      placeholder="未设置工作区路径"
                    />
                  </div>
                  <div className="workspace-buttons">
                    <button
                      className="workspace-btn workspace-btn-primary"
                      onClick={handleSelectWorkspacePath}
                    >
                      选择路径
                    </button>
                    {workspacePath && (
                      <>
                        <button
                          className="workspace-btn workspace-btn-danger"
                          onClick={handleClearWorkspacePath}
                        >
                          清除
                        </button>
                        <button
                          className="workspace-btn workspace-btn-success"
                          onClick={async () => {
                            const result = await window.electronAPI.fileExplorer.open()
                            if (!result.success) {
                              showMessage('error', result.error || '打开文件管理器失败')
                            }
                          }}
                        >
                          打开工作区
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 其他功能 - 完整模式不显示 */}
          {aiBotConfig?.mode !== 'full' && (
            <div className="panel-footer">
              <div className="footer-section">
                <h4 className="footer-title">其他功能</h4>
                <div className="footer-actions">
                  <button className="footer-btn" onClick={handleExport}>
                    <span className="footer-btn-icon">📤</span>
                    <div className="footer-btn-content">
                      <span className="footer-btn-title">导出配置</span>
                      <span className="footer-btn-desc">导出当前配置到文件</span>
                    </div>
                  </button>
                  <button className="footer-btn" onClick={handleImport}>
                    <span className="footer-btn-icon">📥</span>
                    <div className="footer-btn-content">
                      <span className="footer-btn-title">导入配置</span>
                      <span className="footer-btn-desc">从文件导入配置</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Settings
