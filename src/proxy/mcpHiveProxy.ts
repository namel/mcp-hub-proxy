#!/usr/bin/env node

import { z } from 'zod'
import { ZodHelpers } from './utils/ZodHelpers.ts'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Logger } from '../shared/logger.ts'
import { Utils } from '../shared/utils.ts'
import { MCPHiveProxyRequest } from './requests/mcpHiveProxyRequest.ts'
import { ListToolsProxy } from './requests/listToolsProxy.ts'
import { ListResourcesProxy } from './requests/listResourcesProxy.ts'
import { ListPromptsProxy } from './requests/listPromptsProxy.ts'
import {
    METHOD_TOOLS_CALL,
    METHOD_RESOURCES_READ,
    METHOD_PROMPTS_GET,
    MCP_URL,
    MCP_LOCAL_URL,
    MCP_DEMO_CREDENTIALS,
    MCPHIVE_SERVER,
    MCPHIVE_TOOL_DISCOVER_SERVERS,
} from '../shared/constants.ts'
import type {
    McpResult,
    McpResultContentEntry,
} from '../shared/types/request.ts'
import {
    isMCPHiveDiscoveryDesc,
    type MCPHiveDiscoveryDesc,
} from '../shared/types/discoveryDescriptor.ts'
import type {
    CallToolResult,
    ReadResourceResult,
    GetPromptResult,
    TextContent,
    ImageContent,
    AudioContent,
    EmbeddedResource,
    ResourceLink,
} from '@modelcontextprotocol/sdk/types.js'

// the configuration of an MCPHive proxy
interface MCPHiveProxyConfig {
    local: boolean
    MCPHiveURL: string
    credentials: string
    verbose: boolean
    gateway: boolean
}

// Namespace separator for gateway mode tool names
const NAMESPACE_SEPARATOR = '___'

/**
 * The MCPHive Proxy is the logic that executes on the client host, and acts as an MCP server.
 *
 * Every request it receives is forwarded to MCPHive and fulfilled there. The MCPHive central server
 * builds the MCP response and returns it to the MCPHive proxy, which in turn, returns it to the client host's
 * MCP Client.
 *
 * There is one distinct MCPHive Proxy running process for each server that the client configures. The proxy understands
 * which server it is proxy-ing and implements all aspects of the API that is required of an MCP server.
 *
 * The MCPHive Proxy can run in two modes:
 *   - server mode: whereby the proxy acts in the role of one specific server.
 *   - gateway mode: whereby the proxy is a gateway to all MCP servers in the MCP Hive, provides tools for
 *     discover these MCP servers, and enables name-spaced access to their tools and resources.
 *
 */
export class MCPHiveProxy {
    private static instance: MCPHiveProxy
    private mcpServer: McpServer
    public config: MCPHiveProxyConfig = {
        local: false,
        MCPHiveURL: MCP_URL,
        credentials: MCP_DEMO_CREDENTIALS,
        verbose: false,
        gateway: false,
    }

    private constructor() {
        // create the logger
        new Logger('MCPHiveProxy')

        // create server instance using the SDK
        this.mcpServer = new McpServer(
            {
                name: 'MCPHive-proxy',
                version: '1.0.0',
            },
            {
                capabilities: {
                    resources: {
                        subscribe: true,
                        listChanged: true,
                    },
                    prompts: {
                        listChanged: true,
                    },
                    tools: {},
                },
            },
        )
    }

    // singleton access
    public static getInstance(): MCPHiveProxy {
        if (!MCPHiveProxy.instance) {
            MCPHiveProxy.instance = new MCPHiveProxy()
        }
        return MCPHiveProxy.instance
    }

    /**
     * Parse a namespaced tool name (serverName___toolName) into its components
     */
    private parseNamespacedName(namespacedName: string): {
        serverName: string
        itemName: string
    } {
        const idx = namespacedName.indexOf(NAMESPACE_SEPARATOR)
        if (idx === -1) {
            throw new Error(`Invalid namespaced name: ${namespacedName}`)
        }
        return {
            serverName: namespacedName.substring(0, idx),
            itemName: namespacedName.substring(
                idx + NAMESPACE_SEPARATOR.length,
            ),
        }
    }

