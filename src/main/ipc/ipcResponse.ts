/**
 * IPC 统一响应形状
 * 约定：成功返回 { success: true, ...data }，失败返回 { success: false, error: string }
 */

export function ipcError(error: unknown, fallbackMessage: string): { success: false; error: string } {
  return {
    success: false,
    error: error instanceof Error ? error.message : fallbackMessage
  }
}

export function ipcSuccess<T extends Record<string, unknown>>(
  data: T
): { success: true } & T {
  return { success: true, ...data }
}
