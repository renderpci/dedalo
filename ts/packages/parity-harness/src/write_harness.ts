/**
 * WRITE-PARITY harness — the mutation analogue of the read golden-master capture.
 *
 * A write parity run, against ONE endpoint and ONE TEST DB row, is:
 *   1. SNAPSHOT  — read every JSONB payload column of the target matrix row, plus
 *      max(id) of matrix_time_machine + matrix_activity (the "before" watermarks).
 *   2. APPLY     — log in to the endpoint, POST the save RQO with the session CSRF,
 *      capture the RAW response bytes (the response-envelope ground truth).
 *   3. READBACK  — re-read the same JSONB payload columns AFTER the write (the
 *      resulting-row ground truth).
 *   4. RESTORE   — UPDATE every payload column back to the snapshot value, and
 *      DELETE any matrix_time_machine / matrix_activity rows created since (id >
 *      the watermark). The DB is left byte-identical to before the run.
 *
 * The harness NEVER asserts on its own; a caller diffs two runs (PHP-vs-PHP
 * baseline) or a PHP run vs a TS run, normalising the volatile leaves first
 * (normalizeRowForDiff): the modified_date (dd201) time fields and the
 * modified_by_user (dd197) section_id (logged user id), which legitimately differ
 * per run/engine. The row STRUCTURE (every other key) must match exactly.
 *
 * SAFETY: this writes to a TEST DB only — the caller passes the dedicated test
 * connection. The restore runs in a `finally`, so a thrown apply/readback still
 * restores the row. There is NO live-DB code path here.
 */

import postgres, { type Sql } from 'postgres';
import { login } from './login.ts';

/** Connection to the TEST matrix DB (postgres.js). */
export interface WriteHarnessDbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/** The matrix row identity + the JSONB payload columns to snapshot/restore. */
export interface MatrixRowTarget {
  table: string;
  sectionTipo: string;
  sectionId: number;
}

/** The save RQO + the endpoint to apply it against. */
export interface WriteApply {
  /** JSON-API endpoint, e.g. http://localhost:8081/core/api/v1/json/. */
  apiUrl: string;
  /** Login username (root). */
  username: string;
  /** Login password. */
  password: string;
  /** The save RQO (action:'save', source, data) — CSRF is injected by the harness. */
  rqo: Record<string, unknown>;
}

/** Outcome of one write-parity run (one endpoint, one row). */
export interface WriteRunResult {
  /** RAW response body bytes from the apply POST (the envelope ground truth). */
  responseBytes: string;
  /** HTTP status of the apply POST. */
  status: number;
  /** The payload columns BEFORE the write (snapshot). */
  before: MatrixPayload;
  /** The payload columns AFTER the write (readback). */
  after: MatrixPayload;
  /**
   * The SIDE-TABLE rows the write CREATED (id > the pre-write watermark, per table),
   * captured before the restore/cleanup deletes them. Keyed by table name; rows are
   * the full column set (parsed JSONB), ordered by id ascending — the ground truth
   * for the time-machine + activity side-effect diff.
   */
  sideRows: SideRowsByTable;
}

/** Captured side-table rows (parsed columns), keyed by table, ordered by id asc. */
export type SideRowsByTable = Record<string, Array<Record<string, unknown>>>;

/**
 * The JSONB payload columns of a matrix row. These are the columns a save can
 * touch: the data families plus the 'data' metadata column. Stored as parsed JS
 * objects (postgres.js returns JSONB parsed). `null` = SQL NULL column.
 */
export interface MatrixPayload {
  data: unknown;
  relation: unknown;
  string: unknown;
  date: unknown;
  iri: unknown;
  geo: unknown;
  number: unknown;
  media: unknown;
  misc: unknown;
  relation_search: unknown;
  meta: unknown;
}

