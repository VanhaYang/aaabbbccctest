import { app, dialog } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateInfo as UpdaterUpdateInfo } from 'electron-updater'
import log from './logger'
import { mainWindowManager } from './mainWindow'
import * as https from 'https'
import * as http from 'http'

const { autoUpdater } = electronUpdater

/**
 * 更新信息接口（对外暴露，与 electron-updater 的 UpdateInfo 映射）
 */
export interface UpdateInfo {
  version?: string
  releaseNotes?: string
  releaseName?: string
  releaseDate?: Date
  updateURL?: string
}

/**
 * 将 electron-updater 的 UpdateInfo 转为内部使用的 UpdateInfo
 */
function mapUpdaterInfo(info: UpdaterUpdateInfo): UpdateInfo {
  const releaseDate = info.releaseDate
    ? typeof info.releaseDate === 'string'
      ? new Date(info.releaseDate)
      : (info.releaseDate as Date)
    : undefined
  const releaseNotes =
    typeof info.releaseNotes === 'string'
      ? info.releaseNotes
      : Array.isArray(info.releaseNotes)
        ? (info.releaseNotes as Array<{ version?: string; note?: string }>)
            ?.map(n => n.note ?? n.version ?? '')
            .join('\n')
        : undefined
  const pathOrUrl = (info as { path?: string; files?: Array<{ url?: string }> }).path
    ?? info.files?.[0]?.url
  return {
    version: info.version,
    releaseNotes,
    releaseName: info.releaseName ?? info.version,
    releaseDate,
    updateURL: pathOrUrl
  }
}

/**
 * 更新管理器
 * 使用 electron-updater，支持 NSIS 安装包下的自动更新（有安装引导 + 应用内自动更新）
 */
export class UpdateManager {
  private updateCheckInterval: NodeJS.Timeout | null = null
  private updateCheckIntervalMs = 24 * 60 * 60 * 1000 // 24小时检查一次
  private isChecking = false
  private updateInfo: UpdateInfo | null = null
  private feedURL: string | null = null
  private isManualCheck = false
  private hasDownloadedUpdate = false

  constructor() {
    this.configureUpdater()
    this.setupEventHandlers()
  }

  private configureUpdater(): void {
    if (!app.isPackaged) {
      return
    }

    const updateServerUrl =
      process.env.UPDATE_SERVER_URL || 'https://test-aizs.sailvan.com/release/'
    this.feedURL = updateServerUrl.endsWith('/') ? updateServerUrl : `${updateServerUrl}/`

    // electron-updater 使用 electron-builder 的 publish 配置，无需 setFeedURL
    autoUpdater.autoDownload = false // 先询问用户再下载（手动检查时）
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.logger = log

    setTimeout(() => {
      this.checkForUpdates(false).catch(error => {
        log.error('[更新管理器] 启动时检查更新失败:', error)
      })
    }, 3000)
  }

  private setupEventHandlers(): void {
    if (!app.isPackaged) {
      return
    }

    autoUpdater.on('checking-for-update', () => {
      this.isChecking = true
      this.notifyRenderer('checking')
    })

    autoUpdater.on('update-available', (info: UpdaterUpdateInfo) => {
      this.isChecking = false
      this.notifyRenderer('update-available')
      const ourInfo = mapUpdaterInfo(info)
      const wasManualCheck = this.isManualCheck
      if (wasManualCheck) {
        this.askUserToDownload(ourInfo).then(yes => {
          if (yes) {
            this.notifyRenderer('download-started')
            this.showDownloadingDialog()
            autoUpdater.downloadUpdate().catch(err => {
              log.error('[更新管理器] 下载更新失败:', err)
              this.notifyRenderer('error', { message: (err as Error).message })
              if (wasManualCheck) {
                this.showErrorDialog(`下载失败: ${(err as Error).message}`)
              }
            })
          }
          this.isManualCheck = false
        })
      } else {
        this.showUpdateAvailableNotification()
        autoUpdater.downloadUpdate().catch(err => {
          log.error('[更新管理器] 后台下载更新失败:', err)
        })
        this.isManualCheck = false
      }
    })

    autoUpdater.on('update-not-available', () => {
      this.isChecking = false
      this.notifyRenderer('update-not-available')
      if (this.isManualCheck) {
        if (this.hasDownloadedUpdate && this.updateInfo) {
          this.showUpdateDownloadedDialog()
        } else {
          this.showNoUpdateDialog()
        }
      }
      this.isManualCheck = false
    })

    autoUpdater.on('error', (error: Error) => {
      const isNotFoundError =
        error.message.includes('404') ||
        error.message.includes('Not Found') ||
        error.message.includes('not found') ||
        error.message.includes('ENOTFOUND') ||
        error.message.includes('ECONNREFUSED')

      if (isNotFoundError) {
        log.info('[更新管理器] 未找到更新:', error.message)
        this.isChecking = false
        if (this.isManualCheck) {
          this.showNoUpdateDialog()
        }
        this.isManualCheck = false
        return
      }

      log.error('[更新管理器] 更新失败:', error)
      this.isChecking = false
      this.notifyRenderer('error', { message: error.message })
      if (this.isManualCheck) {
        this.showErrorDialog(`检查更新失败: ${error.message}`)
      }
      this.isManualCheck = false
    })

    autoUpdater.on('update-downloaded', (info: UpdaterUpdateInfo) => {
      this.updateInfo = mapUpdaterInfo(info)
      this.hasDownloadedUpdate = true
      this.notifyRenderer('update-downloaded', this.updateInfo)
      this.showUpdateDownloadedDialog()
    })

    autoUpdater.on('before-quit-for-update', () => {
      mainWindowManager.setQuitting(true)
    })
  }

