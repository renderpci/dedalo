/**
 * Port of the dd_core_api `duplicate` action — copy a section record into a NEW
 * record, reproducing its INSERT + audit stamp + the per-component re-save cascade
 * (time-machine + activity rows) byte-for-byte.
 *
 * PHP path (class.dd_core_api.php::duplicate → section_record::duplicate):
 *
 *   1. source_data = clone get_data() (every JSONB column of the source row).
 *   2. section::create_record({values: source_data}) — the SAME advisory-lock
 *      allocator + INSERT as `create`, but the `values` carry the SOURCE component
 *      columns. create_record OVERRIDES:
 *        - the `data` column → build_metadata (label, created_date=now, section_id:null,
 *          section_tipo, diffusion_info:null, created_by_user_id) — the source `data`
 *          (its old created_date/user) is DISCARDED;
 *        - relation.dd200 (created_by_user) + date.dd199 (created_date) → the fresh
 *          'new_record' modification stamp (build_modification_data) — merged ON TOP
 *          of the copied relation/date columns.
 *      Every OTHER source column (string/number/date/relation/iri/geo/misc/meta/...)
 *      is INSERTed VERBATIM. A 'NEW' activity row is logged (no TM row on create).
 *   3. For each source column (skipping 'data','meta','relation_search') and each
 *      component tipo (skipping the dd196 audit group + media + portal) the component
 *      is re-saved: $component->set_data($column_data); $component->save(). Because
 *      the INSERT already wrote that column with the SAME (source) value, the save's
 *      matrix UPDATE re-writes the IDENTICAL column bytes, plus the standard save
 *      audit (dd201 modified_date + dd197 modified_by_user), the per-component meta
 *      counter (raise to max id — a no-op when already correct), ONE time-machine row
 *      (data = the full component lang slice = the source value; NO synthetic prior row
 *      because the freshly-INSERTed value already equals the post-save value), and ONE
 *      'SAVE' activity row. (Verified live on numisdata31/25 — a single filter
 *      component → 1 TM row + 1 SAVE activity, dd197/dd201 re-stamped to now/user.)
 *   4. $new_section_record->save() — a full-row flush. For the gated case (no
 *      relation_search, meta already correct) this re-writes the IDENTICAL row bytes
 *      and produces NO side rows, so it is a no-op and skipped here.
 *   5. response = { result:<new section_id>, msg:'OK. Request done', errors:[] }.
 *
 * SCOPE — declines anything but an all-ported-save-model section (the caller's
 * canHandleDuplicate gate enforces this). Every populated, non-skipped component must
 * be a NOLAN model whose full re-save writes the column VERBATIM + the standard audit:
 *   component_input_text / component_text_area (string), component_number (number),
 *   component_date (date), component_select / component_filter / component_publication /
 *   component_radio_button / component_check_box (relation).
 * The re-save is byte-reproducible because the source value was itself produced by a
 * prior PHP save, so each model's save-time transform (number format, date add_time,
 * locator validate, the GLOBAL-ADMIN filter pass-through) is IDEMPOTENT on it — we
 * therefore write the source column value verbatim. Translatable components, media,
 * portal, relation_parent/children (relation_search index) and a non-global-admin
 * session DECLINE → proxy to PHP.
 */

import type { Db, DbSession, MatrixKeyUpdate, ComponentDatum, MatrixFamily } from '@dedalo/db';
import { MatrixDbManager, SaveSideEffectsDbManager } from '@dedalo/db';
import type { OntologyRepository } from '@dedalo/ontology';
import type { LangConfig } from './lang_config.ts';
import { resolveMatrixTable } from './matrix_table.ts';

/** The fixed metadata tipos (PHP section::get_metadata_definition). */
const CREATED_BY_USER_TIPO = 'dd200'; // relation column (new_record stamp)
const CREATED_DATE_TIPO = 'dd199'; // date column (new_record stamp)
const MODIFIED_BY_USER_TIPO = 'dd197'; // relation column (per-component save stamp)
const MODIFIED_DATE_TIPO = 'dd201'; // date column (per-component save stamp)
const DEDALO_SECTION_USERS_TIPO = 'dd128';
const DEDALO_RELATION_TYPE_LINK = 'dd151';
const DEDALO_DATA_NOLAN = 'lg-nolan';
/** The activity-log section (dd542) is never duplicated through this path. */
const DEDALO_ACTIVITY_SECTION_TIPO = 'dd542';

