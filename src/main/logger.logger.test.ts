import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockLog = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  verbose: vi.fn(),
  transports: {
    file: { fileName: '', maxSize: 0, level: '', getFile: () => ({ path: '' }) },
    console: { level: '', format: '' }
  },
  errorHandler: { startCatching: vi.fn() }
}

vi.mock('electron-log', () => ({ default: mockLog }))
vi.mock('electron', () => ({ app: { isPackaged: false } }))

describe('logger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('default asyncLog', () => {
    it('forwards info to electron-log', async () => {
      const log = (await import('./logger')).default
      log.info('hello', 123)
      await new Promise(r => setImmediate(r))
      expect(mockLog.info).toHaveBeenCalledWith('hello', 123)
    })

    it('forwards error to electron-log', async () => {
      const log = (await import('./logger')).default
      log.error('err', new Error('test'))
      await new Promise(r => setImmediate(r))
      expect(mockLog.error).toHaveBeenCalledWith('err', expect.any(Error))
    })

    it('forwards warn to electron-log', async () => {
      const log = (await import('./logger')).default
      log.warn('warn message')
      await new Promise(r => setImmediate(r))
      expect(mockLog.warn).toHaveBeenCalledWith('warn message')
    })
  })

  describe('syncLog', () => {
    it('forwards sync.info to electron-log synchronously', async () => {
      const { syncLog } = await import('./logger')
      syncLog.info('sync hello')
      expect(mockLog.info).toHaveBeenCalledWith('sync hello')
    })

    it('forwards sync.error to electron-log synchronously', async () => {
      const { syncLog } = await import('./logger')
      syncLog.error('sync err')
      expect(mockLog.error).toHaveBeenCalledWith('sync err')
    })
  })
})
