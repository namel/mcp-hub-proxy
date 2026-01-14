import { parseArgs } from 'util'

interface ProxyArgs {
    server: string | undefined
    gateway: boolean
    local: boolean
    credentials: string
    verbose: boolean
}

export class Utils {
    // command line argument parser for proxy side
    static proxyArgs(): ProxyArgs {
        const { values, positionals: _positionals } = parseArgs({
            args: process.argv.slice(2),
            options: {
                // name of the MCP server to proxy to (omit for gateway mode)
                server: {
                    type: 'string',
                    multiple: false,
                },

                // gateway mode: expose all servers with namespaced tools
                gateway: {
                    type: 'boolean',
                    multiple: false,
                    default: false,
                },

                // connect to a local MCP server
                local: {
                    type: 'boolean',
                    multiple: false,
                    default: false,
                },

                // credentials
                credentials: {
                    type: 'string',
                    multiple: false,
                    default: '',
                },

                // verbose
                verbose: {
                    type: 'boolean',
                    multiple: false,
                    default: false,
                },
            },
            strict: true,
            allowPositionals: false,
        })

        // Gateway mode if --gateway flag is set OR --server is not provided
        const gateway = values.gateway || !values.server

        return {
            server: values.server,
            gateway,
            local: values.local ?? false,
            credentials: values.credentials ?? '',
            verbose: values.verbose ?? false,
        }
    }

    // execute the provided callback as the main function, but only
    // if the script was called explicitly as the main script.
    //
    // This allows modules to act both as main scripts and as non-main scripts,
    // e.g. to become importable by others. The main is called only when it was intended.
    //
    // moduleName: the name of the module that was the entry point
    // binName: useful in npx execution, where the argv contains the key of
    // the "bin" entry in the package's package.json
    static main(
        moduleName: string,
        binName: string | null,
        f: () => Promise<void>,
    ): void {
        const moduleScript = moduleName.split('/').pop()!
        const module = moduleScript.split('.')[0]!
        if (
            process.argv.some(
                (arg) =>
                    arg.includes(module) || (binName && arg.includes(binName)),
            )
        ) {
            void f().catch((error) => {
                console.error('Fatal error in main():', error)
                process.exit(1)
            })
        }
    }
}
