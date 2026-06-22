#!/usr/bin/env bun
/**
 * Write-parity CLI: drive the write-parity harness for the FIRST ported save —
 * the dd_core_api `save` of a component_input_text value (update of oh1/1/oh14).
 *
 * Two modes:
 *   --baseline   Run the save via the PHP endpoint TWICE (snapshot→apply→readback→
 *                restore, ×2) and diff the two PHP runs. Proves the harness +
 *                volatile normalization BEFORE any TS engine exists. MUST be green.
 *   --gate       Run the save via the PHP endpoint AND the TS endpoint, each from
 *                the same snapshot, and diff PHP-vs-TS (response envelope + row).
 *
 * The DB connection is the TEST DB (DEDALO_*_CONN env). The endpoints default to
 * the verified :8081 PHP-on-test-DB and (for --gate) :3300 TS-on-test-DB.
 *
 * Env (with defaults):
 *   DEDALO_HOSTNAME_CONN=/tmp DEDALO_DB_PORT_CONN=5432 DEDALO_DATABASE_CONN
 *   DEDALO_USERNAME_CONN DEDALO_PASSWORD_CONN
 *   WP_PHP_URL=http://localhost:8081/core/api/v1/json/
 *   WP_TS_URL=http://localhost:3300/core/api/v1/json/
 *   WP_USER=root  WP_PASS=123123aS
 *   WP_VALUE='PARITY TEST VALUE'   (the new value the save writes)
 */

import { diffJson, formatDiffReport } from '../differ.ts';
import { login } from '../login.ts';
import {
  openTestDb,
  runWriteParity,
  runCreateParity,
  runDeleteParity,
  normalizeRowForDiff,
  canonicalizePayload,
  canonicalizeSideRow,
  canonicalizeCreateRow,
  canonicalizeNewActivityRow,
  canonicalizeReferencingRow,
  type MatrixRowTarget,
  type WriteApply,
  type WriteRunResult,
  type SideRowsByTable,
  type CreateApply,
  type CreateRunResult,
  type DeleteApply,
  type DeleteRowTarget,
  type DeleteRunResult,
} from '../write_harness.ts';
import type { Sql } from 'postgres';

const env = process.env;

function reqEnv(k: string): string {
  const v = env[k];
  if (!v) {
    console.error(`Missing required env var: ${k}`);
    process.exit(2);
  }
  return v;
}

const TARGET: MatrixRowTarget = {
  table: env.WP_TABLE ?? 'matrix',
  sectionTipo: env.WP_SECTION_TIPO ?? 'oh1',
  sectionId: Number.parseInt(env.WP_SECTION_ID ?? '1', 10),
};

const NEW_VALUE = env.WP_VALUE ?? 'PARITY TEST VALUE';

/**
 * The save RQO for the oh1/1/oh14/lg-nolan input_text update (source-verified).
 *
 * The frontend sends the changed_data item's `value` as the FULL data-item OBJECT
 * ({id, lang, value}) and the matching `id` at the top — update_data_value locates
 * the existing item by id and replaces it. (A bare-string `value` with no id wipes
 * the column instead, as it appends an un-shaped entry; the object form is the real
 * value update the UI performs.)
 */
function buildSaveRqo(): Record<string, unknown> {
  const tipo = env.WP_TIPO ?? 'oh14';
  const lang = env.WP_LANG ?? 'lg-nolan';
  const itemId = Number.parseInt(env.WP_ITEM_ID ?? '1', 10);
  return {
    dd_api: 'dd_core_api',
    action: 'save',
    source: {
      type: 'component',
      model: 'component_input_text',
      tipo,
      section_tipo: TARGET.sectionTipo,
      section_id: String(TARGET.sectionId),
      mode: 'edit',
      lang,
    },
    data: {
      tipo,
      section_tipo: TARGET.sectionTipo,
      section_id: String(TARGET.sectionId),
      lang,
      changed_data: [
        {
          action: 'update',
          key: 0,
          id: itemId,
          value: { id: itemId, lang, value: NEW_VALUE },
        },
      ],
    },
  };
}

