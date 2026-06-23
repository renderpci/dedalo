import { ComponentCommon, type ComponentInit } from './component_common.ts';
import { ComponentInputText } from './component_input_text.ts';
import { ComponentGeneric } from './component_generic.ts';
import { resolveMatrixTable } from './matrix_table.ts';
import type { ExportValue } from './export_value.ts';
import type { DataColumnName } from './component_common.ts';
import type { ComponentDatum } from '@dedalo/db';

/**
 * The positive dataframe-frame marker on a relation locator (PHP
 * DEDALO_RELATION_TYPE_DATAFRAME, dd_tipos.php). A TM row for a relation/literal
 * component stores the main + dataframe data merged; is_dataframe_entry() detects a
 * frame by `el.type === 'dd490'` (trait.dataframe_common::is_dataframe_entry).
 */
const RELATION_TYPE_DATAFRAME = 'dd490';

/**
 * Shared read-side port of PHP `component_relation_common::get_export_value` — the
 * resolver behind the SIMPLE relation-family components: component_select (single),
 * component_radio_button (single), component_check_box (MULTI-select). All three
 * inherit get_export_value (class.component_relation_common.php line 742) and have
 * NO own override, so:
 *
 *   get_value() = get_export_value()->to_flat_string()
 *
 * For the common shape (NO source.request_config — every select/radio/check_box in
 * dedalo7_mib) get_export_value falls through to the V5 ddo_map: the set of TARGET
 * components whose value(s) become the label, derived from the component's OWN
 * `relations` array (ontology node), in stored order, partitioned by
 * clean_and_extract_related (trait.request_config_v5.php line 508):
 *
 *   - model 'section'         → target_section_tipo (dropped from the label list;
 *                               at read time the LOCATOR's own section_tipo /
 *                               section_id win — PHP get_export_value line 884-894
 *                               instantiates the child on $locator->section_id /
 *                               $locator->section_tipo, NOT the ddo's).
 *   - model 'exclude_elements'→ skip
 *   - tipo  'dd249'           → skip (DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO)
 *   - model 'component_filter' in matrix_dd/matrix_list → skip (see guard below)
 *   - else                    → KEEP as a label component
 *
 * For each stored locator, each kept label component is instantiated on the
 * locator's target (its section_tipo / section_id, in the target's resolved matrix
 * table) at lang = DEDALO_DATA_LANG (the GLOBAL data lang, NOT source.lang — PHP
 * get_export_value line 868: translatable ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN).
 *
 * The flat string (export_value::join_atoms, class.export_value.php line 240):
 *
 *   - atoms accumulate across ALL locators into one list, partitioned at the first
 *     indexed level by item_index (= the locator's array key). A locator that
 *     produces NO atoms at all (every label child has no data items) leaves NO
 *     record slot → it contributes nothing AND no records_separator around it.
 *     (Verified against the live PHP golden checkbox_multi_empty: two empty-target
 *     locators yield '' — NOT ' | '.)
 *   - the record slots (locators that produced ≥1 atom) join with records_separator
 *     (' | ', the first indexed level). An empty-VALUE atom still occupies its slot
 *     (line 358 always pushes implode), so a kept-but-empty record contributes ''.
 *   - within a record, the kept label components join with fields_separator (', ');
 *     each leaf component's own value drops empty/'0' items (PHP empty()).
 *
 * Single-locator components (select, radio_button — and check_box with one
 * selection) collapse to: just the one record's value.
 *
 * DEFERRED (loud guards, see resolveLabelComponents): the V6 source.request_config
 * path, the section_list-child path, component_filter-in-system-table skip, and
 * label components whose model is neither input_text-family nor a generic
 * (json/number/geo) leaf. Each unsupported sub-path throws so a silent wrong-byte
 * result can never escape the parity gate.
 */

/** DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO (core/base/dd_tipos.php). */
const SECURITY_AREAS_PROFILES_TIPO = 'dd249';

/** Default records_separator (' | ') joining multiple selected locators. */
const DEFAULT_RECORDS_SEPARATOR = ' | ';

/** Default fields_separator (', ') joining multiple label components on one locator. */
const DEFAULT_FIELDS_SEPARATOR = ', ';

