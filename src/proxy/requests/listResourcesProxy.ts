import {
    MCPHIVE_SERVER,
    METHOD_TOOLS_CALL,
    MCPHIVE_TOOL_LIST_RESOURCES,
} from '../../shared/constants.ts'
import type { McpResult } from '../../shared/types/request.ts'
import type { MCPHiveResourcesDesc } from '../../shared/types/resourceDescriptor.ts'
import { isMCPHiveResourcesDesc } from '../../shared/types/resourceDescriptor.ts'
import { MCPHiveProxyRequest } from './mcpHiveProxyRequest.ts'

export class ListResourcesProxy {
    /**
     * Forward the ListResources meta-tool to the server. This helps fulfill a client-local
     * call to listResources.
     *
     * @param server the MCP server that is being proxy'd
     *
     * @returns a structure which contains listResources information, including a list of resources
     * and their metadata
     */
    public static async exec(server: string): Promise<MCPHiveResourcesDesc> {
        const result = await MCPHiveProxyRequest.sendMCPHiveRequest<McpResult>(
            MCPHIVE_SERVER,
            METHOD_TOOLS_CALL,
            MCPHIVE_TOOL_LIST_RESOURCES,
            { server },
        )
        if (result && isMCPHiveResourcesDesc(result.structuredContent)) {
            return result.structuredContent
        } else {
            throw new Error('Invalid response format from MCP-HIVE')
        }
    }
}
