import { createDescTypeGuard } from './index.ts'

// Resource descriptor from MCP SDK
export interface Resource {
    uri: string
    name: string
    description?: string | undefined
    mimeType?: string | undefined
}

// Type guard for a resource in a server descriptor
export function isResource(obj: unknown): obj is Resource {
    return (
        obj !== null &&
        typeof obj === 'object' &&
        typeof (obj as Resource).uri === 'string' &&
        typeof (obj as Resource).name === 'string'
    )
}

// Server descriptor with resources
export interface MCPHiveResourcesDesc {
    id: string
    server: string
    resources: Resource[]
}

// Type guard for a resources descriptor using generic factory
export const isMCPHiveResourcesDesc = createDescTypeGuard<
    MCPHiveResourcesDesc,
    Resource
>('resources', isResource)

// Resource content returned from read operations
export interface ResourceContent {
    uri: string
    mimeType?: string
    text?: string
    blob?: string // Base64-encoded binary
}

// Type guard for resource content
export function isResourceContent(obj: unknown): obj is ResourceContent {
    return (
        obj !== null &&
        typeof obj === 'object' &&
        typeof (obj as ResourceContent).uri === 'string' &&
        ((obj as ResourceContent).text !== undefined ||
            (obj as ResourceContent).blob !== undefined)
    )
}
