/**
 * Port of the dd_core_api `save` action for the FIRST mutation: an UPDATE of a
 * single component_input_text value on an EXISTING matrix row.
 *
 * PHP path (class.dd_core_api.php::save → component->update_data_value →
 * component->save → section_record->save_component_data → save_key_data →
 * matrix_db_manager::update_by_key):
 *
 *   1. perm gate: component permission >= 2 (root → 3).
 *   2. update_data_value('update'): locate the data item by id in the effective-
 *      lang slice and REPLACE its value object (the frontend sends `value` as the
 *      full {id,lang,value} item). id is preserved.
 *   3. component->save(): ONE matrix UPDATE writing THREE keys —
 *        string.<tipo>   = the updated item array,
 *        date.dd201      = modified_date  (component_date::get_date_now()),
 *        relation.dd197  = modified_by_user (the logged user locator).
 *      Then, on the SAME reserved connection (PHP order: matrix UPDATE → TM → activity),
 *      the TWO side-effect rows PHP writes after every save:
 *        - a matrix_time_machine snapshot (tm_record::create) of the POST-save lang
 *          slice, keyed by (section_id, section_tipo, tipo, lang) + who/when, and
 *        - a matrix_activity 'SAVE' row (logger_backend_activity) — the dd542 virtual
 *          section record (IP/WHO/WHAT/WHERE/WHEN/DATA).
 *      (See @dedalo/db SaveSideEffectsDbManager for the exact column sets + payloads.)
 *   4. result = component->get_json({get_context:true, get_data:true}) — the
 *      edit-mode {context, data} element, entries reflecting the NEW value.
 *      msg = 'OK. Request save done successfully'; errors = [].
 *
 * This module owns step 2+3 (the data-item update + the matrix UPDATE with the
 * audit stamps). The response element (step 4) is built by buildInputTextElement
 * (the already-byte-green edit-mode element), reading the now-committed row.
 *
 * SCOPE — this is the NARROW first save. The caller (canHandleSave) declines:
 *   - insert / remove / sort_data / add_new_element changed_data actions,
 *   - any model except component_input_text, any type except 'component',
 *   - more than one changed_data item,
 *   - a non-existing matrix row,
 *   - the input_text special cases buildInputTextElement declines (dataframe /
 *     transliterate / activity 'Where').
 * Everything declined proxies to PHP.
 */

import type { Db, DbSession, MatrixKeyUpdate, ComponentDatum } from '@dedalo/db';
import { MatrixDbManager, SaveSideEffectsDbManager } from '@dedalo/db';
import type { OntologyRepository } from '@dedalo/ontology';
import type { LangConfig } from './lang_config.ts';
import {
  buildInputTextElement,
  type BuildInputTextElementOptions,
} from './input_text_element.ts';
import { resolveMatrixTable } from './matrix_table.ts';

/** The fixed audit-stamp tipos (PHP section::get_metadata_definition). */
const MODIFIED_BY_USER_TIPO = 'dd197'; // relation column
const MODIFIED_DATE_TIPO = 'dd201'; // date column
const DEDALO_SECTION_USERS_TIPO = 'dd128';
const DEDALO_RELATION_TYPE_LINK = 'dd151';
const DEDALO_DATA_NOLAN = 'lg-nolan';

/** A changed_data item from the save RQO (the 'update' shape). */
export interface ChangedDataUpdate {
  action: string;
  key?: number;
  id?: number | string | null;
  /** The new value: the full data-item object {id,lang,value} (frontend contract). */
  value: ComponentDatum;
}

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

export interface SaveInputTextRequest {
  source: SaveSource;
  changedData: ChangedDataUpdate[];
}

/** Session info needed to stamp the audit metadata + gate permissions. */
export interface SaveSessionInfo {
  /** The logged user's id (logged_user_id()): the modified_by_user locator section_id. */
  userId: number | null;
  /** Global-admin / root → permission 3 (write). */
  isGlobalAdmin: boolean;
  /**
   * The request source IP (PHP $_SERVER['REMOTE_ADDR']) for the activity WHO/IP
   * column. '::1' → 'localhost' (PHP normalization). Optional: defaults to
   * 'localhost' (the PHP-on-localhost value); the harness normalizes it anyway.
   */
  ip?: string;
}

