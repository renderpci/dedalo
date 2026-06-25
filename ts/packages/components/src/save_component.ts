/**
 * Port of the dd_core_api `save` action for a single-component value mutation on an
 * EXISTING matrix row — GENERALIZED beyond the first input_text/update case.
 *
 * MODELS supported (the data column + the save-time value transform, both verified
 * against PHP — see the per-model notes below):
 *   - component_input_text → `string` column. No save-time transform (value verbatim).
 *   - component_text_area  → `string` column. PHP component_text_area::save runs
 *     component_string_common::sanitize_text on each value. We PORT the byte-stable
 *     subset (stripslashes + trim) and GATE OUT (decline) any value the denylist
 *     regex would touch (markup `<`, a backslash, an `on…=` handler, a dangerous
 *     URL scheme) so we never risk a PCRE-vs-JS regex divergence — see isPlainText.
 *   - component_number     → `number` column. PHP component_number::set_format_form_type
 *     casts/rounds each numeric value at save (int cast, or float round-to-precision
 *     with the string-no-separator→int pre-step), reading properties.type/precision.
 *     PORTED (formatNumberValue). Nolan, NOT translatable.
 *   - component_date       → `date` column. PHP component_date::save runs add_time on
 *     each item: it rebuilds each dd_date container (start/end/period or a root-hour
 *     bare date) keeping only the non-null {day,month,year,hour,minute,second} leaves
 *     and recomputing `time` = convert_date_to_seconds (the same virtual-372-day math
 *     the dd201 audit stamp uses). PORTED (applyAddTime). Nolan, NOT translatable.
 *
 * ACTIONS supported (the in-memory array mutation, update_data_value):
 *   - update : locate the item by id in the effective-lang slice, REPLACE its value
 *     (id preserved). The found-by-id replace path only (append/wipe declined).
 *   - insert : append the value (or, for a MONOVALUE model — text_area — REPLACE the
 *     whole slice). The new item's id is allocated from the row's per-component
 *     counter (meta.<tipo>[0].count): id = base+1 where base = max(persisted count,0);
 *     the meta counter is written back as part of the matrix UPDATE (a 4th key). When
 *     the client value ALREADY carries a non-empty id, PHP keeps it (no allocation) —
 *     we keep it too and (via the array max) raise the counter to absorb it.
 *   - remove : rebuild the effective-lang slice skipping the matching id; when the
 *     slice empties, the column key is DELETED (jsonb_set_lax 'delete_key', PHP's
 *     set_data([]) → null path). id-not-found → declined (PHP returns false there).
 *
 * The audit pair (dd201 modified_date + dd197 modified_by_user), the time-machine
 * snapshot and the activity 'SAVE' row are MODEL- and ACTION-INDEPENDENT — reused
 * verbatim from the input_text path (SaveSideEffectsDbManager).
 *
 * PHP order (component_common::save): matrix UPDATE → time-machine → activity.
 *
 * DECLINED precisely (UnsupportedSave → the caller proxies to PHP):
 *   - any other model/type; translatable components (writing one lang slice as the
 *     whole column would drop other-lang items + the cross-lang id-sync/remove-all-
 *     langs paths are not ported); has_dataframe / dataframe_ddo (the id_key cascade);
 *     sort_data / add_new_element / set_data actions; more than one changed_data item;
 *     a non-existing row; no logged user; insufficient permission; a text_area value
 *     the sanitize denylist would mutate; a component_date item shape outside the
 *     start/end/period/root-hour modes.
 */

import type { Db, DbSession, MatrixKeyUpdate, ComponentDatum } from '@dedalo/db';
import { MatrixDbManager, SaveSideEffectsDbManager } from '@dedalo/db';
import type { MatrixFamily } from '@dedalo/db';
import type { OntologyRepository } from '@dedalo/ontology';
import type { LangConfig } from './lang_config.ts';
import {
  buildInputTextElement,
  type BuildInputTextElementOptions,
} from './input_text_element.ts';
import { buildDataElement, type DataElementModel } from './component_data_element.ts';
import {
  buildSelectElement,
  UnsupportedSelect,
  type BuildSelectElementOptions,
} from './select_element.ts';
import { resolveMatrixTable } from './matrix_table.ts';

/** The fixed audit-stamp tipos (PHP section::get_metadata_definition). */
const MODIFIED_BY_USER_TIPO = 'dd197'; // relation column
const MODIFIED_DATE_TIPO = 'dd201'; // date column
const DEDALO_SECTION_USERS_TIPO = 'dd128';
const DEDALO_RELATION_TYPE_LINK = 'dd151';
const DEDALO_DATA_NOLAN = 'lg-nolan';
/** DEDALO_RELATION_TYPE_DATAFRAME — the positive frame-pairing marker (dd_tipos.php). */
const DEDALO_RELATION_TYPE_DATAFRAME = 'dd490';

/**
 * The models this save path supports → their matrix data family column.
 *
 * RELATION FAMILY (component_select): the dato lives in the 'relation' column as an
 * array of LOCATORS ({type, section_id, section_tipo, from_component_tipo, id, …}).
 * The empirical live capture (see the inverse-ref note below) proves a relation save
 * through dd_core_api mutates ONLY the source row — NO inverse locator is written to
 * the target. So a select save is the SAME single-row path as a literal: mutate the
 * relation slice, allocate the locator id from the meta.<tipo> counter, re-stamp the
 * audit pair, write the source TM + activity. No second-row mutation.
 *
 * (!) INVERSE-REF NOTE: the task brief assumed a relation save writes the paired
 * inverse onto the target. It does NOT on this API path. component_relation_common
 * has no save() override; component_common::save() only cross-touches a record via
 * propagate_to_observers(), a NO-OP unless properties.observers is set (plain
 * selects/relations have empty properties). component_relation_related's "inverse" is
 * a READ-time computation (get_data_with_references), never persisted;
 * component_relation_parent/children inverse (the tree pairing) is maintained ONLY by
 * dd_ts_api (add_child/update_parent_data), never by a generic dd_core_api save.
 * Proven byte-identical target row before/after a live select insert + remove.
 */
const MODEL_COLUMN: Record<string, MatrixFamily> = {
  component_input_text: 'string',
  component_text_area: 'string',
  component_number: 'number',
  component_date: 'date',
  component_select: 'relation',
};

/** Models whose dato is a RELATION-column array of locators (validate defaults apply). */
const RELATION_MODELS = new Set<string>(['component_select']);

/**
 * PHP component_common::$components_monovalue subset relevant here (insert REPLACES the
 * whole slice). component_select IS monovalue (only one selection), so an insert
 * replaces any prior locator (verified live: the prior dd1037 locator was replaced).
 */
const MONOVALUE_MODELS = new Set<string>(['component_text_area', 'component_select']);

/**
 * The dd_date container leaves dd_date::jsonSerialize keeps (non-null only), in the
 * dd_date PROPERTY DECLARATION ORDER (get_object_vars): day, month, year, time, hour,
 * minute, second. This is the byte-significant key order PHP emits for a date item in
 * the save response (component_date::save reconstructs every item as a dd_date).
 */
const DD_DATE_LEAVES = ['day', 'month', 'year', 'time', 'hour', 'minute', 'second'] as const;

