/* 注入到页面的脚本内需保留 console.log/error 供主进程监听，故本文件禁用 no-console */
/* eslint-disable no-console */
import { BrowserWindow, dialog, shell, screen, app, Menu, clipboard } from 'electron'
import { join } from 'path'
import { configManager } from './configManager'
import { floatingPanelManager } from './floatingPanel'
import { fileExplorerWindowManager } from './fileExplorerWindow'
import { getIconPath, shouldOpenDevTools, escapeScriptString } from './utils'
import log from './logger'
import { getWebPreferencesWithPreload } from './window/webPreferences'
import type { AIBotConfig } from '../shared/types'
import { windowStateManager, type WindowState } from './windowStateManager'

/**
 * 主窗口管理模块
 * 职责：负责主窗口的创建、配置、生命周期管理
 */
export class MainWindowManager {
  private window: BrowserWindow | null = null
  private isQuitting = false
  // 完整模式 URL 映射
  private readonly FULL_MODE_URLS = {
    prod: 'https://aizs.sailvan.com/default/chat',
    preview: 'https://aizs-preview.sailvan.com/default/chat',
    test: 'https://test-aizs.sailvan.com/default/chat',
    dev: 'http://localhost:5173/default/chat'
  }
  private ssoAutoLoginAttempted = false // 防止重复执行自动登录
  private ssoInputCaptured = false // 是否已捕获用户输入
  private capturedCredentials: { username?: string; password?: string } | null = null // 捕获的凭证
  private credentialsListenerSetup = false // 是否已设置凭证监听器
  private navigationHandler: (() => void) | null = null // 存储导航处理器引用
  private newWindowSSOAttempted = new Map<BrowserWindow, boolean>() // 跟踪新窗口的 SSO 登录尝试
  private saveWindowStateTimer: NodeJS.Timeout | null = null // 保存窗口状态的防抖定时器
  private aiConsoleWindows = new Set<BrowserWindow>() // 跟踪所有AI控制台窗口
  private windowCreationMode: 'guest' | 'api' | 'full' | null = null // 记录窗口创建时的模式