/** A stored relation locator (relation matrix column item). */
interface Locator {
  section_tipo?: unknown;
  section_id?: unknown;
  [k: string]: unknown;
}

/** A label component the relation reads on each locator target. */
interface LabelComponent {
  tipo: string;
  model: string;
  column: DataColumnName;
}

/**
 * One resolved datalist option (PHP get_list_of_values()->result item), in PHP
 * stdClass declaration order: value (locator), label, section_id, hide.
 */
export interface DatalistItem {
  value: { section_tipo: string; section_id: string };
  label: string;
  section_id: string;
  hide: unknown[];
}

/**
 * The enumerate-target-section-rows callback the datalist resolver needs (port of
 * get_list_of_values's `search::search` over the request_config target sections).
 * Returns the rows {section_tipo, section_id} in PHP search order (section_id ASC),
 * which the resolver then RE-SORTS by sort_by / label. Injected by the caller so
 * this module stays free of @dedalo/search.
 */
export type DatalistRecordSearch = (
  sectionTipos: string[],
) => Promise<ReadonlyArray<{ section_tipo: string; section_id: number }>>;

/** One resolved locator's contribution: its joined value + whether it produced atoms. */
interface RecordContribution {
  /** Joined label-component value (fields_separator), already empty-dropped. */
  value: string;
  /** True iff at least one label child produced ≥1 export atom (join_atoms slot). */
  hasAtoms: boolean;
}

/** Map a label component's model to its matrix data column (PHP column_map). */
function labelColumnForModel(model: string): DataColumnName | null {
  switch (model) {
    case 'component_input_text':
    case 'component_text_area':
    case 'component_email':
      return 'string';
    case 'component_number':
      return 'number';
    case 'component_json':
      return 'misc';
    case 'component_geolocation':
      return 'geo';
    default:
      return null;
  }
}

/**
 * Base class for the SIMPLE relation-family components. Concrete subclasses
 * (ComponentSelect, ComponentRadioButton, ComponentCheckBox) only differ in
 * whether multiple locators are expected; the join itself is uniform.
 */
export abstract class ComponentRelationCommon extends ComponentCommon {
  // The relation component itself is not translatable in real data and the relation
  // column carries no lang, so the effective lang never filters get_data(). Kept
  // false (the component_common default) so getData() returns all locators.
  protected override readonly supportsTranslation = false;

  /**
   * Filter a TIME-MACHINE snapshot for the relation's OWN locators (PHP
   * component_common::get_data tm branch, lines 1185-1212). A relation TM row stores
   * the main + merged dataframe data under one tipo, so the relation render keeps
   * ONLY: (a) object entries, (b) that are NOT dd490 dataframe frames
   * (is_dataframe_entry), (c) that carry section_tipo + section_id (a real locator).
   * Non-objects and frames are dropped. array_values re-indexes (no key gaps).
   *
   * NB: only the NON-dataframe relation models reach this (the tm gate declines
   * has_dataframe / dataframe_ddo components), so the component_dataframe slot-pairing
   * branch (lines 1214-1225) is intentionally NOT reproduced here — those components
   * proxy to PHP.
   */
  protected override filterTmData(
    data: ComponentDatum[] | null,
  ): ComponentDatum[] | null {
    if (data === null) return null;
    return data.filter((el): el is ComponentDatum => {
      if (el === null || typeof el !== 'object') return false;
      const obj = el as Record<string, unknown>;
      if (obj.type === RELATION_TYPE_DATAFRAME) return false; // dataframe frame
      return (
        obj.section_tipo !== undefined &&
        obj.section_tipo !== null &&
        obj.section_id !== undefined &&
        obj.section_id !== null
      );
    });
  }

  /** records_separator (' | ') joining multiple selected locators. */
  private recordsSeparator = DEFAULT_RECORDS_SEPARATOR;
  /** fields_separator (', ') joining multiple label components on one locator. */
  private fieldsSeparator = DEFAULT_FIELDS_SEPARATOR;

  /** PHP class name (e.g. 'component_check_box'), for guard messages. */
  protected abstract readonly modelName: string;