/**
 * The dd196 audit-component group (DEDALO_SECTION_INFO_SECTION_GROUP children) — the
 * per-tipo skip set in the duplicate re-save loop (ontology_node::get_ar_children('dd196')
 * on the dev/test install; verified live). These are the created/modified stamp +
 * version components, rebuilt by the create/save audit path, never re-saved.
 */
export const SECTION_INFO_TIPOS: ReadonlySet<string> = new Set([
  'dd200',
  'dd199',
  'dd197',
  'dd201',
  'dd271',
  'dd1223',
  'dd1224',
  'dd1225',
  'dd1596',
]);

/** The JSONB columns whose component data the re-save loop SKIPS (PHP $skip_columns). */
export const SKIP_COLUMNS: ReadonlySet<string> = new Set(['data', 'meta', 'relation_search']);

/** The matrix media component models (component_media_common::get_media_components). */
export const MEDIA_COMPONENT_MODELS: ReadonlySet<string> = new Set([
  'component_3d',
  'component_av',
  'component_image',
  'component_pdf',
  'component_svg',
]);

/**
 * The component models whose FULL re-save (set_data(whole column) → save) is
 * byte-reproducible by this port: NOLAN models that write their data column VERBATIM
 * plus the standard dd201/dd197 audit + the per-component meta counter. Their save-time
 * transform is idempotent on an already-stored value, so we re-write the source column
 * verbatim. Maps the model → its matrix data-family column.
 */
const RESAVE_MODEL_COLUMN: Record<string, MatrixFamily> = {
  component_input_text: 'string',
  component_text_area: 'string',
  component_number: 'number',
  component_date: 'date',
  component_select: 'relation',
  component_filter: 'relation',
  component_publication: 'relation',
  component_radio_button: 'relation',
  component_check_box: 'relation',
};

/** Public view of the supported re-save models (the canHandleDuplicate gate set). */
export const DUPLICATE_RESAVE_MODELS: ReadonlySet<string> = new Set(Object.keys(RESAVE_MODEL_COLUMN));

/** The duplicate RQO source block. */
export interface DuplicateSource {
  section_tipo: string;
  section_id: number | string;
}

export interface DuplicateRecordRequest {
  source: DuplicateSource;
}

/** Session info needed to stamp audit metadata + gate permissions. */
export interface DuplicateSessionInfo {
  /** The logged user's id (logged_user_id()): the created/modified_by_user locator id. */
  userId: number | null;
  /** Global-admin / root → permission 3 (write) AND the filter pass-through branch. */
  isGlobalAdmin: boolean;
  /** The request source IP for the activity IP column ('::1' → 'localhost'). */
  ip?: string;
}

export interface DuplicateRecordOptions {
  db: Db;
  ontology: OntologyRepository;
  langConfig: LangConfig;
  /** Read access to the source matrix row (the values to copy). */
  matrix: {
    getRow: (
      table: string,
      sectionTipo: string,
      sectionId: number,
    ) => Promise<Record<string, unknown> | null>;
  };
  session: DuplicateSessionInfo;
}

export interface DuplicateResult {
  result: unknown;
  msg: string;
  errors: string[];
}

/** Thrown for an input the duplicate path declines (caller should proxy). */
export class UnsupportedDuplicate extends Error {}

/** The 11 JSONB payload columns of a matrix row, in PHP iteration order. */
const PAYLOAD_COLUMNS: ReadonlyArray<MatrixFamily> = [
  'relation',
  'string',
  'date',
  'iri',
  'geo',
  'number',
  'media',
  'misc',
  'relation_search',
  'meta',
];

/**
 * Format a JS Date as the PostgreSQL timestamp string PHP writes for the metadata
 * `created_date` (dd_date::get_timestamp_now_for_db → 'Y-m-d H:i:s', local time).
 */
function formatDbTimestamp(now: Date): string {
  const p = (n: number, w = 2): string => String(n).padStart(w, '0');
  return (
    `${p(now.getFullYear(), 4)}-${p(now.getMonth() + 1)}-${p(now.getDate())} ` +
    `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`
  );
}

/**
 * Build the dd_date 'start' leaf (component_date::get_date_now): the virtual
 * 372-day-year / 31-day-month convert_date_to_seconds `time` plus the wall-clock
 * fields. Used for the created/modified date stamps (dd199/dd201). JSONB normalizes
 * the key order; only the (volatile clock) values matter.
 */
