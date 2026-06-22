/**
 * Port of the two STRUCTURAL element types every editable section carries, beyond
 * the data components: the GROUPER (section_group / section_group_div / section_tab
 * / tab) and component_section_id. Both are resolved by the section's get_subdatum
 * edit walk (build_json_rows edit branch) and emit a {context, data} element.
 *
 * ── GROUPER (section_group / section_group_div / section_tab / tab) ──
 * PHP: get_subdatum instantiates `new $model($tipo, $section_tipo, $mode)` and calls
 * its get_json(). The grouper's json controller (section_group_json.php) builds the
 * structure-context (build_structure_context, add_rqo=false → no request_config /
 * no path) and PATCHES `add_label` = (legacy_model !== 'section_group_div'). It emits
 * NO data item ($data = []). The grouper:
 *   - type = 'grouper' (resolve_type_from_model).
 *   - lang = DEDALO_DATA_LANG (the constructor hardcodes it — NOT translatable-gated;
 *     so a non-translatable grouper still reports the data lang, unlike a component).
 *   - tools = [] (get_tools is overridden to []), buttons = [].
 *   - css = properties.css (the `.content_data` grid layout), section-virtual-css
 *     override applies as for components.
 *   - sortable = false.
 *   - add_label appended LAST (after legacy_model).
 * Field order (dd_object declaration, null-filtered):
 *   typo, type, tipo, section_tipo, parent, parent_grouper, lang, mode, model,
 *   properties, permissions, label, translatable, tools, buttons, css, sortable,
 *   legacy_model, add_label
 *
 * ── component_section_id ──
 * PHP: the standard component build, PLUS the json controller appends
 * `context->color = ontology_node::get_color(section_tipo)` (= properties.color ??
 * '#b9b9b9') — color is a DECLARED dd_object slot BETWEEN sortable and legacy_model,
 * so it serializes there. Its get_order_path overrides path[0]->column = 'section_id'
 * (or 'id' for the time-machine column dd1573, not reached here). The DATA item is
 * the base get_data_item (base-7, NO appended trailing field): entries = [<section_id>]
 * (get_data returns [int|null]). The build_json_rows assembly stamps row_section_id +
 * parent_tipo separately.
 * Context field order:
 *   typo, type='component', tipo, section_tipo, parent, parent_grouper, lang(nolan),
 *   mode, model, properties, permissions, label, translatable, tools, buttons, css,
 *   sortable=true, color, legacy_model, path(with column:'section_id')
 */

import type { OntologyRepository } from '@dedalo/ontology';
import {
  buildComponentElementContext,
  type BuildComponentElementContextOptions,
  type ElementContextResponse,
} from './component_element_context.ts';

/** DEDALO_DATA_NOLAN. */
const NOLAN = 'lg-nolan';
/** Default gray when a node carries no properties.color (ontology_node::get_color). */
const DEFAULT_COLOR = '#b9b9b9';
/** Legacy models whose grouper panel suppresses its header label (add_label=false). */
const NO_LABEL_LEGACY_MODELS: ReadonlySet<string> = new Set(['section_group_div']);

/** ontology_node::get_color — properties.color, else default gray. */
async function resolveColor(ontology: OntologyRepository, tipo: string): Promise<string> {
  const props = await ontology.getProperties(tipo);
  const color = props && typeof (props as { color?: unknown }).color === 'string'
    ? (props as { color: string }).color
    : DEFAULT_COLOR;
  return color;
}

/** strip_tags — the term is plain text here; minimal port. */
function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}

/** Inputs identifying the structural element to build. */
export interface StructuralElementSource {
  tipo: string;
  section_tipo: string;
  section_id: number | string | null;
  /** Render mode ('edit'). */
  mode?: string;
  /** Resolved model (grouper model or 'component_section_id'). */
  model: string;
  /** Default request lang (DEDALO_DATA_LANG). */
  lang?: string;
}

/** Deps for the structural element builders (context-half deps + ontology + lang). */
export interface BuildStructuralElementOptions {
  ontology: OntologyRepository;
  /** DEDALO_DATA_LANG — the grouper's hardcoded lang. */
  dataLang: string;
  /** Context-half deps (toolsQueryer + contextConfig + toolProperties). */
  context: Pick<
    BuildComponentElementContextOptions,
    'toolsQueryer' | 'contextConfig' | 'toolProperties'
  >;
}

/** The {context, data} element a grouper / section_id get_json() returns. */
export interface StructuralElement {
  context: unknown[];
  data: unknown[];
}

/**
 * Build the GROUPER {context, data} element (section_group / section_group_div /
 * section_tab / tab). CONTEXT-only; data = []. The context is the structure-context
 * (no request_config, no path) with `add_label` appended.
 *
 * Reuses the section/area path's structure-context shape by assembling the DDO
 * directly (the component-context builder is component-specific). The grouper's
 * properties come from the ontology (css NOT stripped here — the grouper css is the
 * emitted `.content_data` block).
 */