  /**
   * The ordered list of label components the relation reads on each locator target.
   *
   * Two resolution paths, mirroring PHP build_request_config:
   *
   *  - V6 (source.request_config present): the label set is the ddo_map of the
   *    component's explicit request_config (show.ddo_map), filtered to the DIRECT
   *    children of this component (ddo.parent 'self' / this.tipo) — see PHP
   *    get_export_value line 791 (ddo_direct_children = parent===this.tipo) after
   *    resolve_ddo_self_references rewrites 'self'→this.tipo. component_relation_*
   *    (parent/children/related) ALWAYS carry a request_config and take this path.
   *
   *  - V5 (no request_config): clean_and_extract_related over the component's OWN
   *    relations (model 'section'/'exclude_elements'/dd249 dropped). This is the
   *    select / radio_button / check_box path, unchanged.
   *
   * Either path keeps ONLY leaf input_text-family / generic label components on the
   * locator's own target. DEFERRED sub-paths (nested descent, value_with_parents,
   * multi-section ddos, dataframe, section_list children, …) throw rather than
   * silently diverge, so a wrong-byte result can never escape the parity gate.
   */
  /**
   * Subclass hook to OVERRIDE the V5/V6 label-component derivation. Returning a
   * non-null array short-circuits the ontology-relations/request_config resolution
   * entirely. Used by component_filter, whose ddo_map is NOT derived from its own
   * (empty) relations but is HARDCODED in PHP trait.request_config_v5::
   * resolve_ar_related_list (model==='component_filter' → [DEDALO_SECTION_PROJECTS_TIPO,
   * DEDALO_PROJECTS_NAME_TIPO]); clean_and_extract_related then drops the section tipo
   * and keeps the name field (dd156, input_text) as the single label on each locator's
   * project (dd153) target. Default returns null (use the standard resolution).
   */
  protected async labelComponentsOverride(): Promise<LabelComponent[] | null> {
    return null;
  }

  private async resolveLabelComponents(): Promise<LabelComponent[]> {
    const override = await this.labelComponentsOverride();
    if (override !== null) {
      return override;
    }
    const properties = await this.ontology.getProperties(this.tipo);
    const source = properties?.['source'];
    const requestConfig =
      source !== null && typeof source === 'object'
        ? (source as Record<string, unknown>)['request_config']
        : undefined;

    if (requestConfig !== undefined) {
      return this.resolveLabelComponentsV6(requestConfig);
    }

    // ── V5 path (select / radio_button / check_box) ──────────────────────────
    // DEFERRED: section_list-child path. resolve_ar_related_list_component first
    // tries a section_list child's relations; only the no-child fallback (the
    // relation's own relations) is ported. A component WITH children hits the other path.
    const children = await this.ontology.getChildren(this.tipo);
    if (children.length > 0) {
      throw new Error(
        `${this.modelName} ${this.tipo}: has children (section_list ddo_map path) — not ported`,
      );
    }

    const relationTipos = (await this.ontology.getRelationTipos(this.tipo)) ?? [];
    const out: LabelComponent[] = [];
    for (const relTipo of relationTipos) {
      const model = await this.ontology.getModelByTipo(relTipo);
      if (model === null) continue; // PHP get_model_by_tipo null → skipped downstream
      if (model === 'section') continue; // target_section_tipo (locator wins at read)
      if (model === 'exclude_elements') continue;
      if (relTipo === SECURITY_AREAS_PROFILES_TIPO) continue;

      // DEFERRED: component_filter-in-system-table skip. The condition depends on
      // the TARGET table being matrix_dd/matrix_list; we don't compute that here.
      // No real component has a component_filter in its relations, so throw loudly.
      if (model === 'component_filter') {
        throw new Error(
          `${this.modelName} ${this.tipo}: component_filter label component — system-table skip not ported`,
        );
      }

      const column = labelColumnForModel(model);
      if (column === null) {
        // DEFERRED: nested-relation / media / other label component models. Their
        // own get_export_value differs; not ported. Loud guard.
        throw new Error(
          `${this.modelName} ${this.tipo}: label component ${relTipo} model '${model}' not ported`,
        );
      }
      out.push({ tipo: relTipo, model, column });
    }
    return out;
  }

