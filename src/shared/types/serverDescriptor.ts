// type guard for a tool in a server descriptor
export function isTool(obj: unknown): obj is Tool {
    return (
        obj !== null &&
        typeof obj === 'object' &&
        typeof (obj as Tool).name === 'string' &&
        typeof (obj as Tool).description === 'string' &&
        typeof (obj as Tool).input_schema === 'object' &&
        typeof (obj as Tool).required_inputs === 'object' &&
        Array.isArray((obj as Tool).required_inputs)
    )
}

// type guard for a server descriptor
export function isMCPHiveServerDesc(obj: unknown): obj is MCPHiveServerDesc {
    if (
        obj !== null &&
        typeof obj === 'object' &&
        typeof (obj as MCPHiveServerDesc).id === 'string' &&
        typeof (obj as MCPHiveServerDesc).server === 'string' &&
        typeof (obj as MCPHiveServerDesc).tools === 'object' &&
        Array.isArray((obj as MCPHiveServerDesc).tools)
    ) {
        for (const t of (obj as MCPHiveServerDesc).tools) {
            if (!isTool(t)) {
                return false
            }
        }

        return true
    }
    return false
}
export interface Tool {
    name: string
    description: string
    input_schema: { [k: string]: string }
    required_inputs: string[]
}

export interface MCPHiveServerDesc {
    id: string
    server: string
    tools: Tool[]
}
