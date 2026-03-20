/**
 * 文件验证工具
 * 用于验证文件类型和大小
 */

// 支持的文件类型
const SUPPORTED_TYPES = {
  // 文档类型
  document: ['txt', 'md', 'markdown', 'pdf', 'html', 'xlsx', 'xls', 'docx', 'csv', 'eml', 'msg', 'pptx', 'ppt', 'xml', 'epub'],
  // 图片类型
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
  // 音频类型
  audio: ['mp3', 'm4a', 'wav', 'webm', 'amr', 'mpga'],
  // 视频类型
  video: ['mp4', 'mov', 'mpeg', 'mpga']
}

// 文件大小限制（字节）
const SIZE_LIMITS = {
  document: 15 * 1024 * 1024, // 15MB
  image: 10 * 1024 * 1024,     // 10MB
  audio: 50 * 1024 * 1024,     // 50MB
  video: 100 * 1024 * 1024     // 100MB
}

// 最大文件数量
const MAX_FILE_COUNT = 5

/**
 * 获取文件扩展名
 */
function getFileExtension(fileName: string): string {
  const parts = fileName.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
}

/**
 * 判断文件类型
 */
function getFileCategory(extension: string): 'document' | 'image' | 'audio' | 'video' | null {
  if (SUPPORTED_TYPES.document.includes(extension)) {
    return 'document'
  }
  if (SUPPORTED_TYPES.image.includes(extension)) {
    return 'image'
  }
  if (SUPPORTED_TYPES.audio.includes(extension)) {
    return 'audio'
  }
  if (SUPPORTED_TYPES.video.includes(extension)) {
    return 'video'
  }
  return null
}

/**
 * 验证单个文件
 */
export interface FileValidationResult {
  valid: boolean
  error?: string
  category?: 'document' | 'image' | 'audio' | 'video'
}

export function validateFile(file: File): FileValidationResult {
  const extension = getFileExtension(file.name)
  
  // 检查文件类型是否支持
  const category = getFileCategory(extension)
  if (!category) {
    return {
      valid: false,
      error: `不支持的文件类型: ${extension.toUpperCase()}`
    }
  }

  // 检查文件大小
  const sizeLimit = SIZE_LIMITS[category]
  if (file.size > sizeLimit) {
    const sizeLimitMB = (sizeLimit / (1024 * 1024)).toFixed(2)
    const categoryName = {
      document: '文档',
      image: '图片',
      audio: '音频',
      video: '视频'
    }[category]
    return {
      valid: false,
      error: `${categoryName}文件大小不能超过 ${sizeLimitMB}MB`,
      category
    }
  }

  return {
    valid: true,
    category
  }
}

/**
 * 验证并筛选文件列表
 */
export interface FileValidationSummary {
  validFiles: File[]
  invalidFiles: Array<{ file: File; error: string }>
  totalCount: number
  validCount: number
  invalidCount: number
}

export function validateFiles(files: File[]): FileValidationSummary {
  const invalidFiles: Array<{ file: File; error: string }> = []
  const allValidFiles: File[] = []

  // 先验证所有文件，筛选出符合规范的文件
  files.forEach((file) => {
    const validation = validateFile(file)
    if (validation.valid) {
      allValidFiles.push(file)
    } else {
      invalidFiles.push({
        file,
        error: validation.error || '未知错误'
      })
    }
  })

  // 从符合规范的文件中取前5个
  const validFiles = allValidFiles.slice(0, MAX_FILE_COUNT)
  const skippedValidCount = allValidFiles.length - validFiles.length

  // 如果有被跳过的符合规范的文件，添加提示
  if (skippedValidCount > 0) {
    console.warn(`[文件验证] 超过最大文件数量限制(${MAX_FILE_COUNT}个)，已跳过 ${skippedValidCount} 个符合规范的文件`)
  }

  return {
    validFiles,
    invalidFiles,
    totalCount: files.length,
    validCount: validFiles.length,
    invalidCount: invalidFiles.length + skippedValidCount
  }
}

/**
 * 获取文件类型的中文名称
 */
export function getFileCategoryName(category: 'document' | 'image' | 'audio' | 'video'): string {
  const names = {
    document: '文档',
    image: '图片',
    audio: '音频',
    video: '视频'
  }
  return names[category]
}

/**
 * 获取文件大小限制（MB）
 */
export function getFileSizeLimit(category: 'document' | 'image' | 'audio' | 'video'): number {
  return SIZE_LIMITS[category] / (1024 * 1024)
}

/**
 * 获取最大文件数量
 */
export function getMaxFileCount(): number {
  return MAX_FILE_COUNT
}

