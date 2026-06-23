/**
 * Port of the per-component JSON CONTROLLERS for the SIMPLE data components that
 * each emit a `{context, data}` element into a record render: component_text_area,
 * component_email, component_number, component_date, component_json,
 * component_geolocation. (component_input_text has its own dedicated builder in
 * input_text_element.ts; this module mirrors that pattern for the others.)
 *
 * PHP paths:
 *   - core/component_text_area/component_text_area_json.php
 *   - core/component_number/component_number_json.php
 *   - core/component_email/component_email_json.php
 *   - core/component_date/component_date_json.php
 *   - core/component_json/component_json_json.php
 *   - core/component_geolocation/component_geolocation_json.php
 * Each is included by common::get_json() in the component scope and builds:
 *   context = [ get_structure_context(_simple)(permissions, has_dataframe) ]
 *   data    = [ get_data_item(value) + <per-model appended fields> ]
 *   return common::build_element_json_output(context, data)  // {context, data}
 *
 * This builder reproduces the DATA half byte-exact and REUSES the existing,
 * already-byte-green component structure-context for the CONTEXT half
 * (buildComponentElementContext → the single structure-context DDO).
 *
 * ── DATA-HALF FIELD SET + ORDER (byte-significant; PHP stdClass insertion order) ──
 * common::get_data_item($value) sets, in order:
 *   1. section_id, 2. section_tipo, 3. tipo, 4. mode, 5. lang (EFFECTIVE lang),
 *   6. from_component_tipo (= this.from_component_tipo ?? tipo), 7. entries (= value)
 * then the *_json controller APPENDS, PER MODEL:
 *
 *   component_text_area:    parent_tipo, fallback_value
 *                           (NO parent_section_id — verified vs live PHP)
 *   component_number:       parent_tipo, parent_section_id
 *                           (NO fallback_value)
 *   component_email:        parent_tipo, parent_section_id
 *                           (NO fallback_value)
 *   component_date:         (NOTHING — base 7 only; controller appends `counter`
 *                           only when has_dataframe → DECLINED)
 *   component_json:         (NOTHING — base 7 only)
 *   component_geolocation:  (NOTHING — base 7 only)
 *
 * Contrast component_input_text: parent_tipo, parent_section_id, fallback_value.
 * (!) date/json/geo's standalone get_json data item is the base 7 fields ONLY.
 * Inside build_json_rows the assembly walk separately STAMPS parent_tipo +
 * row_section_id onto every item — but that is the assembly's job, not the
 * controller's, so the element builder for these three emits NO appended field.
 *
 * ── ENTRIES (`value`) RESOLUTION (vs input_text) ──
 * The `entries` value is the RAW data-item array as get_data_lang / get_list_value
 * returns it (objects verbatim from the matrix JSONB, key order preserved):
 *   - number/email (GENERIC component_common path): list/tm → get_list_value()
 *     (get_data_lang null-collapsed); edit → get_data_lang(). number additionally
 *     formats each value via get_data()'s set_format_form_type (int/float + round);
 *     number/email items carry NO `lang` key (non-translatable, stored lg-nolan but
 *     the stored item objects omit lang for the number/email families). NO fallback.
 *   - text_area (string-family): list/tm → get_list_value() (per-item skip-empty,
 *     TR add_tag_img_on_the_fly, truncate_html(130)); edit → get_data_lang() ?? [].
 *     fallback_value = get_fallback_list_value(200) / get_fallback_edit_value(700)
 *     when empty. (The TR/truncate transforms are no-ops on the gated tag-free,
 *     short data; ComponentTextArea throws loudly on anything else.)
 *   - date (DATE column): list/tm/edit ALL → get_data_lang() (non-translatable, raw
 *     STRUCTURED datum: {id, start:{year,month,day,...}, end?, period?, mode?}).
 *     entries is null when the component has no datum (getData []→null collapse). NO
 *     list-mode null-collapse (the controller uses get_data_lang uniformly), NO
 *     fallback. The structured date object is passed through verbatim (NOT flattened
 *     to the get_value string).
 *   - json (MISC column): list/tm → get_list_value(); edit → get_data_lang().
 *     Non-translatable (lg-nolan). entries = [{id, value:<parsed JSON value>}]; the
 *     inner `value` is the stored JSONB value (object/array/scalar) verbatim.
 *   - geolocation (GEO column): list/tm → get_list_value(); edit → get_data_lang().
 *     Non-translatable (lg-nolan). entries = [{id, lat, lon, zoom, alt, lib_data?}]
 *     (geometry object) verbatim.
 *
 * date/json/geo data column mapping (PHP section_record_data::$column_map):
 *   date → 'date', json → 'misc', geolocation → 'geo'.
 *
 * ── DECLINED SPECIAL CASES (reported, not gated) ──
 *   - dataframe (has_dataframe): build_dataframe_subdatum extra context/data +
 *     `counter` on the item. Out of phase scope → declined (date/json/geo too).
 *   - component_iri: NOT ported here. Its controller ALWAYS resolves a dd560 label
 *     dataframe subdatum (extra context + data), ALWAYS sets `counter`, and the
 *     class forces with_lang_versions=true → ALWAYS emits `transliterate_value`.
 *     None of that is reproducible without the dataframe + transliterate ports →
 *     declined (it stays out of PORTED_ELEMENT_MODELS; get_value for iri is ported
 *     separately and unaffected).
 *   - text_area tags_persons/tags_index/tags_draw/tags_reference/geo edit-mode
 *     toolbar_buttons + features + related_sections/tags_persons on the data item:
 *     edit-mode-only; this phase gates LIST mode → not reached. Declined for edit.
 *   - text_area 'tm' mode parent_section_id/parent_section_tipo/created_by_user_id/
 *     matrix_id extras: tm-only → declined.
 *   - text_area values carrying TR markup or exceeding the truncation limit:
 *     declined (the transforms are not ported this phase).
 */