    /**
     * Create a namespaced name from server and item names
     */
    private makeNamespacedName(serverName: string, itemName: string): string {
        return `${serverName}${NAMESPACE_SEPARATOR}${itemName}`
    }

    // initialize the proxy with key parameters
    public async initialize(
        serverName: string | undefined,
        isLocal: boolean,
        credentials: string,
        verbose: boolean,
        gateway: boolean,
    ): Promise<void> {
        // handle global errors. The TS MCP server implementation tends to throw process-level exceptions when
        // it encounters any errors, even argument schema validation errors. So without this logic the process will
        // often fail
        process.on('uncaughtException', (err: Error) => {
            Logger.error(`Proxy uncaught exception: ${err}`)
        })

        // set config
        this.config.verbose = verbose
        this.config.local = isLocal
        this.config.credentials = credentials
        this.config.gateway = gateway
        if (isLocal) {
            this.config.MCPHiveURL = MCP_LOCAL_URL
        }

        // Branch based on mode
        if (gateway) {
            await this.initializeGatewayMode()
        } else if (serverName) {
            await this.initializeProxyMode(serverName)
        } else {
            throw new Error('Either --server or --gateway must be specified')
        }
    }

    /**
     * Initialize in gateway mode - expose all servers' tools with namespaced names
     */
    private async initializeGatewayMode(): Promise<void> {
        Logger.debug('Initializing in Gateway mode')

        // First, register the mcp-hive discovery tools (not namespaced)
        await this.registerDiscoveryTools()

        // Discover all available servers
        const discoveryResult =
            await MCPHiveProxyRequest.sendMCPHiveRequest<McpResult>(
                MCPHIVE_SERVER,
                METHOD_TOOLS_CALL,
                MCPHIVE_TOOL_DISCOVER_SERVERS,
                { mode: 'list' },
            )

        if (
            !discoveryResult?.structuredContent ||
            !isMCPHiveDiscoveryDesc(discoveryResult.structuredContent)
        ) {
            Logger.error('Failed to discover servers in gateway mode')
            return
        }

        const discovery: MCPHiveDiscoveryDesc =
            discoveryResult.structuredContent

        Logger.debug(`Gateway mode: discovered ${discovery.totalCount} servers`)

        // For each discovered server, fetch and register its tools/resources/prompts
        for (const server of discovery.servers) {
            try {
                await this.registerServerTools(server.name)
                await this.registerServerResources(server.name)
                await this.registerServerPrompts(server.name)
            } catch (error) {
                Logger.error(
                    `Failed to register server ${server.id}: ${error instanceof Error ? error.message : String(error)}`,
                )
                // Continue with other servers
            }
        }
    }

    /**
     * Register the mcp-hive discovery tools (not namespaced, available in gateway mode)
     */
    private async registerDiscoveryTools(): Promise<void> {
        // Fetch the mcp-hive tools
        const MCPHiveServerDesc = await ListToolsProxy.exec(MCPHIVE_SERVER)

        for (const toolDesc of MCPHiveServerDesc.tools) {
            const unpackedArgs: Record<string, unknown> = {}
            for (const [k, v] of Object.entries(toolDesc.input_schema)) {
                unpackedArgs[k] = JSON.parse(v)
            }

            const toolArgs: z.ZodRawShape = ZodHelpers.inferZodRawShapeFromSpec(
                unpackedArgs,
                toolDesc.required_inputs,
            )

            Logger.debug(`Registering discovery tool: ${toolDesc.name}`)

            this.mcpServer.registerTool(
                toolDesc.name, // Not namespaced
                {
                    title: toolDesc.name,
                    description: toolDesc.description,
                    inputSchema: toolArgs,
                },
                async (input: { [x: string]: unknown }) => {
                    const result =
                        await MCPHiveProxyRequest.sendMCPHiveRequest<McpResult>(
                            MCPHIVE_SERVER,
                            METHOD_TOOLS_CALL,
                            toolDesc.name,
                            input,
                        )

                    const content = (result?.content || []).map((entry) =>
                        this.convertToSDKContent(entry),
                    )

                    return {
                        content,
                        isError: result?.isError,
                        structuredContent: result?.structuredContent as
                            | { [x: string]: unknown }
                            | undefined,
                    } as CallToolResult
                },
            )
        }
    }

