import { z } from 'zod'

type ZTypeDescriptor = {
    type: string
    description: string
    enum?: unknown[]
    properties?: { [k: string]: ZTypeDescriptor }
    // Array-related properties
    items?: ZTypeDescriptor
    minItems?: number
    maxItems?: number
    // Tuple-related properties
    prefixItems?: ZTypeDescriptor[]
    // Union/Intersection properties
    anyOf?: ZTypeDescriptor[]
    oneOf?: ZTypeDescriptor[]
    allOf?: ZTypeDescriptor[]
    // Nullable and literal properties
    nullable?: boolean
    const?: unknown
    // String validation constraints
    minLength?: number
    maxLength?: number
    pattern?: string
    format?: string
    // Number validation constraints
    minimum?: number
    maximum?: number
    exclusiveMinimum?: number
    exclusiveMaximum?: number
    // Object additional properties (for records)
    additionalProperties?: boolean | ZTypeDescriptor
}

/**
 * This class solves a problem in Typescript's MCP SDK. The SDK server implementation requires that
 * tool arguments schemas are described with Zod. However Zod schemas are not serializable, and cannot
 * be sent from the MCP-HIVE Server to the MCP-HIVE Proxy
 *    - Converting to JSONSchema, and serializing, and converting to Zod on the proxy does not work,
 *      as the SDK currently requires Zod 3.0, while JSONSchema conversion is implemented in Zod 4.0
 *    - Converting using public conversion packages does not work as they depend on minor version differences
 *    - Too bad the SDK didn't just use JSONSchema instead of Zod
 *    - Too bad Zod doesn't support serialization/deserialization
 *    - A complete conversion from JSONSchema reference [is implemented here](https://github.com/glideapps/zod-from-json-schema/blob/main/src/core/converter.ts)
 *
 * To work around this problem, this class provides a method to scan the output of tool descriptions
 * and build the corresponding Zod's ZodRawShape
 */
