import type { ComponentDatum } from '@dedalo/db';
import { ComponentCommon, type ComponentInit } from './component_common.ts';
import { ExportValue, type ExportAtom, type ExportPathSegment } from './export_value.ts';

/**
 * Read-side port of PHP `component_date` (extends component_common). The get_value
 * path is:
 *
 *   get_value() = get_export_value()->to_flat_string()   (inherited from component_common)
 *
 * component_date::get_export_value() (class.component_date.php ~line 266):
 *   1. records_separator = ddo > properties.records_separator > ' | '
 *   2. own segment: fields_separator = records_separator = the resolved separator
 *      (so to_flat_string joins atoms with records_separator, ' | ' by default).
 *   3. data = get_data() — RAW matrix items (NO lang filter; supports_translation
 *      defaults to false for component_date).
 *   4. each item → data_item_to_value(item, date_mode); empty items → ''.
 *
 * date_mode comes from ontology properties.date_mode (default 'date').
 *
 * The actual rendering is data_item_to_value() + dd_date::get_dd_timestamp(), both
 * ported verbatim below. get_dd_timestamp is a pure str_replace over numeric
 * fields — NO locale month names, NO Date object, NO timezone. Negative (BC) years
 * are rendered as-is; sprintf("%04d", year) is reproduced exactly (e.g. -44 → -044,
 * 5 → 0005). Period mode's localized "years/months/days" labels are NOT reproduced
 * here (no live record in a reachable matrix table uses it this phase); see
 * dataItemToValue's 'period' branch for the explicit limitation.
 */
export class ComponentDate extends ComponentCommon {
  // component_date does NOT override supports_translation → false (generic raw data).
  private constructor(init: ComponentInit) {
    super(init);
  }

  static async create(init: ComponentInit): Promise<ComponentDate> {
    const instance = new ComponentDate(init);
    await instance.resolveLang();
    return instance;
  }

  private async getLabel(): Promise<string | null> {
    return this.ontology.getLabel(this.tipo, this.getLang());
  }

  /** records_separator: ddo (none) > properties.records_separator > ' | '. */
  private async getRecordsSeparator(): Promise<string> {
    const properties = await this.ontology.getProperties(this.tipo);
    const sep = properties?.['records_separator'];
    return typeof sep === 'string' ? sep : ' | ';
  }

  /** date_mode: properties.date_mode > 'date' (component_date::$default_date_mode). */
  private async getDateMode(): Promise<string> {
    const properties = await this.ontology.getProperties(this.tipo);
    const mode = properties?.['date_mode'];
    return typeof mode === 'string' && mode !== '' ? mode : 'date';
  }

