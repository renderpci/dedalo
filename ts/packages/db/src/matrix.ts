import type { DbSession } from './session.ts';
import type { Db } from './db.ts';

/**
 * Read access to the Dédalo "matrix" tables.
 *
 * A record is identified by (section_tipo, section_id). Each component-data
 * family is stored in its own JSONB column ('string', 'date', 'relation', …),
 * shaped as `{ "<component_tipo>": [ {id, lang, value}, … ], … }`. The 'data'
 * column holds record metadata (label, created_date, counters, …). This manager
 * is READ-only for now; writes (jsonb_set, counter allocation, audit stamps) land
 * with the section_record port in Phase 6.
 *
 * Both the table name and the family column are interpolated into SQL, so both
 * are strictly validated/allowlisted here — they are schema identifiers, never
 * user input, but we fail closed regardless.
 */

/** The JSONB component-family columns on a matrix table. */
export const MATRIX_FAMILIES = [
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
] as const;

export type MatrixFamily = (typeof MATRIX_FAMILIES)[number];

const FAMILY_SET = new Set<string>(MATRIX_FAMILIES);
const SAFE_IDENT = /^[a-z_][a-z0-9_]*$/;

export interface MatrixRow {
  id: number;
  section_id: number;
  section_tipo: string;
  [family: string]: unknown;
}

/** A single component data item, e.g. {id:1, lang:'lg-eng', value:'…'}. */
export interface ComponentDatum {
  id?: number;
  lang?: string;
  value?: unknown;
  [k: string]: unknown;
}

function assertTable(table: string): void {
  if (!SAFE_IDENT.test(table)) {
    throw new Error(`Unsafe matrix table identifier: ${JSON.stringify(table)}`);
  }
}

function assertFamily(family: string): asserts family is MatrixFamily {
  if (!FAMILY_SET.has(family)) {
    throw new Error(`Unknown matrix family column: ${JSON.stringify(family)}`);
  }
}

/** Runs queries via either a request-bound DbSession or the pool directly. */
type Queryer = Pick<DbSession, 'query' | 'queryOne'> | Db;

function isSession(q: Queryer): q is Pick<DbSession, 'query' | 'queryOne'> {
  return typeof (q as { queryOne?: unknown }).queryOne === 'function';
}

/**
 * A single (column, key, value) write for update_by_key. `column` is a matrix
 * family column (validated); `key` is the component tipo (a JSONB top-level key,
 * bound as data); `value` is the JS value to store under that key, or null to
 * DELETE the key (jsonb_set_lax 'delete_key').
 */
export interface MatrixKeyUpdate {
  column: MatrixFamily;
  key: string;
  value: unknown;
}

/** A write-capable session: the reserved per-request connection (query()). */
type WriteSession = Pick<DbSession, 'query'>;

export class MatrixDbManager {
  constructor(private readonly q: Queryer) {}

  /** Fetch the whole matrix row for (section_tipo, section_id), or null. */
  async getRow(table: string, sectionTipo: string, sectionId: number): Promise<MatrixRow | null> {
    assertTable(table);
    const sql = `SELECT * FROM "${table}" WHERE section_tipo = $1 AND section_id = $2 LIMIT 1`;
    return this.one<MatrixRow>(sql, [sectionTipo, sectionId]);
  }

  /** Fetch a single JSONB family column (parsed object) for a record, or null. */
  async getColumn(
    table: string,
    sectionTipo: string,
    sectionId: number,
    family: MatrixFamily,
  ): Promise<Record<string, ComponentDatum[]> | null> {
    assertTable(table);
    assertFamily(family);
    const sql = `SELECT "${family}" AS col FROM "${table}" WHERE section_tipo = $1 AND section_id = $2 LIMIT 1`;
    const row = await this.one<{ col: Record<string, ComponentDatum[]> | null }>(sql, [
      sectionTipo,
      sectionId,
    ]);
    return row ? (row.col ?? null) : null;
  }

