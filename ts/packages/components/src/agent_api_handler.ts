/**
 * Native handler for the PHP `dd_agent_api` class
 * (core/api/v1/common/class.dd_agent_api.php) — the LLM/agent-facing view API. A
 * SEPARATE dd_api class; it registers exactly like createOntologyApiHandler.
 *
 * SCOPE (this brick): only the two byte-reproducible agent views are served
 * natively, re-derived from already-ported layers:
 *   - count_records       : a section record count (wraps the ported @dedalo/search
 *                           countRecords behind the agent envelope).
 *   - list_sections_index : the compact {tipo,label} section index, read VERBATIM
 *                           from the pre-built ontology_llm_map.json artifact (the
 *                           same file + priority PHP uses) and permission-filtered.
 *
 *   - describe_section: SERVED NATIVELY for the byte-reproducible case — a TIPO-shaped
 *     REAL (non-virtual) all-scalar section for the superuser (the SAME gate as
 *     read_record_view: every agent field-component a SCALAR get_value model). For such
 *     a section NO field is a LINK_MODEL, so agent_view_builder::section_to_view emits
 *     NO `target` (the only field needing the un-ported first_target_section_tipo →
 *     get_ar_target_section_tipo resolution). Each field is `{label, type}` (+ `{tipo,
 *     model}` and `_meta.field_tipos` when include_tipos); `type` is a pure port of
 *     SIMPLIFIED_TYPE_MAP. DECLINED → proxy when: not the superuser; a human-NAME /
 *     >5-letter tipo (the resolve_section_tipo label path fatals on the undefined
 *     section::get_ar_all_section_tipos); a VIRTUAL section; OR ANY field is a LINK /
 *     media / un-ported model (its section_to_view target would need resolution).
 *   - get_section_map: SERVED NATIVELY only for the ARTIFACT path — when the SAME
 *     ontology_llm_map.json PHP reads is present AND contains an entry for the resolved
 *     section_tipo, PHP returns that entry VERBATIM (`{tipo,label,fields}`, the `lang`
 *     param ignored). The native action reads the same artifact (the llmMapLoader) and
 *     returns the matching entry byte-for-byte — for the superuser, a TIPO-shaped real
 *     section. DECLINED → proxy when: not the superuser; a human-NAME / >5-letter tipo
 *     (un-ported resolve_section_tipo); a VIRTUAL section; the artifact is unconfigured /
 *     unreadable; OR the entry is ABSENT (PHP then live-builds via the un-ported
 *     get_term_data / first_target_section_tipo).
 *
 * DECLINED → proxied to PHP (precise reasons):
 *   - read_record_view / search_records_view: SERVED NATIVELY for the byte-reproducible
 *     case — a TIPO-shaped (/^[a-z]{1,5}[0-9]+$/) REAL (non-virtual) section, for the
 *     superuser, whose EVERY agent field-component is a native SCALAR get_value model
 *     (AGENT_SCALAR_GET_VALUE_MODELS: input_text/text_area/email/number/date/iri/json/
 *     geolocation/radio_button/section_id/publication). record_to_view's field set =
 *     section_label_map (recursive component children, agent EXCLUDED_MODELS dropped,
 *     ` (N)` collision suffix); each value = component_value's scalar branch = the
 *     ported resolveGetValue ('' / false → null). The flat {label:value} `fields`, the
 *     always-present `_meta {section_tipo, field_tipos}` and the include_tipos
 *     `fields_by_tipo` re-key are all reproduced. search_records_view reuses
 *     @dedalo/search searchRecords (page locators) + countRecords (optional total) +
 *     record_to_view per row. DECLINED → proxy when: not the superuser; the matrix is
 *     unwired; section_tipo is a human NAME or a >5-leading-letter tipo (PHP's label
 *     path fatals on the undefined section::get_ar_all_section_tipos); a VIRTUAL
 *     section (exclude_elements walk un-ported); ANY agent field-component is a
 *     LINK_MODELS member (select / portal / relation_x / check_box / filter / dataframe
 *     / etc) -> the view-specific get_data + {ref,label,...} locator expansion, NOT
 *     get_value, or an
 *     otherwise un-ported model; OR search carries a non-empty filter (the label->tipo
 *     skip-resolution is deferred, same boundary as count_records).
 *   - get_media_url: SERVED NATIVELY for the byte-reproducible case — a tipo-shaped
 *     component_image on a real section, resolved via the ported media_path layer
 *     (get_url's URL construction + the max_items_folder shard + a Bun file-exists
 *     stat for file_exist). The response has NO image-processing fields (no
 *     dimensions/getimagesize): the result is {url, quality, extension, file_exist,
 *     model, section_tipo, section_id, component_tipo}, ALL deterministic from
 *     DB+config+stat. DECLINED → proxy when: not the superuser; a human-NAME section
 *     or component label (the un-ported agent_view_builder label map); a non-image
 *     media model (component_av/pdf/3d get_quality/get_extension defaults are not
 *     ported); the component carries properties.additional_path (a SIBLING-component
 *     value read, un-ported) or properties.external_source (get_url's external branch,
 *     a DB sibling read whose iri short-circuits the path) — both would change the URL
 *     away from the plain sharded path; or quality is supplied but is not the image
 *     default (get_url accepts any quality string, but only the default is verified).
 *   - set_field_by_label (WRITE): even when the save itself reuses saveComponent, the
 *     SUCCESS response embeds record_view = record_to_view(...) (the post-save record),
 *     which enumerates every un-ported component model. The response is therefore not
 *     byte-reproducible → proxy.
 *   - count_records with a human-NAME section identifier (not a tipo): PHP's
 *     resolve_section_identifier label path calls the UNDEFINED method
 *     section::get_ar_all_section_tipos() and fatals into a generic "An unexpected
 *     error occurred" envelope we do not reproduce → proxy. Only the tipo fast-path
 *     (/^[a-z]{1,5}[0-9]+$/ + section model) is served.
 *   - count_records WITH a filter: build_sqo_filter_from_label_rules resolves each
 *     rule's human label → tipo (agent_view_builder::resolve_field) and SILENTLY SKIPS
 *     unresolved rules. Reproducing that partial-skip + the exact label fold/fallback
 *     for byte parity is deferred; any filtered count → proxy.
 *   - count_records on a VIRTUAL section: the resolve_virtual exclude_elements walk is
 *     un-ported (same boundary as dd_ontology_api) → proxy.
 *   - Non-superuser sessions for ANY action: PHP gates every action on
 *     common::get_permissions(st,st) (and a per-record scope assertion). Only the
 *     superuser (DEDALO_SUPERUSER = -1) short-circuits get_security_permissions to a
 *     fixed 3 and bypasses assert_record_in_user_scope; a regular/global-admin user's
 *     permission comes from the un-ported permissions table → proxy when userId !== -1.
 *
 * AUTH MODEL: dd_agent_api uses the STANDARD Dédalo session auth + CSRF. None of its
 * actions are in NO_LOGIN_NEEDED_ACTIONS or CSRF_EXEMPT_ACTIONS, so the router's
 * login + CSRF gates apply exactly as PHP — there is NO separate agent/token auth.
 * The API_ACTIONS allowlist is preserved verbatim so the SEC-024 method check matches.
 */

