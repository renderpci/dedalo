/**
 * Read-side port of the tools subsystem needed by `common::get_tools()` +
 * `tool_common::create_tool_simple_context()` for a COMPONENT context.
 *
 * Scope (this phase): the ROOT (DEDALO_SUPERUSER) path only. For root,
 * `tool_common::get_user_tools()` returns ALL registered tools unfiltered (no
 * per-profile authorization), so this module reproduces:
 *   - get_all_registered_tools() / create_simple_tool_object() → read active tool
 *     records from the dd1324 registry (matrix_tools table) and build the simple
 *     tool objects.
 *   - common::get_tools()         → filter those tools per the component
 *     (affected_models / affected_tipos / all_components, dd15 rule, tool-declared
 *     is_available, requirement_translatable).
 *   - create_tool_simple_context()→ build the per-tool DDO (the entries of the
 *     context `tools` array).
 *
 * DEFERRED (declined / not reached for root):
 *   - non-root per-profile tool authorization (security::get_user_profile →
 *     component_security_tools data). We test as root, so this is not exercised.
 *   - tool_config resolution (properties->tool_config + get_tool_configuration):
 *     the ported component models carry no tool_config, so no ddo_map 'self'
 *     resolution is needed here. A component whose properties carry tool_config
 *     is declined by the element-context handler.
 *
 * No module-global mutable state: read per request via the injected queryer.
 */

import type { OntologyRepository } from '@dedalo/ontology';
import type { ToolPropertiesMap } from './tool_properties_cache.ts';

/** Minimal parameterised SQL queryer (a Db / DbSession / test stub). */
export interface ToolsQueryer {
  query<T = unknown>(text: string, params: unknown[]): Promise<T[]>;
}

// ── ontology tipos (tool_ontology_map + core defines, verified vs the install) ──
const REGISTER_TOOLS_SECTION_TIPO = 'dd1324';
const TOOLS_MATRIX_TABLE = 'matrix_tools';
const TIPO_TOOL_NAME = 'dd1326'; // string
const TIPO_TOOL_LABEL = 'dd799'; // string (lang)
const TIPO_AFFECTED_MODELS = 'dd1330'; // relation → dd1342 records (dd1345 = name)
const TIPO_AFFECTED_TIPOS = 'dd1350'; // relation
const TIPO_ACTIVE = 'dd1354'; // radio (yes/no via dd64)
const TIPO_SHOW_IN_INSPECTOR = 'dd1331';
const TIPO_SHOW_IN_COMPONENT = 'dd1332';
const TIPO_REQUIRE_TRANSLATABLE = 'dd1333';
const TIPO_ALWAYS_ACTIVE = 'dd1601';
const TIPO_PROPERTIES = 'dd1335'; // json (misc)

/** The dd64 yes/no section: section_id '1' = yes/true. */
const YES_SECTION_ID = '1';

/** The dd1342 affected-models locator section + its dd1345 model-name column. */
const AFFECTED_MODELS_LOCATOR_SECTION = 'dd1342';
const AFFECTED_MODELS_NAME_TIPO = 'dd1345';

/** DEDALO_DATA_NOLAN sentinel for non-translatable json wrapping. */
const NOLAN_LANG = 'lg-nolan';

/** DEDALO_TIME_MACHINE_SECTION_TIPO — only tool_export is allowed there. */
export const TIME_MACHINE_SECTION_TIPO = 'dd15';

/** Availability context passed to a tool's is_available() (subset PHP builds). */
export interface ToolAvailabilityContext {
  callerModel: string;
  calledClass: string;
  isComponent: boolean;
  tipo: string;
  sectionTipo: string | null;
  mode: string | null;
}

/**
 * Tools that declare a `static is_available($context)` hook in PHP, ported
 * verbatim. A tool absent here is always available.
 */
const TOOL_IS_AVAILABLE: Readonly<Record<string, (ctx: ToolAvailabilityContext) => boolean>> = {
  // tool_time_machine: skip on component_relation_children.
  tool_time_machine: (ctx) => ctx.calledClass !== 'component_relation_children',
};

/** A simple tool object (subset of tools_register::create_simple_tool_object). */
export interface SimpleToolObject {
  sectionTipo: string;
  sectionId: string;
  name: string;
  /** Raw label data array [{lang,value}], used by create_tool_simple_context. */
  label: { lang: string; value: string }[];
  /** Resolved affected model-name strings (dd1345 terms). */
  affectedModels: string[];
  /** Affected tipos (the value array of the relation), or null. */
  affectedTipos: string[] | null;
  showInInspector: boolean;
  showInComponent: boolean;
  requirementTranslatable: boolean;
  alwaysActive: boolean;
  /** Resolved json properties (get_data()[0]->value), or null. */
  properties: unknown;
}