function applyFor(apiUrl: string): WriteApply {
  return {
    apiUrl,
    username: env.WP_USER ?? 'root',
    password: env.WP_PASS ?? '123123aS',
    rqo: buildSaveRqo(),
  };
}

/**
 * The create RQO for adding a new record to a section (source-verified). The
 * frontend's section/grid 'new' button sends exactly { action:'create',
 * source:{ section_tipo } } — no other fields. The new section_id is allocated by
 * the advisory-lock counter server-side.
 */
function buildCreateRqo(): Record<string, unknown> {
  return {
    dd_api: 'dd_core_api',
    action: 'create',
    source: { section_tipo: TARGET.sectionTipo },
  };
}

function createApplyFor(apiUrl: string): CreateApply {
  return {
    apiUrl,
    username: env.WP_USER ?? 'root',
    password: env.WP_PASS ?? '123123aS',
    rqo: buildCreateRqo(),
  };
}

/**
 * Diff two CREATE runs: allocated id + counter delta + response envelope + fresh row
 * + 'NEW' activity row. The id-allocation parity is the highest-risk check: both
 * engines start from the SAME reset counter state, so they MUST allocate the SAME id.
 */
function diffCreateRuns(label: string, a: CreateRunResult, b: CreateRunResult): boolean {
  // ── ALLOCATOR PARITY: same id from the same counter state. ──
  const sameId = a.newSectionId !== null && a.newSectionId === b.newSectionId;
  console.log(
    `${label} :: section_id allocation: ${a.newSectionId} vs ${b.newSectionId} ` +
      `(counter ${a.counterBefore}→${a.counterAfter} vs ${b.counterBefore}→${b.counterAfter}) ` +
      `${sameId ? 'MATCH' : 'DIVERGENCE'}`,
  );
  const sameCounter =
    a.counterBefore === b.counterBefore && a.counterAfter === b.counterAfter;
  if (!sameCounter) {
    console.log(`${label} :: counter state DIVERGENCE`);
  }

  // ── response envelope (default volatile/debug normalization). ──
  const envelope = diffJson(a.responseBytes, b.responseBytes);
  console.log(formatDiffReport(`${label} :: response envelope`, envelope));

  // ── fresh row (volatile-normalized: created_date/created_by_user/dd199 clock). ──
  let rowEqual = false;
  if (a.row !== null && b.row !== null) {
    const aRow = canonicalizeCreateRow(a.row);
    const bRow = canonicalizeCreateRow(b.row);
    const row = diffJson(aRow, bRow);
    console.log(formatDiffReport(`${label} :: fresh matrix row (volatile-normalized)`, row));
    rowEqual = row.equal;
  } else {
    console.log(`${label} :: fresh matrix row DIVERGENCE — a.row=${a.row !== null} b.row=${b.row !== null}`);
  }

  // ── 'NEW' activity row (volatile-normalized; log_data section_id compared verbatim). ──
  const aAct = a.newActivityRows;
  const bAct = b.newActivityRows;
  let actEqual = false;
  if (aAct.length !== bAct.length) {
    console.log(
      `${label} :: matrix_activity NEW row count ${aAct.length} vs ${bAct.length} — DIVERGENCE`,
    );
  } else if (aAct.length === 0) {
    console.log(`${label} :: no 'NEW' activity row created by either run — DIVERGENCE`);
  } else {
    actEqual = true;
    for (let i = 0; i < aAct.length; i++) {
      const d = diffJson(canonicalizeNewActivityRow(aAct[i]!), canonicalizeNewActivityRow(bAct[i]!));
      console.log(formatDiffReport(`${label} :: matrix_activity NEW[${i}] (volatile-normalized)`, d));
      actEqual = actEqual && d.equal;
    }
  }

  return sameId && sameCounter && envelope.equal && rowEqual && actEqual;
}