    /**
     * Register tools from a specific server with namespaced names
     */
    private async registerServerTools(serverName: string): Promise<void> {
        const MCPHiveServerDesc = await ListToolsProxy.exec(serverName)

        for (const toolDesc of MCPHiveServerDesc.tools) {
            const namespacedName = this.makeNamespacedName(
                serverName,
                toolDesc.name,
            )

            const unpackedArgs: Record<string, unknown> = {}
            for (const [k, v] of Object.entries(toolDesc.input_schema)) {
                unpackedArgs[k] = JSON.parse(v)
            }

            const toolArgs: z.ZodRawShape = ZodHelpers.inferZodRawShapeFromSpec(
                unpackedArgs,
                toolDesc.required_inputs,
            )

            Logger.debug(`Registering namespaced tool: ${namespacedName}`)

            // Capture toolName for the closure
            const toolName = toolDesc.name

            this.mcpServer.registerTool(
                namespacedName,
                {
                    title: namespacedName,
                    description: `[${serverName}] ${toolDesc.description}`,
                    inputSchema: toolArgs,
                },
                async (input: { [x: string]: unknown }) => {
                    const result =
                        await MCPHiveProxyRequest.sendMCPHiveRequest<McpResult>(
                            serverName,
                            METHOD_TOOLS_CALL,
                            toolName,
                            input,
                        )

                    const content = (result?.content || []).map((entry) =>
                        this.convertToSDKContent(entry),
                    )

                    return {
                        content,
                        isError: result?.isError,
                        structuredContent: result?.structuredContent as
                            | { [x: string]: unknown }
                            | undefined,
                    } as CallToolResult
                },
            )
        }
    }

    /**
     * Register resources from a specific server with namespaced names
     */
    private async registerServerResources(serverName: string): Promise<void> {
        try {
            const MCPHiveResourcesDesc =
                await ListResourcesProxy.exec(serverName)

            for (const resource of MCPHiveResourcesDesc.resources) {
                const namespacedName = this.makeNamespacedName(
                    serverName,
                    resource.name,
                )
                const namespacedUri = this.makeNamespacedName(
                    serverName,
                    resource.uri,
                )

                Logger.debug(
                    `Registering namespaced resource: ${namespacedName}`,
                )

                // Capture resource.uri for the closure
                const resourceUri = resource.uri

                this.mcpServer.registerResource(
                    namespacedName,
                    namespacedUri,
                    {
                        description: `[${serverName}] ${resource.description || ''}`,
                        mimeType: resource.mimeType,
                    },
                    async () => {
                        const result =
                            await MCPHiveProxyRequest.sendMCPHiveRequest<McpResult>(
                                serverName,
                                METHOD_RESOURCES_READ,
                                resourceUri,
                                {},
                            )

                        const contents = (result?.content || []).map(
                            (entry) => {
                                if (entry.type === 'blob') {
                                    return {
                                        uri: namespacedUri,
                                        blob: entry.text || '',
                                        mimeType: resource.mimeType,
                                    }
                                } else {
                                    return {
                                        uri: namespacedUri,
                                        text: entry.text || '',
                                        mimeType: resource.mimeType,
                                    }
                                }
                            },
                        )

                        return { contents } as ReadResourceResult
                    },
                )
            }
        } catch (error) {
            Logger.debug(
                `No resources for server ${serverName}: ${error instanceof Error ? error.message : String(error)}`,
            )
        }
    }

