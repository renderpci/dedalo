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

/** A captured related row (e.g. a relation save's TARGET): identity + before/after payload. */
export interface RelatedRowState {
  table: string;
  sectionTipo: string;
  sectionId: number;
  /** The payload columns BEFORE the write. */
  before: MatrixPayload;
  /** The payload columns AFTER the write. */
  after: MatrixPayload;
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
  /**
   * OPTIONAL related rows (e.g. a relation save's TARGET record), each with its
   * before/after payload. For a relation save this PROVES the target is byte-identical
   * (NO inverse ref written) — the crux of the relation-save parity. Empty when no
   * related rows were requested. Always restored in the `finally` (defensively).
   */
  relatedRows: RelatedRowState[];
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
  /**
   * OPTIONAL related rows to ALSO snapshot/readback/restore (e.g. a relation save's
   * TARGET record). For a relation save these prove the target row is byte-identical
   * before/after (NO inverse-ref mutation). Each is restored in the `finally`.
   */
  relatedTargets: ReadonlyArray<MatrixRowTarget> = [],
): Promise<WriteRunResult> {
  // 1. snapshot the row + the related rows + side-table watermarks.
  const before = await snapshotRow(sql, target);
  const relatedBefore: MatrixPayload[] = [];
  for (const rt of relatedTargets) relatedBefore.push(await snapshotRow(sql, rt));
  const watermarks: Record<string, number> = {};
  for (const t of SIDE_TABLES) watermarks[t] = await maxId(sql, t);

  let responseBytes = '';
  let status = 0;
  let after: MatrixPayload = before;
  const sideRows: SideRowsByTable = {};
  for (const t of SIDE_TABLES) sideRows[t] = [];
  const relatedRows: RelatedRowState[] = [];

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

    // 3. readback the resulting row + the related rows (the inverse-ref proof).
    after = await snapshotRow(sql, target);
    for (let i = 0; i < relatedTargets.length; i++) {
      const rt = relatedTargets[i]!;
      relatedRows.push({
        table: rt.table,
        sectionTipo: rt.sectionTipo,
        sectionId: rt.sectionId,
        before: relatedBefore[i]!,
        after: await snapshotRow(sql, rt),
      });
    }

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
    // 4. restore: row payload back to snapshot, then EVERY related row, then clean
    // side-table rows. Restoring the related rows is defensive — a relation save must
    // leave them byte-identical (NO inverse mutation), but we restore regardless so a
    // divergence (an unexpected inverse write) is still cleaned up.
    await restoreRow(sql, target, before);
    for (let i = 0; i < relatedTargets.length; i++) {
      await restoreRow(sql, relatedTargets[i]!, relatedBefore[i]!);
    }
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

  return { responseBytes, status, before, after, sideRows, relatedRows };
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

// ───────────────────────────── DUPLICATE parity ───────────────────────────────
//
// `duplicate` is a DECLINED action (the TS engine proxies it to PHP — it composes
// un-ported component-save subsystems: portal/filter/relation saves + a
// create-with-source-values INSERT + per-component TM/activity cascades). This
// harness drives BOTH:
//   - the PHP-vs-PHP BASELINE: prove the harness can snapshot → duplicate → restore a
//     record cleanly, the response envelope is byte-stable (new id normalized), and
//     the side-row COUNTS are deterministic.
//   - the TS-PROXY gate: prove the TS engine forwards the duplicate to PHP
//     byte-identically (the response, new id normalized).
// SAFETY: snapshot the counter + side-table watermarks BEFORE the write; restore by
// DELETING the created row + sweeping side rows by watermark + restoring the counter.

/** The duplicate RQO (action:'duplicate', source.{section_tipo,section_id}) + endpoint. */
export interface DuplicateApply {
  apiUrl: string;
  username: string;
  password: string;
  /**
   * OPTIONAL endpoint to LOGIN against (default apiUrl). The TS proxy + session
   * bridge rotates CSRF in a way the bare harness login races; the gate logs in via
   * the test-DB PHP endpoint (shared session/DB) but POSTs the duplicate to the TS
   * URL. The session cookie + CSRF token are valid for both (same backend).
   */
  loginUrl?: string;
  /** The duplicate RQO — CSRF is injected by the harness. */
  rqo: Record<string, unknown>;
}

/** Outcome of one DUPLICATE-parity run. */
export interface DuplicateRunResult {
  /** RAW response body bytes from the apply POST. */
  responseBytes: string;
  /** HTTP status of the apply POST. */
  status: number;
  /** The section_id the duplicate created (response.result), or null on failure. */
  newSectionId: number | null;
  /** The counter value BEFORE the duplicate (snapshot). */
  counterBefore: number | null;
  /** The counter value AFTER the duplicate (readback). */
  counterAfter: number | null;
  /** The new record's matrix-row payload (readback), or null if absent. */
  row: MatrixPayload | null;
  /** The number of side rows the duplicate created, per side table (since watermark). */
  sideRowCounts: Record<string, number>;
  /**
   * The full side-table rows the duplicate created (id > the pre-write watermark, per
   * table), captured before cleanup — the byte ground truth for the TM + activity diff.
   * Keyed by table, ordered by id ascending. Includes the login activity rows (the diff
   * isolates the duplicate's NEW/SAVE rows by the new section_id).
   */
  sideRows: SideRowsByTable;
}

/** Count rows of a side table created since a watermark. */
async function countSince(sql: Sql, table: string, watermark: number): Promise<number> {
  assertTable(table);
  const rows = await sql.unsafe<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM "${table}" WHERE id > $1`,
    [watermark],
  );
  return rows[0]?.n ?? 0;
}

/**
 * Run ONE duplicate-parity cycle: snapshot (counter + watermarks) → apply (POST
 * duplicate) → readback (counter + new row + side-row counts) → reset (delete the
 * created row, restore the counter, sweep side rows by watermark). Always resets in a
 * `finally`, even when the apply throws, so the next engine starts from the SAME state.
 */
export async function runDuplicateParity(
  sql: Sql,
  target: { table: string; sectionTipo: string },
  apply: DuplicateApply,
): Promise<DuplicateRunResult> {
  assertTable(target.table);
  const counterTable = counterTableFor(target.table);

  // 1. snapshot the counter + side-table watermarks BEFORE the write (SAFETY).
  const counterBefore = await readCounter(sql, counterTable, target.sectionTipo);
  const watermarks: Record<string, number> = {};
  for (const t of SIDE_TABLES) watermarks[t] = await maxId(sql, t);

  let responseBytes = '';
  let status = 0;
  let newSectionId: number | null = null;
  let counterAfter: number | null = counterBefore;
  let row: MatrixPayload | null = null;
  const sideRowCounts: Record<string, number> = {};
  const sideRows: SideRowsByTable = {};
  for (const t of SIDE_TABLES) sideRows[t] = [];

  try {
    // 2. apply: login (loginUrl or apiUrl) + POST the duplicate RQO to apiUrl.
    const session = await login(apply.loginUrl ?? apply.apiUrl, apply.username, apply.password);
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

    // 3. readback: counter, the new row, the side rows (full + counts). The component
    // saves' activity rows are written at PHP request shutdown, which can lag; settle +
    // re-scan until the per-component TM row(s) appear (capped).
    counterAfter = await readCounter(sql, counterTable, target.sectionTipo);
    if (newSectionId !== null) {
      row = await readRowPayload(sql, target.table, target.sectionTipo, newSectionId);
    }
    for (let attempt = 0; attempt < 6; attempt++) {
      for (const t of SIDE_TABLES) {
        sideRows[t] = await captureSince(sql, t, watermarks[t] ?? 0);
        sideRowCounts[t] = sideRows[t].length;
      }
      if ((sideRowCounts.matrix_time_machine ?? 0) > 0) break;
      await new Promise((r2) => setTimeout(r2, 200));
    }
  } finally {
    // 4. reset: delete the created matrix row, restore the counter, sweep side rows.
    if (newSectionId !== null) {
      await sql.unsafe(
        `DELETE FROM "${target.table}" WHERE section_tipo = $1 AND section_id = $2`,
        [target.sectionTipo, newSectionId],
      );
    }
    await restoreCounter(sql, counterTable, target.sectionTipo, counterBefore);
    for (let attempt = 0; attempt < 3; attempt++) {
      let deleted = 0;
      for (const t of SIDE_TABLES) deleted += await deleteSince(sql, t, watermarks[t] ?? 0);
      if (deleted === 0 && attempt > 0) break;
      await new Promise((r2) => setTimeout(r2, 200));
    }
    for (const t of SIDE_TABLES) await deleteSince(sql, t, watermarks[t] ?? 0);
  }

  return { responseBytes, status, newSectionId, counterBefore, counterAfter, row, sideRowCounts, sideRows };
}

/**
 * Isolate the DUPLICATE's own side rows from the login rows that share the watermark
 * window. The duplicate writes a 'NEW' activity (log_data.section_id = the new id) + per
 * component a TM row (section_id = the new id) + a 'SAVE' activity (log_data.section_id =
 * the new id). The login activity rows carry an unrelated section_id, so we isolate by
 * the NEW section_id: TM rows by the `section_id` column, activity rows by the
 * misc.dd551 log_data.section_id. Returns {tm, act} in id order.
 */
export function isolateDuplicateSideRows(
  side: SideRowsByTable,
  newSectionId: number | null,
): { tm: Array<Record<string, unknown>>; act: Array<Record<string, unknown>> } {
  if (newSectionId === null) return { tm: [], act: [] };
  const tm = (side.matrix_time_machine ?? []).filter((r) => {
    const sid = r.section_id;
    const n = typeof sid === 'number' ? sid : Number(sid);
    return n === newSectionId;
  });
  const act = (side.matrix_activity ?? []).filter((row) => {
    const misc = row.misc as Record<string, unknown> | null;
    const dd551 = misc?.['dd551'];
    if (!Array.isArray(dd551) || dd551.length === 0) return false;
    const value = (dd551[0] as Record<string, unknown> | null)?.['value'];
    if (value === null || typeof value !== 'object') return false;
    const sid = (value as Record<string, unknown>)['section_id'];
    const n = Number(sid);
    return Number.isInteger(n) && n === newSectionId;
  });
  return { tm, act };
}

/**
 * Volatile-leaf normalizer for the DUPLICATE new-record row diff. Identical shape to the
 * add_child child row (a create + per-component save): created/modified audit leaves are
 * volatile (per-run/engine clock + user), everything else (the copied component data, the
 * meta counters, the data label/section_tipo) is COMPARED verbatim.
 *   - data.created_date / data.created_by_user_id
 *   - relation.dd200[*].section_id (created_by_user) / relation.dd197[*].section_id (modified_by_user)
 *   - date.dd199[*].start.<clock> (created_date) / date.dd201[*].start.<clock> (modified_date)
 */
export function normalizeDuplicateRowForDiff(payload: MatrixPayload): MatrixPayload {
  return normalizeAddChildRowForDiff(payload);
}

/** Canonicalize a DUPLICATE new-record row (volatile-normalized) to a stable string. */
export function canonicalizeDuplicateRow(payload: MatrixPayload): string {
  return stableStringify(normalizeDuplicateRowForDiff(payload));
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

// ───────────────────────────── ADD_CHILD (dd_ts_api) parity ────────────────────
//
// add_child creates a NEW child term under a parent thesaurus node and links it
// (the child's component_relation_parent locator + per-parent order). It is a
// COMPOUND server-side op: create + 2 radio_button default saves + 1 order save + 1
// relation_parent save, each producing a time-machine + activity row. The PARENT row
// is NOT mutated (children are a computed inverse). So the parity run snapshots:
//   - the counter (the new child section_id allocation MUST match PHP),
//   - the PARENT row (to prove it is byte-identical before AND after),
//   - the side-table watermarks,
// applies the add_child, reads back the NEW child row + the parent row + every new
// side row, then RESTORES: delete the child, restore the parent + counter, sweep the
// side rows — leaving the test DB byte-identical.

/** The add_child RQO + endpoint to apply it against. */
export interface AddChildApply {
  apiUrl: string;
  username: string;
  password: string;
  /** The add_child RQO (action:'add_child', source) — CSRF injected by the harness. */
  rqo: Record<string, unknown>;
}

/** Outcome of one ADD_CHILD-parity run. */
export interface AddChildRunResult {
  responseBytes: string;
  status: number;
  /** The new child section_id (response.result), or null on failure. */
  newSectionId: number | null;
  counterBefore: number | null;
  counterAfter: number | null;
  /** The new child row payload columns (readback), or null if absent. */
  childRow: MatrixPayload | null;
  /** The parent row payload BEFORE the apply. */
  parentBefore: MatrixPayload;
  /** The parent row payload AFTER the apply (must equal parentBefore). */
  parentAfter: MatrixPayload;
  /** All new side rows (TM + activity) created since the watermark, by table. */
  sideRows: SideRowsByTable;
}

/**
 * Run ONE add_child-parity cycle: snapshot (parent row + counter + watermarks) →
 * apply (POST add_child) → readback (child row + parent row + side rows) → restore
 * (delete child, restore parent + counter, sweep side rows). Always restores in a
 * `finally`. The counter restore + child delete make the next engine allocate the
 * SAME id, the core allocator-parity check.
 */
export async function runAddChildParity(
  sql: Sql,
  parent: MatrixRowTarget,
  apply: AddChildApply,
): Promise<AddChildRunResult> {
  assertTable(parent.table);
  const counterTable = counterTableFor(parent.table);

  // 1. snapshot the parent row + the counter + side-table watermarks.
  const parentBefore = await snapshotRow(sql, parent);
  const counterBefore = await readCounter(sql, counterTable, parent.sectionTipo);
  const watermarks: Record<string, number> = {};
  for (const t of SIDE_TABLES) watermarks[t] = await maxId(sql, t);

  let responseBytes = '';
  let status = 0;
  let newSectionId: number | null = null;
  let counterAfter: number | null = counterBefore;
  let childRow: MatrixPayload | null = null;
  let parentAfter: MatrixPayload = parentBefore;
  const sideRows: SideRowsByTable = {};
  for (const t of SIDE_TABLES) sideRows[t] = [];

  try {
    // 2. apply: login + POST the add_child RQO.
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

    // 3. readback: counter, the new child row, the parent row (unchanged proof).
    counterAfter = await readCounter(sql, counterTable, parent.sectionTipo);
    if (newSectionId !== null) {
      childRow = await readRowPayload(sql, parent.table, parent.sectionTipo, newSectionId);
    }
    parentAfter = await snapshotRow(sql, parent);

    // 3b. capture the side rows. add_child writes 4 TM + 5 activity (NEW + 4 SAVE)
    // rows for the add_child itself, PLUS the login activity rows in the same window.
    // The diff isolates by structure; here we just settle until they stabilise.
    for (let attempt = 0; attempt < 8; attempt++) {
      let tm = 0;
      for (const t of SIDE_TABLES) {
        sideRows[t] = await captureSince(sql, t, watermarks[t] ?? 0);
        if (t === 'matrix_time_machine') tm = sideRows[t].length;
      }
      // expect 4 TM rows for the 4 component saves; stop once present.
      if (tm >= 4) break;
      await new Promise((r2) => setTimeout(r2, 150));
    }
  } finally {
    // 4. restore: delete the created child, restore the parent + counter, sweep side rows.
    if (newSectionId !== null) {
      await sql.unsafe(
        `DELETE FROM "${parent.table}" WHERE section_tipo = $1 AND section_id = $2`,
        [parent.sectionTipo, newSectionId],
      );
    }
    await restoreRow(sql, parent, parentBefore);
    await restoreCounter(sql, counterTable, parent.sectionTipo, counterBefore);
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
    childRow,
    parentBefore,
    parentAfter,
    sideRows,
  };
}

/**
 * Volatile-leaf normalizer for the ADD_CHILD new-child row diff. The child row's
 * volatile leaves (per the live PHP add_child on tchi1):
 *   - data.created_date / data.created_by_user_id   — create metadata.
 *   - relation.dd200[*].section_id (created_by_user) — create audit.
 *   - relation.dd197[*].section_id (modified_by_user)— first-save audit.
 *   - date.dd199[*].start.<clock>  (created_date)    — create.
 *   - date.dd201[*].start.<clock>  (modified_date)   — first save.
 * Everything else (the is_descriptor/is_indexable/order/parent locators, the meta
 * counters, the order value) is COMPARED verbatim.
 */
export function normalizeAddChildRowForDiff(payload: MatrixPayload): MatrixPayload {
  const clone = structuredClone(payload) as unknown as Record<string, unknown>;
  const data = clone.data;
  if (data !== null && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if ('created_date' in d) d.created_date = '<volatile>';
    if ('created_by_user_id' in d) d.created_by_user_id = '<volatile>';
  }
  normalizeRelationSectionId(clone.relation, 'dd200');
  normalizeRelationSectionId(clone.relation, 'dd197');
  normalizeDateColumn(clone.date, 'dd199');
  normalizeDateColumn(clone.date, 'dd201');
  return clone as unknown as MatrixPayload;
}

/** Canonicalize an ADD_CHILD child row (volatile-normalized) to a stable string. */
export function canonicalizeAddChildRow(payload: MatrixPayload): string {
  return stableStringify(normalizeAddChildRowForDiff(payload));
}

// ─────────────────── MULTI-ROW (save_order / update_parent_data) parity ─────────
//
// save_order reorders the children of a parent: it mutates EVERY listed sibling row
// (each gains/updates an order item in the number column) but touches NO counter and
// NOT the parent. update_parent_data moves a node: it mutates the moved node's relation
// + number columns AND recalculates the OLD parent's remaining siblings' order, but
// NEVER the old/new parent rows (children are a computed inverse). Both need a snapshot
// of MANY rows (the moved node + every sibling that may be renumbered), and the SAFETY
// requirement is paramount: every touched row + the side-table watermarks restored.
//
// The harness snapshots a fixed set of target rows (caller-supplied), applies the op,
// reads them all back, captures the side rows since the watermark, then RESTORES every
// row to its snapshot + sweeps the side rows — leaving the test DB byte-identical.

/** Outcome of one MULTI-ROW write-parity run. */
export interface MultiRowRunResult {
  responseBytes: string;
  status: number;
  /** Each target row's payload BEFORE the apply, keyed by "<tipo>/<id>". */
  before: Record<string, MatrixPayload>;
  /** Each target row's payload AFTER the apply, keyed by "<tipo>/<id>". */
  after: Record<string, MatrixPayload>;
  /** The side-table rows the op CREATED (TM + activity), keyed by table. */
  sideRows: SideRowsByTable;
}

function rowKey(t: MatrixRowTarget): string {
  return `${t.sectionTipo}/${t.sectionId}`;
}

/**
 * Run ONE multi-row write-parity cycle: snapshot every target row + side watermarks →
 * apply (login + POST the rqo) → readback every target row + side rows → restore every
 * target row + sweep side rows. Always restores in a `finally`. The expectedTm hint
 * controls the settle loop (how many TM rows to wait for before capturing).
 */
export async function runMultiRowWriteParity(
  sql: Sql,
  targets: ReadonlyArray<MatrixRowTarget>,
  apply: WriteApply,
  expectedTm = 1,
): Promise<MultiRowRunResult> {
  const before: Record<string, MatrixPayload> = {};
  for (const t of targets) before[rowKey(t)] = await snapshotRow(sql, t);
  const watermarks: Record<string, number> = {};
  for (const tbl of SIDE_TABLES) watermarks[tbl] = await maxId(sql, tbl);

  let responseBytes = '';
  let status = 0;
  const after: Record<string, MatrixPayload> = {};
  const sideRows: SideRowsByTable = {};
  for (const tbl of SIDE_TABLES) sideRows[tbl] = [];

  try {
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

    for (const t of targets) after[rowKey(t)] = await snapshotRow(sql, t);

    for (let attempt = 0; attempt < 8; attempt++) {
      let tm = 0;
      for (const tbl of SIDE_TABLES) {
        sideRows[tbl] = await captureSince(sql, tbl, watermarks[tbl] ?? 0);
        if (tbl === 'matrix_time_machine') tm = sideRows[tbl].length;
      }
      if (tm >= expectedTm) break;
      await new Promise((r) => setTimeout(r, 150));
    }
  } finally {
    for (const t of targets) await restoreRow(sql, t, before[rowKey(t)]!);
    for (let attempt = 0; attempt < 3; attempt++) {
      let deleted = 0;
      for (const tbl of SIDE_TABLES) deleted += await deleteSince(sql, tbl, watermarks[tbl] ?? 0);
      if (deleted === 0 && attempt > 0) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    for (const tbl of SIDE_TABLES) await deleteSince(sql, tbl, watermarks[tbl] ?? 0);
  }

  return { responseBytes, status, before, after, sideRows };
}

/**
 * Volatile-leaf normalizer for the multi-row readback rows. The order saves stamp NO
 * dd197/dd201 on these rows (the order/relation columns change, not the modify audit),
 * but to be defensive against any audit re-stamp we reuse normalizeRowForDiff (dd201
 * clock + dd197 section_id). The order/relation column values are compared verbatim.
 */
export function canonicalizeMultiRow(payload: MatrixPayload): string {
  return stableStringify(normalizeRowForDiff(payload));
}
