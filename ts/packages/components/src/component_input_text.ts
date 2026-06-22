import type { ComponentDatum } from '@dedalo/db';
import { ComponentCommon, type ComponentInit } from './component_common.ts';
import { ExportValue, type ExportAtom, type ExportPathSegment } from './export_value.ts';

/**
 * Read-side port of PHP `component_input_text` (which extends
 * component_string_common → component_common). Resolves a single-line text
 * component's value from the matrix `string` column, reproducing the PHP
 * get_value path byte-for-byte:
 *
 *   get_value() = get_export_value()->to_flat_string()
 *
 * get_export_value():
 *   1. records_separator = properties.records_separator ?? ' | '
 *   2. data = get_data_lang() (effective-lang slice)
 *   3. if empty → data = get_component_data_fallback(lang, dataLangDefault),
 *      mark is_fallback (does not affect the flat string, but tracked for parity)
 *   4. one atom per item; flatten with the leaf fields_separator (= records_separator)
 *
 * supports_translation = true (component_string_common), so get_data_lang filters
 * by effective lang. For a non-translatable tipo the constructor forces the
 * effective lang to nolan, so the filter matches the stored lg-nolan items.
 */
export class ComponentInputText extends ComponentCommon {
  protected override readonly supportsTranslation = true;

  private constructor(init: ComponentInit) {
    super(init);
  }

  /**
   * Factory mirroring component_common::get_instance(): builds the instance and
   * runs the async lang resolution (translatable → nolan forcing) before any
   * data read. Always use this rather than `new`.
   */
  static async create(init: ComponentInit): Promise<ComponentInputText> {
    const instance = new ComponentInputText(init);
    await instance.resolveLang();
    return instance;
  }

  /** Resolve the ontology label (term) for this tipo in the effective lang. */
  private async getLabel(): Promise<string | null> {
    return this.ontology.getLabel(this.tipo, this.getLang());
  }

  /** Resolve the model name for this tipo (for the export segment / value model). */
  private async getModel(): Promise<string | null> {
    return this.ontology.getModelByTipo(this.tipo);
  }

  /** records_separator: properties override else the ' | ' legacy default. */
  private async getRecordsSeparator(): Promise<string> {
    const properties = await this.ontology.getProperties(this.tipo);
    const sep = properties?.['records_separator'];
    return typeof sep === 'string' ? sep : ' | ';
  }

  /**
   * Port of component_string_common::is_empty(): an item is empty when its value
   * is null/non-string-empty, EXCEPT '0' / 0 which count as non-empty.
   */
  private static itemIsEmpty(item: ComponentDatum): boolean {
    const value = item?.value ?? null;
    // PHP: null / non-object item → empty. Here a missing/null value → empty.
    if (value === null) return true;
    if (typeof value === 'string') {
      // PHP: non-empty when trim() is truthy OR trim()==='0'. trim()==='0' is
      // already truthy, so this collapses to: empty iff trim() is the empty string.
      return value.trim() === '';
    }
    // numeric value: 0 / 0.0 count as NON-empty (PHP special case), as does any other.
    if (typeof value === 'number') return false;
    // any other non-null value (bool true, object) → non-empty.
    return false;
  }

  /** Port of is_empty_data: true when every item is empty (or data is null). */
  private static isEmptyData(data: ComponentDatum[] | null): boolean {
    if (data === null) return true;
    for (const item of data) {
      if (!ComponentInputText.itemIsEmpty(item)) return false;
    }
    return true;
  }

  /**
   * Port of component_string_common::get_component_data_fallback($lang, $mainLang):
   *   1. try mainLang (when != lang)
   *   2. try nolan
   *   3. try every project lang (allLangs) + nolan, skipping lang & mainLang
   * First non-(is_empty_data) slice wins; null when nothing.
   */
  private async getComponentDataFallback(
    lang: string,
    mainLang: string,
  ): Promise<ComponentDatum[] | null> {
    const data = await this.getData();
    if (data === null || data.length === 0) return null;

    if (mainLang !== lang) {
      const mainData = await this.getDataLang(mainLang);
      if (!ComponentInputText.isEmptyData(mainData ?? null)) return mainData;
    }

    const nolanData = await this.getDataLang(this.langConfig.nolan);
    if (!ComponentInputText.isEmptyData(nolanData ?? null)) return nolanData;

    const dataLangs = [...this.langConfig.allLangs, this.langConfig.nolan];
    for (const currentLang of dataLangs) {
      if (currentLang === lang || currentLang === mainLang) continue;
      const currentData = await this.getDataLang(currentLang);
      if (!ComponentInputText.isEmptyData(currentData ?? null)) return currentData;
    }

    return null;
  }