/** The payload columns, in a fixed order, that the harness snapshots + restores. */
const PAYLOAD_COLUMNS: ReadonlyArray<keyof MatrixPayload> = [
  'data',
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

const SAFE_IDENT = /^[a-z_][a-z0-9_]*$/;

function assertTable(table: string): void {
  if (!SAFE_IDENT.test(table)) {
    throw new Error(`Unsafe matrix table identifier: ${JSON.stringify(table)}`);
  }
}

/** Open a postgres.js connection to the test DB. Caller must end() it. */
export function openTestDb(cfg: WriteHarnessDbConfig): Sql {
  return postgres({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    username: cfg.user,
    password: cfg.password,
    max: 2,
    idle_timeout: 10,
    connect_timeout: 10,
    prepare: false,
  });
}

/** Read the JSONB payload columns of a matrix row (parsed objects), or throw if absent. */
export async function snapshotRow(sql: Sql, target: MatrixRowTarget): Promise<MatrixPayload> {
  assertTable(target.table);
  const cols = PAYLOAD_COLUMNS.join(', ');
  const rows = await sql.unsafe<Array<Record<string, unknown>>>(
    `SELECT ${cols} FROM "${target.table}" WHERE section_tipo = $1 AND section_id = $2 LIMIT 1`,
    [target.sectionTipo, target.sectionId],
  );
  const row = rows[0];
  if (row === undefined) {
    throw new Error(
      `Matrix row not found: ${target.table} ${target.sectionTipo}/${target.sectionId}`,
    );
  }
  const out = {} as MatrixPayload;
  for (const c of PAYLOAD_COLUMNS) out[c] = row[c] ?? null;
  return out;
}

/** Restore the payload columns of a matrix row to a snapshot (one UPDATE, all columns). */
export async function restoreRow(
  sql: Sql,
  target: MatrixRowTarget,
  snapshot: MatrixPayload,
): Promise<void> {
  assertTable(target.table);
  const sets: string[] = [];
  const params: unknown[] = [target.sectionTipo, target.sectionId];
  let p = 3;
  for (const c of PAYLOAD_COLUMNS) {
    const v = snapshot[c];
    // A null column is restored to SQL NULL; a value is restored as JSONB via
    // sql.json() — postgres.js would otherwise re-encode a JSON.stringify'd string
    // param a SECOND time, storing the object as a JSON *string* scalar (which
    // breaks the relation-flat GIN index's jsonb_each). sql.json() binds it as a
    // true jsonb object.
    sets.push(`"${c}" = $${p}`);
    params.push(v === null || v === undefined ? null : sql.json(v as never));
    p++;
  }
  await sql.unsafe(
    `UPDATE "${target.table}" SET ${sets.join(', ')} WHERE section_tipo = $1 AND section_id = $2`,
    params as never[],
  );
}

/** Max id of a side table (matrix_time_machine / matrix_activity), or 0 when empty. */
async function maxId(sql: Sql, table: string): Promise<number> {
  assertTable(table);
  const rows = await sql.unsafe<Array<{ max_id: number | null }>>(
    `SELECT max(id) AS max_id FROM "${table}"`,
    [],
  );
  return rows[0]?.max_id ?? 0;
}

/**
 * Capture (read) the rows of a side table created since a watermark (id > watermark),
 * ordered by id ascending — the rows the write created. Returns the full column set
 * (postgres.js parses JSONB to JS objects). Read-only; the caller deletes separately.
 */
async function captureSince(
  sql: Sql,
  table: string,
  watermark: number,
): Promise<Array<Record<string, unknown>>> {
  assertTable(table);
  const rows = await sql.unsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "${table}" WHERE id > $1 ORDER BY id ASC`,
    [watermark],
  );
  return rows.map((r) => ({ ...r }));
}

/** Delete rows of a side table created since a watermark (id > watermark). */
async function deleteSince(sql: Sql, table: string, watermark: number): Promise<number> {
  assertTable(table);
  const rows = await sql.unsafe<Array<{ id: number }>>(
    `DELETE FROM "${table}" WHERE id > $1 RETURNING id`,
    [watermark],
  );
  return rows.length;
}

/** Side tables whose new rows a write may create (TM snapshot + activity log). */
const SIDE_TABLES = ['matrix_time_machine', 'matrix_activity'] as const;

/**
 * Run ONE write-parity cycle against one endpoint: snapshot → apply → readback →
 * restore. Always restores the row + cleans side-table rows in a `finally`, even
 * when the apply/readback throws. Returns the response bytes + before/after rows.
 */
export async function runWriteParity(
  sql: Sql,
  target: MatrixRowTarget,
  apply: WriteApply,
): Promise<WriteRunResult> {
  // 1. snapshot the row + side-table watermarks.
  const before = await snapshotRow(sql, target);
  const watermarks: Record<string, number> = {};
  for (const t of SIDE_TABLES) watermarks[t] = await maxId(sql, t);

  let responseBytes = '';
  let status = 0;
  let after: MatrixPayload = before;
  const sideRows: SideRowsByTable = {};
  for (const t of SIDE_TABLES) sideRows[t] = [];

  try {
    // 2. apply: login + POST the save RQO with the session CSRF header.
    const session = await login(apply.apiUrl, apply.username, apply.password);
    const res = await fetch(apply.apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: session.cookie,
        'x-dedalo-csrf-token': session.csrfToken,
      },
      body: JSON.stringify(apply.rqo),
    });
    status = res.status;
    responseBytes = await res.text();

    // 3. readback the resulting row.
    after = await snapshotRow(sql, target);

    // 3b. capture the side-table rows the write created (id > watermark). PHP's
    // activity row is written at request shutdown, which can lag the HTTP response
    // slightly; settle + re-scan until the created rows stabilise (each save
    // creates exactly one TM row + one activity row, so we wait for both, capped).
    for (let attempt = 0; attempt < 6; attempt++) {
      let total = 0;
      for (const t of SIDE_TABLES) {
        sideRows[t] = await captureSince(sql, t, watermarks[t] ?? 0);
        total += sideRows[t].length;
      }
      // expect at least one row per side table; stop early once both are present.
      const allPresent = SIDE_TABLES.every((t) => (sideRows[t]?.length ?? 0) > 0);
      if (allPresent || (total > 0 && attempt >= 2)) break;
      await new Promise((r) => setTimeout(r, 150));
    }
  } finally {
    // 4. restore: row payload back to snapshot, then clean side-table rows.
    await restoreRow(sql, target, before);
    // PHP writes the activity/TM rows inside the request, but the commit can lag the
    // HTTP response slightly; a short settle + re-scan catches a late straggler so
    // the side tables are left exactly as before the run.
    for (let attempt = 0; attempt < 3; attempt++) {
      let deleted = 0;
      for (const t of SIDE_TABLES) deleted += await deleteSince(sql, t, watermarks[t] ?? 0);
      if (deleted === 0 && attempt > 0) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    // final sweep after the last settle window.
    for (const t of SIDE_TABLES) await deleteSince(sql, t, watermarks[t] ?? 0);
  }

  return { responseBytes, status, before, after, sideRows };
}

/**
 * Volatile-leaf normalizer for the READBACK matrix-row diff. Walks the parsed
 * payload and replaces, with stable sentinels:
 *   - date.dd201[*].start.{time,hour,minute,second,day,month,year}  — the
 *     modified_date clock (the whole `start` time leaf is volatile; a run can
 *     cross a minute/hour/day boundary, so every leaf is normalised — but the
 *     KEY SET is preserved, so a structural divergence still shows).
 *   - relation.dd197[*].section_id                                  — the
 *     modified_by_user logged-user id (PHP session user vs TS session user).
 * Everything else is compared verbatim. Returns a deep clone (inputs untouched).
 */
export function normalizeRowForDiff(payload: MatrixPayload): MatrixPayload {
  const clone = structuredClone(payload) as unknown as Record<string, unknown>;

  // date.dd201[*].start.<time leaves> → sentinel
  normalizeDateColumn(clone.date, 'dd201');
  // relation.dd197[*].section_id → sentinel
  normalizeRelationSectionId(clone.relation, 'dd197');

  return clone as unknown as MatrixPayload;
}

const VOLATILE_TIME_LEAVES = [
  'time',
  'hour',
  'minute',
  'second',
  'day',
  'month',
  'year',
] as const;

function normalizeDateColumn(col: unknown, tipo: string): void {
  if (col === null || typeof col !== 'object') return;
  const items = (col as Record<string, unknown>)[tipo];
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (item === null || typeof item !== 'object') continue;
    const start = (item as Record<string, unknown>).start;
    if (start === null || typeof start !== 'object') continue;
    const s = start as Record<string, unknown>;
    for (const leaf of VOLATILE_TIME_LEAVES) {
      if (Object.prototype.hasOwnProperty.call(s, leaf)) s[leaf] = '<volatile>';
    }
  }
}

function normalizeRelationSectionId(col: unknown, tipo: string): void {
  if (col === null || typeof col !== 'object') return;
  const items = (col as Record<string, unknown>)[tipo];
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (item === null || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(o, 'section_id')) o.section_id = '<volatile>';
  }
}

/**
 * Volatile-leaf normalizer for the SIDE-TABLE row diff (time-machine + activity).
 * Returns a deep clone with the volatile leaves replaced by stable sentinels so a
 * STRUCTURAL divergence still shows but a legitimate per-run/per-engine difference
 * does not. Volatile leaves, by table:
 *
 *   matrix_time_machine:
 *     id         — SERIAL sequence
 *     timestamp  — server wall-clock (Y-m-d H:i:s)
 *     user_id    — acting user (PHP session user vs TS session user)
 *     (data has NO volatile leaf: the saved value is the fixed WP_VALUE.)
 *
 *   matrix_activity:
 *     id                       — SERIAL sequence
 *     section_id               — 'matrix_activity_section_id_seq' sequence
 *     timestamp                — DEFAULT now() (microseconds)
 *     relation.dd543[*].section_id  — WHO = acting user id
 *     string.dd544[*].value         — IP (REMOTE_ADDR; PHP/TS host differ)
 *     date.dd547[*].start.<time leaves> — WHEN clock
 *
 * The activity misc.dd551 log_data (msg/tipo/section_id/lang/component_name/table/
 * section_tipo) is COMPARED verbatim — its section_id is the FIXED record id "1",
 * not the sequence, so it is NOT volatile.
 */
export function normalizeSideRowForDiff(
  table: string,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const clone = structuredClone(row);

  // common volatile scalar leaves.
  if ('id' in clone) clone.id = '<volatile>';
  if ('timestamp' in clone) clone.timestamp = '<volatile>';

  if (table === 'matrix_time_machine') {
    if ('user_id' in clone) clone.user_id = '<volatile>';
  } else if (table === 'matrix_activity') {
    if ('section_id' in clone) clone.section_id = '<volatile>';
    // WHO locator user id.
    normalizeRelationSectionId(clone.relation, 'dd543');
    // IP value.
    normalizeStringValue(clone.string, 'dd544');
    // WHEN clock leaves.
    normalizeDateColumn(clone.date, 'dd547');
  }

  return clone;
}

/** Replace string.<tipo>[*].value with a sentinel (the IP column). */
function normalizeStringValue(col: unknown, tipo: string): void {
  if (col === null || typeof col !== 'object') return;
  const items = (col as Record<string, unknown>)[tipo];
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (item === null || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(o, 'value')) o.value = '<volatile>';
  }
}

/**
 * Canonicalize a captured side-table row (volatile-normalized) to a stable JSON
 * string for the differ. JSONB columns come back key-sorted by storage order
 * (identical for both engines); the stable stringify sorts keys defensively.
 */
export function canonicalizeSideRow(
  table: string,
  row: Record<string, unknown>,
): string {
  return stableStringify(normalizeSideRowForDiff(table, row));
}

/**
 * Canonicalize a payload column to a STABLE JSON string for the differ: postgres
 * returns JSONB with keys in storage (not insertion) order, and that order is
 * identical for both engines (the DB sorts), so a plain JSON.stringify of the
 * already-parsed object yields a byte-stable, engine-independent string. We sort
 * object keys to be defensive against any parse-order drift between runs.
 */
export function canonicalizePayload(payload: MatrixPayload): string {
  return stableStringify(payload);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${parts.join(',')}}`;
}

// ───────────────────────────── CREATE parity ──────────────────────────────────
//
// A CREATE parity run is the analogue of the UPDATE run, but the target row does
// not exist yet — the section_id is ALLOCATED by the write (advisory-lock counter).
// The cycle is:
//   1. SNAPSHOT  — read the matrix_counter value for the section_tipo, plus max(id)
//      of matrix_time_machine + matrix_activity (the side-table watermarks).
//   2. APPLY     — login + POST the create RQO, capture the response bytes + the new
//      section_id (response.result).
//   3. READBACK  — read the newly-INSERTed matrix row (the fresh-row payload) + the
//      'NEW' activity row the create wrote (filtered out of the watermark window;
//      the login also writes activity rows, so we select by the WHAT=NEW locator).
//   4. RESET     — DELETE the created matrix row, RESTORE the counter to its prior
//      value, and DELETE every side-table row since the watermark. This leaves the
//      DB in the EXACT pre-run state so the NEXT engine allocates the SAME id.
//
// The PHP and TS runs each start from the same reset state, so both MUST allocate
// the identical section_id from the identical counter value.

/** The create RQO (action:'create', source.section_tipo) + endpoint. */
export interface CreateApply {
  apiUrl: string;
  username: string;
  password: string;
  /** The create RQO — CSRF is injected by the harness. */
  rqo: Record<string, unknown>;
}

/** Outcome of one CREATE-parity run. */
export interface CreateRunResult {
  /** RAW response body bytes from the apply POST. */
  responseBytes: string;
  /** HTTP status of the apply POST. */
  status: number;
  /** The section_id the create allocated (response.result), or null on failure. */
  newSectionId: number | null;
  /** The counter value BEFORE the create (snapshot). */
  counterBefore: number | null;
  /** The counter value AFTER the create (readback). */
  counterAfter: number | null;
  /** The fresh matrix row's JSONB payload columns (readback), or null if absent. */
  row: MatrixPayload | null;
  /**
   * The 'NEW' activity row the create wrote (the dd542 row whose WHAT locator dd545
   * → dd42 section_id 3). The login also writes activity rows in the same watermark
   * window, so we isolate the NEW row by its WHAT marker. Empty array if none found.
   */
  newActivityRows: Array<Record<string, unknown>>;
}

/** Read the matrix_counter value for a tipo (the counter that allocates section_id). */
async function readCounter(sql: Sql, counterTable: string, tipo: string): Promise<number | null> {
  assertTable(counterTable);
  const rows = await sql.unsafe<Array<{ value: number | null }>>(
    `SELECT value FROM "${counterTable}" WHERE tipo = $1 LIMIT 1`,
    [tipo],
  );
  return rows[0]?.value ?? null;
}

/** Restore the matrix_counter value for a tipo (UPSERT to the snapshot value). */
async function restoreCounter(
  sql: Sql,
  counterTable: string,
  tipo: string,
  value: number | null,
): Promise<void> {
  assertTable(counterTable);
  if (value === null) {
    // The counter row did not exist before the run → delete the one the create made.
    await sql.unsafe(`DELETE FROM "${counterTable}" WHERE tipo = $1`, [tipo]);
    return;
  }
  await sql.unsafe(
    `INSERT INTO "${counterTable}" (tipo, value) VALUES ($1, $2) ` +
      `ON CONFLICT (tipo) DO UPDATE SET value = $2`,
    [tipo, value],
  );
}

/** The counter table for a matrix table ('_dd' → matrix_counter_dd; else matrix_counter). */
function counterTableFor(table: string): string {
  return table.endsWith('_dd') ? 'matrix_counter_dd' : 'matrix_counter';
}

/** Read the full fresh row payload columns for (section_tipo, section_id), or null. */
async function readRowPayload(
  sql: Sql,
  table: string,
  sectionTipo: string,
  sectionId: number,
): Promise<MatrixPayload | null> {
  assertTable(table);
  const cols = PAYLOAD_COLUMNS.join(', ');
  const rows = await sql.unsafe<Array<Record<string, unknown>>>(
    `SELECT ${cols} FROM "${table}" WHERE section_tipo = $1 AND section_id = $2 LIMIT 1`,
    [sectionTipo, sectionId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  const out = {} as MatrixPayload;
  for (const c of PAYLOAD_COLUMNS) out[c] = row[c] ?? null;
  return out;
}

/**
 * Select the 'NEW' activity rows created since a watermark — the dd542 rows whose
 * WHAT relation (dd545) locator points to dd42 section_id '3' (logger_backend_activity
 * $what['NEW']). This isolates the create's activity row from the login activity
 * rows that share the same id-watermark window.
 */
async function captureNewActivityRows(
  sql: Sql,
  watermark: number,
): Promise<Array<Record<string, unknown>>> {
  const rows = await sql.unsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "matrix_activity" WHERE id > $1 ` +
      `AND relation -> 'dd545' -> 0 ->> 'section_id' = '3' ` +
      `ORDER BY id ASC`,
    [watermark],
  );
  return rows.map((r) => ({ ...r }));
}

/**
 * Run ONE create-parity cycle: snapshot (counter + watermarks) → apply (POST create)
 * → readback (counter + fresh row + NEW activity row) → reset (delete the created
 * row, restore the counter, delete side rows). Always resets in a `finally`, even
 * when the apply throws, so the next engine allocates the SAME id.
 */
export async function runCreateParity(
  sql: Sql,
  target: { table: string; sectionTipo: string },
  apply: CreateApply,
): Promise<CreateRunResult> {
  assertTable(target.table);
  const counterTable = counterTableFor(target.table);

  // 1. snapshot the counter + side-table watermarks.
  const counterBefore = await readCounter(sql, counterTable, target.sectionTipo);
  const watermarks: Record<string, number> = {};
  for (const t of SIDE_TABLES) watermarks[t] = await maxId(sql, t);

  let responseBytes = '';
  let status = 0;
  let newSectionId: number | null = null;
  let counterAfter: number | null = counterBefore;
  let row: MatrixPayload | null = null;
  let newActivityRows: Array<Record<string, unknown>> = [];

  try {
    // 2. apply: login + POST the create RQO.
    const session = await login(apply.apiUrl, apply.username, apply.password);
    const res = await fetch(apply.apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: session.cookie,
        'x-dedalo-csrf-token': session.csrfToken,
      },
      body: JSON.stringify(apply.rqo),
    });
    status = res.status;
    responseBytes = await res.text();
    const parsed = JSON.parse(responseBytes) as { result?: unknown };
    const r = parsed.result;
    newSectionId = typeof r === 'number' ? r : Number.isNaN(Number(r)) ? null : Number(r);

    // 3. readback: counter, the fresh row, and the NEW activity row. The activity
    // row is written at PHP request shutdown, which can lag the response; settle +
    // re-scan until the NEW row appears (capped).
    counterAfter = await readCounter(sql, counterTable, target.sectionTipo);
    if (newSectionId !== null) {
      row = await readRowPayload(sql, target.table, target.sectionTipo, newSectionId);
    }
    for (let attempt = 0; attempt < 6; attempt++) {
      newActivityRows = await captureNewActivityRows(sql, watermarks.matrix_activity ?? 0);
      if (newActivityRows.length > 0) break;
      await new Promise((r2) => setTimeout(r2, 150));
    }
  } finally {
    // 4. reset: delete the created matrix row, restore the counter, delete side rows.
    if (newSectionId !== null) {
      await sql.unsafe(
        `DELETE FROM "${target.table}" WHERE section_tipo = $1 AND section_id = $2`,
        [target.sectionTipo, newSectionId],
      );
    }
    await restoreCounter(sql, counterTable, target.sectionTipo, counterBefore);
    // Delete the side-table rows since the watermark (the NEW activity row + any
    // login activity rows the apply wrote). Settle for a late straggler.
    for (let attempt = 0; attempt < 3; attempt++) {
      let deleted = 0;
      for (const t of SIDE_TABLES) deleted += await deleteSince(sql, t, watermarks[t] ?? 0);
      if (deleted === 0 && attempt > 0) break;
      await new Promise((r2) => setTimeout(r2, 150));
    }
    for (const t of SIDE_TABLES) await deleteSince(sql, t, watermarks[t] ?? 0);
  }

  return {
    responseBytes,
    status,
    newSectionId,
    counterBefore,
    counterAfter,
    row,
    newActivityRows,
  };
}

/**
 * Volatile-leaf normalizer for the CREATE fresh-row diff. The fresh row's volatile
 * leaves (per the live PHP create on oh1):
 *   - data.created_date            — the DB-format timestamp string.
 *   - data.created_by_user_id      — the logged user id (PHP vs TS session user).
 *   - relation.dd200[*].section_id — created_by_user locator user id.
 *   - date.dd199[*].start.<clock>  — created_date clock leaves.
 * Everything else (data.label/section_id(null)/section_tipo/diffusion_info, the
 * locator structure, the date item key set) is COMPARED verbatim.
 */
export function normalizeCreateRowForDiff(payload: MatrixPayload): MatrixPayload {
  const clone = structuredClone(payload) as unknown as Record<string, unknown>;

  // data.created_date + data.created_by_user_id.
  const data = clone.data;
  if (data !== null && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if ('created_date' in d) d.created_date = '<volatile>';
    if ('created_by_user_id' in d) d.created_by_user_id = '<volatile>';
  }
  // relation.dd200[*].section_id (created_by_user).
  normalizeRelationSectionId(clone.relation, 'dd200');
  // date.dd199[*].start.<clock> (created_date).
  normalizeDateColumn(clone.date, 'dd199');

  return clone as unknown as MatrixPayload;
}

/**
 * Volatile-leaf normalizer for the CREATE 'NEW' activity row diff. Same as the
 * generic activity normalizer (id/section_id/timestamp/WHO/IP/WHEN), PLUS the
 * log_data section_id is the FIXED new record id (compared verbatim — NOT a
 * sequence) so it is left alone; only the per-engine volatile leaves are masked.
 * Reuses normalizeSideRowForDiff (the activity branch covers all the volatile
 * leaves for the dd542 row).
 */
export function normalizeNewActivityRowForDiff(
  row: Record<string, unknown>,
): Record<string, unknown> {
  return normalizeSideRowForDiff('matrix_activity', row);
}

/** Canonicalize a CREATE fresh row (volatile-normalized) to a stable JSON string. */
export function canonicalizeCreateRow(payload: MatrixPayload): string {
  return stableStringify(normalizeCreateRowForDiff(payload));
}

/** Canonicalize a CREATE 'NEW' activity row (volatile-normalized) to a stable string. */
export function canonicalizeNewActivityRow(row: Record<string, unknown>): string {
  return stableStringify(normalizeNewActivityRowForDiff(row));
}

// ───────────────────────────── DELETE parity ──────────────────────────────────
//
// A DELETE parity run removes one record (delete_mode 'delete_record') and observes
// the response + the side effects (the deleted record's TM snapshot, the DELETE
// activity row) + the INVERSE-REF cleanup mutations on every record that referenced
// the deleted one. Because the delete is destructive, the FULL RESTORE is paramount:
//   1. SNAPSHOT — read the FULL row of the delete target (all payload columns) AND the
//      full row of EVERY referencing record (the inverse-ref set), plus the section_id
//      column for the re-INSERT, plus the side-table watermarks.
//   2. APPLY    — login + POST the delete RQO, capture the response bytes, the side
//      rows the delete created (id > watermark), and the POST-delete state of every
//      referencing record (the cleanup mutation ground truth).
//   3. RESTORE  — re-INSERT the deleted row with its exact snapshot (section_id +
//      every payload column), restore every referencing record's payload columns to
//      its snapshot, and DELETE every side-table row the delete created. The DB is
//      left byte-identical to before the run.
//
// The harness NEVER asserts; the caller diffs two runs (PHP-vs-PHP baseline or PHP-vs-
// TS gate), normalizing the volatile leaves (the referencing rows' dd197/dd201 stamp,
// the side rows' id/timestamp/user/IP/clock).

/** A matrix row identity whose FULL payload the harness snapshots + restores. */
export interface DeleteRowTarget {
  table: string;
  sectionTipo: string;
  sectionId: number;
}

/** The delete RQO + the endpoint to apply it against. */
export interface DeleteApply {
  apiUrl: string;
  username: string;
  password: string;
  /** The delete RQO (action:'delete', source, options) — CSRF is injected by the harness. */
  rqo: Record<string, unknown>;
}

/** A captured referencing record: its identity + its (volatile-relevant) payload. */
export interface ReferencingRowState {
  table: string;
  sectionTipo: string;
  sectionId: number;
  payload: MatrixPayload;
}

/** Outcome of one DELETE-parity run. */
export interface DeleteRunResult {
  responseBytes: string;
  status: number;
  /** The deleted target's payload BEFORE the delete (snapshot, for re-INSERT). */
  targetBefore: MatrixPayload;
  /** Whether the target row was actually gone after the apply (delete happened). */
  targetDeleted: boolean;
  /** Each referencing record's POST-delete payload (the inverse-ref cleanup result). */
  referencingAfter: ReferencingRowState[];
  /** The side-table rows the delete CREATED (TM + activity), keyed by table. */
  sideRows: SideRowsByTable;
}

/** Read a matrix row's FULL payload by identity (or throw if absent). */
async function snapshotRowAt(
  sql: Sql,
  table: string,
  sectionTipo: string,
  sectionId: number,
): Promise<MatrixPayload> {
  return snapshotRow(sql, { table, sectionTipo, sectionId });
}

/** Read a matrix row's FULL payload, or null when absent (post-delete probe). */
async function readRowOrNull(
  sql: Sql,
  table: string,
  sectionTipo: string,
  sectionId: number,
): Promise<MatrixPayload | null> {
  assertTable(table);
  const cols = PAYLOAD_COLUMNS.join(', ');
  const rows = await sql.unsafe<Array<Record<string, unknown>>>(
    `SELECT ${cols} FROM "${table}" WHERE section_tipo = $1 AND section_id = $2 LIMIT 1`,
    [sectionTipo, sectionId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  const out = {} as MatrixPayload;
  for (const c of PAYLOAD_COLUMNS) out[c] = row[c] ?? null;
  return out;
}

/**
 * Re-INSERT a deleted row with its exact snapshot (section_id + every payload column).
 * Used by the RESTORE step so the DB returns to its pre-delete state byte-for-byte.
 * JSONB columns are bound via sql.json() (true jsonb, not a double-encoded string).
 */
async function reinsertRow(
  sql: Sql,
  table: string,
  sectionTipo: string,
  sectionId: number,
  snapshot: MatrixPayload,
): Promise<void> {
  assertTable(table);
  const cols = ['section_tipo', 'section_id', ...PAYLOAD_COLUMNS];
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const params: unknown[] = [sectionTipo, sectionId];
  for (const c of PAYLOAD_COLUMNS) {
    const v = snapshot[c];
    params.push(v === null || v === undefined ? null : sql.json(v as never));
  }
  await sql.unsafe(
    `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders.join(', ')})`,
    params as never[],
  );
}

/**
 * Run ONE delete-parity cycle: snapshot (target + referencing rows + watermarks) →
 * apply (POST delete) → readback (response + side rows + referencing-rows post-state)
 * → restore (re-INSERT the deleted row, restore referencing rows, delete side rows).
 * Always restores in a `finally`, even when the apply throws.
 */
export async function runDeleteParity(
  sql: Sql,
  target: DeleteRowTarget,
  referencing: ReadonlyArray<DeleteRowTarget>,
  apply: DeleteApply,
): Promise<DeleteRunResult> {
  // 1. snapshot the target row + every referencing row + side-table watermarks.
  const targetBefore = await snapshotRowAt(sql, target.table, target.sectionTipo, target.sectionId);
  const refBefore: ReferencingRowState[] = [];
  for (const r of referencing) {
    refBefore.push({
      table: r.table,
      sectionTipo: r.sectionTipo,
      sectionId: r.sectionId,
      payload: await snapshotRowAt(sql, r.table, r.sectionTipo, r.sectionId),
    });
  }
  const watermarks: Record<string, number> = {};
  for (const t of SIDE_TABLES) watermarks[t] = await maxId(sql, t);

  let responseBytes = '';
  let status = 0;
  let targetDeleted = false;
  const referencingAfter: ReferencingRowState[] = [];
  const sideRows: SideRowsByTable = {};
  for (const t of SIDE_TABLES) sideRows[t] = [];

  try {
    // 2. apply: login + POST the delete RQO.
    const session = await login(apply.apiUrl, apply.username, apply.password);
    const res = await fetch(apply.apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: session.cookie,
        'x-dedalo-csrf-token': session.csrfToken,
      },
      body: JSON.stringify(apply.rqo),
    });
    status = res.status;
    responseBytes = await res.text();

    // 3. readback: target gone? + each referencing record's post-delete payload.
    const targetRow = await readRowOrNull(sql, target.table, target.sectionTipo, target.sectionId);
    targetDeleted = targetRow === null;
    for (const r of referencing) {
      const after = await readRowOrNull(sql, r.table, r.sectionTipo, r.sectionId);
      referencingAfter.push({
        table: r.table,
        sectionTipo: r.sectionTipo,
        sectionId: r.sectionId,
        // A referencing record is never itself deleted; if it were absent we capture
        // an empty payload so the diff surfaces the divergence.
        payload: after ?? emptyPayload(),
      });
    }

    // 3b. capture the side rows the delete created (id > watermark). PHP writes the
    // activity row at request shutdown, which can lag; settle + re-scan until both the
    // deleted-record TM and the DELETE activity row are present (capped).
    for (let attempt = 0; attempt < 6; attempt++) {
      let total = 0;
      for (const t of SIDE_TABLES) {
        sideRows[t] = await captureSince(sql, t, watermarks[t] ?? 0);
        total += sideRows[t].length;
      }
      const allPresent = SIDE_TABLES.every((t) => (sideRows[t]?.length ?? 0) > 0);
      if (allPresent || (total > 0 && attempt >= 2)) break;
      await new Promise((r) => setTimeout(r, 150));
    }
  } finally {
    // 4. RESTORE — re-INSERT the deleted row, restore referencing rows, delete side rows.
    const stillGone =
      (await readRowOrNull(sql, target.table, target.sectionTipo, target.sectionId)) === null;
    if (stillGone) {
      await reinsertRow(sql, target.table, target.sectionTipo, target.sectionId, targetBefore);
    } else {
      // Defensive: the row is present (delete failed); restore its payload to snapshot.
      await restoreRow(
        sql,
        { table: target.table, sectionTipo: target.sectionTipo, sectionId: target.sectionId },
        targetBefore,
      );
    }
    for (const r of refBefore) {
      await restoreRow(
        sql,
        { table: r.table, sectionTipo: r.sectionTipo, sectionId: r.sectionId },
        r.payload,
      );
    }
    // delete the side-table rows the delete created (settle for a late straggler).
    for (let attempt = 0; attempt < 3; attempt++) {
      let deleted = 0;
      for (const t of SIDE_TABLES) deleted += await deleteSince(sql, t, watermarks[t] ?? 0);
      if (deleted === 0 && attempt > 0) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    for (const t of SIDE_TABLES) await deleteSince(sql, t, watermarks[t] ?? 0);
  }

  return { responseBytes, status, targetBefore, targetDeleted, referencingAfter, sideRows };
}

/** An all-null payload (the absent-row sentinel for a referencing record). */
function emptyPayload(): MatrixPayload {
  const out = {} as MatrixPayload;
  for (const c of PAYLOAD_COLUMNS) out[c] = null;
  return out;
}

/**
 * Canonicalize a referencing record's POST-delete payload for the inverse-ref diff:
 * the dd197 (modified_by_user) section_id and the dd201 (modified_date) clock are
 * volatile (the cleanup re-stamps them per run/engine), so they are normalized with
 * the same masks the readback row uses (normalizeRowForDiff). Everything else — the
 * cleaned relation column (the removed locator / deleted key), every other column —
 * is COMPARED verbatim.
 */
export function canonicalizeReferencingRow(payload: MatrixPayload): string {
  return stableStringify(normalizeRowForDiff(payload));
}