  /**
   * Fetch the data items array for one component (by tipo) within a family column.
   * Returns [] when the record exists but the component is absent, null when the
   * record itself is not found.
   */
  async getComponentData(
    table: string,
    sectionTipo: string,
    sectionId: number,
    family: MatrixFamily,
    componentTipo: string,
  ): Promise<ComponentDatum[] | null> {
    assertTable(table);
    assertFamily(family);
    // Use the JSONB path operator with a bound key — the key is a value, not SQL.
    const sql = `SELECT "${family}" -> $3 AS items FROM "${table}" WHERE section_tipo = $1 AND section_id = $2 LIMIT 1`;
    const row = await this.one<{ items: ComponentDatum[] | null }>(sql, [
      sectionTipo,
      sectionId,
      componentTipo,
    ]);
    if (row === null) return null;
    return row.items ?? [];
  }

  /**
   * Read the `data` column of a Time Machine row for the (section_tipo, tipo,
   * matrix_id) triplet — the snapshotted component datum. Port of
   * component_common::get_component_tm_data(): the SQO is
   * mode='tm' + filter_by_locators [{matrix_id, section_tipo, tipo}] + ORDER BY id
   * DESC, which search_tm compiles to
   *   SELECT * FROM matrix_time_machine
   *   WHERE section_tipo=$1 AND tipo=$2 AND id=$3 ORDER BY id DESC NULLS LAST
   *   (fetch_one → the first row).
   * `id` is the matrix_time_machine PK (unique), so the section_tipo/tipo predicates
   * are redundant but kept to mirror PHP exactly. Returns the decoded `data` array
   * (the stored datum, identical in shape to the live family column items), or null
   * when no row matches (PHP: empty record → tm_data = [] → null on the simple path,
   * but the read itself returns null; the caller maps absence to PHP's behaviour).
   *
   * NOTE: this is the SIMPLE-model read — it does NOT apply the dataframe/relation
   * is_dataframe_entry / from_component_tipo filtering of get_data()'s tm branch
   * (lines 1166-1226). Callers MUST gate to non-dataframe, non-relation models.
   */
  async getTimeMachineData(
    sectionTipo: string,
    componentTipo: string,
    matrixId: number,
  ): Promise<ComponentDatum[] | null> {
    const sql =
      `SELECT "data" AS items FROM "matrix_time_machine" ` +
      `WHERE section_tipo = $1 AND tipo = $2 AND id = $3 ` +
      `ORDER BY id DESC NULLS LAST LIMIT 1`;
    const row = await this.one<{ items: ComponentDatum[] | null }>(sql, [
      sectionTipo,
      componentTipo,
      matrixId,
    ]);
    if (row === null) return null;
    return row.items ?? null;
  }

  /** Count rows of a given section_tipo in a table. */
  async countBySectionTipo(table: string, sectionTipo: string): Promise<number> {
    assertTable(table);
    const sql = `SELECT count(*)::int AS n FROM "${table}" WHERE section_tipo = $1`;
    const row = await this.one<{ n: number }>(sql, [sectionTipo]);
    return row?.n ?? 0;
  }

  private async one<T>(sql: string, params: unknown[]): Promise<T | null> {
    if (isSession(this.q)) return this.q.queryOne<T & Record<string, unknown>>(sql, params);
    const rows = await this.q.query<T>(sql, params);
    return rows.length > 0 ? (rows[0] as T) : null;
  }