/** Diff a PHP run vs another run: response envelope + normalized readback row. */
function diffRuns(
  label: string,
  a: WriteRunResult,
  b: WriteRunResult,
): boolean {
  // Response envelope: the differ's DEFAULT volatile (csrf_token) + drop (debug)
  // sets already cover the save response's volatile/debug fields. The save
  // response carries NO date/relation audit leaves (those live in the row), so the
  // default options suffice for the envelope.
  const envelope = diffJson(a.responseBytes, b.responseBytes);
  console.log(formatDiffReport(`${label} :: response envelope`, envelope));

  // Readback row: normalize the volatile leaves (dd201 time, dd197 section_id),
  // then canonicalize + diff. Object-key order is DB-normalized (identical for
  // both engines), so a stable stringify is byte-comparable.
  const aRow = canonicalizePayload(normalizeRowForDiff(a.after));
  const bRow = canonicalizePayload(normalizeRowForDiff(b.after));
  const row = diffJson(aRow, bRow);
  console.log(formatDiffReport(`${label} :: matrix row (volatile-normalized)`, row));

  // Side-table rows: the time-machine snapshot + activity 'SAVE' row the write
  // created. Each save creates exactly one row per table; compare the volatile-
  // normalized canonical rows (id/timestamp/user/IP/clock normalized; STRUCTURE
  // + non-volatile payload must match exactly).
  const tm = diffSideTable(`${label} :: matrix_time_machine`, 'matrix_time_machine', a.sideRows, b.sideRows);
  const act = diffSideTable(`${label} :: matrix_activity`, 'matrix_activity', a.sideRows, b.sideRows);

  return envelope.equal && row.equal && tm && act;
}

/**
 * Diff the created rows of ONE side table between two runs. Asserts the row COUNT
 * matches and each volatile-normalized row is byte-equal. Logs a per-table report.
 */
function diffSideTable(
  label: string,
  table: string,
  aSide: SideRowsByTable,
  bSide: SideRowsByTable,
): boolean {
  const aRows = aSide[table] ?? [];
  const bRows = bSide[table] ?? [];
  if (aRows.length !== bRows.length) {
    console.log(
      `${label}: DIVERGENCE — row count ${aRows.length} vs ${bRows.length} ` +
        `(each save must create exactly one ${table} row)`,
    );
    return false;
  }
  if (aRows.length === 0) {
    console.log(`${label}: DIVERGENCE — no ${table} row created by either run`);
    return false;
  }
  let allEqual = true;
  for (let i = 0; i < aRows.length; i++) {
    const aCanon = canonicalizeSideRow(table, aRows[i]!);
    const bCanon = canonicalizeSideRow(table, bRows[i]!);
    const d = diffJson(aCanon, bCanon);
    console.log(formatDiffReport(`${label}[${i}] (volatile-normalized)`, d));
    allEqual = allEqual && d.equal;
  }
  return allEqual;
}

// ───────────────────────────── DELETE parity ──────────────────────────────────

/** A simple authenticated JSON-API caller (login once, POST RQOs). */
async function makeCaller(apiUrl: string) {
  const s = await login(apiUrl, env.WP_USER ?? 'root', env.WP_PASS ?? '123123aS');
  return async (rqo: Record<string, unknown>) => {
    const r = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: s.cookie,
        'x-dedalo-csrf-token': s.csrfToken,
      },
      body: JSON.stringify(rqo),
    });
    return JSON.parse(await r.text()) as { result?: unknown; msg?: string };
  };
}

/** The delete RQO for a single-record delete_record (source-verified live shape). */
function buildDeleteRqo(sectionTipo: string, sectionId: number): Record<string, unknown> {
  return {
    dd_api: 'dd_core_api',
    action: 'delete',
    source: {
      action: 'delete',
      model: 'section',
      tipo: sectionTipo,
      section_tipo: sectionTipo,
      section_id: String(sectionId),
      mode: 'list',
      lang: 'lg-eng',
      delete_mode: 'delete_record',
    },
    options: { delete_diffusion_records: true },
  };
}

function deleteApplyFor(apiUrl: string, sectionTipo: string, sectionId: number): DeleteApply {
  return {
    apiUrl,
    username: env.WP_USER ?? 'root',
    password: env.WP_PASS ?? '123123aS',
    rqo: buildDeleteRqo(sectionTipo, sectionId),
  };
}

