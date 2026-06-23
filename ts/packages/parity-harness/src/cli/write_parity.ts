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
  runDuplicateParity,
  runDeleteParity,
  runAddChildParity,
  runMultiRowWriteParity,
  normalizeRowForDiff,
  canonicalizePayload,
  canonicalizeSideRow,
  canonicalizeCreateRow,
  canonicalizeNewActivityRow,
  canonicalizeReferencingRow,
  canonicalizeAddChildRow,
  canonicalizeDuplicateRow,
  isolateDuplicateSideRows,
  canonicalizeMultiRow,
  type MatrixRowTarget,
  type WriteApply,
  type WriteRunResult,
  type SideRowsByTable,
  type CreateApply,
  type CreateRunResult,
  type DuplicateApply,
  type DuplicateRunResult,
  type DeleteApply,
  type DeleteRowTarget,
  type DeleteRunResult,
  type AddChildApply,
  type AddChildRunResult,
  type MultiRowRunResult,
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
 * The save RQO for a single-component value mutation (source-verified). Driven by env:
 *   WP_MODEL   component_input_text | component_text_area | component_number | component_date
 *   WP_ACTION  update | insert | remove
 *   WP_TIPO    the component tipo (data column key)
 *   WP_LANG    the data lang (lg-nolan for nolan models)
 *   WP_ITEM_ID for update/remove: the existing item id to target
 *   WP_VALUE_JSON  for update/insert: the changed_data item `value` as JSON. When
 *                  absent, defaults to the input_text {id,lang,value:WP_VALUE} shape.
 *
 * The frontend sends the changed_data item's `value` as the FULL data-item OBJECT and
 * (for update) the matching `id` at the top — update_data_value locates the existing
 * item by id and replaces it (update), appends/replaces a new one (insert), or drops
 * it (remove).
 */
