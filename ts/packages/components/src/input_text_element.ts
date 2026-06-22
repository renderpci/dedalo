/**
 * Port of the per-component JSON CONTROLLER for component_input_text — the
 * `{context, data}` element the frontend renders for editing/listing a field
 * (distinct from get_value's flat string).
 *
 * PHP path: common::get_json({get_context:true, get_data:true}) includes
 * core/component_input_text/component_input_text_json.php in the component scope,
 * which builds:
 *   context = [ get_structure_context(_simple)(permissions, add_rqo) ]
 *   data    = [ get_data_item(value) + { parent_tipo, parent_section_id,
 *               fallback_value, counter?, transliterate_value? } ]
 *   return common::build_element_json_output(context, data)  // {context, data}
 *
 * This builder reproduces the DATA half byte-exact and REUSES the existing,
 * already-byte-green component structure-context for the CONTEXT half
 * (buildComponentElementContext → the single structure-context DDO).
 *
 * ── DATA-HALF FIELD SET + ORDER (byte-significant; PHP stdClass insertion order) ──
 * get_data_item($value) (component_common::get_data_item) sets, in order:
 *   1. section_id          ← $this->get_section_id()       (source.section_id)
 *   2. section_tipo        ← $this->get_section_tipo()     (source.section_tipo)
 *   3. tipo                ← $this->get_tipo()             (source.tipo)
 *   4. mode                ← $this->get_mode()             (source.mode)
 *   5. lang                ← $this->get_lang()             (EFFECTIVE lang: translatable
 *                                                          ? DEDALO_DATA_LANG : lg-nolan)
 *   6. from_component_tipo ← $this->from_component_tipo ?? tipo   (null here ⇒ = tipo)
 *   7. entries             ← $value (the raw data-item array, or null)
 *      (mode==='solved' would add `literal` here; never reached on the read path.)
 *      (SHOW_DEBUG-only: debug_model, debug_label, debug_dataframe — dropped by the
 *       production contract, like the `debug` block. NOT emitted here.)
 * then the *_json controller appends:
 *   8. parent_tipo         ← $this->get_tipo()
 *   9. parent_section_id   ← $this->get_section_id()
 *  10. fallback_value      ← array|null (non-null when the effective-lang slice is empty)
 *  (11. counter            ← dataframe row counter — DECLINED, see below)
 *  (12. transliterate_value← with_lang_versions cross-lang data — DECLINED, see below)
 *
 * ── ENTRIES (`value`) RESOLUTION ──
 * The `entries` value is the raw data-item array exactly as get_list_value /
 * get_data_lang returns it (objects {id, lang, value, …} verbatim from the matrix
 * JSONB — key order preserved). Per mode:
 *   - 'edit' (default): get_data_lang() — the effective-lang slice. Returns null
 *     when the component has NO data at all, or [] when data exists in OTHER langs
 *     but not the effective lang.
 *   - 'list'/'tm':      get_list_value() = get_data_lang() but null-collapsed
 *     (returns null when the slice is empty — never []). Plus the Root special case
 *     (DEDALO_SECTION_USERS_TIPO, section_id===-1) → [{value:'Root', lang}].
 *   - 'search':         [] (no stored value).
 * fallback_value mirrors get_value's get_component_data_fallback chain (main lang →
 * nolan → any project lang), non-null only when is_empty_data(entries).
 *
 * ── DECLINED SPECIAL CASES (reported, not gated) ──
 *   - dataframe (has_dataframe): build_dataframe_subdatum merges extra context +
 *     subdatum data entries and adds `counter` to the item. The dataframe subsystem
 *     (trait.dataframe_common, id_key pairing) is out of this phase's scope.
 *   - transliterate (with_lang_versions): adds `transliterate_value` (cross-lang
 *     get_data_lang). Only tool_lang components carry it; not ported here.
 *   - activity 'Where' (section===DEDALO_ACTIVITY_SECTION_TIPO && tipo==='dd546'):
 *     rewrites value[0].value to the ontology term label + " [tipo]". Needs
 *     ontology_node::get_term_by_tipo at DEDALO_DATA_LANG; not ported here.
 * Callers must DECLINE inputs that hit these (canHandle in the eventual API wiring);
 * this builder asserts the inputs are plain so it never emits a half-ported shape.
 */

import type { ComponentDatum } from '@dedalo/db';
import { ComponentInputText } from './component_input_text.ts';
import type { ComponentInit } from './component_common.ts';
import {
  buildComponentElementContext,
  type BuildComponentElementContextOptions,
  type ElementContextSource,
} from './component_element_context.ts';

/** Inputs identifying the component element to build. */
export interface InputTextElementSource {
  tipo: string;
  section_tipo: string;
  section_id: number | string | null;
  /** Requested RQO lang; the EFFECTIVE lang is translatable ? this : lg-nolan. */
  lang?: string;
  /** 'edit' | 'list' | 'tm' | 'search'. Default 'edit'. */
  mode?: string;
  model?: string;
  /**
   * The ASSEMBLY caller tipo, which the section/portal walk stamps onto
   * `parent_tipo` AFTER the controller runs (common::get_subdatum, unconditional
   * `$value_obj->parent_tipo = $this->tipo`). When omitted, the value the
   * standalone controller itself sets is used (`$this->get_tipo()` = `tipo`).
   * For a direct section child this is the SECTION tipo; pass it to reproduce the
   * full build_json_rows element bytes.
   */
  caller_tipo?: string;
  /**
   * The ASSEMBLY caller's `from_component_tipo` override. The walk sets the child's
   * `from_component_tipo = $this->tipo` ONLY when the caller is itself a component
   * (a portal/relation resolving its target columns); for a SECTION caller it is
   * NOT overwritten and stays the component's own tipo (the controller default).
   * Pass this only when the caller is a component (portal column); omit for direct
   * section children.
   */
  from_component_tipo?: string;
}

