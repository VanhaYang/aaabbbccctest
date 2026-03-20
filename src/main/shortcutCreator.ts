import { app } from 'electron'
import { exec, execSync } from 'child_process'
import { join } from 'path'
import { existsSync, writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * 桌面快捷方式创建器
 * 用于在应用启动时自动创建桌面快捷方式（Squirrel.Windows 不会自动创建）
 *
 * 参照 VS Code 思路：安装时由安装程序创建快捷方式最优；运行时若需创建则延后、异步执行，避免阻塞主进程导致卡顿。
 * 注意：使用 VBScript 而非 PowerShell，降低安全软件拦截概率。
 */
export class ShortcutCreator {
  private static readonly SHORTCUT_NAME = 'Electron Screenshot.lnk'

  /** 本次进程是否已执行过快捷方式创建（避免重复执行、减轻自启后卡顿） */
  private static shortcutCreationScheduled = false

  /**
   * 创建或更新桌面快捷方式（异步，不阻塞主进程）
   * 只在生产环境且 Windows 平台执行；若快捷方式已存在且指向正确则跳过。
   *
   * 在 Squirrel.Windows 安装中，app.getPath('exe') 返回顶层 shim，始终启动最新版本。
   */
  static async createDesktopShortcut(): Promise<void> {
    if (!app.isPackaged || process.platform !== 'win32') {
      return
    }
    if (this.shortcutCreationScheduled) {
      return
    }
    this.shortcutCreationScheduled = true

    try {
      const desktopPath = app.getPath('desktop')
      const shortcutPath = join(desktopPath, this.SHORTCUT_NAME)
      const topLevelExePath = app.getPath('exe')

      if (existsSync(shortcutPath)) {
        const target = await this.getShortcutTargetAsync(shortcutPath)
        if (target && target.toLowerCase() === topLevelExePath.toLowerCase()) {
          return
        }
      }

      const exePath = topLevelExePath
      const appName = app.getName()
      const workingDir = app.getAppPath()
      const iconPath = exePath

      await this.createShortcutWithVBScriptAsync(
        shortcutPath,
        exePath,
        workingDir,
        iconPath,
        appName
      )
    } catch {
      // 静默失败，不打扰用户
    }
  }

  /**
   * 使用 VBScript 异步创建快捷方式，不阻塞主进程
   */
  private static createShortcutWithVBScriptAsync(
    shortcutPath: string,
    exePath: string,
    workingDir: string,
    iconPath: string,
    appName: string
  ): Promise<void> {
    const escapePath = (path: string): string =>
      path.replace(/\\/g, '\\\\').replace(/'/g, "''")

    const vbsScript = `
Set oWS = WScript.CreateObject("WScript.Shell")
sLinkFile = "${escapePath(shortcutPath)}"
Set oLink = oWS.CreateShortcut(sLinkFile)
oLink.TargetPath = "${escapePath(exePath)}"
oLink.WorkingDirectory = "${escapePath(workingDir)}"
oLink.IconLocation = "${escapePath(iconPath)},0"
oLink.Description = "${appName.replace(/'/g, "''")}"
oLink.Save
`.trim()

    const tempVbsFile = join(tmpdir(), `create_shortcut_${Date.now()}.vbs`)

    const run = async (): Promise<void> => {
      try {
        writeFileSync(tempVbsFile, vbsScript, 'utf8')
        await execAsync(`cscript.exe //NoLogo //B "${tempVbsFile}"`, {
          windowsHide: true
        })
      } finally {
        try {
          if (existsSync(tempVbsFile)) unlinkSync(tempVbsFile)
        } catch {}
      }
    }

    return run()
  }

  /**
   * 异步获取快捷方式目标路径，避免 execSync 阻塞主进程（自启卡顿主因之一）
   */
  private static getShortcutTargetAsync(shortcutPath: string): Promise<string | null> {
    const escapePath = (path: string): string =>
      path.replace(/\\/g, '\\\\').replace(/'/g, "''")

    const vbsScript = `
Set oWS = WScript.CreateObject("WScript.Shell")
Set oLink = oWS.CreateShortcut("${escapePath(shortcutPath)}")
WScript.Echo oLink.TargetPath
`.trim()

    const tempVbsFile = join(tmpdir(), `read_shortcut_${Date.now()}.vbs`)

    return (async () => {
      try {
        writeFileSync(tempVbsFile, vbsScript, 'utf8')
        const { stdout } = await execAsync(`cscript.exe //NoLogo //B "${tempVbsFile}"`, {
          encoding: 'utf8',
          windowsHide: true
        })
        return (stdout && stdout.trim()) || null
      } catch {
        return null
      } finally {
        try {
          if (existsSync(tempVbsFile)) unlinkSync(tempVbsFile)
        } catch {}
      }
    })()
  }

  /**
   * 同步获取快捷方式目标路径（仅用于设置页等低频调用）
   */
  private static getShortcutTarget(shortcutPath: string): string | null {
    try {
      const escapePath = (path: string): string =>
        path.replace(/\\/g, '\\\\').replace(/'/g, "''")
      const vbsScript = `
Set oWS = WScript.CreateObject("WScript.Shell")
Set oLink = oWS.CreateShortcut("${escapePath(shortcutPath)}")
WScript.Echo oLink.TargetPath
`.trim()
      const tempVbsFile = join(tmpdir(), `read_shortcut_${Date.now()}.vbs`)
      writeFileSync(tempVbsFile, vbsScript, 'utf8')
      try {
        const result = execSync(`cscript.exe //NoLogo //B "${tempVbsFile}"`, {
          encoding: 'utf8',
          windowsHide: true
        })
        return result.trim() || null
      } finally {
        try {
          if (existsSync(tempVbsFile)) unlinkSync(tempVbsFile)
        } catch {}
      }
    } catch {
      return null
    }
  }

  /**
   * 检查桌面快捷方式是否存在且指向顶层 shim
   * 顶层 shim 总是启动最新版本，所以检查是否指向它即可
   */
  static hasDesktopShortcut(): boolean {
    if (process.platform !== 'win32' || !app.isPackaged) {
      return false
    }

    try {
      const desktopPath = app.getPath('desktop')
      const shortcutPath = join(desktopPath, this.SHORTCUT_NAME)

      if (!existsSync(shortcutPath)) {
        return false
      }

      // 检查是否指向顶层 shim（总是启动最新版本）
      const topLevelExePath = app.getPath('exe')
      const shortcutTarget = this.getShortcutTarget(shortcutPath)

      return (
        shortcutTarget !== null && shortcutTarget.toLowerCase() === topLevelExePath.toLowerCase()
      )
    } catch (error) {
      return false
    }
  }
}
