import { z } from 'zod';
/**
    * SOURCE_SCHEMA / SOURCE
    * Describes the target of a Dédalo API action (section, component, or tool).
    *
    * What: the PHP side uses `source` to resolve the ontology class,
    * section context, language, and UI mode.  `tipo` is the primary key
    * (ontology term identifier); `section_tipo` and `section_id` narrow it
    * to a concrete record.
    *
    * Why: every `dd_core_api` action (`read`, `save`, `delete`, …) requires
    * a `source` object.  Centralising the schema here guarantees that all
    * clients (MCP servers, tests, external scripts) construct the same
    * shape.
    *
    * Example:
    * ```ts
    * const src: Source = { tipo: 'oh1', section_tipo: 'oh1', section_id: 1, lang: 'lg-eng', mode: 'edit' };
    * ```
    */
export const SourceSchema = z.object({
    model: z.string().optional(),
    tipo: z.string().optional(),
    section_tipo: z.string().optional(),
    section_id: z.union([z.string(), z.number()]).optional(),
    mode: z.enum(['edit', 'list', 'search', 'tm', 'portal', 'tool']).optional(),
    lang: z.string().optional(),
    action: z.string().optional(),
    from_user_version: z.boolean().optional(),
    from_section_tipo: z.string().optional(),
    from_section_id: z.union([z.string(), z.number()]).optional(),
    row_section_id: z.union([z.string(), z.number()]).optional(),
    parent_tipo: z.string().optional(),
    component_tipo: z.string().optional(),
});
/**
    * FILTER_RULE_SCHEMA / FILTER_RULE
    * Atomic predicate inside a Dédalo SQO `filter`.
    *
    * What: `path` is the component tipo to test; `operator` is the
    * comparison (e.g. `'='`, `'contains'`, `'!='`); `value` is the literal.
    *
    * Why: Dédalo's search engine accepts nested `AND`/`OR` trees of these
    * rules.  Strong typing prevents passing an object where an array is
    * expected.
    *
    * Example:
    * ```ts
    * const rule: FilterRule = { path: 'oh14', operator: 'contains', value: 'interview' };
    * ```
    */
export const FilterRuleSchema = z.object({
    path: z.string(),
    operator: z.string(),
    value: z.any(),
    q_name: z.string().optional(),
    use_function: z.boolean().optional(),
});
/**
    * FILTER_SCHEMA / FILTER
    * Recursive logical group used in `Sqo.filter`.
    *
    * What: a top-level `AND`/`OR` operator plus an ordered array of
    * children.  Each child is either a leaf `FilterRule` or another nested
    * `Filter` (hence `z.lazy()`).
    *
    * Why: the recursive type needs an explicit TypeScript shape because
    * `z.infer` on a self-referential Zod schema resolves to `any`.  The
    * `z.ZodType<Filter>` cast keeps runtime validation while the explicit
    * interface keeps compile-time safety.
    *
    * Example:
    * ```ts
    * const f: Filter = {
    *   operator: 'AND',
    *   rules: [
    *     { path: 'oh14', operator: 'contains', value: 'Picasso' },
    *     { operator: 'OR', rules: [
    *       { path: 'oh15', operator: '=', value: 'lg-eng' },
    *       { path: 'oh15', operator: '=', value: 'lg-spa' }
    *     ]}
    *   ]
    * };
    * ```
    */
export const FilterSchema = z.object({
    operator: z.enum(['AND', 'OR', '$and', '$or']).optional(),
    rules: z.array(z.union([FilterRuleSchema, z.lazy(() => FilterSchema)])),
});
/**
    * LOCATOR_SCHEMA / LOCATOR
    * Universal record pointer used across Dédalo for cross-references,
    * indexation tags, and portal values.
    *
    * What: a minimal `{ section_tipo, section_id }` pair that uniquely
    * identifies any row in the database.  Optional `component_tipo` and
    * `tag_id` narrow it to a specific fragment inside a record.
    *
    * Why: portals (many-to-many relations), indexation grids, and
    * bibliographic citations all use locators instead of raw foreign keys.
    * Normalising the shape prevents silent drift between client and server.
    *
    * Example:
    * ```ts
    * const loc: Locator = { section_tipo: 'oh1', section_id: 42 };
    * ```
    */