    /**
     * Register prompts from a specific server with namespaced names
     */
    private async registerServerPrompts(serverName: string): Promise<void> {
        try {
            const MCPHivePromptsDesc = await ListPromptsProxy.exec(serverName)

            for (const prompt of MCPHivePromptsDesc.prompts) {
                const namespacedName = this.makeNamespacedName(
                    serverName,
                    prompt.name,
                )

                Logger.debug(`Registering namespaced prompt: ${namespacedName}`)

                const argsSchema: z.ZodRawShape = {}
                if (prompt.arguments && prompt.arguments.length > 0) {
                    for (const arg of prompt.arguments) {
                        if (arg.required) {
                            argsSchema[arg.name] = z.string()
                        } else {
                            argsSchema[arg.name] = z.string().optional()
                        }
                    }
                }

                const promptConfig: {
                    description?: string
                    argsSchema?: z.ZodRawShape
                } = {}
                if (prompt.description) {
                    promptConfig.description = `[${serverName}] ${prompt.description}`
                }
                if (Object.keys(argsSchema).length > 0) {
                    promptConfig.argsSchema = argsSchema
                }

                // Capture prompt.name for the closure
                const promptName = prompt.name

                this.mcpServer.registerPrompt(
                    namespacedName,
                    promptConfig,
                    async (args: { [x: string]: unknown }) => {
                        const result =
                            await MCPHiveProxyRequest.sendMCPHiveRequest<McpResult>(
                                serverName,
                                METHOD_PROMPTS_GET,
                                promptName,
                                args,
                            )

                        const structuredData = result?.structuredContent as
                            | {
                                  description?: string
                                  messages?: GetPromptResult['messages']
                              }
                            | undefined

                        return {
                            description: structuredData?.description,
                            messages: structuredData?.messages || [],
                        } as GetPromptResult
                    },
                )
            }
        } catch (error) {
            Logger.debug(
                `No prompts for server ${serverName}: ${error instanceof Error ? error.message : String(error)}`,
            )
        }
    }