  async fetchUpdateInfo(): Promise<{ available: boolean; info?: UpdateInfo; error?: string }> {
    const updateServerUrl =
      process.env.UPDATE_SERVER_URL || 'https://test-aizs.sailvan.com/release/'
    const latestYmlUrl = updateServerUrl.endsWith('/')
      ? `${updateServerUrl}latest.yml`
      : `${updateServerUrl}/latest.yml`

    return new Promise(resolve => {
      const url = new URL(latestYmlUrl)
      const client = url.protocol === 'https:' ? https : http

      const req = client.get(url, res => {
        if (res.statusCode !== 200) {
          resolve({
            available: false,
            error: `HTTP ${res.statusCode}: ${res.statusMessage}`
          })
          return
        }

        let data = ''
        res.on('data', chunk => {
          data += chunk.toString()
        })

        res.on('end', () => {
          try {
            const lines = data.split('\n')
            const info: UpdateInfo = {}
            const currentVersion = app.getVersion()

            for (const line of lines) {
              const trimmed = line.trim()
              if (trimmed.startsWith('version:')) {
                info.version = trimmed.split(':')[1]?.trim()
              } else if (trimmed.startsWith('releaseDate:')) {
                const dateStr = trimmed
                  .split(':')
                  .slice(1)
                  .join(':')
                  .trim()
                  .replace(/^['"]|['"]$/g, '')
                info.releaseDate = new Date(dateStr)
              } else if (trimmed.startsWith('path:')) {
                info.releaseName = trimmed.split(':')[1]?.trim()
              }
            }

            const hasUpdate = !!(
              info.version && this.compareVersions(info.version, currentVersion) > 0
            )
            resolve({
              available: hasUpdate,
              info: hasUpdate ? info : undefined
            })
          } catch (error) {
            resolve({
              available: false,
              error: `解析失败: ${error instanceof Error ? error.message : '未知'}`
            })
          }
        })
      })

      req.on('error', error => {
        const isNotFound =
          error.message.includes('404') ||
          error.message.includes('Not Found') ||
          error.message.includes('ENOTFOUND') ||
          error.message.includes('ECONNREFUSED')
        resolve({
          available: false,
          error: isNotFound ? undefined : `网络错误: ${error.message}`
        })
      })

      req.setTimeout(10000, () => {
        req.destroy()
        resolve({ available: false, error: '请求超时' })
      })
    })
  }

  private compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number)
    const v2Parts = version2.split('.').map(Number)
    const maxLength = Math.max(v1Parts.length, v2Parts.length)
    for (let i = 0; i < maxLength; i++) {
      const v1Part = v1Parts[i] ?? 0
      const v2Part = v2Parts[i] ?? 0
      if (v1Part > v2Part) return 1
      if (v1Part < v2Part) return -1
    }
    return 0
  }

  async fetchUpdateInfoDev(): Promise<{ available: boolean; info?: UpdateInfo; error?: string }> {
    return this.fetchUpdateInfo()
  }

  async checkForUpdates(
    isManual: boolean = true
  ): Promise<{ available: boolean; info?: UpdateInfo; error?: string }> {
    if (!app.isPackaged) {
      return this.fetchUpdateInfoDev()
    }

    if (this.isChecking) {
      return {
        available: false,
        error: '正在检查更新中，请稍候...'
      }
    }

    if (this.feedURL == null) {
      return {
        available: false,
        error: '更新服务器未配置'
      }
    }

    if (isManual && this.hasDownloadedUpdate && this.updateInfo) {
      this.showUpdateDownloadedDialog()
      return { available: true, info: this.updateInfo }
    }

    this.isManualCheck = isManual

    let timeout: NodeJS.Timeout | null = null
    const clearTimer = () => {
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
    }

    timeout = setTimeout(() => {
      if (this.isChecking) {
        log.error('[更新管理器] 检查更新超时（30秒）')
        this.isChecking = false
        this.isManualCheck = false
        if (isManual) {
          this.showErrorDialog('检查更新超时，请检查网络或更新服务器地址')
        }
      }
    }, 30000)

    const done = () => {
      clearTimer()
    }

    autoUpdater.once('checking-for-update', done)
    autoUpdater.once('update-available', done)
    autoUpdater.once('update-not-available', done)
    autoUpdater.once('error', done)

    try {
      await autoUpdater.checkForUpdates()
      return { available: true }
    } catch (error) {
      const msg = error instanceof Error ? error.message : '未知错误'
      log.error('[更新管理器] 检查更新异常:', error)
      this.isManualCheck = false
      if (isManual) {
        this.showErrorDialog(`检查更新失败: ${msg}`)
      }
      return { available: false, error: msg }
    }
  }