function buildSaveRqo(): Record<string, unknown> {
  const model = env.WP_MODEL ?? 'component_input_text';
  const tipo = env.WP_TIPO ?? 'oh14';
  const lang = env.WP_LANG ?? 'lg-nolan';
  const action = env.WP_ACTION ?? 'update';
  // WP_ITEM_ID may be the literal 'null' (the cross-lang id-sync path: the frontend
  // sends id:null when editing an item in a lang whose slice is empty — the server
  // resolves the id from another lang at WP_KEY). Otherwise a numeric id.
  const itemIdRaw = env.WP_ITEM_ID ?? '1';
  const itemId: number | null =
    itemIdRaw === 'null' ? null : Number.parseInt(itemIdRaw, 10);
  // The changed_data `key` (the per-lang array position the id-sync resolves against).
  const key = Number.parseInt(env.WP_KEY ?? '0', 10);

  // The changed_data value object: explicit JSON, or the default input_text shape.
  // A null id is OMITTED from the default value object (the frontend's item_value for
  // an empty-lang edit carries only {lang, value}).
  const value: unknown =
    env.WP_VALUE_JSON !== undefined
      ? JSON.parse(env.WP_VALUE_JSON)
      : itemId === null
        ? { lang, value: NEW_VALUE }
        : { id: itemId, lang, value: NEW_VALUE };

  let changedItem: Record<string, unknown>;
  if (action === 'remove') {
    changedItem = { action: 'remove', key, id: itemId };
  } else if (action === 'insert') {
    changedItem = { action: 'insert', key, value };
  } else {
    changedItem = { action: 'update', key, id: itemId, value };
  }

  return {
    dd_api: 'dd_core_api',
    action: 'save',
    source: {
      type: 'component',
      model,
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
      changed_data: [changedItem],
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

// ───────────────────────────── DUPLICATE parity ───────────────────────────────

/** The duplicate source record (env-driven; default oh1/2 — a small record). */
const DUP_SECTION_TIPO = env.WP_DUP_SECTION_TIPO ?? 'oh1';
const DUP_SECTION_ID = env.WP_DUP_SECTION_ID ?? '2';

/**
 * The duplicate RQO. The frontend's "duplicate record" button sends exactly
 * { action:'duplicate', source:{ section_tipo, section_id } } — section_id is a string.
 */
function buildDuplicateRqo(): Record<string, unknown> {
  return {
    dd_api: 'dd_core_api',
    action: 'duplicate',
    source: { section_tipo: DUP_SECTION_TIPO, section_id: DUP_SECTION_ID },
  };
}

function duplicateApplyFor(apiUrl: string, loginUrl?: string): DuplicateApply {
  return {
    apiUrl,
    ...(loginUrl ? { loginUrl } : {}),
    username: env.WP_USER ?? 'root',
    password: env.WP_PASS ?? '123123aS',
    rqo: buildDuplicateRqo(),
  };
}

/**
 * Normalize the duplicate response bytes: the `result` (the new section_id) is a
 * fresh allocation per run, so mask it. csrf_token/debug are handled by diffJson's
 * default volatile/drop sets. The msg/errors/action are compared verbatim.
 */
function normalizeDuplicateResponse(bytes: string): string {
  try {
    const obj = JSON.parse(bytes) as Record<string, unknown>;
    if ('result' in obj) obj.result = '<new_section_id>';
    return JSON.stringify(obj);
  } catch {
    return bytes;
  }
}

/**
 * Diff two DUPLICATE runs (PHP-vs-PHP baseline OR PHP-vs-TS gate). The duplicate copies
 * a source record into a NEW record (create-with-source-values + the per-component
 * re-save cascade). The gate proves byte parity for:
 *   - the SAME new section_id from the SAME reset counter state (the allocator parity —
 *     both engines start from the restored counter, so they MUST allocate the same id),
 *   - the counter advanced by exactly 1 in each run,
 *   - the response envelope (new section_id masked — also identical when un-masked since
 *     the same id is allocated, but we mask defensively),
 *   - the NEW record's matrix row (volatile audit leaves normalized; the COPIED
 *     component data + meta counters + data label compared verbatim),
 *   - the duplicate's side rows: the 'NEW' activity + per-component TM + 'SAVE' activity
 *     (isolated from the login rows by the new section_id), byte-equal in id order.
 */
function diffDuplicateRuns(label: string, a: DuplicateRunResult, b: DuplicateRunResult): boolean {
  // ── ALLOCATOR PARITY: same new id from the same reset counter state. ──
  const sameId = a.newSectionId !== null && a.newSectionId === b.newSectionId;
  console.log(
    `${label} :: new section_id allocation: ${a.newSectionId} vs ${b.newSectionId} ` +
      `(counter ${a.counterBefore}→${a.counterAfter} vs ${b.counterBefore}→${b.counterAfter}) ` +
      `${sameId ? 'MATCH' : 'DIVERGENCE'}`,
  );
  const sameCounter = a.counterBefore === b.counterBefore && a.counterAfter === b.counterAfter;
  const aDelta = a.counterBefore !== null && a.counterAfter !== null ? a.counterAfter - a.counterBefore : null;
  const bDelta = b.counterBefore !== null && b.counterAfter !== null ? b.counterAfter - b.counterBefore : null;
  const counterOk = aDelta === 1 && bDelta === 1 && sameCounter;
  if (!counterOk) console.log(`${label} :: counter state DIVERGENCE (Δ${aDelta} vs Δ${bDelta})`);

  // response envelope (new id masked).
  const envelope = diffJson(
    normalizeDuplicateResponse(a.responseBytes),
    normalizeDuplicateResponse(b.responseBytes),
  );
  console.log(formatDiffReport(`${label} :: response envelope (new id masked)`, envelope));

  // new record row (volatile-normalized: created/modified audit leaves).
  let rowEqual = false;
  if (a.row !== null && b.row !== null) {
    const d = diffJson(canonicalizeDuplicateRow(a.row), canonicalizeDuplicateRow(b.row));
    console.log(formatDiffReport(`${label} :: new record row (volatile-normalized)`, d));
    rowEqual = d.equal;
  } else {
    console.log(`${label} :: new record row DIVERGENCE — a=${a.row !== null} b=${b.row !== null}`);
  }

  // duplicate side rows: the NEW activity + per-component TM + SAVE activity, isolated
  // from the login rows by the new section_id, byte-compared in id order.
  const aSide = isolateDuplicateSideRows(a.sideRows, a.newSectionId);
  const bSide = isolateDuplicateSideRows(b.sideRows, b.newSectionId);

  let tmEqual = true;
  if (aSide.tm.length !== bSide.tm.length) {
    console.log(`${label} :: TM row count ${aSide.tm.length} vs ${bSide.tm.length} — DIVERGENCE`);
    tmEqual = false;
  } else if (aSide.tm.length === 0) {
    console.log(`${label} :: no per-component TM rows isolated — DIVERGENCE`);
    tmEqual = false;
  } else {
    for (let i = 0; i < aSide.tm.length; i++) {
      const d = diffJson(
        canonicalizeSideRow('matrix_time_machine', aSide.tm[i]!),
        canonicalizeSideRow('matrix_time_machine', bSide.tm[i]!),
      );
      console.log(formatDiffReport(`${label} :: TM[${i}] (volatile-normalized)`, d));
      tmEqual = tmEqual && d.equal;
    }
  }

  let actEqual = true;
  if (aSide.act.length !== bSide.act.length) {
    console.log(`${label} :: activity row count ${aSide.act.length} vs ${bSide.act.length} — DIVERGENCE`);
    actEqual = false;
  } else if (aSide.act.length === 0) {
    console.log(`${label} :: no NEW/SAVE activity rows isolated — DIVERGENCE`);
    actEqual = false;
  } else {
    for (let i = 0; i < aSide.act.length; i++) {
      const d = diffJson(
        canonicalizeSideRow('matrix_activity', aSide.act[i]!),
        canonicalizeSideRow('matrix_activity', bSide.act[i]!),
      );
      console.log(formatDiffReport(`${label} :: activity[${i}] (volatile-normalized)`, d));
      actEqual = actEqual && d.equal;
    }
  }

  return sameId && counterOk && envelope.equal && rowEqual && tmEqual && actEqual;
}

/**
 * The OPTIONAL relation-save TARGET row(s) to ALSO snapshot/diff/restore. For a
 * component_select add/remove this proves the target record is byte-identical (NO
 * inverse-ref written). Driven by env WP_RELATED_TABLE/TIPO/ID (one target). Empty
 * for the literal save path.
 */
function relatedTargets(): MatrixRowTarget[] {
  const t = env.WP_RELATED_TABLE;
  const st = env.WP_RELATED_SECTION_TIPO;
  const sid = env.WP_RELATED_SECTION_ID;
  if (!t || !st || !sid) return [];
  return [{ table: t, sectionTipo: st, sectionId: Number.parseInt(sid, 10) }];
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

  // Related (relation-save TARGET) rows: for a select add/remove these PROVE the target
  // record is byte-identical before AND after (NO inverse-ref written), and identical
  // across the two engines. Each related row must (1) match between the two runs and
  // (2) be unchanged before→after within EACH run (volatile dd197/dd201 normalized —
  // the target is NOT re-stamped, so it must be fully byte-equal incl. those leaves).
  let related = true;
  if (a.relatedRows.length !== b.relatedRows.length) {
    console.log(
      `${label} :: related-row count ${a.relatedRows.length} vs ${b.relatedRows.length} — DIVERGENCE`,
    );
    related = false;
  } else {
    for (let i = 0; i < a.relatedRows.length; i++) {
      const ra = a.relatedRows[i]!;
      const rb = b.relatedRows[i]!;
      // (1) target after-row identical across engines.
      const cross = diffJson(canonicalizePayload(ra.after), canonicalizePayload(rb.after));
      console.log(
        formatDiffReport(`${label} :: TARGET ${ra.sectionTipo}/${ra.sectionId} after (PHP-vs-TS)`, cross),
      );
      // (2) target unchanged before→after within each run (NO inverse-ref mutation).
      const aUnchanged = canonicalizePayload(ra.before) === canonicalizePayload(ra.after);
      const bUnchanged = canonicalizePayload(rb.before) === canonicalizePayload(rb.after);
      console.log(
        `${label} :: TARGET ${ra.sectionTipo}/${ra.sectionId} unchanged before→after: ` +
          `runA=${aUnchanged} runB=${bUnchanged} ${aUnchanged && bUnchanged ? 'MATCH (no inverse ref)' : 'DIVERGENCE (inverse ref written!)'}`,
      );
      related = related && cross.equal && aUnchanged && bUnchanged;
    }
  }

  return envelope.equal && row.equal && tm && act && related;
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

// ───────────────────────────── ADD_CHILD (dd_ts_api) parity ────────────────────

/** The add_child target parent (env WP_PARENT_TIPO/ID, default the tchi1 thesaurus). */
const ADD_CHILD_PARENT: MatrixRowTarget = {
  table: env.WP_PARENT_TABLE ?? 'matrix',
  sectionTipo: env.WP_PARENT_TIPO ?? 'tchi1',
  sectionId: Number.parseInt(env.WP_PARENT_ID ?? '1', 10),
};

/**
 * The add_child RQO (dd_ts_api). The frontend's tree "add child" button sends
 * { dd_api:'dd_ts_api', action:'add_child', prevent_lock:true, source:{section_tipo,
 * section_id} } — section_id is ALWAYS a string.
 */
function buildAddChildRqo(): Record<string, unknown> {
  return {
    dd_api: 'dd_ts_api',
    action: 'add_child',
    prevent_lock: true,
    source: {
      section_tipo: ADD_CHILD_PARENT.sectionTipo,
      section_id: String(ADD_CHILD_PARENT.sectionId),
    },
  };
}

function addChildApplyFor(apiUrl: string): AddChildApply {
  return {
    apiUrl,
    username: env.WP_USER ?? 'root',
    password: env.WP_PASS ?? '123123aS',
    rqo: buildAddChildRqo(),
  };
}

/**
 * Isolate the add_child activity rows (NEW + 4 SAVE) from the login activity rows that
 * share the watermark window. The add_child rows are exactly those whose DATA (dd551)
 * log_data.section_id equals the new child section_id (NEW + SAVE both carry it). The
 * login row's log_data has no such section_id. Returns them in id order.
 */
function addChildActivityRows(
  rows: Array<Record<string, unknown>>,
  childId: number | null,
): Array<Record<string, unknown>> {
  if (childId === null) return [];
  return rows.filter((row) => {
    const misc = row.misc as Record<string, unknown> | null;
    const dd551 = misc?.['dd551'];
    if (!Array.isArray(dd551) || dd551.length === 0) return false;
    const value = (dd551[0] as Record<string, unknown> | null)?.['value'];
    if (value === null || typeof value !== 'object') return false;
    const sid = (value as Record<string, unknown>)['section_id'];
    return sid === childId || String(sid) === String(childId);
  });
}

/**
 * Diff two add_child runs: section_id allocation + counter + response envelope + new
 * child row + parent-unchanged + side rows (4 TM + the NEW/SAVE activity rows).
 */
function diffAddChildRuns(label: string, a: AddChildRunResult, b: AddChildRunResult): boolean {
  // ── ALLOCATOR PARITY: same child id from the same counter state. ──
  const sameId = a.newSectionId !== null && a.newSectionId === b.newSectionId;
  console.log(
    `${label} :: child section_id allocation: ${a.newSectionId} vs ${b.newSectionId} ` +
      `(counter ${a.counterBefore}→${a.counterAfter} vs ${b.counterBefore}→${b.counterAfter}) ` +
      `${sameId ? 'MATCH' : 'DIVERGENCE'}`,
  );
  const sameCounter = a.counterBefore === b.counterBefore && a.counterAfter === b.counterAfter;
  if (!sameCounter) console.log(`${label} :: counter state DIVERGENCE`);

  // ── response envelope (default volatile/debug normalization). ──
  const envelope = diffJson(a.responseBytes, b.responseBytes);
  console.log(formatDiffReport(`${label} :: response envelope`, envelope));

  // ── new child row (volatile-normalized). ──
  let childEqual = false;
  if (a.childRow !== null && b.childRow !== null) {
    const d = diffJson(canonicalizeAddChildRow(a.childRow), canonicalizeAddChildRow(b.childRow));
    console.log(formatDiffReport(`${label} :: new child row (volatile-normalized)`, d));
    childEqual = d.equal;
  } else {
    console.log(
      `${label} :: new child row DIVERGENCE — a=${a.childRow !== null} b=${b.childRow !== null}`,
    );
  }

  // ── parent row unchanged before→after within EACH run, AND identical across runs. ──
  const aParentUnchanged = canonicalizePayload(a.parentBefore) === canonicalizePayload(a.parentAfter);
  const bParentUnchanged = canonicalizePayload(b.parentBefore) === canonicalizePayload(b.parentAfter);
  console.log(
    `${label} :: PARENT unchanged before→after: runA=${aParentUnchanged} runB=${bParentUnchanged} ` +
      `${aParentUnchanged && bParentUnchanged ? 'MATCH (children are computed inverse)' : 'DIVERGENCE (parent mutated!)'}`,
  );
  const parentCross = diffJson(
    canonicalizePayload(a.parentAfter),
    canonicalizePayload(b.parentAfter),
  );
  console.log(formatDiffReport(`${label} :: PARENT row after (PHP-vs-other)`, parentCross));

  // ── time-machine rows (4: is_descriptor, is_indexable, order, relation_parent). ──
  const tm = diffSideTable(
    `${label} :: matrix_time_machine`,
    'matrix_time_machine',
    a.sideRows,
    b.sideRows,
  );

  // ── activity rows (isolated add_child NEW + SAVE rows). ──
  const aAct = addChildActivityRows(a.sideRows.matrix_activity ?? [], a.newSectionId);
  const bAct = addChildActivityRows(b.sideRows.matrix_activity ?? [], b.newSectionId);
  let actEqual = true;
  if (aAct.length !== bAct.length) {
    console.log(
      `${label} :: matrix_activity add_child row count ${aAct.length} vs ${bAct.length} — DIVERGENCE`,
    );
    actEqual = false;
  } else if (aAct.length === 0) {
    console.log(`${label} :: no add_child activity rows isolated — DIVERGENCE`);
    actEqual = false;
  } else {
    for (let i = 0; i < aAct.length; i++) {
      const d = diffJson(
        canonicalizeSideRow('matrix_activity', aAct[i]!),
        canonicalizeSideRow('matrix_activity', bAct[i]!),
      );
      console.log(formatDiffReport(`${label} :: matrix_activity add_child[${i}] (volatile-normalized)`, d));
      actEqual = actEqual && d.equal;
    }
  }

  return (
    sameId && sameCounter && envelope.equal && childEqual && aParentUnchanged && bParentUnchanged &&
    parentCross.equal && tm && actEqual
  );
}

// ──────────────── SAVE_ORDER / UPDATE_PARENT_DATA (dd_ts_api) parity ────────────
//
// Both ops mutate MANY sibling rows (number column) + (move only) the moved node's
// relation column, and emit, per order save, a TM pair (save-before-repair synthetic +
// new) + a SAVE activity; the move additionally emits the relation_parent save's TM
// pair + activity. The gate snapshots all touched rows, diffs the readback rows
// (volatile-normalized) + the side rows (isolated from login rows by section_id), and
// the harness restores every row + sweeps the side rows.

/** The thesaurus section + parent + sibling set the order ops target (env-driven). */
const TS_SECTION_TIPO = env.WP_TS_SECTION_TIPO ?? 'ds1';
const TS_PARENT_ID = Number.parseInt(env.WP_TS_PARENT_ID ?? '1', 10);
const TS_TABLE = env.WP_TS_TABLE ?? 'matrix_hierarchy';
const TS_CHILDREN_TIPO = env.WP_TS_CHILDREN_TIPO ?? 'hierarchy49';
/** The ordered child section_ids (comma-separated; the save_order list / move target set). */
const TS_SIBLINGS = (env.WP_TS_SIBLINGS ?? '28,32,33,34,35,39')
  .split(',')
  .map((s) => Number.parseInt(s.trim(), 10))
  .filter((n) => Number.isInteger(n));

function siblingTargets(): MatrixRowTarget[] {
  return TS_SIBLINGS.map((id) => ({
    table: TS_TABLE,
    sectionTipo: TS_SECTION_TIPO,
    sectionId: id,
  }));
}

/** The save_order rqo: REVERSE the current sibling order (deterministic reorder). */
function buildSaveOrderRqo(): Record<string, unknown> {
  const ordered = [...TS_SIBLINGS].reverse();
  return {
    dd_api: 'dd_ts_api',
    action: 'save_order',
    prevent_lock: true,
    source: {
      section_tipo: TS_SECTION_TIPO,
      ar_locators: ordered.map((id) => ({
        type: 'dd47',
        section_id: String(id),
        section_tipo: TS_SECTION_TIPO,
        from_component_tipo: TS_CHILDREN_TIPO,
      })),
      parent_section_tipo: TS_SECTION_TIPO,
      parent_section_id: String(TS_PARENT_ID),
    },
  };
}

function saveOrderApplyFor(apiUrl: string): WriteApply {
  return {
    apiUrl,
    username: env.WP_USER ?? 'root',
    password: env.WP_PASS ?? '123123aS',
    rqo: buildSaveOrderRqo(),
  };
}

/** The move target node + the NEW parent (env-driven; default move 28 → new parent 2). */
const TS_MOVE_NODE = Number.parseInt(env.WP_TS_MOVE_NODE ?? '28', 10);
const TS_NEW_PARENT_ID = Number.parseInt(env.WP_TS_NEW_PARENT_ID ?? '2', 10);

function buildMoveRqo(): Record<string, unknown> {
  return {
    dd_api: 'dd_ts_api',
    action: 'update_parent_data',
    prevent_lock: true,
    source: {
      section_id: String(TS_MOVE_NODE),
      section_tipo: TS_SECTION_TIPO,
      old_parent_section_id: String(TS_PARENT_ID),
      old_parent_section_tipo: TS_SECTION_TIPO,
      new_parent_section_id: String(TS_NEW_PARENT_ID),
      new_parent_section_tipo: TS_SECTION_TIPO,
      tipo: TS_CHILDREN_TIPO,
    },
  };
}

function moveApplyFor(apiUrl: string): WriteApply {
  return {
    apiUrl,
    username: env.WP_USER ?? 'root',
    password: env.WP_PASS ?? '123123aS',
    rqo: buildMoveRqo(),
  };
}

/**
 * Isolate the order-op side rows (TM + activity) from the login rows in the same
 * watermark window. TM rows are isolated by section_id ∈ the touched-row set. Activity
 * rows are isolated by log_data.section_id ∈ the same set (the login activity has no
 * matching section_id). Returns {tm, act} arrays in id order.
 */
function isolateOrderSideRows(
  side: SideRowsByTable,
  touchedIds: ReadonlySet<number>,
): { tm: Array<Record<string, unknown>>; act: Array<Record<string, unknown>> } {
  const tm = (side.matrix_time_machine ?? []).filter((r) => {
    const sid = r.section_id;
    return typeof sid === 'number' ? touchedIds.has(sid) : touchedIds.has(Number(sid));
  });
  const act = (side.matrix_activity ?? []).filter((row) => {
    const misc = row.misc as Record<string, unknown> | null;
    const dd551 = misc?.['dd551'];
    if (!Array.isArray(dd551) || dd551.length === 0) return false;
    const value = (dd551[0] as Record<string, unknown> | null)?.['value'];
    if (value === null || typeof value !== 'object') return false;
    const sid = (value as Record<string, unknown>)['section_id'];
    const n = Number(sid);
    return Number.isInteger(n) && touchedIds.has(n);
  });
  return { tm, act };
}

/**
 * Diff two multi-row order-op runs: response envelope + each touched row (volatile-
 * normalized) + the isolated side rows (TM pairs + SAVE activities). For the move the
 * old/new parent rows are NOT in the target set (proven untouched separately by the
 * caller); here every target row must match byte-for-byte across the two runs.
 */
function diffMultiRowRuns(
  label: string,
  a: MultiRowRunResult,
  b: MultiRowRunResult,
  touchedIds: ReadonlySet<number>,
): boolean {
  const envelope = diffJson(a.responseBytes, b.responseBytes);
  console.log(formatDiffReport(`${label} :: response envelope`, envelope));

  // every touched row identical across runs (volatile-normalized).
  let rowsEqual = true;
  const keys = Object.keys(a.after).sort();
  for (const k of keys) {
    const ar = a.after[k];
    const br = b.after[k];
    if (ar === undefined || br === undefined) {
      console.log(`${label} :: row ${k} missing in one run — DIVERGENCE`);
      rowsEqual = false;
      continue;
    }
    const d = diffJson(canonicalizeMultiRow(ar), canonicalizeMultiRow(br));
    console.log(formatDiffReport(`${label} :: row ${k} (volatile-normalized)`, d));
    rowsEqual = rowsEqual && d.equal;
  }

  // side rows: isolate the order/relation saves, diff TM + activity in id order.
  const aSide = isolateOrderSideRows(a.sideRows, touchedIds);
  const bSide = isolateOrderSideRows(b.sideRows, touchedIds);

  let tmEqual = true;
  if (aSide.tm.length !== bSide.tm.length) {
    console.log(`${label} :: TM row count ${aSide.tm.length} vs ${bSide.tm.length} — DIVERGENCE`);
    tmEqual = false;
  } else {
    for (let i = 0; i < aSide.tm.length; i++) {
      const d = diffJson(
        canonicalizeSideRow('matrix_time_machine', aSide.tm[i]!),
        canonicalizeSideRow('matrix_time_machine', bSide.tm[i]!),
      );
      console.log(formatDiffReport(`${label} :: TM[${i}] (volatile-normalized)`, d));
      tmEqual = tmEqual && d.equal;
    }
  }

  let actEqual = true;
  if (aSide.act.length !== bSide.act.length) {
    console.log(
      `${label} :: activity row count ${aSide.act.length} vs ${bSide.act.length} — DIVERGENCE`,
    );
    actEqual = false;
  } else {
    for (let i = 0; i < aSide.act.length; i++) {
      const d = diffJson(
        canonicalizeSideRow('matrix_activity', aSide.act[i]!),
        canonicalizeSideRow('matrix_activity', bSide.act[i]!),
      );
      console.log(formatDiffReport(`${label} :: activity[${i}] (volatile-normalized)`, d));
      actEqual = actEqual && d.equal;
    }
  }

  return envelope.equal && rowsEqual && tmEqual && actEqual;
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
  const mode = has('--saveorder-gate')
    ? 'saveorder-gate'
    : has('--saveorder-baseline')
      ? 'saveorder-baseline'
      : has('--move-gate')
        ? 'move-gate'
        : has('--move-baseline')
          ? 'move-baseline'
          : has('--addchild-gate')
            ? 'addchild-gate'
            : has('--addchild-baseline')
              ? 'addchild-baseline'
              : has('--delete-gate')
                ? 'delete-gate'
                : has('--delete-baseline')
                  ? 'delete-baseline'
                  : has('--create-gate')
                    ? 'create-gate'
                    : has('--create-baseline')
                      ? 'create-baseline'
                      : has('--duplicate-gate')
                        ? 'duplicate-gate'
                        : has('--duplicate-baseline')
                          ? 'duplicate-baseline'
                          : has('--gate')
                            ? 'gate'
                            : has('--baseline')
                              ? 'baseline'
                              : null;
  if (mode === null) {
    console.error(
      'Usage: write_parity.ts (--baseline | --gate | --create-* | --duplicate-* | --delete-* | --addchild-* | --saveorder-* | --move-*) [--inverse]',
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
    if (mode === 'saveorder-baseline' || mode === 'saveorder-gate') {
      const aUrl = phpUrl;
      const bUrl = mode === 'saveorder-gate' ? tsUrl : phpUrl;
      const aLabel = mode === 'saveorder-gate' ? 'PHP' : 'PHP run #1';
      const bLabel = mode === 'saveorder-gate' ? 'TS ' : 'PHP run #2';
      const targets = siblingTargets();
      const touched = new Set(TS_SIBLINGS);
      console.log(
        `save_order: ${TS_TABLE} ${TS_SECTION_TIPO} parent ${TS_PARENT_ID}, siblings [${TS_SIBLINGS.join(',')}] → reversed`,
      );
      console.log(`\n── SAVE_ORDER ${aLabel} (${aUrl}) ──`);
      const runA = await runMultiRowWriteParity(sql, targets, saveOrderApplyFor(aUrl), TS_SIBLINGS.length);
      console.log(`   status=${runA.status} bytes=${runA.responseBytes.length} tm=${(runA.sideRows.matrix_time_machine ?? []).length}`);
      console.log(`\n── SAVE_ORDER ${bLabel} (${bUrl}) ──`);
      const runB = await runMultiRowWriteParity(sql, targets, saveOrderApplyFor(bUrl), TS_SIBLINGS.length);
      console.log(`   status=${runB.status} bytes=${runB.responseBytes.length} tm=${(runB.sideRows.matrix_time_machine ?? []).length}`);
      const diffLabel = mode === 'saveorder-gate' ? 'SAVE_ORDER PHP-vs-TS' : 'SAVE_ORDER PHP-vs-PHP';
      console.log(`\n── DIFF (${diffLabel}) ──`);
      green = diffMultiRowRuns(diffLabel, runA, runB, touched);
    } else if (mode === 'move-baseline' || mode === 'move-gate') {
      const aUrl = phpUrl;
      const bUrl = mode === 'move-gate' ? tsUrl : phpUrl;
      const aLabel = mode === 'move-gate' ? 'PHP' : 'PHP run #1';
      const bLabel = mode === 'move-gate' ? 'TS ' : 'PHP run #2';
      // The touched set: the moved node + every OLD-parent sibling (the recalc set).
      const touched = new Set(TS_SIBLINGS);
      const targets = siblingTargets();
      // ALSO snapshot the old + new parent rows to PROVE they are untouched.
      const parentTargets: MatrixRowTarget[] = [
        { table: TS_TABLE, sectionTipo: TS_SECTION_TIPO, sectionId: TS_PARENT_ID },
        { table: TS_TABLE, sectionTipo: TS_SECTION_TIPO, sectionId: TS_NEW_PARENT_ID },
      ];
      const allTargets = [...targets, ...parentTargets];
      console.log(
        `update_parent_data: move ${TS_SECTION_TIPO}/${TS_MOVE_NODE} from parent ${TS_PARENT_ID} → ${TS_NEW_PARENT_ID}`,
      );
      console.log(`\n── MOVE ${aLabel} (${aUrl}) ──`);
      const runA = await runMultiRowWriteParity(sql, allTargets, moveApplyFor(aUrl), TS_SIBLINGS.length);
      console.log(`   status=${runA.status} bytes=${runA.responseBytes.length} tm=${(runA.sideRows.matrix_time_machine ?? []).length}`);
      console.log(`\n── MOVE ${bLabel} (${bUrl}) ──`);
      const runB = await runMultiRowWriteParity(sql, allTargets, moveApplyFor(bUrl), TS_SIBLINGS.length);
      console.log(`   status=${runB.status} bytes=${runB.responseBytes.length} tm=${(runB.sideRows.matrix_time_machine ?? []).length}`);
      const diffLabel = mode === 'move-gate' ? 'MOVE PHP-vs-TS' : 'MOVE PHP-vs-PHP';
      console.log(`\n── DIFF (${diffLabel}) ──`);
      green = diffMultiRowRuns(diffLabel, runA, runB, touched);
      // PARENTS must be unchanged before→after within EACH run (computed inverse).
      for (const p of parentTargets) {
        const k = `${p.sectionTipo}/${p.sectionId}`;
        const aUnchanged = canonicalizePayload(runA.before[k]!) === canonicalizePayload(runA.after[k]!);
        const bUnchanged = canonicalizePayload(runB.before[k]!) === canonicalizePayload(runB.after[k]!);
        console.log(
          `${diffLabel} :: PARENT ${k} unchanged before→after: runA=${aUnchanged} runB=${bUnchanged} ` +
            `${aUnchanged && bUnchanged ? 'MATCH (computed inverse)' : 'DIVERGENCE (parent mutated!)'}`,
        );
        green = green && aUnchanged && bUnchanged;
      }
    } else if (mode === 'addchild-baseline' || mode === 'addchild-gate') {
      const aUrl = phpUrl;
      const bUrl = mode === 'addchild-gate' ? tsUrl : phpUrl;
      const aLabel = mode === 'addchild-gate' ? 'PHP' : 'PHP run #1';
      const bLabel = mode === 'addchild-gate' ? 'TS ' : 'PHP run #2';
      console.log(
        `add_child parent: ${ADD_CHILD_PARENT.table} ${ADD_CHILD_PARENT.sectionTipo}/${ADD_CHILD_PARENT.sectionId}`,
      );
      console.log(`\n── ADD_CHILD ${aLabel} (${aUrl}) ──`);
      const runA = await runAddChildParity(sql, ADD_CHILD_PARENT, addChildApplyFor(aUrl));
      console.log(
        `   status=${runA.status} child=${runA.newSectionId} counter ${runA.counterBefore}→${runA.counterAfter} ` +
          `tm=${(runA.sideRows.matrix_time_machine ?? []).length} bytes=${runA.responseBytes.length}`,
      );
      console.log(`\n── ADD_CHILD ${bLabel} (${bUrl}) ──`);
      const runB = await runAddChildParity(sql, ADD_CHILD_PARENT, addChildApplyFor(bUrl));
      console.log(
        `   status=${runB.status} child=${runB.newSectionId} counter ${runB.counterBefore}→${runB.counterAfter} ` +
          `tm=${(runB.sideRows.matrix_time_machine ?? []).length} bytes=${runB.responseBytes.length}`,
      );
      const diffLabel = mode === 'addchild-gate' ? 'ADD_CHILD PHP-vs-TS' : 'ADD_CHILD PHP-vs-PHP';
      console.log(`\n── DIFF (${diffLabel}) ──`);
      green = diffAddChildRuns(diffLabel, runA, runB);
    } else if (mode === 'delete-baseline' || mode === 'delete-gate') {
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
    } else if (mode === 'duplicate-baseline' || mode === 'duplicate-gate') {
      // DUPLICATE parity: snapshot counter+watermarks → duplicate → restore (delete
      // copy + sweep side rows + restore counter), ×2. `duplicate` is DECLINED (TS
      // proxies); the gate proves the TS proxy forwards byte-identically (PHP-vs-TS)
      // and the PHP-vs-PHP baseline proves the harness restore + envelope stability.
      const dupTarget = { table: TARGET.table, sectionTipo: DUP_SECTION_TIPO };
      const aUrl = phpUrl;
      const bUrl = mode === 'duplicate-gate' ? tsUrl : phpUrl;
      const aLabel = mode === 'duplicate-gate' ? 'PHP' : 'PHP run #1';
      const bLabel = mode === 'duplicate-gate' ? 'TS ' : 'PHP run #2';
      console.log(`duplicate source: ${DUP_SECTION_TIPO}/${DUP_SECTION_ID}`);
      console.log(`\n── DUPLICATE ${aLabel} (${aUrl}) ──`);
      const runA = await runDuplicateParity(sql, dupTarget, duplicateApplyFor(aUrl));
      console.log(
        `   status=${runA.status} new_section_id=${runA.newSectionId} ` +
          `counter ${runA.counterBefore}→${runA.counterAfter} ` +
          `tm=${runA.sideRowCounts.matrix_time_machine ?? 0} act=${runA.sideRowCounts.matrix_activity ?? 0} ` +
          `bytes=${runA.responseBytes.length}`,
      );
      console.log(`\n── DUPLICATE ${bLabel} (${bUrl}) ──`);
      // For the gate, the TS run logs in via PHP (shared session/DB) but POSTs to TS —
      // the TS proxy's own login + session-bridge races the harness CSRF handshake.
      const bLoginUrl = mode === 'duplicate-gate' ? phpUrl : undefined;
      const runB = await runDuplicateParity(sql, dupTarget, duplicateApplyFor(bUrl, bLoginUrl));
      console.log(
        `   status=${runB.status} new_section_id=${runB.newSectionId} ` +
          `counter ${runB.counterBefore}→${runB.counterAfter} ` +
          `tm=${runB.sideRowCounts.matrix_time_machine ?? 0} act=${runB.sideRowCounts.matrix_activity ?? 0} ` +
          `bytes=${runB.responseBytes.length}`,
      );
      const diffLabel = mode === 'duplicate-gate' ? 'DUPLICATE PHP-vs-TS' : 'DUPLICATE PHP-vs-PHP';
      console.log(`\n── DIFF (${diffLabel}) ──`);
      green = diffDuplicateRuns(diffLabel, runA, runB);
    } else if (mode === 'baseline') {
      console.log(`\n── PHP run #1 (${phpUrl}) ──`);
      const rel = relatedTargets();
      const run1 = await runWriteParity(sql, TARGET, applyFor(phpUrl), rel);
      console.log(`   status=${run1.status} response bytes=${run1.responseBytes.length}`);
      console.log(`\n── PHP run #2 (${phpUrl}) ──`);
      const run2 = await runWriteParity(sql, TARGET, applyFor(phpUrl), rel);
      console.log(`   status=${run2.status} response bytes=${run2.responseBytes.length}`);
      console.log('\n── DIFF (PHP run #1 vs PHP run #2) ──');
      green = diffRuns('PHP-vs-PHP', run1, run2);
    } else {
      console.log(`\n── PHP run (${phpUrl}) ──`);
      const rel = relatedTargets();
      const php = await runWriteParity(sql, TARGET, applyFor(phpUrl), rel);
      console.log(`   status=${php.status} response bytes=${php.responseBytes.length}`);
      console.log(`\n── TS run (${tsUrl}) ──`);
      const ts = await runWriteParity(sql, TARGET, applyFor(tsUrl), rel);
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
