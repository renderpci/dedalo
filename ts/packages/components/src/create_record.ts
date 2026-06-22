/**
 * Port of the dd_core_api `create` action — CREATE, the C in CRUD: insert a brand
 * new section record and return its newly-allocated section_id.
 *
 * PHP path (class.dd_core_api.php::create → section::create_record →
 * section_record::create → matrix_db_manager::create):
 *
 *   1. perm gate: section permission >= 2 (root → 3).
 *   2. build the fresh-row `values`:
 *        - metadata (section_record::build_metadata) → the `data` column:
 *            { label, created_date, section_id:null, section_tipo,
 *              diffusion_info:null, created_by_user_id }
 *          (build_metadata is called BEFORE the insert, so section_id is null and
 *           created_date is the DB-format timestamp string).
 *        - modification_data (section_record::build_modification_data 'new_record')
 *          → relation.dd200 (created_by_user locator) + date.dd199 (created_date).
 *   3. matrix_db_manager::create: the ADVISORY-LOCK ALLOCATOR — inside a transaction,
 *      pg_advisory_xact_lock(hashtext(section_tipo)) + the matrix_counter upsert,
 *      then INSERT the fresh row with section_id = the allocated counter value.
 *   4. log a 'NEW' activity row (logger_backend_activity → matrix_activity). NO
 *      time-machine row is written on create (verified live).
 *   5. response = { result:<new section_id>, msg:'OK. Request done', errors:[] }.
 *
 * SCOPE — the NARROW first create. The caller (canHandleCreate) declines anything
 * but a plain create of a SIMPLE all-input_text-family section (no portals/media/
 * dataframe specials), with a logged user, and the supported section_tipo set.
 * Everything declined proxies to PHP.
 */

import type { Db, DbSession } from '@dedalo/db';
import { MatrixDbManager, SaveSideEffectsDbManager } from '@dedalo/db';
import type { OntologyRepository } from '@dedalo/ontology';
import type { LangConfig } from './lang_config.ts';
import { resolveMatrixTable } from './matrix_table.ts';

/** The fixed metadata tipos (PHP section::get_metadata_definition, 'new_record'). */
const CREATED_BY_USER_TIPO = 'dd200'; // relation column
const CREATED_DATE_TIPO = 'dd199'; // date column
const DEDALO_SECTION_USERS_TIPO = 'dd128';
const DEDALO_RELATION_TYPE_LINK = 'dd151';
const DEDALO_DATA_NOLAN = 'lg-nolan';
/** The activity-log section (dd542) is never created through this path. */
const DEDALO_ACTIVITY_SECTION_TIPO = 'dd542';

/** The create RQO source block. */
export interface CreateSource {
  section_tipo: string;
}

export interface CreateRecordRequest {
  source: CreateSource;
}

/** Session info needed to stamp audit metadata + gate permissions. */
export interface CreateSessionInfo {
  /** The logged user's id (logged_user_id()): the created_by_user locator section_id. */
  userId: number | null;
  /** Global-admin / root → permission 3 (write). */
  isGlobalAdmin: boolean;
  /** The request source IP for the activity IP column ('::1' → 'localhost'). */
  ip?: string;
}

export interface CreateRecordOptions {
  db: Db;
  ontology: OntologyRepository;
  langConfig: LangConfig;
  session: CreateSessionInfo;
}

export interface CreateResult {
  result: unknown;
  msg: string;
  errors: string[];
}

/** Thrown for an input the create path declines (caller should proxy). */
export class UnsupportedCreate extends Error {}

/**
 * Format a JS Date as the PostgreSQL timestamp string PHP writes for the metadata
 * `created_date` (dd_date::get_timestamp_now_for_db → 'Y-m-d H:i:s', local time,
 * seconds precision). Volatile; the harness normalizes it. Reproduced exactly so
 * the column shape/type matches PHP.
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
 * fields. PHP insertion order is year,month,day,hour,minute,second,time; JSONB
 * normalizes keys anyway, so only the leaf VALUES (all volatile clock) matter.
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

/**
 * Execute the section-record CREATE. Allocates the section_id via the advisory-lock
 * allocator and INSERTs the fresh row inside ONE transaction on a RESERVED
 * per-request connection (so the transaction-scoped advisory lock is held until
 * commit, matching PHP's DBi::transaction wrapper around matrix_db_manager::create).
 * Then writes the 'NEW' activity row.
 *
 * @throws UnsupportedCreate when the input hits a declined case (activity section,
 *   no logged user). The caller proxies to PHP.
 */
export async function createRecord(
  req: CreateRecordRequest,
  opts: CreateRecordOptions,
): Promise<CreateResult> {
  const sectionTipo = req.source.section_tipo;
  if (typeof sectionTipo !== 'string' || sectionTipo === '') {
    return {
      result: false,
      msg: 'API Error: (create) Empty section_tipo (is mandatory)',
      errors: [],
    };
  }

  // ── permission gate (perm >= 2). Root/global-admin → 3. ──
  const permission = opts.session.isGlobalAdmin ? 3 : 0;
  if (permission < 2) {
    return {
      result: false,
      msg: `Error. You don't have enough permissions to create a record in this section (${sectionTipo}). permissions:${permission}`,
      errors: ['insufficient permissions'],
    };
  }

  // The activity section is logger-managed; never created through this path.
  if (sectionTipo === DEDALO_ACTIVITY_SECTION_TIPO) {
    throw new UnsupportedCreate('activity section is not created through this path');
  }

  // build_metadata / build_modification_data require a logged user; without one PHP
  // returns an empty audit path (a different write shape). Decline → proxy.
  const userId = opts.session.userId;
  if (userId === null) {
    throw new UnsupportedCreate('no logged user id for the created_by_user stamp');
  }

  // ── build the fresh-row `values` (metadata + 'new_record' modification data) ──
  const now = new Date();

  // metadata → the `data` column. section_id is null (built before the insert);
  // label is the section term in the data lang (get_term_by_tipo($tipo,null,true)).
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

  // modification_data 'new_record' → relation.dd200 + date.dd199.
  // created_by_user locator (build_modification_data: id:1, type LINK, section_id is
  // the STRING user id, from_component_tipo dd200). NO `lang` on the relation item.
  const relationColumn = {
    [CREATED_BY_USER_TIPO]: [
      {
        id: 1,
        type: DEDALO_RELATION_TYPE_LINK,
        section_id: String(userId),
        section_tipo: DEDALO_SECTION_USERS_TIPO,
        from_component_tipo: CREATED_BY_USER_TIPO,
      },
    ],
  };
  // created_date date item ({ start, id:1, lang:'lg-nolan' }).
  const dateColumn = {
    [CREATED_DATE_TIPO]: [{ start: buildDateNowStart(now), id: 1, lang: DEDALO_DATA_NOLAN }],
  };

  const values = {
    data: dataColumn,
    relation: relationColumn,
    date: dateColumn,
  };

  const matrixTable = (await resolveMatrixTable(opts.ontology, sectionTipo)) ?? 'matrix';

  // ── allocate + INSERT inside a transaction on the RESERVED connection, then write
  //    the 'NEW' activity row (PHP order: create → log_message 'NEW'). The advisory
  //    lock is transaction-scoped, so the INSERT MUST be inside the transaction. ──
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
  } finally {
    writeSession.release();
  }

  return {
    result: newSectionId,
    msg: 'OK. Request done',
    errors: [],
  };
}