/** A changed_data item from the save RQO. `value` shape varies by model+action. */
export interface ChangedDataItem {
  action: string;
  key?: number;
  id?: number | string | null;
  /** update/insert: the data-item (object), or null for remove. */
  value?: unknown;
}
/** Back-compat alias (the original input_text-only name). */
export type ChangedDataUpdate = ChangedDataItem;

/** The save RQO source block for a component save. */
export interface SaveSource {
  type: string;
  model: string;
  tipo: string;
  section_tipo: string;
  section_id: number | string;
  mode?: string;
  lang?: string;
}

export interface SaveComponentRequest {
  source: SaveSource;
  changedData: ChangedDataItem[];
}
/** Back-compat alias. */
export type SaveInputTextRequest = SaveComponentRequest;

/** Session info needed to stamp the audit metadata + gate permissions. */
export interface SaveSessionInfo {
  /** The logged user's id (logged_user_id()): the modified_by_user locator section_id. */
  userId: number | null;
  /** Global-admin / root → permission 3 (write). */
  isGlobalAdmin: boolean;
  /** The request source IP (PHP $_SERVER['REMOTE_ADDR']) for the activity row. */
  ip?: string;
}

export interface SaveComponentOptions {
  db: Db;
  ontology: OntologyRepository;
  langConfig: LangConfig;
  matrix: BuildInputTextElementOptions['matrix'];
  /** Context-half deps for the response element. */
  context: BuildInputTextElementOptions['context'];
  session: SaveSessionInfo;
  /**
   * DEDALO_STRUCTURE_LANG — needed ONLY to build the component_select EDIT response
   * element (the relation request_config context terms). Absent for the literal path.
   */
  structureLang?: string;
  /**
   * Enumerate the select's target-section rows (the search behind get_list_of_values
   * — the select EDIT response `datalist`). Required ONLY for a component_select save;
   * absent → the select response element declines (the save gate requires it present).
   */
  datalistRecordSearch?: BuildSelectElementOptions['datalistRecordSearch'];
}
/** Back-compat alias. */
export type SaveInputTextOptions = SaveComponentOptions;

export interface SaveResult {
  result: unknown;
  msg: string;
  errors: string[];
}

/** Thrown for an input the save path declines (caller should proxy). */
export class UnsupportedSave extends Error {}

/**
 * Build the modified_date (dd201) date item — component_date::get_date_now():
 * { start: {year,month,day,hour,minute,second,time}, id:1, lang:'lg-nolan' }. `time`
 * is convert_date_to_seconds (virtual 372-day years, 31-day months, the month/day -1
 * adjustments). The leaf VALUES are reproduced exactly; the volatile clock leaves
 * differ legitimately per run (the harness normalizes them).
 */
function buildModifiedDateItem(now: Date): ComponentDatum {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const second = now.getSeconds();
  const time = convertDateToSeconds({ year, month, day, hour, minute, second });
  const start = { year, month, day, hour, minute, second, time };
  return { start, id: 1, lang: DEDALO_DATA_NOLAN } as unknown as ComponentDatum;
}

/**
 * Port of dd_date::convert_date_to_seconds (core/common/class.dd_date.php). The
 * absolute-seconds sort value: virtual 372-day years / 31-day months, with month/day
 * decremented by 1 ONLY when non-zero, every leaf clamped to >= 0, null → 0.
 */
function convertDateToSeconds(leaves: {
  year?: number | null | undefined;
  month?: number | null | undefined;
  day?: number | null | undefined;
  hour?: number | null | undefined;
  minute?: number | null | undefined;
  second?: number | null | undefined;
}): number {
  const year = leaves.year ?? 0;
  let month = leaves.month ?? 0;
  let day = leaves.day ?? 0;
  let hour = leaves.hour ?? 0;
  let minute = leaves.minute ?? 0;
  let second = leaves.second ?? 0;
  if (month) month = month - 1;
  if (day) day = day - 1;
  month = month >= 0 ? month : 0;
  day = day >= 0 ? day : 0;
  hour = hour >= 0 ? hour : 0;
  minute = minute >= 0 ? minute : 0;
  second = second >= 0 ? second : 0;
  return (
    year * 372 * 24 * 60 * 60 +
    month * 31 * 24 * 60 * 60 +
    day * 24 * 60 * 60 +
    hour * 60 * 60 +
    minute * 60 +
    second
  );
}

/**
 * Build the modified_by_user (dd197) relation locator item — build_modification_data:
 * { id:1, type:'dd151', section_id:<user>, section_tipo:'dd128', from_component_tipo:'dd197' }.
 */
function buildModifiedByUserItem(userId: number): ComponentDatum {
  return {
    id: 1,
    type: DEDALO_RELATION_TYPE_LINK,
    section_id: String(userId),
    section_tipo: DEDALO_SECTION_USERS_TIPO,
    from_component_tipo: MODIFIED_BY_USER_TIPO,
  } as unknown as ComponentDatum;
}

/** Normalize a changed_data id (numeric string → int; else verbatim or null). */
function normalizeId(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isInteger(raw) ? raw : null;
  const s = raw.trim();
  if (s === '' || Number.isNaN(Number(s))) return null;
  return Number.parseInt(s, 10);
}

/** True when a text_area value is byte-stable through PHP sanitize_text (only trim/stripslashes). */
function isPlainText(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  // The sanitize denylist only touches markup tags, on*= handlers, dangerous URL
  // schemes, and stripslashes (backslashes). A value with none of these is unchanged
  // except for trim() — which we apply. Decline anything that could be mutated.
  if (value.includes('<') || value.includes('\\')) return false;
  return true;
}

/**
 * The save-time value transform per model (PHP component_<model>::save / set_data).
 * Mutates the item's `value`/containers in place on a SHALLOW CLONE; returns the new
 * item (or throws UnsupportedSave for a declined shape). The id/lang/other keys pass
 * through untouched (PHP set_data keeps them).
 */
function transformItemForModel(
  model: string,
  rawItem: unknown,
  numberProps: { type?: unknown; precision?: unknown } | null,
  relationCtx: RelationContext | null,
): ComponentDatum {
  if (rawItem === null || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
    throw new UnsupportedSave(`save value must be a data-item object (model ${model})`);
  }
  const item = { ...(rawItem as Record<string, unknown>) };

  if (model === 'component_input_text') {
    return item as ComponentDatum; // verbatim
  }

  if (model === 'component_text_area') {
    // sanitize_text byte-stable subset: stripslashes(none — gated) + trim. Gate first.
    if (!isPlainText(item.value)) {
      throw new UnsupportedSave(
        'component_text_area value carries markup/backslash the sanitize denylist would mutate — declined',
      );
    }
    item.value = (item.value as string).trim();
    return item as ComponentDatum;
  }

  if (model === 'component_number') {
    item.value = formatNumberValue(item.value, numberProps);
    return item as ComponentDatum;
  }

  if (model === 'component_date') {
    return applyAddTime(item) as ComponentDatum;
  }

  if (model === 'component_select') {
    if (relationCtx === null) {
      throw new UnsupportedSave(`${model} save requires the relation context`);
    }
    return transformRelationLocator(item, model, relationCtx);
  }

  throw new UnsupportedSave(`unsupported save model ${model}`);
}

