import type { Sqo, FilterRule, Locator } from '../types/index.js';
/**
    * CLASS SQO_BUILDER
    * Fluent builder that produces a Dédalo `search_query_object` (SQO).
    *
    * What: Dédalo's `read` / `read_raw` / `count` actions accept an `sqo`
    * field controlling pagination, filtering, sorting, and locators.
    * Rather than assembling raw JSON by hand, callers chain methods and
    * call `build()` to receive a validated `Sqo` object.
    *
    * Why: SQO shapes are verbose and easy to mistype (e.g. `filter_by_locators`
    * vs `filter_by_locator`).  A builder guarantees structural correctness
    * at compile time and keeps the call-site readable for LLM-generated code.
    *
    * How: every mutating method returns `this` for chaining.  The internal
    * `Partial<Sqo>` accumulator is cast to the full `Sqo` type on `build()`.
    *
    * Example:
    * ```ts
    * const sqo = new SqoBuilder('oh1')
    *   .limit(10)
    *   .filter('AND', [
    *     { path: 'oh14', operator: 'contains', value: 'interview' }
    *   ])
    *   .order('oh14', 'DESC')
    *   .fullCount()
    *   .build();
    * ```
    */
export declare class SqoBuilder {
    private sqo;
    /**
     * @param section_tipo  Target section(s).  String for one section;
     *                      array for cross-section search.
     */
    constructor(section_tipo: string | string[]);
    /** Cap the number of returned records. */
    limit(n: number): this;
    /** Skip the first `n` records (pagination). */
    offset(n: number): this;
    /**
     * Attach a logical filter tree.
     * @param operator  `'AND'` or `'OR'` combining the rules.
     * @param rules     Array of `FilterRule` or nested `Filter` objects.
     */
    filter(operator: "AND" | "OR" | undefined, rules: FilterRule[]): this;
    /**
     * FILTER_BY_LOCATORS
     * Select specific records by their `{ section_tipo, section_id }` pairs.
     *
     * Why: `read_record` uses this instead of a general `filter` so the
     * MCP tool intent is unambiguous (single-record lookup vs broad search).
     */
    filterByLocators(locators: Locator[]): this;
    /** Whitelist of component tipos to return (projection). */
    select(fields: string[]): this;
    /**
     * ORDER
     * Append a sort clause.  Multiple calls stack.
     * @param path       Tipo path to sort by.
     * @param direction  `'ASC'` (default) or `'DESC'`.
     */
    order(path: string, direction?: 'ASC' | 'DESC'): this;
    /**
     * FULL_COUNT
     * Request the total count of matching rows (ignoring limit/offset).
     *
     * Why: pagination UIs need "page 1 of 47"; `full_count` adds `total`
     * to the Dédalo response without returning every row.
     */
    fullCount(enabled?: boolean): this;
    /**
     * SKIP_PROJECTS_FILTER
     * Bypass the user's project-level visibility filter.
     *
     * Why: admin / ontology tools may need records the current user would
     * normally not see.  Use sparingly — requires elevated permissions
     * on the Dédalo server.
     */
    skipProjectsFilter(skip?: boolean): this;
    /** Include dataset-style metadata in the response. */
    allowDataset(allow?: boolean): this;
    /** Expand hierarchical relationships recursively (thesaurus / tree views). */
    childrenRecursive(recursive?: boolean): this;
    /** Force a specific UI mode override (rarely needed). */
    fixedMode(mode: string): this;
    /** Set the record type discriminator (e.g. `'interview'`). */
    type(t: string): this;
    /** Return the accumulated SQO object for injection into an RQO. */
    build(): Sqo;
}
//# sourceMappingURL=sqo_builder.d.ts.map