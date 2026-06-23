/**
 * Response builders for the PHP `dd_ontology_api` class
 * (core/api/v1/common/class.dd_ontology_api.php) — the ontology-read actions.
 *
 * These are PURE functions over an OntologyRepository plus a parameterised
 * queryer (the same Db that backs the repository). They re-derive each action's
 * `result` payload byte-faithfully from the live `dd_ontology` table. The handler
 * (ontology_api_handler.ts) wraps them in the {result,msg,errors} envelope.
 *
 * Ported actions (byte-reproducible from the ontology layer alone):
 *   - get_node         : the full ontology node descriptor for a tipo.
 *   - resolve_term     : ontology nodes matching `term` text (exact JSONB or fuzzy trigram).
 *   - resolve_section  : section nodes (+ their component tree) matching text.
 *   - search           : structured dd_ontology search by column values.
 *   - get_glossary      (mode=sections) : the compact multilingual sections glossary.
 *   - get_glossary      (mode=section)  : a section's component tree with portal metadata.
 *   - get_glossary      (mode=path) / resolve_path : an annotated relational hop-path.
 *
 * The two portal-walking paths (mode=section / resolve_path) call
 * extract_portal_targets, which in PHP resolves each target tipo via
 * ontology_node::get_term_by_tipo(string). When a portal stores a NON-string
 * target (e.g. a component_dataframe with section_tipo `{value:[4],...}`), PHP
 * passes an int to a string-typed argument and throws a TypeError → a generic
 * error envelope that cannot be byte-reproduced. The builders surface that case
 * via `PortalTargetNotString`, and the handler declines (proxies) it.
 */

import { DEDALO_STRUCTURE_LANG, type OntologyRepository } from '@dedalo/ontology';
import type { OntologyQueryer } from '@dedalo/ontology';

/** The dd_ontology table name (PHP dd_ontology_db_manager::$table). */
const DD_ONTOLOGY_TABLE = 'dd_ontology';

/**
 * Default model exclusions injected by `section::get_ar_recursive_children`
 * (verbatim). Subtrees rooted at these models are skipped during the component
 * walk for resolve_section / glossary mode=section.
 */
const SECTION_RECURSIVE_EXCLUDE_MODELS = [
  'box elements',
  'area',
  'component_semantic_node',
] as const;

/**
 * Raised when a portal target value resolves to a non-string (PHP would call
 * get_term_by_tipo(int) and throw a TypeError → generic error envelope). The
 * handler uses this to decline → proxy, since the error path is not byte-faithful.
 */
export class PortalTargetNotString extends Error {
  constructor(public readonly value: unknown) {
    super('Portal target tipo is not a string (PHP get_term_by_tipo would throw)');
    this.name = 'PortalTargetNotString';
  }
}

// ─────────────────────────────── node descriptor ─────────────────────────────

/**
 * The lightweight node descriptor (PHP `format_node_data`). Key order is
 * byte-significant: tipo, parent, term, model, model_tipo, tld, order_number,
 * is_model, is_translatable, properties.
 */
export interface NodeDescriptor {
  tipo: string;
  parent: string | null;
  term: Record<string, string> | null;
  model: string | null;
  model_tipo: string | null;
  tld: string | null;
  order_number: number | null;
  is_model: boolean;
  is_translatable: boolean;
  properties: Record<string, unknown> | null;
}

/**
 * Build the node descriptor for `tipo` (PHP `build_node_descriptor` +
 * `format_node_data`).
 *
 * PHP note: `build_node_descriptor` reads `ontology_node::get_data()`, which is an
 * EMPTY stdClass (never PHP-empty) for a missing tipo. The `if (empty($data))`
 * guard is therefore false even for a missing node, so PHP STILL emits a
 * descriptor with all fields null/false. We reproduce that: a missing tipo yields
 * an all-null descriptor (tipo echoed). The caller decides whether to keep it.
 */
export async function buildNodeDescriptor(
  ontology: OntologyRepository,
  tipo: string,
): Promise<NodeDescriptor> {
  const node = await ontology.getInstance(tipo);
  // node === null mirrors PHP's empty stdClass: every ?? falls through to null/false.
  return {
    tipo,
    parent: node?.parent ?? null,
    term: node?.term ?? null,
    model: node?.model ?? null,
    model_tipo: node?.modelTipo ?? null,
    tld: node?.tld ?? null,
    order_number: node?.orderNumber ?? null,
    is_model: node?.isModel ?? false,
    is_translatable: node?.isTranslatable ?? false,
    properties: node?.properties ?? null,
  };
}