  /**
   * 创建主窗口
   */
  createWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show()
      this.window.focus()
      return this.window
    }

    // 获取保存的窗口状态（由 windowStateManager 单独存储）
    const savedState = windowStateManager.load()
    const defaultWidth = 900
    const defaultHeight = 670

    // 验证保存的状态是否有效（窗口是否在屏幕范围内）
    const validatedState = this.validateWindowState(savedState)

    // 根据当前模式决定是否显示窗口标题栏
    // guest 和 api 模式显示系统标题栏，full 模式保持无边框
    const aiBotConfig = configManager.getAIBotConfig()
    const currentMode = aiBotConfig?.mode || 'full'
    const shouldShowFrame = currentMode === 'guest' || currentMode === 'api'

    // 记录窗口创建时的模式
    this.windowCreationMode = currentMode

    this.window = new BrowserWindow({
      width: validatedState?.width || defaultWidth,
      height: validatedState?.height || defaultHeight,
      x: validatedState?.x,
      y: validatedState?.y,
      show: false,
      autoHideMenuBar: true,
      title: 'ai助手',
      icon: getIconPath(), // 设置窗口图标
      frame: shouldShowFrame, // guest 和 api 模式显示标题栏，full 模式无边框
      webPreferences: {
        ...getWebPreferencesWithPreload(join(__dirname, '../preload/index.js')),
        webSecurity: true
      }
    })

    // 注册窗口事件
    this.registerWindowEvents()

    // 恢复窗口状态（全屏/最大化）
    if (validatedState?.isFullScreen) {
      // 延迟恢复全屏状态，确保窗口已创建
      this.window.once('ready-to-show', () => {
        if (this.window && !this.window.isDestroyed()) {
          this.window.setFullScreen(true)
        }
      })
    } else if (validatedState?.isMaximized) {
      // 延迟恢复最大化状态，确保窗口已创建
      this.window.once('ready-to-show', () => {
        if (this.window && !this.window.isDestroyed()) {
          this.window.maximize()
        }
      })
    }

    // 延迟加载页面，确保窗口完全初始化
    // Electron 39 可能需要更多时间来完成窗口初始化
    setTimeout(() => {
      try {
        this.loadPage()
      } catch (error) {
        log.error('[主窗口] 加载页面失败:', error)
        if (error instanceof Error && error.stack) {
          log.error('[主窗口] 错误堆栈:', error.stack)
        }
      }
    }, 100)

    return this.window
  }

  /**
   * 注册窗口事件
   */
  private registerWindowEvents(): void {
    if (!this.window) return

    // 窗口准备显示时
    this.window.on('ready-to-show', () => {
      // this.window?.show()
    })

    // 窗口关闭事件 - 最小化到托盘而不是退出
    this.window.on('close', event => {
      if (!this.isQuitting) {
        event.preventDefault()
        // 关闭前保存窗口状态
        this.saveWindowState()
        this.hide()
      } else {
        // 真正退出时也要保存窗口状态
        this.saveWindowState()
      }
    })

    // 窗口已关闭
    this.window.on('closed', () => {
      this.window = null
      this.windowCreationMode = null
      // 清除定时器
      if (this.saveWindowStateTimer) {
        clearTimeout(this.saveWindowStateTimer)
        this.saveWindowStateTimer = null
      }
    })

    // 窗口显示时 - 通知渲染进程并聚焦输入框
    this.window.on('show', () => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('window:visibility-changed', true)
        // 聚焦到输入框
        this.focusTextarea()
        // 通知触发器窗口清除上传计数
        this.notifyTriggerWindowClearCount()
      }
    })

    // 窗口隐藏时 - 通知渲染进程
    this.window.on('hide', () => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('window:visibility-changed', false)
      }
    })

    // 监听窗口移动事件
    this.window.on('move', () => {
      this.saveWindowStateDebounced()
    })

    // 监听窗口调整大小事件
    this.window.on('resize', () => {
      this.saveWindowStateDebounced()
    })

    // 监听窗口最大化/还原事件
    this.window.on('maximize', () => {
      this.saveWindowStateDebounced()
      // 通知渲染进程窗口已最大化
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('window:maximized-changed', true)
      }
    })

    this.window.on('unmaximize', () => {
      this.saveWindowStateDebounced()
      // 通知渲染进程窗口已还原
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('window:maximized-changed', false)
      }
    })

    // 监听窗口全屏/退出全屏事件
    this.window.on('enter-full-screen', () => {
      this.saveWindowStateDebounced()
    })

    this.window.on('leave-full-screen', () => {
      this.saveWindowStateDebounced()
    })

    // 延迟注册 webContents 事件监听器，避免在窗口未完全初始化时触发
    // Electron 39 可能需要更多时间来完成窗口初始化
    setTimeout(() => {
      if (!this.window || this.window.isDestroyed()) return

      try {
        // 监听 DOM ready 事件，在页面 JavaScript 执行前设置全局变量
        this.window.webContents.on('dom-ready', () => {
          try {
            this.setClientAvailableFlag()
            // 只在 full 模式下注入拖拽样式和窗口控制按钮（无边框窗口需要）
            const aiBotConfig = configManager.getAIBotConfig()
            if (aiBotConfig?.mode === 'full') {
              this.injectDragStyles()
              this.injectWindowControls()
            }
          } catch (error) {
            log.error('[主窗口] dom-ready 事件处理失败:', error)
          }
        })

        // 监听页面导航完成事件，检测 SSO 登录页面
        this.window.webContents.on('did-finish-load', () => {
          try {
            this.handleSSOLogin()
            // 确保全局变量已设置（备用）
            this.setClientAvailableFlag()
            // 只在 full 模式下注入拖拽样式和窗口控制按钮（无边框窗口需要）
            const aiBotConfig = configManager.getAIBotConfig()
            if (aiBotConfig?.mode === 'full') {
              this.injectDragStyles()
              this.injectWindowControls()
            }
          } catch (error) {
            log.error('[主窗口] did-finish-load 事件处理失败:', error)
          }
        })

        // 监听页面导航开始事件，也检测 SSO 登录页面（因为某些页面可能在导航过程中就跳转）
        this.window.webContents.on('did-navigate', () => {
          try {
            this.handleSSOLogin()
          } catch (error) {
            log.error('[主窗口] did-navigate 事件处理失败:', error)
          }
        })
      } catch (error) {
        log.error('[主窗口] 注册 webContents 事件监听器失败:', error)
      }
    }, 200)

    // 监听导航请求，允许内部系统的外链在当前窗口打开
    // 这样可以从主窗口跳转到其他内部系统，并共享 SSO 登录凭证
    this.window.webContents.on('will-navigate', (_event, navigationUrl) => {
      if (!this.window || this.window.isDestroyed()) return

      try {
        const url = new URL(navigationUrl)
        const currentUrl = this.window.webContents.getURL()

        // 允许以下情况的导航：
        // 1. SSO 登录页面（sso.valsun.cn）- 需要自动登录
        // 2. 内部系统域名（sailvan.com, valsun.cn）- 可能是外链跳转
        // 3. 当前域名的导航
        const isSSOPage = url.hostname.includes('sso.valsun.cn')
        const isInternalSystem =
          url.hostname.includes('sailvan.com') || url.hostname.includes('valsun.cn')
        const isCurrentDomain = currentUrl && new URL(currentUrl).hostname === url.hostname

        if (isSSOPage || isInternalSystem || isCurrentDomain) {
          // 允许导航，不阻止
          return
        }
      } catch (error) {
        // URL 解析失败，可能是特殊协议或无效 URL，允许通过
        log.warn('[主窗口] 导航 URL 解析失败:', navigationUrl, error)
      }
    })

    // 监听上下文菜单事件，显示自定义右键菜单
    this.window.webContents.on('context-menu', (_event, params) => {
      const menu = Menu.buildFromTemplate([
        // 编辑操作
        {
          label: '剪切',
          role: 'cut',
          enabled: params.editFlags.canCut
        },
        {
          label: '复制',
          role: 'copy',
          enabled: params.editFlags.canCopy
        },
        {
          label: '粘贴',
          role: 'paste',
          enabled: params.editFlags.canPaste
        },
        {
          label: '选择性粘贴',
          role: 'pasteAndMatchStyle',
          enabled: params.editFlags.canPaste
        },
        { type: 'separator' as const },
        {
          label: '全选',
          role: 'selectAll',
          enabled: params.editFlags.canSelectAll
        },
        { type: 'separator' as const },
        // 页面操作
        {
          label: '重新加载',
          role: 'reload',
          click: () => {
            this.window?.webContents.reload()
          }
        },
        {
          label: '强制重新加载',
          role: 'forceReload',
          click: () => {
            this.window?.webContents.reloadIgnoringCache()
          }
        },
        {
          label: '检查元素',
          role: 'toggleDevTools',
          visible: process.env.NODE_ENV === 'development' || params.isEditable
        },
        { type: 'separator' },
        // 链接操作
        ...(params.linkURL
          ? [
              {
                label: '在新窗口中打开链接',
                click: () => {
                  shell.openExternal(params.linkURL!)
                }
              },
              {
                label: '复制链接地址',
                click: () => {
                  if (params.linkURL) {
                    clipboard.writeText(params.linkURL)
                  }
                }
              },
              { type: 'separator' as const }
            ]
          : []),
        // 图片操作
        ...(params.hasImageContents
          ? [
              {
                label: '复制图片',
                click: () => {
                  this.window?.webContents.copyImageAt(params.x, params.y)
                }
              },
              {
                label: '另存为...',
                click: () => {
                  this.window?.webContents.downloadURL(params.srcURL || '')
                }
              },
              {
                label: '打开工作区',
                click: () => {
                  fileExplorerWindowManager.show()
                }
              },
              { type: 'separator' as const }
            ]
          : []),
        // 搜索操作
        ...(params.selectionText
          ? [
              {
                label: '搜索 "' + params.selectionText.substring(0, 30) + '"',
                click: () => {
                  shell.openExternal(
                    `https://www.google.com/search?q=${encodeURIComponent(params.selectionText!)}`
                  )
                }
              },
              { type: 'separator' as const }
            ]
          : [])
      ])

      menu.popup()
    })

    // 处理新窗口打开请求（如 target="_blank" 的链接）
    // 支持 AI 控制台等内部系统在新窗口打开，并共享 SSO 登录凭证
    this.window.webContents.setWindowOpenHandler(details => {
      const url = details.url
      try {
        const parsedUrl = new URL(url)

        // 检测是否为内部系统（包括 AI 控制台）
        const isSSOPage = parsedUrl.hostname.includes('sso.valsun.cn')
        const isInternalSystem =
          parsedUrl.hostname.includes('sailvan.com') || parsedUrl.hostname.includes('valsun.cn')
        // AI 控制台可能是特定的子域名或路径
        const isAIConsole =
          parsedUrl.hostname.includes('aizs') ||
          parsedUrl.pathname.includes('/console') ||
          parsedUrl.pathname.includes('/admin')

        if (isSSOPage || isInternalSystem || isAIConsole) {
          // 内部系统（包括 AI 控制台）在新窗口打开，以便支持后续的 SSO 重定向

          // 创建新窗口
          const newWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            show: true,
            autoHideMenuBar: true,
            title: 'AI 控制台',
            icon: getIconPath(), // 设置窗口图标
            webPreferences: {
              ...getWebPreferencesWithPreload(join(__dirname, '../preload/index.js')),
              webSecurity: true
            }
          })

          // 为新窗口注册 SSO 自动登录逻辑
          this.registerSSOForWindow(newWindow)

          // 加载 URL
          newWindow.loadURL(url)

          // 保存AI控制台窗口引用
          this.aiConsoleWindows.add(newWindow)

          // 监听窗口关闭，清理相关状态
          newWindow.on('closed', () => {
            // 清理该窗口的 SSO 尝试记录
            this.newWindowSSOAttempted.delete(newWindow)
            // 清理AI控制台窗口引用
            this.aiConsoleWindows.delete(newWindow)
          })

          return { action: 'deny' }
        }

        // 外部链接在系统浏览器打开
        shell.openExternal(url)
        return { action: 'deny' }
      } catch (_error) {
        // URL 解析失败，默认在外部浏览器打开
        shell.openExternal(url)
        return { action: 'deny' }
      }
    })
  }

  /**
   * 加载页面
   * 根据配置决定加载完整模式 URL 还是本地 React 应用
   */
  private loadPage(): void {
    if (!this.window || this.window.isDestroyed()) {
      log.warn('[主窗口] 窗口不存在或已销毁，无法加载页面')
      return
    }

    try {
      let aiBotConfig = configManager.getAIBotConfig()

      // 如果没有配置，创建默认的完整模式配置
      if (!aiBotConfig) {
        const defaultFullConfig: AIBotConfig = {
          mode: 'full',
          aiagentBaseUrl: '',
          appInstance: '',
          appId: '',
          appKey: '',
          user: {},
          chatInitPath: '',
          renewTokenPath: '',
          ssoCredentials: {},
          fullModeEnvironment: 'prod'
        }

        // 保存默认配置
        const saved = configManager.saveAIBotConfig(defaultFullConfig)
        if (saved) {
          aiBotConfig = defaultFullConfig
        }
      }

      // 如果是完整模式，直接加载官网 URL
      if (aiBotConfig && aiBotConfig.mode === 'full') {
        // 根据环境配置选择 URL，默认为生产环境
        const environment = aiBotConfig.fullModeEnvironment || 'prod'
        const fullModeUrl = this.FULL_MODE_URLS[environment]

        // 清除之前可能存在的 sessionStorage 数据（访客模式留下的）
        this.clearGuestModeStorage()

        // 加载完整模式 URL
        this.window.loadURL(fullModeUrl)
        // 重置 SSO 相关标志
        this.ssoAutoLoginAttempted = false
        this.ssoInputCaptured = false
        this.capturedCredentials = null
        this.credentialsListenerSetup = false
        this.navigationHandler = null
        return
      }

      // 否则加载本地 React 应用
      const isDev = process.env.NODE_ENV === 'development'

      if (isDev && process.env['ELECTRON_RENDERER_URL']) {
        const url = process.env['ELECTRON_RENDERER_URL']
        log.info('[主窗口] 加载开发环境 URL:', url)
        this.window.loadURL(url).catch(error => {
          log.error('[主窗口] 加载 URL 失败:', error)
        })
        // 延迟打开开发者工具，避免在窗口未准备好时打开
        if (shouldOpenDevTools()) {
          setTimeout(() => {
            if (this.window && !this.window.isDestroyed()) {
              this.window.webContents.openDevTools()
            }
          }, 500)
        }
      } else {
        const filePath = join(__dirname, '../renderer/index.html')
        log.info('[主窗口] 加载本地文件:', filePath)
        this.window.loadFile(filePath).catch(error => {
          log.error('[主窗口] 加载文件失败:', error)
        })
      }
    } catch (error) {
      log.error('[主窗口] loadPage 发生错误:', error)
      if (error instanceof Error && error.stack) {
        log.error('[主窗口] 错误堆栈:', error.stack)
      }
    }
  }

  /**
   * 清除 sessionStorage 中的 isGuest 和 isSSO
   * 通用方法，可在任何时候调用
   */
  clearSessionStorage(): void {
    if (!this.window || this.window.isDestroyed()) return

    const clearStorageScript = `
      (function() {
        try {
          // 清除 sessionStorage 中的相关数据
          if (window.sessionStorage) {
            window.sessionStorage.removeItem('isGuest');
            window.sessionStorage.removeItem('isSSO');
          }
        } catch (e) {
          log.error('[主窗口] 清除 sessionStorage 失败:', e);
        }
      })();
    `

    // 尝试执行清除脚本（即使页面可能正在关闭）
    try {
      this.window.webContents.executeJavaScript(clearStorageScript).catch(err => {
        log.error('[主窗口] 执行清除脚本失败:', err)
      })
    } catch (error) {
      log.error('[主窗口] 清除 sessionStorage 失败:', error)
    }
  }

  /**
   * 清除访客模式在 sessionStorage 中留下的数据
   * 在加载完整模式之前调用
   */
  private clearGuestModeStorage(): void {
    if (!this.window) return

    // 监听 DOM 准备就绪事件（比 did-finish-load 更早）
    const handleDomReady = () => {
      if (!this.window || this.window.isDestroyed()) return

      this.clearSessionStorage()

      // 移除一次性监听器
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.removeListener('dom-ready', handleDomReady)
      }
    }

    // 监听 DOM 准备就绪事件（在页面 JavaScript 执行前）
    this.window.webContents.once('dom-ready', handleDomReady)

    // 同时监听页面加载完成作为备用（以防 dom-ready 未触发）
    const handleDidFinishLoad = () => {
      if (!this.window || this.window.isDestroyed()) return

      const currentURL = this.window.webContents.getURL()
      if (currentURL.includes('aizs.sailvan.com')) {
        this.clearSessionStorage()
      }

      // 移除一次性监听器
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.removeListener('did-finish-load', handleDidFinishLoad)
      }
    }

    this.window.webContents.once('did-finish-load', handleDidFinishLoad)
  }

  /**
   * 重新加载页面（用于配置变更时切换模式）
   * 如果模式切换导致 frame 设置需要改变，会重新创建窗口
   */
  reloadPage(): void {
    if (!this.window || this.window.isDestroyed()) {
      this.createWindow()
      return
    }

    // 检查当前配置的模式
    const aiBotConfig = configManager.getAIBotConfig()
    const newMode = aiBotConfig?.mode || 'full'
    const newShouldShowFrame = newMode === 'guest' || newMode === 'api'
    const oldShouldShowFrame =
      this.windowCreationMode === 'guest' || this.windowCreationMode === 'api'

    // 如果 frame 设置需要改变，重新创建窗口
    if (newShouldShowFrame !== oldShouldShowFrame) {
      // 保存窗口状态
      this.saveWindowState()

      // 保存窗口引用和状态
      const oldWindow = this.window
      const wasMaximized = oldWindow.isMaximized()
      const wasFullScreen = oldWindow.isFullScreen()
      const bounds = oldWindow.getBounds()

      // 销毁旧窗口
      oldWindow.destroy()
      this.window = null
      this.windowCreationMode = null

      // 重新创建窗口
      const newWindow = this.createWindow()

      // 恢复窗口状态
      if (newWindow && !newWindow.isDestroyed()) {
        newWindow.once('ready-to-show', () => {
          const currentWindow = this.window
          if (currentWindow && !currentWindow.isDestroyed()) {
            if (wasFullScreen) {
              currentWindow.setFullScreen(true)
            } else if (wasMaximized) {
              currentWindow.maximize()
            } else {
              currentWindow.setBounds(bounds)
            }
          }
        })
      }
    } else {
      // 不需要重新创建窗口，只需重新加载页面
      this.loadPage()
    }
  }

  /**
   * 获取主窗口实例
   */
  getWindow(): BrowserWindow | null {
    return this.window
  }

  /**
   * 显示主窗口
   * 如果窗口已存在，确保根据当前配置加载正确的页面
   */
  show(forceReload: boolean = false): void {
    if (this.window && !this.window.isDestroyed()) {
      // 只有在 forceReload 为 true 时才检查并重新加载
      // 这样可以避免在正常显示窗口时（如从截图窗口返回）触发不必要的页面重载
      if (forceReload) {
        // 检查当前配置，确保加载正确的页面
        const aiBotConfig = configManager.getAIBotConfig()
        const isFullMode = aiBotConfig?.mode === 'full'
        const currentURL = this.window.webContents.getURL()

        // 如果 URL 为空或 about:blank，说明页面还未加载，跳过检查
        if (currentURL && currentURL !== 'about:blank' && !currentURL.startsWith('chrome://')) {
          // 检查是否匹配任一完整模式 URL
          const isCurrentlyFullMode = Object.values(this.FULL_MODE_URLS).some(url =>
            currentURL.includes(url)
          )

          // 如果模式不匹配，需要重新加载
          if (isFullMode !== isCurrentlyFullMode) {
            this.loadPage()
          }
        }
      }

      if (this.window.isMinimized()) {
        this.window.restore()
      }
      this.window.show()
      this.window.focus()
      // 聚焦到输入框
      this.focusTextarea()
    } else {
      this.createWindow()
    }
  }

  /**
   * 隐藏主窗口
   */
  hide(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide()
    }
  }

  /**
   * 最小化主窗口
   */
  minimize(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.minimize()
    }
  }

  /**
   * 最大化/还原主窗口
   */
  maximize(): void {
    if (this.window && !this.window.isDestroyed()) {
      if (this.window.isMaximized()) {
        this.window.unmaximize()
      } else {
        this.window.maximize()
      }
    }
  }

  /**
   * 获取窗口是否最大化
   */
  isMaximized(): boolean {
    return this.window ? this.window.isMaximized() : false
  }

  /**
   * 关闭主窗口
   */
  close(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close()
    }
  }

  /**
   * 设置退出标志
   */
  setQuitting(value: boolean): void {
    this.isQuitting = value
  }

  /**
   * 获取退出标志
   */
  getQuitting(): boolean {
    return this.isQuitting
  }

  /**
   * 销毁主窗口
   */
  destroy(): void {
    this.isQuitting = true
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy()
    }
    this.window = null
  }

  /**
   * 为指定窗口注册 SSO 自动登录逻辑
   * 用于新创建的窗口（如 AI 控制台）也支持 SSO 自动登录
   */
  private registerSSOForWindow(window: BrowserWindow): void {
    if (!window || window.isDestroyed()) return

    // 监听 DOM ready 事件，在页面 JavaScript 执行前设置全局变量
    window.webContents.on('dom-ready', () => {
      this.setClientAvailableFlagForWindow(window)
    })

    // 监听页面导航完成事件，检测 SSO 登录页面
    window.webContents.on('did-finish-load', () => {
      this.handleSSOLoginForWindow(window)
      // 确保全局变量已设置（备用）
      this.setClientAvailableFlagForWindow(window)
    })

    // 监听页面导航开始事件，也检测 SSO 登录页面
    window.webContents.on('did-navigate', () => {
      this.handleSSOLoginForWindow(window)
    })
  }

  /**
   * 处理 SSO 自动登录（针对特定窗口）
   * 当检测到跳转到 SSO 登录页面时，自动填写账号密码并登录
   */
  private handleSSOLoginForWindow(targetWindow: BrowserWindow): void {
    if (!targetWindow || targetWindow.isDestroyed()) return

    const currentURL = targetWindow.webContents.getURL()

    // 检测是否为 SSO 登录页面
    if (!currentURL.includes('sso.valsun.cn')) {
      // 如果不是 SSO 页面，清除该窗口的 SSO 尝试标志（允许下次再试）
      this.newWindowSSOAttempted.delete(targetWindow)
      return
    }

    // 检查是否已经尝试过自动登录（防止重复执行）
    if (this.newWindowSSOAttempted.get(targetWindow)) {
      return
    }

    // 获取配置
    const aiBotConfig = configManager.getAIBotConfig()

    // 检查是否配置了 SSO 凭证（不限制模式，任何模式都可以使用 SSO 自动登录）
    // 这样可以支持内部系统的外链，共享登录凭证
    const hasCredentials =
      aiBotConfig?.ssoCredentials?.username && aiBotConfig?.ssoCredentials?.password

    if (!hasCredentials) {
      return
    }

    // 标记已尝试自动登录
    this.newWindowSSOAttempted.set(targetWindow, true)

    // 等待 DOM 准备就绪后再注入脚本
    const handleDomReady = () => {
      if (!targetWindow || targetWindow.isDestroyed()) return

      const username = aiBotConfig.ssoCredentials?.username || ''
      const password = aiBotConfig.ssoCredentials?.password || ''
      this.injectAutoLoginScriptForWindow(targetWindow, username, password)
    }

    // 如果页面已经加载完成，直接执行
    if (targetWindow.webContents.isLoading()) {
      // 等待页面加载完成
      targetWindow.webContents.once('dom-ready', handleDomReady)
    } else {
      // 页面已加载，直接执行
      handleDomReady()
    }
  }

  /**
   * 为指定窗口注入自动登录脚本
   */
  private injectAutoLoginScriptForWindow(
    targetWindow: BrowserWindow,
    username: string,
    password: string
  ): void {
    if (!targetWindow || targetWindow.isDestroyed()) return

    // 转义字符串，防止注入攻击
    const escapedUsername = escapeScriptString(username)
    const escapedPassword = escapeScriptString(password)

    // 注入自动登录脚本（复用原有的脚本逻辑）
    const autoLoginScript = `
        (function() {
          try {
            // 查找用户名和密码输入框
            const usernameInput = document.getElementById('username');
            const passwordInput = document.getElementById('password');
            const loginButton = document.getElementById('login-btn');

            if (!usernameInput || !passwordInput || !loginButton) {
              // 如果元素还没加载，稍后重试
              setTimeout(() => {
                const retryUsername = document.getElementById('username');
                const retryPassword = document.getElementById('password');
                const retryButton = document.getElementById('login-btn');
                if (retryUsername && retryPassword && retryButton) {
                  executeAutoLogin(retryUsername, retryPassword, retryButton);
                }
              }, 500);
              return;
            }

            // 执行自动登录
            function executeAutoLogin(userInput, passInput, btn) {
              // 设置用户名和密码
              userInput.value = '${escapedUsername}';
              passInput.value = '${escapedPassword}';

              // 触发 input 事件，确保页面监听到值变化
              userInput.dispatchEvent(new Event('input', { bubbles: true }));
              passInput.dispatchEvent(new Event('input', { bubbles: true }));

              // 触发 change 事件
              userInput.dispatchEvent(new Event('change', { bubbles: true }));
              passInput.dispatchEvent(new Event('change', { bubbles: true }));

              // 等待一小段时间确保值已设置
              setTimeout(() => {
                // 点击登录按钮
                btn.click();
              }, 300);
            }

            executeAutoLogin(usernameInput, passwordInput, loginButton);
          } catch (error) {
            log.error('[自动登录-新窗口] 执行失败:', error);
          }
        })();
      `

    targetWindow.webContents.executeJavaScript(autoLoginScript).catch(err => {
      log.error('[主窗口] 在新窗口执行自动登录脚本失败:', err)
    })
  }

  /**
   * 处理 SSO 自动登录（主窗口）
   * 当检测到跳转到 SSO 登录页面时，自动填写账号密码并登录
   */
  private handleSSOLogin(): void {
    if (!this.window || this.window.isDestroyed()) return

    const currentURL = this.window.webContents.getURL()

    // 检测是否为 SSO 登录页面
    if (!currentURL.includes('sso.valsun.cn')) {
      // 如果不是 SSO 页面，重置标志（但保留捕获的凭证，直到登录成功或明确放弃）
      this.ssoAutoLoginAttempted = false
      // 注意：不重置 ssoInputCaptured 和 capturedCredentials，因为可能正在登录中
      return
    }

    // 如果已经尝试过自动登录，不再重复执行
    if (this.ssoAutoLoginAttempted) {
      return
    }

    // 获取配置
    const aiBotConfig = configManager.getAIBotConfig()

    // 检查是否配置了 SSO 凭证（不限制模式，任何模式都可以使用 SSO 自动登录）
    // 这样可以支持内部系统的外链，共享登录凭证
    const hasCredentials =
      aiBotConfig?.ssoCredentials?.username && aiBotConfig?.ssoCredentials?.password

    // 如果是从外链跳转到 SSO，也支持自动登录（不限制模式）
    if (hasCredentials) {
      this.ssoAutoLoginAttempted = true // 标记已尝试自动登录
    } else {
      // 只有在完整模式下才捕获用户输入（避免在其他模式下干扰）
      if (aiBotConfig?.mode === 'full') {
        // 重置捕获标志，准备捕获用户输入
        this.ssoInputCaptured = false
        this.capturedCredentials = null
      } else {
        // 非完整模式且未配置凭证，跳过自动登录和捕获
        return
      }
    }

    // 等待 DOM 准备就绪后再注入脚本
    const handleDomReady = () => {
      if (!this.window || this.window.isDestroyed()) return

      if (hasCredentials) {
        // 如果有配置的凭证，执行自动登录
        const username = aiBotConfig.ssoCredentials?.username || ''
        const password = aiBotConfig.ssoCredentials?.password || ''
        this.injectAutoLoginScript(username, password)
      } else {
        // 如果没有配置的凭证，监听用户手动输入
        this.injectInputCaptureScript()
      }
    }

    // 如果页面已经加载完成，直接执行
    if (this.window.webContents.isLoading()) {
      // 等待页面加载完成
      this.window.webContents.once('dom-ready', handleDomReady)
    } else {
      // 页面已加载，直接执行
      handleDomReady()
    }
  }

  /**
   * 注入自动登录脚本
   */
  private injectAutoLoginScript(username: string, password: string): void {
    if (!this.window || this.window.isDestroyed()) return

    // 转义字符串，防止注入攻击
    const escapedUsername = escapeScriptString(username)
    const escapedPassword = escapeScriptString(password)

    // 注入自动登录脚本
    const autoLoginScript = `
        (function() {
          try {
            // 查找用户名和密码输入框
            const usernameInput = document.getElementById('username');
            const passwordInput = document.getElementById('password');
            const loginButton = document.getElementById('login-btn');

            if (!usernameInput || !passwordInput || !loginButton) {
              // 如果元素还没加载，稍后重试
              setTimeout(() => {
                const retryUsername = document.getElementById('username');
                const retryPassword = document.getElementById('password');
                const retryButton = document.getElementById('login-btn');
                if (retryUsername && retryPassword && retryButton) {
                  executeAutoLogin(retryUsername, retryPassword, retryButton);
                }
              }, 500);
              return;
            }

            // 执行自动登录
            function executeAutoLogin(userInput, passInput, btn) {
              // 设置用户名和密码
              userInput.value = '${escapedUsername}';
              passInput.value = '${escapedPassword}';

              // 触发 input 事件，确保页面监听到值变化
              userInput.dispatchEvent(new Event('input', { bubbles: true }));
              passInput.dispatchEvent(new Event('input', { bubbles: true }));

              // 触发 change 事件
              userInput.dispatchEvent(new Event('change', { bubbles: true }));
              passInput.dispatchEvent(new Event('change', { bubbles: true }));

              // 等待一小段时间确保值已设置
              setTimeout(() => {
                // 点击登录按钮
                btn.click();
              }, 300);
            }

            executeAutoLogin(usernameInput, passwordInput, loginButton);
          } catch (error) {
            log.error('[自动登录] 执行失败:', error);
          }
        })();
      `

    this.window.webContents.executeJavaScript(autoLoginScript).catch(err => {
      log.error('[主窗口] 执行自动登录脚本失败:', err)
    })
  }

  /**
   * 注入输入捕获脚本，监听用户手动输入的账号密码
   */
  private injectInputCaptureScript(): void {
    if (!this.window || this.window.isDestroyed()) return

    const captureScript = `
      (function() {
        try {
          // 存储捕获的凭证
          let capturedCredentials = {
            username: null,
            password: null
          };

          // 查找输入框
          const usernameInput = document.getElementById('username');
          const passwordInput = document.getElementById('password');

          if (!usernameInput || !passwordInput) {
            // 如果元素还没加载，稍后重试
            setTimeout(() => {
              const retryUsername = document.getElementById('username');
              const retryPassword = document.getElementById('password');
              if (retryUsername && retryPassword) {
                setupInputCapture(retryUsername, retryPassword);
              }
            }, 500);
            return;
          }

          function setupInputCapture(userInput, passInput) {
            // 创建友好提示框
            function createInfoTip() {
              // 检查是否已存在提示框
              if (document.getElementById('electron-sso-capture-tip')) {
                return;
              }

              const tipDiv = document.createElement('div');
              tipDiv.id = 'electron-sso-capture-tip';
              tipDiv.style.cssText = \`
                position: fixed;
                top: 20px;
                right: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 16px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                z-index: 10000;
                max-width: 360px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
                font-size: 13px;
                line-height: 1.6;
                animation: slideInRight 0.3s ease-out;
              \`;

              tipDiv.innerHTML = \`
                <div style="display: flex; align-items: flex-start; gap: 12px;">
                  <div style="flex-shrink: 0; font-size: 20px;">💡</div>
                  <div style="flex: 1;">
                    <div style="font-weight: 600; margin-bottom: 8px; font-size: 14px;">自动保存登录凭证</div>
                    <div style="opacity: 0.95; font-size: 12px; line-height: 1.5;">
                      您输入的账号密码将在登录成功后自动保存到设置中，下次 token 过期时将自动填写并登录。
                    </div>
                    <div style="margin-top: 8px; font-size: 11px; opacity: 0.9;">
                      💾 如需更改，请前往应用设置页面调整
                    </div>
                    <button id="electron-sso-tip-close" style="
                      position: absolute;
                      top: 8px;
                      right: 8px;
                      background: rgba(255, 255, 255, 0.2);
                      border: none;
                      color: white;
                      width: 24px;
                      height: 24px;
                      border-radius: 4px;
                      cursor: pointer;
                      font-size: 16px;
                      line-height: 1;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      transition: background 0.2s;
                    " onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">×</button>
                  </div>
                </div>
                <style>
                  @keyframes slideInRight {
                    from {
                      transform: translateX(100%);
                      opacity: 0;
                    }
                    to {
                      transform: translateX(0);
                      opacity: 1;
                    }
                  }
                </style>
              \`;

              document.body.appendChild(tipDiv);

              // 添加关闭按钮事件
              const closeBtn = tipDiv.querySelector('#electron-sso-tip-close');
              if (closeBtn) {
                closeBtn.addEventListener('click', function() {
                  tipDiv.style.animation = 'slideOutRight 0.3s ease-out';
                  setTimeout(function() {
                    if (tipDiv.parentNode) {
                      tipDiv.parentNode.removeChild(tipDiv);
                    }
                  }, 300);
                });
              }

              // 添加淡出动画样式
              if (!document.getElementById('electron-sso-tip-styles')) {
                const style = document.createElement('style');
                style.id = 'electron-sso-tip-styles';
                style.textContent = \`
                  @keyframes slideOutRight {
                    from {
                      transform: translateX(0);
                      opacity: 1;
                    }
                    to {
                      transform: translateX(100%);
                      opacity: 0;
                    }
                  }
                \`;
                document.head.appendChild(style);
              }
            }

            // 显示提示框
            createInfoTip();

            // 监听用户名输入
            userInput.addEventListener('input', function() {
              capturedCredentials.username = this.value;
            });

            userInput.addEventListener('change', function() {
              capturedCredentials.username = this.value;
            });

            // 监听密码输入
            passInput.addEventListener('input', function() {
              capturedCredentials.password = this.value;
            });

            passInput.addEventListener('change', function() {
              capturedCredentials.password = this.value;
            });

            // 监听登录按钮点击，在点击时立即保存凭证
            const loginButton = document.getElementById('login-btn');
            if (loginButton) {
              loginButton.addEventListener('click', function(e) {
                if (capturedCredentials.username && capturedCredentials.password) {
                  // 立即将凭证保存到主进程（通过 window.electronAPI 或直接调用）
                  // 由于我们在注入脚本中，需要通过 window.electronAPI 来调用
                  // 但如果 window.electronAPI 不可用，我们通过 console 输出，主进程监听
                  try {
                    // 尝试通过 postMessage 发送
                    if (window.electron && window.electron.send) {
                      window.electron.send('sso-credentials-captured', {
                        username: capturedCredentials.username,
                        password: capturedCredentials.password
                      });
                    } else {
                      // 备用方案：通过 console.log 输出特殊格式，主进程监听
                      console.log('[ELECTRON-SSO-CREDENTIALS]', JSON.stringify({
                        username: capturedCredentials.username,
                        password: capturedCredentials.password
                      }));
                    }
                  } catch (err) {
                    console.error('[输入捕获] 发送凭证失败:', err);
                    // 备用：通过 console.log
                    console.log('[ELECTRON-SSO-CREDENTIALS]', JSON.stringify({
                      username: capturedCredentials.username,
                      password: capturedCredentials.password
                    }));
                  }
                }
              }, true); // 使用捕获阶段，确保在页面处理前捕获
            }
          }

          setupInputCapture(usernameInput, passwordInput);
        } catch (error) {
          console.error('[输入捕获] 设置失败:', error);
        }
      })();
    `

    this.window.webContents.executeJavaScript(captureScript).catch(err => {
      log.error('[主窗口] 执行输入捕获脚本失败:', err)
    })

    // 监听来自页面的自定义事件（通过 postMessage）
    this.setupCredentialsCaptureListener()
  }

  /**
   * 设置凭证捕获监听器
   */
  private setupCredentialsCaptureListener(): void {
    if (!this.window || this.window.isDestroyed()) return

    // 如果已经设置过监听器，先移除之前的监听器
    if (this.credentialsListenerSetup && this.navigationHandler) {
      // 移除之前的导航监听器
      this.window.webContents.removeListener('did-finish-load', this.navigationHandler)
      this.navigationHandler = null
    }

    // 监听控制台消息，捕获通过 console.log 发送的凭证
    // 注意：console-message 监听器可能会累积，但每次只会处理一次凭证捕获
    const consoleMessageHandler = (_event: Electron.Event, _level: number, message: string) => {
      if (message.includes('[ELECTRON-SSO-CREDENTIALS]')) {
        try {
          const jsonStr = message.replace('[ELECTRON-SSO-CREDENTIALS]', '').trim()
          const credentials = JSON.parse(jsonStr)
          // 只在还没有捕获时才更新（避免重复处理）
          if (!this.capturedCredentials?.username || !this.capturedCredentials?.password) {
            this.capturedCredentials = {
              username: credentials.username,
              password: credentials.password
            }
            log.info('[主窗口] 凭证已捕获:', credentials.username)
          }
        } catch (error) {
          log.error('[主窗口] 解析凭证失败:', error)
        }
      }
    }

    // 移除之前的 console-message 监听器（如果存在）
    this.window.webContents.removeAllListeners('console-message')
    // 添加新的监听器
    this.window.webContents.on('console-message', consoleMessageHandler)

    // 监听导航事件，检测登录成功（URL 变化）
    this.navigationHandler = () => {
      if (!this.window || this.window.isDestroyed()) return
      // 如果已经处理过，直接返回
      if (this.ssoInputCaptured) return

      const currentURL = this.window.webContents.getURL()

      // 如果 URL 从 SSO 登录页面跳转到其他页面，说明登录成功
      // 支持所有内部系统域名的跳转（不仅限于 aizs.sailvan.com）
      // 常见的内部系统域名包括：sailvan.com, valsun.cn 等
      if (
        !currentURL.includes('sso.valsun.cn') &&
        (currentURL.includes('aizs.sailvan.com') ||
          currentURL.includes('sailvan.com') ||
          currentURL.includes('valsun.cn'))
      ) {
        // 延迟一下，确保凭证已经捕获，然后在 checkAndPromptSaveCredentials 中设置标志
        setTimeout(() => {
          // 再次检查，防止在延迟期间已经被处理
          if (!this.ssoInputCaptured) {
            this.checkAndPromptSaveCredentials()
          }
        }, 500)
      }
    }

    // 添加导航监听器（已经在上面创建了 navigationHandler）
    this.window.webContents.on('did-finish-load', this.navigationHandler)
    this.credentialsListenerSetup = true
  }

  /**
   * 检查并提示保存凭证
   */
  private async checkAndPromptSaveCredentials(): Promise<void> {
    if (!this.window || this.window.isDestroyed()) return

    // 双重检查：确保不会重复显示对话框
    if (this.ssoInputCaptured) {
      return
    }

    // 立即设置标志，防止重复调用
    this.ssoInputCaptured = true

    // 检查是否有捕获的凭证
    if (!this.capturedCredentials?.username || !this.capturedCredentials?.password) {
      // 如果没有凭证，重置标志，允许下次再试
      this.ssoInputCaptured = false
      return
    }

    try {
      // 询问用户是否保存凭证
      const result = await dialog.showMessageBox(this.window, {
        type: 'question',
        buttons: ['保存', '取消'],
        defaultId: 0,
        title: '保存 SSO 登录凭证',
        message: '检测到您已成功登录 SSO，是否保存您输入的账号密码以便下次自动登录？',
        detail: `用户名: ${this.capturedCredentials.username}\n保存后，下次 token 过期时将自动填写账号密码并登录。`
      })

      if (result.response === 0) {
        // 用户选择保存，更新配置
        const aiBotConfig = configManager.getAIBotConfig()
        if (aiBotConfig) {
          // 不限制模式，所有模式都可以保存 SSO 凭证（用于外链自动登录）
          const updatedConfig = {
            ...aiBotConfig,
            ssoCredentials: {
              username: this.capturedCredentials.username,
              password: this.capturedCredentials.password
            }
          }

          const saved = configManager.saveAIBotConfig(updatedConfig)
          if (saved) {
            await dialog.showMessageBox(this.window, {
              type: 'info',
              title: '保存成功',
              message: 'SSO 登录凭证已保存',
              detail: '凭证已保存，将在访问任何内部系统时自动使用（包括外链跳转）。'
            })
          } else {
            await dialog.showMessageBox(this.window, {
              type: 'error',
              title: '保存失败',
              message: '无法保存 SSO 登录凭证',
              detail: '请检查配置文件权限或尝试在设置页面手动保存。'
            })
          }
        }
      }

      // 清空捕获的凭证（已保存或用户拒绝）
      this.capturedCredentials = null
    } catch (error) {
      log.error('[主窗口] 检查凭证失败:', error)
      // 如果出错，重置标志，允许下次再试
      this.ssoInputCaptured = false
    }
  }

  /**
   * 验证窗口状态是否有效（窗口是否在屏幕范围内）
   */
  private validateWindowState(state: WindowState | undefined): WindowState | undefined {
    if (!state) return undefined

    // 如果窗口是全屏状态，bounds 验证可以放宽（因为全屏时 bounds 会被忽略）
    // 但 Electron 的 getBounds() 在全屏时返回的是进入全屏前的 bounds，这些 bounds 应该是有效的
    if (state.isFullScreen) {
      // 全屏状态下，只要有基本的 bounds 信息即可
      if (state.width && state.height) {
        return state
      }
    }

    const displays = screen.getAllDisplays()
    const { x, y, width, height } = state

    // 检查窗口是否在任何屏幕的可视区域内
    const isWindowVisible = displays.some(display => {
      const {
        x: displayX,
        y: displayY,
        width: displayWidth,
        height: displayHeight
      } = display.bounds

      // 窗口的右边界和底边界
      const windowRight = x !== undefined ? x + (width || 0) : 0
      const windowBottom = y !== undefined ? y + (height || 0) : 0

      // 检查窗口是否与屏幕有重叠（至少有一部分可见）
      return (
        x !== undefined &&
        y !== undefined &&
        width !== undefined &&
        height !== undefined &&
        windowRight > displayX &&
        x < displayX + displayWidth &&
        windowBottom > displayY &&
        y < displayY + displayHeight
      )
    })

    // 如果窗口不在任何屏幕范围内，返回 undefined（使用默认值）
    if (!isWindowVisible) {
      return undefined
    }

    return state
  }

  /**
   * 保存窗口状态（防抖版本）
   */
  private saveWindowStateDebounced(): void {
    if (!this.window || this.window.isDestroyed()) return

    // 清除之前的定时器
    if (this.saveWindowStateTimer) {
      clearTimeout(this.saveWindowStateTimer)
    }

    // 设置新的定时器，500ms 后保存
    this.saveWindowStateTimer = setTimeout(() => {
      this.saveWindowState()
    }, 500)
  }

  /**
   * 保存窗口状态
   */
  private saveWindowState(): void {
    if (!this.window || this.window.isDestroyed()) return

    try {
      const bounds = this.window.getBounds()
      const isMaximized = this.window.isMaximized()
      const isFullScreen = this.window.isFullScreen()

      const state: WindowState = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized,
        isFullScreen
      }

      windowStateManager.save(state)
    } catch (error) {
      log.error('[主窗口] 保存窗口状态失败:', error)
    }
  }

  /**
   * 设置客户端可用标志
   * 在页面加载早期设置全局变量，让网站能够检测到客户端存在
   */
  private setClientAvailableFlag(): void {
    if (!this.window || this.window.isDestroyed()) return
    this.setClientAvailableFlagForWindow(this.window)
    // 同时设置代码复制监听
    this.setupCodeCopyListener()
  }

  /**
   * 为指定窗口设置客户端可用标志
   * 在页面加载早期设置全局变量，让网站能够检测到客户端存在
   */
  private setClientAvailableFlagForWindow(targetWindow: BrowserWindow): void {
    if (!targetWindow || targetWindow.isDestroyed()) return

    // 获取应用信息
    const appName = app.getName() || 'Electron Screenshot'
    const appVersion = app.getVersion() || '1.0.0'

    // 转义字符串，防止注入攻击
    const escapedName = escapeScriptString(appName)
    const escapedVersion = escapeScriptString(appVersion)

    // 设置全局变量，标记客户端可用
    // 使用对象形式，可携带更多信息（版本、名称等）
    const clientInfoScript = `
      (function() {
        try {
          if (typeof window !== 'undefined') {
            window.__CLIENT_AVAILABLE__ = {
              isAvailable: true,
              version: '${escapedVersion}',
              name: '${escapedName}'
            };
          }
        } catch (error) {
          log.error('[客户端集成] 设置全局变量失败:', error);
        }
      })();
    `

    // 在页面执行 JavaScript 之前注入
    targetWindow.webContents.executeJavaScript(clientInfoScript).catch(err => {
      log.error('[主窗口] 设置客户端可用标志失败:', err)
    })
  }

  /**
   * 聚焦到输入框（arco-textarea）
   * 在窗口显示时自动聚焦，方便用户直接输入
   */
  private focusTextarea(): void {
    if (!this.window || this.window.isDestroyed()) return

    // 聚焦脚本：查找 arco-textarea 元素并聚焦
    const focusScript = `
      (function() {
        try {
          // 查找所有 arco-textarea 元素
          const textareas = document.getElementsByClassName('arco-textarea');

          if (textareas.length > 0) {
            // 聚焦到第一个找到的 textarea
            const textarea = textareas[0];
            textarea.focus();
            return true;
          } else {
            // 如果元素还没加载，稍后重试
            setTimeout(() => {
              const retryTextareas = document.getElementsByClassName('arco-textarea');
              if (retryTextareas.length > 0) {
                retryTextareas[0].focus();
              }
            }, 300);
            return false;
          }
        } catch (error) {
          log.error('[主窗口] 聚焦输入框失败:', error);
          return false;
        }
      })();
    `

    // 延迟执行，确保窗口已显示
    setTimeout(() => {
      if (!this.window || this.window.isDestroyed()) return
      this.window.webContents.executeJavaScript(focusScript).catch(err => {
        log.error('[主窗口] 执行聚焦脚本失败:', err)
      })
    }, 100)
  }

  /**
   * 通知触发器窗口清除上传计数
   * 当主窗口显示时调用，确保无论通过什么方式打开主窗口，都能清除触发器上的计数角标
   */
  private notifyTriggerWindowClearCount(): void {
    try {
      // 获取触发器窗口
      const triggerWindow = floatingPanelManager.getTriggerWindow()
      if (triggerWindow && !triggerWindow.isDestroyed()) {
        // 向触发器窗口发送清除计数的消息
        triggerWindow.webContents.send('trigger:clear-upload-count')
        log.info('[主窗口] 已通知触发器窗口清除上传计数')
      }
    } catch (error) {
      log.error('[主窗口] 通知触发器窗口清除计数失败:', error)
    }
  }

  /**
   * 设置代码复制监听
   * 监听BroadcastChannel的codeCopied事件，当用户复制代码时打开预览窗口
   */
  private setupCodeCopyListener(): void {
    if (!this.window || this.window.isDestroyed()) return

    // 注入代码复制监听脚本
    const codeCopyListenerScript = `
      (function() {
        try {
          // 检查是否支持 BroadcastChannel
          if (typeof BroadcastChannel === 'undefined') {
            console.warn('[客户端集成] 浏览器不支持 BroadcastChannel');
            return;
          }

          // 如果已经设置过监听器，不再重复设置
          if (window.__CODE_COPY_LISTENER_SETUP__) {
            return;
          }

          // 初始化 BroadcastChannel（使用 fileUpload 通道，与文件上传共用）
          const channel = new BroadcastChannel('fileUpload');

          // 监听来自网站的消息
          channel.onmessage = (event) => {
            try {
              const { type, source, data } = event.data || {};

              // 监听代码复制事件
              if (source === 'website' && type === 'codeCopied') {
                console.log('[客户端集成] 检测到代码复制事件');
                console.log('[客户端集成] 代码:', data.code);
                console.log('[客户端集成] 代码语言:', data.language);

                // 通过 window.electronAPI 发送消息到主进程
                if (window.electronAPI && window.electronAPI.ipcRenderer) {
                  window.electronAPI.ipcRenderer.send('preview:open-with-code', {
                    code: data.code || '',
                    language: data.language || 'html'
                  });
                } else {
                  console.error('[客户端集成] electronAPI 不可用');
                }
              }
            } catch (error) {
              console.error('[客户端集成] 处理代码复制事件失败:', error);
            }
          };

          // 标记已设置监听器
          window.__CODE_COPY_LISTENER_SETUP__ = true;
          console.log('[客户端集成] 代码复制监听器已设置');
        } catch (error) {
          console.error('[客户端集成] 设置代码复制监听器失败:', error);
        }
      })();
    `

    // 延迟执行，确保页面已加载
    setTimeout(() => {
      if (!this.window || this.window.isDestroyed()) return
      this.window.webContents.executeJavaScript(codeCopyListenerScript).catch(err => {
        log.error('[主窗口] 执行代码复制监听脚本失败:', err)
      })
    }, 500)
  }

  /**
   * 注入拖拽样式
   * 为主窗口注入CSS样式以实现拖拽放大效果
   */
  private injectDragStyles(): void {
    if (!this.window || this.window.isDestroyed()) return

    const dragStyles = `
      .ai-page-draggable {
        -webkit-app-region: drag;
      }
      .ai-page-draggable * {
        -webkit-app-region: no-drag;
      }
      .ai-bar-draggable .logo-draggable {
        -webkit-app-region: drag;
      }
      .ai-bar-draggable .logo-draggable button {
        -webkit-app-region: no-drag;
      }
      .electron-window-controls {
        -webkit-app-region: no-drag;
        display: flex;
        align-items: center;
        gap: 4px;
        margin-left: 8px;
      }
      .electron-window-controls button {
        -webkit-app-region: no-drag;
        min-width: 32px;
        height: 32px;
        padding: 0;
        border: none;
        background: transparent;
        color: var(--color-text-2);
        cursor: pointer;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }
      .electron-window-controls button .arco-btn-icon {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .electron-window-controls button svg {
        width: 16px;
        height: 16px;
      }
      .electron-window-controls button.close-btn svg {
        width: 18px;
        height: 18px;
      }
      .electron-window-controls button:hover {
        background: var(--color-fill-2);
        color: var(--color-text-1);
      }
      .electron-window-controls button.close-btn:hover {
        background: var(--color-danger-light-1);
        color: var(--color-danger);
      }
    `

    // 使用 insertCSS 方法注入样式
    this.window.webContents.insertCSS(dragStyles).catch(err => {
      log.error('[主窗口] 注入拖拽样式失败:', err)
    })
  }

  /**
   * 注入窗口控制按钮
   * 在页面中动态创建最小化、最大化、关闭三个按钮
   */
  private injectWindowControls(): void {
    if (!this.window || this.window.isDestroyed()) return

    const injectScript = `
      (function() {
        try {
          // 检查是否已经注入过
          if (document.getElementById('electron-window-controls')) {
            return;
          }

          // 创建窗口控制按钮的函数
          function createWindowControls(container) {
            // 检查是否已经存在，避免重复创建
            if (container.querySelector('#electron-window-controls')) {
              return;
            }

            // 创建按钮容器
            const controlsContainer = document.createElement('div');
            controlsContainer.id = 'electron-window-controls';
            controlsContainer.className = 'electron-window-controls';

            // 最小化按钮
            const minimizeBtn = document.createElement('button');
            minimizeBtn.className = 'arco-btn arco-btn-text arco-btn-shape-round arco-btn-size-medium arco-btn-status-normal arco-btn-only-icon';
            minimizeBtn.setAttribute('type', 'button');
            minimizeBtn.setAttribute('title', '最小化');
            minimizeBtn.innerHTML = '<span class="arco-btn-icon"><svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" class="arco-icon" stroke-width="4" stroke-linecap="butt" stroke-linejoin="miter" width="16" height="16"><path d="M8 24h32"></path></svg></span>';
            minimizeBtn.onclick = () => {
              if (window.electronAPI && window.electronAPI.window) {
                window.electronAPI.window.minimize();
              }
            };

            // 最大化/还原按钮
            const maximizeBtn = document.createElement('button');
            maximizeBtn.className = 'arco-btn arco-btn-text arco-btn-shape-round arco-btn-size-medium arco-btn-status-normal arco-btn-only-icon';
            maximizeBtn.setAttribute('type', 'button');
            maximizeBtn.onclick = () => {
              if (window.electronAPI && window.electronAPI.window) {
                window.electronAPI.window.maximize();
              }
            };

            // 更新最大化按钮图标
            function updateMaximizeIcon(btn, isMaximized) {
              if (!btn) return;

              // 最大化图标：一个方框
              const maximizeIcon = '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" class="arco-icon" stroke-width="4" stroke-linecap="butt" stroke-linejoin="miter" width="16" height="16"><path d="M8 8h32v32H8z"></path></svg>';

              // 还原图标：复制图标
              const restoreIcon = '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" class="arco-icon" stroke-width="4" stroke-linecap="butt" stroke-linejoin="miter" width="16" height="16"><path d="M20 6h18a2 2 0 0 1 2 2v22M8 16v24c0 1.105.891 2 1.996 2h20.007A1.99 1.99 0 0 0 32 40.008V15.997A1.997 1.997 0 0 0 30 14H10a2 2 0 0 0-2 2Z"></path></svg>';

              if (isMaximized) {
                btn.setAttribute('title', '还原');
                btn.innerHTML = '<span class="arco-btn-icon">' + restoreIcon + '</span>';
              } else {
                btn.setAttribute('title', '最大化');
                btn.innerHTML = '<span class="arco-btn-icon">' + maximizeIcon + '</span>';
              }
            }

            // 初始化最大化按钮图标
            if (window.electronAPI && window.electronAPI.window && window.electronAPI.window.isMaximized) {
              window.electronAPI.window.isMaximized().then(result => {
                if (result && result.success !== false) {
                  updateMaximizeIcon(maximizeBtn, result.isMaximized);
                }
              }).catch(() => {
                // 如果获取失败，默认显示最大化图标
                updateMaximizeIcon(maximizeBtn, false);
              });
            } else {
              // 如果 API 不可用，默认显示最大化图标
              updateMaximizeIcon(maximizeBtn, false);
            }

            // 监听窗口最大化状态变化
            if (window.electronAPI && window.electronAPI.window && window.electronAPI.window.onMaximizedChanged) {
              window.electronAPI.window.onMaximizedChanged((isMaximized) => {
                updateMaximizeIcon(maximizeBtn, isMaximized);
              });
            }

            // 关闭按钮
            const closeBtn = document.createElement('button');
            closeBtn.className = 'arco-btn arco-btn-text arco-btn-shape-round arco-btn-size-medium arco-btn-status-normal arco-btn-only-icon close-btn';
            closeBtn.setAttribute('type', 'button');
            closeBtn.setAttribute('title', '关闭');
            closeBtn.innerHTML = '<span class="arco-btn-icon"><svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" class="arco-icon" stroke-width="5" stroke-linecap="round" stroke-linejoin="miter" width="18" height="18"><path d="M12 12l24 24M36 12l-24 24"></path></svg></span>';
            closeBtn.onclick = () => {
              if (window.electronAPI && window.electronAPI.window) {
                window.electronAPI.window.close();
              }
            };

            // 添加按钮到容器
            controlsContainer.appendChild(minimizeBtn);
            controlsContainer.appendChild(maximizeBtn);
            controlsContainer.appendChild(closeBtn);

            // 将容器添加到目标元素
            container.appendChild(controlsContainer);
          }

          // 尝试立即查找目标容器
          const targetSelector = '.ai-page-draggable > .arco-space-item:last-child > .arco-col > .arco-space';

          // 防抖函数，限制调用频率
          let injectTimer = null;
          function tryInject() {
            // 清除之前的定时器
            if (injectTimer) {
              clearTimeout(injectTimer);
            }

            // 延迟执行，合并多次调用
            injectTimer = setTimeout(() => {
              const targetElement = document.querySelector(targetSelector);
              const existingControls = document.getElementById('electron-window-controls');

              // 如果目标元素存在，但按钮不存在，则创建
              if (targetElement && !existingControls) {
                createWindowControls(targetElement);
                return;
              }

              // 如果按钮存在但不在目标元素中，可能是路由切换导致，需要重新注入
              if (targetElement && existingControls) {
                const isInTarget = targetElement.contains(existingControls);
                if (!isInTarget) {
                  // 移除旧的按钮
                  existingControls.remove();
                  // 重新创建
                  createWindowControls(targetElement);
                }
              }
            }, 100); // 100ms 防抖延迟
          }

          // 立即尝试一次（不使用防抖）
          (function immediateInject() {
            const targetElement = document.querySelector(targetSelector);
            const existingControls = document.getElementById('electron-window-controls');

            if (targetElement && !existingControls) {
              createWindowControls(targetElement);
            }
          })();

          // 启动观察函数
          function startObserver() {
            // 如果 body 不存在，等待它加载
            if (!document.body) {
              if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', startObserver);
              } else {
                // 如果已经加载完成但 body 还不存在，延迟重试
                setTimeout(startObserver, 100);
              }
              return;
            }

            // 使用 MutationObserver 监听 DOM 变化
            // 优化：只监听目标元素附近的变化，而不是整个 body
            const observer = new MutationObserver(function(mutations) {
              // 检查是否有相关的 DOM 变化
              let shouldCheck = false;

              for (const mutation of mutations) {
                // 只关注添加或移除节点的情况
                if (mutation.type === 'childList' && (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)) {
                  // 检查是否涉及目标选择器相关的元素
                  const target = document.querySelector(targetSelector);
                  if (target) {
                    // 检查变化是否在目标元素或其父元素中
                    for (const node of mutation.addedNodes) {
                      if (node.nodeType === 1 && (target.contains(node) || node.contains(target))) {
                        shouldCheck = true;
                        break;
                      }
                    }
                    for (const node of mutation.removedNodes) {
                      if (node.nodeType === 1 && (target.contains(node) || node.contains(target))) {
                        shouldCheck = true;
                        break;
                      }
                    }
                    // 如果目标元素本身被移除，也需要检查
                    if (!document.body.contains(target)) {
                      shouldCheck = true;
                    }
                  } else {
                    // 如果目标元素不存在，可能是路由切换，需要检查
                    shouldCheck = true;
                  }

                  if (shouldCheck) break;
                }
              }

              if (shouldCheck) {
                tryInject();
              }
            });

            // 开始观察整个文档的变化（但通过逻辑过滤减少不必要的调用）
            observer.observe(document.body, {
              childList: true,
              subtree: true
            });

            // 保存 observer 引用，以便后续可能需要清理
            window.__electronWindowControlsObserver = observer;
          }

          // 启动观察
          startObserver();

          // 同时监听各种可能的事件
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
              setTimeout(() => {
                tryInject();
              }, 1000);
            });
          }

          // 监听页面加载完成事件
          window.addEventListener('load', () => {
            setTimeout(() => {
              tryInject();
            }, 1000);
          });

          // 监听 Vue 应用可能触发的事件（Vue 3 使用 nextTick）
          if (window.Vue && window.Vue.nextTick) {
            window.Vue.nextTick(() => {
              setTimeout(() => {
                tryInject();
              }, 500);
            });
          }

          // 监听 Vue Router 的路由变化（如果存在）
          if (window.Vue && window.Vue.version) {
            // Vue 3
            const vueApp = document.querySelector('[data-v-app]') || document.body;
            if (vueApp && vueApp.__vue_app__) {
              const router = vueApp.__vue_app__.config.globalProperties.$router;
              if (router) {
                router.afterEach(() => {
                  setTimeout(() => {
                    tryInject();
                  }, 300);
                });
              }
            }
          }

          // 监听 popstate 事件（浏览器前进/后退）
          window.addEventListener('popstate', () => {
            setTimeout(() => {
              tryInject();
            }, 300);
          });

          // 定期检查按钮是否存在（作为备用机制，降低频率）
          // 使用更长的间隔，减少性能影响
          let checkInterval = setInterval(() => {
            const existingControls = document.getElementById('electron-window-controls');
            const targetElement = document.querySelector(targetSelector);

            // 只在按钮不存在或位置不对时才检查
            if (targetElement && (!existingControls || !targetElement.contains(existingControls))) {
              tryInject();
            }
          }, 5000); // 增加到 5 秒，减少检查频率

          // 保存 interval 引用，以便后续可能需要清理
          window.__electronWindowControlsInterval = checkInterval;

        } catch (error) {
          log.error('[窗口控制] 注入失败:', error);
        }
      })();
    `

    // 延迟执行，确保页面已加载
    setTimeout(() => {
      if (!this.window || this.window.isDestroyed()) return
      this.window.webContents.executeJavaScript(injectScript).catch(err => {
        log.error('[主窗口] 执行窗口控制注入脚本失败:', err)
      })
    }, 300)
  }
}

// 导出单例
export const mainWindowManager = new MainWindowManager()