export interface SaveInputTextOptions {
  db: Db;
  ontology: OntologyRepository;
  langConfig: LangConfig;
  matrix: BuildInputTextElementOptions['matrix'];
  /** Context-half deps for the response element. */
  context: BuildInputTextElementOptions['context'];
  session: SaveSessionInfo;
}

export interface SaveResult {
  result: unknown;
  msg: string;
  errors: string[];
}

/** Thrown for an input the save path declines (caller should proxy). */
export class UnsupportedSave extends Error {}

/**
 * Build the modified_date (dd201) date item — the exact component_date::get_date_now()
 * structure: { start: {year,month,day,hour,minute,second,time}, id:1, lang:'lg-nolan' }.
 * The `time` integer is convert_date_to_seconds (virtual 372-day years, 31-day months,
 * the month/day -1 adjustments). Key ORDER is byte-irrelevant for the stored JSONB
 * (Postgres normalizes keys), but the leaf VALUES are reproduced exactly so the row
 * structure matches PHP (only the volatile clock leaves legitimately differ per run).
 */
function buildModifiedDateItem(now: Date): ComponentDatum {
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  const day = now.getDate();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const second = now.getSeconds();

  // convert_date_to_seconds: month/day are decremented by 1 (when non-zero) then
  // weighted by virtual 372-day years / 31-day months.
  const cMonth = month > 0 ? month - 1 : 0;
  const cDay = day > 0 ? day - 1 : 0;
  const time =
    year * 372 * 24 * 60 * 60 +
    cMonth * 31 * 24 * 60 * 60 +
    cDay * 24 * 60 * 60 +
    hour * 60 * 60 +
    minute * 60 +
    second;

  // PHP dd_date sets year,month,day,hour,minute,second then time (insertion order).
  const start = { year, month, day, hour, minute, second, time };
  return { start, id: 1, lang: DEDALO_DATA_NOLAN } as unknown as ComponentDatum;
}

/**
 * Build the modified_by_user (dd197) relation locator item — the exact
 * build_modification_data shape: { id:1, type:'dd151', section_id:<user>,
 * section_tipo:'dd128', from_component_tipo:'dd197' }. section_id is a STRING in the
 * matrix (PHP locator serializes section_id as the stored string). id is the fixed 1.
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

/**
 * Apply the changed_data 'update' to the effective-lang data array: replace the
 * item whose id matches, preserving id. Mirrors update_data_value's 'update' branch
 * for the supported (id present, found) case. Returns the new array.
 *
 * @throws UnsupportedSave when the id is absent or not found (the append/wipe paths
 *   are out of scope — they change the array shape and are declined upstream).
 */
function applyUpdate(
  current: ComponentDatum[],
  change: ChangedDataUpdate,
): ComponentDatum[] {
  let id = change.id ?? null;
  if (typeof id === 'string' && id.trim() !== '' && !Number.isNaN(Number(id))) {
    id = Number.parseInt(id, 10);
  }
  if (id === null || typeof id !== 'number') {
    throw new UnsupportedSave('update without a numeric id is not ported');
  }
  const next = current.slice();
  let found = false;
  for (let i = 0; i < next.length; i++) {
    const item = next[i];
    if (item !== null && typeof item === 'object' && (item as ComponentDatum).id === id) {
      const value = { ...(change.value as ComponentDatum) };
      if (value.id === undefined) value.id = id;
      next[i] = value;
      found = true;
      break;
    }
  }
  if (!found) {
    throw new UnsupportedSave(`update target id ${id} not found (append path not ported)`);
  }
  return next;
}

/**
 * Execute the input_text value-update save. Writes through a RESERVED per-request
 * connection (single auto-commit UPDATE, matching PHP), then builds the response
 * element by reading the committed row.
 *
 * @throws UnsupportedSave when the input hits a declined case (no user id, bad id,
 *   absent row, declined element special). The caller proxies to PHP.
 */
