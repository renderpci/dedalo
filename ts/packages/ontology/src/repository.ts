import { tryCtx, type RequestCaches } from '@dedalo/runtime';
import {
  AREA_MAINTENANCE_TIPO,
  DEDALO_STRUCTURE_LANG,
  FORCED_MODELS,
  MODEL_MAP,
  PARENT_ZERO,
  TEMPORAL_MODELS,
} from './constants.ts';
import type {
  OntologyNodeData,
  OntologyQueryer,
  PropertiesObject,
  RelationNode,
  TermMap,
} from './types.ts';

/**
 * Read-side port of PHP `ontology_node` (+ the read parts of `ontology_utils`).
 *
 * One repository serves all tipos; it loads a node row from `dd_ontology` on
 * demand and exposes the ported read methods (labels, models, parent/children,
 * recursive children, relations, properties, translatable).
 *
 * ── Caching ─────────────────────────────────────────────────────────────────
 * PHP cached loaded nodes in process-static arrays (`ontology_node::$instances`,
 * `dd_ontology_db_manager::$load_cache`) reset between requests by common::clear().
 * In a persistent Bun process a module-global mutable cache would leak one
 * request's data into another, so per-request state MUST live on the
 * @dedalo/runtime RequestContext.
 *
 * This repository memoises loaded rows under the 'ontologyNode' cache:
 *   - When called inside a request scope (tryCtx() !== undefined), it uses
 *     `ctx().caches` so the cache is shared across all repositories in that
 *     request and disappears with the context — exactly like the PHP statics,
 *     minus the cross-request leak.
 *   - When called OUTSIDE a request scope (e.g. unit tests, or one-off scripts),
 *     it falls back to a private cache scoped to THIS repository instance. That
 *     cache is created lazily and lives only as long as the instance, so it is
 *     not a process-global mutable cache either. (You may also inject an explicit
 *     RequestCaches via the constructor to force a known cache in tests.)
 *
 * The cache is read-only data keyed by tipo; this phase ports no writes, so no
 * invalidation is needed within a request.
 */
export class OntologyRepository {
  /**
   * Fallback per-instance cache used only when there is no active request
   * context. Keyed by tipo → loaded node (or null when the tipo is absent in
   * dd_ontology). Lazily created. Not module-global: scoped to this instance.
   */
  private localCache: Map<string, OntologyNodeData | null> | undefined;

  /**
   * @param queryer  Anything with `query(text, params)` — a Db, a DbSession, or a
   *                 test stub. The repository only issues parameterised SELECTs.
   * @param injectedCaches  Optional RequestCaches to use unconditionally (tests).
   *                 When omitted, the active request's caches are used if present,
   *                 otherwise the per-instance fallback cache.
   */
  constructor(
    private readonly queryer: OntologyQueryer,
    private readonly injectedCaches?: RequestCaches,
  ) {}

  // ───────────────────────── node loading + caching ──────────────────────────

  /**
   * Load (and cache) the node row for `tipo`. Returns null when the tipo does not
   * exist in dd_ontology (mirrors PHP read() returning [] for a missing row, which
   * yields an empty data object whose getters all return null/false).
   *
   * Caching resolution (see class docblock): request caches if in a request,
   * else the per-instance fallback.
   */
  async getInstance(tipo: string): Promise<OntologyNodeData | null> {
    if (!tipo) return null;

    const cache = this.requestCaches();
    if (cache) {
      // RequestCaches.memo is synchronous, so we can't memo the promise body
      // directly; instead check/get then set to keep "factory called once".
      const cached = cache.get<OntologyNodeData | null>('ontologyNode', tipo);
      if (cached !== undefined) return cached;
      const loaded = await this.loadRow(tipo);
      // Re-check: a concurrent load may have populated it; first writer wins but
      // both produce equal data, so a plain set is fine and keeps semantics simple.
      cache.set('ontologyNode', tipo, loaded);
      return loaded;
    }

    // Fallback: per-instance cache.
    const local = (this.localCache ??= new Map());
    if (local.has(tipo)) return local.get(tipo) ?? null;
    const loaded = await this.loadRow(tipo);
    local.set(tipo, loaded);
    return loaded;
  }

  /** The caches to use, or undefined when running outside a request scope. */
  private requestCaches(): RequestCaches | undefined {
    if (this.injectedCaches) return this.injectedCaches;
    return tryCtx()?.caches;
  }