  /**
   * V6 ddo_map label resolution. Reads source.request_config[0].show.ddo_map and
   * keeps the DIRECT, LEAF, single-section label children of this component. Any
   * shape this read-side slice does not reproduce byte-for-byte (nested descent,
   * value_with_parents, dataframe, multi-section ddos) throws loudly.
   */
  private async resolveLabelComponentsV6(requestConfig: unknown): Promise<LabelComponent[]> {
    if (!Array.isArray(requestConfig) || requestConfig.length === 0) {
      throw new Error(`${this.modelName} ${this.tipo}: empty/invalid source.request_config`);
    }
    // PHP build_request_config keeps the dedalo api_engine item; the raw ontology
    // request_config has no api_engine yet, so we use the first item (the only one
    // in every real relation_parent/children/related node).
    const first = requestConfig[0] as Record<string, unknown>;
    const show = first?.['show'] as Record<string, unknown> | undefined;
    const ddoMapRaw = show?.['ddo_map'];
    if (!Array.isArray(ddoMapRaw)) {
      throw new Error(`${this.modelName} ${this.tipo}: request_config has no show.ddo_map array`);
    }

    interface RawDdo {
      tipo?: unknown;
      parent?: unknown;
      section_tipo?: unknown;
      value_with_parents?: unknown;
    }
    const ddos = ddoMapRaw as RawDdo[];

    // Resolve 'self' parent references (resolve_ddo_self_references): parent 'self'
    // → this.tipo. The set of ddos whose RESOLVED parent is some ddo's tipo are
    // NON-leaf parents (they have descendants) → nested descent, deferred.
    const parentOf = (ddo: RawDdo): string | null => {
      const p = ddo.parent;
      if (p === 'self') return this.tipo;
      return typeof p === 'string' ? p : null;
    };
    const ddoTipos = new Set(
      ddos.map((d) => (typeof d.tipo === 'string' ? d.tipo : '')).filter((t) => t !== ''),
    );

    const out: LabelComponent[] = [];
    for (const ddo of ddos) {
      const tipo = typeof ddo.tipo === 'string' ? ddo.tipo : '';
      if (tipo === '') continue; // STEP 1: missing tipo dropped

      const resolvedParent = parentOf(ddo);
      // ddo_direct_children: only ddos whose parent is THIS component (line 791).
      if (resolvedParent !== this.tipo) continue;

      // DEFERRED: value_with_parents → an extra ancestor-chain atom per locator
      // (get_export_value line 919, the full hierarchy recursion). Not ported.
      if (ddo.value_with_parents === true) {
        throw new Error(
          `${this.modelName} ${this.tipo}: ddo ${tipo} value_with_parents (hierarchy recursion) not ported`,
        );
      }

      // DEFERRED: nested descent. A ddo that is itself the PARENT of another ddo
      // drives a second resolution level (get_export_value sub_ddo_map / descend).
      if (ddoTipos.has(tipo) && ddos.some((d) => parentOf(d) === tipo)) {
        throw new Error(
          `${this.modelName} ${this.tipo}: ddo ${tipo} has nested ddo children (export descend) not ported`,
        );
      }

      // DEFERRED: multi-section ddo (an array section_tipo — autocomplete toponymy).
      if (Array.isArray(ddo.section_tipo)) {
        throw new Error(
          `${this.modelName} ${this.tipo}: ddo ${tipo} multi-section_tipo not ported`,
        );
      }

      const model = await this.ontology.getModelByTipo(tipo);
      if (model === null) continue;

      const column = labelColumnForModel(model);
      if (column === null) {
        // DEFERRED: nested-relation (component_select/portal/dataframe/…) or media
        // label child. Their own get_export_value differs; not ported. Loud guard.
        throw new Error(
          `${this.modelName} ${this.tipo}: ddo ${tipo} model '${model}' not ported`,
        );
      }
      out.push({ tipo, model, column });
    }
    return out;
  }

  /** Read the fields/records separator overrides from properties. */
  private async loadSeparators(): Promise<void> {
    const properties = await this.ontology.getProperties(this.tipo);
    const fs = properties?.['fields_separator'];
    if (typeof fs === 'string') this.fieldsSeparator = fs;
    const rs = properties?.['records_separator'];
    if (typeof rs === 'string') this.recordsSeparator = rs;
  }