export class ZodHelpers {
    /**
     * Deep-scan a schema description as returned by the TS MCP client SDK to produce Zod shapes
     *
     * @param o the structure to scan
     *
     * @returns the corresponding Zod shape
     */
    static scanObject(o: ZTypeDescriptor): z.ZodTypeAny {
        // Handle const/literal values first (highest priority)
        if (o.const !== undefined) {
            return z
                .literal(o.const as string | number | boolean | null)
                .describe(o.description || '')
        }

        // Handle union types (anyOf/oneOf)
        if (o.anyOf && o.anyOf.length > 0) {
            const schemas = o.anyOf.map((schema) =>
                ZodHelpers.scanObject(schema),
            )
            // Zod requires at least 2 schemas for union
            if (schemas.length === 1) {
                return schemas[0]!
            }
            return z
                .union(
                    schemas as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]],
                )
                .describe(o.description || '')
        }

        if (o.oneOf && o.oneOf.length > 0) {
            const schemas = o.oneOf.map((schema) =>
                ZodHelpers.scanObject(schema),
            )
            if (schemas.length === 1) {
                return schemas[0]!
            }
            return z
                .union(
                    schemas as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]],
                )
                .describe(o.description || '')
        }

        // Handle intersection types (allOf)
        if (o.allOf && o.allOf.length > 0) {
            const schemas = o.allOf.map((schema) =>
                ZodHelpers.scanObject(schema),
            )
            // Start with first schema and intersect with rest
            let result = schemas[0]!
            for (let i = 1; i < schemas.length; i++) {
                result = z.intersection(result, schemas[i]!)
            }
            return result.describe(o.description || '')
        }

        // Handle null type
        if (o.type === 'null') {
            return z.null().describe(o.description || '')
        }

        if (o.type === 'object') {
            // Check if this is a record type (additionalProperties without properties)
            if (
                o.additionalProperties &&
                typeof o.additionalProperties === 'object' &&
                (!o.properties || Object.keys(o.properties).length === 0)
            ) {
                // This is a record type: Record<string, ValueType>
                const valueSchema = ZodHelpers.scanObject(
                    o.additionalProperties,
                )
                let recordSchema: z.ZodTypeAny = z.record(
                    z.string(),
                    valueSchema,
                )

                if (o.nullable) {
                    recordSchema = recordSchema.nullable()
                }

                return recordSchema
            }

            // Regular object with defined properties
            const shape: { [k: string]: z.ZodTypeAny } = {}
            for (const [k, v] of Object.entries(o.properties || {})) {
                shape[k] = ZodHelpers.scanObject(v)
            }

            let objectSchema: z.ZodTypeAny = z.object(shape)

            // Apply nullable if specified
            if (o.nullable) {
                objectSchema = objectSchema.nullable()
            }

            return objectSchema
        }

        if (o.type === 'array') {
            // Check if this is a tuple (has prefixItems)
            if (o.prefixItems && o.prefixItems.length > 0) {
                // Tuple type - fixed-length array with specific types at each position
                const tupleSchemas = o.prefixItems.map((item) =>
                    ZodHelpers.scanObject(item),
                )
                let tupleSchema: z.ZodTypeAny = z.tuple(
                    tupleSchemas as [z.ZodTypeAny, ...z.ZodTypeAny[]],
                )
                if (o.nullable) {
                    tupleSchema = tupleSchema.nullable()
                }
                return tupleSchema.describe(o.description || '')
            }

            // Regular array type
            const itemSchema = o.items
                ? ZodHelpers.scanObject(o.items)
                : z.unknown()
            let arraySchema = z.array(itemSchema)

            // Apply array constraints
            if (o.minItems !== undefined) {
                arraySchema = arraySchema.min(o.minItems)
            }
            if (o.maxItems !== undefined) {
                arraySchema = arraySchema.max(o.maxItems)
            }

            // Create a final schema that can be nullable
            let finalSchema: z.ZodTypeAny = arraySchema

            // Apply nullable
            if (o.nullable) {
                finalSchema = finalSchema.nullable()
            }

            return finalSchema.describe(o.description || '')
        }

        if (o.type === 'string') {
            if (o.enum) {
                let enumSchema: z.ZodTypeAny = z.enum(
                    o.enum as [string, ...string[]],
                )
                if (o.nullable) {
                    enumSchema = enumSchema.nullable()
                }
                return enumSchema.describe(o.description)
            }

            // Build string schema with constraints
            let stringSchema = z.string()

            // Apply length constraints
            if (o.minLength !== undefined) {
                stringSchema = stringSchema.min(o.minLength)
            }
            if (o.maxLength !== undefined) {
                stringSchema = stringSchema.max(o.maxLength)
            }

            // Apply pattern constraint
            if (o.pattern) {
                stringSchema = stringSchema.regex(new RegExp(o.pattern))
            }

            // Apply format constraint
            if (o.format) {
                switch (o.format) {
                    case 'email':
                        stringSchema = stringSchema.email()
                        break
                    case 'url':
                    case 'uri':
                        stringSchema = stringSchema.url()
                        break
                    case 'uuid':
                        stringSchema = stringSchema.uuid()
                        break
                    case 'date-time':
                    case 'datetime':
                        stringSchema = stringSchema.datetime()
                        break
                    case 'date':
                        stringSchema = stringSchema.date()
                        break
                    case 'time':
                        stringSchema = stringSchema.time()
                        break
                    case 'ipv4':
                        stringSchema = stringSchema.ip({ version: 'v4' })
                        break
                    case 'ipv6':
                        stringSchema = stringSchema.ip({ version: 'v6' })
                        break
                    case 'ip':
                        stringSchema = stringSchema.ip()
                        break
                    // For unsupported formats, we don't add validation
                    // This allows forward compatibility
                    default:
                        break
                }
            }

            // Convert to ZodTypeAny for nullable
            let finalSchema: z.ZodTypeAny = stringSchema

            if (o.nullable) {
                finalSchema = finalSchema.nullable()
            }

            return finalSchema.describe(o.description)
        }

        if (o.type === 'number' || o.type === 'integer') {
            // Handle both number and integer types
            let numSchema = o.type === 'integer' ? z.number().int() : z.number()

            // Apply minimum constraints
            if (o.minimum !== undefined) {
                numSchema = numSchema.gte(o.minimum)
            }
            if (o.exclusiveMinimum !== undefined) {
                numSchema = numSchema.gt(o.exclusiveMinimum)
            }

            // Apply maximum constraints
            if (o.maximum !== undefined) {
                numSchema = numSchema.lte(o.maximum)
            }
            if (o.exclusiveMaximum !== undefined) {
                numSchema = numSchema.lt(o.exclusiveMaximum)
            }

            // Convert to ZodTypeAny for nullable
            let finalSchema: z.ZodTypeAny = numSchema

            if (o.nullable) {
                finalSchema = finalSchema.nullable()
            }

            return finalSchema.describe(o.description)
        }

        if (o.type === 'boolean') {
            let boolSchema: z.ZodTypeAny = z.boolean()
            if (o.nullable) {
                boolSchema = boolSchema.nullable()
            }
            return boolSchema.describe(o.description)
        }

        return z.unknown()
    }

    /**
     * Scan a schema description as returned by the TS MCP client SDK to produce Zod shapes.
     * The final expected structure is a ZodRawShape, which can be represented as Records
     *
     * @param spec the structure to scan
     * @param required_inputs specific list of attributes which are required. If none are provided
     *        then all attributes are considered to be required
     *
     * @returns the corresponding Zod ZodRawShape
     */
    public static inferZodRawShapeFromSpec(
        spec: object,
        required_inputs: string[],
    ): Record<string, z.ZodTypeAny> {
        const shape: Record<string, z.ZodTypeAny> = {}
        for (const [k, v] of Object.entries(spec)) {
            // start the deep traversal of the descriptor
            let zodType = ZodHelpers.scanObject(v as ZTypeDescriptor)

            // this attribute might be optional
            if (!(k in required_inputs)) {
                zodType = zodType.optional()
            }

            shape[k] = zodType
        }
        return shape
    }
}