export const LocatorSchema = z.object({
    section_tipo: z.string(),
    section_id: z.union([z.string(), z.number()]),
    component_tipo: z.string().optional(),
    tag_id: z.string().optional(),
    type: z.string().optional(),
    from_section_tipo: z.string().optional(),
    from_section_id: z.union([z.string(), z.number()]).optional(),
});
/**
    * SQO_SCHEMA / SQO
    * Search Query Object — controls pagination, filtering, sorting, and
    * projection for `dd_core_api::read`, `::read_raw`, and `::count`.
    *
    * What: every list or search action in Dédalo accepts an optional `sqo`
    * field.  The PHP side validates the shape, translates the `filter` tree
    * into SQL `WHERE`, and applies `limit`/`offset` / `order` clauses.
    *
    * Why: rather than exposing raw SQL to clients, Dédalo uses this JSON
    * DSL.  Strong typing here means the MCP server can never generate
    * an invalid query shape — the PHP server receives well-formed input
    * that passes its own whitelist validation.
    *
    * Key fields:
    * - `section_tipo`  — target ontology section(s).
    * - `filter`          — recursive AND/OR tree of `FilterRule`.
    * - `filter_by_locators` — bypass SQL, fetch exact records by locator.
    * - `order`           — array of `{ path, direction }` sort clauses.
    * - `full_count`      — request total matching rows for pagination.
    *
    * Example:
    * ```ts
    * const sqo: Sqo = {
    *   section_tipo: 'oh1',
    *   limit: 20,
    *   filter: { operator: 'AND', rules: [
    *     { path: 'oh14', operator: 'contains', value: 'Picasso' }
    *   ]},
    *   order: [{ path: 'oh14', direction: 'ASC' }],
    *   full_count: true
    * };
    * ```
    */
export const SqoSchema = z.object({
    id: z.string().optional(),
    section_tipo: z.union([z.string(), z.array(z.string())]).optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
    filter: FilterSchema.optional(),
    filter_by_locators: z.array(LocatorSchema).optional(),
    select: z.array(z.string()).optional(),
    order: z.array(z.object({
        direction: z.enum(['ASC', 'DESC']),
        path: z.string(),
    })).optional(),
    allow_dataset: z.boolean().optional(),
    skip_projects_filter: z.boolean().optional(),
    parsed: z.boolean().optional(),
    children_recursive: z.boolean().optional(),
    fixed_mode: z.string().optional(),
    full_count: z.boolean().optional(),
    type: z.string().optional(),
});
/**
    * RQO_SCHEMA / RQO
    * Request Query Object — the envelope for every Dédalo work-API call.
    *
    * What: `action` is mandatory (e.g. `'read'`, `'save'`, `'delete'`);
    * `dd_api` routes to the correct API class (`dd_core_api`, `dd_utils_api`, …);
    * `source` identifies the target component/section; `sqo` carries search
    * parameters; `options` carries action-specific extras (e.g. component
    * value for `save`).
    *
    * Why: the PHP `dd_manager` uses this exact structure to dispatch
    * requests.  Any deviation (wrong `dd_api` name, missing `action`) is
    * caught server-side and returned as `invalid_action` or `invalid_api_class`.
    * Validating client-side first short-cycles those errors.
    *
    * Example:
    * ```ts
    * const rqo: Rqo = {
    *   action: 'read',
    *   dd_api: 'dd_core_api',
    *   source: { tipo: 'oh1', section_tipo: 'oh1', section_id: 1, lang: 'lg-eng' }
    * };
    * ```
    */
