import crypto from 'crypto'
import {
    USER_AGENT,
    MCPHIVE_SERVER,
    METHOD_TOOLS_CALL,
    MCPHIVE_TOOL_LIST_TOOLS,
    MCPHIVE_TOOL_LIST_RESOURCES,
    MCPHIVE_TOOL_LIST_PROMPTS,
} from '../../shared/constants.ts'
import { MCPHiveProxy } from '../mcpHiveProxy.ts'
import type { RequestBody, RequestArgs, McpResult } from '../../shared/types/request.ts'
import type { MCPHiveServerDesc } from '../../shared/types/serverDescriptor.ts'
import { isMCPHiveServerDesc } from '../../shared/types/serverDescriptor.ts'
import type { MCPHiveResourcesDesc } from '../../shared/types/resourceDescriptor.ts'
import { isMCPHiveResourcesDesc } from '../../shared/types/resourceDescriptor.ts'
import type { MCPHivePromptsDesc } from '../../shared/types/promptDescriptor.ts'
import { isMCPHivePromptsDesc } from '../../shared/types/promptDescriptor.ts'
import { Logger } from '../../shared/logger.ts'

/**
 * General tool for sending requests to MCP-HUB Server
 */
export class MCPHiveProxyRequest {
    /**
     * send one request to the MCP-HUB server
     *
     * @param mcpServer name of server we are proxy'ing
     * @param method which method is being called
     * @param toolName the tool being called
     * @param requestArgs the arguments supplied to the tool
     *
     * @returns result of the tool call
     */
    static async sendMCPHiveRequest<T>(
        mcpServer: string,
        method: string,
        toolName: string,
        requestArgs: RequestArgs,
    ): Promise<T | null> {
        // get the system config
        const mcpHiveProxyConfig = MCPHiveProxy.getInstance().config

        // call headers
        const headers = {
            'User-Agent': USER_AGENT,
            'Content-Type': 'application/json',
        }

        // request body, currently assuming that method is a tool call
        const body: RequestBody = {
            mcpServer,
            credentials: mcpHiveProxyConfig.credentials,
            request: {
                id: crypto.randomInt(1, 2 ** 48),
                method,
                params: {
                    name: toolName,
                    arguments: requestArgs,
                },
            },
        }

        try {
            // call the MCP HUB server using `fetch`
            const response = await fetch(mcpHiveProxyConfig.MCPHiveURL, {
                headers,
                body: JSON.stringify(body),
                method: 'POST',
            })
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }
            return (await response.json()) as T
        } catch (error) {
            if (error instanceof TypeError) {
                Logger.error(
                    `Failed to connect to MCP-HIVE Server.  Is it running?\nError message is ${error.message}`,
                )
                return null
            }
            Logger.error(
                `Fatal error making MCP-HIVE request. Error message is:\n${error as Error}`,
            )
            return null
        }
    }

    /**
     * Generic helper to list entities from MCP-HIVE
     */
    private static async listFromHive<T>(
        toolName: string,
        server: string,
        typeGuard: (obj: unknown) => obj is T,
    ): Promise<T> {
        const result = await MCPHiveProxyRequest.sendMCPHiveRequest<McpResult>(
            MCPHIVE_SERVER,
            METHOD_TOOLS_CALL,
            toolName,
            { server },
        )
        if (result && typeGuard(result.structuredContent)) {
            return result.structuredContent
        }
        throw new Error('Invalid response format from MCP-HIVE')
    }

    /**
     * List tools for a server
     */
    static listTools(server: string): Promise<MCPHiveServerDesc> {
        return MCPHiveProxyRequest.listFromHive(
            MCPHIVE_TOOL_LIST_TOOLS,
            server,
            isMCPHiveServerDesc,
        )
    }

    /**
     * List resources for a server
     */
    static listResources(server: string): Promise<MCPHiveResourcesDesc> {
        return MCPHiveProxyRequest.listFromHive(
            MCPHIVE_TOOL_LIST_RESOURCES,
            server,
            isMCPHiveResourcesDesc,
        )
    }

    /**
     * List prompts for a server
     */
    static listPrompts(server: string): Promise<MCPHivePromptsDesc> {
        return MCPHiveProxyRequest.listFromHive(
            MCPHIVE_TOOL_LIST_PROMPTS,
            server,
            isMCPHivePromptsDesc,
        )
    }
}