  /** Issue the SELECT and hydrate the row into OntologyNodeData (or null). */
  private async loadRow(tipo: string): Promise<OntologyNodeData | null> {
    const sql =
      'SELECT tipo, parent, term, model, order_number, relations, tld, properties, ' +
      'model_tipo, is_model, is_translatable, is_main ' +
      'FROM "dd_ontology" WHERE tipo = $1 LIMIT 1';
    const rows = await this.queryer.query<RawRow>(sql, [tipo]);
    const row = rows[0];
    if (row === undefined) return null;
    return hydrate(row);
  }

  // ───────────────────────────── label / term ────────────────────────────────

  /**
   * Resolve the raw `term` map for a tipo, or null. Port of `get_term_data()`.
   */
  async getTermData(tipo: string): Promise<TermMap | null> {
    const node = await this.getInstance(tipo);
    return node?.term ?? null;
  }

  /**
   * Resolve the label (term) for `tipo` in `lang`, with PHP fallback semantics
   * (port of `get_term()` + `get_term_by_tipo()`):
   *   1. Requested `lang`, if present and non-empty.
   *   2. (fallback) any langs in `fallbackLangs`, in order — this is the TS seam
   *      replacing PHP `lang::get_label_lang()` equivalence normalisation
   *      (e.g. Catalan↔Valencian). Defaults to none.
   *   3. (fallback) DEDALO_STRUCTURE_LANG ('lg-spa').
   *   4. (fallback) the first non-empty value across all term languages.
   * Returns null when no non-empty label is available, or the tipo is missing.
   *
   * Pass `fallbackLangs: null` (or set the 4th arg) to disable fallback entirely,
   * mirroring PHP `$fallback = false`.
   */
  async getLabel(
    tipo: string,
    lang: string,
    fallbackLangs: readonly string[] | null = [],
    fallback = true,
  ): Promise<string | null> {
    if (!tipo) return null;
    const term = await this.getTermData(tipo);
    if (term === null) return null;

    // requested lang first
    const direct = term[lang];
    if (direct !== undefined && direct !== '') return direct;

    if (!fallback) return null;

    // caller-supplied equivalence langs (replaces lang::get_label_lang())
    if (fallbackLangs) {
      for (const fl of fallbackLangs) {
        const v = term[fl];
        if (v !== undefined && v !== '') return v;
      }
    }

    // structure lang
    const structure = term[DEDALO_STRUCTURE_LANG];
    if (structure !== undefined && structure !== '') return structure;

    // anything non-empty
    for (const value of Object.values(term)) {
      if (value !== undefined && value !== null && value !== '') return value;
    }

    return null;
  }

  // ──────────────────────────────── model ────────────────────────────────────

  /**
   * Resolve the fully-mapped model name for `tipo`. Port of `get_model()` +
   * `get_model_by_tipo()`. Resolution order:
   *   1. FORCED_MODELS override.
   *   2. TEMPORAL_MODELS override.
   *   3. the node's raw `model` column.
   *   4. legacy fallback via `model_tipo` → that node's term in STRUCTURE_LANG
   *      (no fallback). PHP logs an error here; we resolve silently.
   *   5. the dd88 → 'area_maintenance' special case.
   * Then the MODEL_MAP legacy-name replacement is applied. Returns null when no
   * model can be resolved (missing tipo, empty model).
   */
  async getModelByTipo(tipo: string): Promise<string | null> {
    if (!tipo) return null;

    // forced / temporal overrides do not require the node to exist
    const forced = FORCED_MODELS[tipo];
    if (forced !== undefined) return forced;
    const temporal = TEMPORAL_MODELS[tipo];
    if (temporal !== undefined) return temporal;

    const node = await this.getInstance(tipo);
    if (node === null) return null;

    let model: string | null = node.model && node.model !== '' ? node.model : null;

    if (model === null) {
      const modelTipo = node.modelTipo;
      if (!modelTipo) {
        if (tipo === AREA_MAINTENANCE_TIPO) {
          return 'area_maintenance';
        }
        return null;
      }
      // legacy: resolve via the model node's term in STRUCTURE_LANG, no fallback
      model = await this.getLabel(modelTipo, DEDALO_STRUCTURE_LANG, null, false);
      if (!model) return null;
    }

    return MODEL_MAP[model] ?? model;
  }

  // ──────────────────────── parent / children / siblings ──────────────────────

  /** Parent tipo of `tipo`, or null for a root/missing node. Port of `get_parent()`. */
  async getParent(tipo: string): Promise<string | null> {
    const node = await this.getInstance(tipo);
    return node?.parent ?? null;
  }