  /**
   * Port of matrix_db_manager::update_by_key — the single-UPDATE per-key JSONB
   * write. Groups the updates by column and builds, per column, a nested
   * jsonb_set_lax chain over COALESCE(<col>,'{}'::jsonb): each update sets (or, for
   * a null value, deletes via 'delete_key') the top-level key. ALL columns are set
   * in ONE UPDATE … WHERE section_id=$1 AND section_tipo=$2 RETURNING id.
   *
   * Writes MUST go through the reserved per-request connection (the DbSession), so
   * this is an instance-independent static taking the write session explicitly —
   * it never touches the read pool.
   *
   * The `key` (component tipo) is interpolated into the jsonb path as a TEXT[]
   * BOUND PARAMETER ($N::text[] with the literal '{key}'), never into SQL; the
   * `column` is validated as a bare family identifier before interpolation (it
   * cannot be bound — Postgres column names are not parameters). Mirrors the PHP
   * DB-05 guard.
   *
   * Returns true iff exactly one row was updated (rows_affected > 0).
   */
  static async updateByKey(
    session: WriteSession,
    table: string,
    sectionTipo: string,
    sectionId: number,
    updates: ReadonlyArray<MatrixKeyUpdate>,
  ): Promise<boolean> {
    assertTable(table);
    if (updates.length === 0) {
      throw new Error('updateByKey: empty updates');
    }

    // Group by column, preserving per-column update order (the nested jsonb_set_lax
    // applies left-to-right). $1=section_id, $2=section_tipo, then path/value pairs.
    const params: unknown[] = [sectionId, sectionTipo];
    const byColumn = new Map<MatrixFamily, MatrixKeyUpdate[]>();
    for (const u of updates) {
      assertFamily(u.column);
      const list = byColumn.get(u.column);
      if (list) list.push(u);
      else byColumn.set(u.column, [u]);
    }

    const sentences: string[] = [];
    for (const [column, columnUpdates] of byColumn) {
      let expr = `COALESCE("${column}", '{}'::jsonb)`;
      for (const u of columnUpdates) {
        // The jsonb path is the single-element array {<key>}. Bound as text[].
        const path = `{${u.key}}`;
        // The value is bound as the RAW JS value (object/array/null) with NO ::jsonb
        // cast. postgres.js serializes a JS object/array param directly to jsonb; a
        // JSON.stringify'd string + ::jsonb would be re-encoded a SECOND time and
        // stored as a jsonb STRING SCALAR — which breaks the relation-flat GIN index
        // (jsonb_array_elements on a scalar). null → SQL NULL → jsonb_set_lax
        // 'delete_key' removes the key.
        const jsonValue = u.value === undefined ? null : u.value;
        params.push(path);
        params.push(jsonValue);
        const pathIdx = params.length - 1;
        const valueIdx = params.length;
        expr = `jsonb_set_lax(${expr}, $${pathIdx}::text[], $${valueIdx}, true, 'delete_key')`;
      }
      sentences.push(`"${column}" = ${expr}`);
    }

    const sql =
      `UPDATE "${table}" SET ${sentences.join(', ')} ` +
      `WHERE section_id = $1 AND section_tipo = $2 RETURNING id`;
    const rows = await session.query<{ id: number }>(sql, params);
    return rows.length > 0;
  }

