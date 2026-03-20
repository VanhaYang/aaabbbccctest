import * as fs from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { BrowserWindow } from 'electron'

/** 应用图标统一目录：resources/app/icons/ */
const APP_ICONS_DIR = 'app/icons'
/** 旧结构兼容：resources/icons/ */
const LEGACY_ICONS_DIR = 'icons'

/**
 * 获取应用图标路径（优先 resources/app/icons/，不存在则回退到 resources/icons/）
 * @param size 尺寸，默认 96
 */
export function getIconPath(size: number = 96): string {
  const isDev = process.env.NODE_ENV === 'development'
  const resourcesRoot = isDev ? join(app.getAppPath(), 'resources') : process.resourcesPath
  const newPath = join(resourcesRoot, APP_ICONS_DIR, `icon-${size}x${size}.png`)
  const legacyPath = join(resourcesRoot, LEGACY_ICONS_DIR, `icon-${size}x${size}.png`)
  if (fs.existsSync(newPath)) return newPath
  if (fs.existsSync(legacyPath)) return legacyPath
  return newPath
}

/**
 * 是否打开 DevTools（默认关闭，可通过环境变量开启）
 */
export function shouldOpenDevTools(): boolean {
  if (process.env['OPEN_DEVTOOLS'] === '0') {
    return false
  }
  return process.env.NODE_ENV === 'development'
}

/**
 * 加载渲染进程页面（开发/生产统一入口）
 */
export function loadRendererPage(window: BrowserWindow, page: string): Promise<void> {
  if (process.env['ELECTRON_RENDERER_URL']) {
    return window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/${page}`)
  }
  return window.loadFile(join(__dirname, `../renderer/${page}`))
}

/**
 * 转义注入到脚本中的字符串
 */
export function escapeScriptString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/`/g, '\\`')
}