/** Read the matrix_counter value for a tipo (to restore after scratch teardown). */
async function counterValue(sql: Sql, tipo: string): Promise<number | null> {
  const rows = await sql.unsafe<Array<{ value: number | null }>>(
    `SELECT value FROM matrix_counter WHERE tipo = $1 LIMIT 1`,
    [tipo],
  );
  return rows[0]?.value ?? null;
}

/**
 * Diff two DELETE runs: response envelope + the target-deleted flag + the inverse-ref
 * cleanup mutations on each referencing record + the side rows (deleted-record TM +
 * inverse-ref TM/SAVE + DELETE activity). Volatile leaves normalized.
 */
function diffDeleteRuns(
  label: string,
  a: DeleteRunResult,
  b: DeleteRunResult,
): boolean {
  // target deleted by both?
  const bothDeleted = a.targetDeleted && b.targetDeleted;
  console.log(
    `${label} :: target deleted: ${a.targetDeleted} vs ${b.targetDeleted} ${bothDeleted ? 'MATCH' : 'DIVERGENCE'}`,
  );

  // response envelope (default volatile/debug normalization covers csrf_token/debug).
  const envelope = diffJson(a.responseBytes, b.responseBytes);
  console.log(formatDiffReport(`${label} :: response envelope`, envelope));

  // inverse-ref cleanup mutations on each referencing record (volatile dd197/dd201
  // normalized; the cleaned relation column compared verbatim).
  let refEqual = true;
  if (a.referencingAfter.length !== b.referencingAfter.length) {
    console.log(
      `${label} :: referencing-row count ${a.referencingAfter.length} vs ${b.referencingAfter.length} — DIVERGENCE`,
    );
    refEqual = false;
  } else {
    for (let i = 0; i < a.referencingAfter.length; i++) {
      const ra = a.referencingAfter[i]!;
      const rb = b.referencingAfter[i]!;
      const d = diffJson(
        canonicalizeReferencingRow(ra.payload),
        canonicalizeReferencingRow(rb.payload),
      );
      console.log(
        formatDiffReport(
          `${label} :: referencing ${ra.sectionTipo}/${ra.sectionId} (inverse-ref cleanup, volatile-normalized)`,
          d,
        ),
      );
      refEqual = refEqual && d.equal;
    }
  }

  // side rows (TM + activity). Each delete creates a deterministic set; compare counts
  // + volatile-normalized rows.
  const tm = diffSideTable(`${label} :: matrix_time_machine`, 'matrix_time_machine', a.sideRows, b.sideRows);
  const act = diffSideTable(`${label} :: matrix_activity`, 'matrix_activity', a.sideRows, b.sideRows);

  return bothDeleted && envelope.equal && refEqual && tm && act;
}

/**
 * Build the NO-inverse-ref scratch: create a fresh oh1 record (PHP create). Returns
 * the new section_id. The caller deletes the (re-inserted) scratch after the run.
 */
async function setupSimpleScratch(
  call: (r: Record<string, unknown>) => Promise<{ result?: unknown }>,
  sectionTipo: string,
): Promise<number> {
  const r = await call({ dd_api: 'dd_core_api', action: 'create', source: { section_tipo: sectionTipo } });
  const id = Number(r.result);
  if (!Number.isInteger(id)) throw new Error(`scratch create failed: ${JSON.stringify(r)}`);
  return id;
}

/**
 * Build the INVERSE-REF scratch: create A (oh1) + B (rsc170), then save A's oh17
 * portal pointing at B. Deleting B exercises the inverse-ref cleanup (remove B's
 * locator from A's oh17). Returns {a, b}.
 */