export const RqoSchema = z.object({
    action: z.string(),
    dd_api: z.string().optional(),
    source: SourceSchema.optional(),
    sqo: SqoSchema.optional(),
    show: z.any().optional(),
    options: z.any().optional(),
    prevent_lock: z.boolean().optional(),
    csrf_token: z.string().optional(),
    key_dir: z.string().optional(),
    row_key: z.string().optional(),
});
/**
    * DEDALO_RESPONSE_SCHEMA / DEDALO_RESPONSE
    * Standard envelope returned by both work and publication APIs.
    *
    * What: `result: true` means success; `result: false` triggers error
    * handling (`mapDedaloError()`).  `data` contains the payload (records,
    * components, etc.).  `context` carries ontology descriptors.  `total`
    * appears when `full_count: true` was requested.  `debug` and
    * `dedalo_last_error` are stripped by `redactResponse()` before the MCP
    * layer sees them.
    *
    * Why: both APIs share the same envelope shape, so a single response
    * type covers work and publication clients.  The `result` boolean is
    * the canonical success/failure signal; `msg` is human-readable but
    * should not be parsed programmatically (use `errors` instead).
    */
export const DedaloResponseSchema = z.object({
    result: z.union([z.boolean(), z.any()]),
    msg: z.string().optional(),
    errors: z.array(z.string()).optional(),
    debug: z.any().optional(),
    csrf_token: z.string().optional(),
    dedalo_last_error: z.string().optional(),
    data: z.any().optional(),
    context: z.any().optional(),
    total: z.number().optional(),
});
/**
    * PUBLICATION_REQUEST_SCHEMA / PUBLICATION_REQUEST
    * Top-level envelope for every call to the Dédalo Publication API.
    *
    * What: `code` is the shared secret (`API_WEB_USER_CODE`) validated
    * by `hash_equals()` on the PHP side.  `lang` selects the language layer.
    * `db_name` overrides the default publication database.  `options` holds
    * the actual query (e.g. `{ dedalo_get: 'records', table: 'interview' }`).
    *
    * Why: the publication endpoint is stateless — each POST is self-contained.
    * Separating auth (`code`) from payload (`options`) lets the PHP gate
    * reject invalid requests before parsing the heavier query parameters.
    */
export const PublicationRequestSchema = z.object({
    code: z.string(),
    lang: z.string().optional(),
    db_name: z.string().optional(),
    options: z.any(),
});
/**
    * PUBLICATION_OPTIONS_SCHEMA / PUBLICATION_OPTIONS
    * Per-query payload inside a `PublicationRequest`.
    *
    * What: `dedalo_get` is the action selector (e.g. `'records'`,
    * `'thesaurus_search'`, `'free_search'`).  The remaining fields are
    * action-specific arguments; the PHP `manager` class routes `dedalo_get`
    * to the matching `web_data::get_*` static method.
    *
    * Why: the publication API is a flat namespace of ~25 read-only actions.
    * A single `options` object accommodates every action without requiring
    * 25 separate Zod schemas, while still being validated by the server.
    *
    * Example:
    * ```ts
    * const opts: PublicationOptions = {
    *   dedalo_get: 'records',
    *   table: 'interview',
    *   lang: 'lg-eng',
    *   limit: 10,
    *   offset: 0
    * };
    * ```
    */
export const PublicationOptionsSchema = z.object({
    dedalo_get: z.string(),
    table: z.string().optional(),
    section_tipo: z.string().optional(),
    lang: z.string().optional(),
    id: z.union([z.string(), z.number()]).optional(),
    ar_id: z.array(z.union([z.string(), z.number()])).optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
    order: z.string().optional(),
    fields: z.array(z.string()).optional(),
    filter_by_locators: z.array(LocatorSchema).optional(),
    sql_filter: z.string().optional(),
    value: z.string().optional(),
    search_thesaurus: z.boolean().optional(),
    add_parents: z.boolean().optional(),
    terms: z.boolean().optional(),
    q: z.string().optional(),
    q_operator: z.string().optional(),
    path: z.array(z.string()).optional(),
    tipo: z.string().optional(),
    model: z.string().optional(),
    web_path: z.string().optional(),
    term_id: z.string().optional(),
    type: z.string().optional(),
    children: z.boolean().optional(),
    filter: z.string().optional(),
    resolve_references: z.boolean().optional(),
    media: z.string().optional(),
    db_name: z.string().optional(),
});
//# sourceMappingURL=index.js.map