  async downloadUpdate(): Promise<{ success: boolean; error?: string }> {
    if (!app.isPackaged) {
      return { success: false, error: '开发环境不支持更新下载' }
    }
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (error) {
      const msg = error instanceof Error ? error.message : '未知错误'
      log.error('[更新管理器] 下载更新失败:', error)
      return { success: false, error: msg }
    }
  }

  quitAndInstall(): void {
    if (!app.isPackaged) {
      return
    }
    this.hasDownloadedUpdate = false
    this.updateInfo = null
    mainWindowManager.setQuitting(true)
    // isSilent=true 静默安装不弹向导，isForceRunAfter=true 安装完成后自动启动应用
    autoUpdater.quitAndInstall(true, true)
  }

  startPeriodicCheck(): void {
    if (!app.isPackaged) return
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval)
    }
    this.updateCheckInterval = setInterval(() => {
      this.checkForUpdates(false).catch(err => {
        log.error('[更新管理器] 定时检查更新失败:', err)
      })
    }, this.updateCheckIntervalMs)
  }

  stopPeriodicCheck(): void {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval)
      this.updateCheckInterval = null
    }
  }

  private showUpdateAvailableNotification(): void {
    const win = mainWindowManager.getWindow()
    if (!win || win.isDestroyed()) return
    dialog
      .showMessageBox(win, {
        type: 'info',
        title: '发现新版本',
        message: '发现新版本',
        detail: '正在后台下载更新，下载完成后会通知您。',
        buttons: ['确定']
      })
      .catch(err => log.error('[更新管理器] 显示更新通知失败:', err))
  }

  private showDownloadingDialog(): void {
    const win = mainWindowManager.getWindow()
    if (!win || win.isDestroyed()) return
    dialog
      .showMessageBox(win, {
        type: 'info',
        title: '正在下载更新',
        message: '正在下载更新，请稍候…',
        detail: '下载完成后会提示您重启应用。',
        buttons: ['确定']
      })
      .catch(err => log.error('[更新管理器] 显示下载中提示失败:', err))
  }

  private async askUserToDownload(info: UpdateInfo): Promise<boolean> {
    const win = mainWindowManager.getWindow()
    if (!win || win.isDestroyed()) return false

    const response = await dialog.showMessageBox(win, {
      type: 'info',
      title: '发现新版本',
      message: '发现新版本可用',
      detail: `当前版本: ${app.getVersion()}\n新版本: ${info.version ?? info.releaseName ?? '未知'}\n\n是否立即下载并更新？\n\n下载完成后会提示您重启应用。`,
      buttons: ['立即下载', '稍后询问'],
      defaultId: 0,
      cancelId: 1
    })
    return response.response === 0
  }

  private showNoUpdateDialog(): void {
    const win = mainWindowManager.getWindow()
    if (!win || win.isDestroyed()) return
    dialog
      .showMessageBox(win, {
        type: 'info',
        title: '检查更新',
        message: '当前已是最新版本',
        detail: `当前版本: ${app.getVersion()}\n\n您使用的是最新版本，无需更新。`,
        buttons: ['确定']
      })
      .catch(err => log.error('[更新管理器] 显示无更新提示失败:', err))
  }

  private showErrorDialog(message: string): void {
    const win = mainWindowManager.getWindow()
    if (!win || win.isDestroyed()) {
      log.error('[更新管理器] 无法显示错误对话框:', message)
      return
    }
    dialog
      .showMessageBox(win, {
        type: 'error',
        title: '检查更新失败',
        message,
        detail: `更新服务器: ${this.feedURL ?? '未配置'}\n\n请检查网络或联系技术支持。`,
        buttons: ['确定']
      })
      .catch(err => log.error('[更新管理器] 显示错误对话框失败:', err))
  }

  private async showUpdateDownloadedDialog(): Promise<void> {
    const win = mainWindowManager.getWindow()
    if (!win || win.isDestroyed()) return

    const info = this.updateInfo
    const response = await dialog.showMessageBox(win, {
      type: 'info',
      title: '更新下载完成',
      message: info?.releaseName ? `版本 ${info.releaseName} 已下载完成` : '更新已下载完成',
      detail: '更新将在应用重启后安装。是否立即重启应用？',
      buttons: ['立即重启', '稍后重启'],
      defaultId: 0,
      cancelId: 1
    })

    if (response.response === 0) {
      this.quitAndInstall()
    }
  }

  private notifyRenderer(event: string, data?: unknown): void {
    const win = mainWindowManager.getWindow()
    if (!win || win.isDestroyed()) return
    try {
      win.webContents.send('update:status', { event, data })
    } catch (err) {
      log.error('[更新管理器] 通知渲染进程失败:', err)
    }
  }

  getUpdateInfo(): UpdateInfo | null {
    return this.updateInfo
  }

  getFeedURL(): string | null {
    return this.feedURL
  }

  destroy(): void {
    this.stopPeriodicCheck()
  }
}

export const updateManager = new UpdateManager()