export async function buildGrouperElement(
  source: StructuralElementSource,
  opts: BuildStructuralElementOptions,
): Promise<StructuralElement> {
  const { ontology } = opts;
  const tipo = source.tipo;
  const sectionTipo = source.section_tipo;
  const mode = source.mode ?? 'edit';
  const model = source.model;

  // lang: the grouper constructor hardcodes DEDALO_DATA_LANG (not translatable-gated).
  const lang = source.lang ?? opts.dataLang;

  // parent: resolve_context_parent → section_tipo (no session/from_parent here).
  const parent = sectionTipo;
  // parent_grouper: ontology parent (dropped when null).
  const parentGrouper = await ontology.getParent(tipo);

  // properties: ontology deep-clone with css extracted (css becomes the `css` field).
  const propsSource = (await ontology.getProperties(tipo)) ?? {};
  const properties: Record<string, unknown> = { ...propsSource };
  const ontologyCss = (properties as { css?: unknown }).css;
  delete (properties as { css?: unknown }).css;

  // css: properties.css, possibly overridden by the section virtual-css map.
  let css: unknown = ontologyCss ?? null;
  const sectionProps = await ontology.getProperties(sectionTipo);
  const sectionCss = (sectionProps as { css?: Record<string, unknown> } | null)?.css;
  if (sectionCss && Object.prototype.hasOwnProperty.call(sectionCss, tipo)) {
    css = sectionCss[tipo];
  }

  const permissions = 3; // ROOT shortcut.
  const label = (await ontology.getLabel(tipo, opts.context.contextConfig.applicationLang)) ?? '';
  const translatable = await ontology.getTranslatable(tipo);
  const legacyModel = await ontology.getLegacyModel(tipo);

  // add_label: false ONLY for the legacy 'section_group_div' model.
  const addLabel = !NO_LABEL_LEGACY_MODELS.has(legacyModel ?? '');

  const ddo: Record<string, unknown> = {};
  ddo.typo = 'ddo';
  ddo.type = 'grouper';
  ddo.tipo = tipo;
  ddo.section_tipo = sectionTipo;
  if (parent !== null) ddo.parent = parent;
  if (parentGrouper !== null) ddo.parent_grouper = parentGrouper;
  if (lang !== null) ddo.lang = lang;
  ddo.mode = mode;
  ddo.model = model;
  ddo.properties = properties;
  ddo.permissions = permissions;
  if (label !== null) ddo.label = label;
  ddo.translatable = translatable;
  ddo.tools = [];
  ddo.buttons = [];
  if (css !== null) ddo.css = css;
  ddo.sortable = false;
  if (legacyModel !== null) ddo.legacy_model = legacyModel;
  ddo.add_label = addLabel;

  return { context: [ddo], data: [] };
}

/** The DATA-half item for component_section_id (base get_data_item, base-7). */
export interface SectionIdDataItem {
  section_id: number | string | null;
  section_tipo: string;
  tipo: string;
  mode: string;
  lang: string;
  from_component_tipo: string;
  entries: number[] | null;
}

/**
 * Build the component_section_id {context, data} element.
 *
 * CONTEXT: the standard component structure-context (reused from
 * buildComponentElementContext) with `color` inserted between sortable and
 * legacy_model, and the path's single step extended with `column:'section_id'`.
 * DATA: base get_data_item with entries = [<section_id>] (or null when no record).
 */
export async function buildSectionIdElement(
  source: StructuralElementSource,
  opts: BuildStructuralElementOptions,
): Promise<StructuralElement> {
  const { ontology } = opts;
  const tipo = source.tipo;
  const sectionTipo = source.section_tipo;
  const mode = source.mode ?? 'edit';

  // ── CONTEXT half: the base component context, then insert color + path. ──
  const ctxResponse: ElementContextResponse = await buildComponentElementContext(
    {
      tipo,
      section_tipo: sectionTipo,
      model: 'component_section_id',
      lang: source.lang ?? opts.dataLang,
      mode,
    },
    {
      ontology,
      toolsQueryer: opts.context.toolsQueryer,
      contextConfig: opts.context.contextConfig,
      dataLang: opts.dataLang,
      ...(opts.context.toolProperties ? { toolProperties: opts.context.toolProperties } : {}),
    },
  );

  const context: unknown[] = [];
  if (ctxResponse.result !== false) {
    const color = await resolveColor(ontology, sectionTipo);
    // get_order_path: a single step (name in DEDALO_STRUCTURE? — get_query_path uses
    // DEDALO_DATA_LANG) + the section_id-specific `column` appended last.
    const dataLang = opts.dataLang;
    const term = (await ontology.getLabel(tipo, dataLang)) ?? '';
    const pathStep: Record<string, unknown> = {
      name: stripTags(term),
      model: 'component_section_id',
      section_tipo: sectionTipo,
      component_tipo: tipo,
      column: 'section_id',
    };
    for (const ctxItem of ctxResponse.result) {
      const base = ctxItem as Record<string, unknown>;
      // Rebuild in declaration order: insert `color` right after `sortable`, replace
      // the standalone empty `path` (appended after legacy_model) with the single step.
      // component_section_id::get_tools() is overridden to [] — force tools empty
      // regardless of mode (the generic builder would resolve all_components tools in
      // non-list mode).
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(base)) {
        if (k === 'path') continue; // re-appended below (after legacy_model)
        out[k] = k === 'tools' ? [] : v;
        if (k === 'sortable') out.color = color;
      }
      out.path = [pathStep];
      context.push(out);
    }
  }

  // ── DATA half: entries = [<section_id>] (get_data returns [int|null]). ──
  // component_section_id is non-translatable → effective lang = lg-nolan.
  const translatable = await ontology.getTranslatable(tipo);
  const effectiveLang = translatable ? (source.lang ?? opts.dataLang) : NOLAN;
  const sid = normalizeSectionId(source.section_id);
  const entries: number[] | null = sid === null ? null : [sid];

  const item: SectionIdDataItem = {
    section_id: source.section_id ?? null,
    section_tipo: sectionTipo,
    tipo,
    mode,
    lang: effectiveLang,
    from_component_tipo: tipo,
    entries,
  };

  return { context, data: [item] };
}

/** section_id may arrive as a numeric string; PHP coerces with (int). */
function normalizeSectionId(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isInteger(raw) ? raw : null;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}