  /**
   * Direct child tipos of `tipo`, ordered by `order_number ASC`. Port of
   * `get_ar_children_of_this()` (PHP search({parent}, order=true)). Returns [] for
   * a leaf node, a missing tipo, or an empty tipo.
   */
  async getChildren(tipo: string): Promise<string[]> {
    if (!tipo) return [];
    const sql =
      'SELECT tipo FROM "dd_ontology" WHERE parent = $1 ORDER BY order_number ASC';
    const rows = await this.queryer.query<{ tipo: string }>(sql, [tipo]);
    return rows.map((r) => r.tipo);
  }

  /**
   * All descendant tipos of `tipo`, depth-first pre-order. Port of
   * `get_ar_recursive_children()` (static, stateless): the starting tipo is NOT
   * included; each child is emitted before its own sub-children. `excludeModels`
   * skips a child AND its entire subtree when the child's resolved model is in the
   * set (mirrors the PHP exclusion). Returns [] for a leaf/missing tipo.
   */
  async getRecursiveChildren(
    tipo: string,
    excludeModels?: readonly string[],
  ): Promise<string[]> {
    if (!tipo) return [];
    const exclude = excludeModels && excludeModels.length > 0 ? new Set(excludeModels) : null;
    const resolved: string[] = [];
    await this.collectRecursiveChildren(tipo, exclude, resolved, false);
    return resolved;
  }

  private async collectRecursiveChildren(
    tipo: string,
    exclude: Set<string> | null,
    resolved: string[],
    isRecursion: boolean,
  ): Promise<void> {
    // PHP adds the tipo only on recursive frames, so the top-level node is excluded.
    if (isRecursion) resolved.push(tipo);

    const children = await this.getChildren(tipo);
    for (const childTipo of children) {
      if (exclude) {
        const model = await this.getModelByTipo(childTipo);
        if (model !== null && exclude.has(model)) continue; // skip child + subtree
      }
      await this.collectRecursiveChildren(childTipo, exclude, resolved, true);
    }
  }

  /**
   * All ancestor tipos of `tipo`, walking up via parent until a root / 'dd0' /
   * cycle is reached. Port of `get_ar_parents_of_this()`. 'dd0' is always
   * excluded; the walk stops on a cycle back to the first parent.
   *
   * The PHP method collects ancestors nearest-first (`[0=>nearest … N=>farthest]`)
   * and, when `$ksort = true` (the PHP DEFAULT), applies `krsort()` so iteration
   * runs farthest-ancestor → nearest. As a flat TS array we reproduce that
   * iteration order:
   *   - ksort = true  (default): farthest-first  → `[farthest, …, immediate]`
   *   - ksort = false:           nearest-first   → `[immediate, …, farthest]`
   *
   * Returns [] for root/missing nodes.
   */
  async getParents(tipo: string, ksort = true): Promise<string[]> {
    const parents: string[] = []; // nearest-first as collected
    let parent = await this.getParent(tipo);
    if (!parent) return parents;

    const parentInicial = parent;
    do {
      if (parent !== PARENT_ZERO) parents.push(parent);
      const next = await this.getParent(parent);
      parent = next;
    } while (
      parent !== null &&
      parent !== '' &&
      parent !== PARENT_ZERO &&
      parent !== parentInicial
    );

    // ksort=true (PHP default) → krsort iteration is farthest-first, so reverse
    // the nearest-first collection. ksort=false → keep nearest-first.
    return ksort ? [...parents].reverse() : parents;
  }

  /**
   * Sibling tipos (all children of `tipo`'s parent), INCLUDING `tipo` itself —
   * PHP `get_ar_siblings_of_this()` does not filter the node out. Returns [] when
   * the node is missing or has no parent that yields children.
   */
  async getSiblings(tipo: string): Promise<string[]> {
    const parent = await this.getParent(tipo);
    if (!parent) return [];
    // PHP search({parent}) with no order flag → no ORDER BY.
    const sql = 'SELECT tipo FROM "dd_ontology" WHERE parent = $1';
    const rows = await this.queryer.query<{ tipo: string }>(sql, [parent]);
    return rows.map((r) => r.tipo);
  }

  // ───────────────────────────── relations etc. ──────────────────────────────

  /**
   * Raw relations array for `tipo`, or null. Port of `get_relations()`.
   * Use `simple=true` for a flat list of related tipos (port of
   * `get_relation_nodes(simple=true)` / `get_relation_tipos()`), which skips
   * entries lacking a `tipo`.
   */
  async getRelations(tipo: string): Promise<RelationNode[] | null> {
    const node = await this.getInstance(tipo);
    return node?.relations ?? null;
  }