  /**
   * Resolve a single label component on a target (section_tipo / section_id in its
   * own matrix table) to its ExportValue, at DEDALO_DATA_LANG. Reuses the existing
   * leaf-component ports (input_text family, generic json/number/geo). Returning the
   * ExportValue (not just the flat string) lets the caller distinguish "no atoms"
   * (locator drops out of the records join) from "empty-value atom" (kept slot).
   */
  private async resolveLabelExportValue(
    labelComponent: LabelComponent,
    targetSectionTipo: string,
    targetSectionId: number | null,
  ): Promise<ExportValue> {
    const targetTable = await resolveMatrixTable(this.ontology, targetSectionTipo);
    const childInit: ComponentInit = {
      tipo: labelComponent.tipo,
      sectionTipo: targetSectionTipo,
      sectionId: targetSectionId,
      // child lang = DEDALO_DATA_LANG (global). LangConfig.dataLang carries it.
      lang: this.langConfig.dataLang,
      dataColumnName: labelComponent.column,
      matrixTable: targetTable,
      matrix: this.matrix,
      ontology: this.ontology,
      langConfig: this.langConfig,
    };

    switch (labelComponent.model) {
      case 'component_input_text': {
        const child = await ComponentInputText.create(childInit);
        return child.getExportValue();
      }
      case 'component_text_area': {
        const { ComponentTextArea } = await import('./component_text_area.ts');
        const child = await ComponentTextArea.create(childInit);
        return child.getExportValue();
      }
      case 'component_email':
      case 'component_number':
      case 'component_json':
      case 'component_geolocation': {
        const child = await ComponentGeneric.create(childInit, labelComponent.model);
        return child.getExportValue();
      }
      default:
        // unreachable: resolveLabelComponents gates the model set.
        throw new Error(`${this.modelName}: unexpected label model ${labelComponent.model}`);
    }
  }

  /** PHP empty(): drops '', '0' (and null) from a join. */
  private static isPhpEmpty(value: string): boolean {
    return value === '' || value === '0';
  }

  /** Normalize a locator's section_id (stored as a numeric string). */
  private static locatorSectionId(locator: Locator): number | null {
    const raw = locator.section_id;
    if (typeof raw === 'number') return Number.isInteger(raw) ? raw : null;
    if (typeof raw === 'string') {
      const n = Number.parseInt(raw, 10);
      return Number.isNaN(n) ? null : n;
    }
    return null;
  }

  /**
   * Resolve one locator into its record contribution: the per-locator field string
   * (kept label values joined with fields_separator, empty leaf values dropped) and
   * whether any label child produced an export atom (the join_atoms record-slot
   * predicate).
   */
  private async resolveRecord(
    locator: Locator,
    labelComponents: LabelComponent[],
  ): Promise<RecordContribution | null> {
    if (locator === null || typeof locator !== 'object') return null;
    if (typeof locator.section_tipo !== 'string' || locator.section_tipo === '') {
      // PHP skips locators without section_tipo (line 806).
      return null;
    }
    const targetSectionTipo = locator.section_tipo;
    const targetSectionId = ComponentRelationCommon.locatorSectionId(locator);

    const fields: string[] = [];
    let hasAtoms = false;
    for (const labelComponent of labelComponents) {
      const exportValue = await this.resolveLabelExportValue(
        labelComponent,
        targetSectionTipo,
        targetSectionId,
      );
      // An export atom = a join_atoms record slot, even when its value is empty.
      if (exportValue.atoms.length > 0) hasAtoms = true;
      const value = exportValue.toFlatString();
      // leaf join drops empty/'0' (PHP join_atoms leaf empty() skip).
      if (!ComponentRelationCommon.isPhpEmpty(value)) fields.push(value);
    }
    return { value: fields.join(this.fieldsSeparator), hasAtoms };
  }

  /**
   * get_value = get_export_value()->to_flat_string() for the relation-family
   * SIMPLE shape. Single- and multi-locator are handled uniformly: each locator
   * that produces atoms becomes a record slot; the slots join with records_separator.
   */
  async getValue(): Promise<string> {
    await this.loadSeparators();
    const labelComponents = await this.resolveLabelComponents();

    const data = (await this.getData()) ?? [];
    if (data.length === 0 || labelComponents.length === 0) return '';

    const records: string[] = [];
    for (const item of data) {
      const contribution = await this.resolveRecord(item as Locator, labelComponents);
      if (contribution === null) continue; // invalid locator (no section_tipo): no slot
      // A locator that produced NO atoms at all leaves no record slot in join_atoms
      // (verified by checkbox_multi_empty → ''). A kept-but-empty record contributes ''.
      if (!contribution.hasAtoms) continue;
      records.push(contribution.value);
    }

    // Records (locators with atoms) join with records_separator (' | ', the first
    // indexed relation level). One record → just its value (separator never inserted).
    return records.join(this.recordsSeparator);
  }

