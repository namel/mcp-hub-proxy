import { createDescTypeGuard } from './index.ts'

// Prompt descriptor from MCP SDK
export interface Prompt {
    name: string
    description?: string | undefined
    arguments?: PromptArgument[] | undefined
}

// Prompt argument descriptor
export interface PromptArgument {
    name: string
    description?: string | undefined
    required?: boolean | undefined
}

// Type guard for a prompt in a server descriptor
export function isPrompt(obj: unknown): obj is Prompt {
    return (
        obj !== null &&
        typeof obj === 'object' &&
        typeof (obj as Prompt).name === 'string'
    )
}

// Server descriptor with prompts
export interface MCPHivePromptsDesc {
    id: string
    server: string
    prompts: Prompt[]
}

// Type guard for a prompts descriptor using generic factory
export const isMCPHivePromptsDesc = createDescTypeGuard<
    MCPHivePromptsDesc,
    Prompt
>('prompts', isPrompt)

// Prompt message returned from get operations
export interface PromptMessage {
    role: 'user' | 'assistant' | 'system'
    content: {
        type: 'text' | 'image' | 'resource'
        text?: string
        data?: string
        mimeType?: string
    }
}

// Get prompt result
export interface GetPromptResult {
    description?: string
    messages: PromptMessage[]
}

// Type guard for prompt message
export function isPromptMessage(obj: unknown): obj is PromptMessage {
    return (
        obj !== null &&
        typeof obj === 'object' &&
        typeof (obj as PromptMessage).role === 'string' &&
        ['user', 'assistant', 'system'].includes((obj as PromptMessage).role) &&
        typeof (obj as PromptMessage).content === 'object'
    )
}

// Type guard for get prompt result
export function isGetPromptResult(obj: unknown): obj is GetPromptResult {
    if (
        obj !== null &&
        typeof obj === 'object' &&
        typeof (obj as GetPromptResult).messages === 'object' &&
        Array.isArray((obj as GetPromptResult).messages)
    ) {
        for (const m of (obj as GetPromptResult).messages) {
            if (!isPromptMessage(m)) {
                return false
            }
        }
        return true
    }
    return false
}