    /**
     * Initialize in proxy mode - proxy a single server
     */
    private async initializeProxyMode(serverName: string): Promise<void> {
        Logger.debug(`Initializing in Proxy mode for server: ${serverName}`)

        // collect and register tools
        const MCPHiveServerDesc = await ListToolsProxy.exec(serverName)
        const toolCount = MCPHiveServerDesc.tools.length
        for (let i = 0; i < toolCount; i++) {
            const toolDesc = MCPHiveServerDesc.tools[i]!
            const unpackedArgs: Record<string, unknown> = {}
            for (const [k, v] of Object.entries(toolDesc.input_schema)) {
                unpackedArgs[k] = JSON.parse(v)
            }

            // derive the Zod shape which describes the schema
            const toolArgs: z.ZodRawShape = ZodHelpers.inferZodRawShapeFromSpec(
                unpackedArgs,
                toolDesc.required_inputs,
            )
            Logger.debug(
                `registration of tool ${toolDesc.name} with schema ${JSON.stringify(toolArgs)}`,
            )

            // register this tool
            this.mcpServer.registerTool(
                toolDesc.name,
                {
                    title: toolDesc.name,
                    description: toolDesc.description,
                    inputSchema: toolArgs,
                },
                async (input: { [x: string]: unknown }, extra) => {
                    Logger.debug(
                        `tool ${toolDesc.name} invoked with input ${JSON.stringify(Object.entries(input))} extra ${JSON.stringify(Object.entries(extra))}`,
                    )

                    // submit the tool operation to MCPHive and collect the result
                    const result =
                        await MCPHiveProxyRequest.sendMCPHiveRequest<McpResult>(
                            serverName,
                            METHOD_TOOLS_CALL,
                            toolDesc.name,
                            input,
                        )

                    Logger.debug(
                        `tool ${toolDesc.name} returned with output ${JSON.stringify(result)}`,
                    )

                    // Convert McpResult to CallToolResult format
                    // McpResult.content contains McpResultContentEntry[] which may include
                    // text, image, audio, resource, resource_link types
                    const content = (result?.content || []).map((entry) =>
                        this.convertToSDKContent(entry),
                    )

                    const callToolResult: CallToolResult = {
                        content,
                        isError: result?.isError,
                        structuredContent: result?.structuredContent as
                            | { [x: string]: unknown }
                            | undefined,
                    }

                    return callToolResult
                },
            )
        }

        // collect and register resources
        try {
            const MCPHiveResourcesDesc =
                await ListResourcesProxy.exec(serverName)
            const resourceCount = MCPHiveResourcesDesc.resources.length
            Logger.debug(`Registering ${resourceCount} resources`)

            for (let i = 0; i < resourceCount; i++) {
                const resource = MCPHiveResourcesDesc.resources[i]!
                Logger.debug(
                    `Registering resource ${resource.name} with URI ${resource.uri}`,
                )

                // register this resource
                // SDK signature: registerResource(name, uri, config, callback)
                this.mcpServer.registerResource(
                    resource.name,
                    resource.uri,
                    {
                        description: resource.description,
                        mimeType: resource.mimeType,
                    },
                    async () => {
                        Logger.debug(`Reading resource ${resource.uri}`)

                        // submit the resource read operation to MCPHive and collect the result
                        const result =
                            await MCPHiveProxyRequest.sendMCPHiveRequest<McpResult>(
                                serverName,
                                METHOD_RESOURCES_READ,
                                resource.uri,
                                {},
                            )

                        Logger.debug(
                            `Resource ${resource.uri} returned with content ${JSON.stringify(result)}`,
                        )

                        // Convert McpResult to ReadResourceResult format
                        // McpResult.content is McpResultContentEntry[] with {type, text}
                        // ReadResourceResult.contents needs {uri, text} or {uri, blob}
                        const contents = (result?.content || []).map(
                            (entry) => {
                                if (entry.type === 'blob') {
                                    return {
                                        uri: resource.uri,
                                        blob: entry.text || '', // blob data is stored in text field
                                        mimeType: resource.mimeType,
                                    }
                                } else {
                                    return {
                                        uri: resource.uri,
                                        text: entry.text || '',
                                        mimeType: resource.mimeType,
                                    }
                                }
                            },
                        )

                        const readResult: ReadResourceResult = {
                            contents,
                        }

                        return readResult
                    },
                )
            }
        } catch (error) {
            Logger.error(
                `Failed to list/register resources: ${error instanceof Error ? error.message : String(error)}`,
            )
            // Continue execution - resources are optional
        }

        // collect and register prompts
        try {
            const MCPHivePromptsDesc = await ListPromptsProxy.exec(serverName)
            const promptCount = MCPHivePromptsDesc.prompts.length
            Logger.debug(`Registering ${promptCount} prompts`)

            for (let i = 0; i < promptCount; i++) {
                const prompt = MCPHivePromptsDesc.prompts[i]!
                Logger.debug(`Registering prompt ${prompt.name}`)

                // Build a Zod schema from the prompt's arguments
                // This is necessary because registerPrompt without argsSchema
                // doesn't pass arguments to the callback
                const argsSchema: z.ZodRawShape = {}
                if (prompt.arguments && prompt.arguments.length > 0) {
                    for (const arg of prompt.arguments) {
                        // All prompt arguments are strings in MCP protocol
                        if (arg.required) {
                            argsSchema[arg.name] = z.string()
                        } else {
                            argsSchema[arg.name] = z.string().optional()
                        }
                    }
                }

                // register this prompt with argsSchema so arguments are passed to callback
                const promptConfig: {
                    description?: string
                    argsSchema?: z.ZodRawShape
                } = {}
                if (prompt.description) {
                    promptConfig.description = prompt.description
                }
                if (Object.keys(argsSchema).length > 0) {
                    promptConfig.argsSchema = argsSchema
                }

                this.mcpServer.registerPrompt(
                    prompt.name,
                    promptConfig,
                    async (args: { [x: string]: unknown }) => {
                        Logger.debug(
                            `Getting prompt ${prompt.name} with args ${JSON.stringify(args)}`,
                        )

                        // submit the prompt get operation to MCPHive and collect the result
                        const result =
                            await MCPHiveProxyRequest.sendMCPHiveRequest<McpResult>(
                                serverName,
                                METHOD_PROMPTS_GET,
                                prompt.name,
                                args,
                            )

                        Logger.debug(
                            `Prompt ${prompt.name} returned with messages ${JSON.stringify(result)}`,
                        )

                        // Convert McpResult to GetPromptResult format
                        // The result should have structuredContent with the prompt data
                        const structuredData = result?.structuredContent as
                            | {
                                  description?: string
                                  messages?: GetPromptResult['messages']
                              }
                            | undefined

                        const getPromptResult: GetPromptResult = {
                            description: structuredData?.description,
                            messages: structuredData?.messages || [],
                        }

                        return getPromptResult
                    },
                )
            }
        } catch (error) {
            Logger.error(
                `Failed to list/register prompts: ${error instanceof Error ? error.message : String(error)}`,
            )
            // Continue execution - prompts are optional
        }
    }