function buildDateNowStart(now: Date): Record<string, number> {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const second = now.getSeconds();
  const cMonth = month > 0 ? month - 1 : 0;
  const cDay = day > 0 ? day - 1 : 0;
  const time =
    year * 372 * 24 * 60 * 60 +
    cMonth * 31 * 24 * 60 * 60 +
    cDay * 24 * 60 * 60 +
    hour * 60 * 60 +
    minute * 60 +
    second;
  return { year, month, day, hour, minute, second, time };
}

/** The created/modified_by_user relation locator item (build_modification_data). */
function buildUserLocator(userId: number, fromComponentTipo: string): ComponentDatum {
  return {
    id: 1,
    type: DEDALO_RELATION_TYPE_LINK,
    section_id: String(userId),
    section_tipo: DEDALO_SECTION_USERS_TIPO,
    from_component_tipo: fromComponentTipo,
  } as unknown as ComponentDatum;
}

/** The created/modified date item ({ start, id:1, lang:'lg-nolan' }). */
function buildDateItem(now: Date): ComponentDatum {
  return { start: buildDateNowStart(now), id: 1, lang: DEDALO_DATA_NOLAN } as unknown as ComponentDatum;
}

/** Read the per-component meta counter (meta.<tipo>[0].count) from a source meta column. */
function readMetaCounter(meta: unknown, tipo: string): number {
  if (meta === null || typeof meta !== 'object') return 0;
  const items = (meta as Record<string, unknown>)[tipo];
  if (!Array.isArray(items) || items.length === 0) return 0;
  const first = items[0];
  const count = first && typeof first === 'object' ? (first as { count?: unknown }).count : null;
  return typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : 0;
}

/** The max numeric item id in a component data array (set_data counter raise). */
function maxItemId(items: unknown): number {
  if (!Array.isArray(items)) return 0;
  let max = 0;
  for (const it of items) {
    if (it === null || typeof it !== 'object') continue;
    const id = (it as { id?: unknown }).id;
    const n = typeof id === 'number' ? id : typeof id === 'string' ? Number(id) : NaN;
    if (Number.isInteger(n) && n > max) max = n;
  }
  return max;
}

/**
 * One component to re-save: its column family, tipo, the verbatim source value, and
 * the per-component lang for the TM/activity rows (NOLAN for every supported model).
 */
interface ResaveComponent {
  column: MatrixFamily;
  tipo: string;
  /** The source column value (the array of items) — re-written verbatim. */
  value: ComponentDatum[];
  /** The meta counter to write (max(source counter, max item id)). */
  counter: number;
  model: string;
}

/**
 * Execute the section-record DUPLICATE. Allocates a new section_id via the advisory-
 * lock allocator and INSERTs the copied row inside ONE transaction on a RESERVED
 * per-request connection (matching PHP's create), then writes the 'NEW' activity row
 * and the per-component re-save cascade (matrix UPDATE + TM + 'SAVE' activity), all on
 * the same reserved connection. Returns { result:<new id> }.
 *
 * @throws UnsupportedDuplicate when the input hits a declined case (no logged user,
 *   not global-admin, an un-ported component model, media/portal/relation_search).
 *   The caller proxies to PHP.
 */
