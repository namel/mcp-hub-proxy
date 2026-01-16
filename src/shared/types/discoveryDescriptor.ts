export interface DiscoveryToolStats {
    toolName: string
    stats: {
        calls: number
        latencyUsec: {
            avg: number
            p90: number
            p99: number
            p999: number
        }
        coverage: number
        errors: number
        accuracy: number
    }
    timestamp: string
}

export interface MCPServerDiscoveryResult {
    id: string
    name: string
    description: string
    categories: string[]
    tags: string[]
    pricePerCall: number
    toolCount: number
    toolStats: DiscoveryToolStats[]
}

export interface MCPHiveDiscoveryDesc {
    servers: MCPServerDiscoveryResult[]
    totalCount: number
}