import type { ComponentDatum } from '@dedalo/db';
import { ComponentTextArea } from './component_text_area.ts';
import { ComponentGeneric } from './component_generic.ts';
import { ComponentDate } from './component_date.ts';
import { ComponentSelect } from './component_select.ts';
import { ComponentRadioButton } from './component_radio_button.ts';
import { ComponentCheckBox } from './component_check_box.ts';
import { ComponentRelationParent } from './component_relation_parent.ts';
import { ComponentRelationRelated } from './component_relation_related.ts';
import { ComponentPortal } from './component_portal.ts';
import { ComponentPublication } from './component_publication.ts';
import type {
  ComponentRelationCommon,
  DatalistRecordSearch,
} from './component_relation_common.ts';
import { buildInputTextElement } from './input_text_element.ts';
import { resolveMatrixTable } from './matrix_table.ts';
import { ComponentImage, type MediaFileInfo } from './component_image.ts';
import type { MediaConfig } from './media_config.ts';
import type { ComponentInit, DataColumnName } from './component_common.ts';
import {
  buildComponentElementContext,
  type BuildComponentElementContextOptions,
  type ElementContextSource,
} from './component_element_context.ts';

/** The simple data models this builder ports (besides component_input_text). */
export type DataElementModel =
  | 'component_text_area'
  | 'component_number'
  | 'component_email'
  | 'component_date'
  | 'component_json'
  | 'component_geolocation'
  // RELATION/SELECT family DATA element (list mode only — see RELATION_SELECT_MODELS
  // and the module docblock for the per-model field set + entries shape).
  | 'component_select'
  // DATALIST family (list mode only): entries = get_list_value() = the LABELS of the
  // datalist options matching the stored selection(s). Needs a datalistRecordSearch.
  | 'component_radio_button'
  | 'component_check_box'
  // component_publication: relation-family, but its LIST controller emits a SELECT/
  // datalist-style item (entries = get_list_value() labels), so it lives in the
  // DATALIST family — NOT the relation_parent/related main-item+subdatum shape.
  | 'component_publication'
  | 'component_relation_parent'
  | 'component_relation_related'
  // component_portal: relation-family with the relation_parent main-item+subdatum
  // shape (paginated locators + parent_tipo/parent_section_id/pagination, then
  // get_subdatum label columns). parent_section_id = get_section_id() (NOT false).
  | 'component_portal'
  // ── MEDIA family (image/av/pdf) — DECLINED loudly (NOT byte-reproducible here). ──
  // See MEDIA_MODELS + the buildRelationSelectDataElement / buildDataElement decline
  // guards and the module docblock 'MEDIA FAMILY — DECLINED' section.
  | 'component_image'
  | 'component_av'
  | 'component_pdf';

/**
 * The RELATION/SELECT family models whose DATA element (list mode) this builder
 * ports. Their `entries`/data-half shape is fundamentally different from the simple
 * components (see the RELATION/SELECT docblock below):
 *
 *   - component_select (list): the JSON controller sets `$value = [ get_value() ]`
 *     so `entries` is a SINGLE-element array holding the FLAT resolved label string
 *     (the already-ported get_export_value()->to_flat_string()). One data item; the
 *     standalone controller appends NO trailing field (base get_data_item only).
 *     The build_json_rows assembly stamps row_section_id + parent_tipo separately.
 *
 *   - component_relation_parent / component_relation_related (list): the controller
 *     emits a MAIN item whose `entries` are the RAW stored locators (each with a
 *     `paginated_key` appended by get_data_paginated), plus appended `parent_tipo`,
 *     `parent_section_id` and a `pagination` {total,limit,offset} sub-object; THEN
 *     it runs get_subdatum($tipo, $locators) which, per locator × per label-column
 *     ddo, builds that child component's {context,data} element and appends each
 *     resolved item to data (the resolved label LIVES in these subdatum data items,
 *     NOT in the main item). The subdatum items are stamped from_component_tipo =
 *     this.tipo (the relation is a COMPONENT caller), parent_tipo = this.tipo, and
 *     row_section_id = the locator's section_id (the stored STRING). For the common
 *     single-input_text ddo_map (the only shape resolveLabelComponents accepts) each
 *     subdatum item is exactly a buildInputTextElement(caller=relation) output.
 *
 *     EMISSION ORDER differs between the two controllers (byte-significant):
 *       relation_parent  → [ main, ...subdata ]   (main pushed before get_subdatum)
 *       relation_related → [ ...subdata, main ]   (main pushed AFTER the subdata loop)
 *     parent's `parent_section_id` = get_parent() (false for a top-level section
 *     standalone instance — no portal parent); related's = get_section_id().
 *     EMPTY (no locators): parent → NO main item at all (data=[]); related → the
 *     main item ALWAYS (entries=[]), no subdata.
 *
 *   - component_radio_button / component_check_box (LIST mode): entries =
 *     get_list_value() = match each stored locator against get_list_of_values()
 *     (the DATALIST subsystem) and emit the matched datalist LABELS, in datalist
 *     order. NOW PORTED via ComponentRelationCommon.getListValue(): the datalist is
 *     the target section's rows (enumerated by the injected datalistRecordSearch),
 *     each resolved to its single show-label component at DEDALO_DATA_LANG, sorted
 *     (sort_by / label); get_list_value keeps the labels whose locator matches a
 *     stored selection. The standalone element is byte-gated (radio single/empty,
 *     check_box single/empty). Gated to the single-target / single-leaf-label V5
 *     shape (loud throw otherwise). The IN-SECTION (build_json_rows) column for
 *     radio/check_box is still DECLINED (not in PORTED_ELEMENT_MODELS): like
 *     relation_parent/related, the in-section relation/select CONTEXT half is not
 *     byte-reproduced here and the datalist search is not threaded through the
 *     section walk.
 *
 * DECLINED (NOT in this set, reported in the module docblock):
 *   - component_relation_children: get_data() is a related-mode SQL SEARCH (needs the
 *     queryer) AND the computed child locators carry a different shape (no paginated_key /
 *     no id) plus the section_map sibling-order dataframe — its element needs pieces not
 *     reachable here → declined (its get_value remains ported separately).
 *   - EDIT/TM/SEARCH modes for the whole family: edit emits the raw locators + a
 *     `datalist` (get_list_of_values) — unported → declined (LIST only).
 */
const RELATION_SELECT_MODELS: ReadonlySet<DataElementModel> = new Set([
  'component_select',
  'component_radio_button',
  'component_check_box',
  'component_publication',
  'component_relation_parent',
  'component_relation_related',
  'component_portal',
]);

/** DATALIST family: entries via get_list_value() (needs datalistRecordSearch). */
const DATALIST_MODELS: ReadonlySet<DataElementModel> = new Set([
  'component_radio_button',
  'component_check_box',
  'component_publication',
]);

