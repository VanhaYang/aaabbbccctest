import type { ToolExecutor, ToolId } from './types'

const registry = new Map<ToolId, ToolExecutor>()

export function registerTool(id: ToolId, executor: ToolExecutor): void {
  registry.set(id, executor)
}

export function getTool(id: ToolId): ToolExecutor | undefined {
  return registry.get(id)
}

export function listToolIds(): ToolId[] {
  return Array.from(registry.keys())
}
