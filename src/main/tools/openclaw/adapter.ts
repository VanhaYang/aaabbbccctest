/**
 * 桌面能力桥接（DesktopBridge）
 * 供 OpenClaw 迁入的工具（如 apply_patch）使用，仅依赖本接口访问工作区与执行能力，
 * 不直接依赖 Electron / configManager / 具体 handler。
 */
import * as fs from 'fs/promises'
import * as path from 'path'
import { configManager } from '../../configManager'
import { isPathInside } from '../../pathGuards'
import { executeTerminalCommand } from '../../services/terminalExecutionService'
import { mouseController } from '../../mouseController'
import { screenshotManager } from '../../screenshot'

export interface DesktopBridge {
  getWorkspaceRoot(): string
  runCommand(
    command: string,
    options?: { cwd?: string; timeoutMs?: number }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>
  readFile(relativeOrAbsolutePath: string): Promise<string>
  writeFile(relativeOrAbsolutePath: string, content: string): Promise<void>
  remove(relativeOrAbsolutePath: string): Promise<void>
  mkdirp(dirPath: string): Promise<void>
  screenshot?(displayId?: number): Promise<Buffer>
  mouseMove?(x: number, y: number): void
  mouseClick?(button: 'left' | 'right', x?: number, y?: number): void
}

function resolveInWorkspace(workspaceRoot: string, p: string): string {
  const resolved = path.isAbsolute(p)
    ? path.resolve(p)
    : path.resolve(workspaceRoot, p.replace(/^[/\\]+/, ''))
  if (!isPathInside(workspaceRoot, resolved)) {
    throw new Error('路径不在工作区内')
  }
  return resolved
}

/**
 * 创建基于 electron-screenshot 现有能力的 DesktopBridge 实现
 */
export function createDesktopBridge(): DesktopBridge {
  const workspaceRoot = (): string => {
    const root = configManager.getWorkspacePath()
    if (!root) throw new Error('未配置工作区路径')
    return path.resolve(root)
  }

  return {
    getWorkspaceRoot(): string {
      return workspaceRoot()
    },

    async runCommand(
      command: string,
      options?: { cwd?: string; timeoutMs?: number }
    ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
      const result = await executeTerminalCommand(command.trim(), undefined, {
        cwd: options?.cwd,
        timeout: options?.timeoutMs
      })
      if (!result.success || !result.result) {
        throw new Error(result.error || '命令执行失败')
      }
      return {
        stdout: result.result.stdout,
        stderr: result.result.stderr,
        exitCode: result.result.exitCode
      }
    },

    async readFile(relativeOrAbsolutePath: string): Promise<string> {
      const root = workspaceRoot()
      const filePath = resolveInWorkspace(root, relativeOrAbsolutePath)
      return fs.readFile(filePath, 'utf-8')
    },

    async writeFile(
      relativeOrAbsolutePath: string,
      content: string
    ): Promise<void> {
      const root = workspaceRoot()
      const filePath = resolveInWorkspace(root, relativeOrAbsolutePath)
      const dir = path.dirname(filePath)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(filePath, content, 'utf-8')
    },

    async remove(relativeOrAbsolutePath: string): Promise<void> {
      const root = workspaceRoot()
      const filePath = resolveInWorkspace(root, relativeOrAbsolutePath)
      await fs.rm(filePath)
    },

    async mkdirp(dirPath: string): Promise<void> {
      const root = workspaceRoot()
      const resolved = resolveInWorkspace(root, dirPath)
      await fs.mkdir(resolved, { recursive: true })
    },

    async screenshot(displayId?: number): Promise<Buffer> {
      return screenshotManager.captureScreen(displayId)
    },

    mouseMove(x: number, y: number): void {
      mouseController.moveMouse(x, y, false)
    },

    mouseClick(
      button: 'left' | 'right',
      x?: number,
      y?: number
    ): void {
      mouseController.clickMouse(x, y, { button, double: false })
    }
  }
}
