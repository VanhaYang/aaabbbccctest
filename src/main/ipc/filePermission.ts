import log from '../logger'
import { ipcMain } from 'electron'
import { filePermissionManager } from '../filePermission'

export const registerFilePermissionIpcHandlers = (): void => {
  // 检查路径是否在工作区内
  ipcMain.handle('file-permission:is-in-workspace', async (_event, filePath: string) => {
    try {
      const isInWorkspace = filePermissionManager.isPathInWorkspace(filePath)
      return { success: true, isInWorkspace }
    } catch (error) {
      log.error('检查路径权限失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '检查失败'
      }
    }
  })

  // 检查文件读权限
  ipcMain.handle('file-permission:has-read', async (_event, filePath: string) => {
    try {
      const hasRead = filePermissionManager.hasReadPermission(filePath)
      return { success: true, hasRead }
    } catch (error) {
      log.error('检查读权限失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '检查失败'
      }
    }
  })

  // 检查文件写权限
  ipcMain.handle('file-permission:has-write', async (_event, filePath: string) => {
    try {
      const hasWrite = filePermissionManager.hasWritePermission(filePath)
      return { success: true, hasWrite }
    } catch (error) {
      log.error('检查写权限失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '检查失败'
      }
    }
  })

  // 检查目录读权限
  ipcMain.handle('file-permission:has-directory-read', async (_event, dirPath: string) => {
    try {
      const hasRead = filePermissionManager.hasDirectoryReadPermission(dirPath)
      return { success: true, hasRead }
    } catch (error) {
      log.error('检查目录读权限失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '检查失败'
      }
    }
  })

  // 获取工作区路径
  ipcMain.handle('file-permission:get-workspace-path', async () => {
    try {
      const workspacePath = filePermissionManager.getWorkspacePath()
      return { success: true, path: workspacePath || '' }
    } catch (error) {
      log.error('获取工作区路径失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取失败'
      }
    }
  })
}
