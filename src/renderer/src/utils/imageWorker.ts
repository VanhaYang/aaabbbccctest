/**
 * Web Worker 用于异步解码图片
 * 使用 createImageBitmap() 在 Worker 中处理，避免阻塞主线程
 */

// Worker 消息类型
interface WorkerMessage {
  type: 'decode'
  imageData: string // Base64 数据 URL
  id: string // 请求 ID
}

interface WorkerResponse {
  type: 'decode-result'
  id: string
  imageBitmap: ImageBitmap | null
  error?: string
}

/**
 * 创建图片解码 Worker
 */
function createImageWorker(): Worker | null {
  // 使用内联 Worker 代码
  const workerCode = `
    self.onmessage = async function(e) {
      const { type, imageData, id } = e.data;
      
      if (type === 'decode') {
        try {
          // 将 Base64 数据 URL 转换为 Blob
          const response = await fetch(imageData);
          if (!response.ok) {
            throw new Error('Failed to fetch image data');
          }
          const blob = await response.blob();
          
          // 使用 createImageBitmap 在 Worker 中解码
          // 这样可以避免阻塞主线程
          const imageBitmap = await createImageBitmap(blob);
          
          // 发送结果（注意：ImageBitmap 可以通过 Transferable 传输，性能更好）
          self.postMessage({
            type: 'decode-result',
            id,
            imageBitmap
          }, [imageBitmap]);
        } catch (error) {
          self.postMessage({
            type: 'decode-result',
            id,
            imageBitmap: null,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    };
  `

  try {
    const blob = new Blob([workerCode], { type: 'application/javascript' })
    const workerUrl = URL.createObjectURL(blob)
    return new Worker(workerUrl)
  } catch (error) {
    console.error('[ImageWorker] 创建 Worker 失败:', error)
    return null
  }
}

// 单例 Worker
let workerInstance: Worker | null = null
let requestIdCounter = 0
const pendingRequests = new Map<string, {
  resolve: (imageBitmap: ImageBitmap) => void
  reject: (error: Error) => void
}>()

/**
 * 获取 Worker 实例（单例）
 */
function getWorker(): Worker | null {
  if (!workerInstance) {
    workerInstance = createImageWorker()
    if (workerInstance) {
      workerInstance.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const { type, id, imageBitmap, error } = e.data
        if (type === 'decode-result') {
          const request = pendingRequests.get(id)
          if (request) {
            pendingRequests.delete(id)
            if (error || !imageBitmap) {
              request.reject(new Error(error || '图片解码失败'))
            } else {
              request.resolve(imageBitmap)
            }
          }
        }
      }

      workerInstance.onerror = (error) => {
        console.error('[ImageWorker] Worker 错误:', error)
        // 清理所有待处理的请求
        pendingRequests.forEach((request) => {
          request.reject(new Error('Worker 错误'))
        })
        pendingRequests.clear()
      }
    }
  }
  return workerInstance
}

/**
 * 在 Worker 中异步解码图片
 * @param imageData Base64 数据 URL
 * @returns Promise<ImageBitmap>
 */
export async function decodeImageInWorker(imageData: string): Promise<ImageBitmap> {
  const worker = getWorker()

  if (!worker) {
    // Worker 不可用，回退到主线程解码
    console.warn('[ImageWorker] Worker 不可用，使用主线程解码')
    return decodeImageInMainThread(imageData)
  }

  return new Promise((resolve, reject) => {
    const id = `request-${++requestIdCounter}`
    
    pendingRequests.set(id, { resolve, reject })

    // 发送解码请求
    worker.postMessage({
      type: 'decode',
      imageData,
      id
    } as WorkerMessage)

    // 设置超时（30秒）
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id)
        reject(new Error('图片解码超时'))
      }
    }, 30000)
  })
}

/**
 * 在主线程中解码图片（回退方案）
 * @param imageData Base64 数据 URL
 * @returns Promise<ImageBitmap>
 */
async function decodeImageInMainThread(imageData: string): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = async () => {
      try {
        // 创建临时 canvas 来获取 ImageBitmap
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('无法创建 Canvas Context'))
          return
        }
        ctx.drawImage(img, 0, 0)
        const imageBitmap = await createImageBitmap(canvas)
        resolve(imageBitmap)
      } catch (error) {
        reject(error instanceof Error ? error : new Error('解码失败'))
      }
    }
    img.onerror = () => {
      reject(new Error('图片加载失败'))
    }
    img.src = imageData
  })
}

/**
 * 销毁 Worker（清理资源）
 */
export function destroyImageWorker(): void {
  if (workerInstance) {
    workerInstance.terminate()
    workerInstance = null
    pendingRequests.clear()
  }
}

