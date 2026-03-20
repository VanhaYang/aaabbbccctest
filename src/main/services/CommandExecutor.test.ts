import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import iconv from 'iconv-lite'
import { CommandExecutor } from './CommandExecutor'

function createMockProcess(resolveValue: {
  exitCode?: number
  stdout: Buffer | string
  stderr: Buffer | string
  killed?: boolean
}) {
  const { exitCode = 0, stdout, stderr, killed = false } = resolveValue
  const promise = Promise.resolve({
    exitCode,
    stdout,
    stderr,
    killed,
  })
  return Object.assign(promise, {
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
  })
}

const execaCommandMock = vi.fn()
vi.mock('execa', () => ({
  execaCommand: (...args: unknown[]) => execaCommandMock(...args),
}))

describe('CommandExecutor', () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    execaCommandMock.mockReset()
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
  })

  describe('成功路径：stdout/stderr 为 Buffer 时解码为字符串', () => {
    it('Windows: GBK stderr 解码为中文，返回中 stderr 为字符串且非 Buffer', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
      const gbkStderr = iconv.encode('命令语法不正确。', 'gbk')
      execaCommandMock.mockReturnValue(
        createMockProcess({
          exitCode: 1,
          stdout: Buffer.alloc(0),
          stderr: gbkStderr,
          killed: false,
        })
      )
      const executor = new CommandExecutor()
      const result = await executor.execute('mkdir -p x', {})
      expect(result.exitCode).toBe(1)
      expect(typeof result.stderr).toBe('string')
      expect(result.stderr).toBe('命令语法不正确。')
      expect(result.stdout).toBe('')
    })

    it('Windows: 成功时 UTF-8 Buffer 解码正确', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
      execaCommandMock.mockReturnValue(
        createMockProcess({
          exitCode: 0,
          stdout: Buffer.from('hello 世界', 'utf-8'),
          stderr: Buffer.alloc(0),
          killed: false,
        })
      )
      const executor = new CommandExecutor()
      const result = await executor.execute('echo x', {})
      expect(result.stdout).toBe('hello 世界')
      expect(result.stderr).toBe('')
    })

    it('非 Windows: Buffer 按 UTF-8 解码', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
      execaCommandMock.mockReturnValue(
        createMockProcess({
          exitCode: 0,
          stdout: Buffer.from('ok', 'utf-8'),
          stderr: Buffer.from('warn', 'utf-8'),
          killed: false,
        })
      )
      const executor = new CommandExecutor()
      const result = await executor.execute('echo x', {})
      expect(result.stdout).toBe('ok')
      expect(result.stderr).toBe('warn')
    })

    it('execa 返回 string 时原样使用', async () => {
      execaCommandMock.mockReturnValue(
        createMockProcess({
          exitCode: 0,
          stdout: 'text out',
          stderr: 'text err',
          killed: false,
        })
      )
      const executor = new CommandExecutor()
      const result = await executor.execute('echo x', {})
      expect(result.stdout).toBe('text out')
      expect(result.stderr).toBe('text err')
    })
  })

  describe('catch 路径：错误对象中 stdout/stderr 为 Buffer 时也解码为字符串', () => {
    it('Windows: 其他错误时 execaError.stderr 为 GBK Buffer 则解码后返回', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
      const gbkStderr = iconv.encode('不是内部或外部命令', 'gbk')
      execaCommandMock.mockReturnValue(
        Promise.reject(
          Object.assign(new Error('spawn ENOENT'), {
            exitCode: 1,
            stdout: Buffer.alloc(0),
            stderr: gbkStderr,
            killed: false,
          })
        )
      )
      const executor = new CommandExecutor()
      const result = await executor.execute('invalid-cmd', {})
      expect(typeof result.stderr).toBe('string')
      expect(result.stderr).toBe('不是内部或外部命令')
      expect(result.exitCode).toBe(1)
    })

    it('被取消/信号时 stderr 为 Buffer 也解码', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
      const gbkBuf = iconv.encode('已中断', 'gbk')
      execaCommandMock.mockReturnValue(
        Promise.reject(
          Object.assign(new Error('canceled'), {
            isCanceled: true,
            signal: 'SIGTERM',
            stdout: Buffer.alloc(0),
            stderr: gbkBuf,
            killed: true,
          })
        )
      )
      const executor = new CommandExecutor()
      const result = await executor.execute('ping -t 1', {})
      expect(typeof result.stderr).toBe('string')
      expect(result.stderr).toBe('已中断')
      expect(result.killed).toBe(true)
    })

    it('超时错误返回固定中文文案，不依赖 execa 输出', async () => {
      execaCommandMock.mockReturnValue(
        Promise.reject(
          Object.assign(new Error('timeout'), {
            timedOut: true,
            killed: true,
          })
        )
      )
      const executor = new CommandExecutor()
      const result = await executor.execute('sleep 100', { timeout: 1 })
      expect(result.stderr).toContain('命令执行超时')
      expect(result.exitCode).toBe(-1)
      expect(result.killed).toBe(true)
    })
  })

  describe('返回结构完整性', () => {
    beforeEach(() => {
      execaCommandMock.mockReturnValue(
        createMockProcess({
          exitCode: 0,
          stdout: Buffer.from('ok', 'utf-8'),
          stderr: Buffer.alloc(0),
          killed: false,
        })
      )
    })

    it('返回包含 exitCode, stdout, stderr, duration, killed 且 stdout/stderr 均为 string', async () => {
      const executor = new CommandExecutor()
      const result = await executor.execute('echo 1', {})
      expect(result).toMatchObject({
        exitCode: expect.any(Number),
        duration: expect.any(Number),
        killed: expect.any(Boolean),
      })
      expect(typeof result.stdout).toBe('string')
      expect(typeof result.stderr).toBe('string')
      expect(Array.isArray(result.stdout)).toBe(false)
      expect(Array.isArray(result.stderr)).toBe(false)
    })
  })
})