async function setupInverseScratch(
  call: (r: Record<string, unknown>) => Promise<{ result?: unknown }>,
): Promise<{ a: number; b: number }> {
  const a = Number((await call({ dd_api: 'dd_core_api', action: 'create', source: { section_tipo: 'oh1' } })).result);
  const b = Number((await call({ dd_api: 'dd_core_api', action: 'create', source: { section_tipo: 'rsc170' } })).result);
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    throw new Error(`inverse scratch create failed a=${a} b=${b}`);
  }
  // Save A.oh17 portal → B (insert a locator). This is a PHP save (the TS save does
  // not handle portals); both engines later delete B from the SAME re-inserted state.
  const portalLoc = {
    type: 'dd151',
    section_id: String(b),
    section_tipo: 'rsc170',
    from_component_tipo: 'oh17',
  };
  await call({
    dd_api: 'dd_core_api',
    action: 'save',
    source: {
      type: 'component',
      model: 'component_portal',
      tipo: 'oh17',
      section_tipo: 'oh1',
      section_id: String(a),
      mode: 'edit',
      lang: 'lg-nolan',
    },
    data: {
      tipo: 'oh17',
      section_tipo: 'oh1',
      section_id: String(a),
      lang: 'lg-nolan',
      changed_data: [{ action: 'insert', key: 0, value: portalLoc }],
    },
  });
  return { a, b };
}

/** Run the DELETE parity (baseline = PHP×2, gate = PHP vs TS) for a given scratch. */
async function runDeleteMode(
  sql: Sql,
  phpUrl: string,
  tsUrl: string,
  isGate: boolean,
  inverse: boolean,
): Promise<boolean> {
  // SETUP scratch via PHP (the create/save the scenario needs). Snapshot counters +
  // the side-table watermarks BEFORE setup so teardown can sweep EVERY row the setup
  // (create/save/login) AND the parity runs produced — leaving the DB byte-identical.
  const call = await makeCaller(phpUrl);
  const oh1Counter0 = await counterValue(sql, 'oh1');
  const rscCounter0 = await counterValue(sql, 'rsc170');
  const tmWatermark0 = (await sql.unsafe<Array<{ m: number }>>(
    `SELECT COALESCE(max(id),0) AS m FROM "matrix_time_machine"`,
    [],
  ))[0]!.m;
  const actWatermark0 = (await sql.unsafe<Array<{ m: number }>>(
    `SELECT COALESCE(max(id),0) AS m FROM "matrix_activity"`,
    [],
  ))[0]!.m;

  let target: DeleteRowTarget;
  let referencing: DeleteRowTarget[] = [];
  let scratchIds: Array<{ tipo: string; id: number }> = [];

  if (inverse) {
    const { a, b } = await setupInverseScratch(call);
    target = { table: 'matrix', sectionTipo: 'rsc170', sectionId: b };
    referencing = [{ table: 'matrix', sectionTipo: 'oh1', sectionId: a }];
    scratchIds = [{ tipo: 'oh1', id: a }, { tipo: 'rsc170', id: b }];
    console.log(`   scratch: delete rsc170/${b}, referenced by oh1/${a} (oh17 portal)`);
  } else {
    const id = await setupSimpleScratch(call, 'oh1');
    target = { table: 'matrix', sectionTipo: 'oh1', sectionId: id };
    scratchIds = [{ tipo: 'oh1', id }];
    console.log(`   scratch: delete oh1/${id} (no inverse refs)`);
  }

  let green = false;
  try {
    const aUrl = phpUrl;
    const bUrl = isGate ? tsUrl : phpUrl;
    const aLabel = isGate ? 'PHP' : 'PHP run #1';
    const bLabel = isGate ? 'TS ' : 'PHP run #2';
    console.log(`\n── DELETE ${aLabel} (${aUrl}) ──`);
    const runA = await runDeleteParity(sql, target, referencing, deleteApplyFor(aUrl, target.sectionTipo, target.sectionId));
    console.log(`   status=${runA.status} deleted=${runA.targetDeleted} bytes=${runA.responseBytes.length}`);
    console.log(`\n── DELETE ${bLabel} (${bUrl}) ──`);
    const runB = await runDeleteParity(sql, target, referencing, deleteApplyFor(bUrl, target.sectionTipo, target.sectionId));
    console.log(`   status=${runB.status} deleted=${runB.targetDeleted} bytes=${runB.responseBytes.length}`);
    const diffLabel = isGate ? 'DELETE PHP-vs-TS' : 'DELETE PHP-vs-PHP';
    console.log(`\n── DIFF (${diffLabel}${inverse ? ' / inverse-ref' : ' / no-inverse-ref'}) ──`);
    green = diffDeleteRuns(diffLabel, runA, runB);
  } finally {
    // TEARDOWN the scratch: delete the (re-inserted) scratch rows, sweep EVERY side
    // row the setup+runs created (create 'NEW' + save 'SAVE' + login rows + their TM
    // rows), and restore counters. Sweeping by the pre-setup watermark leaves the side
    // tables exactly as before the run.
    for (const s of scratchIds) {
      await sql.unsafe(`DELETE FROM "matrix" WHERE section_tipo = $1 AND section_id = $2`, [s.tipo, s.id]);
    }
    await sql.unsafe(`DELETE FROM "matrix_time_machine" WHERE id > $1`, [tmWatermark0]);
    await sql.unsafe(`DELETE FROM "matrix_activity" WHERE id > $1`, [actWatermark0]);
    if (oh1Counter0 !== null) await sql.unsafe(`UPDATE matrix_counter SET value = $1 WHERE tipo = 'oh1'`, [oh1Counter0]);
    if (rscCounter0 !== null) await sql.unsafe(`UPDATE matrix_counter SET value = $1 WHERE tipo = 'rsc170'`, [rscCounter0]);
    console.log('   scratch torn down; side rows swept; counters restored.');
  }
  return green;
}