/** A datum entry as stored in the typed JSONB columns. */
export interface Datum {
  id?: number;
  lang?: string;
  value?: unknown;
  section_id?: string | number;
}

/** One row of the matrix_tools registry, with the typed JSONB columns we read. */
interface ToolRow {
  section_id: number | string;
  string: Record<string, unknown> | null;
  relation: Record<string, unknown> | null;
  misc: Record<string, unknown> | null;
}

export function asDatumArray(v: unknown): Datum[] {
  return Array.isArray(v) ? (v as Datum[]) : [];
}

/**
 * Read the active registered tools (root: ALL of them) from the dd1324 registry
 * and build their simple tool objects, in registry section_id order — the order
 * tool_common::get_active_tools yields and the context `tools` array preserves.
 *
 * Only tools whose ACTIVE flag (dd1354) resolves to yes are returned (active
 * radio = section_id '1' in dd64).
 */
export async function getRegisteredTools(
  queryer: ToolsQueryer,
  ontology: OntologyRepository,
  toolProperties?: ToolPropertiesMap,
): Promise<SimpleToolObject[]> {
  const sql =
    'SELECT section_id, string, relation, misc ' +
    `FROM "${TOOLS_MATRIX_TABLE}" ` +
    'WHERE section_tipo = $1 ' +
    'ORDER BY section_id ASC';
  const rows = await queryer.query<ToolRow>(sql, [REGISTER_TOOLS_SECTION_TIPO]);

  const tools: SimpleToolObject[] = [];
  const affectedLocatorsByTool = new Map<string, Datum[]>();

  for (const row of rows) {
    const str = row.string ?? {};
    const rel = row.relation ?? {};
    const misc = row.misc ?? {};

    if (firstFlag(rel[TIPO_ACTIVE]) !== true) continue;

    const nameData = asDatumArray(str[TIPO_TOOL_NAME]);
    const name = typeof nameData[0]?.value === 'string' ? (nameData[0].value as string) : '';
    if (name === '') continue;

    const affectedLocators = asDatumArray(rel[TIPO_AFFECTED_MODELS]);
    affectedLocatorsByTool.set(name, affectedLocators);

    tools.push({
      sectionTipo: REGISTER_TOOLS_SECTION_TIPO,
      sectionId: String(row.section_id),
      name,
      label: asDatumArray(str[TIPO_TOOL_LABEL])
        .filter(
          (d): d is Datum & { lang: string; value: string } =>
            typeof d.lang === 'string' && typeof d.value === 'string',
        )
        .map((d) => ({ lang: d.lang, value: d.value })),
      affectedModels: [], // filled below
      affectedTipos: resolveAffectedTipos(asDatumArray(rel[TIPO_AFFECTED_TIPOS])),
      showInInspector: firstFlag(rel[TIPO_SHOW_IN_INSPECTOR]),
      showInComponent: firstFlag(rel[TIPO_SHOW_IN_COMPONENT]),
      requirementTranslatable: firstFlag(rel[TIPO_REQUIRE_TRANSLATABLE]),
      alwaysActive: firstFlag(rel[TIPO_ALWAYS_ACTIVE]),
      // properties: the install-time registered-tools cache is the authority the
      // live PHP server serves (see tool_properties_cache.ts). When the cache map
      // has an entry for this tool, use it verbatim (FLAT for tool_print etc.,
      // lang-wrapped for the legacy-cached tools). Otherwise fall back to the
      // DB-derived lang-wrapped form (get_data()[0]->value wrapped per nolan).
      properties:
        toolProperties && toolProperties.has(name)
          ? (toolProperties.get(name) ?? null)
          : resolveJsonProperties(asDatumArray(misc[TIPO_PROPERTIES])),
    });
  }

  await fillAffectedModelNames(tools, affectedLocatorsByTool, queryer, ontology);

  return tools;
}

/** Boolean flag: the first relation locator points at dd64 section_id '1' (yes). */
function firstFlag(v: unknown): boolean {
  const data = asDatumArray(v);
  const ref = data[0]?.section_id;
  return ref != null && String(ref) === YES_SECTION_ID;
}

/** Affected tipos: the raw value array of the dd1350 relation (or null). */
function resolveAffectedTipos(data: Datum[]): string[] | null {
  const value = data[0]?.value;
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === 'string');
  return null;
}