/**
 * MEDIA family (image/av/pdf).
 *
 * ── component_image LIST/tm — NOW PORTED (this phase). ──
 *   `entries` = get_list_value() = the STORED files_info filtered to
 *   {default_quality, thumb_quality} × {extension|thumb_extension}. The stored
 *   files_info IS the DB `media` matrix column (verbatim — verified vs psql), so the
 *   entries CONTENT and the sharded `file_path`/`file_size`/`file_time` are passed
 *   through UNCHANGED (NO URL derivation — the path is already stored). The FILTER
 *   keys come from a per-instance MediaConfig (the DEDALO_IMAGE_* constants, built
 *   from env exactly like contextConfig/langConfig — this instance sets
 *   default_quality='1.5MB', extension='jpg'). The single appended field
 *   `external_source` = get_external_source() is DB-derived (a SIBLING component
 *   point-read: its iri when its first datum has a non-empty dataframe; null
 *   otherwise) → reproduced. See buildImageListDataElement + ComponentImage.
 *
 *   entries=null when the component has no stored data; entries=[] when it has data
 *   but no file_info matches the filter (e.g. all 'highres' extension while the config
 *   extension is 'jpg' — the image_external_source_list golden).
 *
 * ── STILL DECLINED (fail-closed, never a guessed shape): ──
 *   - image EDIT (and any non-list image mode): edit emits the FULL files_info
 *     (get_data_lang) + `base_svg_url`, which is a FILESYSTEM SVG-existence probe
 *     (get_base_svg_url(true)) → declined precisely (no FS probe here).
 *   - av: `posterframe_url` = DEDALO_MEDIA_URL + folder + '/posterframe' +
 *     additional_path + get_id() (a constructed media-store URL needing the
 *     DEDALO_MEDIA_URL + section_id sharding/additional_path port) + edit `subtitles`
 *     (media-store subtitle URL + lang metadata) → declined.
 *   - pdf: no appended field, but av/pdf are kept declined this phase (gate image first).
 *
 * NB: a portal whose request_config show-ddo label column is component_image still
 * declines via the shared relation resolver's non-input_text-family loud guard (the
 * portal subdatum element is not reached here — only the standalone image element).
 */
const MEDIA_MODELS: ReadonlySet<DataElementModel> = new Set([
  'component_image',
  'component_av',
  'component_pdf',
]);

/** Media models whose LIST data element is NOT ported (av/pdf — see MEDIA_MODELS). */
const DECLINED_MEDIA_MODELS: ReadonlySet<DataElementModel> = new Set([
  'component_av',
  'component_pdf',
]);

/** Inputs identifying the component element to build (mirrors InputTextElementSource). */
export interface DataElementSource {
  tipo: string;
  section_tipo: string;
  section_id: number | string | null;
  /** Requested RQO lang; the EFFECTIVE lang is translatable ? this : lg-nolan. */
  lang?: string;
  /** 'edit' | 'list' | 'tm' | 'search'. Default 'edit'. */
  mode?: string;
  /** The component model (drives entries resolution + appended fields). */
  model: DataElementModel;
  /** ASSEMBLY caller tipo → stamped onto parent_tipo (get_subdatum). */
  caller_tipo?: string;
  /** ASSEMBLY caller from_component_tipo override (component/portal callers only). */
  from_component_tipo?: string;
  /**
   * TIME-MACHINE snapshot datum (matrix_time_machine.data). When PRESENT (the key
   * exists, even if null), the data half resolves `entries` from this snapshot
   * instead of the live matrix column — PHP get_data() tm branch + the per-model
   * list/tm entries transform (get_list_value / get_data_lang). Only injected for
   * SIMPLE non-dataframe/non-relation models in mode 'tm' (the caller gates this).
   */
  tmData?: ComponentDatum[] | null;
}

/** Deps: value-resolution deps + context-builder deps (reused for the context half). */
export interface BuildDataElementOptions {
  matrix: ComponentInit['matrix'];
  ontology: ComponentInit['ontology'];
  langConfig: ComponentInit['langConfig'];
  /** Matrix table the section lives in. */
  matrixTable: string;
  context: Pick<
    BuildComponentElementContextOptions,
    'toolsQueryer' | 'contextConfig' | 'toolProperties'
  >;
  /**
   * Enumerate the datalist target section's rows (the search behind
   * get_list_of_values). Required ONLY for the DATALIST family (radio_button /
   * check_box LIST mode); absent for every other model. Injected by the caller so
   * this module stays free of @dedalo/search.
   */
  datalistRecordSearch?: DatalistRecordSearch;
  /**
   * Per-instance media config (the DEDALO_IMAGE_* constants). Required ONLY for the
   * MEDIA family (component_image LIST mode — the get_list_value quality/extension
   * filter). Absent for every other model. Frozen, process-global (like
   * contextConfig); built via mediaConfigFromEnv. Pinned in tests (hermetic).
   */
  mediaConfig?: MediaConfig;
  /**
   * The component_text_area EDIT-mode `context.features` bag — the well-known
   * DEDALO_*_TIPO source constants (dd_tipos.php) the WYSIWYG editor needs to build
   * notes/references/AV interactions. PHP hardcodes these in source (not per-install),
   * so this is an OPTIONAL override defaulting to DEFAULT_TEXT_AREA_EDIT_FEATURES.
   * The single per-install-variable field, `references_component_model`, is resolved
   * from the ontology (getModelByTipo(references_component_tipo)), NOT carried here.
   */
  textAreaEditFeatures?: TextAreaEditFeaturesConstants;
}

/**
 * The hardcoded DEDALO_* source constants the component_text_area edit controller
 * forwards in `context.features` (core/base/dd_tipos.php). These are PHP source
 * constants (identical across installs), so they default in source here; an env-
 * driven override hook is provided for completeness (textAreaEditFeaturesFromEnv).
 * `references_component_model` is NOT here — it is resolved per-request from the
 * ontology (model of references_component_tipo).
 */
export interface TextAreaEditFeaturesConstants {
  notesSectionTipo: string;
  notesPublicationTipo: string;
  referencesSectionTipo: string;
  referencesComponentTipo: string;
  avPlayPauseCode: string;
  avInsertTcCode: string;
  avRewindSeconds: number;
}