  /** Port of component_date::get_export_value(). */
  async getExportValue(): Promise<ExportValue> {
    const recordsSeparator = await this.getRecordsSeparator();
    const label = await this.getLabel();
    const dateMode = await this.getDateMode();

    const segment: ExportPathSegment = {
      sectionTipo: this.sectionTipo,
      componentTipo: this.tipo,
      model: 'component_date',
      // PHP sets both fields_separator and records_separator to records_separator,
      // so to_flat_string's leaf join uses records_separator.
      fieldsSeparator: recordsSeparator,
      recordsSeparator,
      itemIndex: null,
    };
    const path = [segment];

    const exportValue = new ExportValue(label, 'component_date');

    const data = await this.getData();
    if (data === null || data.length === 0) {
      return exportValue;
    }

    let valueIndex = 0;
    for (const item of data) {
      // PHP: empty($current_data) ? '' : data_item_to_value(...). empty() is true
      // for null / {} (no keys). A populated item object is non-empty.
      const itemValue = isPhpEmptyItem(item) ? '' : dataItemToValue(item, dateMode);
      const atom: ExportAtom = {
        path,
        value: itemValue,
        valueIndex: valueIndex++,
        lang: '',
        isFallback: false,
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
   * Resolve the `entries` array for the component_date JSON CONTROLLER data item
   * (component_date_json.php), reproducing its mode switch:
   *   - 'list' / 'tm' / 'edit' (default): get_data_lang().
   *
   * component_date is always NON-translatable, so get_data_lang() returns the RAW
   * matrix datum (the structured date objects {id,start,end?,period?,...}) verbatim,
   * or null when the component has no data. UNLIKE component_json / geolocation, the
   * date controller does NOT call get_list_value() for the list modes — it uses
   * get_data_lang() uniformly — so the list-mode null-collapse does not apply here
   * (an absent component already yields null via getData's []→null collapse).
   *
   * The controller appends NO trailing field to the base get_data_item (no
   * parent_tipo / parent_section_id / fallback_value); the optional `counter` is
   * emitted ONLY when has_dataframe is true (DECLINED by the element builder).
   */
  async resolveDataEntries(mode: string): Promise<{ entries: ComponentDatum[] | null }> {
    if (mode === 'search') {
      // component_date has no 'search' value branch in its controller, but the
      // build walk never reaches search mode for a list render; mirror the
      // generic empty for safety.
      return { entries: await this.getDataLang() };
    }
    // list / tm / edit → get_data_lang() (raw datum; null when absent).
    return { entries: await this.getDataLang() };
  }
}

/** A single date sub-object ({year,month,day,hour,minute,second,...}). */
interface DdDateLike {
  year?: unknown;
  month?: unknown;
  day?: unknown;
  hour?: unknown;
  minute?: unknown;
  second?: unknown;
  ms?: unknown;
  [k: string]: unknown;
}

/**
 * PHP empty() applied to a data item in get_export_value's loop. An item is empty
 * when it is null/undefined or an object with no own keys ({} → empty in PHP).
 */
function isPhpEmptyItem(item: ComponentDatum | null | undefined): boolean {
  if (item === null || item === undefined) return true;
  if (typeof item !== 'object') return true;
  return Object.keys(item).length === 0;
}

/** Whether a value is a plain object (PHP is_object after json_decode). */
function isObject(v: unknown): v is DdDateLike {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Port of component_date::data_item_to_value($data_item, $date_mode, $sep='/').
 * Dispatches on date_mode and renders via getDdTimestamp (the dd_date formatter).
 */
export function dataItemToValue(
  dataItem: Record<string, unknown>,
  dateMode: string,
  sep = '/',
): string {
  switch (dateMode) {
    case 'range':
      return renderRange(dataItem, sep);
    case 'time_range':
      return renderTimeRange(dataItem);
    case 'period':
      return renderPeriod(dataItem);
    case 'time':
      return renderTime(dataItem);
    case 'datetime': // deprecated alias; PHP logs then falls through to date_time
    case 'date_time':
      return renderDateTime(dataItem, sep);
    case 'date':
    default:
      return renderDate(dataItem, sep);
  }
}

/** 'date'/default: Y/m/d with graceful degradation to Y/m or Y for partial dates. */
function renderDate(dataItem: Record<string, unknown>, sep: string): string {
  const obj = isObject(dataItem['start']) ? dataItem['start'] : dataItem;
  if (!isObject(obj)) return '';
  return renderYmdPartial(obj, sep);
}

/** Shared Y/m[/d] partial rendering used by 'date' and each end of 'range'. */
function renderYmdPartial(obj: DdDateLike, sep: string): string {
  if (obj['day'] !== undefined && obj['day'] !== null) {
    return getDdTimestamp(obj, `Y${sep}m${sep}d`, true);
  }
  if (obj['month'] !== undefined && obj['month'] !== null) {
    return getDdTimestamp(obj, `Y${sep}m`, true);
  }
  return getDdTimestamp(obj, 'Y', false);
}

/** 'range': "start <> end" (each end via renderYmdPartial); ends optional. */
function renderRange(dataItem: Record<string, unknown>, sep: string): string {
  let out = '';
  const start = dataItem['start'];
  if (isObject(start)) {
    out += renderYmdPartial(start, sep);
  }
  const end = dataItem['end'];
  if (isObject(end)) {
    out += ' <> ' + renderYmdPartial(end, sep);
  }
  return out;
}

/** 'time_range': "HH:MM:SS <> HH:MM:SS" (padding=true). */
function renderTimeRange(dataItem: Record<string, unknown>): string {
  let out = '';
  const start = dataItem['start'];
  if (isObject(start)) {
    out += getDdTimestamp(start, 'H:i:s', true);
  }
  const end = dataItem['end'];
  if (isObject(end)) {
    out += ' <> ' + getDdTimestamp(end, 'H:i:s', true);
  }
  return out;
}

/** 'time': reads start if present else the root; "HH:MM:SS" (padding=true). */
function renderTime(dataItem: Record<string, unknown>): string {
  const obj = isObject(dataItem['start']) ? dataItem['start'] : dataItem;
  if (!isObject(obj)) return '';
  return getDdTimestamp(obj, 'H:i:s', true);
}

/** 'date_time'/'datetime': "Y/m/d HH:MM:SS" (padding=true). */
function renderDateTime(dataItem: Record<string, unknown>, sep: string): string {
  const obj = isObject(dataItem['start']) ? dataItem['start'] : dataItem;
  if (!isObject(obj)) return '';
  return getDdTimestamp(obj, `Y${sep}m${sep}d H:i:s`, true);
}

/**
 * 'period': "<n> years <n> months <n> days" with localized labels.
 *
 * (!) NOT fully ported this phase: PHP renders the unit labels via
 * label::get_label('years'|'months'|'days'), which depends on the install's
 * structure-lang label store (no get_label port exists yet, and no live record in
 * a matrix-table-resolvable section uses date_mode 'period' — the only period data
 * lives in matrix_users, which resolveMatrixTable defers). To keep a divergence
 * loud rather than silent, this throws. Unit tests cover the numeric assembly via
 * an injected label resolver (renderPeriodWith). Wire a real get_label here when
 * the label store is ported.
 */
function renderPeriod(dataItem: Record<string, unknown>): string {
  const period = dataItem['period'];
  if (!isObject(period)) return '';
  throw new Error(
    "component_date date_mode 'period' is not ported this phase (requires the " +
      'label::get_label localized unit labels). See component_date.ts renderPeriod.',
  );
}

/**
 * Pure, label-injected port of the 'period' assembly, for unit testing and for a
 * future wiring once a get_label port exists. Mirrors PHP exactly: each unit is
 * "<value> <label>" when the field is present (non-null), else ''. The three parts
 * are imploded with a single space.
 */
export function renderPeriodWith(
  dataItem: Record<string, unknown>,
  labels: { years: string; months: string; days: string },
): string {
  const period = dataItem['period'];
  if (!isObject(period)) return '';
  const year = getField(period, 'year');
  const month = getField(period, 'month');
  const day = getField(period, 'day');
  const parts = [
    year !== null ? `${year} ${labels.years}` : '',
    month !== null ? `${month} ${labels.months}` : '',
    day !== null ? `${day} ${labels.days}` : '',
  ];
  return parts.join(' ');
}

/** dd_date::get_<field>() semantics: present → (int)value, absent/null → null. */
function getField(obj: DdDateLike, key: string): number | null {
  const v = obj[key];
  if (v === undefined || v === null) return null;
  return toInt(v);
}

/**
 * Port of dd_date::get_dd_timestamp($format, $padding=true).
 *
 * dd_date construction: each present, non-null field is stored as (int)$value
 * (set_year/month/day/hour/minute/second). `format`, `time`, `ms` are special:
 * `format` is ignored; `time` is the sort value (not used by formatting); `ms`
 * feeds the 'u' token. Missing year → '' (renders empty before padding); missing
 * month/day/hour/minute/second → 0. Negative wrong values (<1, !==0) are fixed to
 * 0 with a debug_log (reproduced silently here).
 *
 * Padding (true): Y → sprintf("%04d"), m/d/H/i/s → sprintf("%02d"), u → "%03d".
 * Padding (false): raw integer string (year-only mode).
 *
 * Final value = str_replace(['Y','m','d','H','i','s','u'], [values], format).
 */
export function getDdTimestamp(
  obj: DdDateLike,
  format: string,
  padding = true,
): string {
  // year: present → (int); absent → '' (PHP: $this->year ?? '').
  const yearRaw = obj['year'];
  const hasYear = yearRaw !== undefined && yearRaw !== null;
  let year: string;
  if (hasYear) {
    const y = toInt(yearRaw);
    year = padding ? sprintf04d(y) : String(y);
  } else {
    // PHP: '' then sprintf("%04d", '') === '0000' when padding, else ''.
    year = padding ? '0000' : '';
  }

  const month = fixAndPad(obj['month'], padding);
  const day = fixAndPad(obj['day'], padding);
  const hour = fixAndPad(obj['hour'], padding);
  const minute = fixAndPad(obj['minute'], padding);
  const second = fixAndPad(obj['second'], padding);

  // ms: null unless data has ms; padded to %03d only when present AND padding.
  const msRaw = obj['ms'];
  let ms = '';
  if (msRaw !== undefined && msRaw !== null) {
    const m = toInt(msRaw);
    ms = padding ? sprintf03d(m) : String(m);
  }

  // str_replace over the literal tokens, single pass left-to-right (PHP behaviour).
  return strReplaceTokens(format, {
    Y: year,
    m: month,
    d: day,
    H: hour,
    i: minute,
    s: second,
    u: ms,
  });
}

/**
 * Reproduce one numeric sub-field's value in get_dd_timestamp: default 0 when
 * absent; "fix negative wrong value" (value !== 0 && (int)value < 1 → 0); then
 * pad to %02d when padding, else raw integer string.
 */
function fixAndPad(raw: unknown, padding: boolean): string {
  let v = raw === undefined || raw === null ? 0 : toInt(raw);
  if (v !== 0 && v < 1) {
    v = 0; // PHP debug_log + fix-to-0
  }
  return padding ? sprintf02d(v) : String(v);
}

/** PHP (int) cast: truncate toward zero; numeric strings parsed; non-numeric → 0. */
function toInt(value: unknown): number {
  if (typeof value === 'number') return Math.trunc(value);
  if (typeof value === 'string') {
    // PHP (int)"12abc" === 12, (int)"abc" === 0, (int)"-5" === -5.
    const m = value.trim().match(/^[+-]?\d+/);
    return m ? Number.parseInt(m[0], 10) : 0;
  }
  if (value === true) return 1;
  return 0;
}

/** sprintf("%04d", n): zero-pad the magnitude to >=4 digits, sign outside. */
function sprintf04d(n: number): string {
  return sprintfPad(n, 4);
}
function sprintf02d(n: number): string {
  return sprintfPad(n, 2);
}
function sprintf03d(n: number): string {
  return sprintfPad(n, 3);
}

/**
 * PHP sprintf("%0Nd", n): the sign is printed, then the DIGITS are left-padded
 * with zeros so the total field width (including sign) is at least N. e.g.
 * sprintf("%04d", -44) === "-044", sprintf("%04d", 2011) === "2011",
 * sprintf("%02d", 7) === "07", sprintf("%04d", -2011) === "-2011".
 */
function sprintfPad(n: number, width: number): string {
  const neg = n < 0;
  const digits = String(Math.abs(n));
  const signLen = neg ? 1 : 0;
  const padCount = Math.max(0, width - signLen - digits.length);
  return (neg ? '-' : '') + '0'.repeat(padCount) + digits;
}

/**
 * PHP str_replace(array $search, array $replace, $subject): replaces each search
 * token with its replacement, sequentially in array order. Because the date
 * tokens (Y,m,d,H,i,s,u) never appear inside the numeric replacement strings, a
 * single global pass per token is faithful and order-independent here.
 */
function strReplaceTokens(format: string, map: Record<string, string>): string {
  let out = format;
  for (const token of ['Y', 'm', 'd', 'H', 'i', 's', 'u']) {
    out = out.split(token).join(map[token] ?? '');
  }
  return out;
}