import type { ApiHandler, ApiResponse, GateSession, RqoLike } from '@dedalo/core-api';
import type { OntologyRepository } from '@dedalo/ontology';
import { countRecords, searchRecords } from '@dedalo/search';
import type { LangConfig } from './lang_config.ts';
import { resolveMatrixTable } from './matrix_table.ts';
import { getSectionRealTipo } from './ontology_api_actions.ts';
import { resolveGetValue, type GetValueSource } from './get_value_response.ts';
import type { ComponentInit } from './component_common.ts';
import type { MediaConfig } from './media_config.ts';
import {
  getMediaUrlWithExistence,
  type FileExistsFn,
  type MediaIdentity,
  type MediaPathConfig,
} from './media_path.ts';

/** PHP DEDALO_SUPERUSER sentinel (core/base/dd_tipos.php). */
const DEDALO_SUPERUSER = -1;

/** The dd_agent_api API_ACTIONS allowlist (verbatim from PHP, exact order). */
const API_ACTIONS = new Set([
  'describe_section',
  'read_record_view',
  'search_records_view',
  'count_records',
  'set_field_by_label',
  'get_media_url',
  'list_sections_index',
  'get_section_map',
]);

/** A section-index entry from the pre-built ontology_llm_map.json artifact. */
interface LlmMapEntry {
  tipo?: unknown;
  label?: unknown;
  /** The per-field map ({tipo,label,type,target?}); used VERBATIM by get_section_map. */
  fields?: unknown;
}

/** A loader for the pre-built LLM map. Returns the parsed array, or null (→ proxy). */
export type LlmMapLoader = () => Promise<LlmMapEntry[] | null>;

export interface AgentApiHandlerOptions {
  ontology: OntologyRepository;
  /** Parameterised SQL queryer (a Db) — the count's search queryer. */
  searchQueryer: Parameters<typeof countRecords>[1]['queryer'];
  /**
   * Matrix DB accessor — required for read_record_view / search_records_view (the
   * per-field resolveGetValue point-reads). Optional: when absent, those two views
   * decline → proxy (the count/list/media actions never touch the matrix).
   */
  matrix?: ComponentInit['matrix'];
  langConfig: LangConfig;
  /**
   * Loads the pre-built ontology_llm_map.json (PHP load_llm_map). When absent (no
   * artifact configured/found), list_sections_index DECLINES → proxy, exactly as the
   * read handler's section-list path declines when the tool-properties cache is
   * missing. Optional: omit to always proxy list_sections_index.
   */
  llmMapLoader?: LlmMapLoader;
  /** DEDALO_IMAGE_* quality/extension config (for get_media_url's default quality/extension). */
  mediaConfig: MediaConfig;
  /** DEDALO_MEDIA_URL/PATH + folders + protocol/host config (for the get_media_url path layer). */
  mediaPathConfig: MediaPathConfig;
  /** Filesystem stat probe for file_exist (defaults to Bun.file().exists()). Injectable for tests. */
  fileExists?: FileExistsFn;
}

type Envelope = ApiResponse;

function ok(result: unknown, msg: string): Envelope {
  return { result, msg, errors: [] };
}
function err(msg: string, code: string): Envelope {
  return { result: false, msg, errors: [code] };
}

/** PHP `(int)$x` truthiness for section_id-like ints — only used for guards here. */
function isTipoShaped(s: string): boolean {
  // PHP: preg_match('/^[a-z]{1,5}[0-9]+$/i', $identifier)
  return /^[a-z]{1,5}[0-9]+$/i.test(s);
}

/**
 * PHP `(int)$x` for the limit/offset coercion: an absent value → the default; a
 * number → truncated toward zero; a string → its leading-integer prefix (PHP
 * "(int)'5x'" = 5, "(int)'abc'" = 0); anything else → the default.
 */