/** dd_tipos.php source defaults for the text_area edit `features` constants. */
export const DEFAULT_TEXT_AREA_EDIT_FEATURES: TextAreaEditFeaturesConstants = {
  notesSectionTipo: 'rsc326', // DEDALO_NOTES_SECTION_TIPO
  notesPublicationTipo: 'rsc399', // DEDALO_NOTES_PUBLICATION_TIPO
  referencesSectionTipo: 'rsc425', // DEDALO_TS_REFERENCES_SECTION_TIPO
  referencesComponentTipo: 'rsc426', // DEDALO_TS_REFERENCES_COMPONENT_TIPO
  avPlayPauseCode: 'Escape',
  avInsertTcCode: 'F2',
  avRewindSeconds: 3,
};

/** Build the text_area edit `features` constants from an env map (overrides source defaults). */
export function textAreaEditFeaturesFromEnv(
  env: Record<string, string | undefined> = process.env,
): TextAreaEditFeaturesConstants {
  const d = DEFAULT_TEXT_AREA_EDIT_FEATURES;
  return {
    notesSectionTipo: env.DEDALO_NOTES_SECTION_TIPO ?? d.notesSectionTipo,
    notesPublicationTipo: env.DEDALO_NOTES_PUBLICATION_TIPO ?? d.notesPublicationTipo,
    referencesSectionTipo: env.DEDALO_TS_REFERENCES_SECTION_TIPO ?? d.referencesSectionTipo,
    referencesComponentTipo: env.DEDALO_TS_REFERENCES_COMPONENT_TIPO ?? d.referencesComponentTipo,
    avPlayPauseCode: d.avPlayPauseCode,
    avInsertTcCode: d.avInsertTcCode,
    avRewindSeconds: d.avRewindSeconds,
  };
}

/** The {context, data} element a component get_json() returns. */
export interface DataElement {
  context: unknown[];
  data: DataElementItem[];
}

/**
 * The DATA-half item. Field set is per-model (see module docblock): number/email
 * carry parent_section_id (no fallback_value); text_area carries fallback_value
 * (no parent_section_id). The optional members are present-or-absent by model, and
 * the insertion order is preserved by building the object explicitly per model.
 */
export interface DataElementItem {
  section_id: number | string | null;
  section_tipo: string;
  tipo: string;
  mode: string;
  lang: string;
  from_component_tipo: string;
  entries: ComponentDatum[] | string[] | MediaFileInfo[] | null;
  /** image LIST only: get_external_source() — a sibling iri or null. */
  external_source?: string | null;
  /** Appended for text_area/number/email/relation; ABSENT for date/json/geolocation/select. */
  parent_tipo?: string;
  /** number/email: section_id; relation: get_parent() (false) or get_section_id(). */
  parent_section_id?: number | string | boolean | null;
  fallback_value?: ComponentDatum[] | null;
  /** relation main item only: {total, limit, offset}. */
  pagination?: { total: number; limit: number; offset: number };
  /** relation subdatum items only: the locator's stored section_id (get_subdatum stamp). */
  row_section_id?: number | string;
}

/** Thrown when an input hits a special case this phase declines (dataframe/edit-mode specials). */
export class UnsupportedDataElement extends Error {}

/** The matrix family column per model (PHP section_record_data::$column_map). */
const MODEL_COLUMN: Record<DataElementModel, DataColumnName> = {
  component_text_area: 'string',
  component_number: 'number',
  component_email: 'string',
  component_date: 'date',
  component_json: 'misc',
  component_geolocation: 'geo',
  // RELATION/SELECT family: locators stored in the 'relation' matrix column.
  component_select: 'relation',
  component_radio_button: 'relation',
  component_check_box: 'relation',
  component_publication: 'relation',
  component_relation_parent: 'relation',
  component_relation_related: 'relation',
  component_portal: 'relation',
  // MEDIA family: files_info stored in the 'media' matrix column (DECLINED — see
  // MEDIA_MODELS; the column is recorded for completeness but the builder throws).
  component_image: 'media',
  component_av: 'media',
  component_pdf: 'media',
};

/** Models whose JSON controller appends NO trailing field (base get_data_item only). */
const BASE_ONLY_MODELS: ReadonlySet<DataElementModel> = new Set([
  'component_date',
  'component_json',
  'component_geolocation',
]);

