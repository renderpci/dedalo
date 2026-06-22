import type { DbSession } from './session.ts';

/**
 * The two PHP save SIDE-EFFECT writers, ported faithfully.
 *
 * Every PHP component save (component_common::save) writes, AFTER the matrix
 * UPDATE, two extra rows:
 *
 *   1. a TIME-MACHINE snapshot row in `matrix_time_machine` (tm_record::create →
 *      tm_db_manager::create) — the post-save lang slice of the component, keyed
 *      by (section_id, section_tipo, tipo, lang) + who/when.
 *   2. an ACTIVITY-LOG row in `matrix_activity` (logger_backend_activity →
 *      matrix_activity_db_manager::create) — a virtual dd542 section record with
 *      the IP / WHO / WHAT('SAVE') / WHERE(tipo) / WHEN / DATA(log_data) columns.
 *
 * Both writers run on the RESERVED per-request connection (the same DbSession the
 * matrix UPDATE used), so they are instance-independent statics taking the write
 * session explicitly — they never touch the read pool and hold NO module state.
 *
 * id allocation:
 *   - matrix_time_machine.id  → SERIAL ('matrix_time_machine_id_seq'); the INSERT
 *     RETURNs it (tm_db_manager::create returns the new id).
 *   - matrix_activity.id      → SERIAL ('matrix_activity_id_seq'); the INSERT does
 *     NOT return it (the PHP manager returns a sentinel 1). matrix_activity.section_id
 *     is itself a SEQUENCE ('matrix_activity_section_id_seq') — NOT in the column
 *     list; Postgres assigns it. Neither uses the advisory-lock matrix_counter the
 *     normal section_id allocation uses.
 *
 * Column sets verified against the live test DB (`dedalo7_mib_test`) — a real PHP
 * save of oh1/1/oh14 produced exactly these rows (see the harness side-row diff).
 */

/** A write-capable session: the reserved per-request connection (query()). */
type WriteSession = Pick<DbSession, 'query'>;

/** The fixed activity-log tipos (logger_backend_activity). */
const ACTIVITY_SECTION_TIPO = 'dd542'; // DEDALO_ACTIVITY_SECTION_TIPO
const ACTIVITY_EVENTS_SECTION_TIPO = 'dd42'; // dd42 — the 'Activity events' section
const DEDALO_SECTION_USERS_TIPO = 'dd128';
const DEDALO_RELATION_TYPE_LINK = 'dd151';
const DEDALO_DATA_NOLAN = 'lg-nolan';
/** logger_backend_activity::$what['SAVE'] → dd42 section_id 5. */
const WHAT_SAVE_SECTION_ID = 5;
/** logger_backend_activity::$what['NEW'] → dd42 section_id 3. */
const WHAT_NEW_SECTION_ID = 3;
/** logger_backend_activity::$what['DELETE'] → dd42 section_id 4. */
const WHAT_DELETE_SECTION_ID = 4;
/** The five activity component tipos (IP/WHO/WHAT/WHERE/WHEN/DATA). */
const ACTIVITY_TIPO_IP = 'dd544'; // string column
const ACTIVITY_TIPO_WHO = 'dd543'; // relation column
const ACTIVITY_TIPO_WHAT = 'dd545'; // relation column
const ACTIVITY_TIPO_WHERE = 'dd546'; // string column
const ACTIVITY_TIPO_WHEN = 'dd547'; // date column
const ACTIVITY_TIPO_DATA = 'dd551'; // misc column

/**
 * Format a JS Date as the PostgreSQL timestamp string PHP writes for the TM row
 * (`dd_date::get_timestamp_now_for_db()` → DateTime->format('Y-m-d H:i:s'), local
 * time, SECONDS precision). This is a volatile leaf the harness normalizes; we
 * reproduce the exact format so the column shape (and type) matches PHP.
 */
function formatDbTimestamp(now: Date): string {
  const p = (n: number, w = 2): string => String(n).padStart(w, '0');
  return (
    `${p(now.getFullYear(), 4)}-${p(now.getMonth() + 1)}-${p(now.getDate())} ` +
    `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`
  );
}

/**
 * The dd_date 'start' leaf for the activity WHEN column — component_date::get_date_now():
 * { year,month,day,hour,minute,second, time } where time is convert_date_to_seconds
 * (virtual 372-day years, 31-day months, month/day -1). NO id/lang on the WHEN start
 * (the activity WHEN item is { start: <dd_date> } — see the live row).
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

/** Values for one matrix_time_machine row (tm_db_manager::$columns). */
export interface TimeMachineValues {
  sectionId: number;
  sectionTipo: string;
  /** Component tipo (the changed component). */
  tipo: string;
  lang: string;
  /** The snapshotted datum: the POST-save lang slice (get_time_machine_data_to_save). */
  data: unknown;
  /** The acting user id (logged_user_id), stored as a varchar(8) string. */
  userId: number | string | null;
  /** Optional enclosing bulk-process id (null for a normal save). */
  bulkProcessId?: number | null;
  /** Override the server timestamp (defaults to now). */
  now?: Date;
}

