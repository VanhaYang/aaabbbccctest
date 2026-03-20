type QueueItem<T> = {
  task: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

/**
 * 简单的异步任务队列，保证顺序执行
 */
export class CommandQueue {
  private queue: QueueItem<unknown>[] = []
  private isProcessing = false

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve, reject })
      this.processNext()
    })
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing) {
      return
    }

    const item = this.queue.shift()
    if (!item) {
      return
    }

    this.isProcessing = true
    try {
      const result = await item.task()
      item.resolve(result)
    } catch (error) {
      item.reject(error)
    } finally {
      this.isProcessing = false
      this.processNext()
    }
  }
}
