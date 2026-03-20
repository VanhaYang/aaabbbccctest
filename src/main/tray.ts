import { Tray, Menu, nativeImage, app, dialog, shell } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import { screenshotManager } from './screenshot'
import { mainWindowManager } from './mainWindow'
import { settingsWindowManager } from './settingsWindow'
import { fileExplorerWindowManager } from './fileExplorerWindow'
import { terminalWindowManager } from './terminalWindow'
import { updateManager } from './updateManager'
import log, { getLogPath } from './logger'
import { getIconPath } from './utils'

/**
 * 系统托盘管理模块
 * 职责：管理系统托盘图标和菜单，提供快捷操作入口
 */
export class TrayManager {
  private tray: Tray | null = null

  /**
   * 创建系统托盘
   */
  createTray(): void {
    try {
      const sizes = [16, 32, 96, 512]
      let icon = nativeImage.createFromPath(getIconPath(96))
      let usedPath = getIconPath(96)
      for (const size of sizes) {
        const p = getIconPath(size)
        if (!fs.existsSync(p)) continue
        const img = nativeImage.createFromPath(p)
        if (!img.isEmpty()) {
          icon = img
          usedPath = p
          break
        }
      }
      log.info('托盘图标路径:', usedPath)

      if (icon.isEmpty()) {
        log.warn('托盘图标加载失败，使用占位图')
        // Windows 下空图会导致托盘不显示，用最小占位图
        icon = nativeImage.createFromDataURL(
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHklEQVQ4T2NkYGD4z0ABYBw1gGE0DBiGQxgMhQEAQVYAAQ0bNpgAAAAASUVORK5CYII='
        )
      }

      this.tray = new Tray(icon)

      // 设置托盘提示文本
      this.tray.setToolTip('截图工具')

      // 创建右键菜单
      this.createContextMenu()

      // 左键点击托盘图标时切换主窗口显示状态
      this.tray.on('click', () => {
        this.toggleMainWindow()
      })

      log.info('系统托盘创建成功')
    } catch (error) {
      log.error('创建系统托盘失败:', error)
    }
  }

  /**
   * 切换主窗口显示状态
   */
  private toggleMainWindow(): void {
    const mainWindow = mainWindowManager.getWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isVisible()) {
        mainWindowManager.hide()
      } else {
        mainWindowManager.show()
      }
    } else {
      mainWindowManager.createWindow()
    }
  }

  /**
   * 创建右键菜单
   */
  private createContextMenu(): void {
    if (!this.tray) return

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '截图',
        click: () => {
          log.info('托盘菜单：开始截图')
          screenshotManager.startCapture().catch(error => {
            log.error('托盘触发截图失败:', error)
          })
        }
      },
      {
        type: 'separator'
      },
      {
        label: '显示主窗口',
        click: () => {
          mainWindowManager.show()
        }
      },
      {
        label: '设置',
        click: () => {
          settingsWindowManager.show()
        }
      },
      {
        label: '打开工作区',
        click: () => {
          fileExplorerWindowManager.show()
        }
      },
      {
        label: '智能终端',
        click: () => {
          terminalWindowManager.show()
        }
      },
      {
        type: 'separator'
      },
      {
        label: '检查更新',
        click: () => {
          this.handleCheckUpdate()
        }
      },
      {
        label: '查看日志',
        click: () => {
          this.openLogFile()
        }
      },
      {
        type: 'separator'
      },
      {
        label: '退出',
        click: () => {
          log.info('托盘菜单：退出应用')
          mainWindowManager.setQuitting(true)
          app.quit()
        }
      }
    ])

    this.tray.setContextMenu(contextMenu)
  }

  /**
   * 处理检查更新
   */
  private async handleCheckUpdate(): Promise<void> {
    const mainWindow = mainWindowManager.getWindow()

    try {
      // 调用更新管理器检查更新（手动检查）
      const result = await updateManager.checkForUpdates(true)

      if (result.error && mainWindow) {
        // 检查失败
        dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: '检查更新失败',
          message: result.error,
          buttons: ['确定']
        })
      } else if (result.available && result.info) {
        // 开发环境：显示更新信息用于排查问题
        if (!app.isPackaged && mainWindow) {
          const info = result.info
          const detail = [
            `当前版本: ${app.getVersion()}`,
            info.version ? `服务器版本: ${info.version}` : '',
            info.releaseName ? `安装包: ${info.releaseName}` : '',
            info.releaseDate ? `发布日期: ${info.releaseDate.toLocaleString('zh-CN')}` : '',
            '',
            '⚠️ 开发环境仅用于查看更新信息，无法实际更新'
          ]
            .filter(Boolean)
            .join('\n')

          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: '更新信息（开发环境）',
            message: info.version ? `服务器最新版本: ${info.version}` : '已获取更新信息',
            detail: detail,
            buttons: ['确定']
          })
        }
        // 生产环境：结果会通过 updateManager 的事件处理显示对话框
        // 如果发现更新，会显示询问对话框；如果没有更新，会显示"已是最新版本"提示
      } else if (!app.isPackaged && mainWindow) {
        // 开发环境：没有获取到更新信息
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: '检查更新',
          message: '未获取到更新信息',
          detail: '请检查更新服务器地址是否正确',
          buttons: ['确定']
        })
      }
    } catch (error) {
      if (mainWindow) {
        dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: '检查更新失败',
          message: error instanceof Error ? error.message : '未知错误',
          buttons: ['确定']
        })
      }
    }
  }

  /**
   * 打开日志文件
   */
  private openLogFile(): void {
    try {
      const logPath = getLogPath()
      const logDir = join(logPath, '..')

      // 在文件管理器中打开日志目录
      shell.openPath(logDir).then((error: string) => {
        if (error) {
          log.error('打开日志目录失败:', error)
          const mainWindow = mainWindowManager.getWindow()
          if (mainWindow) {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '日志文件位置',
              message: '日志文件路径',
              detail: `日志文件: ${logPath}\n\n日志目录: ${logDir}\n\n如果无法自动打开，请手动访问上述路径。`,
              buttons: ['确定']
            })
          }
        } else {
          log.info('已打开日志目录:', logDir)
        }
      })
    } catch (error) {
      log.error('获取日志路径失败:', error)
      const mainWindow = mainWindowManager.getWindow()
      if (mainWindow) {
        dialog.showErrorBox(
          '错误',
          `无法打开日志文件: ${error instanceof Error ? error.message : '未知错误'}`
        )
      }
    }
  }

  /**
   * 更新托盘菜单（如果需要动态更新）
   */
  updateMenu(): void {
    this.createContextMenu()
  }

  /**
   * 销毁托盘
   */
  destroy(): void {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
      log.info('系统托盘已销毁')
    }
  }

  /**
   * 获取托盘实例
   */
  getTray(): Tray | null {
    return this.tray
  }
}

// 导出单例
export const trayManager = new TrayManager()