// ───────────────────────────────── DB search ─────────────────────────────────

/**
 * A {operator,value} search predicate or a scalar (PHP search() column form).
 * For the JSONB containment operator `@>`, `value` is a plain object (e.g.
 * `{ 'lg-eng': 'Oral History' }`); the queryer (postgres.js) serialises it to a
 * jsonb object. PHP inlines the same shape as a JSON literal — identical match
 * semantics, and the SQL is not in the wire output, so this stays byte-faithful.
 */
type SearchValue =
  | string
  | number
  | boolean
  | { operator: string; value: string | Record<string, unknown> };

const ALLOWED_COLUMNS = new Set([
  'model',
  'parent',
  'tld',
  'is_model',
  'is_translatable',
]);
const BOOLEAN_COLUMNS = new Set(['is_model', 'is_translatable', 'is_main']);
const ALLOWED_OPS = new Set(['=', '!=', '<', '>', '<=', '>=', 'LIKE', 'ILIKE', '@>']);

/**
 * Port of `dd_ontology_db_manager::search()` — builds the dynamic WHERE over the
 * column allowlist and returns the matching tipos. Returns null on any invalid
 * column/operator (PHP returns false → the handler emits a db_search_failed error,
 * exactly like PHP).
 */
export async function searchOntology(
  queryer: OntologyQueryer,
  values: Record<string, SearchValue>,
  order: boolean,
  limit: number | null,
): Promise<string[] | null> {
  const keys = Object.keys(values);
  if (keys.length === 0) return null; // PHP: empty values → false

  const params: unknown[] = [];
  const whereClauses: string[] = [];
  let idx = 1;
  for (const col of keys) {
    if (!ALLOWED_COLUMNS.has(col) && col !== 'term' && col !== 'is_main') {
      return null; // PHP: invalid column → false
    }
    const value = values[col]!;
    if (typeof value === 'object' && value !== null) {
      if (!ALLOWED_OPS.has(value.operator)) return null; // PHP: invalid operator → false
      params.push(value.value);
      // The JSONB containment operator (`@>`, used by search_exact_term on the
      // `term` column) needs a jsonb right-hand side. PHP's pg_query_params sends
      // the value as type `unknown`, so PostgreSQL infers jsonb from the operator;
      // the postgres.js driver sends a typed `text` param, which yields
      // "operator does not exist: jsonb @> text". An explicit ::jsonb cast on the
      // placeholder restores the same containment semantics (the SQL is not in the
      // wire output, so this stays byte-faithful).
      const cast = value.operator === '@>' ? '::jsonb' : '';
      whereClauses.push(`"${col}" ${value.operator} $${idx}${cast}`);
    } else {
      let v: unknown = value;
      if (BOOLEAN_COLUMNS.has(col) && typeof v === 'boolean') v = v ? 'true' : 'false';
      params.push(v);
      whereClauses.push(`"${col}" = $${idx}`);
    }
    idx++;
  }

  const sql =
    `SELECT tipo FROM ${DD_ONTOLOGY_TABLE}` +
    ` WHERE ${whereClauses.join(' AND ')}` +
    (order ? ' ORDER BY order_number ASC' : '') +
    (limit ? ` LIMIT ${limit}` : '');

  const rows = await queryer.query<{ tipo: string }>(sql, params);
  return rows.map((r) => r.tipo);
}

/**
 * Port of `dd_ontology_db_manager::search_exact_term()` — JSONB containment match
 * (`term @> '{"<lang>":"<text>"}'`), optionally filtered by model / is_main.
 */
export async function searchExactTerm(
  queryer: OntologyQueryer,
  text: string,
  lang: string,
  model: string | null,
  isMain: boolean,
  limit: number,
): Promise<string[] | null> {
  // PHP inlines the JSON literal `{"<lang>":"<text>"}`. We pass the equivalent JS
  // object so postgres.js serialises a jsonb OBJECT (a string param would be
  // double-encoded into a jsonb scalar and never match).
  const values: Record<string, SearchValue> = {
    term: { operator: '@>', value: { [lang]: text } },
  };
  if (model) values['model'] = model;
  if (isMain) values['is_main'] = isMain;
  return searchOntology(queryer, values, false, limit);
}