/** The source record + component identity a relation save normalizes its locator against. */
interface RelationContext {
  /** The component tipo (forced as the locator's from_component_tipo). */
  tipo: string;
  /** The source record's section_tipo (autoreference guard). */
  sectionTipo: string;
  /** The source record's section_id (autoreference guard). */
  sectionId: number;
}

/**
 * Port of component_relation_common::validate_data_element's locator-normalization
 * for a SAVE value (the byte-significant part). The stored/echoed locator is the
 * client value's keys IN CLIENT ORDER plus the appended defaults — the `new locator()`
 * constructor preserves the input object's key iteration order, and the appended keys
 * (type, from_component_tipo) land AFTER the client keys; the item `id` is appended
 * LAST by set_data_item_counter (handled in applyMutation).
 *
 * What we reproduce (the subset every real select save exercises):
 *   - section_id / section_tipo MANDATORY (bad-formed locator → declined, PHP returns
 *     false and the locator is dropped — out of the byte-stable scope).
 *   - autoreference guard: a locator pointing at the OWN record is dropped by PHP
 *     (avoid infinite loop) → declined here (the resulting empty set diverges).
 *   - type default = the relation type (DEDALO_RELATION_TYPE_LINK 'dd151' for select —
 *     config_relation.relation_type override is declined upstream by the gate).
 *   - from_component_tipo forced to the component tipo (PHP overwrites a mismatch).
 *   - paginated_key dropped.
 * Translatable relations (lang on each locator) are declined upstream (select is
 * nolan). type_rel (component_relation_related only) is not reached here (select).
 */
function transformRelationLocator(
  item: Record<string, unknown>,
  model: string,
  ctx: RelationContext,
): ComponentDatum {
  const out = { ...item };
  // drop paginated_key (validate_data_element unset).
  delete out.paginated_key;
  // section_id / section_tipo MANDATORY (PHP drops a bad-formed locator → divergent set).
  if (
    out.section_id === undefined ||
    out.section_id === null ||
    out.section_tipo === undefined ||
    out.section_tipo === null ||
    out.section_tipo === ''
  ) {
    throw new UnsupportedSave(`${model} save locator missing section_id/section_tipo — declined`);
  }
  // autoreference guard: PHP drops a locator pointing at the OWN record (avoid infinite
  // loop) → the resulting set diverges from the requested one. Decline.
  if (
    out.section_tipo === ctx.sectionTipo &&
    String(out.section_id) === String(ctx.sectionId)
  ) {
    throw new UnsupportedSave(`${model} save autoreference locator (own record) — declined`);
  }
  // type default — the client always sends 'dd151'; if absent, the relation type
  // default (select → 'dd151') is appended after the client keys.
  if (out.type === undefined || out.type === null || out.type === '') {
    out.type = DEDALO_RELATION_TYPE_LINK;
  }
  // from_component_tipo forced to the component tipo (PHP overwrites a mismatch). When
  // absent it is appended after the client keys; a matching value is left in place
  // (preserving the client key order — the byte-significant order).
  if (out.from_component_tipo !== ctx.tipo) {
    out.from_component_tipo = ctx.tipo;
  }
  return out as ComponentDatum;
}

/**
 * Port of component_number::set_format_form_type. empty (but not 0) → null; type
 * 'int' → int cast; float/default → string-no-separator pre-cast to int, then
 * round(value, precision) (precision default 2). Mirrors the PHP numeric coercion.
 */
function formatNumberValue(
  value: unknown,
  props: { type?: unknown; precision?: unknown } | null,
): number | null {
  // empty($value) && $value!==0 → null. PHP empty(): null/''/'0'/0/false/[].
  if (value === null || value === undefined || value === '' || value === false) return null;
  if (value === 0 || value === '0') {
    // 0 is NOT dropped (the && $value!==0 carve-out keeps numeric zero). '0' is empty
    // in PHP but $value!=='0' loosely; PHP's empty('0') is true AND '0'!==0 (strict)
    // is true → empty('0') && '0'!==0 → returns null. So string '0' → null.
    if (value === '0') return null;
  }
  const type = props?.type;
  if (type === 'int') {
    return phpIntCast(value);
  }
  // float / default
  let v: number | string = value as number | string;
  if (typeof v === 'string' && !v.includes(',') && !v.includes('.')) {
    v = phpIntCast(v);
  }
  if (typeof v !== 'number') {
    v = phpIntCast(v);
  }
  const precision = typeof props?.precision === 'number' ? props.precision : 2;
  return roundHalfAwayFromZero(v, precision);
}

/** PHP (int) cast of a numeric-ish value: leading-number parse, truncated toward zero. */
function phpIntCast(value: unknown): number {
  if (typeof value === 'number') return Math.trunc(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  const m = String(value).trim().match(/^[+-]?\d+/);
  return m ? Math.trunc(Number(m[0])) : 0;
}

/** PHP round(): half away from zero, to `precision` decimals. */
function roundHalfAwayFromZero(value: number, precision: number): number {
  const f = 10 ** precision;
  const r = Math.round(Math.abs(value) * f) / f;
  return value < 0 ? -r : r;
}

/**
 * Port of component_date::add_time → build_dd_date_with_time over each container.
 * Detects the mode by which key is present (period | start[+end] | root-hour) and
 * rebuilds each dd_date container keeping ONLY the non-null leaves dd_date emits,
 * recomputing `time`. Any other shape is left untouched (PHP returns it as-is); but a
 * container with keys outside the known leaves is declined (we would not reproduce
 * the dd_date __construct key-dropping for unknown keys).
 */
function applyAddTime(item: Record<string, unknown>): Record<string, unknown> {
  const out = { ...item };
  if (out.period !== undefined && out.period !== null) {
    out.period = rebuildDdDate(out.period);
    return out;
  }
  if (out.start !== undefined && out.start !== null) {
    out.start = rebuildDdDate(out.start);
    if (out.end !== undefined && out.end !== null) {
      out.end = rebuildDdDate(out.end);
    }
    return out;
  }
  if (out.hour !== undefined && out.hour !== null) {
    // Root-hour bare-date mode: the whole item IS the dd_date. Preserve id/lang.
    const { id, lang, ...rest } = out as { id?: unknown; lang?: unknown } & Record<string, unknown>;
    const rebuilt = rebuildDdDate(rest);
    const result: Record<string, unknown> = { ...rebuilt };
    if (id !== undefined) result.id = id;
    if (lang !== undefined) result.lang = lang;
    return result;
  }
  // No recognized date container → leave untouched (PHP add_time returns it as-is).
  return out;
}

/**
 * Rebuild a single dd_date container exactly as PHP `new dd_date($src)` +
 * jsonSerialize would: keep only the recognized leaves that are non-null, recompute
 * `time` from convert_date_to_seconds. PHP drops the `format` key + any unknown key
 * (logged); we DECLINE an unknown key so we never silently drop a leaf PHP keeps.
 */
function rebuildDdDate(container: unknown): Record<string, number> {
  if (container === null || typeof container !== 'object' || Array.isArray(container)) {
    throw new UnsupportedSave('component_date container must be an object');
  }
  const src = container as Record<string, unknown>;
  const leafSet = new Set<string>(DD_DATE_LEAVES);
  const leaves: Record<string, number> = {};
  for (const [k, v] of Object.entries(src)) {
    if (k === 'format') continue; // PHP skips 'format'
    if (!leafSet.has(k)) {
      throw new UnsupportedSave(`component_date container key '${k}' outside known dd_date leaves — declined`);
    }
    if (v === null || v === undefined) continue; // dd_date skips null (jsonSerialize)
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isNaN(n)) {
      throw new UnsupportedSave(`component_date leaf '${k}' is not numeric — declined`);
    }
    leaves[k] = n;
  }
  // Recompute time (server always wins). Emit the present non-null leaves + the
  // recomputed `time` in dd_date DECLARATION order (day,month,year,time,hour,minute,
  // second) — the byte-significant order jsonSerialize produces. `time` is always
  // present (set_time), so it is emitted even when the source had no time leaf.
  const computedTime = convertDateToSeconds({
    year: leaves.year,
    month: leaves.month,
    day: leaves.day,
    hour: leaves.hour,
    minute: leaves.minute,
    second: leaves.second,
  });
  const out: Record<string, number> = {};
  for (const k of DD_DATE_LEAVES) {
    if (k === 'time') {
      out.time = computedTime;
    } else if (Object.prototype.hasOwnProperty.call(leaves, k)) {
      out[k] = leaves[k]!;
    }
  }
  return out;
}