    /**
     * Convert McpResultContentEntry to SDK content types
     * Maps our internal format to the MCP SDK's ContentBlockSchema types
     */
    private convertToSDKContent(
        entry: McpResultContentEntry,
    ):
        | TextContent
        | ImageContent
        | AudioContent
        | EmbeddedResource
        | ResourceLink {
        switch (entry.type) {
            case 'text':
                return {
                    type: 'text',
                    text: entry.text || '',
                } as TextContent

            case 'image':
                return {
                    type: 'image',
                    data: entry.data || '',
                    mimeType: entry.mimeType || 'application/octet-stream',
                } as ImageContent

            case 'audio':
                return {
                    type: 'audio',
                    data: entry.data || '',
                    mimeType: entry.mimeType || 'application/octet-stream',
                } as AudioContent

            case 'resource':
                // EmbeddedResource contains a nested resource with text or blob
                if (entry.resource?.blob) {
                    return {
                        type: 'resource',
                        resource: {
                            uri: entry.resource.uri,
                            blob: entry.resource.blob,
                            mimeType: entry.resource.mimeType,
                        },
                    } as EmbeddedResource
                } else {
                    return {
                        type: 'resource',
                        resource: {
                            uri: entry.resource?.uri || '',
                            text: entry.resource?.text || '',
                            mimeType: entry.resource?.mimeType,
                        },
                    } as EmbeddedResource
                }

            case 'resource_link':
                // ResourceLink extends Resource with type='resource_link'
                return {
                    type: 'resource_link',
                    uri: entry.uri || '',
                    name: entry.name || '',
                    description: entry.description,
                    mimeType: entry.mimeType,
                } as ResourceLink

            case 'blob':
                // Legacy blob type - convert to text (base64 data was stored in text field)
                return {
                    type: 'text',
                    text: entry.text || '',
                } as TextContent

            default: {
                // Fallback for unknown types - should not be reached with proper typing
                // Use type assertion to handle exhaustive switch on union type
                const unknownType = entry.type as string
                Logger.warn(`Unknown content entry type: ${unknownType}`)
                return {
                    type: 'text',
                    text: entry.text || JSON.stringify(entry),
                } as TextContent
            }
        }
    }

    /**
     * Start the proxy networking
     */
    public async run(): Promise<void> {
        const transport = new StdioServerTransport()
        await this.mcpServer.connect(transport)
    }
}

// Start the MCPHive Proxy
Utils.main(import.meta.filename, async () => {
    const args = Utils.proxyArgs()
    const mcpHiveProxy = MCPHiveProxy.getInstance()
    await mcpHiveProxy.initialize(
        args.server,
        args.local,
        args.credentials,
        args.verbose,
        args.gateway,
    )
    await mcpHiveProxy.run()
})
