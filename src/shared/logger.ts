import winston from 'winston'

const { combine, timestamp, label, printf } = winston.format

export class Logger {
    private static logger: winston.Logger

    public constructor(loggerName: string) {
        const mcpHiveFormat = printf((info) => {
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            return `${info.timestamp} [${info.label}] ${info.level}: ${info.message}`
        })

        Logger.logger = winston.createLogger({
            level: 'debug',
            format: combine(
                label({ label: loggerName }),
                timestamp(),
                mcpHiveFormat,
            ),
            // use default Meta to indicate demo mode
            // defaultMeta: { service: 'user-service' },
            transports: [
                new winston.transports.File({ 
                    filename: 'server.log' 
                }),
            ],
        })
    }

    public static debug(msg: string) {
        Logger.logger.debug(msg)
    }
    public static warn(msg: string) {
        Logger.logger.warn(msg)
    }
    public static error(msg: string) {
        Logger.logger.error(msg)
    }
}
