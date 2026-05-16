System.register("config", [], function (exports_1, context_1) {
    "use strict";
    var DEPRECATED_VARS;
    var __moduleName = context_1 && context_1.id;
    /**
     * Parse and validate environment variables.
     *
     * Required:
     * - `DEDALO_WORK_API_URL`     base Dédalo URL.
     * - `DEDALO_WORK_USERNAME`    Dédalo user name.
     * - `DEDALO_WORK_PASSWORD`    Dédalo password.
     *
     * Optional:
     * - `LOG_LEVEL`               pino level (default `info`).
     * - `RATE_LIMIT_CAPACITY`     token-bucket size (default `0` = disabled).
     * - `RATE_LIMIT_REFILL_MS`    refill ms (default `60000`).
     * - `DEDALO_MCP_HTTP_PORT`    HTTP transport port (default `3001`).
     * - `DEDALO_MCP_HTTP_HOST`    HTTP transport bind host (default `127.0.0.1`).
     * - `DEDALO_MCP_ALLOWED_ORIGINS` comma-separated CORS allowlist (empty by default).
     */
    function loadConfig(env, logger) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        for (const v of DEPRECATED_VARS) {
            if (env[v] !== undefined) {
                logger.warn({ var: v }, 'Deprecated env var ignored. Authorisation is now delegated to the Dédalo user profile; configure DEDALO_WORK_USERNAME and DEDALO_WORK_PASSWORD to a user with the appropriate profile.');
            }
        }
        const apiUrl = (_a = env.DEDALO_WORK_API_URL) !== null && _a !== void 0 ? _a : '';
        const username = (_b = env.DEDALO_WORK_USERNAME) !== null && _b !== void 0 ? _b : '';
        const password = (_c = env.DEDALO_WORK_PASSWORD) !== null && _c !== void 0 ? _c : '';
        const missing = [];
        if (!apiUrl)
            missing.push('DEDALO_WORK_API_URL');
        if (!username)
            missing.push('DEDALO_WORK_USERNAME');
        if (!password)
            missing.push('DEDALO_WORK_PASSWORD');
        if (missing.length > 0) {
            throw new Error(`Missing required env vars: ${missing.join(', ')}. The work MCP authenticates as a Dédalo user; set both username and password.`);
        }
        const capacity = parseInt((_d = env.RATE_LIMIT_CAPACITY) !== null && _d !== void 0 ? _d : '0', 10);
        const refillRateMs = parseInt((_e = env.RATE_LIMIT_REFILL_MS) !== null && _e !== void 0 ? _e : '60000', 10);
        const port = parseInt((_f = env.DEDALO_MCP_HTTP_PORT) !== null && _f !== void 0 ? _f : '3001', 10);
        const host = (_g = env.DEDALO_MCP_HTTP_HOST) !== null && _g !== void 0 ? _g : '127.0.0.1';
        const allowedOrigins = ((_h = env.DEDALO_MCP_ALLOWED_ORIGINS) !== null && _h !== void 0 ? _h : '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        return {
            apiUrl,
            username,
            password,
            logLevel: (_j = env.LOG_LEVEL) !== null && _j !== void 0 ? _j : 'info',
            rateLimit: capacity > 0 ? { capacity, refillRateMs } : null,
            http: { port, host, allowedOrigins },
        };
    }
    exports_1("loadConfig", loadConfig);
    return {
        setters: [],
        execute: function () {
            DEPRECATED_VARS = [
                'DEDALO_MCP_TOKEN',
                'DEDALO_WORK_READ_ONLY',
                'DEDALO_WORK_WRITE',
                'DEDALO_WORK_ADMIN',
            ];
        }
    };
});
System.register("tools/_shared/output", [], function (exports_2, context_2) {
    "use strict";
    var __moduleName = context_2 && context_2.id;
    /**
     * Build a normalised pagination block from a Dédalo response when
     * `full_count: true` was requested, or infer minimal metadata from the
     * returned array length.
     */
    function buildPagination(raw, offset, limit) {
        const total = typeof raw.total === 'number' ? raw.total : null;
        const data = raw.data;
        const count = Array.isArray(data) ? data.length : 0;
        const has_more = total !== null ? offset + count < total : count === limit;
        return {
            total,
            offset,
            count,
            has_more,
            next_offset: has_more ? offset + count : null,
        };
    }
    exports_2("buildPagination", buildPagination);
    return {
        setters: [],
        execute: function () {
        }
    };
});
System.register("tools/_shared/errors", ["@dedalo/mcp-common"], function (exports_3, context_3) {
    "use strict";
    var mcp_common_1;
    var __moduleName = context_3 && context_3.id;
    /**
     * Map a Dédalo error code to an actionable hint for the MCP client / LLM.
     */
    function hintFor(code) {
        switch (code) {
            case 'permissions_denied':
                return 'The logged Dédalo user does not have permission for this action. Switch to a user whose profile grants it, or ask an administrator to adjust the profile.';
            case 'not_logged':
                return 'The MCP session expired. It should auto-recover on the next call; if it persists, verify DEDALO_WORK_USERNAME and DEDALO_WORK_PASSWORD.';
            case 'csrf_failed':
                return 'CSRF token rejected. Retry the call; the client will fetch a fresh token automatically.';
            case 'invalid_action':
            case 'invalid_api_class':
                return 'The requested action is not exposed on this Dédalo instance. Discover valid actions with `dedalo_get_environment` and `dedalo_get_ontology_info`.';
            case 'login_failed':
                return 'Check DEDALO_WORK_USERNAME and DEDALO_WORK_PASSWORD. The user must exist in Dédalo and be allowed to log in.';
            case 'maintenance_mode':
                return 'Dédalo is in maintenance mode. Wait until the administrator exits maintenance mode.';
            case 'update_lock':
                return 'The record is locked by another session. Wait and retry, or use `dedalo_update_lock_state` to release the lock if you own it.';
            case 'db_connection_failed':
                return 'The Dédalo server could not reach its database. This is a server-side issue; check DB logs.';
            case 'network_error':
                return 'Could not reach the Dédalo server. Verify DEDALO_WORK_API_URL is correct and the server is running.';
            case 'invalid_request':
                return 'The request shape was rejected by Dédalo. Review the input against the tool schema.';
            default:
                return undefined;
        }
    }
    /**
     * Wrap any thrown value into a structured error payload for MCP tool output.
     */
    function wrapError(err) {
        if (err instanceof mcp_common_1.DedaloError) {
            const out = {
                ok: false,
                error: {
                    code: err.code,
                    message: err.message,
                },
            };
            const hint = hintFor(err.code);
            if (hint)
                out.error.hint = hint;
            return out;
        }
        const message = err instanceof Error ? err.message : String(err);
        return {
            ok: false,
            error: {
                code: 'unknown',
                message,
            },
        };
    }
    exports_3("wrapError", wrapError);
    return {
        setters: [
            function (mcp_common_1_1) {
                mcp_common_1 = mcp_common_1_1;
            }
        ],
        execute: function () {
        }
    };
});
System.register("tools/_shared/register", ["zod", "tools/_shared/errors"], function (exports_4, context_4) {
    "use strict";
    var zod_1, errors_js_1, StructuredOutputSchema;
    var __moduleName = context_4 && context_4.id;
    /**
     * Register a typed tool on the McpServer.
     *
     * - Inputs are validated via Zod before the handler runs.
     * - Rate-limiter keyed by MCP session id when available; fallback bucket
     *   `'default'` otherwise.
     * - Responses always wrapped as `{ ok: true, data, [pagination] }` on
     *   success or `{ ok: false, error: { code, message, hint? } }` on
     *   failure, emitted both as text content and as `structuredContent`.
     */
    function registerTool(server, def, ctx) {
        const { name, description, annotations, inputSchema, handler } = def;
        const cb = async (rawArgs, extra) => {
            var _a;
            if (ctx.limiter) {
                const key = (_a = extra.sessionId) !== null && _a !== void 0 ? _a : 'default';
                const r = ctx.limiter.consume(key);
                if (!r.allowed) {
                    const err = {
                        ok: false,
                        error: {
                            code: 'rate_limited',
                            message: `Rate limit exceeded; retry in ${r.retryAfterMs} ms`,
                            hint: 'Slow down tool calls or raise RATE_LIMIT_CAPACITY.',
                        },
                    };
                    return {
                        isError: true,
                        content: [{ type: 'text', text: JSON.stringify(err) }],
                        structuredContent: err,
                    };
                }
            }
            const parsed = inputSchema.safeParse(rawArgs !== null && rawArgs !== void 0 ? rawArgs : {});
            if (!parsed.success) {
                const err = {
                    ok: false,
                    error: {
                        code: 'invalid_request',
                        message: 'Input validation failed: ' +
                            parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
                        hint: 'Review the tool input schema and retry with a corrected argument set.',
                    },
                };
                return {
                    isError: true,
                    content: [{ type: 'text', text: JSON.stringify(err) }],
                    structuredContent: err,
                };
            }
            const started = Date.now();
            try {
                const data = await handler(parsed.data, ctx);
                const latency = Date.now() - started;
                ctx.logger.info({ tool: name, latency }, 'tool_call_ok');
                const structured = typeof data === 'object' && data !== null && 'ok' in data
                    ? data
                    : { ok: true, data: data };
                return {
                    content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
                    structuredContent: structured,
                };
            }
            catch (err) {
                const latency = Date.now() - started;
                const wrapped = errors_js_1.wrapError(err);
                ctx.logger.error({ tool: name, latency, err: wrapped.error }, 'tool_call_err');
                return {
                    isError: true,
                    content: [{ type: 'text', text: JSON.stringify(wrapped, null, 2) }],
                    structuredContent: wrapped,
                };
            }
        };
        // Cast to `any` because the SDK pins its own vendored $ZodType version
        // which may lag behind the workspace zod version; identical at runtime.
        server.registerTool(name, {
            description,
            inputSchema: inputSchema,
            outputSchema: StructuredOutputSchema,
            annotations,
        }, 
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cb);
    }
    exports_4("registerTool", registerTool);
    return {
        setters: [
            function (zod_1_1) {
                zod_1 = zod_1_1;
            },
            function (errors_js_1_1) {
                errors_js_1 = errors_js_1_1;
            }
        ],
        execute: function () {
            /**
             * Generic output schema declared on every tool so the SDK accepts
             * `structuredContent` in the response. The payload itself is permissive
             * because each tool defines its own `data` shape.
             */
            StructuredOutputSchema = zod_1.z.object({
                ok: zod_1.z.boolean(),
                data: zod_1.z.unknown().optional(),
                pagination: zod_1.z.unknown().optional(),
                error: zod_1.z.unknown().optional(),
            });
        }
    };
});
System.register("tools/_shared/rqo", [], function (exports_5, context_5) {
    "use strict";
    var __moduleName = context_5 && context_5.id;
    /**
     * RQO factory for work-API calls.
     *
     * Why: every tool handler builds the same envelope shape. Centralising it
     * keeps `prevent_lock` semantics explicit and removes boilerplate from
     * each tool.
     *
     * @param opts  Options object with action, dd_api, source, sqo, options, prevent_lock.
     */
    function rqo(opts) {
        var _a, _b;
        const r = {
            action: opts.action,
            dd_api: (_a = opts.dd_api) !== null && _a !== void 0 ? _a : 'dd_core_api',
            prevent_lock: (_b = opts.prevent_lock) !== null && _b !== void 0 ? _b : true,
        };
        if (opts.source && Object.keys(opts.source).length > 0)
            r.source = opts.source;
        if (opts.sqo)
            r.sqo = opts.sqo;
        if (opts.options && Object.keys(opts.options).length > 0)
            r.options = opts.options;
        return r;
    }
    exports_5("rqo", rqo);
    return {
        setters: [],
        execute: function () {
        }
    };
});
System.register("tools/_shared/schemas", ["zod", "@dedalo/mcp-common"], function (exports_6, context_6) {
    "use strict";
    var zod_2, TipoSchema, LangSchema, OptionalLangSchema, SectionIdSchema, LocatorSchema, PaginationSchema, OrderClauseSchema, ModeSchema;
    var __moduleName = context_6 && context_6.id;
    return {
        setters: [
            function (zod_2_1) {
                zod_2 = zod_2_1;
            },
            function (mcp_common_2_1) {
                exports_6({
                    "FilterSchema": mcp_common_2_1["FilterSchema"],
                    "FilterRuleSchema": mcp_common_2_1["FilterRuleSchema"]
                });
            }
        ],
        execute: function () {
            /**
             * SCHEMAS
             * Reusable Zod primitives for Dédalo work-API tool input schemas.
             *
             * Why: consistent types across every tool make inputs predictable for
             * the LLM, prevent silent stringification bugs, and give the MCP client
             * a coherent vocabulary to learn.
             */
            /** Ontology tipo identifier. Short alphanumeric code like `oh1`, `dd1324`, `rsc167`. */
            exports_6("TipoSchema", TipoSchema = zod_2.z
                .string()
                .min(1)
                .regex(/^[a-zA-Z0-9_]+$/, 'tipo must match [a-zA-Z0-9_]+')
                .describe('Ontology tipo identifier (e.g. `oh1`, `dd1324`). Discover via `dedalo_list_sections` or `dedalo_get_ontology_info`.'));
            /** Dédalo language code. `lg-eng`, `lg-spa`, `lg-nolan` (no-language), etc. */
            exports_6("LangSchema", LangSchema = zod_2.z
                .string()
                .regex(/^lg-[a-z]{2,8}$/, 'lang must match `lg-xxx`')
                .describe('Dédalo language code (e.g. `lg-eng`, `lg-spa`, `lg-nolan`).'));
            /** Optional language, empty defaults to server's DEDALO_DATA_LANG. */
            exports_6("OptionalLangSchema", OptionalLangSchema = LangSchema.optional());
            /** Record identifier. Accepts string or number; always sent as string. */
            exports_6("SectionIdSchema", SectionIdSchema = zod_2.z
                .union([zod_2.z.string().min(1), zod_2.z.number().int().positive()])
                .transform((v) => String(v))
                .describe('Record identifier (section_id) within a section_tipo.'));
            /** Universal record pointer used for portals, indexation, and cross-refs. */
            exports_6("LocatorSchema", LocatorSchema = zod_2.z.object({
                section_tipo: TipoSchema,
                section_id: SectionIdSchema,
                component_tipo: TipoSchema.optional(),
                tag_id: zod_2.z.string().optional(),
                type: zod_2.z.string().optional(),
                from_section_tipo: TipoSchema.optional(),
                from_section_id: SectionIdSchema.optional(),
            }).describe('Universal Dédalo locator { section_tipo, section_id, ... }.'));
            /** Common pagination block for list/search tools. */
            exports_6("PaginationSchema", PaginationSchema = zod_2.z.object({
                limit: zod_2.z.number().int().min(1).max(500).default(50).describe('Maximum records to return (1..500).'),
                offset: zod_2.z.number().int().min(0).default(0).describe('Records to skip before returning results.'),
                full_count: zod_2.z.boolean().default(false).describe('If true, include the total matching-rows count ignoring limit/offset.'),
            }));
            /** Order clause: `{ path, direction }`. */
            exports_6("OrderClauseSchema", OrderClauseSchema = zod_2.z.object({
                path: zod_2.z.string().describe('Component tipo to sort by.'),
                direction: zod_2.z.enum(['ASC', 'DESC']).default('ASC'),
            }));
            /** UI mode passed to context-building actions. */
            exports_6("ModeSchema", ModeSchema = zod_2.z.enum(['edit', 'list', 'search', 'tm', 'portal', 'tool']));
        }
    };
});
System.register("tools/discovery", ["zod", "tools/_shared/register", "tools/_shared/rqo", "tools/_shared/schemas"], function (exports_7, context_7) {
    "use strict";
    var zod_3, register_js_1, rqo_js_1, schemas_js_1;
    var __moduleName = context_7 && context_7.id;
    /**
     * Discovery tools — read-only ontology and context introspection.
     */
    function registerDiscoveryTools(server, client, ctx) {
        register_js_1.registerTool(server, {
            name: 'dedalo_get_environment',
            description: 'Get Dédalo server environment: version, languages, install status, logged user info. Safe pre-auth call. Use this first to verify connectivity.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Get environment' },
            inputSchema: zod_3.z.object({}),
            handler: async () => client.call(rqo_js_1.rqo({ action: 'get_environment' })),
        }, ctx);
        register_js_1.registerTool(server, {
            name: 'dedalo_list_sections',
            description: 'List all section tipos defined in the ontology. Returns labels, models and configuration. Use this to discover what record types exist.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'List sections' },
            inputSchema: zod_3.z.object({ lang: schemas_js_1.OptionalLangSchema }),
            handler: async ({ lang }) => client.call(rqo_js_1.rqo({ action: 'get_ontology_info', source: { model: 'section', lang } })),
        }, ctx);
        register_js_1.registerTool(server, {
            name: 'dedalo_get_ontology_info',
            description: 'Query ontology metadata for a specific tipo or model. Returns structure, relationships and configuration. Provide `tipo` for a specific element or `model` to query all elements of that model.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Get ontology info' },
            inputSchema: zod_3.z.object({
                tipo: schemas_js_1.TipoSchema.optional().describe('Specific tipo to query.'),
                model: zod_3.z.string().optional().describe('Model name (e.g. `section`, `component_text_area`, `component_portal`).'),
                lang: schemas_js_1.OptionalLangSchema,
            }),
            handler: async (a) => client.call(rqo_js_1.rqo({ action: 'get_ontology_info', source: a })),
        }, ctx);
        register_js_1.registerTool(server, {
            name: 'dedalo_get_section_elements_context',
            description: 'Get the context for all components within a section_tipo. Returns the complete element list with types, labels and configuration.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Get section elements context' },
            inputSchema: zod_3.z.object({
                section_tipo: schemas_js_1.TipoSchema,
                lang: schemas_js_1.OptionalLangSchema,
                mode: schemas_js_1.ModeSchema.default('edit'),
            }),
            handler: async ({ section_tipo, lang, mode }) => client.call(rqo_js_1.rqo({ action: 'get_section_elements_context', source: { tipo: section_tipo, section_tipo, lang, mode } })),
        }, ctx);
        register_js_1.registerTool(server, {
            name: 'dedalo_get_element_context',
            description: 'Get UI context for a specific element (component or section). Returns structure, permissions, labels and metadata.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Get element context' },
            inputSchema: zod_3.z.object({
                tipo: schemas_js_1.TipoSchema,
                section_tipo: schemas_js_1.TipoSchema.optional().describe('Parent section tipo. Defaults to `tipo` for self-section lookups.'),
                lang: schemas_js_1.OptionalLangSchema,
                mode: schemas_js_1.ModeSchema.default('edit'),
            }),
            handler: async ({ tipo, section_tipo, lang, mode }) => client.call(rqo_js_1.rqo({ action: 'get_element_context', source: { tipo, section_tipo: section_tipo !== null && section_tipo !== void 0 ? section_tipo : tipo, lang, mode } })),
        }, ctx);
        register_js_1.registerTool(server, {
            name: 'dedalo_get_thesaurus_tree',
            description: 'Get the hierarchical tree for a thesaurus tipo. Returns all terms with parent-child relationships.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Get thesaurus tree' },
            inputSchema: zod_3.z.object({ tipo: schemas_js_1.TipoSchema, lang: schemas_js_1.OptionalLangSchema }),
            handler: async ({ tipo, lang }) => client.call(rqo_js_1.rqo({ action: 'get_ontology_info', source: { tipo, lang } })),
        }, ctx);
        register_js_1.registerTool(server, {
            name: 'dedalo_start',
            description: 'Bootstrap the Dédalo application context. Returns the start page (menu + initial section) for the current user. Useful as a first call when discovering what is available to the configured user.',
            annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true, title: 'Application start' },
            inputSchema: zod_3.z.object({
                tipo: schemas_js_1.TipoSchema.optional(),
                mode: schemas_js_1.ModeSchema.optional(),
                lang: schemas_js_1.OptionalLangSchema,
            }),
            handler: async (a) => client.call(rqo_js_1.rqo({ action: 'start', source: a })),
        }, ctx);
    }
    exports_7("registerDiscoveryTools", registerDiscoveryTools);
    return {
        setters: [
            function (zod_3_1) {
                zod_3 = zod_3_1;
            },
            function (register_js_1_1) {
                register_js_1 = register_js_1_1;
            },
            function (rqo_js_1_1) {
                rqo_js_1 = rqo_js_1_1;
            },
            function (schemas_js_1_1) {
                schemas_js_1 = schemas_js_1_1;
            }
        ],
        execute: function () {
        }
    };
});
System.register("tools/records_read", ["zod", "@dedalo/mcp-common", "tools/_shared/register", "tools/_shared/rqo", "tools/_shared/schemas", "tools/_shared/output"], function (exports_8, context_8) {
    "use strict";
    var zod_4, mcp_common_3, register_js_2, rqo_js_2, schemas_js_2, output_js_1;
    var __moduleName = context_8 && context_8.id;
    /**
     * Read-only record tools (search, read, count, indexation).
     *
     * Authorisation: Dédalo enforces per-section and per-tipo permissions
     * server-side. Records the logged user cannot see are silently filtered;
     * unauthorised actions return `permissions_denied`.
     */
    function registerRecordsReadTools(server, client, ctx) {
        register_js_2.registerTool(server, {
            name: 'dedalo_read_record',
            description: 'Read a single record by `section_tipo` + `section_id`. Returns the full record with components rendered for the requested mode.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Read record' },
            inputSchema: zod_4.z.object({
                section_tipo: schemas_js_2.TipoSchema,
                section_id: schemas_js_2.SectionIdSchema,
                lang: schemas_js_2.OptionalLangSchema,
                mode: zod_4.z.enum(['edit', 'list']).default('edit'),
            }),
            handler: async ({ section_tipo, section_id, lang, mode }) => {
                const sqo = new mcp_common_3.SqoBuilder(section_tipo)
                    .limit(1)
                    .filterByLocators([{ section_tipo, section_id }])
                    .build();
                return client.call(rqo_js_2.rqo({ action: 'read', source: { model: 'section', tipo: section_tipo, section_tipo, mode, lang }, sqo }));
            },
        }, ctx);
        register_js_2.registerTool(server, {
            name: 'dedalo_search_records',
            description: 'Search records using the SQO (Search Query Object) DSL. Supports pagination, AND/OR filter trees, ordering, and full-count totals. Provide either `filter` (typed) or `raw_sqo` (escape hatch).\n\nExample filter:\n```json\n{ "operator": "AND", "rules": [ { "path": "oh14", "operator": "contains", "value": "Picasso" } ] }\n```',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Search records' },
            inputSchema: zod_4.z.object({
                section_tipo: zod_4.z.union([schemas_js_2.TipoSchema, zod_4.z.array(schemas_js_2.TipoSchema).min(1)]).describe('Single section_tipo or array for cross-section search.'),
                lang: schemas_js_2.OptionalLangSchema,
                limit: schemas_js_2.PaginationSchema.shape.limit,
                offset: schemas_js_2.PaginationSchema.shape.offset,
                full_count: schemas_js_2.PaginationSchema.shape.full_count,
                filter: schemas_js_2.FilterSchema.optional().describe('Typed AND/OR filter tree.'),
                order: zod_4.z.array(schemas_js_2.OrderClauseSchema).optional().describe('Sort clauses applied in array order.'),
                raw_sqo: zod_4.z.record(zod_4.z.string(), zod_4.z.unknown()).optional().describe('Escape hatch: raw SQO object that overrides all other fields when present.'),
            }),
            handler: async ({ section_tipo, lang, limit, offset, full_count, filter, order, raw_sqo }) => {
                const built = (() => {
                    var _a;
                    if (raw_sqo)
                        return raw_sqo;
                    const b = new mcp_common_3.SqoBuilder(section_tipo);
                    b.limit(limit).offset(offset);
                    if (filter) {
                        b.filter(((_a = filter.operator) !== null && _a !== void 0 ? _a : 'AND'), filter.rules);
                    }
                    if (order)
                        for (const o of order)
                            b.order(o.path, o.direction);
                    if (full_count)
                        b.fullCount(true);
                    return b.build();
                })();
                const primarySection = Array.isArray(section_tipo) ? section_tipo[0] : section_tipo;
                const res = await client.call(rqo_js_2.rqo({ action: 'read', source: { model: 'section', section_tipo: primarySection, lang }, sqo: built }));
                return { ok: true, data: res, pagination: output_js_1.buildPagination(res, offset, limit) };
            },
        }, ctx);
        register_js_2.registerTool(server, {
            name: 'dedalo_read_raw',
            description: 'Read raw JSONB data for records without component rendering. Faster than `dedalo_read_record` when only stored values are needed.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Read raw' },
            inputSchema: zod_4.z.object({
                section_tipo: schemas_js_2.TipoSchema,
                lang: schemas_js_2.OptionalLangSchema,
                limit: schemas_js_2.PaginationSchema.shape.limit,
                offset: schemas_js_2.PaginationSchema.shape.offset,
                full_count: schemas_js_2.PaginationSchema.shape.full_count,
                filter: schemas_js_2.FilterSchema.optional(),
            }),
            handler: async ({ section_tipo, lang, limit, offset, full_count, filter }) => {
                var _a;
                const b = new mcp_common_3.SqoBuilder(section_tipo).limit(limit).offset(offset);
                if (filter)
                    b.filter(((_a = filter.operator) !== null && _a !== void 0 ? _a : 'AND'), filter.rules);
                if (full_count)
                    b.fullCount(true);
                const res = await client.call(rqo_js_2.rqo({ action: 'read_raw', source: { tipo: section_tipo, section_tipo, lang }, sqo: b.build() }));
                return { ok: true, data: res, pagination: output_js_1.buildPagination(res, offset, limit) };
            },
        }, ctx);
        register_js_2.registerTool(server, {
            name: 'dedalo_count_records',
            description: 'Count records matching an SQO filter. Returns the count without fetching record bodies. Use to determine total pages before searching.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Count records' },
            inputSchema: zod_4.z.object({
                section_tipo: schemas_js_2.TipoSchema,
                filter: schemas_js_2.FilterSchema.optional(),
            }),
            handler: async ({ section_tipo, filter }) => {
                var _a;
                const b = new mcp_common_3.SqoBuilder(section_tipo);
                if (filter)
                    b.filter(((_a = filter.operator) !== null && _a !== void 0 ? _a : 'AND'), filter.rules);
                return client.call(rqo_js_2.rqo({ action: 'count', source: { tipo: section_tipo, section_tipo }, sqo: b.build() }));
            },
        }, ctx);
        register_js_2.registerTool(server, {
            name: 'dedalo_get_indexation_grid',
            description: 'Get the indexation grid for a record. Returns thesaurus terms and their hierarchical relationships, useful for inspecting how a record is classified.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Get indexation grid' },
            inputSchema: zod_4.z.object({
                section_tipo: schemas_js_2.TipoSchema,
                section_id: schemas_js_2.SectionIdSchema,
                lang: schemas_js_2.OptionalLangSchema,
            }),
            handler: async ({ section_tipo, section_id, lang }) => client.call(rqo_js_2.rqo({ action: 'get_indexation_grid', source: { tipo: section_tipo, section_tipo, section_id, lang } })),
        }, ctx);
    }
    exports_8("registerRecordsReadTools", registerRecordsReadTools);
    return {
        setters: [
            function (zod_4_1) {
                zod_4 = zod_4_1;
            },
            function (mcp_common_3_1) {
                mcp_common_3 = mcp_common_3_1;
            },
            function (register_js_2_1) {
                register_js_2 = register_js_2_1;
            },
            function (rqo_js_2_1) {
                rqo_js_2 = rqo_js_2_1;
            },
            function (schemas_js_2_1) {
                schemas_js_2 = schemas_js_2_1;
            },
            function (output_js_1_1) {
                output_js_1 = output_js_1_1;
            }
        ],
        execute: function () {
        }
    };
});
System.register("tools/records_write", ["zod", "tools/_shared/register", "tools/_shared/rqo", "tools/_shared/schemas"], function (exports_9, context_9) {
    "use strict";
    var zod_5, register_js_3, rqo_js_3, schemas_js_3;
    var __moduleName = context_9 && context_9.id;
    /**
     * Record write tools. Always registered; Dédalo's user profile decides
     * whether each call succeeds or returns `permissions_denied`.
     *
     * `prevent_lock: false` is set on writes that touch component data so
     * Dédalo's locking machinery can serialise concurrent edits.
     */
    function registerRecordsWriteTools(server, client, ctx) {
        register_js_3.registerTool(server, {
            name: 'dedalo_create_record',
            description: 'Create a new record in the given `section_tipo`. Returns the new section_id.',
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true, title: 'Create record' },
            inputSchema: zod_5.z.object({
                section_tipo: schemas_js_3.TipoSchema,
                lang: schemas_js_3.OptionalLangSchema,
            }),
            handler: async ({ section_tipo, lang }) => client.call(rqo_js_3.rqo({ action: 'create', source: { tipo: section_tipo, section_tipo, lang }, prevent_lock: false })),
        }, ctx);
        register_js_3.registerTool(server, {
            name: 'dedalo_duplicate_record',
            description: 'Create a copy of an existing record including all component values. Returns the new section_id.',
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true, title: 'Duplicate record' },
            inputSchema: zod_5.z.object({
                section_tipo: schemas_js_3.TipoSchema,
                section_id: schemas_js_3.SectionIdSchema,
                lang: schemas_js_3.OptionalLangSchema,
            }),
            handler: async ({ section_tipo, section_id, lang }) => client.call(rqo_js_3.rqo({ action: 'duplicate', source: { tipo: section_tipo, section_tipo, section_id, lang }, prevent_lock: false })),
        }, ctx);
        register_js_3.registerTool(server, {
            name: 'dedalo_save_component',
            description: 'Save a value to a specific component within a record. The `value` shape depends on the component type (text, locator, dato, ...). Inspect with `dedalo_get_element_context` first when in doubt.',
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, title: 'Save component' },
            inputSchema: zod_5.z.object({
                tipo: schemas_js_3.TipoSchema.describe('Component tipo to save.'),
                section_tipo: schemas_js_3.TipoSchema,
                section_id: schemas_js_3.SectionIdSchema,
                lang: schemas_js_3.OptionalLangSchema,
                value: zod_5.z.unknown().describe('Value to write. Format depends on the component model.'),
            }),
            handler: async ({ tipo, section_tipo, section_id, lang, value }) => client.call(rqo_js_3.rqo({ action: 'save', source: { tipo, section_tipo, section_id, lang }, options: { value }, prevent_lock: false })),
        }, ctx);
        register_js_3.registerTool(server, {
            name: 'dedalo_delete_record',
            description: 'Permanently delete a record. This action cannot be undone. The Dédalo user profile must allow delete on the target section.',
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true, title: 'Delete record' },
            inputSchema: zod_5.z.object({
                section_tipo: schemas_js_3.TipoSchema,
                section_id: schemas_js_3.SectionIdSchema,
                lang: schemas_js_3.OptionalLangSchema,
            }),
            handler: async ({ section_tipo, section_id, lang }) => client.call(rqo_js_3.rqo({ action: 'delete', source: { tipo: section_tipo, section_tipo, section_id, lang }, prevent_lock: false })),
        }, ctx);
    }
    exports_9("registerRecordsWriteTools", registerRecordsWriteTools);
    return {
        setters: [
            function (zod_5_1) {
                zod_5 = zod_5_1;
            },
            function (register_js_3_1) {
                register_js_3 = register_js_3_1;
            },
            function (rqo_js_3_1) {
                rqo_js_3 = rqo_js_3_1;
            },
            function (schemas_js_3_1) {
                schemas_js_3 = schemas_js_3_1;
            }
        ],
        execute: function () {
        }
    };
});
System.register("tools/components", ["zod", "tools/_shared/register", "tools/_shared/rqo", "tools/_shared/schemas"], function (exports_10, context_10) {
    "use strict";
    var zod_6, register_js_4, rqo_js_4, schemas_js_4;
    var __moduleName = context_10 && context_10.id;
    /**
     * Per-component-type operations (portal, text_area, av, 3d).
     *
     * All actions are profile-gated by Dédalo. Annotations advertise
     * destructiveness so MCP clients can surface confirmation prompts.
     */
    function registerComponentTools(server, client, ctx) {
        const baseRecord = {
            tipo: schemas_js_4.TipoSchema.describe('Component tipo to operate on.'),
            section_tipo: schemas_js_4.TipoSchema,
            section_id: schemas_js_4.SectionIdSchema,
            lang: schemas_js_4.OptionalLangSchema,
        };
        // ── Portal ───────────────────────────────────────────────────────────
        register_js_4.registerTool(server, {
            name: 'dedalo_portal_delete_locator',
            description: 'Remove a locator from a portal component, detaching the linked record.',
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, title: 'Portal: delete locator' },
            inputSchema: zod_6.z.object({ ...baseRecord, locator: schemas_js_4.LocatorSchema }),
            handler: async ({ tipo, section_tipo, section_id, lang, locator }) => client.call(rqo_js_4.rqo({ action: 'delete_locator', dd_api: 'dd_component_portal_api', source: { tipo, section_tipo, section_id, lang }, options: { locator }, prevent_lock: false })),
        }, ctx);
        // ── Text area tags ───────────────────────────────────────────────────
        register_js_4.registerTool(server, {
            name: 'dedalo_text_area_get_tags_info',
            description: 'List tags inside a text_area component with metadata and usage.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Text area: get tags info' },
            inputSchema: zod_6.z.object(baseRecord),
            handler: async ({ tipo, section_tipo, section_id, lang }) => client.call(rqo_js_4.rqo({ action: 'get_tags_info', dd_api: 'dd_component_text_area_api', source: { tipo, section_tipo, section_id, lang } })),
        }, ctx);
        register_js_4.registerTool(server, {
            name: 'dedalo_text_area_delete_tag',
            description: 'Delete a tag from a text_area component by tag id.',
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, title: 'Text area: delete tag' },
            inputSchema: zod_6.z.object({ ...baseRecord, tag_id: zod_6.z.string().min(1).describe('Tag identifier to delete.') }),
            handler: async ({ tipo, section_tipo, section_id, lang, tag_id }) => client.call(rqo_js_4.rqo({ action: 'delete_tag', dd_api: 'dd_component_text_area_api', source: { tipo, section_tipo, section_id, lang }, options: { tag_id }, prevent_lock: false })),
        }, ctx);
        // ── AV ───────────────────────────────────────────────────────────────
        register_js_4.registerTool(server, {
            name: 'dedalo_av_get_media_streams',
            description: 'Return audio/video stream metadata: tracks, codecs, subtitles, bitrate.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'AV: get media streams' },
            inputSchema: zod_6.z.object(baseRecord),
            handler: async ({ tipo, section_tipo, section_id, lang }) => client.call(rqo_js_4.rqo({ action: 'get_media_streams', dd_api: 'dd_component_av_api', source: { tipo, section_tipo, section_id, lang } })),
        }, ctx);
        register_js_4.registerTool(server, {
            name: 'dedalo_av_download_fragment',
            description: 'Download a specific fragment from an AV resource by fragment id or time range.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'AV: download fragment' },
            inputSchema: zod_6.z.object({ ...baseRecord, fragment: zod_6.z.string().min(1).describe('Fragment identifier or time range expression.') }),
            handler: async ({ tipo, section_tipo, section_id, lang, fragment }) => client.call(rqo_js_4.rqo({ action: 'download_fragment', dd_api: 'dd_component_av_api', source: { tipo, section_tipo, section_id, lang }, options: { fragment } })),
        }, ctx);
        register_js_4.registerTool(server, {
            name: 'dedalo_av_create_posterframe',
            description: 'Create a posterframe (thumbnail) for an AV resource at a given time position.',
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, title: 'AV: create posterframe' },
            inputSchema: zod_6.z.object({ ...baseRecord, time: zod_6.z.number().min(0).describe('Time position in seconds.') }),
            handler: async ({ tipo, section_tipo, section_id, lang, time }) => client.call(rqo_js_4.rqo({ action: 'create_posterframe', dd_api: 'dd_component_av_api', source: { tipo, section_tipo, section_id, lang }, options: { time }, prevent_lock: false })),
        }, ctx);
        register_js_4.registerTool(server, {
            name: 'dedalo_av_delete_posterframe',
            description: 'Remove the posterframe of an AV resource.',
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, title: 'AV: delete posterframe' },
            inputSchema: zod_6.z.object(baseRecord),
            handler: async ({ tipo, section_tipo, section_id, lang }) => client.call(rqo_js_4.rqo({ action: 'delete_posterframe', dd_api: 'dd_component_av_api', source: { tipo, section_tipo, section_id, lang }, prevent_lock: false })),
        }, ctx);
        // ── 3D ───────────────────────────────────────────────────────────────
        register_js_4.registerTool(server, {
            name: 'dedalo_3d_move_file',
            description: 'Move a 3D model file to its target directory after upload.',
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true, title: '3D: move file' },
            inputSchema: zod_6.z.object({ ...baseRecord, target_dir: zod_6.z.string().min(1).describe('Target directory inside Dédalo media storage.') }),
            handler: async ({ tipo, section_tipo, section_id, lang, target_dir }) => client.call(rqo_js_4.rqo({ action: 'move_file_to_dir', dd_api: 'dd_component_3d_api', source: { tipo, section_tipo, section_id, lang }, options: { target_dir }, prevent_lock: false })),
        }, ctx);
        register_js_4.registerTool(server, {
            name: 'dedalo_3d_delete_posterframe',
            description: 'Remove the posterframe of a 3D model component.',
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, title: '3D: delete posterframe' },
            inputSchema: zod_6.z.object(baseRecord),
            handler: async ({ tipo, section_tipo, section_id, lang }) => client.call(rqo_js_4.rqo({ action: 'delete_posterframe', dd_api: 'dd_component_3d_api', source: { tipo, section_tipo, section_id, lang }, prevent_lock: false })),
        }, ctx);
    }
    exports_10("registerComponentTools", registerComponentTools);
    return {
        setters: [
            function (zod_6_1) {
                zod_6 = zod_6_1;
            },
            function (register_js_4_1) {
                register_js_4 = register_js_4_1;
            },
            function (rqo_js_4_1) {
                rqo_js_4 = rqo_js_4_1;
            },
            function (schemas_js_4_1) {
                schemas_js_4 = schemas_js_4_1;
            }
        ],
        execute: function () {
        }
    };
});
System.register("tools/diffusion", ["zod", "tools/_shared/register", "tools/_shared/rqo", "tools/_shared/schemas"], function (exports_11, context_11) {
    "use strict";
    var zod_7, register_js_5, rqo_js_5, schemas_js_5;
    var __moduleName = context_11 && context_11.id;
    /**
     * Diffusion (publication-export) tools.
     */
    function registerDiffusionTools(server, client, ctx) {
        register_js_5.registerTool(server, {
            name: 'dedalo_diffusion_info',
            description: 'Get diffusion targets, export rules, and current status.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Diffusion info' },
            inputSchema: zod_7.z.object({ tipo: schemas_js_5.TipoSchema.optional() }),
            handler: async ({ tipo }) => client.call(rqo_js_5.rqo({ action: 'get_diffusion_info', dd_api: 'dd_diffusion_api', source: { tipo } })),
        }, ctx);
        register_js_5.registerTool(server, {
            name: 'dedalo_diffusion_validate',
            description: 'Validate diffusion data for a section_tipo. Reports missing required fields and broken relations.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Diffusion validate' },
            inputSchema: zod_7.z.object({ section_tipo: schemas_js_5.TipoSchema }),
            handler: async ({ section_tipo }) => client.call(rqo_js_5.rqo({ action: 'validate', dd_api: 'dd_diffusion_api', source: { tipo: section_tipo, section_tipo } })),
        }, ctx);
        register_js_5.registerTool(server, {
            name: 'dedalo_diffusion_ontology_map',
            description: 'Return the mapping between Dédalo ontology properties and publication database fields.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Diffusion ontology map' },
            inputSchema: zod_7.z.object({ section_tipo: schemas_js_5.TipoSchema.optional() }),
            handler: async ({ section_tipo }) => client.call(rqo_js_5.rqo({ action: 'get_ontology_map', dd_api: 'dd_diffusion_api', source: { tipo: section_tipo } })),
        }, ctx);
        register_js_5.registerTool(server, {
            name: 'dedalo_diffusion_run',
            description: 'Execute the diffusion process for a section_tipo: publishes data from the work DB to the publication layer.',
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true, title: 'Diffusion run' },
            inputSchema: zod_7.z.object({
                section_tipo: schemas_js_5.TipoSchema,
                options: zod_7.z.record(zod_7.z.string(), zod_7.z.unknown()).optional().describe('Additional diffusion options (target db, scope, ...)'),
            }),
            handler: async ({ section_tipo, options }) => client.call(rqo_js_5.rqo({ action: 'diffuse', dd_api: 'dd_diffusion_api', source: { tipo: section_tipo, section_tipo }, options, prevent_lock: false })),
        }, ctx);
    }
    exports_11("registerDiffusionTools", registerDiffusionTools);
    return {
        setters: [
            function (zod_7_1) {
                zod_7 = zod_7_1;
            },
            function (register_js_5_1) {
                register_js_5 = register_js_5_1;
            },
            function (rqo_js_5_1) {
                rqo_js_5 = rqo_js_5_1;
            },
            function (schemas_js_5_1) {
                schemas_js_5 = schemas_js_5_1;
            }
        ],
        execute: function () {
        }
    };
});
System.register("tools/time_machine", ["zod", "tools/_shared/register", "tools/_shared/rqo", "tools/_shared/schemas"], function (exports_12, context_12) {
    "use strict";
    var zod_8, register_js_6, rqo_js_6, schemas_js_6;
    var __moduleName = context_12 && context_12.id;
    /**
     * Time Machine (versioning) read-only tools.
     */
    function registerTimeMachineTools(server, client, ctx) {
        register_js_6.registerTool(server, {
            name: 'dedalo_tm_get_node_data',
            description: 'Get node data for a Time Machine entry. Returns the historical version data for a specific node.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Time machine: node data' },
            inputSchema: zod_8.z.object({
                tipo: schemas_js_6.TipoSchema,
                section_id: schemas_js_6.SectionIdSchema.describe('Time Machine node identifier.'),
                lang: schemas_js_6.OptionalLangSchema,
            }),
            handler: async ({ tipo, section_id, lang }) => client.call(rqo_js_6.rqo({ action: 'get_node_data', dd_api: 'dd_ts_api', source: { tipo, section_tipo: tipo, section_id, lang } })),
        }, ctx);
        register_js_6.registerTool(server, {
            name: 'dedalo_tm_get_children_data',
            description: 'Get children data for a Time Machine entry: all child nodes in the version tree.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Time machine: children data' },
            inputSchema: zod_8.z.object({
                tipo: schemas_js_6.TipoSchema,
                section_id: schemas_js_6.SectionIdSchema.describe('Parent Time Machine node identifier.'),
                lang: schemas_js_6.OptionalLangSchema,
            }),
            handler: async ({ tipo, section_id, lang }) => client.call(rqo_js_6.rqo({ action: 'get_children_data', dd_api: 'dd_ts_api', source: { tipo, section_tipo: tipo, section_id, lang } })),
        }, ctx);
    }
    exports_12("registerTimeMachineTools", registerTimeMachineTools);
    return {
        setters: [
            function (zod_8_1) {
                zod_8 = zod_8_1;
            },
            function (register_js_6_1) {
                register_js_6 = register_js_6_1;
            },
            function (rqo_js_6_1) {
                rqo_js_6 = rqo_js_6_1;
            },
            function (schemas_js_6_1) {
                schemas_js_6 = schemas_js_6_1;
            }
        ],
        execute: function () {
        }
    };
});
System.register("tools/files", ["zod", "tools/_shared/register", "tools/_shared/rqo"], function (exports_13, context_13) {
    "use strict";
    var zod_9, register_js_7, rqo_js_7;
    var __moduleName = context_13 && context_13.id;
    /**
     * File / upload tools (`dd_utils_api`).
     *
     * Uploads accept Dédalo's `options` payload because the upload protocol
     * is highly variant (single shot vs chunked vs streamed). Schemas
     * declare common keys explicitly and allow extras through `passthrough`.
     */
    function registerFilesTools(server, client, ctx) {
        const UploadOptions = zod_9.z.object({
            file_name: zod_9.z.string().min(1).describe('Original file name including extension.'),
            key_dir: zod_9.z.string().min(1).describe('Sanitised target subdirectory inside Dédalo upload root.'),
            mime_type: zod_9.z.string().optional(),
            size: zod_9.z.number().int().nonnegative().optional(),
        }).passthrough();
        register_js_7.registerTool(server, {
            name: 'dedalo_upload_file',
            description: 'Upload a file to Dédalo. Accepts document, image, audio, and video files. The Dédalo user profile must permit uploads.',
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true, title: 'Upload file' },
            inputSchema: zod_9.z.object({ options: UploadOptions }),
            handler: async ({ options }) => client.call(rqo_js_7.rqo({ action: 'upload', dd_api: 'dd_utils_api', options, prevent_lock: false })),
        }, ctx);
        register_js_7.registerTool(server, {
            name: 'dedalo_join_chunked_files',
            description: 'Join previously uploaded chunks into a single complete file. Use after a chunked upload.',
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true, title: 'Join chunked files' },
            inputSchema: zod_9.z.object({ options: zod_9.z.record(zod_9.z.string(), zod_9.z.unknown()).describe('Options identifying the file and its chunks.') }),
            handler: async ({ options }) => client.call(rqo_js_7.rqo({ action: 'join_chunked_files_uploaded', dd_api: 'dd_utils_api', options, prevent_lock: false })),
        }, ctx);
        register_js_7.registerTool(server, {
            name: 'dedalo_list_uploads',
            description: 'List files staged in the upload directory but not yet processed.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'List uploads' },
            inputSchema: zod_9.z.object({ options: zod_9.z.record(zod_9.z.string(), zod_9.z.unknown()).optional() }),
            handler: async ({ options }) => client.call(rqo_js_7.rqo({ action: 'list_uploaded_files', dd_api: 'dd_utils_api', options })),
        }, ctx);
        register_js_7.registerTool(server, {
            name: 'dedalo_delete_upload',
            description: 'Delete a staged file that has not yet been processed.',
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, title: 'Delete upload' },
            inputSchema: zod_9.z.object({ options: zod_9.z.record(zod_9.z.string(), zod_9.z.unknown()).describe('Options identifying the file to delete.') }),
            handler: async ({ options }) => client.call(rqo_js_7.rqo({ action: 'delete_uploaded_file', dd_api: 'dd_utils_api', options, prevent_lock: false })),
        }, ctx);
        register_js_7.registerTool(server, {
            name: 'dedalo_browse_files',
            description: 'Browse the Dédalo media file system. Returns directory listings and metadata.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Browse files' },
            inputSchema: zod_9.z.object({ options: zod_9.z.record(zod_9.z.string(), zod_9.z.unknown()).optional() }),
            handler: async ({ options }) => client.call(rqo_js_7.rqo({ action: 'get_dedalo_files', dd_api: 'dd_utils_api', options })),
        }, ctx);
    }
    exports_13("registerFilesTools", registerFilesTools);
    return {
        setters: [
            function (zod_9_1) {
                zod_9 = zod_9_1;
            },
            function (register_js_7_1) {
                register_js_7 = register_js_7_1;
            },
            function (rqo_js_7_1) {
                rqo_js_7 = rqo_js_7_1;
            }
        ],
        execute: function () {
        }
    };
});
System.register("tools/process", ["zod", "tools/_shared/register", "tools/_shared/rqo"], function (exports_14, context_14) {
    "use strict";
    var zod_10, register_js_8, rqo_js_8;
    var __moduleName = context_14 && context_14.id;
    /**
     * Async background-process tools.
     */
    function registerProcessTools(server, client, ctx) {
        register_js_8.registerTool(server, {
            name: 'dedalo_get_process_status',
            description: 'Get the status of an asynchronous background process by `process_id`. Returns progress, state and messages.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Get process status' },
            inputSchema: zod_10.z.object({ process_id: zod_10.z.string().min(1) }),
            handler: async ({ process_id }) => client.call(rqo_js_8.rqo({ action: 'get_process_status', dd_api: 'dd_utils_api', source: { process_id } })),
        }, ctx);
        register_js_8.registerTool(server, {
            name: 'dedalo_get_process_status_poll',
            description: 'Long-poll variant of get_process_status. Blocks until status changes or the server-side timeout fires.',
            annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true, title: 'Poll process status' },
            inputSchema: zod_10.z.object({ process_id: zod_10.z.string().min(1) }),
            handler: async ({ process_id }) => client.call(rqo_js_8.rqo({ action: 'get_process_status_poll', dd_api: 'dd_utils_api', source: { process_id } })),
        }, ctx);
        register_js_8.registerTool(server, {
            name: 'dedalo_stop_process',
            description: 'Cancel a running asynchronous process by `process_id`.',
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, title: 'Stop process' },
            inputSchema: zod_10.z.object({ process_id: zod_10.z.string().min(1) }),
            handler: async ({ process_id }) => client.call(rqo_js_8.rqo({ action: 'stop_process', dd_api: 'dd_utils_api', source: { process_id }, prevent_lock: false })),
        }, ctx);
    }
    exports_14("registerProcessTools", registerProcessTools);
    return {
        setters: [
            function (zod_10_1) {
                zod_10 = zod_10_1;
            },
            function (register_js_8_1) {
                register_js_8 = register_js_8_1;
            },
            function (rqo_js_8_1) {
                rqo_js_8 = rqo_js_8_1;
            }
        ],
        execute: function () {
        }
    };
});
System.register("tools/system", ["zod", "tools/_shared/register", "tools/_shared/rqo", "tools/_shared/schemas"], function (exports_15, context_15) {
    "use strict";
    var zod_11, register_js_9, rqo_js_9, schemas_js_7;
    var __moduleName = context_15 && context_15.id;
    /**
     * System / diagnostics tools.
     */
    function registerSystemTools(server, client, ctx) {
        register_js_9.registerTool(server, {
            name: 'dedalo_get_system_info',
            description: 'Get system diagnostics: PHP version, upload limits, OCR engine availability, etc.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'System info' },
            inputSchema: zod_11.z.object({}),
            handler: async () => client.call(rqo_js_9.rqo({ action: 'get_system_info', dd_api: 'dd_utils_api' })),
        }, ctx);
        register_js_9.registerTool(server, {
            name: 'dedalo_get_server_ready_status',
            description: 'Check whether the Dédalo server is ready to accept requests. Returns subsystem readiness.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Server ready status' },
            inputSchema: zod_11.z.object({}),
            handler: async () => client.call(rqo_js_9.rqo({ action: 'get_server_ready_status', dd_api: 'dd_utils_api' })),
        }, ctx);
        register_js_9.registerTool(server, {
            name: 'dedalo_get_ontology_update_info',
            description: 'Information about available ontology updates: versions, changelog, status.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Ontology update info' },
            inputSchema: zod_11.z.object({}),
            handler: async () => client.call(rqo_js_9.rqo({ action: 'get_ontology_update_info', dd_api: 'dd_utils_api' })),
        }, ctx);
        register_js_9.registerTool(server, {
            name: 'dedalo_get_code_update_info',
            description: 'Information about available code updates: versions, changelog, status.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Code update info' },
            inputSchema: zod_11.z.object({}),
            handler: async () => client.call(rqo_js_9.rqo({ action: 'get_code_update_info', dd_api: 'dd_utils_api' })),
        }, ctx);
        register_js_9.registerTool(server, {
            name: 'dedalo_convert_sqo_to_sql',
            description: 'Convert a SQO filter into raw SQL for debugging. Returns the generated query without executing it. Requires global-admin profile in Dédalo.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Convert SQO to SQL' },
            inputSchema: zod_11.z.object({
                section_tipo: schemas_js_7.TipoSchema,
                sqo: zod_11.z.record(zod_11.z.string(), zod_11.z.unknown()).describe('Raw SQO object to translate. Uses the same shape as `dedalo_search_records` filter/sqo input.'),
            }),
            handler: async ({ section_tipo, sqo }) => client.call(rqo_js_9.rqo({ action: 'convert_search_object_to_sql_query', dd_api: 'dd_utils_api', source: { tipo: section_tipo, section_tipo }, options: sqo })),
        }, ctx);
        register_js_9.registerTool(server, {
            name: 'dedalo_update_lock_state',
            description: 'Update the lock state of components during editing. Use to release stale locks or to lock components during maintenance.',
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true, title: 'Update lock state' },
            inputSchema: zod_11.z.object({
                action: zod_11.z.enum(['lock', 'unlock']).describe('Whether to lock or unlock the target component.'),
                locator: schemas_js_7.LocatorSchema.describe('Target component locator to lock/unlock.'),
            }),
            handler: async ({ action, locator }) => client.call(rqo_js_9.rqo({ action: 'update_lock_components_state', dd_api: 'dd_utils_api', options: { action, locator }, prevent_lock: false })),
        }, ctx);
        register_js_9.registerTool(server, {
            name: 'dedalo_get_login_context',
            description: 'Get the login page context: configured authentication methods and labels. Pre-auth call.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Get login context' },
            inputSchema: zod_11.z.object({}),
            handler: async () => client.call(rqo_js_9.rqo({ action: 'get_login_context', dd_api: 'dd_utils_api' })),
        }, ctx);
        register_js_9.registerTool(server, {
            name: 'dedalo_get_install_context',
            description: 'Get the installation page context: DB status, system requirements. Pre-auth call.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Get install context' },
            inputSchema: zod_11.z.object({}),
            handler: async () => client.call(rqo_js_9.rqo({ action: 'get_install_context', dd_api: 'dd_utils_api' })),
        }, ctx);
        register_js_9.registerTool(server, {
            name: 'dedalo_list_user_tools',
            description: 'List user tools available to the current logged user. Output reflects the user profile.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'List user tools' },
            inputSchema: zod_11.z.object({}),
            handler: async () => client.call(rqo_js_9.rqo({ action: 'user_tools', dd_api: 'dd_tools_api' })),
        }, ctx);
    }
    exports_15("registerSystemTools", registerSystemTools);
    return {
        setters: [
            function (zod_11_1) {
                zod_11 = zod_11_1;
            },
            function (register_js_9_1) {
                register_js_9 = register_js_9_1;
            },
            function (rqo_js_9_1) {
                rqo_js_9 = rqo_js_9_1;
            },
            function (schemas_js_7_1) {
                schemas_js_7 = schemas_js_7_1;
            }
        ],
        execute: function () {
        }
    };
});
System.register("tools/maintenance", ["zod", "tools/_shared/register", "tools/_shared/rqo", "tools/_shared/schemas"], function (exports_16, context_16) {
    "use strict";
    var zod_12, register_js_10, rqo_js_10, schemas_js_8;
    var __moduleName = context_16 && context_16.id;
    /**
     * Maintenance area tools (`dd_area_maintenance_api`).
     *
     * Dédalo enforces `permissions >= 2` on the maintenance area before
     * dispatch — only users with maintenance access succeed.
     */
    function registerMaintenanceTools(server, client, ctx) {
        register_js_10.registerTool(server, {
            name: 'dedalo_maintenance_widget_value',
            description: 'Get the current value/state of a maintenance widget without executing anything.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Maintenance widget value' },
            inputSchema: zod_12.z.object({ widget_name: zod_12.z.string().min(1).describe('Maintenance widget name.') }),
            handler: async ({ widget_name }) => client.call(rqo_js_10.rqo({ action: 'get_widget_value', dd_api: 'dd_area_maintenance_api', source: { tipo: widget_name } })),
        }, ctx);
        register_js_10.registerTool(server, {
            name: 'dedalo_maintenance_widget_run',
            description: 'Execute a maintenance widget action (statistics, cleanup, recalculation, ...).',
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true, title: 'Maintenance widget run' },
            inputSchema: zod_12.z.object({
                widget_name: zod_12.z.string().min(1),
                options: zod_12.z.record(zod_12.z.string(), zod_12.z.unknown()).optional(),
            }),
            handler: async ({ widget_name, options }) => client.call(rqo_js_10.rqo({ action: 'widget_request', dd_api: 'dd_area_maintenance_api', source: { tipo: widget_name }, options, prevent_lock: false })),
        }, ctx);
        register_js_10.registerTool(server, {
            name: 'dedalo_maintenance_class_run',
            description: 'Execute a maintenance class request (advanced). Class names: `area_thesaurus`, `tool_update_data`, etc. Requires global-admin profile in Dédalo.',
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true, title: 'Maintenance class run' },
            inputSchema: zod_12.z.object({
                class_name: zod_12.z.string().min(1).describe('Maintenance class identifier.'),
                options: zod_12.z.record(zod_12.z.string(), zod_12.z.unknown()).optional(),
            }),
            handler: async ({ class_name, options }) => client.call(rqo_js_10.rqo({ action: 'class_request', dd_api: 'dd_area_maintenance_api', source: { tipo: class_name }, options, prevent_lock: false })),
        }, ctx);
        register_js_10.registerTool(server, {
            name: 'dedalo_maintenance_modify_counter',
            description: 'Modify a section counter (auto-increment for new section_ids). Use with care.',
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, title: 'Modify counter' },
            inputSchema: zod_12.z.object({
                section_tipo: schemas_js_8.TipoSchema,
                counter: zod_12.z.number().int().min(0).describe('New counter value.'),
                counter_action: zod_12.z.enum(['reset', 'fix']).default('fix'),
            }),
            handler: async ({ section_tipo, counter, counter_action }) => client.call(rqo_js_10.rqo({
                action: 'modify_counter',
                dd_api: 'dd_area_maintenance_api',
                source: { tipo: section_tipo, section_tipo },
                options: { section_tipo, counter, counter_action },
                prevent_lock: false,
            })),
        }, ctx);
        register_js_10.registerTool(server, {
            name: 'dedalo_maintenance_list_schema_changes',
            description: 'List pending simple schema-change files awaiting application.',
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'List schema changes' },
            inputSchema: zod_12.z.object({}),
            handler: async () => client.call(rqo_js_10.rqo({ action: 'get_simple_schema_changes_files', dd_api: 'dd_area_maintenance_api' })),
        }, ctx);
        register_js_10.registerTool(server, {
            name: 'dedalo_maintenance_apply_schema_changes',
            description: 'Apply pending simple schema-change files. Highly destructive — review with `dedalo_maintenance_list_schema_changes` first.',
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true, title: 'Apply schema changes' },
            inputSchema: zod_12.z.object({ options: zod_12.z.record(zod_12.z.string(), zod_12.z.unknown()).optional() }),
            handler: async ({ options }) => client.call(rqo_js_10.rqo({ action: 'parse_simple_schema_changes_files', dd_api: 'dd_area_maintenance_api', options, prevent_lock: false })),
        }, ctx);
        register_js_10.registerTool(server, {
            name: 'dedalo_maintenance_lock_components_actions',
            description: 'Lock or unlock component actions globally during maintenance windows.',
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, title: 'Lock component actions' },
            inputSchema: zod_12.z.object({ action: zod_12.z.enum(['lock', 'unlock']).describe('Whether to lock or unlock component actions.') }),
            handler: async ({ action }) => client.call(rqo_js_10.rqo({ action: 'lock_components_actions', dd_api: 'dd_area_maintenance_api', options: { action }, prevent_lock: false })),
        }, ctx);
    }
    exports_16("registerMaintenanceTools", registerMaintenanceTools);
    return {
        setters: [
            function (zod_12_1) {
                zod_12 = zod_12_1;
            },
            function (register_js_10_1) {
                register_js_10 = register_js_10_1;
            },
            function (rqo_js_10_1) {
                rqo_js_10 = rqo_js_10_1;
            },
            function (schemas_js_8_1) {
                schemas_js_8 = schemas_js_8_1;
            }
        ],
        execute: function () {
        }
    };
});
System.register("tools/admin", ["zod", "tools/_shared/register", "tools/_shared/rqo", "tools/_shared/schemas"], function (exports_17, context_17) {
    "use strict";
    var zod_13, register_js_11, rqo_js_11, schemas_js_9;
    var __moduleName = context_17 && context_17.id;
    /**
     * Administrative tools that change global Dédalo state.
     *
     * `login` and `quit` are intentionally NOT exposed: the MCP's session
     * user is fixed at startup; allowing the agent to switch users would
     * defeat the profile-based authorisation model.
     */
    function registerAdminTools(server, client, ctx) {
        register_js_11.registerTool(server, {
            name: 'dedalo_admin_install',
            description: 'Run the Dédalo installation process. Creates database tables, ontology structures, and default configuration. Requires a Dédalo user with install privileges.',
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, title: 'Install' },
            inputSchema: zod_13.z.object({ options: zod_13.z.record(zod_13.z.string(), zod_13.z.unknown()).optional() }),
            handler: async ({ options }) => client.call(rqo_js_11.rqo({ action: 'install', dd_api: 'dd_utils_api', options, prevent_lock: false })),
        }, ctx);
        register_js_11.registerTool(server, {
            name: 'dedalo_admin_change_lang',
            description: 'Switch the UI language for the current Dédalo session. Affects subsequent calls that respect `lang`.',
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true, title: 'Change language' },
            inputSchema: zod_13.z.object({ lang: schemas_js_9.LangSchema }),
            handler: async ({ lang }) => client.call(rqo_js_11.rqo({ action: 'change_lang', dd_api: 'dd_utils_api', source: { lang }, prevent_lock: false })),
        }, ctx);
    }
    exports_17("registerAdminTools", registerAdminTools);
    return {
        setters: [
            function (zod_13_1) {
                zod_13 = zod_13_1;
            },
            function (register_js_11_1) {
                register_js_11 = register_js_11_1;
            },
            function (rqo_js_11_1) {
                rqo_js_11 = rqo_js_11_1;
            },
            function (schemas_js_9_1) {
                schemas_js_9 = schemas_js_9_1;
            }
        ],
        execute: function () {
        }
    };
});
System.register("tools/index", ["tools/discovery", "tools/records_read", "tools/records_write", "tools/components", "tools/diffusion", "tools/time_machine", "tools/files", "tools/process", "tools/system", "tools/maintenance", "tools/admin"], function (exports_18, context_18) {
    "use strict";
    var discovery_js_1, records_read_js_1, records_write_js_1, components_js_1, diffusion_js_1, time_machine_js_1, files_js_1, process_js_1, system_js_1, maintenance_js_1, admin_js_1;
    var __moduleName = context_18 && context_18.id;
    /**
     * Register every dedalo-work-mcp tool. Authorisation is enforced by
     * Dédalo's user/profile system, so all tools register unconditionally.
     */
    function registerAllTools(server, client, ctx) {
        discovery_js_1.registerDiscoveryTools(server, client, ctx);
        records_read_js_1.registerRecordsReadTools(server, client, ctx);
        records_write_js_1.registerRecordsWriteTools(server, client, ctx);
        components_js_1.registerComponentTools(server, client, ctx);
        diffusion_js_1.registerDiffusionTools(server, client, ctx);
        time_machine_js_1.registerTimeMachineTools(server, client, ctx);
        files_js_1.registerFilesTools(server, client, ctx);
        process_js_1.registerProcessTools(server, client, ctx);
        system_js_1.registerSystemTools(server, client, ctx);
        maintenance_js_1.registerMaintenanceTools(server, client, ctx);
        admin_js_1.registerAdminTools(server, client, ctx);
    }
    exports_18("registerAllTools", registerAllTools);
    return {
        setters: [
            function (discovery_js_1_1) {
                discovery_js_1 = discovery_js_1_1;
            },
            function (records_read_js_1_1) {
                records_read_js_1 = records_read_js_1_1;
            },
            function (records_write_js_1_1) {
                records_write_js_1 = records_write_js_1_1;
            },
            function (components_js_1_1) {
                components_js_1 = components_js_1_1;
            },
            function (diffusion_js_1_1) {
                diffusion_js_1 = diffusion_js_1_1;
            },
            function (time_machine_js_1_1) {
                time_machine_js_1 = time_machine_js_1_1;
            },
            function (files_js_1_1) {
                files_js_1 = files_js_1_1;
            },
            function (process_js_1_1) {
                process_js_1 = process_js_1_1;
            },
            function (system_js_1_1) {
                system_js_1 = system_js_1_1;
            },
            function (maintenance_js_1_1) {
                maintenance_js_1 = maintenance_js_1_1;
            },
            function (admin_js_1_1) {
                admin_js_1 = admin_js_1_1;
            }
        ],
        execute: function () {
        }
    };
});
System.register("resources/ontology", ["@modelcontextprotocol/sdk/server/mcp.js", "tools/_shared/rqo"], function (exports_19, context_19) {
    "use strict";
    var mcp_js_1, rqo_js_12;
    var __moduleName = context_19 && context_19.id;
    /**
     * Ontology resources — expose Dédalo's ontology as MCP resources.
     *
     * Resources let the LLM proactively fetch the ontology map at session
     * start, without needing explicit tool calls. This builds the mental
     * map of sections, components, and portal relationships upfront.
     */
    function registerOntologyResources(server, client) {
        // ── Static resource: sections glossary ─────────────────────────────
        // Returns all sections with multilingual terms in one call.
        // URI: dedalo://ontology/sections
        server.registerResource('ontology-sections', 'dedalo://ontology/sections', {
            description: 'Complete glossary of all Dédalo sections: human-readable names mapped to tipo identifiers. ' +
                'Terms in all available languages. Fetch this at session start to build your ontology map.',
            mimeType: 'application/json',
        }, (async () => {
            const result = await client.call(rqo_js_12.rqo({
                action: 'get_glossary',
                dd_api: 'dd_ontology_api',
                source: { mode: 'sections' },
            }));
            return {
                contents: [{
                        uri: 'dedalo://ontology/sections',
                        text: JSON.stringify(result, null, 2),
                        mimeType: 'application/json',
                    }],
            };
        }));
        // ── Template resource: per-section component detail ────────────────
        // Returns one section's component tree with portal metadata.
        // URI pattern: dedalo://ontology/sections/{section_tipo}
        server.registerResource('ontology-section-detail', new mcp_js_1.ResourceTemplate('dedalo://ontology/sections/{section_tipo}', {
            list: async () => {
                var _a;
                const result = await client.call(rqo_js_12.rqo({
                    action: 'get_glossary',
                    dd_api: 'dd_ontology_api',
                    source: { mode: 'sections' },
                }));
                const sections = (_a = result === null || result === void 0 ? void 0 : result.result) !== null && _a !== void 0 ? _a : [];
                return {
                    resources: sections.map((s) => ({
                        uri: `dedalo://ontology/sections/${s.section_tipo}`,
                        name: s.section_tipo,
                        description: typeof s.term === 'object'
                            ? Object.values(s.term).join(' / ')
                            : s.term,
                        mimeType: 'application/json',
                    })),
                };
            },
            complete: {
                section_tipo: async (value) => {
                    var _a;
                    const result = await client.call(rqo_js_12.rqo({
                        action: 'resolve_term',
                        dd_api: 'dd_ontology_api',
                        source: { text: value, mode: 'fuzzy', model: 'section', limit: 20 },
                    }));
                    const nodes = (_a = result === null || result === void 0 ? void 0 : result.result) !== null && _a !== void 0 ? _a : [];
                    return nodes.map((n) => n.tipo);
                },
            },
        }), {
            description: 'Full component tree for a specific Dédalo section, including portal metadata (is_portal, target_section_tipo). ' +
                'Use this to discover which components a section has and which portals link to other sections.',
            mimeType: 'application/json',
        }, (async (uri, variables) => {
            const section_tipo = variables.section_tipo;
            const result = await client.call(rqo_js_12.rqo({
                action: 'get_glossary',
                dd_api: 'dd_ontology_api',
                source: { mode: 'section', section_tipo },
            }));
            return {
                contents: [{
                        uri: uri.href,
                        text: JSON.stringify(result, null, 2),
                        mimeType: 'application/json',
                    }],
            };
        }));
    }
    exports_19("registerOntologyResources", registerOntologyResources);
    return {
        setters: [
            function (mcp_js_1_1) {
                mcp_js_1 = mcp_js_1_1;
            },
            function (rqo_js_12_1) {
                rqo_js_12 = rqo_js_12_1;
            }
        ],
        execute: function () {
        }
    };
});
System.register("resources/index", ["resources/ontology"], function (exports_20, context_20) {
    "use strict";
    var ontology_js_1;
    var __moduleName = context_20 && context_20.id;
    /**
     * Register all MCP resources for dedalo-work-mcp.
     * Resources expose Dédalo's ontology as readable MCP resources
     * that the LLM can proactively fetch.
     */
    function registerAllResources(server, client) {
        ontology_js_1.registerOntologyResources(server, client);
    }
    exports_20("registerAllResources", registerAllResources);
    return {
        setters: [
            function (ontology_js_1_1) {
                ontology_js_1 = ontology_js_1_1;
            }
        ],
        execute: function () {
        }
    };
});
System.register("server", ["@modelcontextprotocol/sdk/server/mcp.js", "tools/index", "resources/index"], function (exports_21, context_21) {
    "use strict";
    var mcp_js_2, index_js_1, index_js_2;
    var __moduleName = context_21 && context_21.id;
    /**
     * Create the dedalo-work-mcp server with every tool registered.
     *
     * Authorisation is delegated to Dédalo: the WorkClient logs in as the
     * configured user, and per-tool permissions follow that user's profile.
     */
    function createWorkServer(config) {
        const { client, logger, limiter } = config;
        const server = new mcp_js_2.McpServer({ name: 'dedalo-work-mcp', version: '1.0.0' }, { capabilities: { tools: {}, resources: {} } });
        index_js_2.registerAllResources(server, client);
        index_js_1.registerAllTools(server, client, { logger, limiter: limiter !== null && limiter !== void 0 ? limiter : null });
        return server;
    }
    exports_21("createWorkServer", createWorkServer);
    return {
        setters: [
            function (mcp_js_2_1) {
                mcp_js_2 = mcp_js_2_1;
            },
            function (index_js_1_1) {
                index_js_1 = index_js_1_1;
            },
            function (index_js_2_1) {
                index_js_2 = index_js_2_1;
            }
        ],
        execute: function () {
        }
    };
});
System.register("index", ["@modelcontextprotocol/sdk/server/stdio.js", "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js", "pino", "@dedalo/mcp-common", "config", "server"], function (exports_22, context_22) {
    "use strict";
    var _a, stdio_js_1, webStandardStreamableHttp_js_1, pino_1, mcp_common_4, config_js_1, server_js_1, useHttp, logger, config, client, limiter, stdioServer, httpServers, httpTransports;
    var __moduleName = context_22 && context_22.id;
    /**
     * Validate an incoming HTTP Origin against the allowlist.
     * No allowlist + no Origin header → permit (typical for non-browser clients).
     * No allowlist + Origin present → reject (defence-in-depth against DNS rebinding).
     */
    function isOriginAllowed(origin, allowlist) {
        if (!origin)
            return true;
        if (allowlist.length === 0)
            return false;
        return allowlist.includes(origin);
    }
    async function isInitializeRequest(req) {
        if (req.method !== 'POST')
            return false;
        try {
            const body = await req.clone().json();
            const messages = Array.isArray(body) ? body : [body];
            return messages.some((message) => message && message.method === 'initialize');
        }
        catch (_a) {
            return false;
        }
    }
    async function main() {
        // Prime CSRF before any tool call so the first request succeeds.
        try {
            await client.bootstrapCsrf();
            logger.info('CSRF token bootstrapped');
        }
        catch (err) {
            logger.warn({ err: err.message }, 'CSRF bootstrap failed; will retry on first call');
        }
        if (useHttp) {
            const { port, host, allowedOrigins } = config.http;
            Bun.serve({
                port,
                hostname: host,
                fetch: async (req) => {
                    const origin = req.headers.get('origin');
                    if (!isOriginAllowed(origin, allowedOrigins)) {
                        return new Response('Forbidden: origin not allowed', { status: 403 });
                    }
                    const corsHeaders = {
                        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type, X-Dedalo-Csrf-Token',
                    };
                    if (origin)
                        corsHeaders['Access-Control-Allow-Origin'] = origin;
                    if (req.method === 'OPTIONS') {
                        return new Response(null, { status: 204, headers: corsHeaders });
                    }
                    const sessionId = req.headers.get('mcp-session-id');
                    let transport = sessionId ? httpTransports.get(sessionId) : undefined;
                    if (!transport && await isInitializeRequest(req)) {
                        let newTransport;
                        let sessionServer = null;
                        newTransport = new webStandardStreamableHttp_js_1.WebStandardStreamableHTTPServerTransport({
                            sessionIdGenerator: () => crypto.randomUUID(),
                            onsessioninitialized: (newSessionId) => {
                                httpTransports.set(newSessionId, newTransport);
                                if (sessionServer) {
                                    httpServers.set(newSessionId, sessionServer);
                                }
                            },
                        });
                        newTransport.onclose = () => {
                            const closedSessionId = newTransport.sessionId;
                            if (closedSessionId) {
                                httpTransports.delete(closedSessionId);
                                httpServers.delete(closedSessionId);
                            }
                        };
                        sessionServer = server_js_1.createWorkServer({
                            client,
                            logger,
                            limiter,
                        });
                        await sessionServer.connect(newTransport);
                        transport = newTransport;
                    }
                    if (!transport) {
                        return new Response(JSON.stringify({
                            jsonrpc: '2.0',
                            error: {
                                code: -32000,
                                message: 'Bad Request: No valid MCP session ID provided',
                            },
                            id: null,
                        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
                    }
                    const response = await transport.handleRequest(req);
                    return response;
                },
                websocket: { open: () => { }, close: () => { }, message: () => { } },
            });
            logger.info({ port, host, allowedOrigins }, 'dedalo-work-mcp started on HTTP');
        }
        else {
            const transport = new stdio_js_1.StdioServerTransport();
            stdioServer = server_js_1.createWorkServer({
                client,
                logger,
                limiter,
            });
            await stdioServer.connect(transport);
            logger.info('dedalo-work-mcp started on stdio');
        }
    }
    function shutdown() {
        logger.info('Shutting down dedalo-work-mcp...');
        const closeTasks = [
            ...Array.from(httpServers.values()).map((server) => server.close()),
            ...(stdioServer ? [stdioServer.close()] : []),
        ];
        Promise.all(closeTasks)
            .then(() => {
            logger.info('Server closed');
            process.exit(0);
        })
            .catch((err) => {
            logger.error(err, 'Error during shutdown');
            process.exit(1);
        });
    }
    return {
        setters: [
            function (stdio_js_1_1) {
                stdio_js_1 = stdio_js_1_1;
            },
            function (webStandardStreamableHttp_js_1_1) {
                webStandardStreamableHttp_js_1 = webStandardStreamableHttp_js_1_1;
            },
            function (pino_1_1) {
                pino_1 = pino_1_1;
            },
            function (mcp_common_4_1) {
                mcp_common_4 = mcp_common_4_1;
            },
            function (config_js_1_1) {
                config_js_1 = config_js_1_1;
            },
            function (server_js_1_1) {
                server_js_1 = server_js_1_1;
            }
        ],
        execute: function () {
            useHttp = process.argv.includes('--http');
            logger = pino_1.default({
                level: (_a = process.env.LOG_LEVEL) !== null && _a !== void 0 ? _a : 'info',
            }, process.stderr);
            try {
                config = config_js_1.loadConfig(process.env, logger);
            }
            catch (err) {
                logger.error({ err: err.message }, 'Configuration error');
                process.exit(1);
            }
            client = new mcp_common_4.WorkClient({
                baseUrl: config.apiUrl,
                auth: { type: 'session', username: config.username, password: config.password, autoLogin: true },
                autoLogin: true,
            });
            limiter = config.rateLimit ? new mcp_common_4.TokenBucketRateLimiter(config.rateLimit) : null;
            stdioServer = null;
            httpServers = new Map();
            httpTransports = new Map();
            // Periodically evict stale rate-limiter buckets to prevent memory leaks.
            if (limiter) {
                const CLEANUP_INTERVAL_MS = 60000;
                const cleanupTimer = setInterval(() => {
                    const removed = limiter.cleanup();
                    if (removed > 0) {
                        logger.debug({ removed, remaining: limiter.size }, 'Rate limiter cleanup');
                    }
                }, CLEANUP_INTERVAL_MS);
                cleanupTimer.unref();
            }
            process.on('SIGINT', shutdown);
            process.on('SIGTERM', shutdown);
            main().catch((err) => {
                logger.error(err, 'Fatal error');
                process.exit(1);
            });
        }
    };
});