export async function saveInputText(
  req: SaveInputTextRequest,
  opts: SaveInputTextOptions,
): Promise<SaveResult> {
  const { source } = req;
  const tipo = source.tipo;
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

  // modified_by_user needs a logged user id; without one PHP's build_modification_data
  // returns an empty path (no stamp) — a different write shape. Decline → proxy.
  const userId = opts.session.userId;
  if (userId === null) {
    throw new UnsupportedSave('no logged user id for the modified_by_user stamp');
  }

  // ── resolve the matrix table + the current stored data slice ──
  const matrixTable = (await resolveMatrixTable(opts.ontology, sectionTipo)) ?? 'matrix';
  // The RAW stored column array for this component (the FULL array written back).
  // canHandleSave restricts this path to NON-translatable input_text, so the column
  // holds a single (nolan) lang slice — the raw array IS the effective-lang slice,
  // and replacing the item by id then writing the whole array is faithful to PHP
  // (set_data_lang on a single-lang component leaves the column = that slice). A
  // translatable component would interleave other-lang items and is declined.
  const currentEntries = (await opts.matrix.getComponentData(
    matrixTable,
    sectionTipo,
    sectionId,
    'string',
    tipo,
  )) ?? [];

  // ── apply the update (replace the item by id) ──
  const updatedEntries = applyUpdate(currentEntries, req.changedData[0]!);

  // ── build the THREE-key matrix write: string.<tipo>, date.dd201, relation.dd197 ──
  const updates: MatrixKeyUpdate[] = [
    { column: 'string', key: tipo, value: updatedEntries },
    { column: 'date', key: MODIFIED_DATE_TIPO, value: [buildModifiedDateItem(new Date())] },
    {
      column: 'relation',
      key: MODIFIED_BY_USER_TIPO,
      value: [buildModifiedByUserItem(userId)],
    },
  ];

  // ── the UPDATE + side-effects on the RESERVED connection ──
  // PHP order (component_common::save): matrix UPDATE → time-machine snapshot →
  // activity 'SAVE' row. All three run on the same reserved connection (single
  // auto-commit per statement, matching PHP's DBi). The post-save lang slice for
  // the TM snapshot IS `updatedEntries` (for a non-translatable input_text,
  // get_time_machine_data_to_save → get_data_lang returns exactly the nolan slice
  // we just wrote). The pre-update slice is `currentEntries` (PHP's $this->db_data).
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
    // tm_record uses lg-nolan as the TM `lang` for a non-translatable component
    // (it saves the current component lang; for nolan input_text that is lg-nolan).
    const tmLang = DEDALO_DATA_NOLAN;
    // "save-before" repair (tm_record::create): when NO prior TM row exists for
    // this (section,component,lang) AND the previous data differs, PHP inserts a
    // synthetic row (timestamped one minute back) holding the OLD value before the
    // new-value snapshot, so the TM timeline is coherent for never-captured data.
    const sameData =
      JSON.stringify(currentEntries) === JSON.stringify(updatedEntries);
    if (!sameData) {
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
          data: currentEntries,
          userId,
          bulkProcessId: null,
          now: oneMinuteBack,
        });
      }
    }
    // the main snapshot: the POST-save lang slice.
    await SaveSideEffectsDbManager.createTimeMachine(writeSession, {
      sectionId,
      sectionTipo,
      tipo,
      lang: tmLang,
      data: updatedEntries,
      userId,
      bulkProcessId: null,
    });

    // ── side-effect 2: activity 'SAVE' row (logger_backend_activity) ──
    await SaveSideEffectsDbManager.createSaveActivity(writeSession, {
      tipo,
      sectionId,
      sectionTipo,
      lang: requestedLang,
      componentName: source.model,
      table: matrixTable,
      userId,
      ip: opts.session.ip ?? 'localhost',
    });
  } finally {
    writeSession.release();
  }

  // ── build the response element (edit-mode {context, data}) reading the committed
  //    row. entries now reflect the new value. ──
  const element = await buildInputTextElement(
    {
      tipo,
      section_tipo: sectionTipo,
      // Pass the ORIGINAL source.section_id (a string "1" in the RQO), not the parsed
      // int: get_data_item echoes section_id / parent_section_id verbatim from the
      // source, so PHP returns the STRING. The element builder coerces internally for
      // the matrix read.
      section_id: source.section_id,
      lang: requestedLang,
      mode: 'edit',
      model: source.model,
    },
    {
      matrix: opts.matrix,
      ontology: opts.ontology,
      langConfig: opts.langConfig,
      matrixTable,
      context: opts.context,
    },
  );

  return {
    result: element,
    msg: 'OK. Request save done successfully',
    errors: [],
  };
}
