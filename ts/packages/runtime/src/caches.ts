/**
 * Per-request memoization stores.
 *
 * In PHP these were class-static arrays (`common::$cache_structure_context`,
 * `$cache_order_path`, `$cache_matrix_table_from_tipo`, `$cache_get_tools`, …)
 * reset between requests by `common::clear()`. In a persistent Bun process a
 * module-level mutable cache would leak one user's data/permissions into another
 * request — a correctness AND security bug. So every such cache lives here, on the
 * RequestContext, and simply disappears when the context is GC'd. There is no
 * global `clear()` to forget to call.
 *
 * The names mirror the PHP caches 1:1 so the port is auditable.
 */
export type CacheName =
  | 'structureContext' // common::$cache_structure_context
  | 'requestConfig' // build_request_config results
  | 'orderPath' // common::$cache_order_path
  | 'matrixTableFromTipo' // common::$cache_matrix_table_from_tipo
  | 'relatedByModel' // common::$ar_related_by_model_data
  | 'resolvedRequestProperties' // common::$resolved_request_properties_parsed
  | 'tools' // common::$cache_get_tools
  | 'buttonsTools' // common::$cache_buttons_tools
  | 'ontologyNode' // ontology_node::$instances
  | 'sectionRecord' // section_record instance cache
  | 'component' // component instance cache
  | 'datalist' // option-list resolution cache
  | 'permissions'; // resolved per-user permission cache

export class RequestCaches {
  private readonly stores = new Map<CacheName, Map<string, unknown>>();

  /** Lazily get (or create) a named store. */
  store(name: CacheName): Map<string, unknown> {
    let s = this.stores.get(name);
    if (s === undefined) {
      s = new Map<string, unknown>();
      this.stores.set(name, s);
    }
    return s;
  }

  /**
   * Memoize `factory()` under (name, key) for the lifetime of this request.
   * The factory runs at most once per distinct key within the request.
   */
  memo<T>(name: CacheName, key: string, factory: () => T): T {
    const s = this.store(name);
    if (s.has(key)) return s.get(key) as T;
    const v = factory();
    s.set(key, v);
    return v;
  }

  get<T>(name: CacheName, key: string): T | undefined {
    return this.stores.get(name)?.get(key) as T | undefined;
  }

  set(name: CacheName, key: string, value: unknown): void {
    this.store(name).set(key, value);
  }

  /** Total cached entries across all stores (test/diagnostic aid). */
  size(): number {
    let n = 0;
    for (const s of this.stores.values()) n += s.size;
    return n;
  }
}