  /**
   * Port of matrix_db_manager::create — allocate a new section_id and INSERT the
   * fresh matrix row, atomically, in ONE statement. This is the section_id
   * ALLOCATOR: it must allocate the SAME id PHP would from the same counter state,
   * so the lock key, hash expression, counter table, and read-incr-write path are
   * reproduced VERBATIM from PHP.
   *
   * The allocator (PHP class.matrix_db_manager.php::create, lines 260-288):
   *   1. pg_advisory_xact_lock(hashtext($1))  — $1 is the section_tipo (NOT a
   *      composite key). Transaction-scoped: released on COMMIT/ROLLBACK, so this
   *      MUST run inside an open transaction (the reserved-conn DbSession.transaction).
   *   2. calc_start CTE: COALESCE(MAX(section_id),0)+1 over the target table (the
   *      safe-fallback start when the counter row is missing — survives bulk imports).
   *   3. UPSERT into matrix_counter (or matrix_counter_dd for '_dd' tables): on the
   *      first allocation INSERT (tipo, calc_start); on conflict (tipo exists)
   *      DO UPDATE SET value = <counter_table>.value + 1. RETURNING value.
   *   4. INSERT INTO <table> (<columns>) SELECT <placeholders> FROM updated_counter
   *      RETURNING section_id — section_id is `updated_counter.value` (never a bound
   *      param); section_tipo is $1; the dynamic columns follow as $2…$N.
   *
   * Counter-table selection: tables ending in '_dd' use matrix_counter_dd (ontology
   * records, master-managed); all others use matrix_counter (installation-local).
   *
   * Column allowlist: every key of `values` is validated against MATRIX_FAMILIES;
   * unknown columns are dropped (PHP logs + continues). JSONB family columns are
   * bound as RAW JS objects (postgres.js → jsonb); a JSON.stringify'd string + ::jsonb
   * would double-encode to a jsonb STRING scalar. PHP casts the placeholder ::jsonb;
   * we don't (postgres.js infers jsonb from the JS object), matching the stored shape.
   *
   * (!) MUST be called inside an open transaction so the advisory lock is held until
   * commit. Returns the new section_id.
   */
  static async create(
    session: WriteSession,
    table: string,
    sectionTipo: string,
    values: Partial<Record<MatrixFamily, unknown>> | null = null,
  ): Promise<number> {
    assertTable(table);

    // Counter table: '_dd' suffix → matrix_counter_dd (master-managed ontology
    // records); else matrix_counter (installation-local). Mirrors substr($table,-3).
    const counterTable = table.endsWith('_dd') ? 'matrix_counter_dd' : 'matrix_counter';

    // Build the column / placeholder / param arrays. section_tipo is $1; section_id
    // is updated_counter.value (NOT a param). Dynamic columns follow as $2…$N.
    const columns: string[] = ['"section_tipo"', '"section_id"'];
    const placeholders: string[] = ['$1', 'updated_counter.value'];
    const params: unknown[] = [sectionTipo];
    let paramIndex = 2;

    if (values !== null) {
      for (const col of Object.keys(values) as MatrixFamily[]) {
        // Column allowlist (PHP iterates self::$columns; drops unknown).
        if (!FAMILY_SET.has(col)) continue;
        columns.push(`"${col}"`);
        const value = values[col];
        if (value !== null && value !== undefined) {
          // JSONB family column → bind the raw JS object (postgres.js → jsonb).
          params.push(value);
          placeholders.push(`$${paramIndex}`);
        } else {
          params.push(null);
          placeholders.push(`$${paramIndex}`);
        }
        paramIndex++;
      }
    }

    // The single-statement allocator + INSERT, verbatim from PHP (the calc_start
    // CTE variant; the DO UPDATE references $counter_table, not a hardcoded name).
    const sql =
      'WITH locked AS (' +
      ' SELECT pg_advisory_xact_lock(hashtext($1))' +
      '),' +
      ' calc_start AS (' +
      `  SELECT COALESCE(MAX(section_id), 0) + 1 as next_start FROM "${table}" WHERE section_tipo = $1` +
      '),' +
      ' updated_counter AS (' +
      `  INSERT INTO "${counterTable}" (tipo, value)` +
      '  SELECT $1, next_start FROM calc_start' +
      '  ON CONFLICT (tipo) DO UPDATE' +
      `   SET value = "${counterTable}".value + 1` +
      '   RETURNING value' +
      ')' +
      ` INSERT INTO "${table}" (${columns.join(', ')})` +
      ` SELECT ${placeholders.join(', ')} FROM updated_counter` +
      ' RETURNING section_id';

    const rows = await session.query<{ section_id: number | string }>(sql, params);
    const sid = rows[0]?.section_id;
    if (sid === undefined) {
      throw new Error(`MatrixDbManager.create: INSERT returned no section_id for ${sectionTipo}`);
    }
    return typeof sid === 'number' ? sid : Number.parseInt(String(sid), 10);
  }