async function main(): Promise<void> {
  const has = (f: string) => process.argv.includes(f);
  const mode = has('--delete-gate')
    ? 'delete-gate'
    : has('--delete-baseline')
      ? 'delete-baseline'
      : has('--create-gate')
        ? 'create-gate'
        : has('--create-baseline')
          ? 'create-baseline'
          : has('--gate')
            ? 'gate'
            : has('--baseline')
              ? 'baseline'
              : null;
  if (mode === null) {
    console.error(
      'Usage: write_parity.ts (--baseline | --gate | --create-baseline | --create-gate | --delete-baseline | --delete-gate) [--inverse]',
    );
    process.exit(2);
  }
  // --inverse selects the inverse-ref delete scenario (else the no-inverse-ref one).
  const inverse = has('--inverse');

  const sql = openTestDb({
    host: reqEnv('DEDALO_HOSTNAME_CONN'),
    port: Number.parseInt(reqEnv('DEDALO_DB_PORT_CONN'), 10),
    database: reqEnv('DEDALO_DATABASE_CONN'),
    user: reqEnv('DEDALO_USERNAME_CONN'),
    password: reqEnv('DEDALO_PASSWORD_CONN'),
  });

  const phpUrl = env.WP_PHP_URL ?? 'http://localhost:8081/core/api/v1/json/';
  const tsUrl = env.WP_TS_URL ?? 'http://localhost:3300/core/api/v1/json/';

  console.log(
    `Write-parity ${mode}: ${TARGET.table} ${TARGET.sectionTipo}/${TARGET.sectionId} ` +
      `tipo=${env.WP_TIPO ?? 'oh14'} value=${JSON.stringify(NEW_VALUE)}`,
  );

  const createTarget = { table: TARGET.table, sectionTipo: TARGET.sectionTipo };

  let green = false;
  try {
    if (mode === 'delete-baseline' || mode === 'delete-gate') {
      green = await runDeleteMode(sql, phpUrl, tsUrl, mode === 'delete-gate', inverse);
    } else if (mode === 'create-baseline' || mode === 'create-gate') {
      // CREATE parity: snapshot counter+watermarks → create → reset → create again.
      const aUrl = phpUrl;
      const bUrl = mode === 'create-gate' ? tsUrl : phpUrl;
      const aLabel = mode === 'create-gate' ? 'PHP' : 'PHP run #1';
      const bLabel = mode === 'create-gate' ? 'TS ' : 'PHP run #2';
      console.log(`\n── CREATE ${aLabel} (${aUrl}) ──`);
      const runA = await runCreateParity(sql, createTarget, createApplyFor(aUrl));
      console.log(
        `   status=${runA.status} new_section_id=${runA.newSectionId} ` +
          `counter ${runA.counterBefore}→${runA.counterAfter} bytes=${runA.responseBytes.length}`,
      );
      console.log(`\n── CREATE ${bLabel} (${bUrl}) ──`);
      const runB = await runCreateParity(sql, createTarget, createApplyFor(bUrl));
      console.log(
        `   status=${runB.status} new_section_id=${runB.newSectionId} ` +
          `counter ${runB.counterBefore}→${runB.counterAfter} bytes=${runB.responseBytes.length}`,
      );
      const diffLabel = mode === 'create-gate' ? 'CREATE PHP-vs-TS' : 'CREATE PHP-vs-PHP';
      console.log(`\n── DIFF (${diffLabel}) ──`);
      green = diffCreateRuns(diffLabel, runA, runB);
    } else if (mode === 'baseline') {
      console.log(`\n── PHP run #1 (${phpUrl}) ──`);
      const run1 = await runWriteParity(sql, TARGET, applyFor(phpUrl));
      console.log(`   status=${run1.status} response bytes=${run1.responseBytes.length}`);
      console.log(`\n── PHP run #2 (${phpUrl}) ──`);
      const run2 = await runWriteParity(sql, TARGET, applyFor(phpUrl));
      console.log(`   status=${run2.status} response bytes=${run2.responseBytes.length}`);
      console.log('\n── DIFF (PHP run #1 vs PHP run #2) ──');
      green = diffRuns('PHP-vs-PHP', run1, run2);
    } else {
      console.log(`\n── PHP run (${phpUrl}) ──`);
      const php = await runWriteParity(sql, TARGET, applyFor(phpUrl));
      console.log(`   status=${php.status} response bytes=${php.responseBytes.length}`);
      console.log(`\n── TS run (${tsUrl}) ──`);
      const ts = await runWriteParity(sql, TARGET, applyFor(tsUrl));
      console.log(`   status=${ts.status} response bytes=${ts.responseBytes.length}`);
      console.log('\n── DIFF (PHP vs TS) ──');
      green = diffRuns('PHP-vs-TS', php, ts);

      // Structure check: the audit-stamp KEY SET must match PHP exactly (only the
      // volatile leaves may differ). Compare the RAW (un-normalized) row key
      // structure for date.dd201 + relation.dd197.
      console.log('\n── AUDIT-STAMP STRUCTURE (raw, pre-normalization) ──');
      reportAuditStructure('PHP', php.after);
      reportAuditStructure('TS ', ts.after);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log(`\n${green ? 'PASS — byte-green' : 'FAIL — divergence above'}`);
  process.exit(green ? 0 : 1);
}

/** Print the dd201/dd197 item key sets so a structural divergence is visible. */
function reportAuditStructure(label: string, payload: { date: unknown; relation: unknown }): void {
  const dateItem = firstItem(payload.date, 'dd201');
  const relItem = firstItem(payload.relation, 'dd197');
  const dateKeys = dateItem ? Object.keys(dateItem).join(',') : '(absent)';
  const startKeys =
    dateItem && dateItem.start && typeof dateItem.start === 'object'
      ? Object.keys(dateItem.start as object).join(',')
      : '(absent)';
  const relKeys = relItem ? Object.keys(relItem).join(',') : '(absent)';
  console.log(`  ${label} date.dd201[0] keys: {${dateKeys}}  start keys: {${startKeys}}`);
  console.log(`  ${label} relation.dd197[0] keys: {${relKeys}}`);
}

function firstItem(col: unknown, tipo: string): (Record<string, unknown> & { start?: unknown }) | null {
  if (col === null || typeof col !== 'object') return null;
  const items = (col as Record<string, unknown>)[tipo];
  if (!Array.isArray(items) || items.length === 0) return null;
  const first = items[0];
  return first !== null && typeof first === 'object' ? (first as Record<string, unknown>) : null;
}

void main();