/** Read the per-component counter (meta.<tipo>[0].count), default 0. */
async function readComponentCounter(
  matrix: SaveComponentOptions['matrix'],
  table: string,
  sectionTipo: string,
  sectionId: number,
  tipo: string,
): Promise<number> {
  const metaItems = await matrix.getComponentData(table, sectionTipo, sectionId, 'meta', tipo);
  const first = metaItems && metaItems.length > 0 ? metaItems[0] : null;
  const count = first && typeof first === 'object' ? (first as { count?: unknown }).count : null;
  return typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : 0;
}

/**
 * Apply the changed_data mutation to the effective-lang slice. Returns the new slice
 * AND, for insert, the new meta counter (when an id was allocated/absorbed). Mirrors
 * update_data_value's update/insert/remove branches for the supported (non-dataframe,
 * non-translatable) case.
 */
interface MutationResult {
  entries: ComponentDatum[];
  /** insert only: the new meta.<tipo> counter value (null → no meta write). */
  newCounter: number | null;
}

function applyMutation(
  model: string,
  current: ComponentDatum[],
  change: ChangedDataItem,
  transformedValue: ComponentDatum | null,
  currentCounter: number,
): MutationResult {
  const next = current.slice();

  if (change.action === 'update') {
    const id = normalizeId(change.id);
    if (id === null) {
      throw new UnsupportedSave('update without a numeric id is not ported (append path declined)');
    }
    if (transformedValue === null) {
      throw new UnsupportedSave('update requires a value');
    }
    let found = false;
    for (let i = 0; i < next.length; i++) {
      const it = next[i];
      if (it !== null && typeof it === 'object' && (it as ComponentDatum).id === id) {
        const v = { ...transformedValue };
        if (v.id === undefined) v.id = id;
        next[i] = v;
        found = true;
        break;
      }
    }
    if (!found) {
      throw new UnsupportedSave(`update target id ${id} not found (append path not ported)`);
    }
    return { entries: next, newCounter: null };
  }

  if (change.action === 'insert') {
    if (transformedValue === null) {
      throw new UnsupportedSave('insert requires a value');
    }
    const v = { ...transformedValue };
    // id: keep a non-empty client id; else allocate base+1 (base = current counter).
    const clientId = v.id;
    const hasId = clientId !== undefined && clientId !== null && (clientId as unknown) !== '';
    let counter = currentCounter;
    if (!hasId) {
      counter = currentCounter + 1;
      v.id = counter;
    } else {
      // PHP set_data raises the counter to absorb an explicit id above it.
      const numericId = normalizeId(clientId as number | string);
      if (numericId !== null && numericId > counter) counter = numericId;
    }
    // monovalue → replace whole slice; else append.
    const entries = MONOVALUE_MODELS.has(model) ? [v] : [...next, v];
    return { entries, newCounter: counter };
  }

  if (change.action === 'remove') {
    const id = normalizeId(change.id);
    if (id === null) {
      // PHP id===null → remove ALL (set_data([])). Out of scope (clears every lang).
      throw new UnsupportedSave('remove without an id (remove-all) is not ported');
    }
    let found = false;
    const entries: ComponentDatum[] = [];
    for (const it of next) {
      if (it !== null && typeof it === 'object' && (it as ComponentDatum).id === id) {
        found = true;
        continue;
      }
      entries.push(it);
    }
    if (!found) {
      throw new UnsupportedSave(`remove target id ${id} not found (PHP returns false)`);
    }
    return { entries, newCounter: null };
  }

  throw new UnsupportedSave(`unsupported changed_data action '${change.action}'`);
}

/**
 * ── TRANSLATABLE branch ──────────────────────────────────────────────────────
 *
 * A translatable literal component (input_text / text_area, supports_translation
 * = true, NOT a relation) stores ALL languages in ONE `string.<tipo>` array,
 * each item `{id, lang, value}`. A single LOGICAL item shares the SAME `id`
 * across every language (live evidence: numisdata6/562 numisdata16 = 10 lang
 * slices all `id:1`, meta.count=1). The crux this port reproduces is the
 * CROSS-LANG id-sync (PHP component_common::update_data_value + set_data_lang +
 * get_id_from_key + set_data counter).
 *
 * Result of a translatable mutation:
 *   - fullColumn : the new whole-column array (ALL langs) to write back.
 *   - langSlice  : the POST-save effective-lang slice (get_data_lang) — the save
 *                  RESPONSE entries + the TM `data` (get_time_machine_data_to_save).
 *   - newCounter : the new meta.<tipo> counter when an id was allocated/absorbed.
 */
interface TranslatableMutationResult {
  fullColumn: ComponentDatum[];
  langSlice: ComponentDatum[];
  newCounter: number | null;
}

/** The effective-lang slice of a mixed-lang column (get_data_lang). */
function filterByLang(column: ComponentDatum[], lang: string): ComponentDatum[] {
  return column.filter(
    (it) => it !== null && typeof it === 'object' && (it as ComponentDatum).lang === lang,
  );
}

/**
 * Port of set_data_lang: rebuild the whole column = (items whose lang !== the
 * target lang, ORDER PRESERVED) ++ (the new lang slice, each item stamped with
 * `lang`). PHP clones each new item and forces `lang`. The other-lang items keep
 * their original relative order; the new slice is appended after them — the exact
 * byte order PHP's `[...$filtered_data, ...$safe_data_lang]` produces.
 */
function setDataLang(
  column: ComponentDatum[],
  langSlice: ComponentDatum[],
  lang: string,
): ComponentDatum[] {
  const others = column.filter(
    (it) => !(it !== null && typeof it === 'object' && (it as ComponentDatum).lang === lang),
  );
  const stamped = langSlice.map((it) => ({ ...(it as ComponentDatum), lang }));
  return [...others, ...stamped];
}

