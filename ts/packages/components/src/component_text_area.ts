import type { ComponentDatum } from '@dedalo/db';
import { ComponentCommon, type ComponentInit } from './component_common.ts';
import { ExportValue, type ExportAtom, type ExportPathSegment } from './export_value.ts';

/**
 * Read-side port of PHP `component_text_area` (extends component_string_common →
 * component_common). The get_value path is:
 *
 *   get_value() = get_export_value()->to_flat_string()   (inherited from component_common)
 *
 * component_text_area::get_export_value() differs from component_input_text in
 * three ways (all reproduced here):
 *   1. The own path segment comes from build_export_path_segment(): the separators
 *      are resolved ddo > properties > null. With no ddo and (typically) no
 *      records/fields_separator property, both are null, so to_flat_string's leaf
 *      join falls back to its ', ' default (NOT ' | ' like input_text).
 *   2. Empty items are skipped (component_string_common::is_empty), so no atom is
 *      emitted for a blank value.
 *   3. The item value is passed through TR::add_tag_img_on_the_fly() before
 *      becoming the atom value.
 *
 * (!) add_tag_img_on_the_fly() rewrites Dédalo TR markup tags ([index…], [TC…],
 *     <reference> …) into <img>/<reference> HTML. It is a NO-OP for text that
 *     contains none of those tag patterns (the common case for plain-HTML text
 *     bodies). This port reproduces the no-op (passthrough) branch only; values
 *     that DO carry TR markup are NOT yet transformed here — such a record would
 *     diverge from PHP and is out of scope for this phase. The parity gate uses
 *     tag-free goldens; a future phase ports the tag rewriter.
 *
 * supports_translation = true (component_string_common), so get_data_lang filters
 * by the effective lang and get_component_data_fallback supplies the fallback chain.
 */
export class ComponentTextArea extends ComponentCommon {
  protected override readonly supportsTranslation = true;

  private constructor(init: ComponentInit) {
    super(init);
  }

  /** Factory mirroring component_common::get_instance() (async lang resolution). */
  static async create(init: ComponentInit): Promise<ComponentTextArea> {
    const instance = new ComponentTextArea(init);
    await instance.resolveLang();
    return instance;
  }

  private async getLabel(): Promise<string | null> {
    return this.ontology.getLabel(this.tipo, this.getLang());
  }

  private async getModel(): Promise<string | null> {
    return this.ontology.getModelByTipo(this.tipo);
  }

  /**
   * build_export_path_segment separators: ddo (none here) > properties > null.
   * Returns the resolved [fields_separator, records_separator] (null when unset).
   */
  private async getSegmentSeparators(): Promise<[string | null, string | null]> {
    const properties = await this.ontology.getProperties(this.tipo);
    const fs = properties?.['fields_separator'];
    const rs = properties?.['records_separator'];
    return [
      typeof fs === 'string' ? fs : null,
      typeof rs === 'string' ? rs : null,
    ];
  }

