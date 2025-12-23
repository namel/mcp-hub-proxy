import {
    MCPHIVE_SERVER,
    METHOD_TOOLS_CALL,
    MCPHIVE_TOOL_LIST_TOOLS,
} from '../../shared/constants.ts'
import type { McpResult } from '../../shared/types/request.ts'
import type { MCPHiveServerDesc } from '../../shared/types/serverDescriptor.ts'
import { isMCPHiveServerDesc } from '../../shared/types/serverDescriptor.ts'
import { MCPHiveProxyRequest } from './mcpHiveProxyRequest.ts'

export class ListToolsProxy {
    /**
     * Forward the ListTools meta-tool to the server. This helps fullfill a client-local
     * call to listTools.
     *
     * @param server the MCP server that is being proxy'd
     *
     * @returns a structure which contains listTools information, including a list of tools and
     * their schema
     */
    public static async exec(server: string): Promise<MCPHiveServerDesc> {
        const result = await MCPHiveProxyRequest.sendMCPHiveRequest<McpResult>(
            MCPHIVE_SERVER,
            METHOD_TOOLS_CALL,
            MCPHIVE_TOOL_LIST_TOOLS,
            { server },
        )
        if (result && isMCPHiveServerDesc(result.structuredContent)) {
            return result.structuredContent
        } else {
            throw new Error('Invalid response format from MCP-HIVE')
        }
    }
}
