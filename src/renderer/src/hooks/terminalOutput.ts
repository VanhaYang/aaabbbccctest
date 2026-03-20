import type { ExecutionResult } from '../../../main/types/terminal'

interface MergeResult {
  output: string
  changed: boolean
}

const ensureSeparatedAppend = (base: string, addition: string): string => {
  if (!addition) {
    return base
  }
  if (base.length > 0 && !base.endsWith('\n')) {
    return `${base}\n${addition}`
  }
  return `${base}${addition}`
}

export const mergeFinalResultOutput = (
  currentOutput: string,
  result: ExecutionResult
): MergeResult => {
  let finalOutput = currentOutput
  let changed = false

  const finalStdout = result.stdout || ''
  const finalStderr = result.stderr || ''
  const finalTotalLength = finalStdout.length + finalStderr.length
  const currentOutputLength = finalOutput.length

  if (finalTotalLength > 0) {
    if (finalStdout && finalStdout.length > 0) {
      const stdoutInOutput = finalOutput.includes(finalStdout.trim())
      const stdoutNeeded =
        !stdoutInOutput &&
        (currentOutputLength === 0 ||
          finalStdout.length > currentOutputLength * 0.5 ||
          finalStdout.length > 100)

      if (stdoutNeeded) {
        finalOutput = ensureSeparatedAppend(finalOutput, finalStdout)
        changed = true
      }
    }

    if (finalStderr && finalStderr.length > 0) {
      const stderrKeyParts = finalStderr
        .split('\n')
        .filter(line => line.trim().length > 10)
        .slice(0, 3)
      const stderrInOutput =
        stderrKeyParts.length === 0 ||
        stderrKeyParts.some(part => finalOutput.includes(part.trim()))

      const stderrNeeded =
        !stderrInOutput &&
        (currentOutputLength === 0 ||
          finalStderr.length > currentOutputLength * 0.3 ||
          finalStderr.length > 50 ||
          finalTotalLength > currentOutputLength + 20)

      if (stderrNeeded) {
        finalOutput = ensureSeparatedAppend(finalOutput, finalStderr)
        changed = true
      }
    }
  }

  const completionMarker =
    result.exitCode === 0 ? '[命令执行完成]' : `[命令执行失败，退出码: ${result.exitCode}]`
  if (!finalOutput.includes(completionMarker)) {
    finalOutput = `${finalOutput}\n${completionMarker}\n`
    changed = true
  }

  return { output: finalOutput, changed }
}
