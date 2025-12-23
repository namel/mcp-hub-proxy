# MCP-Hive Proxy

This is the MCP-Hive Proxy. It can be loaded by any agentic host in order to access MCP-Hive and is a gateway to other MCP servers. To obtain credentials, and read further documentation, go to [mcp-hive.com](https://mcp-hive.com)

## Running

The proxy can run in two modes:

### Server Mode (Single MCP)

Proxy a specific MCP server to your MCP client:

```bash
node src/proxy/mcpHiveProxy.ts --server <server-name> --local --credentials <credentials>
```

### Gateway Mode (All MCPs)

Expose all available MCP servers through a single proxy with namespaced tools:

```bash
node src/proxy/mcpHiveProxy.ts --gateway --local --credentials <credentials>
```

In gateway mode:

- Discovery tools are available: `discoverServers`, `listTools`, `listResources`, `listPrompts`
- All server tools are namespaced: `serverName::toolName` (e.g., `validator::echo`, `accuweather::getWeather`)

### Proxy Flags

| Flag                 | Description                                         |
| -------------------- | --------------------------------------------------- |
| `--server <name>`    | Proxy a specific MCP server (omit for gateway mode) |
| `--gateway`          | Explicitly enable gateway mode                      |
| `--credentials <id>` | Consumer credentials for authentication             |
| `--verbose`          | Enable verbose logging                              |