/**
 * Port of get_id_from_key: group the WHOLE column by lang (skipping `skipLangs`),
 * and at the given `key` POSITION in each lang group, return the first valid
 * (numeric, > 0) id found. This is how an insert/update in one lang reuses the
 * SAME logical id that already exists at the same position in OTHER langs, so the
 * item lines up cross-lang. Returns null when no other lang has a valid id at that
 * position (→ the counter allocates a fresh id).
 */
function getIdFromKey(
  column: ComponentDatum[],
  key: number,
  skipLangs: string[],
): number | null {
  const grouped = new Map<string, ComponentDatum[]>();
  for (const item of column) {
    if (item === null || typeof item !== 'object') continue;
    const lang = (item as ComponentDatum).lang;
    if (typeof lang !== 'string' || lang === '') continue;
    if (skipLangs.includes(lang)) continue;
    const list = grouped.get(lang);
    if (list) list.push(item);
    else grouped.set(lang, [item]);
  }
  for (const entries of grouped.values()) {
    if (key < 0 || key >= entries.length) continue;
    const candidate = entries[key];
    if (candidate !== null && typeof candidate === 'object') {
      const id = (candidate as ComponentDatum).id;
      if (typeof id === 'number' && Number.isInteger(id) && id > 0) return id;
      const n = typeof id === 'string' ? Number(id) : NaN;
      if (Number.isInteger(n) && n > 0) return n;
    }
  }
  return null;
}

/**
 * Apply the changed_data mutation for a TRANSLATABLE literal component, reproducing
 * component_common::update_data_value's translatable branches:
 *
 *   update : if no id but a key is present, resolve the id from OTHER langs at the
 *            same key position (id-sync). Locate the item by id in the EFFECTIVE-
 *            LANG slice and replace its value (id preserved). set_data_lang merges
 *            the slice back into the full column.
 *   insert : if a key is present, resolve the id from OTHER langs at the same key
 *            position FIRST (cross-lang id-sync) and stamp it on the new value.
 *            Append to the effective-lang slice, set_data_lang. Then set_data
 *            allocates a counter id ONLY for an item that still has no id (a key
 *            that did not resolve — e.g. a brand-new logical item or an empty/short
 *            other-lang), or raises the counter to absorb an explicit/resolved id.
 *   remove : remove the item with the matching id from ALL languages (get_data() +
 *            rebuild). Not found in ANY lang → declined (PHP returns false).
 *
 * The counter (meta.<tipo>[0].count) follows set_data: max(existing ids) raises it,
 * and a freshly allocated id is base+1 (base = current counter).
 */
function applyTranslatableMutation(
  model: string,
  fullColumn: ComponentDatum[],
  change: ChangedDataItem,
  transformedValue: ComponentDatum | null,
  lang: string,
  currentCounter: number,
): TranslatableMutationResult {
  const langSlice = filterByLang(fullColumn, lang);

  if (change.action === 'update') {
    if (transformedValue === null) {
      throw new UnsupportedSave('update requires a value');
    }
    const v = { ...transformedValue };
    let id = normalizeId(change.id);
    // id-sync: a null id + a key resolves the id from OTHER langs at that position
    // (the canonical "type the translation of an existing item in a new lang" path —
    // the frontend sends id:null because the editing lang's slice is empty). The
    // resolved id is stamped onto the value when the value carries none.
    if (id === null) {
      const key = typeof change.key === 'number' ? change.key : null;
      if (key === null) {
        throw new UnsupportedSave('translatable update without id/key is not ported (append path declined)');
      }
      const resolved = getIdFromKey(fullColumn, key, [lang]);
      if (resolved !== null) {
        id = resolved;
        const vHasId = v.id !== undefined && v.id !== null && (v.id as unknown) !== '';
        if (!vHasId) v.id = resolved;
      }
    }
    if (id === null) {
      // PHP appends as a new entry with NO id, then set_data allocates a fresh counter
      // id (the brand-new logical item case). Reproduced via the insert allocation.
      throw new UnsupportedSave('translatable update id could not be resolved (new-item append path declined)');
    }
    const nextSlice = langSlice.slice();
    let found = false;
    for (let i = 0; i < nextSlice.length; i++) {
      const it = nextSlice[i];
      if (it !== null && typeof it === 'object' && (it as ComponentDatum).id === id) {
        const replacement = { ...v };
        if (replacement.id === undefined) replacement.id = id;
        nextSlice[i] = replacement;
        found = true;
        break;
      }
    }
    if (!found) {
      // id resolved/given but NOT present in THIS lang's slice → PHP appends the value
      // (carrying the cross-lang id) as a NEW entry in this lang. This FILLS an empty
      // (or short) lang slice for an existing logical item, keeping the id consistent.
      if (v.id === undefined) v.id = id;
      nextSlice.push(v as ComponentDatum);
    }
    const newColumn = setDataLang(fullColumn, nextSlice, lang);
    return {
      fullColumn: newColumn,
      langSlice: filterByLang(newColumn, lang),
      newCounter: counterForColumn(newColumn, currentCounter),
    };
  }

  if (change.action === 'insert') {
    if (transformedValue === null) {
      throw new UnsupportedSave('insert requires a value');
    }
    const v = { ...transformedValue };
    // Cross-lang id-sync: when a key is present, reuse the id another lang already
    // holds at the same position (so the new lang slice lines up cross-lang).
    const key = typeof change.key === 'number' ? change.key : null;
    const clientId = v.id;
    const clientHasId = clientId !== undefined && clientId !== null && (clientId as unknown) !== '';
    if (!clientHasId && key !== null) {
      const resolved = getIdFromKey(fullColumn, key, [lang]);
      if (resolved !== null) v.id = resolved;
    }
    // monovalue (text_area) → replace the whole lang slice; else append.
    const nextSlice = MONOVALUE_MODELS.has(model) ? [v] : [...langSlice, v];
    // set_data counter allocation: an item that STILL has no id gets base+1.
    let counter = currentCounter;
    const hasId = v.id !== undefined && v.id !== null && (v.id as unknown) !== '';
    if (!hasId) {
      counter = currentCounter + 1;
      v.id = counter;
    }
    const newColumn = setDataLang(fullColumn, nextSlice, lang);
    // set_data also raises the counter to absorb any explicit/resolved id above it.
    const raised = counterForColumn(newColumn, counter);
    if (raised !== null) counter = raised;
    return {
      fullColumn: newColumn,
      langSlice: filterByLang(newColumn, lang),
      // Insert always (re)writes the meta counter when it advanced past the persisted
      // value; an id-synced insert (resolved id, no allocation) that does not advance
      // the counter writes no meta (matches the non-translatable insert path).
      newCounter: counter > currentCounter ? counter : null,
    };
  }

  if (change.action === 'remove') {
    const id = normalizeId(change.id);
    if (id === null) {
      // id===null → set_data([]) clears EVERY lang. Out of scope.
      throw new UnsupportedSave('translatable remove without an id (remove-all-langs) is not ported');
    }
    // Translatable literal remove: drop the id from ALL languages (get_data()).
    let found = false;
    const newColumn: ComponentDatum[] = [];
    for (const it of fullColumn) {
      if (it !== null && typeof it === 'object' && (it as ComponentDatum).id === id) {
        found = true;
        continue;
      }
      newColumn.push(it);
    }
    if (!found) {
      throw new UnsupportedSave(`translatable remove target id ${id} not found in any lang (PHP returns false)`);
    }
    return {
      fullColumn: newColumn,
      langSlice: filterByLang(newColumn, lang),
      newCounter: null,
    };
  }

  throw new UnsupportedSave(`unsupported changed_data action '${change.action}'`);
}

