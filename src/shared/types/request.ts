/**
 * Content entry types matching MCP SDK ContentBlockSchema:
 * - text: Plain text content
 * - image: Base64-encoded image with MIME type
 * - audio: Base64-encoded audio with MIME type
 * - resource: Embedded resource content
 * - resource_link: Reference to a resource
 * - blob: Legacy type for binary data (used by resources)
 */
export interface McpResultContentEntry {
    type: 'text' | 'image' | 'audio' | 'resource' | 'resource_link' | 'blob'
    // For text content
    text?: string
    // For image/audio content (base64-encoded)
    data?: string
    // For image/audio/resource content
    mimeType?: string
    // For resource/resource_link content
    resource?: {
        uri: string
        text?: string
        blob?: string
        mimeType?: string
    }
    // For resource_link content
    uri?: string
    name?: string
    description?: string
}

export interface McpResult {
    isError?: boolean
    content: McpResultContentEntry[]
    structuredContent?: object
}

// Valid content entry types
const VALID_CONTENT_TYPES = [
    'text',
    'image',
    'audio',
    'resource',
    'resource_link',
    'blob',
] as const

// type guard for McpResultContentEntry
export function isMcpResultContentEntry(
    value: unknown,
): value is McpResultContentEntry {
    if (value === null || typeof value !== 'object') {
        return false
    }
    const entry = value as { type?: unknown }
    if (typeof entry.type !== 'string') {
        return false
    }
    // Check if the type is one of the valid content types
    const validTypes: readonly string[] = VALID_CONTENT_TYPES
    return validTypes.includes(entry.type)
}

// type guard for McpResult
export function isMcpResult(value: unknown): value is McpResult {
    if (value !== null && typeof value === 'object') {
        // first option is that content-array is defined
        const resultValue = value as McpResult
        if (
            typeof resultValue.content === 'object' &&
            Array.isArray(resultValue.content)
        ) {
            const contentArray = resultValue.content
            for (const c of contentArray) {
                if (!isMcpResultContentEntry(c)) {
                    return false
                }
            }
            return true
        }

        // second option is that structuredContent is defined
        if (typeof resultValue.structuredContent === 'object') {
            return true
        }
    }

    return false
}

export interface RequestArgs {
    [x: string]: unknown
}

export type RequestBody = {
    credentials: string
    mcpServer: string
    request: {
        id: number
        method: string
        params: {
            name: string
            arguments: RequestArgs
        }
    }
}

export interface GetToolsRequestArgs extends RequestArgs {
    server: string
}

export interface DiscoverServersRequestArgs extends RequestArgs {
    mode: 'list' | 'category' | 'keyword'
    category?: string
    keyword?: string
}

// Type guard function
export function isRequestBody(value: unknown): value is RequestBody {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as RequestBody).credentials === 'string' &&
        typeof (value as RequestBody).mcpServer === 'string' &&
        typeof (value as RequestBody).request === 'object' &&
        typeof (value as RequestBody).request.id === 'number' &&
        typeof (value as RequestBody).request.method === 'string' &&
        typeof (value as RequestBody).request.params === 'object' &&
        typeof (value as RequestBody).request.params.name === 'string' &&
        typeof (value as RequestBody).request.params.arguments === 'object'
    )
}
