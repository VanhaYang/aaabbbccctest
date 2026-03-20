import log from 'electron-log'
import { app } from 'electron'

/**
 * 日志管理器
 * 职责：统一管理应用日志，支持文件记录和控制台输出
 */

/**
 * 初始化日志系统
 */
export function initializeLogger(): void {
  // 配置日志文件路径
  // Windows: %USERPROFILE%\AppData\Roaming\Electron Screenshot\logs\
  // macOS: ~/Library/Logs/Electron Screenshot/
  // Linux: ~/.config/Electron Screenshot/logs/

  // 设置日志文件名称
  log.transports.file.fileName = 'main.log'

  // 设置日志级别
  log.transports.file.level = 'info'
  log.transports.console.level = app.isPackaged ? 'warn' : 'debug'

  // 设置日志文件最大大小（10MB）
  log.transports.file.maxSize = 10 * 1024 * 1024

  // electron-log 默认使用异步文件写入，不会阻塞主线程
  // 文件写入操作在后台异步执行，不会影响应用性能

  // 获取日志文件路径
  const logPath = log.transports.file.getFile().path

  // 在开发环境也输出到控制台
  if (!app.isPackaged) {
    log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}'
  } else {
    // 生产环境只记录到文件，不输出到控制台（避免性能问题）
    log.transports.console.level = false
  }

  // 捕获未处理的异常（使用新的 errorHandler API）
  log.errorHandler.startCatching({
    showDialog: false, // 不显示对话框，只记录到文件
    onError: ({ error, versions, processType }) => {
      log.error('未捕获的异常:', error)
      log.error('应用版本:', versions?.app || 'unknown')
      log.error('Electron 版本:', versions?.electron || 'unknown')
      log.error('操作系统:', versions?.os || 'unknown')
      log.error('进程类型:', processType || 'unknown')
    }
  })

  // 记录应用启动信息
  log.info('='.repeat(50))
  log.info('应用启动')
  log.info('应用版本:', app.getVersion())
  log.info('Electron 版本:', process.versions.electron)
  log.info('Node 版本:', process.versions.node)
  log.info('操作系统:', process.platform, process.arch)
  log.info('是否打包:', app.isPackaged)
  log.info('日志文件:', logPath)
  log.info('='.repeat(50))
}

/**
 * 获取日志文件路径
 */
export function getLogPath(): string {
  return log.transports.file.getFile().path
}

/**
 * 异步日志包装器
 * 确保日志写入不会阻塞主线程，特别是在性能关键路径中
 */
const asyncLog = {
  info: (...args: any[]) => {
    // 使用 process.nextTick 确保日志写入在下一个事件循环中执行
    // 这样不会阻塞当前执行路径
    process.nextTick(() => {
      log.info(...args)
    })
  },
  error: (...args: any[]) => {
    // 错误日志也异步处理，但保持高优先级
    process.nextTick(() => {
      log.error(...args)
    })
  },
  warn: (...args: any[]) => {
    process.nextTick(() => {
      log.warn(...args)
    })
  },
  debug: (...args: any[]) => {
    process.nextTick(() => {
      log.debug(...args)
    })
  },
  verbose: (...args: any[]) => {
    process.nextTick(() => {
      log.verbose(...args)
    })
  },
  // 保留同步日志方法，用于关键错误（如应用启动时的错误）
  sync: {
    info: log.info.bind(log),
    error: log.error.bind(log),
    warn: log.warn.bind(log),
    debug: log.debug.bind(log),
    verbose: log.verbose.bind(log)
  }
}

/**
 * 导出异步日志实例，供其他模块使用
 * 默认使用异步日志，确保不阻塞主线程
 */
export default asyncLog

/**
 * 导出原始日志实例（如果需要同步日志）
 */
export { log as syncLog }
