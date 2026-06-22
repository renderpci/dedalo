import type { ComponentDatum } from '@dedalo/db';
import { dedaloJsonEncode } from '@dedalo/json-parity';
import { ComponentCommon, type ComponentInit } from './component_common.ts';
import { ExportValue, type ExportAtom, type ExportPathSegment } from './export_value.ts';

/**
 * Read-side port of the GENERIC PHP `component_common::get_export_value()` path,
 * which `component_email` and `component_number` inherit unchanged (neither
 * overrides get_export_value or get_value). It is fundamentally different from the
 * input_text / text_area path:
 *
 *   get_value() = get_export_value()->to_flat_string()
 *
 * component_common::get_export_value():
 *   1. own segment via build_export_path_segment(): separators ddo > properties >
 *      null. With no ddo / no separator property both are null, so to_flat_string's
 *      leaf join uses its ', ' default.
 *   2. data = get_data()  — the RAW matrix items for the component. NO language
 *      filtering, NO fallback chain (unlike the string-family path).
 *   3. one atom per item; the atom value is `json_encode($item)` of the WHOLE item
 *      object ({id[,lang],value}) — NOT just item.value. (Verified against the live
 *      engine: result is e.g. `{"id":1,"value":10.68}`.)
 *   4. atom lang = is_translatable ? this.lang : null (does not affect the flat
 *      string).
 *
 * The inner json_encode uses DEFAULT php flags (escape slashes + escape unicode),
 * so it is reproduced with dedaloJsonEncode(item, 0). The item key order matches
 * the JSONB storage order (id, [lang,] value), which the matrix read preserves.
 *
 * component_number additionally overrides get_data() to run each item value through
 * set_format_form_type() (type cast + precision rounding). That hook is applied
 * here when `model === 'component_number'`.
 */
export class ComponentGeneric extends ComponentCommon {
  // The string-family supports_translation default (false) is irrelevant for the
  // generic path because get_data() is used raw (no get_data_lang filtering); but
  // the atom's `lang` field mirrors is_translatable, so resolve it from ontology.
  private readonly model: string;

  private constructor(init: ComponentInit, model: string) {
    super(init);
    this.model = model;
  }

  static async create(init: ComponentInit, model: string): Promise<ComponentGeneric> {
    const instance = new ComponentGeneric(init, model);
    await instance.resolveLang();
    return instance;
  }

  private async getLabel(): Promise<string | null> {
    return this.ontology.getLabel(this.tipo, this.getLang());
  }

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
   * Port of component_number::get_data(): for the number model, clone each item
   * and replace its `value` with set_format_form_type(value). null-valued items are
   * preserved as-is. For non-number models the raw data is returned unchanged.
   */
  private async getFormattedData(): Promise<ComponentDatum[] | null> {
    const data = await this.getData();
    if (data === null) return null;
    if (this.model !== 'component_number') return data;

    const properties = await this.ontology.getProperties(this.tipo);
    const type = typeof properties?.['type'] === 'string' ? (properties['type'] as string) : null;
    const precisionRaw = properties?.['precision'];
    const precision =
      typeof precisionRaw === 'number'
        ? precisionRaw
        : typeof precisionRaw === 'string' && precisionRaw !== ''
          ? Number.parseInt(precisionRaw, 10)
          : 2;

    const out: ComponentDatum[] = [];
    for (const item of data) {
      if (item === null || typeof item !== 'object') continue; // PHP skips null items
      const value = item.value ?? null;
      if (value === null) {
        out.push(item);
        continue;
      }
      // clone preserving key order, replace value
      const cloned: ComponentDatum = {};
      for (const [k, v] of Object.entries(item)) {
        cloned[k] = k === 'value' ? setFormatFormType(v, type, precision) : v;
      }
      out.push(cloned);
    }
    return out;
  }