/** Deps: the value-resolution deps + the context-builder deps (reused for the context half). */
export interface BuildInputTextElementOptions {
  matrix: ComponentInit['matrix'];
  ontology: ComponentInit['ontology'];
  langConfig: ComponentInit['langConfig'];
  /** Matrix table the section lives in. */
  matrixTable: string;
  /** Context-half deps (toolsQueryer + contextConfig + toolProperties). */
  context: Pick<
    BuildComponentElementContextOptions,
    'toolsQueryer' | 'contextConfig' | 'toolProperties'
  >;
}

/** The {context, data} element a component get_json() returns. */
export interface InputTextElement {
  context: unknown[];
  data: InputTextDataItem[];
}

/** The DATA-half item — field set + ORDER is byte-significant (see module docblock). */
export interface InputTextDataItem {
  section_id: number | string | null;
  section_tipo: string;
  tipo: string;
  mode: string;
  lang: string;
  from_component_tipo: string;
  entries: ComponentDatum[] | null;
  parent_tipo: string;
  parent_section_id: number | string | null;
  fallback_value: ComponentDatum[] | null;
}

/** Thrown when an input hits a special case this phase declines (dataframe/transliterate/activity). */
export class UnsupportedInputTextElement extends Error {}

/** section_id may arrive as a numeric string; PHP coerces with (int) for the matrix read. */
function normalizeSectionId(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isInteger(raw) ? raw : null;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * Build the component_input_text {context, data} element.
 *
 * @throws UnsupportedInputTextElement when the input hits a declined special case
 *   (dataframe / transliterate / activity 'Where').
 */
export async function buildInputTextElement(
  source: InputTextElementSource,
  opts: BuildInputTextElementOptions,
): Promise<InputTextElement> {
  const tipo = source.tipo;
  const sectionTipo = source.section_tipo;
  const requestedLang = source.lang ?? opts.langConfig.dataLang;
  const mode = source.mode ?? 'edit';

  // ── DECLINE the special cases this phase does not reproduce ──
  const properties = (await opts.ontology.getProperties(tipo)) ?? {};
  if ((properties as { has_dataframe?: unknown }).has_dataframe === true) {
    throw new UnsupportedInputTextElement(`has_dataframe not ported (tipo ${tipo})`);
  }
  // with_lang_versions: properties.with_lang_versions === true (component_common __construct).
  const withLangVersions = (properties as { with_lang_versions?: unknown }).with_lang_versions === true;
  if (withLangVersions === true) {
    throw new UnsupportedInputTextElement(`with_lang_versions (transliterate) not ported (tipo ${tipo})`);
  }
  // activity 'Where' (DEDALO_ACTIVITY_SECTION_TIPO + tipo dd546). We have no
  // ACTIVITY_SECTION_TIPO constant wired; dd546 is the universal activity 'Where'
  // tipo. Decline on the tipo to fail closed regardless of the section.
  if (tipo === 'dd546') {
    throw new UnsupportedInputTextElement(`activity 'Where' term resolution not ported (tipo ${tipo})`);
  }

  // ── CONTEXT half: reuse the byte-green component structure-context builder ──
  const contextSource: ElementContextSource = {
    tipo,
    section_tipo: sectionTipo,
    ...(source.model !== undefined ? { model: source.model } : {}),
    lang: requestedLang,
    mode,
  };
  const ctxResponse = await buildComponentElementContext(contextSource, {
    ontology: opts.ontology,
    toolsQueryer: opts.context.toolsQueryer,
    contextConfig: opts.context.contextConfig,
    dataLang: opts.langConfig.dataLang,
    ...(opts.context.toolProperties ? { toolProperties: opts.context.toolProperties } : {}),
  });
  const context: unknown[] = ctxResponse.result === false ? [] : ctxResponse.result;

  // ── DATA half: resolve entries + fallback via the get_value resolution ──
  const init: ComponentInit = {
    tipo,
    sectionTipo,
    sectionId: normalizeSectionId(source.section_id),
    lang: requestedLang,
    dataColumnName: 'string',
    matrixTable: opts.matrixTable,
    matrix: opts.matrix,
    ontology: opts.ontology,
    langConfig: opts.langConfig,
  };
  const component = await ComponentInputText.create(init);
  const effectiveLang = component.effectiveLang();

  // entries + fallback per the controller's mode switch, reusing the get_value
  // data resolution (get_data_lang / get_component_data_fallback) on the component.
  const { entries, fallbackValue } = await component.resolveDataEntries(mode);

  // get_data_item: from_component_tipo defaults to the component's own tipo
  // ($this->from_component_tipo ?? $item->tipo). The assembly overrides it only
  // for component (portal) callers — pass source.from_component_tipo then.
  const fromComponentTipo = source.from_component_tipo ?? tipo;
  // parent_tipo: the standalone controller sets $this->get_tipo() (= tipo); the
  // assembly walk unconditionally overwrites it with the caller tipo.
  const parentTipo = source.caller_tipo ?? tipo;

  // Field ORDER is byte-significant — see module docblock.
  const item: InputTextDataItem = {
    section_id: source.section_id ?? null,
    section_tipo: sectionTipo,
    tipo,
    mode,
    lang: effectiveLang,
    from_component_tipo: fromComponentTipo,
    entries,
    parent_tipo: parentTipo,
    parent_section_id: source.section_id ?? null,
    fallback_value: fallbackValue,
  };

  return { context, data: [item] };
}
