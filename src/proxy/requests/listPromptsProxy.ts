import {
    MCPHIVE_SERVER,
    METHOD_TOOLS_CALL,
    MCPHIVE_TOOL_LIST_PROMPTS,
} from '../../shared/constants.ts'
import type { McpResult } from '../../shared/types/request.ts'
import type { MCPHivePromptsDesc } from '../../shared/types/promptDescriptor.ts'
import { isMCPHivePromptsDesc } from '../../shared/types/promptDescriptor.ts'
import { MCPHiveProxyRequest } from './mcpHiveProxyRequest.ts'

export class ListPromptsProxy {
    /**
     * Forward the ListPrompts meta-tool to the server. This helps fulfill a client-local
     * call to listPrompts.
     *
     * @param server the MCP server that is being proxy'd
     *
     * @returns a structure which contains listPrompts information, including a list of prompts
     * and their metadata
     */
    public static async exec(server: string): Promise<MCPHivePromptsDesc> {
        const result = await MCPHiveProxyRequest.sendMCPHiveRequest<McpResult>(
            MCPHIVE_SERVER,
            METHOD_TOOLS_CALL,
            MCPHIVE_TOOL_LIST_PROMPTS,
            { server },
        )
        if (result && isMCPHivePromptsDesc(result.structuredContent)) {
            return result.structuredContent
        } else {
            throw new Error('Invalid response format from MCP-HIVE')
        }
    }
}