  /**
   * Port of section_record::allocate_component_ids — the dataframe ITEM-ID (id_key)
   * ALLOCATOR. Atomically allocates `count` consecutive item ids for one component
   * (by tipo) on one record, returning the allocated id range. Each id is a main data
   * item's stable `id`, which is the dataframe pairing key (id_key); concurrent PHP/TS
   * workers editing the same record must NEVER mint the same id, so the read→incr→
   * persist of the counter runs under a PostgreSQL advisory lock.
   *
   * This is CUTOVER-CRITICAL: it must allocate the SAME id PHP would from the same
   * counter state, so the lock key, hash expression, counter path, and read/incr/write
   * are reproduced VERBATIM from PHP (core/section_record/class.section_record.php
   * ::allocate_component_ids, lines 1284-1364):
   *
   *   1. lock_key = "<table>_<section_tipo>_<section_id>_<tipo>"  (the table/record/
   *      component triple — NOT the section_tipo alone the section_id allocator uses).
   *   2. SELECT pg_advisory_lock( hashtextextended($1, 0) )  — SESSION-level (no
   *      surrounding transaction needed; released by the matching unlock), with the
   *      SECOND arg seed = 0. This DIFFERS from the section_id allocator, which uses
   *      pg_advisory_XACT_lock( hashtext($section_tipo) ) (txn-scoped, single-arg
   *      hashtext, no seed) + the matrix_counter UPSERT table.
   *   3. re-read the PERSISTED counter:  SELECT (meta->$tipo->0->>'count')::int  FROM
   *      <table> WHERE section_tipo=$2 AND section_id=$3 . Take max(persisted, in_memory)
   *      as the base (in_memory absorbs unsaved in-request allocations; the caller
   *      passes the in-memory counter it already read).
   *   4. new_counter = base + count. Persist IMMEDIATELY (so concurrent processes see
   *      it before the record save) via:  UPDATE <table> SET meta = jsonb_set(
   *      COALESCE(meta,'{}'::jsonb), ARRAY[$tipo], '[{"count":<new>}]'::jsonb, true )
   *      WHERE section_tipo AND section_id — but ONLY when the row exists.
   *   5. unlock in a finally:  SELECT pg_advisory_unlock( hashtextextended($1, 0) ) .
   *   6. return range(base+1 … new_counter).
   *
   * The meta storage format is `{ "<tipo>": [ { "count": <int> } ] }` (a one-element
   * array whose [0].count is the counter) — identical to set_component_counter.
   *
   * (!) Runs on the reserved per-request connection (a SESSION-level lock must be held
   * + released on the SAME connection). Returns the allocated ids AND the new counter
   * so the caller can keep its in-memory counter in sync (PHP set_component_counter).
   */
  static async allocateComponentIds(
    session: WriteSession,
    table: string,
    sectionTipo: string,
    sectionId: number,
    tipo: string,
    count = 1,
    inMemoryCounter = 0,
  ): Promise<{ ids: number[]; newCounter: number }> {
    assertTable(table);
    if (count < 1) {
      return { ids: [], newCounter: inMemoryCounter };
    }

    // advisory lock key from the (table, record, component) triple — VERBATIM PHP.
    const lockKey = `${table}_${sectionTipo}_${sectionId}_${tipo}`;

    // SESSION-level advisory lock (no surrounding transaction required), seed 0.
    await session.query('SELECT pg_advisory_lock( hashtextextended($1, 0) )', [lockKey]);
    try {
      // re-read the PERSISTED counter (another process may have allocated since the
      // record was loaded). meta->$tipo->0->>'count'.
      const rows = await session.query<{ count: number | null }>(
        `SELECT (meta->$1->0->>'count')::int AS count FROM "${table}" WHERE section_tipo=$2 AND section_id=$3`,
        [tipo, sectionTipo, sectionId],
      );
      const rowExists = rows.length > 0;
      const persisted =
        rowExists && rows[0] && typeof rows[0].count === 'number' && Number.isInteger(rows[0].count)
          ? rows[0].count
          : 0;

      // the in-memory counter may be ahead (unsaved allocations in this request).
      const base = Math.max(persisted, inMemoryCounter);
      const newCounter = base + count;

      // persist immediately so concurrent processes see the allocation before save.
      // PHP does jsonb_set(COALESCE(meta,'{}'), ARRAY[$tipo], '[{"count":<new>}]'::jsonb,
      // true) binding a json_encode'd STRING + ::jsonb (text→jsonb cast → a proper
      // ARRAY). postgres.js, however, infers the param type: a JS STRING bound to a
      // ::jsonb placeholder is RE-encoded and stored as a jsonb STRING SCALAR (the
      // double-encode trap, identical to the matrix-write note). So we bind the RAW JS
      // array WITHOUT the ::jsonb cast — postgres.js serializes the array directly to a
      // jsonb ARRAY, matching PHP's stored shape ([{count:<new>}]).
      if (rowExists) {
        await session.query(
          `UPDATE "${table}" SET meta = jsonb_set( COALESCE(meta, '{}'::jsonb), ARRAY[$1], $2, true ) WHERE section_tipo=$3 AND section_id=$4`,
          [tipo, [{ count: newCounter }], sectionTipo, sectionId],
        );
      }

      const ids: number[] = [];
      for (let i = base + 1; i <= newCounter; i++) ids.push(i);
      return { ids, newCounter };
    } finally {
      await session.query('SELECT pg_advisory_unlock( hashtextextended($1, 0) )', [lockKey]);
    }
  }