  // ── DATA-element (JSON controller) read-side accessors ───────────────────────
  // These expose the pieces the per-component JSON DATA element (component_data_element.ts
  // → buildRelationDataElement) needs WITHOUT re-implementing the relation resolution:
  // the raw stored locators (get_data_lang), the resolved label-column set (the V6/V5
  // ddo_map → input_text-family children resolved on each locator target), and the
  // effective lang. The relation get_value flattening (join_atoms) is NOT applied here —
  // the controller's `entries` are the RAW locators; the per-locator label columns are
  // emitted as separate get_subdatum data items (one buildInputTextElement per label
  // column × locator).

  /** The effective lang (get_lang) after resolveLang — relations are lg-nolan. */
  effectiveLang(): string {
    return this.lang;
  }

  /** The component's section_id (get_section_id), as supplied (may be null). */
  elementSectionId(): number | null {
    return this.sectionId;
  }

  /**
   * The RAW stored locator array (get_data_lang) — the controller's `entries`
   * source before pagination. null when the record/component has no data (mirrors
   * get_data null-collapse). Relations are non-translatable so get_data_lang ===
   * get_data here.
   */
  async rawLocators(): Promise<ReadonlyArray<Record<string, unknown>>> {
    const data = await this.getDataLang();
    return (data ?? []) as ReadonlyArray<Record<string, unknown>>;
  }

  /**
   * The ordered label-component set this relation resolves on each locator target
   * (the get_subdatum ddo_map). Throws (loud guard) for the un-ported shapes
   * (value_with_parents, nested descent, non-leaf models, V6 multi-section) exactly
   * like getValue, so a half-ported element never escapes the gate.
   */
  async dataElementLabelComponents(): Promise<ReadonlyArray<LabelComponent>> {
    return this.resolveLabelComponents();
  }

  // ── DATALIST (get_list_of_values / get_list_value) — LIST-mode option labels ──
  // Port of PHP component_common::get_list_of_values() + component_relation_common::
  // get_list_value(), the path the *_json LIST/tm controller uses for the SELECT
  // family's `entries`. Distinct from get_value (get_export_value): the datalist is
  // the SET of selectable target rows (a search over the request_config target
  // section), each resolved to its label; get_list_value then keeps only the labels
  // whose locator matches a stored selection. REUSES resolveLabelComponents +
  // resolveLabelExportValue (same ddo set, same DEDALO_DATA_LANG label resolution).
  //
  // GATED to the byte-reachable shape (loud throw otherwise, so a wrong-byte result
  // never escapes the parity gate):
  //   - V5 path only (no source.request_config; select/radio/check_box). The V6
  //     ddo_map / fixed_filter / filtered_by_search* paths are NOT ported.
  //   - EXACTLY ONE target section in the relations (the `section` model). The
  //     multi-target (toponymy/thesaurus) case is not ported.
  //   - EXACTLY ONE show label component, input_text-family/generic leaf. PHP joins
  //     multiple show components with ' | '; with one component the join never fires
  //     so the byte output is unambiguous. >1 (or a filter, or a hide ddo) throws.

  /** The single target section tipo (the `section` model dropped from the label set). */
  private async resolveDatalistTargetSection(): Promise<string> {
    const properties = await this.ontology.getProperties(this.tipo);
    const source = properties?.['source'];
    const requestConfig =
      source !== null && typeof source === 'object'
        ? (source as Record<string, unknown>)['request_config']
        : undefined;
    if (requestConfig !== undefined) {
      throw new Error(
        `${this.modelName} ${this.tipo}: datalist V6 source.request_config not ported`,
      );
    }
    const filteredBySearch =
      properties?.['filtered_by_search'] ?? properties?.['filtered_by_search_dynamic'];
    if (filteredBySearch !== undefined && filteredBySearch !== null) {
      throw new Error(
        `${this.modelName} ${this.tipo}: datalist filtered_by_search* not ported`,
      );
    }

    const relationTipos = (await this.ontology.getRelationTipos(this.tipo)) ?? [];
    const targets: string[] = [];
    for (const relTipo of relationTipos) {
      if ((await this.ontology.getModelByTipo(relTipo)) === 'section') targets.push(relTipo);
    }
    if (targets.length !== 1) {
      throw new Error(
        `${this.modelName} ${this.tipo}: datalist expects exactly one target section (got ${targets.length})`,
      );
    }
    return targets[0]!;
  }