  /**
   * Port of component_string_common::is_empty(): null / non-object item → empty;
   * otherwise empty iff trim(value) is falsy AND value is not '0'/0/0.0.
   */
  static itemIsEmpty(item: ComponentDatum | null): boolean {
    if (item === null || typeof item !== 'object') return true;
    const value = item.value ?? null;
    if (value === null) return true;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      // non-empty when trim() is truthy OR trim()==='0'. trim()==='0' is truthy
      // already, so this collapses to: empty iff trim() is the empty string.
      return trimmed === '';
    }
    if (typeof value === 'number') return false; // 0 / 0.0 count as NON-empty
    return false;
  }

  private static isEmptyData(data: ComponentDatum[] | null): boolean {
    if (data === null) return true;
    for (const item of data) {
      if (!ComponentTextArea.itemIsEmpty(item)) return false;
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
      if (!ComponentTextArea.isEmptyData(mainData ?? null)) return mainData;
    }

    const nolanData = await this.getDataLang(this.langConfig.nolan);
    if (!ComponentTextArea.isEmptyData(nolanData ?? null)) return nolanData;

    const dataLangs = [...this.langConfig.allLangs, this.langConfig.nolan];
    for (const currentLang of dataLangs) {
      if (currentLang === lang || currentLang === mainLang) continue;
      const currentData = await this.getDataLang(currentLang);
      if (!ComponentTextArea.isEmptyData(currentData ?? null)) return currentData;
    }

    return null;
  }

  /** Port of component_text_area::get_export_value(). */
  async getExportValue(): Promise<ExportValue> {
    const [fieldsSeparatorRaw, recordsSeparatorRaw] = await this.getSegmentSeparators();
    const model = await this.getModel();
    const label = await this.getLabel();

    // to_flat_string leaf join uses fields_separator ?? ', '. Resolve the default
    // here so the single-segment ExportValue.toFlatString reproduces PHP exactly.
    const fieldsSeparator = fieldsSeparatorRaw ?? ', ';
    const recordsSeparator = recordsSeparatorRaw ?? ' | ';

    const segment: ExportPathSegment = {
      sectionTipo: this.sectionTipo,
      componentTipo: this.tipo,
      model,
      fieldsSeparator,
      recordsSeparator,
      itemIndex: null,
    };
    const path = [segment];

    const exportValue = new ExportValue(label, 'component_text_area');

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
      if (ComponentTextArea.itemIsEmpty(item)) continue;
      const rawValue = item.value;
      const stringValue = typeof rawValue === 'string' ? rawValue : String(rawValue ?? '');
      const atom: ExportAtom = {
        path,
        value: addTagImgOnTheFlyPassthrough(stringValue),
        valueIndex: valueIndex++,
        lang: typeof item.lang === 'string' ? item.lang : this.getLang(),
        isFallback,
      };
      exportValue.addAtom(atom);
    }

    return exportValue;
  }

  /** get_value = get_export_value()->to_flat_string(). */
  async getValue(): Promise<string> {
    const exportValue = await this.getExportValue();
    return exportValue.toFlatString();
  }

  /** Effective lang (after translatable→nolan resolution). Public accessor for the element builder. */
  effectiveLang(): string {
    return this.getLang();
  }

  /**
   * Resolve the `entries` array + `fallback_value` for the component_text_area
   * JSON CONTROLLER data item (component_text_area_json.php), reproducing its mode
   * switch:
   *   - 'list'/'tm': get_list_value() (per-item: skip-empty passthrough + TR
   *                  add_tag_img_on_the_fly + truncate_html(130)). fallback_value =
   *                  get_fallback_list_value(200) when empty.
   *   - 'edit':      get_data_lang() ?? [] (+ fix_broken_index_tags when index/draw
   *                  tags are present — DECLINED here, gated to tag-free goldens).
   *                  fallback_value = get_fallback_edit_value(700) when empty.
   *
   * (!) The list-mode get_list_value TRUNCATION and the fallback helpers
   * (get_fallback_list_value / get_fallback_edit_value) apply TR markup rewriting +
   * HTML truncation, which this phase ports only for the no-op (short, tag-free)
   * case — addTagImgOnTheFlyPassthrough throws on TR markup, and truncate is a
   * verbatim passthrough for content shorter than max_chars. A record needing real
   * truncation/TR-rewrite or a non-null cross-lang fallback DIVERGES and is declined
   * (the build_json_rows gate only admits sections whose text_area data is tag-free
   * and short, or empty). fallbackValue is therefore resolved via the same
   * get_component_data_fallback chain used by get_value and asserted tag-free.
   */
  async resolveDataEntries(
    mode: string,
  ): Promise<{ entries: ComponentDatum[] | null; fallbackValue: ComponentDatum[] | null }> {
    if (mode === 'search') {
      return { entries: [], fallbackValue: null };
    }

    if (mode === 'list' || mode === 'tm') {
      // get_list_value(): null when no data; else per-item truncated/TR-passthrough.
      const slice = await this.getDataLang();
      if (slice === null || slice.length === 0) {
        const fallbackValue = await this.getListFallback();
        return { entries: null, fallbackValue };
      }
      const entries: ComponentDatum[] = slice.map((item) => {
        if (ComponentTextArea.itemIsEmpty(item)) {
          // empty case → value '' (component_text_area::get_list_value).
          return { ...item, value: '' };
        }
        const raw = typeof item.value === 'string' ? item.value : String(item.value ?? '');
        // TR add_tag_img_on_the_fly (passthrough for tag-free) + truncate_html(130)
        // (verbatim for short content). Both no-ops on the gated tag-free data.
        const value = truncateHtmlPassthrough(130, addTagImgOnTheFlyPassthrough(raw));
        return { ...item, value };
      });
      const fallbackValue = ComponentTextArea.isEmptyData(entries)
        ? await this.getListFallback()
        : null;
      return { entries, fallbackValue };
    }

    // 'edit' (default): get_data_lang() ?? [] (PHP coalesces null → []).
    const slice = await this.getDataLang();
    const entries: ComponentDatum[] = slice ?? [];
    const fallbackValue = ComponentTextArea.isEmptyData(entries)
      ? await this.getEditFallback()
      : null;
    return { entries, fallbackValue };
  }

  /**
   * get_fallback_list_value(200) — the cross-lang fallback slice for list mode.
   * Reuses get_component_data_fallback; the per-item TR/truncate is a no-op for the
   * gated tag-free data. Returns null when nothing.
   */
  private async getListFallback(): Promise<ComponentDatum[] | null> {
    const data = await this.getComponentDataFallback(
      this.getLang(),
      this.langConfig.dataLangDefault,
    );
    return this.applyFallbackTransform(data, 200);
  }

  /** get_fallback_edit_value(700) — the cross-lang fallback slice for edit mode. */
  private async getEditFallback(): Promise<ComponentDatum[] | null> {
    const data = await this.getComponentDataFallback(
      this.getLang(),
      this.langConfig.dataLangDefault,
    );
    return this.applyFallbackTransform(data, 700);
  }

  /** Per-item TR+truncate transform shared by the list/edit fallback helpers. */
  private applyFallbackTransform(
    data: ComponentDatum[] | null,
    maxChars: number,
  ): ComponentDatum[] | null {
    if (data === null || data.length === 0) return null;
    return data.map((item) => {
      const raw = typeof item.value === 'string' ? item.value : String(item.value ?? '');
      const value = truncateHtmlPassthrough(maxChars, addTagImgOnTheFlyPassthrough(raw));
      return { ...item, value };
    });
  }
}

