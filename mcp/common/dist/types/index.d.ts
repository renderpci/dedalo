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
export declare const SourceSchema: z.ZodObject<{
    model: z.ZodOptional<z.ZodString>;
    tipo: z.ZodOptional<z.ZodString>;
    section_tipo: z.ZodOptional<z.ZodString>;
    section_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
    mode: z.ZodOptional<z.ZodEnum<["edit", "list", "search", "tm", "portal", "tool"]>>;
    lang: z.ZodOptional<z.ZodString>;
    action: z.ZodOptional<z.ZodString>;
    from_user_version: z.ZodOptional<z.ZodBoolean>;
    from_section_tipo: z.ZodOptional<z.ZodString>;
    from_section_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
    row_section_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
    parent_tipo: z.ZodOptional<z.ZodString>;
    component_tipo: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    model?: string | undefined;
    tipo?: string | undefined;
    section_tipo?: string | undefined;
    section_id?: string | number | undefined;
    mode?: "edit" | "list" | "search" | "tm" | "portal" | "tool" | undefined;
    lang?: string | undefined;
    action?: string | undefined;
    from_user_version?: boolean | undefined;
    from_section_tipo?: string | undefined;
    from_section_id?: string | number | undefined;
    row_section_id?: string | number | undefined;
    parent_tipo?: string | undefined;
    component_tipo?: string | undefined;
}, {
    model?: string | undefined;
    tipo?: string | undefined;
    section_tipo?: string | undefined;
    section_id?: string | number | undefined;
    mode?: "edit" | "list" | "search" | "tm" | "portal" | "tool" | undefined;
    lang?: string | undefined;
    action?: string | undefined;
    from_user_version?: boolean | undefined;
    from_section_tipo?: string | undefined;
    from_section_id?: string | number | undefined;
    row_section_id?: string | number | undefined;
    parent_tipo?: string | undefined;
    component_tipo?: string | undefined;
}>;
export type Source = z.infer<typeof SourceSchema>;
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
export declare const FilterRuleSchema: z.ZodObject<{
    path: z.ZodString;
    operator: z.ZodString;
    value: z.ZodAny;
    q_name: z.ZodOptional<z.ZodString>;
    use_function: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    path: string;
    operator: string;
    value?: any;
    q_name?: string | undefined;
    use_function?: boolean | undefined;
}, {
    path: string;
    operator: string;
    value?: any;
    q_name?: string | undefined;
    use_function?: boolean | undefined;
}>;
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
export declare const FilterSchema: z.ZodType<Filter>;
export type FilterRule = z.infer<typeof FilterRuleSchema>;
export type Filter = {
    operator?: 'AND' | 'OR' | '$and' | '$or';
    rules: Array<FilterRule | Filter>;
};
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
export declare const LocatorSchema: z.ZodObject<{
    section_tipo: z.ZodString;
    section_id: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    component_tipo: z.ZodOptional<z.ZodString>;
    tag_id: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodString>;
    from_section_tipo: z.ZodOptional<z.ZodString>;
    from_section_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
}, "strip", z.ZodTypeAny, {
    section_tipo: string;
    section_id: string | number;
    type?: string | undefined;
    from_section_tipo?: string | undefined;
    from_section_id?: string | number | undefined;
    component_tipo?: string | undefined;
    tag_id?: string | undefined;
}, {
    section_tipo: string;
    section_id: string | number;
    type?: string | undefined;
    from_section_tipo?: string | undefined;
    from_section_id?: string | number | undefined;
    component_tipo?: string | undefined;
    tag_id?: string | undefined;
}>;
export type Locator = z.infer<typeof LocatorSchema>;
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
export declare const SqoSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    section_tipo: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>;
    limit: z.ZodOptional<z.ZodNumber>;
    offset: z.ZodOptional<z.ZodNumber>;
    filter: z.ZodOptional<z.ZodType<Filter, z.ZodTypeDef, Filter>>;
    filter_by_locators: z.ZodOptional<z.ZodArray<z.ZodObject<{
        section_tipo: z.ZodString;
        section_id: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
        component_tipo: z.ZodOptional<z.ZodString>;
        tag_id: z.ZodOptional<z.ZodString>;
        type: z.ZodOptional<z.ZodString>;
        from_section_tipo: z.ZodOptional<z.ZodString>;
        from_section_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
    }, "strip", z.ZodTypeAny, {
        section_tipo: string;
        section_id: string | number;
        type?: string | undefined;
        from_section_tipo?: string | undefined;
        from_section_id?: string | number | undefined;
        component_tipo?: string | undefined;
        tag_id?: string | undefined;
    }, {
        section_tipo: string;
        section_id: string | number;
        type?: string | undefined;
        from_section_tipo?: string | undefined;
        from_section_id?: string | number | undefined;
        component_tipo?: string | undefined;
        tag_id?: string | undefined;
    }>, "many">>;
    select: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    order: z.ZodOptional<z.ZodArray<z.ZodObject<{
        direction: z.ZodEnum<["ASC", "DESC"]>;
        path: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        path: string;
        direction: "ASC" | "DESC";
    }, {
        path: string;
        direction: "ASC" | "DESC";
    }>, "many">>;
    allow_dataset: z.ZodOptional<z.ZodBoolean>;
    skip_projects_filter: z.ZodOptional<z.ZodBoolean>;
    parsed: z.ZodOptional<z.ZodBoolean>;
    children_recursive: z.ZodOptional<z.ZodBoolean>;
    fixed_mode: z.ZodOptional<z.ZodString>;
    full_count: z.ZodOptional<z.ZodBoolean>;
    type: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    section_tipo?: string | string[] | undefined;
    filter?: Filter | undefined;
    type?: string | undefined;
    id?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
    filter_by_locators?: {
        section_tipo: string;
        section_id: string | number;
        type?: string | undefined;
        from_section_tipo?: string | undefined;
        from_section_id?: string | number | undefined;
        component_tipo?: string | undefined;
        tag_id?: string | undefined;
    }[] | undefined;
    select?: string[] | undefined;
    order?: {
        path: string;
        direction: "ASC" | "DESC";
    }[] | undefined;
    allow_dataset?: boolean | undefined;
    skip_projects_filter?: boolean | undefined;
    parsed?: boolean | undefined;
    children_recursive?: boolean | undefined;
    fixed_mode?: string | undefined;
    full_count?: boolean | undefined;
}, {
    section_tipo?: string | string[] | undefined;
    filter?: Filter | undefined;
    type?: string | undefined;
    id?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
    filter_by_locators?: {
        section_tipo: string;
        section_id: string | number;
        type?: string | undefined;
        from_section_tipo?: string | undefined;
        from_section_id?: string | number | undefined;
        component_tipo?: string | undefined;
        tag_id?: string | undefined;
    }[] | undefined;
    select?: string[] | undefined;
    order?: {
        path: string;
        direction: "ASC" | "DESC";
    }[] | undefined;
    allow_dataset?: boolean | undefined;
    skip_projects_filter?: boolean | undefined;
    parsed?: boolean | undefined;
    children_recursive?: boolean | undefined;
    fixed_mode?: string | undefined;
    full_count?: boolean | undefined;
}>;
export type Sqo = z.infer<typeof SqoSchema>;
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
export declare const RqoSchema: z.ZodObject<{
    action: z.ZodString;
    dd_api: z.ZodOptional<z.ZodString>;
    source: z.ZodOptional<z.ZodObject<{
        model: z.ZodOptional<z.ZodString>;
        tipo: z.ZodOptional<z.ZodString>;
        section_tipo: z.ZodOptional<z.ZodString>;
        section_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
        mode: z.ZodOptional<z.ZodEnum<["edit", "list", "search", "tm", "portal", "tool"]>>;
        lang: z.ZodOptional<z.ZodString>;
        action: z.ZodOptional<z.ZodString>;
        from_user_version: z.ZodOptional<z.ZodBoolean>;
        from_section_tipo: z.ZodOptional<z.ZodString>;
        from_section_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
        row_section_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
        parent_tipo: z.ZodOptional<z.ZodString>;
        component_tipo: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        model?: string | undefined;
        tipo?: string | undefined;
        section_tipo?: string | undefined;
        section_id?: string | number | undefined;
        mode?: "edit" | "list" | "search" | "tm" | "portal" | "tool" | undefined;
        lang?: string | undefined;
        action?: string | undefined;
        from_user_version?: boolean | undefined;
        from_section_tipo?: string | undefined;
        from_section_id?: string | number | undefined;
        row_section_id?: string | number | undefined;
        parent_tipo?: string | undefined;
        component_tipo?: string | undefined;
    }, {
        model?: string | undefined;
        tipo?: string | undefined;
        section_tipo?: string | undefined;
        section_id?: string | number | undefined;
        mode?: "edit" | "list" | "search" | "tm" | "portal" | "tool" | undefined;
        lang?: string | undefined;
        action?: string | undefined;
        from_user_version?: boolean | undefined;
        from_section_tipo?: string | undefined;
        from_section_id?: string | number | undefined;
        row_section_id?: string | number | undefined;
        parent_tipo?: string | undefined;
        component_tipo?: string | undefined;
    }>>;
    sqo: z.ZodOptional<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        section_tipo: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>;
        limit: z.ZodOptional<z.ZodNumber>;
        offset: z.ZodOptional<z.ZodNumber>;
        filter: z.ZodOptional<z.ZodType<Filter, z.ZodTypeDef, Filter>>;
        filter_by_locators: z.ZodOptional<z.ZodArray<z.ZodObject<{
            section_tipo: z.ZodString;
            section_id: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
            component_tipo: z.ZodOptional<z.ZodString>;
            tag_id: z.ZodOptional<z.ZodString>;
            type: z.ZodOptional<z.ZodString>;
            from_section_tipo: z.ZodOptional<z.ZodString>;
            from_section_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
        }, "strip", z.ZodTypeAny, {
            section_tipo: string;
            section_id: string | number;
            type?: string | undefined;
            from_section_tipo?: string | undefined;
            from_section_id?: string | number | undefined;
            component_tipo?: string | undefined;
            tag_id?: string | undefined;
        }, {
            section_tipo: string;
            section_id: string | number;
            type?: string | undefined;
            from_section_tipo?: string | undefined;
            from_section_id?: string | number | undefined;
            component_tipo?: string | undefined;
            tag_id?: string | undefined;
        }>, "many">>;
        select: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        order: z.ZodOptional<z.ZodArray<z.ZodObject<{
            direction: z.ZodEnum<["ASC", "DESC"]>;
            path: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            path: string;
            direction: "ASC" | "DESC";
        }, {
            path: string;
            direction: "ASC" | "DESC";
        }>, "many">>;
        allow_dataset: z.ZodOptional<z.ZodBoolean>;
        skip_projects_filter: z.ZodOptional<z.ZodBoolean>;
        parsed: z.ZodOptional<z.ZodBoolean>;
        children_recursive: z.ZodOptional<z.ZodBoolean>;
        fixed_mode: z.ZodOptional<z.ZodString>;
        full_count: z.ZodOptional<z.ZodBoolean>;
        type: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        section_tipo?: string | string[] | undefined;
        filter?: Filter | undefined;
        type?: string | undefined;
        id?: string | undefined;
        limit?: number | undefined;
        offset?: number | undefined;
        filter_by_locators?: {
            section_tipo: string;
            section_id: string | number;
            type?: string | undefined;
            from_section_tipo?: string | undefined;
            from_section_id?: string | number | undefined;
            component_tipo?: string | undefined;
            tag_id?: string | undefined;
        }[] | undefined;
        select?: string[] | undefined;
        order?: {
            path: string;
            direction: "ASC" | "DESC";
        }[] | undefined;
        allow_dataset?: boolean | undefined;
        skip_projects_filter?: boolean | undefined;
        parsed?: boolean | undefined;
        children_recursive?: boolean | undefined;
        fixed_mode?: string | undefined;
        full_count?: boolean | undefined;
    }, {
        section_tipo?: string | string[] | undefined;
        filter?: Filter | undefined;
        type?: string | undefined;
        id?: string | undefined;
        limit?: number | undefined;
        offset?: number | undefined;
        filter_by_locators?: {
            section_tipo: string;
            section_id: string | number;
            type?: string | undefined;
            from_section_tipo?: string | undefined;
            from_section_id?: string | number | undefined;
            component_tipo?: string | undefined;
            tag_id?: string | undefined;
        }[] | undefined;
        select?: string[] | undefined;
        order?: {
            path: string;
            direction: "ASC" | "DESC";
        }[] | undefined;
        allow_dataset?: boolean | undefined;
        skip_projects_filter?: boolean | undefined;
        parsed?: boolean | undefined;
        children_recursive?: boolean | undefined;
        fixed_mode?: string | undefined;
        full_count?: boolean | undefined;
    }>>;
    show: z.ZodOptional<z.ZodAny>;
    options: z.ZodOptional<z.ZodAny>;
    prevent_lock: z.ZodOptional<z.ZodBoolean>;
    csrf_token: z.ZodOptional<z.ZodString>;
    key_dir: z.ZodOptional<z.ZodString>;
    row_key: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    action: string;
    options?: any;
    dd_api?: string | undefined;
    source?: {
        model?: string | undefined;
        tipo?: string | undefined;
        section_tipo?: string | undefined;
        section_id?: string | number | undefined;
        mode?: "edit" | "list" | "search" | "tm" | "portal" | "tool" | undefined;
        lang?: string | undefined;
        action?: string | undefined;
        from_user_version?: boolean | undefined;
        from_section_tipo?: string | undefined;
        from_section_id?: string | number | undefined;
        row_section_id?: string | number | undefined;
        parent_tipo?: string | undefined;
        component_tipo?: string | undefined;
    } | undefined;
    sqo?: {
        section_tipo?: string | string[] | undefined;
        filter?: Filter | undefined;
        type?: string | undefined;
        id?: string | undefined;
        limit?: number | undefined;
        offset?: number | undefined;
        filter_by_locators?: {
            section_tipo: string;
            section_id: string | number;
            type?: string | undefined;
            from_section_tipo?: string | undefined;
            from_section_id?: string | number | undefined;
            component_tipo?: string | undefined;
            tag_id?: string | undefined;
        }[] | undefined;
        select?: string[] | undefined;
        order?: {
            path: string;
            direction: "ASC" | "DESC";
        }[] | undefined;
        allow_dataset?: boolean | undefined;
        skip_projects_filter?: boolean | undefined;
        parsed?: boolean | undefined;
        children_recursive?: boolean | undefined;
        fixed_mode?: string | undefined;
        full_count?: boolean | undefined;
    } | undefined;
    show?: any;
    prevent_lock?: boolean | undefined;
    csrf_token?: string | undefined;
    key_dir?: string | undefined;
    row_key?: string | undefined;
}, {
    action: string;
    options?: any;
    dd_api?: string | undefined;
    source?: {
        model?: string | undefined;
        tipo?: string | undefined;
        section_tipo?: string | undefined;
        section_id?: string | number | undefined;
        mode?: "edit" | "list" | "search" | "tm" | "portal" | "tool" | undefined;
        lang?: string | undefined;
        action?: string | undefined;
        from_user_version?: boolean | undefined;
        from_section_tipo?: string | undefined;
        from_section_id?: string | number | undefined;
        row_section_id?: string | number | undefined;
        parent_tipo?: string | undefined;
        component_tipo?: string | undefined;
    } | undefined;
    sqo?: {
        section_tipo?: string | string[] | undefined;
        filter?: Filter | undefined;
        type?: string | undefined;
        id?: string | undefined;
        limit?: number | undefined;
        offset?: number | undefined;
        filter_by_locators?: {
            section_tipo: string;
            section_id: string | number;
            type?: string | undefined;
            from_section_tipo?: string | undefined;
            from_section_id?: string | number | undefined;
            component_tipo?: string | undefined;
            tag_id?: string | undefined;
        }[] | undefined;
        select?: string[] | undefined;
        order?: {
            path: string;
            direction: "ASC" | "DESC";
        }[] | undefined;
        allow_dataset?: boolean | undefined;
        skip_projects_filter?: boolean | undefined;
        parsed?: boolean | undefined;
        children_recursive?: boolean | undefined;
        fixed_mode?: string | undefined;
        full_count?: boolean | undefined;
    } | undefined;
    show?: any;
    prevent_lock?: boolean | undefined;
    csrf_token?: string | undefined;
    key_dir?: string | undefined;
    row_key?: string | undefined;
}>;
export type Rqo = z.infer<typeof RqoSchema>;
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
export declare const DedaloResponseSchema: z.ZodObject<{
    result: z.ZodUnion<[z.ZodBoolean, z.ZodAny]>;
    msg: z.ZodOptional<z.ZodString>;
    errors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    debug: z.ZodOptional<z.ZodAny>;
    csrf_token: z.ZodOptional<z.ZodString>;
    dedalo_last_error: z.ZodOptional<z.ZodString>;
    data: z.ZodOptional<z.ZodAny>;
    context: z.ZodOptional<z.ZodAny>;
    total: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    csrf_token?: string | undefined;
    result?: any;
    msg?: string | undefined;
    errors?: string[] | undefined;
    debug?: any;
    dedalo_last_error?: string | undefined;
    data?: any;
    context?: any;
    total?: number | undefined;
}, {
    csrf_token?: string | undefined;
    result?: any;
    msg?: string | undefined;
    errors?: string[] | undefined;
    debug?: any;
    dedalo_last_error?: string | undefined;
    data?: any;
    context?: any;
    total?: number | undefined;
}>;
export type DedaloResponse = z.infer<typeof DedaloResponseSchema>;
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
export declare const PublicationRequestSchema: z.ZodObject<{
    code: z.ZodString;
    lang: z.ZodOptional<z.ZodString>;
    db_name: z.ZodOptional<z.ZodString>;
    options: z.ZodAny;
}, "strip", z.ZodTypeAny, {
    code: string;
    options?: any;
    lang?: string | undefined;
    db_name?: string | undefined;
}, {
    code: string;
    options?: any;
    lang?: string | undefined;
    db_name?: string | undefined;
}>;
export type PublicationRequest = z.infer<typeof PublicationRequestSchema>;
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
export declare const PublicationOptionsSchema: z.ZodObject<{
    dedalo_get: z.ZodString;
    table: z.ZodOptional<z.ZodString>;
    section_tipo: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodString>;
    id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
    ar_id: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber]>, "many">>;
    limit: z.ZodOptional<z.ZodNumber>;
    offset: z.ZodOptional<z.ZodNumber>;
    order: z.ZodOptional<z.ZodString>;
    fields: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    filter_by_locators: z.ZodOptional<z.ZodArray<z.ZodObject<{
        section_tipo: z.ZodString;
        section_id: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
        component_tipo: z.ZodOptional<z.ZodString>;
        tag_id: z.ZodOptional<z.ZodString>;
        type: z.ZodOptional<z.ZodString>;
        from_section_tipo: z.ZodOptional<z.ZodString>;
        from_section_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
    }, "strip", z.ZodTypeAny, {
        section_tipo: string;
        section_id: string | number;
        type?: string | undefined;
        from_section_tipo?: string | undefined;
        from_section_id?: string | number | undefined;
        component_tipo?: string | undefined;
        tag_id?: string | undefined;
    }, {
        section_tipo: string;
        section_id: string | number;
        type?: string | undefined;
        from_section_tipo?: string | undefined;
        from_section_id?: string | number | undefined;
        component_tipo?: string | undefined;
        tag_id?: string | undefined;
    }>, "many">>;
    sql_filter: z.ZodOptional<z.ZodString>;
    value: z.ZodOptional<z.ZodString>;
    search_thesaurus: z.ZodOptional<z.ZodBoolean>;
    add_parents: z.ZodOptional<z.ZodBoolean>;
    terms: z.ZodOptional<z.ZodBoolean>;
    q: z.ZodOptional<z.ZodString>;
    q_operator: z.ZodOptional<z.ZodString>;
    path: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tipo: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
    web_path: z.ZodOptional<z.ZodString>;
    term_id: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodString>;
    children: z.ZodOptional<z.ZodBoolean>;
    filter: z.ZodOptional<z.ZodString>;
    resolve_references: z.ZodOptional<z.ZodBoolean>;
    media: z.ZodOptional<z.ZodString>;
    db_name: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    dedalo_get: string;
    model?: string | undefined;
    tipo?: string | undefined;
    section_tipo?: string | undefined;
    value?: string | undefined;
    filter?: string | undefined;
    path?: string[] | undefined;
    type?: string | undefined;
    lang?: string | undefined;
    id?: string | number | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
    filter_by_locators?: {
        section_tipo: string;
        section_id: string | number;
        type?: string | undefined;
        from_section_tipo?: string | undefined;
        from_section_id?: string | number | undefined;
        component_tipo?: string | undefined;
        tag_id?: string | undefined;
    }[] | undefined;
    order?: string | undefined;
    db_name?: string | undefined;
    table?: string | undefined;
    ar_id?: (string | number)[] | undefined;
    fields?: string[] | undefined;
    sql_filter?: string | undefined;
    search_thesaurus?: boolean | undefined;
    add_parents?: boolean | undefined;
    terms?: boolean | undefined;
    q?: string | undefined;
    q_operator?: string | undefined;
    web_path?: string | undefined;
    term_id?: string | undefined;
    children?: boolean | undefined;
    resolve_references?: boolean | undefined;
    media?: string | undefined;
}, {
    dedalo_get: string;
    model?: string | undefined;
    tipo?: string | undefined;
    section_tipo?: string | undefined;
    value?: string | undefined;
    filter?: string | undefined;
    path?: string[] | undefined;
    type?: string | undefined;
    lang?: string | undefined;
    id?: string | number | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
    filter_by_locators?: {
        section_tipo: string;
        section_id: string | number;
        type?: string | undefined;
        from_section_tipo?: string | undefined;
        from_section_id?: string | number | undefined;
        component_tipo?: string | undefined;
        tag_id?: string | undefined;
    }[] | undefined;
    order?: string | undefined;
    db_name?: string | undefined;
    table?: string | undefined;
    ar_id?: (string | number)[] | undefined;
    fields?: string[] | undefined;
    sql_filter?: string | undefined;
    search_thesaurus?: boolean | undefined;
    add_parents?: boolean | undefined;
    terms?: boolean | undefined;
    q?: string | undefined;
    q_operator?: string | undefined;
    web_path?: string | undefined;
    term_id?: string | undefined;
    children?: boolean | undefined;
    resolve_references?: boolean | undefined;
    media?: string | undefined;
}>;
export type PublicationOptions = z.infer<typeof PublicationOptionsSchema>;
//# sourceMappingURL=index.d.ts.map