/** Context needed to write the 'NEW' activity row (logger_backend_activity). */
export interface NewActivityValues {
  /** The created section_tipo → the WHERE column (dd546). */
  sectionTipo: string;
  /** The newly-allocated section_id → log_data.section_id (an INT, not string). */
  sectionId: number;
  /** The matrix table of the section (common::get_matrix_table_from_tipo). */
  table: string;
  /** The acting user id (logged_user_id), or null. */
  userId: number | string | null;
  /** The source request IP (REMOTE_ADDR; '::1' normalized to 'localhost'). */
  ip: string;
  /** Override the server timestamp (defaults to now). */
  now?: Date;
}

/** Context needed to write the 'SAVE' activity row (logger_backend_activity). */
export interface SaveActivityValues {
  /** The changed component tipo → the WHERE column (dd546). */
  tipo: string;
  sectionId: number | string;
  sectionTipo: string;
  lang: string;
  /** Component class name (get_called_class) → log_data.component_name. */
  componentName: string;
  /** The matrix table of the section (common::get_matrix_table_from_tipo). */
  table: string;
  /** The acting user id (logged_user_id), or null. */
  userId: number | string | null;
  /** The source request IP (REMOTE_ADDR; '::1' normalized to 'localhost'). */
  ip: string;
  /** Override the server timestamp (defaults to now). */
  now?: Date;
}

/** Context needed to write the 'DELETE' activity row (logger_backend_activity). */
export interface DeleteActivityValues {
  /** The deleted section_tipo → the WHERE column (dd546) AND log_data.tipo/section_tipo. */
  sectionTipo: string;
  /** The deleted section_id → log_data.section_id (an INT, not string). */
  sectionId: number;
  /** The matrix table of the section (common::get_matrix_table_from_tipo). */
  table: string;
  /** The acting user id (logged_user_id), or null. */
  userId: number | string | null;
  /** The source request IP (REMOTE_ADDR; '::1' normalized to 'localhost'). */
  ip: string;
  /** Override the server timestamp (defaults to now). */
  now?: Date;
}

/**
 * The exact `msg` literal section_record::delete logs for the DELETE activity bag
 * (the __METHOD__ prefix is the fully-qualified PHP method name). Compared verbatim.
 */
const DELETE_LOG_MSG =
  'DEBUG INFO section_record::delete Deleted section record and its own references. Full deleted record';

/**
 * The PHP save side-effect writers (time machine + activity), ported to TS.
 * Statics taking the reserved write session explicitly; no module-global state.
 */
export class SaveSideEffectsDbManager {
  /**
   * Port of tm_db_manager::create — INSERT one matrix_time_machine row.
   *
   * Columns (tm_db_manager::$columns order, `id` excluded — SERIAL):
   *   section_id, section_tipo, tipo, lang, timestamp, user_id, bulk_process_id, data
   * Only `data` is JSONB (the json_columns set); the rest are scalar. PHP casts the
   * data placeholder `$N::jsonb`; postgres.js serializes a JS array/object param to
   * jsonb directly, so we bind the raw value (a JSON.stringify'd string + ::jsonb
   * would double-encode to a jsonb STRING scalar). RETURNING id mirrors PHP.
   *
   * Returns the new row id.
   */
  static async createTimeMachine(
    session: WriteSession,
    values: TimeMachineValues,
  ): Promise<number> {
    const now = values.now ?? new Date();
    const sql =
      'INSERT INTO "matrix_time_machine" ' +
      '("section_id", "section_tipo", "tipo", "lang", "timestamp", "user_id", "bulk_process_id", "data") ' +
      'VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING "id"';
    const params: unknown[] = [
      values.sectionId,
      values.sectionTipo,
      values.tipo,
      values.lang,
      formatDbTimestamp(now),
      values.userId === null ? null : String(values.userId),
      values.bulkProcessId ?? null,
      // raw value → postgres.js binds as jsonb (NOT JSON.stringify'd).
      values.data ?? null,
    ];
    const rows = await session.query<{ id: number }>(sql, params);
    const id = rows[0]?.id;
    if (id === undefined) {
      throw new Error('createTimeMachine: INSERT returned no id');
    }
    return id;
  }