export async function duplicateRecord(
  req: DuplicateRecordRequest,
  opts: DuplicateRecordOptions,
): Promise<DuplicateResult> {
  const sectionTipo = req.source.section_tipo;
  if (typeof sectionTipo !== 'string' || sectionTipo === '') {
    return {
      result: false,
      msg: 'API Error: (duplicate) Empty section_tipo (is mandatory)',
      errors: ['empty section tipo'],
    };
  }
  const sectionId =
    typeof req.source.section_id === 'number'
      ? req.source.section_id
      : Number.parseInt(String(req.source.section_id ?? ''), 10);
  if (!Number.isInteger(sectionId) || sectionId < 1) {
    throw new UnsupportedDuplicate(`invalid source section_id ${String(req.source.section_id)}`);
  }

  // ── permission gate (perm >= 2). Root/global-admin → 3. ──
  const permission = opts.session.isGlobalAdmin ? 3 : 0;
  if (permission < 2) {
    return {
      result: false,
      msg: `Error. You don't have enough permissions to write to the section (${sectionTipo}). permissions:${permission}`,
      errors: ['insufficient permissions'],
    };
  }

  // The activity section is logger-managed; never duplicated through this path.
  if (sectionTipo === DEDALO_ACTIVITY_SECTION_TIPO) {
    throw new UnsupportedDuplicate('activity section is not duplicated through this path');
  }

  // build_metadata / build_modification_data require a logged user.
  const userId = opts.session.userId;
  if (userId === null) {
    throw new UnsupportedDuplicate('no logged user id for the created/modified_by_user stamp');
  }

  // The GLOBAL-ADMIN filter pass-through (component_filter::set_data) is the only
  // byte-reproducible filter branch — a regular user merges non-access locators.
  if (!opts.session.isGlobalAdmin) {
    throw new UnsupportedDuplicate('duplicate is only ported for a global-admin session');
  }

  const matrixTable = (await resolveMatrixTable(opts.ontology, sectionTipo)) ?? 'matrix';

  // ── read the source row (the values to copy) ──
  const sourceRow = await opts.matrix.getRow(matrixTable, sectionTipo, sectionId);
  if (sourceRow === null) {
    throw new UnsupportedDuplicate(`source record ${sectionTipo}/${sectionId} not found`);
  }

  // are_all_properties_empty: PHP returns false when EVERY column is empty. A real
  // record always carries audit columns, so this never fires for a gated record; keep
  // the defensive check so an empty row declines (PHP returns false → no record).
  const anyData = PAYLOAD_COLUMNS.some((c) => {
    const v = sourceRow[c];
    return v !== null && v !== undefined && Object.keys(v as object).length > 0;
  });
  if (!anyData) {
    return { result: false, msg: 'OK. Request done', errors: [] };
  }

  const now = new Date();

  // ── build the create `values` (source columns + rebuilt data + new_record stamp) ──
  // The `data` column is REBUILT (build_metadata) — the source `data` is discarded.
  const label =
    (await opts.ontology.getLabel(sectionTipo, opts.langConfig.dataLang, [], true)) ?? '';
  const dataColumn = {
    label,
    created_date: formatDbTimestamp(now),
    section_id: null,
    section_tipo: sectionTipo,
    diffusion_info: null,
    created_by_user_id: userId,
  };

  // Copy every source payload column verbatim, then merge the new_record stamp:
  // relation.dd200 (created_by_user) + date.dd199 (created_date) OVERRIDE the source.
  const values: Partial<Record<MatrixFamily, unknown>> = { data: dataColumn };
  for (const col of PAYLOAD_COLUMNS) {
    const v = sourceRow[col];
    if (v === null || v === undefined) continue;
    // Shallow-clone the column object so the stamp merge does not mutate the read row.
    values[col] = col === 'relation' || col === 'date' ? { ...(v as object) } : v;
  }
  // relation.dd200 (created_by_user) stamp.
  {
    const rel = (values.relation as Record<string, unknown> | undefined) ?? {};
    rel[CREATED_BY_USER_TIPO] = [buildUserLocator(userId, CREATED_BY_USER_TIPO)];
    values.relation = rel;
  }
  // date.dd199 (created_date) stamp.
  {
    const dat = (values.date as Record<string, unknown> | undefined) ?? {};
    dat[CREATED_DATE_TIPO] = [buildDateItem(now)];
    values.date = dat;
  }

  // ── plan the per-component re-save cascade BEFORE the write (so a declined model
  //    fails closed without having created a row). Iterate the source columns in PHP
  //    order; for each component tipo, resolve its model + gate it. ──
  const resaves: ResaveComponent[] = [];
  for (const col of PAYLOAD_COLUMNS) {
    if (SKIP_COLUMNS.has(col)) continue; // data/meta/relation_search columns skipped
    const colData = sourceRow[col];
    if (colData === null || colData === undefined || typeof colData !== 'object') continue;
    for (const [tipo, items] of Object.entries(colData as Record<string, unknown>)) {
      if (items === null) continue; // PHP: $component_data===null → skip
      if (SECTION_INFO_TIPOS.has(tipo)) continue; // dd196 audit group skipped
      const model = await opts.ontology.getModelByTipo(tipo);
      if (model === null) {
        throw new UnsupportedDuplicate(`cannot resolve model for component ${tipo}`);
      }
      if (MEDIA_COMPONENT_MODELS.has(model)) {
        throw new UnsupportedDuplicate(`media component ${tipo} (${model}) — un-ported duplicate_component_media_files`);
      }
      if (model === 'component_portal') {
        throw new UnsupportedDuplicate(`portal component ${tipo} — un-ported portal duplicate`);
      }
      if (model === 'component_relation_parent' || model === 'component_relation_children') {
        throw new UnsupportedDuplicate(`relation_parent/children component ${tipo} — relation_search index un-ported`);
      }
      const column = RESAVE_MODEL_COLUMN[model];
      if (column === undefined) {
        throw new UnsupportedDuplicate(`component model ${model} (${tipo}) re-save not ported`);
      }
      if (column !== col) {
        // A component stored in an unexpected family column → divergent shape, decline.
        throw new UnsupportedDuplicate(`component ${tipo} (${model}) in unexpected column ${col}`);
      }
      // Translatable components produce per-lang TM rows the loop's single save does
      // not reproduce here → decline. (All supported models are nolan, but a
      // translatable input_text/text_area would slip through without this guard.)
      if (
        (model === 'component_input_text' || model === 'component_text_area') &&
        (await opts.ontology.getTranslatable(tipo))
      ) {
        throw new UnsupportedDuplicate(`translatable component ${tipo} — per-lang re-save not ported`);
      }
      if (!Array.isArray(items)) {
        throw new UnsupportedDuplicate(`component ${tipo} data is not an array`);
      }
      const sourceCounter = readMetaCounter(sourceRow.meta, tipo);
      const counter = Math.max(sourceCounter, maxItemId(items));
      resaves.push({
        column,
        tipo,
        value: items as ComponentDatum[],
        counter,
        model,
      });
    }
  }

  // ── allocate + INSERT (txn) + 'NEW' activity + per-component re-save cascade, all on
  //    the RESERVED connection (the advisory lock is txn-scoped → INSERT inside txn). ──
  const writeSession: DbSession = await opts.db.reserve();
  let newSectionId: number;
  try {
    newSectionId = await writeSession.transaction((tx) =>
      MatrixDbManager.create(tx, matrixTable, sectionTipo, values),
    );

    // 'NEW' activity row (no time-machine row on create).
    await SaveSideEffectsDbManager.createNewActivity(writeSession, {
      sectionTipo,
      sectionId: newSectionId,
      table: matrixTable,
      userId,
      ip: opts.session.ip ?? 'localhost',
    });

    // per-component re-save cascade. PHP saves each component in source-column order;
    // each save: matrix UPDATE (component column VERBATIM + dd201 + dd197 + meta
    // counter) → ONE time-machine row (full lang slice = source value, NO synthetic
    // prior — the INSERTed value already equals the post-save value) → ONE 'SAVE'
    // activity row.
    for (const rs of resaves) {
      const updates: MatrixKeyUpdate[] = [
        { column: rs.column, key: rs.tipo, value: rs.value },
        { column: 'date', key: MODIFIED_DATE_TIPO, value: [buildDateItem(now)] },
        {
          column: 'relation',
          key: MODIFIED_BY_USER_TIPO,
          value: [buildUserLocator(userId, MODIFIED_BY_USER_TIPO)],
        },
        { column: 'meta', key: rs.tipo, value: [{ count: rs.counter }] },
      ];
      const ok = await MatrixDbManager.updateByKey(
        writeSession,
        matrixTable,
        sectionTipo,
        newSectionId,
        updates,
      );
      if (!ok) {
        throw new UnsupportedDuplicate(`re-save UPDATE affected no row for ${rs.tipo}`);
      }

      // time-machine snapshot (lg-nolan; data = the verbatim source component value).
      await SaveSideEffectsDbManager.createTimeMachine(writeSession, {
        sectionId: newSectionId,
        sectionTipo,
        tipo: rs.tipo,
        lang: DEDALO_DATA_NOLAN,
        data: rs.value.length === 0 ? null : rs.value,
        userId,
        bulkProcessId: null,
        now,
      });

      // 'SAVE' activity row. The log_data.section_id is the NEW (int) record id — a
      // server-side compound op passes the just-allocated id as an INTEGER (not the
      // request string id), matching the live capture (section_id: <new int>).
      await SaveSideEffectsDbManager.createSaveActivity(writeSession, {
        tipo: rs.tipo,
        sectionId: newSectionId,
        logSectionId: newSectionId,
        sectionTipo,
        lang: DEDALO_DATA_NOLAN,
        componentName: rs.model,
        table: matrixTable,
        userId,
        ip: opts.session.ip ?? 'localhost',
        now,
      });
    }
  } finally {
    writeSession.release();
  }

  return {
    result: newSectionId,
    msg: 'OK. Request done',
    errors: [],
  };
}