  /** Port of component_common::get_export_value() (generic). */
  async getExportValue(): Promise<ExportValue> {
    const [fieldsSeparatorRaw, recordsSeparatorRaw] = await this.getSegmentSeparators();
    const label = await this.getLabel();
    const isTranslatable = await this.ontology.getTranslatable(this.tipo);

    const fieldsSeparator = fieldsSeparatorRaw ?? ', ';
    const recordsSeparator = recordsSeparatorRaw ?? ' | ';

    const segment: ExportPathSegment = {
      sectionTipo: this.sectionTipo,
      componentTipo: this.tipo,
      model: this.model,
      fieldsSeparator,
      recordsSeparator,
      itemIndex: null,
    };
    const path = [segment];

    const exportValue = new ExportValue(label, this.model);

    const data = await this.getFormattedData();
    if (data === null || data.length === 0) {
      return exportValue;
    }

    let valueIndex = 0;
    for (const item of data) {
      // Atom value = json_encode($item) of the WHOLE item object, default flags.
      const value = dedaloJsonEncode(item, 0);
      const atom: ExportAtom = {
        path,
        value,
        valueIndex,
        lang: isTranslatable ? this.getLang() : '',
        isFallback: false,
      };
      exportValue.addAtom(atom);
      valueIndex += 1;
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
   * Resolve the `entries` array for the JSON CONTROLLER data item of the GENERIC
   * components (component_number / component_email), reproducing their *_json.php
   * controllers' mode switch:
   *   - 'list'/'tm': get_list_value() = get_data_lang() null-collapsed (empty → null).
   *   - 'search':    null (component_common::get_data_lang returns the raw data; in
   *                  search mode no record is loaded so the value is null).
   *   - 'edit':      get_data_lang() (full slice; may be null when absent).
   *
   * For component_number the resolved items pass through the get_data() formatting
   * (set_format_form_type per value) exactly like the PHP get_data() override —
   * applied here on the data-lang slice. component_email is non-translatable, so
   * the slice is the (raw) nolan items.
   *
   * NEITHER number NOR email emits a fallback_value (their controllers add only
   * parent_tipo + parent_section_id), so this returns entries only.
   */
  async resolveDataEntries(mode: string): Promise<{ entries: ComponentDatum[] | null }> {
    if (mode === 'search') {
      return { entries: null };
    }

    // get_data_lang() over the formatted data (number) or raw data (email).
    const slice = await this.getFormattedDataLang();

    if (mode === 'list' || mode === 'tm') {
      // get_list_value(): get_data_lang() null-collapsed (empty → null).
      return { entries: slice && slice.length > 0 ? slice : null };
    }

    // 'edit' (default): get_data_lang() (null only when absent).
    return { entries: slice };
  }

  /**
   * get_data_lang() applied to the number-formatted data. ComponentCommon.getDataLang
   * filters the RAW getData(); for the number model the PHP get_data() override
   * formats every value, so we re-derive the lang slice from the formatted data here.
   */
  private async getFormattedDataLang(): Promise<ComponentDatum[] | null> {
    const data = await this.getFormattedData();
    if (data === null || data.length === 0) return data;
    const isTranslatable = await this.ontology.getTranslatable(this.tipo);
    if (!isTranslatable) return data;
    const safeLang = this.getLang();
    return data.filter(
      (el): el is ComponentDatum =>
        el !== null && typeof el === 'object' && el.lang === safeLang,
    );
  }
}

/**
 * Port of component_number::set_format_form_type(). Returns the formatted numeric
 * value (int or float), or null when the value is "empty" in PHP terms.
 *
 * PHP `empty($value) && $value!==0`: empty() is true for null, '', '0', 0, 0.0,
 * false, '0.0'? — no: '0.0' is a non-empty string in PHP. So the null-return guard
 * fires for: null, false, '', 0, 0.0, '0'. The `$value!==0` re-admits integer 0
 * (so 0 is NOT nulled). We reproduce the practical cases seen in real data: numeric
 * JSONB values (already number) and numeric strings.
 */
function setFormatFormType(
  value: unknown,
  type: string | null,
  precision: number,
): number | null {
  // PHP empty() with the $value!==0 escape hatch.
  if (isPhpEmptyExcept0(value)) return null;

  if (type === null || type === '') {
    // default float
    return toFloat(value);
  }

  switch (type) {
    case 'int':
      return toInt(value);
    case 'float':
    default: {
      let v: number;
      if (typeof value === 'string') {
        if (!value.includes(',') && !value.includes('.')) {
          v = toInt(value);
        } else {
          v = Number.parseFloat(value);
        }
      } else if (typeof value === 'number') {
        v = value;
      } else {
        v = toInt(value);
      }
      if (!Number.isFinite(v)) return toInt(value);
      // PHP (float)round($value, $precision): round half-away-from-zero.
      return roundHalfAwayFromZero(v, precision);
    }
  }
}

/** PHP empty($v) but with integer 0 / 0.0 treated as NON-empty. */
function isPhpEmptyExcept0(value: unknown): boolean {
  if (value === 0) return false; // $value!==0 escape
  if (value === null || value === undefined) return true;
  if (value === false) return true;
  if (value === '') return true;
  if (value === '0') return true;
  if (typeof value === 'number' && value === 0) return false; // 0.0 re-admitted by ===0 above for 0; keep for clarity
  return false;
}

function toFloat(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function toInt(value: unknown): number {
  if (typeof value === 'number') return Math.trunc(value);
  if (typeof value === 'string') {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : 0;
  }
  if (value === true) return 1;
  return 0;
}

/**
 * PHP round() uses round-half-away-from-zero. JS Math.round is half-up (toward
 * +Inf), which differs for negatives. Reproduce PHP semantics with a precision
 * scale. (Float artefacts are mitigated by the epsilon nudge PHP's pre-rounding
 * also exhibits; the live goldens validate the exact values used.)
 */
function roundHalfAwayFromZero(value: number, precision: number): number {
  const factor = 10 ** precision;
  const scaled = value * factor;
  // epsilon nudge to counter binary float representation (e.g. 10.945*100 = 1094.4999…)
  const nudged = scaled >= 0 ? scaled + 1e-9 : scaled - 1e-9;
  const rounded = scaled >= 0 ? Math.floor(nudged + 0.5) : Math.ceil(nudged - 0.5);
  return rounded / factor;
}