  /**
   * tm_record::create's "save-before" repair pre-check: is there ALREADY a TM row
   * for (section_id, section_tipo, tipo, lang)? PHP only inserts a synthetic
   * previous-data row (timestamped one minute back) when NONE exists AND the
   * previous data differs from the new data. Returns the row count (capped at 1).
   */
  static async countTimeMachineRows(
    session: WriteSession,
    sectionId: number,
    sectionTipo: string,
    tipo: string,
    lang: string,
  ): Promise<number> {
    const rows = await session.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM "matrix_time_machine" ' +
        'WHERE section_id = $1 AND section_tipo = $2 AND tipo = $3 AND lang = $4',
      [sectionId, sectionTipo, tipo, lang],
    );
    return rows[0]?.n ?? 0;
  }

  /**
   * Port of logger_backend_activity::log_message_defer + matrix_activity_db_manager::create
   * for a 'SAVE' event — INSERT one matrix_activity (dd542) row.
   *
   * matrix_activity_db_manager::create iterates matrix_db_manager::$columns,
   * INSERTing section_tipo first, then every column EXCEPT section_id (sequence)
   * and section_tipo. So the column order is:
   *   section_tipo, data, relation, string, date, iri, geo, number, media, misc,
   *   relation_search, meta
   * Only relation / string / date / misc carry values for a SAVE; the rest are NULL
   * (verified against the live row: data/iri/geo/number/media/relation_search/meta
   * are all SQL NULL). The JSONB columns are bound as raw JS objects (postgres.js →
   * jsonb). section_id is assigned by 'matrix_activity_section_id_seq'.
   *
   * The id is NOT returned (PHP returns a sentinel); the harness watermarks by
   * max(id) and deletes id > watermark, so no id is needed here.
   */
  static async createSaveActivity(
    session: WriteSession,
    values: SaveActivityValues,
  ): Promise<void> {
    const now = values.now ?? new Date();
    // DATA (dd551, misc) log_data — the SAVE bag (PHP build order; DB normalizes).
    const logData = {
      msg: 'Saved component data',
      tipo: values.tipo,
      section_id: String(values.sectionId),
      lang: values.lang,
      component_name: values.componentName,
      table: values.table,
      section_tipo: values.sectionTipo,
    };
    await SaveSideEffectsDbManager.insertActivityRow(session, {
      whatSectionId: WHAT_SAVE_SECTION_ID,
      // WHERE (dd546) — the changed component tipo.
      whereValue: values.tipo,
      userId: values.userId,
      ip: values.ip,
      logData,
      now,
    });
  }

  /**
   * Port of logger_backend_activity::log_message_defer for a 'NEW' event (the
   * activity row section::create_record writes after a successful INSERT).
   *
   * Identical row shape to the 'SAVE' activity, differing only in:
   *   - WHAT (dd545) → dd42 section_id 3 ('NEW'), not 5 ('SAVE').
   *   - WHERE (dd546) → the created section_tipo (e.g. 'oh1'), not a component tipo.
   *   - DATA (dd551) log_data → { msg:'Created section record', section_id (INT),
   *     section_tipo, tipo, table }. PHP passes section_id as an INTEGER here (the
   *     just-allocated id), so it is stored as a JSON number, NOT a string — this
   *     leaf is COMPARED verbatim (the section_id is the fixed new record id, not a
   *     sequence, so it is non-volatile and must match PHP).
   *
   * No time-machine row is written on create (verified live: create produces ONLY
   * this activity row, zero matrix_time_machine rows).
   */
  static async createNewActivity(
    session: WriteSession,
    values: NewActivityValues,
  ): Promise<void> {
    const now = values.now ?? new Date();
    // PHP build order: msg, section_id, section_tipo, tipo, table (JSONB normalizes).
    // section_id is the INT id (not stringified).
    const logData = {
      msg: 'Created section record',
      section_id: values.sectionId,
      section_tipo: values.sectionTipo,
      tipo: values.sectionTipo,
      table: values.table,
    };
    await SaveSideEffectsDbManager.insertActivityRow(session, {
      whatSectionId: WHAT_NEW_SECTION_ID,
      // WHERE (dd546) — the created section_tipo.
      whereValue: values.sectionTipo,
      userId: values.userId,
      ip: values.ip,
      logData,
      now,
    });
  }

  /**
   * Port of logger_backend_activity::log_message_defer for a 'DELETE' event (the
   * activity row section_record::delete writes at the end of the delete pipeline).
   *
   * Row shape identical to 'SAVE'/'NEW', differing only in:
   *   - WHAT (dd545) → dd42 section_id 4 ('DELETE').
   *   - WHERE (dd546) → the deleted section_tipo (e.g. 'oh1').
   *   - DATA (dd551) log_data → { msg:<DELETE_LOG_MSG>, section_id (INT), tipo,
   *     table, delete_mode:'delete_record', section_tipo }. PHP passes section_id as
   *     an INTEGER (the just-deleted id), so it is stored as a JSON number — COMPARED
   *     verbatim (the fixed deleted id, not a sequence). `delete_mode` is always
   *     'delete_record' for this path.
   *
   * Verified against the live test-DB delete: an oh1 delete produced exactly one
   * matrix_activity row with WHAT=4, WHERE='oh1', and this log_data bag.
   */
  static async createDeleteActivity(
    session: WriteSession,
    values: DeleteActivityValues,
  ): Promise<void> {
    const now = values.now ?? new Date();
    // PHP build order: msg, section_id, tipo, table, delete_mode, section_tipo
    // (JSONB normalizes keys). section_id is the INT id (not stringified).
    const logData = {
      msg: DELETE_LOG_MSG,
      section_id: values.sectionId,
      tipo: values.sectionTipo,
      table: values.table,
      delete_mode: 'delete_record',
      section_tipo: values.sectionTipo,
    };
    await SaveSideEffectsDbManager.insertActivityRow(session, {
      whatSectionId: WHAT_DELETE_SECTION_ID,
      // WHERE (dd546) — the deleted section_tipo.
      whereValue: values.sectionTipo,
      userId: values.userId,
      ip: values.ip,
      logData,
      now,
    });
  }

  /**
   * Shared INSERT for a matrix_activity (dd542) row — the IP/WHO/WHAT/WHERE/WHEN/DATA
   * structure built by logger_backend_activity::log_message_defer, parameterized on
   * the WHAT event (section_id), the WHERE value, and the DATA log_data bag.
   *
   * Column order = matrix_db_manager::$columns minus section_id (the
   * 'matrix_activity_section_id_seq' sequence assigns it), section_tipo first. Only
   * relation/string/date/misc carry values; the rest are SQL NULL. JSONB columns are
   * bound as raw JS objects (postgres.js → jsonb).
   */
  private static async insertActivityRow(
    session: WriteSession,
    opts: {
      whatSectionId: number;
      whereValue: string;
      userId: number | string | null;
      ip: string;
      logData: Record<string, unknown>;
      now: Date;
    },
  ): Promise<void> {
    const userId = opts.userId ?? '-666';

    // IP (dd544, string) — { value, lang }. WHERE (dd546, string) — the where value.
    const ip = opts.ip === '::1' ? 'localhost' : opts.ip;
    const stringCol: Record<string, unknown[]> = {
      [ACTIVITY_TIPO_IP]: [{ value: ip, lang: DEDALO_DATA_NOLAN }],
      [ACTIVITY_TIPO_WHERE]: [{ value: opts.whereValue, lang: DEDALO_DATA_NOLAN }],
    };

    // WHO (dd543, relation) — locator → users section. WHAT (dd545, relation) —
    // locator → dd42 'Activity events' / the event (section_id). Locator key order
    // matches PHP's serialization; JSONB storage normalizes anyway.
    const relationCol: Record<string, unknown[]> = {
      [ACTIVITY_TIPO_WHO]: [
        {
          type: DEDALO_RELATION_TYPE_LINK,
          section_id: String(userId),
          section_tipo: DEDALO_SECTION_USERS_TIPO,
          from_component_tipo: ACTIVITY_TIPO_WHO,
        },
      ],
      [ACTIVITY_TIPO_WHAT]: [
        {
          type: DEDALO_RELATION_TYPE_LINK,
          section_id: String(opts.whatSectionId),
          section_tipo: ACTIVITY_EVENTS_SECTION_TIPO,
          from_component_tipo: ACTIVITY_TIPO_WHAT,
        },
      ],
    };

    // WHEN (dd547, date) — { start: <dd_date> } (NO id/lang on the WHEN start item).
    const dateCol: Record<string, unknown[]> = {
      [ACTIVITY_TIPO_WHEN]: [{ start: buildDateNowStart(opts.now) }],
    };

    // DATA (dd551, misc) — { value: <log_data>, lang }.
    const miscCol: Record<string, unknown[]> = {
      [ACTIVITY_TIPO_DATA]: [{ value: opts.logData, lang: DEDALO_DATA_NOLAN }],
    };

    const sql =
      'INSERT INTO "matrix_activity" ' +
      '("section_tipo", "data", "relation", "string", "date", "iri", "geo", ' +
      '"number", "media", "misc", "relation_search", "meta") ' +
      'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)';
    const params: unknown[] = [
      ACTIVITY_SECTION_TIPO, // section_tipo
      null, // data
      relationCol, // relation
      stringCol, // string
      dateCol, // date
      null, // iri
      null, // geo
      null, // number
      null, // media
      miscCol, // misc
      null, // relation_search
      null, // meta
    ];
    await session.query(sql, params);
  }
}