/** section_id may arrive as a numeric string; PHP coerces with (int) for the matrix read. */
function normalizeSectionId(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isInteger(raw) ? raw : null;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * Build the {context, data} element for component_text_area / component_number /
 * component_email.
 *
 * @throws UnsupportedDataElement when the input hits a declined special case
 *   (has_dataframe, or text_area edit/tm-mode specials).
 */
export async function buildDataElement(
  source: DataElementSource,
  opts: BuildDataElementOptions,
): Promise<DataElement> {
  const tipo = source.tipo;
  const sectionTipo = source.section_tipo;
  const requestedLang = source.lang ?? opts.langConfig.dataLang;
  const mode = source.mode ?? 'edit';
  const model = source.model;

  // ── MEDIA family. component_image LIST → ported; image non-list + av/pdf → declined. ──
  if (MEDIA_MODELS.has(model)) {
    if (model === 'component_image' && mode === 'list') {
      return buildImageListDataElement(source, opts, tipo, sectionTipo, requestedLang, mode);
    }
    if (DECLINED_MEDIA_MODELS.has(model)) {
      throw new UnsupportedDataElement(
        `${model} ${tipo}: av/pdf media element DATA half not ported (posterframe_url/subtitles ` +
          `are media-store-URL/filesystem-derived) — declined, no guessed bytes`,
      );
    }
    // component_image non-list (edit/tm/search): edit emits the full files_info +
    // base_svg_url (a FILESYSTEM SVG probe) — declined precisely (no FS probe here).
    throw new UnsupportedDataElement(
      `component_image ${tipo}: ${mode} mode not ported (edit emits full files_info + ` +
        `base_svg_url, a filesystem SVG-existence probe) — declined, no guessed bytes`,
    );
  }

  // ── RELATION/SELECT family (list mode only) → dedicated builder. ──
  if (RELATION_SELECT_MODELS.has(model)) {
    return buildRelationSelectDataElement(source, opts, tipo, sectionTipo, requestedLang, mode, model);
  }

  // ── DECLINE has_dataframe (extra subdatum context/data + counter). ──
  const properties = (await opts.ontology.getProperties(tipo)) ?? {};
  if ((properties as { has_dataframe?: unknown }).has_dataframe === true) {
    throw new UnsupportedDataElement(`has_dataframe not ported (tipo ${tipo})`);
  }

  // ── component_text_area edit/tm-mode gate. ──
  // EDIT mode is now PORTED for the COMMON text_area: the controller adds
  // `context.toolbar_buttons` + `context.features` (see buildTextAreaEditFeatures).
  // But it stays DECLINED when ANY of the conditional edit specials would fire:
  //   - toolbar_buttons additions: properties.tags_persons / tags_reference /
  //     tags_draw, or a search_exact RELATED component_geolocation (button_geo);
  //   - context.options.related_component_lang: a related component_select_lang
  //     WITH data (get_original_lang non-null) — needs a sibling component read;
  //   - the data-item person-tag extras (related_sections / tags_persons).
  // Those subsystems (transcription tags / geo-link / select_lang) are not ported,
  // so we fail closed precisely rather than emit a half-built features context.
  // 'tm' mode is also declined (parent_section_tipo / created_by_user_id extras).
  if (model === 'component_text_area' && mode === 'tm') {
    throw new UnsupportedDataElement(
      `component_text_area tm mode (parent_section_tipo/created_by_user_id/matrix_id) not ported (tipo ${tipo})`,
    );
  }
  const isTextAreaEdit = model === 'component_text_area' && mode !== 'list' && mode !== 'search';
  if (isTextAreaEdit) {
    const p = properties as {
      tags_persons?: unknown;
      tags_reference?: unknown;
      tags_draw?: unknown;
    };
    if (p.tags_persons !== undefined) {
      throw new UnsupportedDataElement(
        `component_text_area edit tags_persons (button_person/button_note + related_sections) not ported (tipo ${tipo})`,
      );
    }
    if (p.tags_reference !== undefined) {
      throw new UnsupportedDataElement(
        `component_text_area edit tags_reference (reference toolbar button) not ported (tipo ${tipo})`,
      );
    }
    if (p.tags_draw !== undefined) {
      throw new UnsupportedDataElement(
        `component_text_area edit tags_draw (button_draw toolbar button) not ported (tipo ${tipo})`,
      );
    }
    // related component_geolocation (search_exact) → button_geo + button_note; and
    // related component_select_lang → get_original_lang context.options. Both are
    // detected from the component's relation set; decline either.
    const relTipos = (await opts.ontology.getRelationTipos(tipo)) ?? [];
    for (const rt of relTipos) {
      const rm = await opts.ontology.getModelByTipo(rt);
      if (rm === 'component_geolocation') {
        throw new UnsupportedDataElement(
          `component_text_area edit related component_geolocation (button_geo) not ported (tipo ${tipo})`,
        );
      }
      if (rm === 'component_select_lang') {
        throw new UnsupportedDataElement(
          `component_text_area edit related component_select_lang (get_original_lang / context.options) not ported (tipo ${tipo})`,
        );
      }
    }
  }

  // ── CONTEXT half: reuse the byte-green component structure-context builder ──
  const contextSource: ElementContextSource = {
    tipo,
    section_tipo: sectionTipo,
    model,
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
  let context: unknown[] = ctxResponse.result === false ? [] : ctxResponse.result;

  // text_area EDIT: append `toolbar_buttons` (= [] for the gated no-tag case) and
  // `context.features` (the fixed source-constant bag) to each context DDO, in the
  // controller's emission order (AFTER the structure-context's trailing `path`).
  if (isTextAreaEdit) {
    const features = await buildTextAreaEditFeatures(opts);
    context = context.map((c) => {
      const out: Record<string, unknown> = { ...(c as Record<string, unknown>) };
      out.toolbar_buttons = [];
      out.features = features;
      return out;
    });
  }

  // ── DATA half: resolve entries (+ fallback for text_area) ──
  // TIME-MACHINE: when source carries `tmData` (the matrix_time_machine snapshot),
  // inject it so getData() returns it directly; the per-model resolveDataEntries(mode)
  // (list/tm → get_list_value; date/edit → get_data_lang) then renders the entries
  // off the snapshot exactly as PHP does off $data_tm.
  const hasTmData = Object.prototype.hasOwnProperty.call(source, 'tmData');
  const init: ComponentInit = {
    tipo,
    sectionTipo,
    sectionId: normalizeSectionId(source.section_id),
    lang: requestedLang,
    dataColumnName: MODEL_COLUMN[model],
    matrixTable: opts.matrixTable,
    matrix: opts.matrix,
    ontology: opts.ontology,
    langConfig: opts.langConfig,
    ...(hasTmData ? { tmData: source.tmData ?? null } : {}),
  };

  // get_data_item shared fields.
  const fromComponentTipo = source.from_component_tipo ?? tipo;
  const parentTipo = source.caller_tipo ?? tipo;

  let entries: ComponentDatum[] | null;
  let effectiveLang: string;
  let fallbackValue: ComponentDatum[] | null = null;
  let model_has_fallback = false;

  if (model === 'component_text_area') {
    const component = await ComponentTextArea.create(init);
    effectiveLang = component.effectiveLang();
    const resolved = await component.resolveDataEntries(mode);
    entries = resolved.entries;
    fallbackValue = resolved.fallbackValue;
    model_has_fallback = true;
  } else if (model === 'component_date') {
    // component_date: structured raw datum via get_data_lang() (all modes); base-7
    // only data item (controller appends nothing).
    const component = await ComponentDate.create(init);
    effectiveLang = component.effectiveLang();
    const resolved = await component.resolveDataEntries(mode);
    entries = resolved.entries;
  } else {
    // GENERIC path: number / email / json / geolocation. number/email append
    // parent_tipo+parent_section_id; json/geo append nothing (BASE_ONLY_MODELS).
    const component = await ComponentGeneric.create(init, model);
    effectiveLang = component.effectiveLang();
    const resolved = await component.resolveDataEntries(mode);
    entries = resolved.entries;
  }

  // Build the data item with the EXACT per-model field order (byte-significant).
  // get_data_item base (1..7):
  const item: DataElementItem = {
    section_id: source.section_id ?? null,
    section_tipo: sectionTipo,
    tipo,
    mode,
    lang: effectiveLang,
    from_component_tipo: fromComponentTipo,
    entries,
  };
  if (BASE_ONLY_MODELS.has(model)) {
    // date / json / geolocation: NOTHING appended (base get_data_item only). The
    // build_json_rows assembly stamps parent_tipo + row_section_id separately.
  } else if (model_has_fallback) {
    // text_area: parent_tipo, fallback_value (NO parent_section_id).
    item.parent_tipo = parentTipo;
    item.fallback_value = fallbackValue;
  } else {
    // number / email: parent_tipo, parent_section_id (NO fallback_value).
    item.parent_tipo = parentTipo;
    item.parent_section_id = source.section_id ?? null;
  }

  return { context, data: [item] };
}

/**
 * Build the component_text_area EDIT-mode `context.features` object — the constant
 * bag the WYSIWYG editor reads (component_text_area_json.php edit branch). Field
 * ORDER is byte-significant (PHP (object) cast literal order):
 *   notes_section_tipo, notes_publication_tipo, references_section_tipo,
 *   references_component_tipo, references_component_model, av_player{...}.
 * Four of the tipos are dd_tipos.php source constants (defaulted / env-overridable
 * via opts.textAreaEditFeatures); `references_component_model` is the ONLY per-
 * install field — the ontology model of references_component_tipo (e.g.
 * component_portal). av_player is itself an ordered object literal.
 */
async function buildTextAreaEditFeatures(
  opts: BuildDataElementOptions,
): Promise<Record<string, unknown>> {
  const c = opts.textAreaEditFeatures ?? DEFAULT_TEXT_AREA_EDIT_FEATURES;
  // references_component_model = get_model_by_tipo(references_component_tipo, true).
  const referencesComponentModel =
    (await opts.ontology.getModelByTipo(c.referencesComponentTipo)) ?? null;
  const features: Record<string, unknown> = {};
  features.notes_section_tipo = c.notesSectionTipo;
  features.notes_publication_tipo = c.notesPublicationTipo;
  features.references_section_tipo = c.referencesSectionTipo;
  features.references_component_tipo = c.referencesComponentTipo;
  features.references_component_model = referencesComponentModel;
  features.av_player = {
    av_play_pause_code: c.avPlayPauseCode,
    av_insert_tc_code: c.avInsertTcCode,
    av_rewind_seconds: c.avRewindSeconds,
  };
  return features;
}

/**
 * Build the {context, data} DATA element for component_image LIST mode
 * (component_image_json.php, list/tm branch). The DATA half is:
 *   value = get_list_value() (stored files_info filtered to default/thumb qualities);
 *   item  = get_data_item(value);
 *   item->external_source = get_external_source().
 *
 * The CONTEXT half carries an image-specific `features` block (allowed_extensions /
 * ar_quality / default_quality / alternative_extensions / …) which the element
 * context builder does NOT (yet) reproduce; like the relation/select family, this
 * builder returns the best-effort component context but ONLY the DATA half is gated
 * (so component_image is NOT added to a section's PORTED_ELEMENT_MODELS).
 *
 * @throws UnsupportedDataElement when has_dataframe (extra subdatum context/data +
 *   counter) — out of phase scope.
 */
async function buildImageListDataElement(
  source: DataElementSource,
  opts: BuildDataElementOptions,
  tipo: string,
  sectionTipo: string,
  requestedLang: string,
  mode: string,
): Promise<DataElement> {
  if (opts.mediaConfig === undefined) {
    throw new UnsupportedDataElement(
      `component_image ${tipo}: LIST mode needs a mediaConfig (none provided)`,
    );
  }
  // DECLINE has_dataframe (extra subdatum context/data + counter).
  const properties = (await opts.ontology.getProperties(tipo)) ?? {};
  if ((properties as { has_dataframe?: unknown }).has_dataframe === true) {
    throw new UnsupportedDataElement(`has_dataframe not ported (tipo ${tipo})`);
  }

  // CONTEXT half (best-effort; NOT gated for image — the `features` block is the
  // element-context phase's job; see docblock).
  const ctxResponse = await buildComponentElementContext(
    { tipo, section_tipo: sectionTipo, model: 'component_image', lang: requestedLang, mode },
    {
      ontology: opts.ontology,
      toolsQueryer: opts.context.toolsQueryer,
      contextConfig: opts.context.contextConfig,
      dataLang: opts.langConfig.dataLang,
      ...(opts.context.toolProperties ? { toolProperties: opts.context.toolProperties } : {}),
    },
  );
  const context: unknown[] = ctxResponse.result === false ? [] : ctxResponse.result;

  const init: ComponentInit = {
    tipo,
    sectionTipo,
    sectionId: normalizeSectionId(source.section_id),
    lang: requestedLang,
    dataColumnName: 'media',
    matrixTable: opts.matrixTable,
    matrix: opts.matrix,
    ontology: opts.ontology,
    langConfig: opts.langConfig,
  };

  const component = await ComponentImage.create(init);
  const entries = await component.getListValue(opts.mediaConfig);
  const externalSource = await component.getExternalSource();

  // get_data_item base-7, then the list controller appends external_source. (The
  // SHOW_DEBUG-only debug_* fields are dropped by the differ — not emitted here.)
  const item: DataElementItem = {
    section_id: source.section_id ?? null,
    section_tipo: sectionTipo,
    tipo,
    mode,
    lang: component.effectiveLang(),
    from_component_tipo: source.from_component_tipo ?? tipo,
    entries,
    external_source: externalSource,
  };

  return { context, data: [item] };
}

/**
 * Build the {context, data} DATA element for the RELATION/SELECT family (LIST mode):
 * component_select, component_relation_parent, component_relation_related.
 *
 * Scope is the DATA half (byte-gated against the live element/section goldens). The
 * CONTEXT half carries the relation's request_config (target_sections / columns_map /
 * children_view / get_order_path recursion), which is the ELEMENT-CONTEXT phase's
 * job and is NOT reproduced by buildComponentElementContext — so this builder returns
 * the best-effort component context but only the DATA half is gated. (These models
 * are therefore NOT in PORTED_ELEMENT_MODELS: a full-section context is not yet
 * byte-reachable for relation/select columns.)
 *
 * @throws UnsupportedDataElement for non-LIST modes (edit/tm/search emit a datalist),
 *   or when the label-column ddo_map hits an un-ported shape (the relation resolver
 *   throws), so a half-ported element never escapes the gate.
 */
async function buildRelationSelectDataElement(
  source: DataElementSource,
  opts: BuildDataElementOptions,
  tipo: string,
  sectionTipo: string,
  requestedLang: string,
  mode: string,
  model: DataElementModel,
): Promise<DataElement> {
  // LIST always reaches here. TM is supported ONLY for the DATALIST family
  // (radio_button / check_box / publication): their list/tm entries both come from
  // get_list_value() (the matched datalist labels), and the value resolution is
  // identical (the tm snapshot is injected via source.tmData). The relation_parent/
  // related/portal/select families emit a different tm shape (main locator item +
  // subdatum / get_list_of_values datalist) that is NOT ported → decline. EDIT/SEARCH
  // for the whole family resolve a datalist (get_list_of_values) → decline.
  const isDatalistTm = mode === 'tm' && DATALIST_MODELS.has(model);
  if (mode !== 'list' && !isDatalistTm) {
    throw new UnsupportedDataElement(
      `${model} ${mode} mode (datalist / get_list_of_values) not ported (tipo ${tipo})`,
    );
  }
  // DECLINE has_dataframe (extra subdatum context/data + counter).
  const properties = (await opts.ontology.getProperties(tipo)) ?? {};
  if ((properties as { has_dataframe?: unknown }).has_dataframe === true) {
    throw new UnsupportedDataElement(`has_dataframe not ported (tipo ${tipo})`);
  }

  // CONTEXT half (best-effort; NOT gated for this family — see docblock).
  const ctxResponse = await buildComponentElementContext(
    { tipo, section_tipo: sectionTipo, model, lang: requestedLang, mode },
    {
      ontology: opts.ontology,
      toolsQueryer: opts.context.toolsQueryer,
      contextConfig: opts.context.contextConfig,
      dataLang: opts.langConfig.dataLang,
      ...(opts.context.toolProperties ? { toolProperties: opts.context.toolProperties } : {}),
    },
  );
  const context: unknown[] = ctxResponse.result === false ? [] : ctxResponse.result;

  // TIME-MACHINE: inject the snapshot so getData() returns it (after the relation
  // filterTmData drops dd490 frames + non-locators) instead of the live matrix
  // column. Only the DATALIST tm path reaches here with tmData present.
  const hasTmData = Object.prototype.hasOwnProperty.call(source, 'tmData');
  const init: ComponentInit = {
    tipo,
    sectionTipo,
    sectionId: normalizeSectionId(source.section_id),
    lang: requestedLang,
    dataColumnName: 'relation',
    matrixTable: opts.matrixTable,
    matrix: opts.matrix,
    ontology: opts.ontology,
    langConfig: opts.langConfig,
    ...(hasTmData ? { tmData: source.tmData ?? null } : {}),
  };

  // get_data_item shared fields. For a SECTION caller from_component_tipo stays the
  // component's own tipo; for a COMPONENT caller (the build_json_rows walk for a
  // relation-of-relation, not reached here) it would be overwritten.
  const fromComponentTipo = source.from_component_tipo ?? tipo;

  // ── component_select: entries = [ get_value() ] (single flat label string). ──
  if (model === 'component_select') {
    const component = await ComponentSelect.create(init);
    const flat = await component.getValue();
    const item: DataElementItem = {
      section_id: source.section_id ?? null,
      section_tipo: sectionTipo,
      tipo,
      mode,
      lang: component.effectiveLang(),
      from_component_tipo: fromComponentTipo,
      entries: [flat],
      // The standalone select controller appends NOTHING (base get_data_item only);
      // the build_json_rows assembly stamps row_section_id + parent_tipo separately.
    };
    return { context, data: [item] };
  }

  // ── component_radio_button / component_check_box (DATALIST family): entries =
  //    get_list_value() = the LABELS of the datalist options matching the stored
  //    selection(s), in datalist order. Base-7 data item only (NO appended field —
  //    verified vs the live radio/check_box list goldens). null entries when the
  //    component has no stored data; [] when it has data but none matches. ──
  if (DATALIST_MODELS.has(model)) {
    if (opts.datalistRecordSearch === undefined) {
      throw new UnsupportedDataElement(
        `${model} ${tipo}: datalist list mode needs a datalistRecordSearch (none provided)`,
      );
    }
    const component =
      model === 'component_radio_button'
        ? await ComponentRadioButton.create(init)
        : model === 'component_publication'
          ? await ComponentPublication.create(init)
          : await ComponentCheckBox.create(init);
    // getListValue throws (loud guard) for the un-ported datalist shapes (V6,
    // filtered_by_search*, multi-target, multi-label) — convert to the builder's
    // contract type so a half-ported element fails closed.
    let entries: string[] | null;
    try {
      entries = await component.getListValue(opts.datalistRecordSearch);
    } catch (e) {
      throw new UnsupportedDataElement(
        `${model} ${tipo}: datalist not ported (${(e as Error).message})`,
      );
    }
    const item: DataElementItem = {
      section_id: source.section_id ?? null,
      section_tipo: sectionTipo,
      tipo,
      mode,
      lang: component.effectiveLang(),
      from_component_tipo: fromComponentTipo,
      entries,
    };
    return { context, data: [item] };
  }

  // ── component_relation_parent / component_relation_related / component_portal: main
  //    locator item + per-locator subdatum label-column elements. ──
  const relation =
    model === 'component_relation_parent'
      ? await ComponentRelationParent.create(init)
      : model === 'component_portal'
        ? await ComponentPortal.create(init)
        : await ComponentRelationRelated.create(init);

  const locators = await (relation as ComponentRelationCommon & {
    rawLocators(): Promise<ReadonlyArray<Record<string, unknown>>>;
    dataElementLabelComponents(): Promise<
      ReadonlyArray<{ tipo: string; model: string; column: DataColumnName }>
    >;
    effectiveLang(): string;
    elementSectionId(): number | null;
  }).rawLocators();
  const effectiveLang = relation.effectiveLang();

  // EMPTY: relation_parent AND component_portal emit NOTHING (data=[]) — the portal
  // controller guards `if (!empty($data_value) && $mode!='solved')` so no main item is
  // pushed for an empty portal (verified vs portal_empty_list golden: data=[]).
  // relation_related ALWAYS emits the main item (entries=[]).
  if (
    locators.length === 0 &&
    (model === 'component_relation_parent' || model === 'component_portal')
  ) {
    return { context, data: [] };
  }

  // pagination (the controller replaces get_data_item's slice pagination with a
  // full-count one). The native path renders the whole (un-paginated) locator set;
  // limit defaults to the controller's pagination->limit. For the live goldens the
  // standalone instance limit is the total count (single locator → limit 1).
  const total = locators.length;
  // get_data_paginated default limit is the component pagination->limit. The standalone
  // element pagination shows limit === total (the controller's default pagination cap
  // for these single-locator records). We reproduce {total, limit:total, offset:0}.
  const limit = total;
  const offset = 0;

  // entries: the raw locators with paginated_key appended (get_data_paginated).
  const pagedEntries = locators.map((loc, key) => ({
    ...loc,
    paginated_key: key + offset,
  })) as unknown as ComponentDatum[];

  // parent_section_id source: parent → get_parent() (false for a standalone top-level
  // section instance — no portal parent); related/portal → get_section_id() (the host
  // record id — the portal controller sets $item->parent_section_id = $section_id).
  const parentSectionId: number | string | boolean | null =
    model === 'component_relation_parent'
      ? false
      : (source.section_id ?? null);

  const mainItem: DataElementItem = {
    section_id: source.section_id ?? null,
    section_tipo: sectionTipo,
    tipo,
    mode,
    lang: effectiveLang,
    from_component_tipo: fromComponentTipo,
    entries: total === 0 ? [] : pagedEntries,
    parent_tipo: source.caller_tipo ?? tipo,
    parent_section_id: parentSectionId,
    pagination: { total, limit, offset },
  };

  // SUBDATUM walk (only when there are locators). Per locator × per label-column ddo,
  // build the child component's {context,data} element and stamp it. The relation is
  // a COMPONENT caller → from_component_tipo = relation tipo AND parent_tipo = relation
  // tipo; row_section_id = the locator's stored section_id (verbatim string).
  const subdata: DataElementItem[] = [];
  if (total > 0) {
    // resolveLabelComponents loud-throws (plain Error) on a ddo_map shape the read-side
    // slice does not reproduce — e.g. a portal whose show-ddo label column is a media
    // (component_image) or nested-relation (component_publication) component. Convert to
    // the builder's contract type so the whole element fails closed (no half-ported shape).
    let labelComponents: ReadonlyArray<{ tipo: string; model: string; column: DataColumnName }>;
    try {
      labelComponents = await (relation as ComponentRelationCommon & {
        dataElementLabelComponents(): Promise<
          ReadonlyArray<{ tipo: string; model: string; column: DataColumnName }>
        >;
      }).dataElementLabelComponents();
    } catch (e) {
      throw new UnsupportedDataElement(
        `${model} ${tipo}: subdatum label set not ported (${(e as Error).message})`,
      );
    }
    for (const loc of pagedEntries as unknown as Array<Record<string, unknown>>) {
      const locSectionTipo = loc['section_tipo'];
      if (typeof locSectionTipo !== 'string' || locSectionTipo === '') continue;
      // The locator's section_id is stored as a STRING; the child get_data_item sets
      // section_id = get_section_id() = that verbatim string ("3"), NOT an int. Pass
      // it through unchanged: buildInputTextElement coerces it for the matrix read but
      // keeps the original value in the item's section_id field (byte-significant).
      const locSectionIdRaw = loc['section_id'] as number | string;
      const targetTable =
        (await resolveMatrixTable(opts.ontology, locSectionTipo)) ?? opts.matrixTable;

      for (const label of labelComponents) {
        if (label.model !== 'component_input_text') {
          // Only the input_text label column is byte-ported as a subdatum element
          // (the relation resolver already restricts to leaf input_text-family /
          // generic; other generic leaf columns as subdatum elements are not gated
          // here — decline loudly so we never emit an un-verified shape).
          throw new UnsupportedDataElement(
            `${model} ${tipo}: subdatum label column ${label.tipo} model '${label.model}' not ported (only input_text)`,
          );
        }
        let childElement;
        try {
          childElement = await buildInputTextElement(
            {
              tipo: label.tipo,
              section_tipo: locSectionTipo,
              section_id: locSectionIdRaw,
              model: 'component_input_text',
              lang: requestedLang,
              mode,
              // relation is a COMPONENT caller: parent_tipo AND from_component_tipo are
              // overwritten with the relation's own tipo (get_subdatum stamp).
              caller_tipo: tipo,
              from_component_tipo: tipo,
            },
            {
              matrix: opts.matrix,
              ontology: opts.ontology,
              langConfig: opts.langConfig,
              matrixTable: targetTable,
              context: opts.context,
            },
          );
        } catch (e) {
          // A subdatum label column the input_text element declines (e.g.
          // with_lang_versions — the live PHP treats it as plain input_text, but
          // reconciling that with_lang_versions discrepancy is the input_text element
          // phase's job). Re-throw as UnsupportedDataElement so the relation element
          // fails closed with this builder's contract type.
          throw new UnsupportedDataElement(
            `${model} ${tipo}: subdatum label ${label.tipo} not ported (${(e as Error).message})`,
          );
        }
        for (const childItem of childElement.data) {
          // The relation *_json controller's list/tm-mode subdata loop OVERWRITES
          // parent_tipo (= relation tipo, already set) AND parent_section_id (= the
          // RELATION's parent_section_id: get_parent() for parent → false, or
          // get_section_id() for related → the relation's own section_id) — replacing
          // the child's own get_section_id() value. get_subdatum then appends
          // row_section_id = the locator's stored section_id (verbatim string), AFTER
          // fallback_value. Key order is preserved by mutating in place + appending.
          const stamped = {
            ...childItem,
            parent_section_id: parentSectionId,
            row_section_id: locSectionIdRaw,
          } as unknown as DataElementItem;
          subdata.push(stamped);
        }
      }
    }
  }

  // EMISSION ORDER (byte-significant): parent + portal → [main, ...subdata] (the main
  // item is pushed BEFORE the get_subdatum loop in both controllers); related →
  // [...subdata, main] (main pushed AFTER the subdata loop).
  const data: DataElementItem[] =
    model === 'component_relation_parent' || model === 'component_portal'
      ? [mainItem, ...subdata]
      : [...subdata, mainItem];

  return { context, data };
}