/**
 * Markers for the Dédalo TR markup tags that PHP's add_tag_img_on_the_fly()
 * rewrites. When NONE are present the function is a verbatim passthrough — which
 * is the only branch ported here (see class docblock).
 */
const TR_TAG_MARKERS = [
  /\[(?:\/?)index/i, // [index…] / [/index…]
  /\[TC_/i, // [TC_…]
  /\[reference/i, // legacy reference markers
  /\[geo/i,
  /\[page/i,
  /\[person/i,
];

/**
 * Passthrough port of TR::add_tag_img_on_the_fly() for tag-free content. Throws
 * if the value carries TR markup, so a divergence is loud rather than silent.
 */
function addTagImgOnTheFlyPassthrough(text: string): string {
  for (const marker of TR_TAG_MARKERS) {
    if (marker.test(text)) {
      throw new Error(
        'component_text_area value contains TR markup tags; add_tag_img_on_the_fly ' +
          'rewriting is not ported in this phase.',
      );
    }
  }
  return text;
}

/**
 * Passthrough port of component_string_common::truncate_html() for the SHORT case:
 * PHP returns the text VERBATIM when its plain-text length (tags stripped) is ≤
 * length (the considerHtml=true early return). This phase only reaches text whose
 * plain-text length is short (the build_json_rows gate admits tag-free, short
 * text_area data). When the plain text exceeds the limit the real word-boundary
 * truncation is NOT ported here, so throw loudly rather than emit divergent bytes.
 */
function truncateHtmlPassthrough(length: number, text: string): string {
  const plainLength = text.replace(/<.*?>/gs, '').length;
  if (plainLength <= length) return text;
  throw new Error(
    `component_text_area value exceeds ${length} plain chars; truncate_html is not ` +
      'ported in this phase.',
  );
}
