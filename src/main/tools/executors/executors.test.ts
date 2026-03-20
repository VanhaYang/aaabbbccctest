/**
 * 工具执行器测试：read、write、edit、exec、apply_patch、screenshot、mouse
 * 使用临时目录作为工作区；mock electron / terminal / screenshot / mouse
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { configManager } from '../../configManager'
import { read } from './read'
import { write } from './write'
import { edit } from './edit'
import { exec } from './exec'
import { screenshot } from './screenshot'
import { mouse_move, mouse_click } from './mouse'
import { apply_patch } from './apply-patch'

vi.mock('electron', () => ({
  app: {
    getPath: () => require('os').tmpdir(),
    getVersion: () => '1.0.0'
  }
}))

const executeTerminalCommandMock = vi.fn()
vi.mock('../../services/terminalExecutionService', () => ({
  executeTerminalCommand: (...args: unknown[]) =>
    executeTerminalCommandMock(...args)
}))

const captureScreenMock = vi.fn()
vi.mock('../../screenshot', () => ({
  screenshotManager: {
    captureScreen: (id?: number) => captureScreenMock(id)
  }
}))

const moveMouseMock = vi.fn()
const clickMouseMock = vi.fn()
vi.mock('../../mouseController', () => ({
  mouseController: {
    moveMouse: (x: number, y: number, smooth?: boolean) => moveMouseMock(x, y, smooth),
    clickMouse: (x?: number, y?: number, opts?: unknown) => clickMouseMock(x, y, opts),
    convertDisplayCoordsToGlobal: (_id: number, x: number, y: number) => ({ x, y })
  }
}))

describe('tools/executors', () => {
  let workspaceDir: string

  beforeEach(() => {
    workspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tools-executors-test-')
    )
    configManager.setWorkspacePath(workspaceDir)
  })

  afterEach(() => {
    try {
      if (fs.existsSync(workspaceDir)) {
        fs.rmSync(workspaceDir, { recursive: true })
      }
    } catch {
      // ignore
    }
  })

  describe('read', () => {
    it('缺少 path 返回 400', async () => {
      const result = await read({})
      expect(result.success).toBe(false)
      expect(result.code).toBe(400)
      expect(result.message).toContain('path')
    })

    it('未配置工作区返回 400', async () => {
      vi.spyOn(configManager, 'getWorkspacePath').mockReturnValueOnce(undefined as any)
      const result = await read({ path: 'a.txt' })
      expect(result.success).toBe(false)
      expect(result.code).toBe(400)
    })

    it('文件不存在或无权限返回失败', async () => {
      const result = await read({ path: 'nonexistent.txt' })
      expect(result.success).toBe(false)
      expect([403, 404]).toContain(result.code)
    })

    it('成功读取文本文件（带行范围）', async () => {
      const filePath = path.join(workspaceDir, 'hello.txt')
      fs.writeFileSync(filePath, 'hello world', 'utf-8')
      const result = await read({ path: 'hello.txt', startLine: 1, endLine: 1 })
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      const data = result.data as { content: string; fileName: string }
      expect(data.content).toBe('hello world')
      expect(data.fileName).toBe('hello.txt')
    })

    it('支持 startLine/endLine 读取片段', async () => {
      const filePath = path.join(workspaceDir, 'lines.txt')
      fs.writeFileSync(filePath, 'line1\nline2\nline3\n', 'utf-8')
      const result = await read({
        path: 'lines.txt',
        startLine: 2,
        endLine: 3
      })
      expect(result.success).toBe(true)
      const data = result.data as { content: string }
      expect(data.content).toBe('line2\nline3')
    })

    it('路径逃逸工作区返回 403', async () => {
      const result = await read({ path: '../../../etc/passwd' })
      expect(result.success).toBe(false)
      expect(result.code).toBe(403)
    })
  })

  describe('write', () => {
    it('缺少 path 或 content 返回 400', async () => {
      expect((await write({})).success).toBe(false)
      expect((await write({ path: 'a.txt' })).success).toBe(false)
      expect((await write({ content: 'x' })).success).toBe(false)
    })

    it('成功写入新文件', async () => {
      const result = await write({
        path: 'new.txt',
        content: 'new content',
        overwrite: false
      })
      expect(result.success).toBe(true)
      const fullPath = path.join(workspaceDir, 'new.txt')
      expect(fs.existsSync(fullPath)).toBe(true)
      expect(fs.readFileSync(fullPath, 'utf-8')).toBe('new content')
    })

    it('overwrite 为 false 时已存在文件返回 400', async () => {
      const filePath = path.join(workspaceDir, 'exist.txt')
      fs.writeFileSync(filePath, 'old', 'utf-8')
      const result = await write({
        path: 'exist.txt',
        content: 'new',
        overwrite: false
      })
      expect(result.success).toBe(false)
      expect(result.code).toBe(400)
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('old')
    })

    it('overwrite 为 true 时覆盖', async () => {
      const filePath = path.join(workspaceDir, 'overwrite.txt')
      fs.writeFileSync(filePath, 'old', 'utf-8')
      const result = await write({
        path: 'overwrite.txt',
        content: 'new',
        overwrite: true
      })
      expect(result.success).toBe(true)
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('new')
    })
  })

  describe('edit', () => {
    it('缺少 path 或 edits 返回 400', async () => {
      expect((await edit({})).success).toBe(false)
      expect((await edit({ path: 'a.txt' })).success).toBe(false)
    })

    it('成功应用 range 编辑', async () => {
      const filePath = path.join(workspaceDir, 'edit.txt')
      fs.writeFileSync(filePath, 'a\nb\nc\n', 'utf-8')
      const result = await edit({
        path: 'edit.txt',
        edits: [
          {
            type: 'range',
            startLine: 2,
            endLine: 2,
            newText: 'B'
          }
        ]
      })
      expect(result.success).toBe(true)
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('a\nB\nc\n')
    })

    it('成功应用 anchor 编辑', async () => {
      const filePath = path.join(workspaceDir, 'anchor.txt')
      fs.writeFileSync(filePath, 'hello world', 'utf-8')
      const result = await edit({
        path: 'anchor.txt',
        edits: [
          {
            type: 'anchor',
            oldText: 'world',
            newText: 'edit'
          }
        ]
      })
      expect(result.success).toBe(true)
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello edit')
    })
  })

  describe('exec', () => {
    it('缺少 command 返回 400', async () => {
      const result = await exec({})
      expect(result.success).toBe(false)
      expect(result.code).toBe(400)
    })

    it('执行成功返回 stdout/result', async () => {
      executeTerminalCommandMock.mockResolvedValueOnce({
        success: true,
        result: {
          exitCode: 0,
          stdout: 'ok',
          stderr: '',
          duration: 1,
          killed: false
        },
        cwd: workspaceDir,
        workspacePath: workspaceDir
      })
      const result = await exec({ command: 'echo ok' })
      expect(result.success).toBe(true)
      const data = result.data as { result: { stdout: string } }
      expect(data.result.stdout).toBe('ok')
    })

    it('执行失败返回 400 与 error', async () => {
      executeTerminalCommandMock.mockResolvedValueOnce({
        success: false,
        error: 'command failed'
      })
      const result = await exec({ command: 'false' })
      expect(result.success).toBe(false)
      expect(result.code).toBe(400)
      expect(result.message).toContain('failed')
    })
  })

  describe('apply_patch', () => {
    it('缺少 input 返回 400', async () => {
      const result = await apply_patch({})
      expect(result.success).toBe(false)
      expect(result.code).toBe(400)
    })

    it('无效 patch 格式返回 400', async () => {
      const result = await apply_patch({ input: 'not a patch' })
      expect(result.success).toBe(false)
      expect(result.code).toBe(400)
    })

    it('成功 Add File', async () => {
      const patch = [
        '*** Begin Patch',
        '*** Add File: patch-created.txt',
        '+first line',
        '+second line',
        '*** End Patch'
      ].join('\n')
      const result = await apply_patch({ input: patch })
      expect(result.success).toBe(true)
      const data = result.data as { summary: { added: string[] }; text: string }
      expect(data.summary.added).toContain('patch-created.txt')
      const fullPath = path.join(workspaceDir, 'patch-created.txt')
      expect(fs.existsSync(fullPath)).toBe(true)
      expect(fs.readFileSync(fullPath, 'utf-8')).toBe('first line\nsecond line\n')
    })

    it('成功 Update File（整段替换）', async () => {
      const filePath = path.join(workspaceDir, 'update-full.txt')
      fs.writeFileSync(filePath, 'old\nlines\n', 'utf-8')
      const patch = [
        '*** Begin Patch',
        '*** Update File: update-full.txt',
        '@@ ',
        '-old',
        '-lines',
        '+new',
        '+content',
        '*** End of File',
        '*** End Patch'
      ].join('\n')
      const result = await apply_patch({ input: patch })
      if (!result.success) {
        throw new Error(`apply_patch failed: ${result.message}`)
      }
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('new\ncontent\n')
    })

    it('成功 Delete File', async () => {
      const filePath = path.join(workspaceDir, 'to-delete.txt')
      fs.writeFileSync(filePath, 'x', 'utf-8')
      const patch = [
        '*** Begin Patch',
        '*** Delete File: to-delete.txt',
        '*** End Patch'
      ].join('\n')
      const result = await apply_patch({ input: patch })
      expect(result.success).toBe(true)
      const data = result.data as { summary: { deleted: string[] } }
      expect(data.summary.deleted).toContain('to-delete.txt')
      expect(fs.existsSync(filePath)).toBe(false)
    })
  })

  describe('screenshot', () => {
    it('成功返回 base64', async () => {
      captureScreenMock.mockResolvedValueOnce(Buffer.from('png-data'))
      const result = await screenshot({})
      expect(result.success).toBe(true)
      const data = result.data as { imageBase64: string; mimeType: string }
      expect(data.imageBase64).toBe(Buffer.from('png-data').toString('base64'))
      expect(data.mimeType).toBe('image/png')
    })

    it('可传 displayId', async () => {
      captureScreenMock.mockResolvedValueOnce(Buffer.from('x'))
      await screenshot({ displayId: 1 })
      expect(captureScreenMock).toHaveBeenCalledWith(1)
    })
  })

  describe('mouse_move', () => {
    it('缺少 x/y 返回 400', async () => {
      expect((await mouse_move({})).success).toBe(false)
      expect((await mouse_move({ x: 1 })).success).toBe(false)
    })

    it('成功调用 moveMouse', async () => {
      const result = await mouse_move({ x: 100, y: 200 })
      expect(result.success).toBe(true)
      expect(moveMouseMock).toHaveBeenCalledWith(100, 200, false)
    })
  })

  describe('mouse_click', () => {
    it('成功调用 clickMouse', async () => {
      const result = await mouse_click({ button: 'right' })
      expect(result.success).toBe(true)
      expect(clickMouseMock).toHaveBeenCalledWith(undefined, undefined, {
        button: 'right',
        double: false
      })
    })
  })
})
