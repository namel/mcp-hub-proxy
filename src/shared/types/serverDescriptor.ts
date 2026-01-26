import { createDescTypeGuard } from './index.ts'

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

export interface Tool {
    name: string
    description: string
    input_schema: { [k: string]: string }
    required_inputs: string[]
    output_schema?: { [k: string]: string }
}

export interface MCPHiveServerDesc {
    id: string
    server: string
    tools: Tool[]
}

// type guard for a server descriptor using generic factory
export const isMCPHiveServerDesc = createDescTypeGuard<MCPHiveServerDesc, Tool>(
    'tools',
    isTool,
)