  /** PHP-style label sort: properties.sort_by[0] (path/direction) else strnatcmp(label). */
  private async sortDatalist(items: DatalistItem[]): Promise<void> {
    const properties = await this.ontology.getProperties(this.tipo);
    const sortBy = properties?.['sort_by'];
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'variant' });
    if (Array.isArray(sortBy) && sortBy.length > 0) {
      const first = sortBy[0] as { path?: unknown; direction?: unknown };
      const path = typeof first.path === 'string' ? first.path : 'label';
      const desc = first.direction === 'DESC';
      items.sort((a, b) => {
        const va = (a as unknown as Record<string, unknown>)[path] ?? 0;
        const vb = (b as unknown as Record<string, unknown>)[path] ?? 0;
        const na = Number(va);
        const nb = Number(vb);
        let cmp: number;
        if (!Number.isNaN(na) && !Number.isNaN(nb) && va !== '' && vb !== '') {
          cmp = na < nb ? -1 : na > nb ? 1 : 0;
        } else {
          cmp = collator.compare(String(va), String(vb));
        }
        return desc ? -cmp : cmp;
      });
      return;
    }
    // Default: alphabetic ascending by label (strnatcmp).
    items.sort((a, b) => collator.compare(a.label, b.label));
  }

  /**
   * get_list_of_values()->result: the full set of selectable options for this
   * component, each {value: locator, label, section_id, hide:[]}, sorted as PHP
   * sorts (sort_by or label). Enumerates the target section rows via the injected
   * search and resolves each row's single show-label component at DEDALO_DATA_LANG.
   */
  async getListOfValues(recordSearch: DatalistRecordSearch): Promise<DatalistItem[]> {
    const targetSectionTipo = await this.resolveDatalistTargetSection();
    const labelComponents = await this.resolveLabelComponents();
    if (labelComponents.length !== 1) {
      throw new Error(
        `${this.modelName} ${this.tipo}: datalist expects exactly one show label component (got ${labelComponents.length})`,
      );
    }
    const labelComponent = labelComponents[0]!;

    const rows = await recordSearch([targetSectionTipo]);
    const items: DatalistItem[] = [];
    for (const row of rows) {
      const exportValue = await this.resolveLabelExportValue(
        labelComponent,
        row.section_tipo,
        row.section_id,
      );
      // PHP builds the label from the show component get_value() — a single show
      // component means no ' | ' join, so the flat string is the value verbatim
      // (empty values included, NOT dropped: get_list_of_values does not PHP-empty
      // the label like the leaf join does).
      const label = exportValue.toFlatString();
      const sectionIdStr = String(row.section_id);
      items.push({
        value: { section_tipo: row.section_tipo, section_id: sectionIdStr },
        label,
        section_id: sectionIdStr,
        hide: [],
      });
    }
    await this.sortDatalist(items);
    return items;
  }

  /**
   * get_list_value(): the LIST/tm-mode `entries` — the labels of the datalist
   * options whose locator matches a stored selection (matched by section_id +
   * section_tipo, in DATALIST order). Returns null when the component has NO stored
   * data (PHP early-returns null); [] when it has data but none matches the datalist.
   */
  async getListValue(recordSearch: DatalistRecordSearch): Promise<string[] | null> {
    const data = (await this.getData()) ?? [];
    if (data.length === 0) return null;

    const datalist = await this.getListOfValues(recordSearch);
    const out: string[] = [];
    for (const item of datalist) {
      const matched = data.some((stored) => {
        const s = stored as Record<string, unknown>;
        return (
          String(s.section_id) === item.value.section_id &&
          s.section_tipo === item.value.section_tipo
        );
      });
      if (matched) out.push(item.label);
    }
    return out;
  }
}

export type { LabelComponent };