/**
 * Resolve the json-component (dd1335) properties exactly as PHP does:
 * `get_data()[0]->value`. For component_json the datum value is wrapped per lang
 * by get_data (non-translatable → DEDALO_DATA_NOLAN), yielding
 * `{ 'lg-nolan': [<rawValue>, ...] }`. An empty/absent value resolves to null.
 */
function resolveJsonProperties(data: Datum[]): unknown {
  if (data.length === 0) return null;
  const allEmpty = data.every(
    (d) => d.value == null || (Array.isArray(d.value) && d.value.length === 0),
  );
  if (allEmpty) return null;
  const grouped: Record<string, unknown[]> = {};
  for (const d of data) {
    const lang = typeof d.lang === 'string' ? d.lang : NOLAN_LANG;
    (grouped[lang] ??= []).push(d.value);
  }
  return grouped;
}

/**
 * Fill each tool's `affectedModels` by reading the dd1342 records its
 * affected_models locators point at (dd1345 = the model name string). Batched
 * with a single read of the dd1342 matrix table. Port of
 * create_simple_tool_object's affected_models closure.
 */
async function fillAffectedModelNames(
  tools: SimpleToolObject[],
  locatorsByTool: Map<string, Datum[]>,
  queryer: ToolsQueryer,
  ontology: OntologyRepository,
): Promise<void> {
  const ids = new Set<number>();
  for (const locs of locatorsByTool.values()) {
    for (const loc of locs) {
      if (loc.section_id != null) ids.add(Number(loc.section_id));
    }
  }
  if (ids.size === 0) return;

  const matrixTable = await resolveSectionMatrixTable(ontology, AFFECTED_MODELS_LOCATOR_SECTION);
  const sql =
    'SELECT section_id, string ' +
    `FROM "${matrixTable}" ` +
    'WHERE section_tipo = $1 AND section_id = ANY($2)';
  const rows = await queryer.query<{ section_id: number | string; string: Record<string, unknown> | null }>(
    sql,
    [AFFECTED_MODELS_LOCATOR_SECTION, [...ids]],
  );
  const nameById = new Map<string, string>();
  for (const row of rows) {
    const data = asDatumArray((row.string ?? {})[AFFECTED_MODELS_NAME_TIPO]);
    const v = data[0]?.value;
    if (typeof v === 'string') nameById.set(String(row.section_id), stripTags(v));
  }

  for (const tool of tools) {
    const locs = locatorsByTool.get(tool.name) ?? [];
    const names: string[] = [];
    for (const loc of locs) {
      const sid = loc.section_id != null ? String(loc.section_id) : null;
      const name = sid !== null ? nameById.get(sid) : undefined;
      if (name !== undefined) names.push(name);
    }
    tool.affectedModels = names;
  }
}

/** Resolve the matrix table for a section tipo (matrix_table relation; default 'matrix'). */
async function resolveSectionMatrixTable(
  ontology: OntologyRepository,
  sectionTipo: string,
): Promise<string> {
  const relationTipos = (await ontology.getRelationTipos(sectionTipo)) ?? [];
  for (const relTipo of relationTipos) {
    if ((await ontology.getModelByTipo(relTipo)) === 'matrix_table') {
      const table = await ontology.getLabel(relTipo, 'lg-spa');
      if (table) return table;
    }
  }
  return 'matrix';
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}

/**
 * Filter the registered tools for a COMPONENT context — port of the element-tools
 * loop in common::get_tools() restricted to a component caller.
 *
 * A tool is included when any of:
 *   - the component model is in its affected_models, OR
 *   - the component tipo is in its affected_tipos, OR
 *   - 'all_components' is in its affected_models (component caller), OR
 *   - (tool_config in component properties — DEFERRED: the ported models have none)
 * AND then:
 *   - affected_tipos restriction (when set, the tipo must be in it),
 *   - dd15 section rule (only tool_export on the time-machine section),
 *   - tool-declared is_available(context),
 *   - requirement_translatable match (compared to the component's translatable).
 */