  /**
   * Port of matrix_db_manager::delete — the single-row DELETE. Removes the matrix
   * row for (section_tipo, section_id):
   *
   *   DELETE FROM "<table>" WHERE section_id = $1 AND section_tipo = $2
   *
   * (PHP binds [section_id, section_tipo] in that order; the WHERE column order
   * mirrors the matrix_section_tipo_section_id_desc_idx index scan.) Runs on the
   * reserved per-request connection. Returns true iff a row was deleted.
   */
  static async delete(
    session: WriteSession,
    table: string,
    sectionTipo: string,
    sectionId: number,
  ): Promise<boolean> {
    assertTable(table);
    const sql = `DELETE FROM "${table}" WHERE section_id = $1 AND section_tipo = $2 RETURNING id`;
    const rows = await session.query<{ id: number }>(sql, [sectionId, sectionTipo]);
    return rows.length > 0;
  }

  /**
   * Find the records that hold an inverse reference to (targetSectionTipo,
   * targetSectionId) — the records section_record::remove_all_inverse_references
   * must clean on a delete.
   *
   * Reproduces search_related::get_referenced_locators's default branch VERBATIM:
   * the GIN-indexed flat-relation function `data_relations_flat_st_si(relation)`
   * (the "<section_tipo>_<section_id>" key set) filters the candidate rows, then a
   * breakdown CROSS JOIN over jsonb_path_query(relation,'$.*[*]') refines to the
   * exact locator entries whose section_tipo + section_id match the target. The
   * component key (from_component_tipo) is the JSONB object key. Each returned
   * locator carries the OWNING record's section_tipo/section_id (from_section_*).
   *
   * One query PER relation-bearing matrix table (the caller passes the table set);
   * results are returned with the source table so the per-record update can target
   * the right table. Ordered by (from_section_tipo, from_section_id) like PHP's
   * final UNION ORDER BY.
   */
  async findInverseReferences(
    table: string,
    targetSectionTipo: string,
    targetSectionId: number,
  ): Promise<InverseReference[]> {
    assertTable(table);
    const flatKey = `${targetSectionTipo}_${targetSectionId}`;
    const sql =
      `SELECT section_tipo AS from_section_tipo, section_id AS from_section_id, ` +
      `comp.key AS from_component_tipo, loc.value AS locator ` +
      `FROM "${table}", ` +
      `jsonb_each(relation) AS comp(key, value), ` +
      `jsonb_array_elements(comp.value) AS loc(value) ` +
      `WHERE data_relations_flat_st_si(relation) @> $1::jsonb ` +
      `AND loc.value ->> 'section_tipo' = $2 ` +
      `AND loc.value ->> 'section_id' = $3 ` +
      `ORDER BY section_tipo, section_id`;
    // The flat-key filter is bound as a RAW JS array → postgres.js serializes it to a
    // jsonb ARRAY (a JSON.stringify'd string would re-encode to a jsonb STRING scalar
    // under ::jsonb, which never matches the array `@>` — the same double-encode trap
    // the matrix write path avoids). So [flatKey] is bound, not '["<flatKey>"]'.
    const rows = await this.query<{
      from_section_tipo: string;
      from_section_id: number;
      from_component_tipo: string;
      locator: Record<string, unknown>;
    }>(sql, [[flatKey], targetSectionTipo, String(targetSectionId)]);
    return rows.map((r) => ({
      fromSectionTipo: r.from_section_tipo,
      fromSectionId: r.from_section_id,
      fromComponentTipo: r.from_component_tipo,
      table,
      locator: r.locator,
    }));
  }

  /** Run a SELECT via the session/pool, returning all rows (read path). */
  private async query<T>(sql: string, params: unknown[]): Promise<T[]> {
    if (isSession(this.q)) return this.q.query<T & Record<string, unknown>>(sql, params) as Promise<T[]>;
    return this.q.query<T>(sql, params);
  }
}

/** A single inverse-reference hit: an owning record + the component + the locator. */
export interface InverseReference {
  /** The owning (referencing) record's section_tipo. */
  fromSectionTipo: string;
  /** The owning (referencing) record's section_id. */
  fromSectionId: number;
  /** The component tipo (relation JSONB key) holding the locator. */
  fromComponentTipo: string;
  /** The matrix table the owning record lives in. */
  table: string;
  /** The raw locator entry (the JSONB object that points at the deleted record). */
  locator: Record<string, unknown>;
}