  /**
   * Port of component_input_text::get_export_value(). Produces an ExportValue
   * with one atom per resolved data item.
   */
  async getExportValue(): Promise<ExportValue> {
    const recordsSeparator = await this.getRecordsSeparator();
    const model = await this.getModel();
    const label = await this.getLabel();

    const segment: ExportPathSegment = {
      sectionTipo: this.sectionTipo,
      componentTipo: this.tipo,
      model,
      fieldsSeparator: recordsSeparator,
      recordsSeparator,
      itemIndex: null,
    };
    const path = [segment];

    const exportValue = new ExportValue(label, 'component_input_text');

    // main-lang slice first, fallback when empty
    let data = await this.getDataLang();
    let isFallback = false;
    if (data === null || data.length === 0) {
      data = await this.getComponentDataFallback(this.getLang(), this.langConfig.dataLangDefault);
      isFallback = true;
    }
    if (data === null || data.length === 0) {
      return exportValue;
    }

    let valueIndex = 0;
    for (const item of data) {
      let itemValue: unknown = item.value ?? '';
      if (itemValue !== null && typeof itemValue === 'object') {
        // PHP json_encode of an object value (rare). Kept for parity.
        itemValue = JSON.stringify(itemValue);
      }
      const atom: ExportAtom = {
        path,
        value: typeof itemValue === 'string' ? itemValue : String(itemValue),
        valueIndex: valueIndex++,
        lang: typeof item.lang === 'string' ? item.lang : this.getLang(),
        isFallback,
      };
      exportValue.addAtom(atom);
    }

    return exportValue;
  }

  /**
   * Port of component_common::get_value() for input_text:
   * get_export_value()->to_flat_string(). Returns the flat string value (which
   * may be '' for an empty/missing record — PHP returns the empty string, never
   * null, on this path).
   */
  async getValue(): Promise<string> {
    const exportValue = await this.getExportValue();
    return exportValue.toFlatString();
  }

  /** Effective lang (after translatable→nolan resolution). Public accessor for the element builder. */
  effectiveLang(): string {
    return this.getLang();
  }

  /**
   * Resolve the `entries` array + `fallback_value` for the JSON CONTROLLER data
   * item (component_input_text_json.php), reusing the get_value data resolution.
   *
   * Mirrors the controller's mode switch:
   *   - 'list'/'tm': get_list_value() = get_data_lang() null-collapsed (empty → null)
   *     + the Root special case (DEDALO_SECTION_USERS_TIPO, section_id===-1).
   *   - 'search':    entries=[], fallback=null.
   *   - 'edit':      get_data_lang() (null only when NO data; [] when present in
   *                  other langs only).
   * fallback_value is non-null only when is_empty_data(entries) (get_value chain).
   */
  async resolveDataEntries(
    mode: string,
  ): Promise<{ entries: ComponentDatum[] | null; fallbackValue: ComponentDatum[] | null }> {
    if (mode === 'search') {
      return { entries: [], fallbackValue: null };
    }

    if (mode === 'list' || mode === 'tm') {
      // get_list_value(): parent get_list_value (get_data_lang null-collapsed) + Root case.
      const slice = await this.getDataLang();
      let entries: ComponentDatum[] | null = slice && slice.length > 0 ? slice : null;
      // Root user special resolution (component_input_text::get_list_value):
      // DEDALO_SECTION_USERS_TIPO + section_id === -1 + empty value → [{value:'Root', lang}].
      if (entries === null && this.sectionTipo === USERS_SECTION_TIPO && this.sectionId === -1) {
        entries = [{ value: 'Root', lang: this.getLang() }];
      }
      const fallbackValue = ComponentInputText.isEmptyData(entries)
        ? await this.getComponentDataFallback(this.getLang(), this.langConfig.dataLangDefault)
        : null;
      return { entries, fallbackValue };
    }

    // 'edit' (default): get_data_lang() — null only when the component carries no data.
    const entries = await this.getDataLang();
    const fallbackValue = ComponentInputText.isEmptyData(entries ?? null)
      ? await this.getComponentDataFallback(this.getLang(), this.langConfig.dataLangDefault)
      : null;
    return { entries, fallbackValue };
  }
}

/** DEDALO_SECTION_USERS_TIPO — the Root list-value special case (component_input_text::get_list_value). */
const USERS_SECTION_TIPO = 'dd128';