/**
 * Port of set_data's counter raise: when the max numeric id in the column exceeds
 * the persisted counter, the counter rises to that max (raise_component_counter, so
 * concurrent allocations cannot reuse it). PHP's save_path always writes the meta
 * column, but the WRITTEN value equals the in-memory counter; when that equals the
 * persisted value the JSONB key is byte-identical, so we skip the redundant write.
 * Returns the new counter ONLY when it differs from `currentCounter`, else null.
 */
function counterForColumn(column: ComponentDatum[], currentCounter: number): number | null {
  let max = -Infinity;
  for (const it of column) {
    if (it === null || typeof it !== 'object') continue;
    const id = (it as ComponentDatum).id;
    const n = typeof id === 'number' ? id : typeof id === 'string' ? Number(id) : NaN;
    if (Number.isInteger(n) && n > max) max = n;
  }
  const next = max > currentCounter ? max : currentCounter;
  return next > currentCounter ? next : null;
}

/**
 * ── DATAFRAME id_key cascade ──────────────────────────────────────────────────
 *
 * A frame pairing locator stored in a main component's dataframe SLOT (a
 * component_dataframe living in the `relation` column under the slot tipo key):
 *   { type:'dd490', id, id_key, section_tipo, section_id, from_component_tipo:<slot>,
 *     main_component_tipo:<main> }
 * id_key is the MAIN data item's id — the pairing key. The cascade (PHP
 * dataframe_common::remove_dataframe_data_by_id, fired from update_data_value('remove'))
 * unlinks every frame paired with a removed item id, across every slot the main has.
 */
interface DataframeFrame {
  type?: unknown;
  id?: unknown;
  id_key?: unknown;
  main_component_tipo?: unknown;
  from_component_tipo?: unknown;
  [k: string]: unknown;
}

/** True when a relation entry is a dataframe pairing locator (is_dataframe_entry). */
function isDataframeEntry(el: unknown): el is DataframeFrame {
  return (
    el !== null &&
    typeof el === 'object' &&
    !Array.isArray(el) &&
    (el as DataframeFrame).type === DEDALO_RELATION_TYPE_DATAFRAME
  );
}

/** Coerce an id_key to int for comparison (frames store id_key as int, locator section_id as string). */
function asInt(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isInteger(raw) ? raw : null;
  if (typeof raw === 'string' && raw.trim() !== '' && !Number.isNaN(Number(raw))) {
    return Number.parseInt(raw, 10);
  }
  return null;
}

/**
 * Collect, from the matrix `relation` column, every dataframe SLOT key that holds a
 * frame whose main_component_tipo === the main tipo — i.e. the slots this main owns
 * frames in. This mirrors the EFFECTIVE save-time behavior of PHP get_dataframe_ddo()
 * for the cascade (PHP fires the cascade per declared ddo; a slot with no frames for
 * this id is a no-op either way, so detecting by stored frames is byte-equivalent for
 * the REMOVE write). The save RQO does not carry the request_config ddo_map, so the
 * stored relation column is the authoritative source.
 *
 * Returns a map slotTipo → the slot's full (unfiltered) frame+locator array.
 */
function collectDataframeSlots(
  relationColumn: Record<string, unknown> | null,
  mainTipo: string,
): Map<string, unknown[]> {
  const slots = new Map<string, unknown[]>();
  if (relationColumn === null || typeof relationColumn !== 'object') return slots;
  for (const [slotTipo, value] of Object.entries(relationColumn)) {
    if (!Array.isArray(value)) continue;
    const ownsFrame = value.some(
      (el) => isDataframeEntry(el) && (el as DataframeFrame).main_component_tipo === mainTipo,
    );
    if (ownsFrame) slots.set(slotTipo, value);
  }
  return slots;
}

/**
 * The id_key cascade for a REMOVE: for each slot the main owns frames in, drop every
 * frame paired with the removed item id (matching the unified predicate: type +
 * from_component_tipo===slot + main_component_tipo===main + id_key===removedId), and
 * return the cleaned slot arrays. Sibling frames (other items, other mains) survive —
 * exactly component_dataframe::set_data's caller-aware merge for the removed caller.
 *
 * Returns: per-slot the cleaned array (null when it empties → the relation key is
 * deleted), plus the FLATTENED list of ALL remaining frames across slots (for the TM
 * merge, get_time_machine_data_to_save = main lang slice ∪ all remaining frames).
 */
interface DataframeCascadeResult {
  /** slotTipo → the cleaned frame array, or null when the slot emptied. */
  cleanedSlots: Map<string, unknown[] | null>;
  /** Every frame surviving across all slots (the TM merge tail). */
  remainingFrames: unknown[];
  /** True when at least one frame was actually removed (the cascade mutated). */
  mutated: boolean;
}

function applyDataframeRemoveCascade(
  slots: Map<string, unknown[]>,
  mainTipo: string,
  removedId: number,
): DataframeCascadeResult {
  const cleanedSlots = new Map<string, unknown[] | null>();
  const remainingFrames: unknown[] = [];
  let mutated = false;
  for (const [slotTipo, full] of slots) {
    const kept: unknown[] = [];
    for (const el of full) {
      const isMatch =
        isDataframeEntry(el) &&
        (el as DataframeFrame).from_component_tipo === slotTipo &&
        (el as DataframeFrame).main_component_tipo === mainTipo &&
        asInt((el as DataframeFrame).id_key) === removedId;
      if (isMatch) {
        mutated = true;
        continue;
      }
      kept.push(el);
      if (isDataframeEntry(el) && (el as DataframeFrame).main_component_tipo === mainTipo) {
        remainingFrames.push(el);
      }
    }
    cleanedSlots.set(slotTipo, kept.length === 0 ? null : kept);
  }
  return { cleanedSlots, remainingFrames, mutated };
}

/**
 * Execute a component value save (update/insert/remove for input_text/text_area/
 * number/date). Writes through a RESERVED per-request connection (single auto-commit
 * UPDATE, then the TM + activity side rows), then builds the response element by
 * reading the committed row.
 *
 * @throws UnsupportedSave on any declined case (the caller proxies to PHP).
 */
