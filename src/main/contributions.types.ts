/**
 * 贡献点类型与 ID 常量（供测试与主入口使用，不依赖 Electron 运行时）
 */

export interface IContribution {
  id: string
  onAppReady?(): void | Promise<void>
  registerIpc?(): void
  onBeforeQuit?(): void | Promise<void>
}

/** 预期贡献 ID 列表（顺序即初始化顺序） */
export const CONTRIBUTION_IDS = [
  'mainWindow',
  'ipc',
  'floatingPanel',
  'shortcut',
  'tray',
  'apiServer',
  'update',
  'screenshotPreload',
  'cleanup'
] as const

export type ContributionId = (typeof CONTRIBUTION_IDS)[number]
