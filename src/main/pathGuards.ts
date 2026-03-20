import * as path from 'path'

/**
 * 判断 target 是否在 root 内部或等于 root。
 * 采用 OpenClaw path-guards 逻辑：先 resolve 再 path.relative，用「相对路径是否以 .. 开头」判断，
 * 避免误杀文件名中含 ".." 的合法路径（如 my..file.txt）。
 * Windows 上对 root/target 做 toLowerCase 再比较，避免大小写导致误判。
 */
export function isPathInside(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)

  if (process.platform === 'win32') {
    const relative = path.win32.relative(
      resolvedRoot.toLowerCase(),
      resolvedTarget.toLowerCase()
    )
    return (
      relative === '' ||
      (!relative.startsWith('..') && !path.win32.isAbsolute(relative))
    )
  }

  const relative = path.relative(resolvedRoot, resolvedTarget)
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  )
}