export function filterComponentTools(
  tools: SimpleToolObject[],
  ctx: {
    model: string;
    tipo: string;
    sectionTipo: string | null;
    mode: string | null;
    translatable: boolean;
    withLangVersions: boolean;
  },
): SimpleToolObject[] {
  const availabilityCtx: ToolAvailabilityContext = {
    callerModel: ctx.model,
    calledClass: ctx.model,
    isComponent: true,
    tipo: ctx.tipo,
    sectionTipo: ctx.sectionTipo,
    mode: ctx.mode,
  };

  const out: SimpleToolObject[] = [];
  for (const tool of tools) {
    const affectedModels = tool.affectedModels;
    const affectedTipos = tool.affectedTipos ?? [];

    const matched =
      affectedModels.includes(ctx.model) ||
      affectedTipos.includes(ctx.tipo) ||
      affectedModels.includes('all_components');
    if (!matched) continue;

    // affected_tipos specific restriction (e.g. tool_indexation only on 'rsc36')
    if (affectedTipos.length > 0 && !affectedTipos.includes(ctx.tipo)) continue;

    // dd15 section: only tool_export allowed
    if (ctx.sectionTipo === TIME_MACHINE_SECTION_TIPO && tool.name !== 'tool_export') continue;

    // tool-declared availability
    const isAvailable = TOOL_IS_AVAILABLE[tool.name];
    if (isAvailable && isAvailable(availabilityCtx) !== true) continue;

    // requirement_translatable match
    if (tool.requirementTranslatable === true) {
      const translatable = ctx.translatable === false && ctx.withLangVersions !== true ? false : true;
      if (tool.requirementTranslatable === translatable) out.push(tool);
      continue;
    }

    out.push(tool);
  }
  return out;
}

/**
 * Filter the registered tools for a SECTION or AREA context — port of
 * common::get_tools() for a NON-component caller. Differences from the component
 * filter:
 *   - the caller model is 'section' / 'area' / 'area_*' (matched against the
 *     tool's affected_models), and `all_components` is NOT a match (is_component
 *     is false for sections/areas).
 *   - requirement_translatable: for a non-component caller PHP computes
 *     `$translatable = false`, so only tools whose requirement_translatable is
 *     false survive that branch.
 *   - tool-declared is_available receives is_component=false. tool_diffusion's
 *     is_available depends on the diffusion section-map (have_section_diffusion);
 *     callers pass `diffusionSection` to gate it.
 *
 * The PHP affected_tipos restriction (`!empty($affected_tipos[0])`) only triggers
 * when affected_tipos[0] is a real tipo string; lang-wrapped affected_tipos
 * (e.g. tool_ontology's `{lg-nolan:[[...]]}`) leave index 0 empty, so the
 * restriction is skipped. We reproduce that by only enforcing the restriction
 * when `affectedTipos` is a non-empty list of plain tipo strings.
 */
export function filterSectionAreaTools(
  tools: SimpleToolObject[],
  ctx: {
    /** Caller model: 'section' | 'area' | 'area_*'. */
    model: string;
    tipo: string;
    sectionTipo: string | null;
    mode: string | null;
    /** Whether this section is a diffusion target (have_section_diffusion). */
    diffusionSection: boolean;
  },
): SimpleToolObject[] {
  const availabilityCtx: ToolAvailabilityContext = {
    callerModel: ctx.model,
    calledClass: ctx.model,
    isComponent: false,
    tipo: ctx.tipo,
    sectionTipo: ctx.sectionTipo,
    mode: ctx.mode,
  };

  const out: SimpleToolObject[] = [];
  for (const tool of tools) {
    const affectedModels = tool.affectedModels;
    const affectedTipos = tool.affectedTipos ?? [];

    // match: model in affected_models OR tipo in affected_tipos. (all_components
    // is a component-only match → excluded for sections/areas.)
    const matched = affectedModels.includes(ctx.model) || affectedTipos.includes(ctx.tipo);
    if (!matched) continue;

    // affected_tipos restriction: only when it is a real tipo-string list.
    if (affectedTipos.length > 0 && !affectedTipos.includes(ctx.tipo)) continue;

    // dd15 section: only tool_export allowed.
    if (ctx.sectionTipo === TIME_MACHINE_SECTION_TIPO && tool.name !== 'tool_export') continue;

    // tool-declared availability.
    if (tool.name === 'tool_diffusion') {
      // is_available: false for components (n/a here) and when the section has
      // no diffusion config (have_section_diffusion).
      if (ctx.diffusionSection !== true) continue;
    } else {
      const isAvailable = TOOL_IS_AVAILABLE[tool.name];
      if (isAvailable && isAvailable(availabilityCtx) !== true) continue;
    }

    // requirement_translatable: for a non-component caller, translatable=false.
    if (tool.requirementTranslatable === true) {
      // requirement_translatable (true) === translatable (false) is false → skip.
      continue;
    }

    out.push(tool);
  }
  return out;
}