function toInt(v: unknown, fallback: number): number {
  if (v === undefined || v === null) return fallback;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : fallback;
  if (typeof v === 'string') {
    const m = v.trim().match(/^[+-]?\d+/);
    return m ? Number.parseInt(m[0], 10) : 0;
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return fallback;
}

/** PHP is_numeric() for the section_id guard (accepts numeric strings + numbers). */
function isNumericLike(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string') return v.trim() !== '' && Number.isFinite(Number(v));
  return false;
}

/** The media-component models dd_agent_api::get_media_url accepts (PHP allowlist). */
const MEDIA_MODELS = new Set(['component_image', 'component_av', 'component_pdf', 'component_3d']);
function isMediaModel(model: string | null): boolean {
  return model !== null && MEDIA_MODELS.has(model);
}

/**
 * Models excluded from the agent record view — port of
 * agent_view_builder::EXCLUDED_MODELS. The section_tab/section_group(_div) entries
 * never survive the `component_*` filter anyway; the rest are real component models
 * dropped from the flat field map.
 */
const AGENT_EXCLUDED_MODELS = new Set([
  'component_password',
  'component_security_access',
  'component_security_areas',
  'component_security_areas_profiles',
  'component_info',
  'component_inverse',
  'component_filter_records',
  'section_tab',
  'section_group',
  'section_group_div',
]);

/**
 * The SCALAR component models whose agent record-view value is produced by
 * `component_value`'s NON-link branch — i.e. `get_value()` — AND whose get_value is
 * natively ported (a subset of get_value_response's SUPPORTED_GET_VALUE_MODELS).
 *
 * THIS is the byte-reproducible boundary for read_record_view / search_records_view.
 * agent_view_builder::component_value has TWO branches:
 *   - LINK_MODELS (portal, autocomplete, select, check_box, relation_x, dataframe,
 *     filter, and the STALE 'component_radio_buttons' PLURAL key) → get_data() + a one-hop
 *     {ref,label,section_tipo,section_id} expansion. This is a VIEW-SPECIFIC resolver,
 *     NOT get_value — a section carrying ANY such component is DECLINED → proxy.
 *   - everything else → get_value(), with '' / null collapsed to JSON null.
 *
 * Note the PHP typo: the real model is `component_radio_button` (SINGULAR), which is
 * NOT in LINK_MODELS (that lists the non-existent PLURAL `component_radio_buttons`).
 * So radio_button flows through the SCALAR get_value branch — included here.
 * `component_section_id` and `component_publication` are likewise NOT in LINK_MODELS
 * → scalar get_value. select / check_box / relation_* / filter ARE in LINK_MODELS →
 * excluded here (their view value is the locator expansion, not get_value).
 */
const AGENT_SCALAR_GET_VALUE_MODELS = new Set([
  'component_input_text',
  'component_text_area',
  'component_email',
  'component_number',
  'component_date',
  'component_iri',
  'component_json',
  'component_geolocation',
  'component_radio_button',
  'component_section_id',
  'component_publication',
]);

/**
 * Port of agent_view_builder::SIMPLIFIED_TYPE_MAP — the model→simplified-type map
 * (text | html | date | number | link | media). Any model NOT in the map → 'text'
 * (PHP `?? 'text'`). For the all-scalar-get_value gate every field model is one of
 * AGENT_SCALAR_GET_VALUE_MODELS, NONE of which is a LINK_MODEL — so describe_section
 * never emits a `target` for the served sections (the only non-reproducible field).
 * The radio_button TYPO mirror is preserved: the PLURAL `component_radio_buttons` maps
 * to 'link' here (matching PHP), while the SINGULAR `component_radio_button` (the real
 * model in AGENT_SCALAR_GET_VALUE_MODELS) is ABSENT → falls to 'text', exactly as PHP.
 */
const AGENT_SIMPLIFIED_TYPE_MAP = new Map<string, string>([
  // text
  ['component_input_text', 'text'],
  ['component_text_area', 'html'],
  ['component_email', 'text'],
  ['component_iri', 'text'],
  // numeric
  ['component_number', 'number'],
  ['component_calculation', 'number'],
  // date / time
  ['component_date', 'date'],
  ['component_time', 'date'],
  // link / relation
  ['component_portal', 'link'],
  ['component_autocomplete', 'link'],
  ['component_autocomplete_hi', 'link'],
  ['component_select', 'link'],
  ['component_radio_buttons', 'link'],
  ['component_check_box', 'link'],
  ['component_relation_model', 'link'],
  ['component_relation_parent', 'link'],
  ['component_relation_children', 'link'],
  ['component_relation_related', 'link'],
  ['component_relation_index', 'link'],
  ['component_dataframe', 'link'],
  ['component_filter', 'link'],
  // media
  ['component_av', 'media'],
  ['component_image', 'media'],
  ['component_pdf', 'media'],
  ['component_3d', 'media'],
]);

function simplifiedType(model: string): string {
  return AGENT_SIMPLIFIED_TYPE_MAP.get(model) ?? 'text';
}

/** One resolved agent field: its component tipo, model and disambiguated label. */
interface AgentField {
  tipo: string;
  model: string;
  label: string;
}

/**
 * Build the agent record-view field set in section order — port of
 * agent_view_builder::section_label_map's `labels`/`tipos` construction:
 *   - recursive children of the section (PHP get_ar_recursive_children with NO
 *     exclude-models, matching the agent path's $ar_exclude_models=null),
 *   - kept only when the resolved model contains 'component_' AND is not in
 *     AGENT_EXCLUDED_MODELS, de-duplicated, traversal order preserved,
 *   - each label = labelForTipo(tipo, lang) with a deterministic ` (N)` collision
 *     suffix following section order.
 * The gate guarantees the section is real (non-virtual), so the virtual
 * exclude_elements override path is never exercised.
 */
async function buildAgentFields(
  ontology: OntologyRepository,
  sectionTipo: string,
  lang: string,
): Promise<AgentField[]> {
  const children = await ontology.getRecursiveChildren(sectionTipo);
  const out: AgentField[] = [];
  const seen = new Set<string>();
  const labelCounts = new Map<string, number>();
  for (const tipo of children) {
    if (seen.has(tipo)) continue;
    seen.add(tipo);
    const model = await ontology.getModelByTipo(tipo);
    if (model === null || !model.includes('component_')) continue;
    if (AGENT_EXCLUDED_MODELS.has(model)) continue;

    const base = await labelForTipo(ontology, tipo, lang);
    const count = (labelCounts.get(base) ?? 0) + 1;
    labelCounts.set(base, count);
    const label = count === 1 ? base : `${base} (${count})`;

    out.push({ tipo, model, label });
  }
  return out;
}

/**
 * Port of dd_agent_api::normalise_lang. ISO 639-1 two-letter codes LLMs emit → the
 * internal lg-xxx code; lg-xxx codes pass through; anything else falls back to the
 * data lang (PHP DEDALO_DATA_LANG). The mapping table is copied verbatim.
 */
function normaliseLang(lang: unknown, dataLang: string): string {
  if (typeof lang !== 'string' || lang === '') return dataLang;
  if (lang.startsWith('lg-')) return lang;
  const iso2to3: Record<string, string> = {
    en: 'lg-eng', es: 'lg-spa', fr: 'lg-fra',
    de: 'lg-deu', it: 'lg-ita', pt: 'lg-por',
    ca: 'lg-cat', gl: 'lg-glg', eu: 'lg-eus',
    nl: 'lg-nld', ru: 'lg-rus', ja: 'lg-jpn',
    zh: 'lg-zho', ar: 'lg-ara', hi: 'lg-hin',
    ko: 'lg-kor',
  };
  const key = lang.trim().toLowerCase();
  return iso2to3[key] ?? dataLang;
}

/**
 * Port of agent_view_builder::label_for_tipo: the requested lang (with PHP fallback
 * to structure lang then any non-empty term inside getLabel), then an explicit
 * lg-eng pass, then lg-nolan, then the tipo itself. Never returns empty.
 */
async function labelForTipo(
  ontology: OntologyRepository,
  tipo: string,
  lang: string,
): Promise<string> {
  const direct = await ontology.getLabel(tipo, lang);
  if (direct) return direct;
  if (lang !== 'lg-eng') {
    const eng = await ontology.getLabel(tipo, 'lg-eng');
    if (eng) return eng;
  }
  if (lang !== 'lg-nolan') {
    const nolan = await ontology.getLabel(tipo, 'lg-nolan');
    if (nolan) return nolan;
  }
  return tipo;
}

export function createAgentApiHandler(opts: AgentApiHandlerOptions): ApiHandler {
  const { ontology, searchQueryer, langConfig, llmMapLoader, mediaConfig, mediaPathConfig } = opts;
  const matrix = opts.matrix;
  const dataLang = langConfig.dataLang;
  const fileExists = opts.fileExists;

  /** The media models whose get_quality/get_extension defaults the MediaConfig models. */
  const NATIVE_MEDIA_MODELS = new Set(['component_image']);

  function sourceOf(rqo: RqoLike): Record<string, unknown> {
    const s = (rqo as { source?: unknown }).source;
    return s && typeof s === 'object' ? (s as Record<string, unknown>) : {};
  }

  // ──────────────────────────── gates ────────────────────────────────────────

  /**
   * count_records is byte-reproducible only when:
   *   - the session is the superuser (no permission filtering / scope assertion), AND
   *   - the section identifier is a tipo that resolves to a REAL (non-virtual) section
   *     (the human-name label path fatals in PHP; virtual exclude_elements un-ported),
   *     OR is missing/non-string/not-a-section (those resolve to a native error that
   *     matches PHP without touching the fatal label path), AND
   *   - there is no filter (the label→tipo skip-resolution is deferred → proxy).
   */
  async function canHandleCount(rqo: RqoLike, session?: GateSession): Promise<boolean> {
    if (!session || session.userId !== DEDALO_SUPERUSER) return false;
    const source = sourceOf(rqo);

    // A non-empty filter with rules → deferred (proxy).
    const filter = source['filter'];
    if (
      filter &&
      typeof filter === 'object' &&
      Array.isArray((filter as { rules?: unknown }).rules) &&
      (filter as { rules: unknown[] }).rules.length > 0
    ) {
      return false;
    }

    const sectionTipo = source['section_tipo'];
    // Missing / non-string → native missing_section_tipo error (matches PHP).
    if (typeof sectionTipo !== 'string' || sectionTipo === '') return true;
    // Human-NAME identifier → PHP fatals (undefined section::get_ar_all_section_tipos) → proxy.
    if (!isTipoShaped(sectionTipo)) return false;
    // Tipo-shaped but NOT a section → native not_a_section error (matches PHP).
    const model = await ontology.getModelByTipo(sectionTipo);
    if (model !== 'section') return true;
    // Section, but VIRTUAL → resolve_virtual exclude_elements un-ported → proxy.
    const real = await getSectionRealTipo(ontology, sectionTipo);
    if (real !== sectionTipo) return false;
    return true;
  }

  /** list_sections_index is reproducible only for the superuser AND with the artifact. */
  function canHandleListSections(session?: GateSession): boolean {
    if (!session || session.userId !== DEDALO_SUPERUSER) return false;
    return llmMapLoader !== undefined;
  }

  /**
   * get_media_url is byte-reproducible only when:
   *   - the session is the superuser (no permission/scope filtering), AND
   *   - section_tipo + component_tipo are present strings AND section_id is numeric
   *     (missing/invalid → those native error envelopes match PHP without resolution), AND
   *   - section_tipo is TIPO-shaped and IS a real (non-virtual) section (the human-name
   *     label path / virtual walk is un-ported → proxy), AND
   *   - component_tipo is TIPO-shaped (a human label needs the un-ported agent_view_builder
   *     label map → proxy) and resolves to a NATIVE media model (component_image), AND
   *   - the component carries NEITHER properties.additional_path (sibling value read,
   *     un-ported) NOR properties.external_source (get_url's external branch), AND
   *   - quality is absent OR equals the image default (any other quality is accepted by
   *     PHP's get_url but only the default is verified byte-green → proxy the rest).
   *
   * The missing/invalid-arg native errors are also served (they need no resolution and
   * match PHP's exact message/code), so the gate returns true for those too.
   */
  async function canHandleMediaUrl(rqo: RqoLike, session?: GateSession): Promise<boolean> {
    if (!session || session.userId !== DEDALO_SUPERUSER) return false;
    const source = sourceOf(rqo);

    const sectionTipo = source['section_tipo'];
    const sectionIdRaw = source['section_id'];
    const componentTipo = source['component_tipo'];

    // Missing/invalid args → native error envelopes that match PHP verbatim.
    if (typeof sectionTipo !== 'string' || sectionTipo === '') return true;
    if (
      sectionIdRaw === null ||
      sectionIdRaw === undefined ||
      sectionIdRaw === '' ||
      !isNumericLike(sectionIdRaw)
    ) {
      // PHP validates section_id BEFORE component_tipo only when section_tipo is set; the
      // native action reproduces that order. We can serve this native error.
      return true;
    }
    if (typeof componentTipo !== 'string' || componentTipo === '') return true;

    // Human-NAME section identifier → un-ported label path → proxy.
    if (!isTipoShaped(sectionTipo)) return false;
    const sectionModel = await ontology.getModelByTipo(sectionTipo);
    if (sectionModel !== 'section') {
      // tipo-shaped but not a section → native 'not_a_section' error (matches PHP).
      return true;
    }
    // Virtual section → resolve_virtual exclude_elements un-ported → proxy.
    const real = await getSectionRealTipo(ontology, sectionTipo);
    if (real !== sectionTipo) return false;

    // Human-NAME component label → un-ported agent_view_builder map → proxy.
    if (!isTipoShaped(componentTipo)) return false;
    const componentModel = await ontology.getModelByTipo(componentTipo);
    // Non-media tipo → native 'not_a_media_component' error (matches PHP).
    if (!isMediaModel(componentModel)) return true;
    // A media model we do NOT serve natively (av/pdf/3d) → proxy (defaults un-ported).
    if (componentModel === null || !NATIVE_MEDIA_MODELS.has(componentModel)) return false;

    // Sibling-read / external-source paths change the URL away from the plain shard → proxy.
    const props = (await ontology.getProperties(componentTipo)) ?? {};
    if ((props as { additional_path?: unknown }).additional_path !== undefined) return false;
    if ((props as { external_source?: unknown }).external_source !== undefined) return false;

    // Quality must be absent or the image default (any other accepted by PHP but unverified).
    const quality = source['quality'];
    if (
      quality !== undefined &&
      quality !== null &&
      quality !== '' &&
      quality !== mediaConfig.imageQualityDefault
    ) {
      return false;
    }

    return true;
  }

  /**
   * Whether a section is byte-reproducible for the record views: the matrix is
   * wired, section_tipo is TIPO-shaped (the PHP label path fatals on
   * section::get_ar_all_section_tipos for any non-tipo-shaped identifier — including
   * tipos with >5 leading letters), it IS a real (non-virtual) section, and EVERY
   * agent field-component's model is a native SCALAR get_value model (no LINK_MODELS,
   * no un-ported component). A section with zero agent fields also qualifies (the
   * record view is then just {Id?}/empty — but real sections always carry section_id).
   */
  async function sectionQualifiesForView(sectionTipo: string): Promise<boolean> {
    if (matrix === undefined) return false;
    if (!isTipoShaped(sectionTipo)) return false;
    if ((await ontology.getModelByTipo(sectionTipo)) !== 'section') return false;
    const real = await getSectionRealTipo(ontology, sectionTipo);
    if (real !== sectionTipo) return false;

    const fields = await buildAgentFields(ontology, sectionTipo, dataLang);
    for (const f of fields) {
      if (!AGENT_SCALAR_GET_VALUE_MODELS.has(f.model)) return false;
    }
    return true;
  }

  /**
   * read_record_view is byte-reproducible only when:
   *   - the session is the superuser (no permission / per-record scope filtering), AND
   *   - section_id is present + numeric (missing/invalid → native error matches PHP), AND
   *   - the section qualifies (tipo-shaped real all-scalar-get_value section).
   * The missing-arg native errors are also served (no resolution; match PHP verbatim).
   */
  async function canHandleRecordView(rqo: RqoLike, session?: GateSession): Promise<boolean> {
    if (!session || session.userId !== DEDALO_SUPERUSER) return false;
    if (matrix === undefined) return false;
    const source = sourceOf(rqo);

    const sectionTipo = source['section_tipo'];
    // Missing/non-string section_tipo → native missing_section_tipo (matches PHP).
    if (typeof sectionTipo !== 'string' || sectionTipo === '') return true;
    // Missing/invalid section_id → native missing_section_id (matches PHP); PHP
    // validates section_id BEFORE resolving the section identifier.
    const sid = source['section_id'];
    if (sid === null || sid === undefined || sid === '' || !isNumericLike(sid)) return true;
    // Human-NAME / >5-letter tipo → PHP fatals (undefined get_ar_all_section_tipos) → proxy.
    if (!isTipoShaped(sectionTipo)) return false;
    return sectionQualifiesForView(sectionTipo);
  }

  /**
   * search_records_view is byte-reproducible only when:
   *   - the session is the superuser, AND
   *   - there is NO filter with rules (the label→tipo skip-resolution is deferred → proxy,
   *     same boundary as count_records), AND
   *   - section_tipo present + tipo-shaped (else native error / PHP fatal), AND
   *   - the section qualifies (so every built record_to_view is byte-reproducible).
   */
  async function canHandleSearchRecordsView(rqo: RqoLike, session?: GateSession): Promise<boolean> {
    if (!session || session.userId !== DEDALO_SUPERUSER) return false;
    if (matrix === undefined) return false;
    const source = sourceOf(rqo);

    const filter = source['filter'];
    if (
      filter &&
      typeof filter === 'object' &&
      Array.isArray((filter as { rules?: unknown }).rules) &&
      (filter as { rules: unknown[] }).rules.length > 0
    ) {
      return false;
    }

    const sectionTipo = source['section_tipo'];
    // Missing/non-string section_tipo → native missing_section_tipo (matches PHP).
    if (typeof sectionTipo !== 'string' || sectionTipo === '') return true;
    // Human-NAME / >5-letter tipo → PHP fatals → proxy.
    if (!isTipoShaped(sectionTipo)) return false;
    return sectionQualifiesForView(sectionTipo);
  }

  /**
   * describe_section is byte-reproducible only when:
   *   - the session is the superuser (PHP common::get_permissions ≥ 1; the un-ported
   *     permissions table is bypassed only for the superuser), AND
   *   - section_tipo is present + TIPO-shaped (a human NAME / >5-leading-letter tipo
   *     hits PHP's resolve_section_identifier → resolve_section_tipo label path which
   *     calls the UNDEFINED section::get_ar_all_section_tipos and fatals → proxy), AND
   *   - it IS a real (non-virtual) section, AND
   *   - EVERY agent field-component is a native SCALAR get_value model — so NO field is
   *     a LINK_MODEL and PHP's section_to_view emits NO `target` (the only field that
   *     needs the un-ported first_target_section_tipo resolution). The `type` is then a
   *     pure SIMPLIFIED_TYPE_MAP lookup, fully reproducible.
   * The missing-arg / not-a-section native errors are also served (they match PHP
   * verbatim without touching the fatal label path).
   */
  async function canHandleDescribeSection(rqo: RqoLike, session?: GateSession): Promise<boolean> {
    if (!session || session.userId !== DEDALO_SUPERUSER) return false;
    const source = sourceOf(rqo);
    const sectionTipo = source['section_tipo'];
    // Missing/non-string → native missing_section_tipo error (matches PHP).
    if (typeof sectionTipo !== 'string' || sectionTipo === '') return true;
    // Human-NAME / >5-letter tipo → PHP label path fatals → proxy.
    if (!isTipoShaped(sectionTipo)) return false;
    // Tipo-shaped but NOT a section → native not_a_section error (matches PHP).
    const model = await ontology.getModelByTipo(sectionTipo);
    if (model !== 'section') return true;
    // Section, but VIRTUAL or carrying a non-scalar field → un-ported → proxy.
    return sectionQualifiesForView(sectionTipo);
  }

  /**
   * get_section_map is byte-reproducible only when PHP serves it FROM THE ARTIFACT —
   * i.e. the same ontology_llm_map.json is present AND contains an entry for the
   * resolved section_tipo, which PHP returns VERBATIM (the `lang` param is ignored on
   * the artifact path). Gate:
   *   - the session is the superuser (the permission check ≥ 1 is bypassed), AND
   *   - source.section is present + TIPO-shaped (a human NAME hits the un-ported
   *     resolve_section_tipo label/fuzzy path → proxy), AND
   *   - it IS a real (non-virtual) section, AND
   *   - the artifact loader is configured AND yields an entry with this tipo.
   * When the entry is ABSENT, PHP falls to the live build (un-ported get_term_data /
   * first_target_section_tipo) → proxy. The missing-arg / not-a-section native errors
   * are also served (they match PHP verbatim).
   */
  async function canHandleGetSectionMap(rqo: RqoLike, session?: GateSession): Promise<boolean> {
    if (!session || session.userId !== DEDALO_SUPERUSER) return false;
    const source = sourceOf(rqo);
    const sectionRaw = source['section'];
    const section = typeof sectionRaw === 'string' ? sectionRaw.trim() : '';
    // Missing → native missing_section error (matches PHP).
    if (section === '') return true;
    // Human-NAME / >5-letter tipo → un-ported resolve_section_tipo → proxy.
    if (!isTipoShaped(section)) return false;
    // Tipo-shaped but NOT a section → native not_a_section error (matches PHP).
    const model = await ontology.getModelByTipo(section);
    if (model !== 'section') return true;
    // Virtual section → resolve_section_identifier's virtual walk un-ported → proxy.
    const real = await getSectionRealTipo(ontology, section);
    if (real !== section) return false;
    // Must be present in the SAME artifact PHP reads (else PHP live-builds → proxy).
    if (llmMapLoader === undefined) return false;
    const map = await llmMapLoader();
    if (map === null) return false;
    return map.some((e) => e?.tipo === section);
  }

  // ──────────────────────────── actions ──────────────────────────────────────

  /** Port of dd_agent_api::count_records (no-filter, tipo-form, real section). */
  async function doCountRecords(rqo: RqoLike): Promise<Envelope> {
    const source = sourceOf(rqo);
    const lang = normaliseLang(source['lang'], dataLang);
    const sectionTipo = source['section_tipo'];

    if (typeof sectionTipo !== 'string' || sectionTipo === '') {
      return err('Error. Missing or invalid source.section_tipo', 'missing_section_tipo');
    }
    // resolve_section_identifier tipo fast-path (the gate guaranteed tipo-shaped).
    const model = await ontology.getModelByTipo(sectionTipo);
    if (model !== 'section') {
      // PHP: get_model_by_tipo(..., true) → string|null; the message inlines it.
      return err(
        `Error. tipo '${sectionTipo}' is not a section (model=${model ?? ''})`,
        'not_a_section',
      );
    }

    // Count via the ported search layer (full_count DISTINCT section_id).
    let total: number;
    try {
      total = await countRecords(
        { section_tipo: [sectionTipo], full_count: true },
        {
          queryer: searchQueryer,
          resolveTable: (st: string) => resolveMatrixTable(ontology, st),
        },
      );
    } catch (e) {
      return err(
        'Error. Count execution failed: ' + (e instanceof Error ? e.message : String(e)),
        'count_error',
      );
    }

    const sectionLabel = await labelForTipo(ontology, sectionTipo, lang);

    return ok(
      { section_tipo: sectionTipo, section_label: sectionLabel, total },
      'OK. count_records done',
    );
  }

  /**
   * Port of agent_view_builder::record_to_view for the all-scalar-get_value case.
   * Builds the flat `{label: value}` map (value via resolveGetValue; '' / false →
   * null, mirroring component_value's scalar `$value===null || $value===''` collapse),
   * plus the always-present `_meta {section_tipo, field_tipos}` and, when
   * include_tipos, the trailing `fields_by_tipo` re-key.
   *
   * The gate guarantees every field is a native SCALAR get_value model.
   */
  async function recordToView(
    sectionTipo: string,
    sectionId: number,
    lang: string,
    includeTipos: boolean,
  ): Promise<Record<string, unknown>> {
    if (matrix === undefined) {
      throw new Error('matrix not configured');
    }
    const sectionLabel = await labelForTipo(ontology, sectionTipo, lang);
    const fields = await buildAgentFields(ontology, sectionTipo, lang);
    const matrixTable = (await resolveMatrixTable(ontology, sectionTipo)) ?? 'matrix';

    const fieldsObj: Record<string, unknown> = {};
    const fieldTipos: Record<string, string> = {};
    // Keep label→value handy for the fields_by_tipo re-key (PHP reads back
    // $view->fields->{$label}).
    const valueByLabel: Record<string, unknown> = {};

    for (const f of fields) {
      const source: GetValueSource = {
        tipo: f.tipo,
        section_tipo: sectionTipo,
        section_id: sectionId,
        model: f.model,
        lang,
        action: 'get_value',
      };
      const { result } = await resolveGetValue(source, {
        matrix,
        ontology,
        langConfig,
        matrixTable,
        ...(searchQueryer !== undefined ? { searchQueryer: searchQueryer as ComponentInit['searchQueryer'] } : {}),
      });
      // component_value scalar branch: '' (and a model-not-valid false) collapse to null.
      const value = result === '' || result === false ? null : result;
      fieldsObj[f.label] = value;
      valueByLabel[f.label] = value;
      fieldTipos[f.tipo] = f.label;
    }

    const view: Record<string, unknown> = {
      section_label: sectionLabel,
      section_tipo: sectionTipo,
      section_id: sectionId,
      lang,
      fields: fieldsObj,
      _meta: { section_tipo: sectionTipo, field_tipos: fieldTipos },
    };

    if (includeTipos) {
      const byTipo: Record<string, unknown> = {};
      for (const f of fields) {
        // PHP: $view->fields->{$label} ?? null.
        byTipo[f.tipo] = valueByLabel[f.label] ?? null;
      }
      view['fields_by_tipo'] = byTipo;
    }

    return view;
  }

  /** Port of dd_agent_api::read_record_view (all-scalar-get_value section). */
  async function doReadRecordView(rqo: RqoLike): Promise<Envelope> {
    const source = sourceOf(rqo);
    const lang = normaliseLang(source['lang'], dataLang);
    const sectionTipo = source['section_tipo'];
    const sectionIdRaw = source['section_id'];
    const includeTipos = Boolean(source['include_tipos']);

    if (typeof sectionTipo !== 'string' || sectionTipo === '') {
      return err('Error. Missing or invalid source.section_tipo', 'missing_section_tipo');
    }
    if (
      sectionIdRaw === null ||
      sectionIdRaw === undefined ||
      sectionIdRaw === '' ||
      !isNumericLike(sectionIdRaw)
    ) {
      return err('Error. Missing or invalid source.section_id', 'missing_section_id');
    }
    const sectionId = Math.trunc(Number(sectionIdRaw)); // PHP (int)$section_id_raw

    let view: Record<string, unknown>;
    try {
      view = await recordToView(sectionTipo, sectionId, lang, includeTipos);
    } catch (e) {
      return err('Error. ' + (e instanceof Error ? e.message : String(e)), 'builder_error');
    }
    return ok(view, 'OK. read_record_view done');
  }

  /** Port of dd_agent_api::search_records_view (no-filter, all-scalar-get_value section). */
  async function doSearchRecordsView(rqo: RqoLike): Promise<Envelope> {
    const source = sourceOf(rqo);
    const lang = normaliseLang(source['lang'], dataLang);
    const sectionTipo = source['section_tipo'];
    const limit = toInt(source['limit'], 10);
    const offset = toInt(source['offset'], 0);
    const fullCount = Boolean(source['full_count']);
    const includeTipos = Boolean(source['include_tipos']);

    if (typeof sectionTipo !== 'string' || sectionTipo === '') {
      return err('Error. Missing or invalid source.section_tipo', 'missing_section_tipo');
    }

    // Optional count (full_count): PHP non-fatal — a count failure leaves total=null.
    let total: number | null = null;
    if (fullCount) {
      try {
        total = await countRecords(
          { section_tipo: [sectionTipo], full_count: true },
          {
            queryer: searchQueryer,
            resolveTable: (st: string) => resolveMatrixTable(ontology, st),
          },
        );
      } catch {
        total = null; // logged as WARNING in PHP; the response keeps total=null.
      }
    }

    // Record search — always without full_count so we get actual record locators.
    let locators: { section_tipo: string; section_id: number }[];
    try {
      locators = await searchRecords(
        { section_tipo: [sectionTipo], limit, offset },
        {
          queryer: searchQueryer,
          resolveTable: (st: string) => resolveMatrixTable(ontology, st),
        },
      );
    } catch (e) {
      return err(
        'Error. Search execution failed: ' + (e instanceof Error ? e.message : String(e)),
        'search_error',
      );
    }

    const records: Record<string, unknown>[] = [];
    for (const loc of locators) {
      const recordSectionId = loc.section_id;
      if (!Number.isInteger(recordSectionId) || recordSectionId < 1) continue;
      try {
        records.push(await recordToView(sectionTipo, recordSectionId, lang, includeTipos));
      } catch {
        // PHP skips an unbuildable record with a WARNING and continues.
      }
    }

    const sectionLabel = await labelForTipo(ontology, sectionTipo, lang);

    return ok(
      {
        section_tipo: sectionTipo,
        section_label: sectionLabel,
        lang,
        records,
        pagination: { limit, offset, total, count: records.length },
      },
      'OK. search_records_view done',
    );
  }

  /** Port of dd_agent_api::list_sections_index (artifact path + superuser pass-all). */
  async function doListSectionsIndex(): Promise<Envelope> {
    // The gate guaranteed llmMapLoader is present; defensive null → proxy-shaped error
    // is never reached because canHandleRequest already declined.
    const map = llmMapLoader ? await llmMapLoader() : null;
    if (map === null) {
      // Mirrors the live-scan fallback's db_query_failed only when the artifact is
      // truly unavailable; but the gate prevents reaching here without a loader, so
      // this is the artifact-unreadable case → safest is the same error PHP emits
      // when it cannot list sections.
      return err('Error. Unable to list sections from ontology', 'db_query_failed');
    }

    // Build the compact index: {tipo, label}. Superuser → every entry passes the
    // permission filter (get_security_permissions returns 3 for DEDALO_SUPERUSER).
    const index: { tipo: string; label: unknown }[] = [];
    for (const entry of map) {
      const stipo = entry?.tipo;
      if (typeof stipo !== 'string' || stipo === '') continue;
      // PHP casts a missing label to a new stdClass() ({} in JSON).
      const label = entry?.label !== undefined && entry?.label !== null ? entry.label : {};
      index.push({ tipo: stipo, label });
    }

    return ok(index, 'OK. list_sections_index done');
  }

  /**
   * Port of dd_agent_api::describe_section → agent_view_builder::section_to_view for
   * the all-scalar (no-target) case. Emits `{section_label, section_tipo, lang,
   * fields:[{label,type}(,tipo,model)]}` (+ `_meta.field_tipos` when include_tipos).
   * The gate guarantees every field is a SCALAR get_value model, so NO `target` is
   * ever produced and `type` is a pure SIMPLIFIED_TYPE_MAP lookup.
   */
  async function doDescribeSection(rqo: RqoLike): Promise<Envelope> {
    const source = sourceOf(rqo);
    const lang = normaliseLang(source['lang'], dataLang);
    const sectionTipo = source['section_tipo'];
    const includeTipos = Boolean(source['include_tipos']);

    if (typeof sectionTipo !== 'string' || sectionTipo === '') {
      return err('Error. Missing or invalid source.section_tipo', 'missing_section_tipo');
    }
    // resolve_section_identifier tipo fast-path (the gate guaranteed tipo-shaped).
    const model = await ontology.getModelByTipo(sectionTipo);
    if (model !== 'section') {
      return err(
        `Error. tipo '${sectionTipo}' is not a section (model=${model ?? ''})`,
        'not_a_section',
      );
    }

    const sectionLabel = await labelForTipo(ontology, sectionTipo, lang);
    const fields = await buildAgentFields(ontology, sectionTipo, lang);

    const fieldList: Record<string, unknown>[] = [];
    const fieldTipos: Record<string, string> = {};
    for (const f of fields) {
      const field: Record<string, unknown> = { label: f.label, type: simplifiedType(f.model) };
      // No `target`: the all-scalar gate excludes every LINK_MODEL.
      if (includeTipos) {
        field['tipo'] = f.tipo;
        field['model'] = f.model;
      }
      fieldList.push(field);
      fieldTipos[f.tipo] = f.label;
    }

    const view: Record<string, unknown> = {
      section_label: sectionLabel,
      section_tipo: sectionTipo,
      lang,
      fields: fieldList,
    };
    if (includeTipos) {
      view['_meta'] = { field_tipos: fieldTipos };
    }

    return ok(view, 'OK. describe_section done');
  }

  /**
   * Port of dd_agent_api::get_section_map for the ARTIFACT path. Returns the matching
   * ontology_llm_map.json entry VERBATIM (`{tipo, label, fields}`) — exactly what PHP
   * returns when `is_array($map)` and an entry's tipo matches. The gate guaranteed the
   * artifact is present + the entry exists, so the live-build fallback is never hit.
   */
  async function doGetSectionMap(rqo: RqoLike): Promise<Envelope> {
    const source = sourceOf(rqo);
    const sectionRaw = source['section'];
    const section = typeof sectionRaw === 'string' ? sectionRaw.trim() : '';

    if (section === '') {
      return err('Error. Missing source.section (section name or tipo)', 'missing_section');
    }
    // resolve_section_identifier tipo fast-path (the gate guaranteed tipo-shaped).
    const model = await ontology.getModelByTipo(section);
    if (model !== 'section') {
      return err(
        `Error. tipo '${section}' is not a section (model=${model ?? ''})`,
        'not_a_section',
      );
    }

    const map = llmMapLoader ? await llmMapLoader() : null;
    const entry = map?.find((e) => e?.tipo === section);
    if (!entry) {
      // Defensive: the gate already required the entry; never reached in practice.
      return err('Error. Section map not found', 'builder_error');
    }
    // PHP returns the artifact entry verbatim ((object)$entry). label/fields are the
    // raw artifact values (multilingual label map; per-field {tipo,label,type,target?}).
    const result: Record<string, unknown> = { tipo: entry.tipo, label: entry.label, fields: entry.fields };
    return ok(result, 'OK. get_section_map done (from artifact)');
  }

  /**
   * Port of dd_agent_api::get_media_url for the byte-reproducible case (tipo-shaped
   * component_image on a real section). Mirrors the PHP arg-validation ORDER and
   * messages, then builds the URL via the ported media_path layer and stat()s the file.
   */
  async function doGetMediaUrl(rqo: RqoLike): Promise<Envelope> {
    const source = sourceOf(rqo);
    const sectionTipoRaw = source['section_tipo'];
    const sectionIdRaw = source['section_id'];
    const componentTipoRaw = source['component_tipo'];

    // Validation order matches PHP exactly: section_tipo, then section_id, then component_tipo.
    if (typeof sectionTipoRaw !== 'string' || sectionTipoRaw === '') {
      return err('Error. Missing or invalid source.section_tipo', 'missing_section_tipo');
    }
    if (
      sectionIdRaw === null ||
      sectionIdRaw === undefined ||
      sectionIdRaw === '' ||
      !isNumericLike(sectionIdRaw)
    ) {
      return err('Error. Missing or invalid source.section_id', 'missing_section_id');
    }
    if (typeof componentTipoRaw !== 'string' || componentTipoRaw === '') {
      return err('Error. Missing or invalid source.component_tipo', 'missing_component_tipo');
    }

    const sectionTipo = sectionTipoRaw;
    const sectionId = Math.trunc(Number(sectionIdRaw)); // PHP (int)$section_id_raw
    // The gate guaranteed: superuser, tipo-shaped real section, tipo-shaped media tipo.
    // For a tipo-shaped input the resolve_field descriptor returns the SAME tipo, so
    // component_tipo is unchanged — we resolve the model directly (PHP's fallback path).
    const componentTipo = componentTipoRaw;

    const model = await ontology.getModelByTipo(componentTipo);
    if (!isMediaModel(model)) {
      // Matches PHP: "Error. Component '$tipo' is not a media component (model=$model)".
      return err(
        `Error. Component '${componentTipo}' is not a media component (model=${model ?? ''})`,
        'not_a_media_component',
      );
    }

    // Resolve quality/extension/shard from config + properties.
    const quality =
      typeof source['quality'] === 'string' && source['quality'] !== ''
        ? (source['quality'] as string)
        : mediaConfig.imageQualityDefault;
    const extension = mediaConfig.imageExtension;
    const absolute = source['absolute'] === undefined ? true : Boolean(source['absolute']);

    const props = (await ontology.getProperties(componentTipo)) ?? {};
    // initial_media_path.{tipo} — usually absent; force a leading slash (PHP rule).
    const imp = (props as { initial_media_path?: Record<string, unknown> }).initial_media_path;
    let initialMediaPath = '';
    const impVal = imp && typeof imp === 'object' ? imp[componentTipo] : undefined;
    if (typeof impVal === 'string' && impVal !== '') {
      initialMediaPath = impVal.startsWith('/') ? impVal : '/' + impVal;
    }
    // max_items_folder shard (the gate excluded properties.additional_path).
    const mif = (props as { max_items_folder?: unknown }).max_items_folder;
    let additionalPath = '';
    if (mif !== undefined && mif !== null && isNumericLike(mif)) {
      const n = Math.trunc(Number(mif));
      if (n > 0) additionalPath = '/' + n * Math.floor(sectionId / n);
    }

    const translatable = await ontology.getTranslatable(componentTipo);

    const identity: MediaIdentity = {
      tipo: componentTipo,
      sectionTipo,
      sectionId,
      model: model as string,
      extension,
      additionalPath,
      initialMediaPath,
      translatable,
    };

    let url: string | null;
    let fileExist: boolean;
    try {
      const resolved = await getMediaUrlWithExistence(
        mediaPathConfig,
        identity,
        quality,
        dataLang,
        absolute,
        fileExists,
      );
      url = resolved.url;
      fileExist = resolved.fileExist;
    } catch (e) {
      return err(
        'Error. URL resolution failed: ' + (e instanceof Error ? e.message : String(e)),
        'url_error',
      );
    }

    return ok(
      {
        url,
        quality,
        extension,
        file_exist: fileExist,
        model,
        section_tipo: sectionTipo,
        section_id: sectionId,
        component_tipo: componentTipo,
      },
      'OK. get_media_url done',
    );
  }

  return {
    ddApi: 'dd_agent_api',
    apiActions: API_ACTIONS,

    async canHandleRequest(rqo: RqoLike, session?: GateSession): Promise<boolean> {
      const action = (rqo as { action?: unknown }).action;
      switch (action) {
        case 'count_records':
          return canHandleCount(rqo, session);
        case 'describe_section':
          return canHandleDescribeSection(rqo, session);
        case 'get_section_map':
          return canHandleGetSectionMap(rqo, session);
        case 'read_record_view':
          return canHandleRecordView(rqo, session);
        case 'search_records_view':
          return canHandleSearchRecordsView(rqo, session);
        case 'list_sections_index':
          return canHandleListSections(session);
        case 'get_media_url':
          return canHandleMediaUrl(rqo, session);
        // Every other agent action needs an un-ported subsystem (see file header).
        default:
          return false;
      }
    },

    async dispatch(action: string, rqo: RqoLike): Promise<ApiResponse> {
      switch (action) {
        case 'count_records':
          return doCountRecords(rqo);
        case 'describe_section':
          return doDescribeSection(rqo);
        case 'get_section_map':
          return doGetSectionMap(rqo);
        case 'read_record_view':
          return doReadRecordView(rqo);
        case 'search_records_view':
          return doSearchRecordsView(rqo);
        case 'list_sections_index':
          return doListSectionsIndex();
        case 'get_media_url':
          return doGetMediaUrl(rqo);
        default:
          // Defensive: the router only dispatches when canHandleRequest was true.
          return { result: false, msg: `Error. Request failed [${action}]`, errors: ['not ported'] };
      }
    },
  };
}

// ─────────────────────────────── artifact loader ──────────────────────────────

/**
 * Build an LlmMapLoader that reads ontology_llm_map.json from the env-configured
 * ontology I/O dir, mirroring PHP dd_agent_api::load_llm_map + ontology_data_io.
 *
 * The PHP path is ONTOLOGY_DATA_IO_DIR/{major.minor}/ontology_llm_map.json. We
 * accept either:
 *   - DEDALO_ONTOLOGY_IO_DIR pointing DIRECTLY at the versioned dir (…/import/ontology/7.0),
 *   - or the parent + DEDALO_VERSION → {parent}/{major.minor}.
 * Returns null (→ list_sections_index proxies) when neither yields a readable file.
 *
 * The loader caches the parse on first call (PHP uses a per-request static sentinel);
 * caching across requests is safe because the artifact is install-time immutable and
 * the proxy path already covers a stale-artifact instance (vs-live catches drift).
 */
export function makeLlmMapLoaderFromEnv(
  env: Record<string, string | undefined> = process.env,
): LlmMapLoader | undefined {
  const explicit = env.DEDALO_ONTOLOGY_IO_DIR;
  const candidates: string[] = [];
  if (explicit && explicit.length > 0) {
    candidates.push(joinPath(explicit, 'ontology_llm_map.json'));
    // Also try {explicit}/{major.minor}/… when explicit is the parent dir.
    const ver = versionMajorMinor(env.DEDALO_VERSION);
    if (ver) candidates.push(joinPath(joinPath(explicit, ver), 'ontology_llm_map.json'));
  }
  if (candidates.length === 0) return undefined;

  let cache: LlmMapEntry[] | null | undefined; // undefined = not yet attempted
  return async () => {
    if (cache !== undefined) return cache;
    for (const file of candidates) {
      try {
        const f = Bun.file(file);
        if (!(await f.exists())) continue;
        const text = await f.text();
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          cache = parsed as LlmMapEntry[];
          return cache;
        }
      } catch {
        // try the next candidate
      }
    }
    cache = null;
    return cache;
  };
}

function joinPath(dir: string, name: string): string {
  return dir.endsWith('/') ? dir + name : dir + '/' + name;
}

/** '7.0.0.dev' → '7.0'; returns null when unparseable. */
function versionMajorMinor(version: string | undefined): string | null {
  if (!version) return null;
  const parts = version.split('.');
  if (parts.length < 2) return null;
  return parts[0] + '.' + parts[1];
}
