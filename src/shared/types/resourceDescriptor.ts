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

// Type guard for a resources descriptor
export function isMCPHiveResourcesDesc(
    obj: unknown,
): obj is MCPHiveResourcesDesc {
    if (
        obj !== null &&
        typeof obj === 'object' &&
        typeof (obj as MCPHiveResourcesDesc).id === 'string' &&
        typeof (obj as MCPHiveResourcesDesc).server === 'string' &&
        typeof (obj as MCPHiveResourcesDesc).resources === 'object' &&
        Array.isArray((obj as MCPHiveResourcesDesc).resources)
    ) {
        for (const r of (obj as MCPHiveResourcesDesc).resources) {
            if (!isResource(r)) {
                return false
            }
        }

        return true
    }
    return false
}

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
