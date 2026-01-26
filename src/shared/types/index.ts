// Re-export all types from type files
export * from './request.ts'
export * from './serverDescriptor.ts'
export * from './resourceDescriptor.ts'
export * from './promptDescriptor.ts'
export * from './discoveryDescriptor.ts'

/**
 * Generic factory for creating type guards for MCP descriptor types.
 * All descriptors have id, server, and an array field (tools/resources/prompts).
 */
export function createDescTypeGuard<T, Item>(
    arrayField: string,
    itemGuard: (obj: unknown) => obj is Item,
): (obj: unknown) => obj is T {
    return (obj: unknown): obj is T => {
        if (!obj || typeof obj !== 'object') return false
        const desc = obj as Record<string, unknown>
        if (typeof desc.id !== 'string' || typeof desc.server !== 'string') return false
        const arr = desc[arrayField]
        if (!Array.isArray(arr)) return false
        return arr.every(itemGuard)
    }
}