/**
 * Port of `dd_ontology_db_manager::search_fuzzy_term()` — the two-phase
 * JSONPath-prefilter OR trigram-similarity query, ordered by similarity score
 * DESC. The JSONPath regex literal is inlined (escaped exactly as PHP) because
 * pg cannot parameterise inside a JSONPath string; the text value is a bind param.
 */
export async function searchFuzzyTerm(
  queryer: OntologyQueryer,
  text: string,
  model: string | null,
  isMain: boolean,
  limit: number,
): Promise<string[] | null> {
  // PHP: preg_replace('/([\\\\"])/', '\\\\$1', $text) then str_replace("'", "''", …).
  // 1) escape backslash and double-quote for JSONPath like_regex
  let jsonpathRegex = text.replace(/([\\"])/g, '\\$1');
  // 2) double single-quotes for the SQL string literal
  jsonpathRegex = jsonpathRegex.replace(/'/g, "''");

  const params: unknown[] = [];
  params.push(text);
  const trigramParam = 1;
  let idx = 2;

  const likeRegexClause = `term @? '$.* ? (@ like_regex "${jsonpathRegex}" flag "i")'`;
  const trigramClause = `f_unaccent(jsonb_values_as_text(term)) % f_unaccent($${trigramParam})`;
  const whereParts: string[] = [`(${likeRegexClause} OR ${trigramClause})`];

  if (model) {
    params.push(model);
    whereParts.push(`model = $${idx}`);
    idx++;
  }

  params.push(isMain ? 'true' : 'false');
  whereParts.push(`is_main = $${idx}`);
  idx++;

  const limitClause = limit > 0 ? ` LIMIT ${limit}` : '';
  const sql =
    `SELECT tipo, ` +
    `similarity(f_unaccent(jsonb_values_as_text(term)), f_unaccent($${trigramParam})) AS score ` +
    `FROM "${DD_ONTOLOGY_TABLE}" ` +
    `WHERE ${whereParts.join(' AND ')} ` +
    `ORDER BY score DESC` +
    limitClause;

  const rows = await queryer.query<{ tipo: string }>(sql, params);
  return rows.map((r) => r.tipo);
}

// ─────────────────────────── component-tree resolution ───────────────────────

/**
 * Resolve `section_tipo` to its canonical real tipo (PHP
 * `section::get_section_real_tipo_static` → `common::get_ar_related_by_model('section', tipo)`):
 * the first relation whose resolved model is exactly 'section', else the tipo itself.
 */
export async function getSectionRealTipo(
  ontology: OntologyRepository,
  sectionTipo: string,
): Promise<string> {
  const relations = await ontology.getRelations(sectionTipo);
  if (relations) {
    for (const rel of relations) {
      const relTipo = rel?.tipo;
      if (typeof relTipo === 'string' && relTipo !== '') {
        if ((await ontology.getModelByTipo(relTipo)) === 'section') return relTipo;
      }
    }
  }
  return sectionTipo;
}

/**
 * The component tipos within a section (PHP
 * `section::get_ar_children_tipo_by_model_name_in_section(tipo, ['component_'],
 * from_cache=true, resolve_virtual=true, recursive=true, search_exact=false)`),
 * restricted to the REAL-section case (the virtual exclude_elements override path
 * is un-ported; the handler declines virtual sections).
 *
 * Returns the recursive children whose RESOLVED model name contains 'component_',
 * de-duplicated, preserving the depth-first ontology order.
 */
export async function getSectionComponentTipos(
  ontology: OntologyRepository,
  sectionTipo: string,
): Promise<string[]> {
  const children = await ontology.getRecursiveChildren(sectionTipo, [
    ...SECTION_RECURSIVE_EXCLUDE_MODELS,
  ]);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tipo of children) {
    if (seen.has(tipo)) continue;
    const model = await ontology.getModelByTipo(tipo);
    if (model !== null && model.includes('component_')) {
      out.push(tipo);
      seen.add(tipo);
    }
  }
  return out;
}

/** A section descriptor (resolve_section): node descriptor + a components array. */
export interface SectionDescriptor extends NodeDescriptor {
  components: NodeDescriptor[];
}

/**
 * Build the resolve_section descriptor (PHP `build_section_descriptor`): the
 * section's own node descriptor plus a `components` array of basic node
 * descriptors. Uses the REAL section tipo for the component walk.
 */
export async function buildSectionDescriptor(
  ontology: OntologyRepository,
  sectionTipo: string,
): Promise<SectionDescriptor> {
  const base = await buildNodeDescriptor(ontology, sectionTipo);
  const componentTipos = await getSectionComponentTipos(ontology, sectionTipo);
  const components: NodeDescriptor[] = [];
  for (const t of componentTipos) {
    components.push(await buildNodeDescriptor(ontology, t));
  }
  return { ...base, components };
}

// ─────────────────────────────── portal targets ──────────────────────────────

/**
 * Whether `model` is one of the three cross-section portal families (PHP
 * str_starts_with against component_portal / component_dataframe / component_filter).
 */
export function isPortalModel(model: string): boolean {
  return (
    model.startsWith('component_portal') ||
    model.startsWith('component_dataframe') ||
    model.startsWith('component_filter')
  );
}

/** {tipo, term} pair for a portal target section (PHP target_section_term entry). */
export interface PortalTargetTerm {
  tipo: string;
  term: string | null;
}

/** The portal targets of a component (PHP `extract_portal_targets`). */
export interface PortalTargets {
  tipos: string[];
  terms: PortalTargetTerm[];
}

/**
 * Extract a portal component's target section tipos + terms (PHP
 * `extract_portal_targets`): walk properties.source.request_config[*].sqo.section_tipo,
 * normalising the v6 `{value:[…]}` / direct-string / DDO `{tipo:…}` shapes to a
 * plain tipo, de-duplicating, and resolving each term via get_term_by_tipo.
 *
 * Throws `PortalTargetNotString` when a normalised target is not a string — PHP
 * would pass it to the string-typed get_term_by_tipo and fatal, an error path we
 * do not reproduce.
 */
export async function extractPortalTargets(
  ontology: OntologyRepository,
  tipo: string,
): Promise<PortalTargets> {
  const tipos: string[] = [];
  const terms: PortalTargetTerm[] = [];

  const properties = await ontology.getProperties(tipo);
  if (!properties) return { tipos, terms };

  const source = (properties as { source?: unknown }).source;
  if (!source || typeof source !== 'object') return { tipos, terms };

  const requestConfig = (source as { request_config?: unknown }).request_config;
  if (!Array.isArray(requestConfig)) return { tipos, terms };

  for (const configItem of requestConfig) {
    const sqo = (configItem as { sqo?: unknown })?.sqo;
    if (!sqo || typeof sqo !== 'object') continue;

    let arSectionTipo = (sqo as { section_tipo?: unknown }).section_tipo;
    if (arSectionTipo === undefined) arSectionTipo = [];
    if (!Array.isArray(arSectionTipo)) arSectionTipo = [arSectionTipo];

    for (const targetEntry of arSectionTipo as unknown[]) {
      let targetTipo: unknown = null;

      if (targetEntry && typeof targetEntry === 'object' && 'value' in targetEntry) {
        // v6: {value:[…], source:…}. PHP keeps the LAST value when it's an array.
        const vals = (targetEntry as { value: unknown }).value;
        if (Array.isArray(vals)) {
          for (const v of vals) targetTipo = v;
        } else {
          targetTipo = vals;
        }
      } else if (typeof targetEntry === 'string') {
        targetTipo = targetEntry;
      } else if (targetEntry && typeof targetEntry === 'object' && 'tipo' in targetEntry) {
        targetTipo = (targetEntry as { tipo: unknown }).tipo;
      }

      if (targetTipo === null) continue;
      // PHP: in_array() de-dup BEFORE the get_term_by_tipo(string) call. A non-string
      // target reaching that call fatals in PHP → we decline (proxy) the whole request.
      if (typeof targetTipo !== 'string') {
        if (!tipos.includes(targetTipo as never)) {
          throw new PortalTargetNotString(targetTipo);
        }
        continue;
      }
      if (!tipos.includes(targetTipo)) {
        tipos.push(targetTipo);
        const term = await ontology.getLabel(targetTipo, DEDALO_STRUCTURE_LANG);
        terms.push({ tipo: targetTipo, term });
      }
    }
  }

  return { tipos, terms };
}

// ───────────────────────────────── glossary ──────────────────────────────────

/** A compact sections-glossary entry (PHP glossary_sections). */
export interface GlossaryEntry {
  section_tipo: string;
  term: Record<string, string> | null;
  tld: string | null;
}

/**
 * Build the compact sections glossary (PHP `glossary_sections`): up to 500
 * section-model nodes, re-checking model==='section' and skipping term-less nodes,
 * keeping the DB order.
 */
export async function buildGlossarySections(
  ontology: OntologyRepository,
  queryer: OntologyQueryer,
): Promise<GlossaryEntry[]> {
  const tipos = await searchOntology(queryer, { model: 'section' }, true, 500);
  if (tipos === null) return [];
  const out: GlossaryEntry[] = [];
  for (const tipo of tipos) {
    const node = await ontology.getInstance(tipo);
    if (node === null) continue;
    if (node.model !== 'section') continue;
    const term = node.term ?? null;
    if (!term || Object.keys(term).length === 0) continue;
    out.push({ section_tipo: tipo, term, tld: node.tld ?? null });
  }
  return out;
}

/** A portal-aware component descriptor (glossary mode=section). */
export interface GlossaryComponentDescriptor extends NodeDescriptor {
  is_portal: boolean;
  target_section_tipo?: string[];
  target_section_term?: PortalTargetTerm[];
}

/** A glossary section descriptor (PHP build_glossary_section_descriptor). */
export interface GlossarySectionDescriptor {
  section_tipo: string;
  term: Record<string, string> | null;
  tld: string | null;
  components: GlossaryComponentDescriptor[];
}

/**
 * Build a portal-aware component descriptor (PHP `build_component_descriptor`):
 * the basic node descriptor plus is_portal and (for portal models) the
 * target_section_tipo / target_section_term metadata.
 *
 * May throw `PortalTargetNotString` (see extractPortalTargets).
 */
export async function buildGlossaryComponentDescriptor(
  ontology: OntologyRepository,
  componentTipo: string,
): Promise<GlossaryComponentDescriptor> {
  const base = await buildNodeDescriptor(ontology, componentTipo);
  const model = base.model ?? '';
  if (isPortalModel(model)) {
    const targets = await extractPortalTargets(ontology, componentTipo);
    return {
      ...base,
      is_portal: true,
      target_section_tipo: targets.tipos,
      target_section_term: targets.terms,
    };
  }
  return { ...base, is_portal: false };
}

/**
 * Build the glossary section descriptor (PHP `build_glossary_section_descriptor`):
 * {section_tipo, term, tld, components[]} where each component carries portal
 * metadata. REAL-section only (the handler declines virtual sections).
 *
 * Returns null when the section node is missing (PHP empty data → null →
 * section_not_found). May throw `PortalTargetNotString`.
 */
export async function buildGlossarySectionDescriptor(
  ontology: OntologyRepository,
  sectionTipo: string,
): Promise<GlossarySectionDescriptor | null> {
  const node = await ontology.getInstance(sectionTipo);
  // PHP: empty($data) → null. An empty stdClass is NOT PHP-empty, so a missing
  // tipo still passes; we mirror PHP by treating a missing node (null) as present
  // with null fields ONLY if the row truly exists. Here a null node === missing row.
  if (node === null) return null;

  const componentTipos = await getSectionComponentTipos(ontology, sectionTipo);
  const components: GlossaryComponentDescriptor[] = [];
  for (const t of componentTipos) {
    components.push(await buildGlossaryComponentDescriptor(ontology, t));
  }
  return {
    section_tipo: sectionTipo,
    term: node.term ?? null,
    tld: node.tld ?? null,
    components,
  };
}

// ──────────────────────────────── resolve_path ───────────────────────────────

/** One annotated hop in a resolved path (PHP resolve_path_hops hop object). */
export interface PathHop {
  tipo: string;
  model: string;
  term: Record<string, string> | null;
  is_portal: boolean;
  target_section_tipo?: string[];
  section_tipo?: string;
  column_type?: string;
}

/** The resolved-path result (PHP resolve_path_hops). */
export interface ResolvedPath {
  path: PathHop[];
  hop_count: number;
  leaf_tipo: string;
  leaf_model: string;
  leaf_column_type: string | null;
}

/**
 * Map a component model to its matrix-table column type (PHP
 * `get_component_column_type`), prefix-matched in PHP's match-arm order.
 */
export function getComponentColumnType(model: string): string {
  const sw = (p: string) => model.startsWith(p);
  if (sw('component_input_text') || sw('component_text_area') || sw('component_email') || sw('component_password')) {
    return 'string';
  }
  if (
    sw('component_portal') ||
    sw('component_select') ||
    sw('component_radio_button') ||
    sw('component_check_box') ||
    sw('component_autocomplete_hi') ||
    sw('component_dataframe') ||
    sw('component_publication') ||
    sw('component_external') ||
    sw('component_filter') ||
    sw('component_relation_children') ||
    sw('component_relation_index') ||
    sw('component_relation_model') ||
    sw('component_relation_parent') ||
    sw('component_relation_related')
  ) {
    return 'relation';
  }
  if (sw('component_date')) return 'date';
  if (sw('component_geolocation')) return 'geo';
  if (sw('component_number')) return 'number';
  if (sw('component_av') || sw('component_image') || sw('component_3d') || sw('component_pdf') || sw('component_svg')) {
    return 'media';
  }
  if (sw('component_iri')) return 'iri';
  if (sw('component_section_id')) return 'section_id';
  return 'misc';
}

/**
 * Walk and annotate a relational hop-path (PHP `resolve_path_hops`). Returns null
 * on any invalid tipo, missing node, or portal-traversal validation failure (PHP
 * returns null → path_resolution_failed). May throw `PortalTargetNotString`.
 */
export async function resolvePathHops(
  ontology: OntologyRepository,
  path: string[],
): Promise<ResolvedPath | null> {
  const hops: PathHop[] = [];

  for (let index = 0; index < path.length; index++) {
    const tipo = path[index]!;
    if (!(await checkTipoIsValid(ontology, tipo))) return null;

    const node = await ontology.getInstance(tipo);
    if (node === null) return null; // PHP empty($data) → null

    const model = node.model ?? '';
    const hop: PathHop = {
      tipo,
      model,
      term: node.term ?? null,
      is_portal: false,
    };

    if (isPortalModel(model)) {
      hop.is_portal = true;
      const targets = await extractPortalTargets(ontology, tipo);
      hop.target_section_tipo = targets.tipos;

      const nextIndex = index + 1;
      if (nextIndex < path.length) {
        const nextTipo = path[nextIndex]!;
        if (!targets.tipos.includes(nextTipo)) {
          const nextModel = await ontology.getModelByTipo(nextTipo);
          if (nextModel !== 'section') {
            const nextParent = await ontology.getParent(nextTipo);
            const nextParentReal =
              nextParent !== null ? await getSectionRealTipo(ontology, nextParent) : null;
            if (nextParentReal === null || !targets.tipos.includes(nextParentReal)) {
              return null;
            }
          }
        }
      }
    } else {
      hop.is_portal = false;
      if (model === 'section') hop.section_tipo = tipo;
    }

    const nextIndex = index + 1;
    if (nextIndex >= path.length && model.startsWith('component_')) {
      hop.column_type = getComponentColumnType(model);
    }

    hops.push(hop);
  }

  const leaf = hops[hops.length - 1];
  const result: ResolvedPath = {
    path: hops,
    hop_count: hops.length,
    leaf_tipo: leaf?.tipo ?? '',
    leaf_model: leaf?.model ?? '',
    leaf_column_type: leaf?.column_type ?? null,
  };
  return result;
}

// ─────────────────────────────────── utils ───────────────────────────────────

/**
 * Port of `safe_tipo()` (shared/core_functions.php): a string matching
 * `^[a-z]{2,}[0-9]+$` (≥2 lowercase letters then ≥1 digits), e.g. 'oh1', 'rsc197'.
 */
export function isSafeTipo(tipo: unknown): boolean {
  return typeof tipo === 'string' && /^[a-z]{2,}[0-9]+$/.test(tipo);
}

/**
 * Port of `ontology_utils::check_tipo_is_valid()`: safe_tipo() AND (the node is a
 * model OR has a resolvable model — i.e. it exists in dd_ontology). Async because
 * the existence check reads the ontology.
 */
export async function checkTipoIsValid(
  ontology: OntologyRepository,
  tipo: unknown,
): Promise<boolean> {
  if (!isSafeTipo(tipo)) return false;
  const t = tipo as string;
  if (await ontology.getIsModel(t)) return true;
  const model = await ontology.getModelByTipo(t);
  return model !== null && model !== '';
}