export async function saveComponent(
  req: SaveComponentRequest,
  opts: SaveComponentOptions,
): Promise<SaveResult> {
  const { source } = req;
  const tipo = source.tipo;
  const model = source.model;
  const column = MODEL_COLUMN[model];
  if (column === undefined) {
    throw new UnsupportedSave(`unsupported save model ${model}`);
  }
  if (req.changedData.length !== 1) {
    throw new UnsupportedSave('only a single changed_data item is ported');
  }
  const change = req.changedData[0]!;
  const sectionTipo = source.section_tipo;
  const sectionId =
    typeof source.section_id === 'number'
      ? source.section_id
      : Number.parseInt(String(source.section_id), 10);
  if (!Number.isInteger(sectionId)) {
    throw new UnsupportedSave(`invalid section_id ${String(source.section_id)}`);
  }
  const requestedLang = source.lang ?? opts.langConfig.dataLang;

  // ── permission gate (perm >= 2). Root/global-admin → 3. ──
  const permission = opts.session.isGlobalAdmin ? 3 : 0;
  if (permission < 2) {
    return {
      result: false,
      msg: `Error. You don't have enough permissions to edit this component (${tipo}). permissions:${permission}`,
      errors: ['insufficient permissions'],
    };
  }

  // modified_by_user needs a logged user id; without one PHP writes a different shape.
  const userId = opts.session.userId;
  if (userId === null) {
    throw new UnsupportedSave('no logged user id for the modified_by_user stamp');
  }

  // ── resolve the matrix table + the current stored data ──
  const matrixTable = (await resolveMatrixTable(opts.ontology, sectionTipo)) ?? 'matrix';
  // The WHOLE component column (ALL lang slices for a translatable literal; a single
  // nolan slice for a non-translatable component). For non-translatable this raw
  // array IS the effective-lang slice.
  const currentColumn = (await opts.matrix.getComponentData(
    matrixTable,
    sectionTipo,
    sectionId,
    column,
    tipo,
  )) ?? [];

  // Translatable literal (input_text/text_area, supports_translation=true, NOT a
  // relation). canHandleSave now ADMITS these for input_text/text_area; number/date
  // are never translatable (nolan by class) so they take the single-slice path.
  const isTranslatable =
    (model === 'component_input_text' || model === 'component_text_area') &&
    (await opts.ontology.getTranslatable(tipo));

  // ── model value transform (number format / date add_time / text_area sanitize) ──
  const numberProps =
    model === 'component_number'
      ? ((await opts.ontology.getProperties(tipo)) as { type?: unknown; precision?: unknown } | null)
      : null;
  const relationCtx: RelationContext | null = RELATION_MODELS.has(model)
    ? { tipo, sectionTipo, sectionId }
    : null;
  const transformedValue =
    change.action === 'remove'
      ? null
      : transformItemForModel(model, change.value, numberProps, relationCtx);

  // The per-component item-id counter (meta.<tipo>[0].count). For non-translatable we
  // only need it on insert; for translatable update/insert can both raise it (set_data
  // max-id absorb), so we always read it for a translatable mutation.
  const needCounter = change.action === 'insert' || isTranslatable;
  const currentCounter = needCounter
    ? await readComponentCounter(opts.matrix, matrixTable, sectionTipo, sectionId, tipo)
    : 0;

  // ── apply the in-memory mutation ──
  // Non-translatable: the column IS the lang slice; the whole column is written back.
  // Translatable: the column mixes langs; mutate the effective-lang slice (or, for
  // remove, every lang), set_data_lang back into the full column, with cross-lang
  // id-sync on insert/update and the shared meta counter.
  let writtenColumn: ComponentDatum[]; // the data-column value to persist (all langs for translatable)
  let langSlice: ComponentDatum[]; // the POST-save effective-lang slice (response + TM data)
  let newCounter: number | null;
  if (isTranslatable) {
    const r = applyTranslatableMutation(
      model,
      currentColumn,
      change,
      transformedValue,
      requestedLang,
      currentCounter,
    );
    writtenColumn = r.fullColumn;
    langSlice = r.langSlice;
    newCounter = r.newCounter;
  } else {
    const r = applyMutation(model, currentColumn, change, transformedValue, currentCounter);
    writtenColumn = r.entries;
    langSlice = r.entries;
    newCounter = r.newCounter;
  }

  // ── DATAFRAME id_key cascade (REMOVE only) ──
  // A literal main with a dataframe slot fires remove_dataframe_data_by_id on remove:
  // the frame locators paired with the removed item id (id_key) are unlinked from each
  // slot (in the `relation` column), sibling frames preserved. insert/update never
  // cascade (frames are only added by the dataframe component's own save), so those
  // stay the plain literal path. Translatable: PHP cascades only when the id is gone
  // from EVERY language — for the single-lang non-translatable models here that is
  // always the case; the translatable input_text remove-all-langs path is handled by
  // applyTranslatableMutation but its cascade is DECLINED upstream (canHandleSave) for
  // now since input_text+dataframe also needs the translatable response — see the gate.
  let dataframeCascade: DataframeCascadeResult | null = null;
  if (change.action === 'remove') {
    const removedId = normalizeId(change.id);
    if (removedId !== null) {
      const relationColumn = await opts.matrix.getColumn(
        matrixTable,
        sectionTipo,
        sectionId,
        'relation',
      );
      const slots = collectDataframeSlots(
        relationColumn as Record<string, unknown> | null,
        tipo,
      );
      if (slots.size > 0) {
        dataframeCascade = applyDataframeRemoveCascade(slots, tipo, removedId);
      }
    }
  }

  // ── build the matrix write keys: data column + dd201 + dd197 (+ meta) (+ frame slots) ──
  // remove that empties the WHOLE column → null value → jsonb_set_lax 'delete_key'
  // (PHP's set_data([]) → null path). Otherwise the full column array.
  const dataValue: unknown = writtenColumn.length === 0 ? null : writtenColumn;
  const updates: MatrixKeyUpdate[] = [
    { column, key: tipo, value: dataValue },
  ];
  // dataframe cascade: write each cleaned slot (null → delete the relation key). PHP
  // persists the slot via the dataframe component's own save (relation column); merged
  // into the SAME matrix UPDATE here, byte-identical to the final stored row.
  if (dataframeCascade !== null && dataframeCascade.mutated) {
    for (const [slotTipo, cleaned] of dataframeCascade.cleanedSlots) {
      updates.push({ column: 'relation', key: slotTipo, value: cleaned });
    }
  }
  updates.push(
    { column: 'date', key: MODIFIED_DATE_TIPO, value: [buildModifiedDateItem(new Date())] },
    {
      column: 'relation',
      key: MODIFIED_BY_USER_TIPO,
      value: [buildModifiedByUserItem(userId)],
    },
  );
  if (newCounter !== null) {
    updates.push({ column: 'meta', key: tipo, value: [{ count: newCounter }] });
  }

  // ── the UPDATE + side-effects on the RESERVED connection (PHP order) ──
  const writeSession: DbSession = await opts.db.reserve();
  try {
    const ok = await MatrixDbManager.updateByKey(
      writeSession,
      matrixTable,
      sectionTipo,
      sectionId,
      updates,
    );
    if (!ok) {
      return {
        result: false,
        msg: 'Error. Request failed [save]',
        errors: ['matrix update affected no row'],
      };
    }

    // ── side-effect 1: time-machine snapshot (tm_record::create) ──
    // PHP stamps the TM row with the COMPONENT lang ($tm_values->lang = $lang): for a
    // non-translatable component that is forced to lg-nolan; for a translatable literal
    // it is the effective (requested) lang. The snapshot DATA is the POST-save
    // effective-lang slice (get_time_machine_data_to_save = get_data_lang) — NULL-
    // collapsed when the slice emptied (a remove that cleared this lang → null TM data).
    const tmLang = isTranslatable ? requestedLang : DEDALO_DATA_NOLAN;
    // get_time_machine_data_to_save merges the main lang slice with ALL remaining
    // dataframe frames (across slots, post-cascade) — the TM row stores both halves
    // under the main tipo so a single TM restore rebuilds main + frames. When the main
    // has no dataframe (the common literal case) tmFrames is empty → just the slice.
    const tmFrames =
      dataframeCascade !== null && dataframeCascade.mutated ? dataframeCascade.remainingFrames : [];
    const tmMerged = [...langSlice, ...tmFrames];
    const tmData = tmMerged.length === 0 ? null : tmMerged;
    // The prior-snapshot backfill: tm_record::create compares $previous_data
    // (= set_data's db_data = the ORIGINAL FULL data, ALL langs) against $values->data
    // (= the post-save lang slice). When they differ AND no prior TM row exists for
    // (section, tipo, lang), it inserts a synthetic now-1min row whose DATA is the
    // FULL prior data (all langs for translatable) — NOT the prior lang slice.
    // PHP guards the whole backfill on !empty($previous_data): an empty prior column
    // (the very first save of this component) never backfills.
    const priorFull = currentColumn.length === 0 ? null : currentColumn;
    const sameData = JSON.stringify(priorFull) === JSON.stringify(tmData);
    if (priorFull !== null && !sameData) {
      const priorCount = await SaveSideEffectsDbManager.countTimeMachineRows(
        writeSession,
        sectionId,
        sectionTipo,
        tipo,
        tmLang,
      );
      if (priorCount === 0) {
        const oneMinuteBack = new Date(Date.now() - 60_000);
        await SaveSideEffectsDbManager.createTimeMachine(writeSession, {
          sectionId,
          sectionTipo,
          tipo,
          lang: tmLang,
          data: priorFull,
          userId,
          bulkProcessId: null,
          now: oneMinuteBack,
        });
      }
    }
    await SaveSideEffectsDbManager.createTimeMachine(writeSession, {
      sectionId,
      sectionTipo,
      tipo,
      lang: tmLang,
      data: tmData,
      userId,
      bulkProcessId: null,
    });

    // ── side-effect 1b: the dataframe slot's OWN 'SAVE' activity row(s) ──
    // PHP's cascade runs $dataframe_component->save() BEFORE the main matrix write, so
    // each mutated dataframe slot logs its SAVE activity FIRST (with the slot tipo +
    // component_dataframe model + lang lg-nolan), then the main's SAVE activity below.
    // No TM row for the slot (the cascade runs with tm_record::$save_tm = false).
    if (dataframeCascade !== null && dataframeCascade.mutated) {
      for (const slotTipo of dataframeCascade.cleanedSlots.keys()) {
        await SaveSideEffectsDbManager.createSaveActivity(writeSession, {
          tipo: slotTipo,
          sectionId,
          sectionTipo,
          lang: DEDALO_DATA_NOLAN,
          componentName: 'component_dataframe',
          table: matrixTable,
          userId,
          ip: opts.session.ip ?? 'localhost',
        });
      }
    }

    // ── side-effect 2: activity 'SAVE' row (logger_backend_activity) ──
    await SaveSideEffectsDbManager.createSaveActivity(writeSession, {
      tipo,
      sectionId,
      sectionTipo,
      lang: requestedLang,
      componentName: model,
      table: matrixTable,
      userId,
      ip: opts.session.ip ?? 'localhost',
    });
  } finally {
    writeSession.release();
  }

  // ── build the response element (edit-mode {context, data}) reading the committed row ──
  const elementSource = {
    tipo,
    section_tipo: sectionTipo,
    section_id: source.section_id,
    lang: requestedLang,
    mode: 'edit',
    model,
  };
  let element: { context: unknown[]; data: unknown[] };
  if (model === 'component_input_text') {
    element = await buildInputTextElement(elementSource, {
      matrix: opts.matrix,
      ontology: opts.ontology,
      langConfig: opts.langConfig,
      matrixTable,
      context: opts.context,
    });
  } else if (model === 'component_select') {
    // component_select EDIT element: the relation/select structure-context + the DATA
    // item (entries = the raw locators, datalist = get_list_of_values). Needs the
    // structureLang + the target-section datalist search (wired by the caller; the gate
    // requires both present). buildSelectElement loud-throws (UnsupportedSelect) for the
    // un-ported datalist shapes — surfaced as UnsupportedSave so a half-ported response
    // fails closed.
    if (opts.structureLang === undefined || opts.datalistRecordSearch === undefined) {
      throw new UnsupportedSave('component_select save response needs structureLang + datalistRecordSearch');
    }
    try {
      element = await buildSelectElement(elementSource, {
        matrix: opts.matrix,
        ontology: opts.ontology,
        langConfig: opts.langConfig,
        matrixTable,
        context: opts.context,
        structureLang: opts.structureLang,
        datalistRecordSearch: opts.datalistRecordSearch,
      });
    } catch (e) {
      if (e instanceof UnsupportedSelect) {
        throw new UnsupportedSave(`component_select save response not ported (${e.message})`);
      }
      throw e;
    }
  } else {
    element = await buildDataElement(
      { ...elementSource, model: model as DataElementModel },
      {
        matrix: opts.matrix,
        ontology: opts.ontology,
        langConfig: opts.langConfig,
        matrixTable,
        context: opts.context,
      },
    );
  }

  // ── PHP returns the IN-MEMORY post-save EFFECTIVE-LANG slice (data_resolved →
  // get_data_lang), NOT a DB re-read. For a translatable component this is the
  // lang-filtered slice of the in-memory post-save full column (langSlice). The
  // re-read JSONB (key-sorted) diverges from the in-memory order in two cases:
  //   1. a freshly INSERTED item carries its insertion key-order (e.g. {value, id} —
  //      value first, id appended by the counter) — differs from sorted JSONB;
  //   2. component_date: PHP component_date::save reconstructs EVERY item as a dd_date
  //      (add_time), serialized in dd_date DECLARATION order — date is never
  //      translatable so this stays the single-slice path.
  // Build the response `entries` from the in-memory post-save lang slice (with date's
  // per-item add_time applied to every item) so the key-order matches PHP exactly.
  // Skip when the slice emptied (the re-read null/fallback path already matches PHP). ──
  if (langSlice.length > 0 && Array.isArray(element.data) && element.data.length > 0) {
    const mainItem = element.data[0] as Record<string, unknown> | null;
    if (
      mainItem !== null &&
      typeof mainItem === 'object' &&
      Object.prototype.hasOwnProperty.call(mainItem, 'entries') &&
      Array.isArray(mainItem.entries) &&
      mainItem.tipo === tipo
    ) {
      mainItem.entries =
        model === 'component_date'
          ? langSlice.map((it) => applyAddTime(it as Record<string, unknown>) as ComponentDatum)
          : langSlice;
    }
  }

  return {
    result: element,
    msg: 'OK. Request save done successfully',
    errors: [],
  };
}

/** Back-compat alias for the original input_text-only entry point. */
export const saveInputText = saveComponent;