  /** Flat list of related tipos (skips invalid entries). Port of `get_relation_tipos()`. */
  async getRelationTipos(tipo: string): Promise<string[] | null> {
    const relations = await this.getRelations(tipo);
    if (!relations || relations.length === 0) return null;
    const out: string[] = [];
    for (const rel of relations) {
      if (rel && typeof rel.tipo === 'string' && rel.tipo !== '') out.push(rel.tipo);
    }
    return out;
  }

  /**
   * Properties config object for `tipo`, or null. Port of `get_properties()` —
   * returns a deep clone to prevent accidental mutation of the cached node.
   */
  async getProperties(tipo: string): Promise<PropertiesObject | null> {
    const node = await this.getInstance(tipo);
    const props = node?.properties ?? null;
    if (!props) return null;
    return structuredClone(props);
  }

  /**
   * Whether `tipo`'s component data is language-sensitive. Port of the static
   * `get_translatable()` → `get_is_translatable()`. Returns false for a missing
   * tipo (PHP empty data object yields false).
   */
  async getTranslatable(tipo: string): Promise<boolean> {
    const node = await this.getInstance(tipo);
    return node?.isTranslatable ?? false;
  }

  /** Whether `tipo` is a model node. Port of `get_is_model()`. */
  async getIsModel(tipo: string): Promise<boolean> {
    const node = await this.getInstance(tipo);
    return node?.isModel ?? false;
  }

  /** Whether `tipo` is a namespace-root node. Port of `get_is_main()`. */
  async getIsMain(tipo: string): Promise<boolean> {
    const node = await this.getInstance(tipo);
    return node?.isMain ?? false;
  }

  /** `order_number` of `tipo`, or null. Port of `get_order_number()`. */
  async getOrderNumber(tipo: string): Promise<number | null> {
    const node = await this.getInstance(tipo);
    return node?.orderNumber ?? null;
  }

  /** TLD namespace of `tipo`, or null. Port of `get_tld()`. */
  async getTld(tipo: string): Promise<string | null> {
    const node = await this.getInstance(tipo);
    return node?.tld ?? null;
  }

  /**
   * Legacy (v6) model name for `tipo`, or null. Port of
   * `ontology_node::get_legacy_model_by_tipo()` → `get_legacy_model()`:
   * the term of this node's `model_tipo` in DEDALO_STRUCTURE_LANG, with the
   * standard label fallback (PHP `get_term($lang, $fallback=true)`).
   * Returns null when the node or its model_tipo is missing.
   */
  async getLegacyModel(tipo: string): Promise<string | null> {
    const node = await this.getInstance(tipo);
    const modelTipo = node?.modelTipo;
    if (!modelTipo) return null;
    return this.getLabel(modelTipo, DEDALO_STRUCTURE_LANG);
  }
}

// ───────────────────────────────── hydration ─────────────────────────────────

/**
 * Raw DB row shape. @dedalo/db / postgres.js already parses JSONB columns to JS
 * objects and integer columns to numbers; booleans come back as JS booleans. We
 * defensively coerce anyway so the in-memory stub can feed strings if it wants.
 */
interface RawRow {
  tipo: string;
  parent: string | null;
  term: unknown;
  model: string | null;
  order_number: number | string | null;
  relations: unknown;
  tld: string | null;
  properties: unknown;
  model_tipo: string | null;
  is_model: unknown;
  is_translatable: unknown;
  is_main: unknown;
}

function hydrate(row: RawRow): OntologyNodeData {
  return {
    tipo: row.tipo,
    parent: row.parent ?? null,
    term: asObject<TermMap>(row.term),
    model: row.model ?? null,
    orderNumber: asInt(row.order_number),
    relations: asArray<RelationNode>(row.relations),
    tld: row.tld ?? null,
    properties: asObject<PropertiesObject>(row.properties),
    modelTipo: row.model_tipo ?? null,
    isModel: asBool(row.is_model),
    isTranslatable: asBool(row.is_translatable),
    isMain: asBool(row.is_main),
  };
}

function asObject<T>(v: unknown): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as T) : null;
    } catch {
      return null;
    }
  }
  return typeof v === 'object' && !Array.isArray(v) ? (v as T) : null;
}

function asArray<T>(v: unknown): T[] | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : null;
    } catch {
      return null;
    }
  }
  return Array.isArray(v) ? (v as T[]) : null;
}

function asInt(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number.parseInt(v, 10);
  return Number.isInteger(n) ? n : null;
}

function asBool(v: unknown): boolean {
  // PHP read(): ($value === 't' || $value === true || $value === '1').
  return v === true || v === 't' || v === '1';
}
