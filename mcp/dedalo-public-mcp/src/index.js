System.register("tools/helpers", [], function (exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    function so(a, g) {
        return { ...a, dedalo_get: g };
    }
    exports_1("so", so);
    function reg(server, name, description, schema, handler, limiter, logger) {
        server.registerTool(name, { description, inputSchema: schema }, async (args, extra) => {
            var _a;
            if (limiter) {
                const sessionId = (_a = extra.sessionId) !== null && _a !== void 0 ? _a : 'default';
                const result = limiter.consume(sessionId);
                if (!result.allowed) {
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ error: 'Rate limit exceeded', retryAfterMs: result.retryAfterMs }) }],
                        isError: true,
                    };
                }
            }
            const startTime = Date.now();
            try {
                const result = await handler(args);
                const latency = Date.now() - startTime;
                logger.info({ tool: name, latency }, 'Tool call succeeded');
                return {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                };
            }
            catch (err) {
                const latency = Date.now() - startTime;
                const message = err instanceof Error ? err.message : String(err);
                logger.error({ err: message, tool: name, latency }, 'Tool call failed');
                return {
                    content: [{ type: 'text', text: `Error: ${message}` }],
                    isError: true,
                };
            }
        });
    }
    exports_1("reg", reg);
    return {
        setters: [],
        execute: function () {
        }
    };
});
System.register("tools/records", ["zod", "tools/helpers"], function (exports_2, context_2) {
    "use strict";
    var zod_1, helpers_js_1, L, N, O;
    var __moduleName = context_2 && context_2.id;
    function registerRecordsTools(server, client, limiter, logger) {
        helpers_js_1.reg(server, 'records', 'Fetch published records from a specific table. Supports pagination, SQL filters, field selection, and ordering. Use this as the primary tool for querying published content.', zod_1.z.object({
            table: zod_1.z.string().describe('Publication table name to query'),
            lang: L,
            limit: N,
            offset: O,
            order: zod_1.z.string().optional().describe('SQL ORDER BY clause'),
            fields: zod_1.z.array(zod_1.z.string()).optional().describe('Specific fields to return, defaults to all'),
            sql_filter: zod_1.z.string().optional().describe('SQL WHERE clause for filtering'),
        }), async (a) => client.call(helpers_js_1.so(a, 'records')), limiter, logger),
            helpers_js_1.reg(server, 'bibliography_rows', 'Fetch bibliography records with author-based sorting. Returns formatted bibliography entries suitable for citation display. Use this for academic reference lists.', zod_1.z.object({
                table: zod_1.z.string().describe('Bibliography table name'),
                lang: L,
                limit: N,
                offset: O,
            }), async (a) => client.call(helpers_js_1.so(a, 'bibliography_rows')), limiter, logger);
    }
    exports_2("registerRecordsTools", registerRecordsTools);
    return {
        setters: [
            function (zod_1_1) {
                zod_1 = zod_1_1;
            },
            function (helpers_js_1_1) {
                helpers_js_1 = helpers_js_1_1;
            }
        ],
        execute: function () {
            L = zod_1.z.string().optional().describe('Language code, e.g. lg-eng, lg-spa');
            N = zod_1.z.number().min(1).max(500).optional().describe('Maximum number of records to return');
            O = zod_1.z.number().min(0).optional().describe('Number of records to skip for pagination');
        }
    };
});
System.register("tools/search", ["zod", "tools/helpers"], function (exports_3, context_3) {
    "use strict";
    var zod_2, helpers_js_2, L, N, O;
    var __moduleName = context_3 && context_3.id;
    function registerSearchTools(server, client, limiter, logger) {
        helpers_js_2.reg(server, 'free_search', 'Perform free-text search on a specific publication table. Returns matching records with relevance ranking. Use this for targeted searches within a known table.', zod_2.z.object({
            q: zod_2.z.string().describe('Search query text'),
            table: zod_2.z.string().optional().describe('Target table; searches all tables if omitted'),
            lang: L,
            limit: N,
            offset: O,
        }), async (a) => client.call(helpers_js_2.so(a, 'free_search')), limiter, logger),
            helpers_js_2.reg(server, 'global_search', 'Perform a global full-text search across all publication tables. Returns a summary of matches per table. Use this for broad discovery when you do not know which table contains the data.', zod_2.z.object({
                q: zod_2.z.string().describe('Search query text'),
                lang: L,
                limit: N,
                offset: O,
            }), async (a) => client.call(helpers_js_2.so(a, 'global_search')), limiter, logger),
            helpers_js_2.reg(server, 'global_search_json', 'Perform a global full-text search returning structured JSON results. Includes detailed record data for each match, not just summaries. Use this when you need full record details from a cross-table search.', zod_2.z.object({
                q: zod_2.z.string().describe('Search query text'),
                lang: L,
                limit: N,
                offset: O,
            }), async (a) => client.call(helpers_js_2.so(a, 'global_search_json')), limiter, logger),
            helpers_js_2.reg(server, 'search_tipos', 'Search for section tipos by model type or pattern matching. Returns matching tipo definitions. Use this to discover available data structures in the publication schema.', zod_2.z.object({
                model: zod_2.z.string().optional().describe('Filter by model type'),
                tipo: zod_2.z.string().optional().describe('Pattern to match in tipo names'),
                table: zod_2.z.string().optional().describe('Filter by publication table'),
            }), async (a) => client.call(helpers_js_2.so(a, 'search_tipos')), limiter, logger);
    }
    exports_3("registerSearchTools", registerSearchTools);
    return {
        setters: [
            function (zod_2_1) {
                zod_2 = zod_2_1;
            },
            function (helpers_js_2_1) {
                helpers_js_2 = helpers_js_2_1;
            }
        ],
        execute: function () {
            L = zod_2.z.string().optional().describe('Language code, e.g. lg-eng, lg-spa');
            N = zod_2.z.number().min(1).max(500).optional().describe('Maximum number of results');
            O = zod_2.z.number().min(0).optional().describe('Offset for pagination');
        }
    };
});
System.register("tools/thesaurus", ["zod", "tools/helpers"], function (exports_4, context_4) {
    "use strict";
    var zod_3, helpers_js_3, L, N, O;
    var __moduleName = context_4 && context_4.id;
    function registerThesaurusTools(server, client, limiter, logger) {
        helpers_js_3.reg(server, 'thesaurus_root_list', 'List root-level terms from a thesaurus table. Returns top-level terms without children. Use this to start browsing a controlled vocabulary from the top.', zod_3.z.object({ table: zod_3.z.string().describe('Thesaurus table name'), lang: L, limit: N, offset: O }), async (a) => client.call(helpers_js_3.so(a, 'thesaurus_root_list')), limiter, logger),
            helpers_js_3.reg(server, 'thesaurus_random_term', 'Get a random term from a thesaurus table. Useful for discovery and exploration. Use this to surface unexpected content.', zod_3.z.object({ table: zod_3.z.string().describe('Thesaurus table name'), lang: L }), async (a) => client.call(helpers_js_3.so(a, 'thesaurus_random_term')), limiter, logger),
            helpers_js_3.reg(server, 'thesaurus_search', 'Search the thesaurus for terms matching a query. Supports multiple search operators and can include children, parents, and related terms. Use this for finding controlled vocabulary terms.', zod_3.z.object({
                q: zod_3.z.string().describe('Search query'),
                q_operator: zod_3.z.string().optional().describe('Search operator (AND, OR, phrase)'),
                limit: N, offset: O,
                terms: zod_3.z.boolean().optional().describe('Include full term data'),
                children: zod_3.z.boolean().optional().describe('Include child terms'),
                parents: zod_3.z.boolean().optional().describe('Include parent terms'),
            }), async (a) => client.call(helpers_js_3.so(a, 'thesaurus_search')), limiter, logger),
            helpers_js_3.reg(server, 'thesaurus_autocomplete', 'Autocomplete thesaurus terms based on a partial query. Returns matching terms for type-ahead suggestions. Use this in search interfaces.', zod_3.z.object({
                q: zod_3.z.string().describe('Partial term text to autocomplete'),
                limit: N,
                table: zod_3.z.string().optional().describe('Limit search to a specific thesaurus table'),
            }), async (a) => client.call(helpers_js_3.so(a, 'thesaurus_autocomplete')), limiter, logger),
            helpers_js_3.reg(server, 'thesaurus_term', 'Get detailed data for a single thesaurus term by its term_id. Includes label, definition, and metadata. Optionally include parent and child terms.', zod_3.z.object({
                table: zod_3.z.string().describe('Thesaurus table name'),
                term_id: zod_3.z.string().describe('Unique term identifier'),
                lang: L,
                parents: zod_3.z.boolean().optional().describe('Include parent terms in hierarchy'),
                children: zod_3.z.boolean().optional().describe('Include child terms in hierarchy'),
            }), async (a) => client.call(helpers_js_3.so(a, 'thesaurus_term')), limiter, logger),
            helpers_js_3.reg(server, 'thesaurus_indexation_node', 'Get indexation node data for a thesaurus term. Returns records indexed under this term and related terms. Use this to find content classified under a specific vocabulary term.', zod_3.z.object({
                table: zod_3.z.string().describe('Thesaurus table name'),
                term_id: zod_3.z.string().describe('Term identifier'),
                lang: L,
            }), async (a) => client.call(helpers_js_3.so(a, 'thesaurus_indexation_node')), limiter, logger),
            helpers_js_3.reg(server, 'thesaurus_video_view_data', 'Get video view data for a thesaurus term. Returns video fragments and segments associated with this term. Use this for video-based content linked to vocabulary terms.', zod_3.z.object({
                table: zod_3.z.string().describe('Thesaurus table name'),
                term_id: zod_3.z.string().describe('Term identifier'),
                lang: L,
            }), async (a) => client.call(helpers_js_3.so(a, 'thesaurus_video_view_data')), limiter, logger),
            helpers_js_3.reg(server, 'thesaurus_children', 'Get child terms for a specific thesaurus term. Returns the next level of the hierarchy. Use this to navigate down the vocabulary tree.', zod_3.z.object({
                table: zod_3.z.string().describe('Thesaurus table name'),
                term_id: zod_3.z.string().describe('Parent term identifier'),
                lang: L, limit: N, offset: O,
            }), async (a) => client.call(helpers_js_3.so(a, 'thesaurus_children')), limiter, logger),
            helpers_js_3.reg(server, 'thesaurus_parents', 'Get parent terms for a specific thesaurus term. Returns the broader terms in the hierarchy. Use this to navigate up the vocabulary tree.', zod_3.z.object({
                table: zod_3.z.string().describe('Thesaurus table name'),
                term_id: zod_3.z.string().describe('Child term identifier'),
                lang: L,
            }), async (a) => client.call(helpers_js_3.so(a, 'thesaurus_parents')), limiter, logger);
    }
    exports_4("registerThesaurusTools", registerThesaurusTools);
    return {
        setters: [
            function (zod_3_1) {
                zod_3 = zod_3_1;
            },
            function (helpers_js_3_1) {
                helpers_js_3 = helpers_js_3_1;
            }
        ],
        execute: function () {
            L = zod_3.z.string().optional().describe('Language code, e.g. lg-eng, lg-spa');
            N = zod_3.z.number().min(1).max(500).optional().describe('Maximum number of results');
            O = zod_3.z.number().min(0).optional().describe('Offset for pagination');
        }
    };
});
System.register("tools/schema", ["zod", "tools/helpers"], function (exports_5, context_5) {
    "use strict";
    var zod_4, helpers_js_4;
    var __moduleName = context_5 && context_5.id;
    function registerSchemaTools(server, client, limiter, logger) {
        helpers_js_4.reg(server, 'tables_info', 'List all available publication database tables with their metadata. Returns table names, record counts, and configuration. Use this to discover what data is available for querying.', zod_4.z.object({ full: zod_4.z.boolean().optional().describe('Include detailed column information') }), async (a) => client.call(helpers_js_4.so(a, 'tables_info')), limiter, logger),
            helpers_js_4.reg(server, 'publication_schema', 'Get the complete publication schema including table definitions, field mappings, and portal relationships. Returns the full structure used by the publication API. Use this for understanding the data model.', zod_4.z.object({}), async () => client.call({ dedalo_get: 'publication_schema' }), limiter, logger),
            helpers_js_4.reg(server, 'table_thesaurus', 'Get the thesaurus table name associated with the publication. Returns which thesaurus table is used for controlled vocabulary. Use this to find the correct table for thesaurus queries.', zod_4.z.object({}), async () => client.call({ dedalo_get: 'table_thesaurus' }), limiter, logger),
            helpers_js_4.reg(server, 'table_thesaurus_map', 'Get the mapping between publication tables and their associated thesaurus tables. Returns a dictionary of table-to-thesaurus relationships. Use this to understand which vocabularies apply to which data.', zod_4.z.object({}), async () => client.call({ dedalo_get: 'table_thesaurus_map' }), limiter, logger),
            helpers_js_4.reg(server, 'combi', 'Execute a combined multi-query request. Sends multiple queries in a single call and returns all results together. Use this for efficient batch operations.', zod_4.z.object({ queries: zod_4.z.array(zod_4.z.any()).describe('Array of query objects to execute') }), async (a) => client.call(helpers_js_4.so(a, 'combi')), limiter, logger);
    }
    exports_5("registerSchemaTools", registerSchemaTools);
    return {
        setters: [
            function (zod_4_1) {
                zod_4 = zod_4_1;
            },
            function (helpers_js_4_1) {
                helpers_js_4 = helpers_js_4_1;
            }
        ],
        execute: function () {
        }
    };
});
System.register("tools/media", ["zod", "tools/helpers"], function (exports_6, context_6) {
    "use strict";
    var zod_5, helpers_js_5, L;
    var __moduleName = context_6 && context_6.id;
    function registerMediaTools(server, client, limiter, logger) {
        helpers_js_5.reg(server, 'full_reel', 'Get complete reel data including all fragments, metadata, and associated content. Returns the full reel structure with nested fragments. Use this to access complete video/audio reels.', zod_5.z.object({
            table: zod_5.z.string().describe('Reel table name'),
            id: zod_5.z.union([zod_5.z.string(), zod_5.z.number()]).describe('Reel record identifier'),
            lang: L,
        }), async (a) => client.call(helpers_js_5.so(a, 'full_reel')), limiter, logger),
            helpers_js_5.reg(server, 'full_interview', 'Get complete interview data including all segments, transcripts, and metadata. Returns the full interview structure. Use this to access complete oral history interviews.', zod_5.z.object({
                table: zod_5.z.string().describe('Interview table name'),
                id: zod_5.z.union([zod_5.z.string(), zod_5.z.number()]).describe('Interview record identifier'),
                lang: L,
            }), async (a) => client.call(helpers_js_5.so(a, 'full_interview')), limiter, logger),
            helpers_js_5.reg(server, 'reel_terms', 'Get thesaurus terms associated with a specific reel. Returns the vocabulary terms linked to the reel content. Use this to understand how a reel is classified.', zod_5.z.object({
                table: zod_5.z.string().describe('Reel table name'),
                id: zod_5.z.union([zod_5.z.string(), zod_5.z.number()]).describe('Reel record identifier'),
                lang: L,
            }), async (a) => client.call(helpers_js_5.so(a, 'reel_terms')), limiter, logger),
            helpers_js_5.reg(server, 'reel_fragments_of_type', 'Get reel fragments filtered by fragment type. Returns only fragments matching the specified type (e.g., interview segment, b-roll). Use this to extract specific content types from a reel.', zod_5.z.object({
                table: zod_5.z.string().describe('Reel table name'),
                id: zod_5.z.union([zod_5.z.string(), zod_5.z.number()]).describe('Reel record identifier'),
                type: zod_5.z.string().describe('Fragment type to filter by'),
                lang: L,
            }), async (a) => client.call(helpers_js_5.so(a, 'reel_fragments_of_type')), limiter, logger),
            helpers_js_5.reg(server, 'image_data', 'Get image metadata and access URLs for a specific image record. Returns dimensions, format, and CDN URLs at various resolutions. Use this to display images in applications.', zod_5.z.object({
                table: zod_5.z.string().describe('Image table name'),
                id: zod_5.z.union([zod_5.z.string(), zod_5.z.number()]).describe('Image record identifier'),
                lang: L,
                media: zod_5.z.string().optional().describe('Specific media variant to retrieve'),
            }), async (a) => client.call(helpers_js_5.so(a, 'image_data')), limiter, logger),
            helpers_js_5.reg(server, 'fragment_from_index_locator', 'Get a specific fragment by its index locator. Returns the fragment data referenced by an index entry. Use this to retrieve fragments pointed to by thesaurus indexation.', zod_5.z.object({
                table: zod_5.z.string().describe('Fragment table name'),
                section_tipo: zod_5.z.string().describe('Section tipo of the indexed record'),
                section_id: zod_5.z.union([zod_5.z.string(), zod_5.z.number()]).describe('Record identifier'),
                lang: L,
            }), async (a) => client.call(helpers_js_5.so(a, 'fragment_from_index_locator')), limiter, logger),
            helpers_js_5.reg(server, 'menu_tree_plain', 'Get a flat representation of the publication menu tree. Returns all menu items with their hierarchy flattened. Use this to understand the site navigation structure.', zod_5.z.object({
                table: zod_5.z.string().describe('Menu table name'),
                lang: L,
            }), async (a) => client.call(helpers_js_5.so(a, 'menu_tree_plain')), limiter, logger);
    }
    exports_6("registerMediaTools", registerMediaTools);
    return {
        setters: [
            function (zod_5_1) {
                zod_5 = zod_5_1;
            },
            function (helpers_js_5_1) {
                helpers_js_5 = helpers_js_5_1;
            }
        ],
        execute: function () {
            L = zod_5.z.string().optional().describe('Language code, e.g. lg-eng, lg-spa');
        }
    };
});
System.register("tools/index", ["tools/records", "tools/search", "tools/thesaurus", "tools/schema", "tools/media"], function (exports_7, context_7) {
    "use strict";
    var records_js_1, search_js_1, thesaurus_js_1, schema_js_1, media_js_1;
    var __moduleName = context_7 && context_7.id;
    function registerTools(server, client, logger, limiter) {
        records_js_1.registerRecordsTools(server, client, limiter, logger);
        search_js_1.registerSearchTools(server, client, limiter, logger);
        thesaurus_js_1.registerThesaurusTools(server, client, limiter, logger);
        schema_js_1.registerSchemaTools(server, client, limiter, logger);
        media_js_1.registerMediaTools(server, client, limiter, logger);
    }
    exports_7("registerTools", registerTools);
    return {
        setters: [
            function (records_js_1_1) {
                records_js_1 = records_js_1_1;
            },
            function (search_js_1_1) {
                search_js_1 = search_js_1_1;
            },
            function (thesaurus_js_1_1) {
                thesaurus_js_1 = thesaurus_js_1_1;
            },
            function (schema_js_1_1) {
                schema_js_1 = schema_js_1_1;
            },
            function (media_js_1_1) {
                media_js_1 = media_js_1_1;
            }
        ],
        execute: function () {
        }
    };
});
System.register("server", ["@modelcontextprotocol/sdk/server/mcp.js", "@dedalo/mcp-common", "tools/index"], function (exports_8, context_8) {
    "use strict";
    var mcp_js_1, mcp_common_1, index_js_1;
    var __moduleName = context_8 && context_8.id;
    function createPublicServer(config) {
        const { client, logger, rateLimit } = config;
        const limiter = rateLimit
            ? new mcp_common_1.TokenBucketRateLimiter({ capacity: rateLimit.capacity, refillRateMs: rateLimit.refillRateMs })
            : null;
        const server = new mcp_js_1.McpServer({ name: 'dedalo-public-mcp', version: '1.0.0' }, { capabilities: { tools: {} } });
        index_js_1.registerTools(server, client, logger, limiter);
        return server;
    }
    exports_8("createPublicServer", createPublicServer);
    return {
        setters: [
            function (mcp_js_1_1) {
                mcp_js_1 = mcp_js_1_1;
            },
            function (mcp_common_1_1) {
                mcp_common_1 = mcp_common_1_1;
            },
            function (index_js_1_1) {
                index_js_1 = index_js_1_1;
            }
        ],
        execute: function () {
        }
    };
});
System.register("index", ["@modelcontextprotocol/sdk/server/stdio.js", "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js", "pino", "@dedalo/mcp-common", "server"], function (exports_9, context_9) {
    "use strict";
    var _a, _b, _c, _d, _e, stdio_js_1, webStandardStreamableHttp_js_1, pino_1, mcp_common_2, server_js_1, useHttp, logger, PUBLIC_API_BASE_URL, PUBLIC_API_CODE, RATE_LIMIT_CAPACITY, RATE_LIMIT_REFILL_MS, client, server;
    var __moduleName = context_9 && context_9.id;
    async function main() {
        const useHttp = process.argv.includes('--http');
        const portArg = process.argv.findIndex((a) => a === '--port');
        const port = portArg !== -1 && process.argv[portArg + 1] ? parseInt(process.argv[portArg + 1], 10) : 3002;
        if (useHttp) {
            const transport = new webStandardStreamableHttp_js_1.WebStandardStreamableHTTPServerTransport({
                sessionIdGenerator: () => crypto.randomUUID(),
            });
            await server.connect(transport);
            Bun.serve({
                port,
                fetch: async (req) => {
                    if (req.method === 'OPTIONS') {
                        return new Response(null, {
                            status: 204,
                            headers: {
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
                                'Access-Control-Allow-Headers': 'Content-Type',
                            },
                        });
                    }
                    return transport.handleRequest(req);
                },
                websocket: { open: () => { }, close: () => { }, message: () => { } },
            });
            logger.info('dedalo-public-mcp started on HTTP port %d', port);
        }
        else {
            const transport = new stdio_js_1.StdioServerTransport();
            await server.connect(transport);
            logger.info('dedalo-public-mcp started on stdio');
        }
    }
    // Graceful shutdown
    function shutdown() {
        logger.info('Shutting down dedalo-public-mcp...');
        server.close().then(() => {
            logger.info('Server closed');
            process.exit(0);
        }).catch((err) => {
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
            function (mcp_common_2_1) {
                mcp_common_2 = mcp_common_2_1;
            },
            function (server_js_1_1) {
                server_js_1 = server_js_1_1;
            }
        ],
        execute: function () {
            useHttp = process.argv.includes('--http');
            logger = pino_1.default({
                level: (_a = process.env.LOG_LEVEL) !== null && _a !== void 0 ? _a : 'info',
                transport: useHttp && process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
            }, process.stderr);
            PUBLIC_API_BASE_URL = (_b = process.env.DEDALO_PUBLIC_API_URL) !== null && _b !== void 0 ? _b : 'http://localhost';
            PUBLIC_API_CODE = (_c = process.env.DEDALO_PUBLIC_API_CODE) !== null && _c !== void 0 ? _c : '';
            if (!PUBLIC_API_CODE) {
                logger.error('DEDALO_PUBLIC_API_CODE is required');
                process.exit(1);
            }
            mcp_common_2.validatePublicAuthConfig({ code: PUBLIC_API_CODE });
            RATE_LIMIT_CAPACITY = parseInt((_d = process.env.RATE_LIMIT_CAPACITY) !== null && _d !== void 0 ? _d : '0', 10);
            RATE_LIMIT_REFILL_MS = parseInt((_e = process.env.RATE_LIMIT_REFILL_MS) !== null && _e !== void 0 ? _e : '60000', 10);
            client = new mcp_common_2.PublicClient({
                baseUrl: PUBLIC_API_BASE_URL,
                code: PUBLIC_API_CODE,
            });
            server = server_js_1.createPublicServer({
                client,
                logger,
                rateLimit: RATE_LIMIT_CAPACITY > 0
                    ? { capacity: RATE_LIMIT_CAPACITY, refillRateMs: RATE_LIMIT_REFILL_MS }
                    : undefined,
            });
            process.on('SIGINT', shutdown);
            process.on('SIGTERM', shutdown);
            main().catch((err) => {
                logger.error(err, 'Fatal error');
                process.exit(1);
            });
        }
    };
});
