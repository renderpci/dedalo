/**
 * ============================================================================
 * DEC-03 DATA REPAIR — requires OWNER approval — DO NOT RUN unattended.
 * The auto-mode classifier denied agent execution 2026-07-10; the dry run
 * verified all 2,428 candidate rows are scratch/test-only. Run:
 *     bun scripts/repair_tm_test_tail.ts            # dry-run listing
 *     bun scripts/repair_tm_test_tail.ts --execute  # the repair
 * ============================================================================
 *
 * DEC-03 test-record tail repair — running-max classification (the ledger's
 * prescribed finish: scripts/repair_tm_timestamps.ts is SINGLE-PASS and only
 * catches burst STARTS; this walks the affected id span with a burst state
 * machine so same-second FOLLOWERS repair too).
 *
 * Scope: matrix_time_machine ids 51074000..51092000 — the measured tail. A
 * burst opens at a >=100min backward drop vs the id-order predecessor and
 * closes at a >=100min forward rise. EVERY row inside must belong to a
 * SCRATCH surface (test3/1, on1/58, tchi1 scratch nodes, rsc170 scratch twin
 * 990000456) or the script ABORTS untouched.
 *
 * Conversion: timestamp AT TIME ZONE 'UTC' AT TIME ZONE <DEDALO_TIMEZONE>
 * (DST-safe, same as the DEC-03 window run). Dry-run default; --execute
 * applies inside one transaction and re-audits the span.
 */

import { config } from '../src/config/config.ts';
import { sql, withTransaction } from '../src/core/db/postgres.ts';

const FROM_ID = 51074000;
const TO_ID = 51092000;
const DRIFT_MINUTES = 100;
const EXECUTE = process.argv.includes('--execute');

const SCRATCH = (st: string, sid: number): boolean =>
	(st === 'test3' && (sid === 1 || sid === 2)) ||
	(st === 'on1' && sid === 58) ||
	(st === 'tchi1' && sid >= 1000 && sid <= 1200) ||
	(st === 'rsc170' && sid >= 990000000) ||
	// ich135 74-89: client-suite artifacts — the matrix rows are DELETED
	// (verified 0 rows); only their orphan TM audit rows remain.
	(st === 'ich135' && sid >= 74 && sid <= 89);

const rows = (await sql`
	SELECT id, section_tipo, section_id::int AS section_id, "timestamp"
	FROM matrix_time_machine
	WHERE id BETWEEN ${FROM_ID} AND ${TO_ID}
	ORDER BY id
`) as { id: number; section_tipo: string; section_id: number; timestamp: string | Date }[];

// Healthy local-time rows are (near-)monotonic by id; the UTC writer's rows
// sit ~120min behind the running local high-water mark — and INTERLEAVE with
// concurrent healthy writers (ich135 client-suite rows share instants with
// skewed tchi1 rows), so boundary state machines misclassify. Per-row rule:
// skewed iff 100–140min behind the running max of healthy stamps.
const skewedIds: number[] = [];
const skewedRows: typeof rows = [];
let runningMax = 0;
for (const row of rows) {
	const ts = new Date(row.timestamp).getTime();
	const lagMinutes = (runningMax - ts) / 60000;
	if (runningMax > 0 && lagMinutes >= DRIFT_MINUTES && lagMinutes <= 140) {
		skewedIds.push(row.id);
		skewedRows.push(row);
		continue; // a skewed stamp never advances the healthy high-water mark
	}
	runningMax = Math.max(runningMax, ts);
}

console.log(`span rows: ${rows.length}; classified skewed: ${skewedIds.length}`);
const surfaces = new Map<string, number>();
for (const row of skewedRows) {
	const key = `${row.section_tipo}/${row.section_id}`;
	surfaces.set(key, (surfaces.get(key) ?? 0) + 1);
}
console.log('affected surfaces:', Object.fromEntries(surfaces));

const nonScratch = skewedRows.filter((row) => !SCRATCH(row.section_tipo, row.section_id));
if (nonScratch.length > 0) {
	console.error('ABORT: non-scratch rows classified as skewed:');
	for (const row of nonScratch.slice(0, 20)) {
		console.error(`  ${row.id} ${row.section_tipo}/${row.section_id} ${row.timestamp}`);
	}
	process.exit(1);
}

if (!EXECUTE) {
	console.log(
		`dry-run (timezone ${config.timezone}). First/last ids:`,
		skewedIds[0],
		skewedIds.at(-1),
	);
	console.log('re-run with --execute to apply.');
	process.exit(0);
}

await withTransaction(async () => {
	// The ambient sql handle is transaction-scoped inside withTransaction.
	const updated = (await sql.unsafe(
		`UPDATE matrix_time_machine
		 SET "timestamp" = ("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE $1)
		 WHERE id = ANY($2::bigint[])
		 RETURNING id`,
		[config.timezone, skewedIds],
	)) as { id: number }[];
	console.log(`updated ${updated.length} rows`);
	if (updated.length !== skewedIds.length) {
		throw new Error(`expected ${skewedIds.length} updates, got ${updated.length} — rolled back`);
	}
});

// Post-repair audit over the span: zero backward skews > 30min remain.
const residual = (await sql`
	WITH ordered AS (
		SELECT id, "timestamp", lag("timestamp") OVER (ORDER BY id) AS prev_ts
		FROM matrix_time_machine
		WHERE id BETWEEN ${FROM_ID} AND ${TO_ID}
	)
	SELECT id FROM ordered WHERE "timestamp" < prev_ts - interval '30 minutes'
`) as { id: number }[];
console.log(`post-repair residual backward skews in span: ${residual.length}`);
if (residual.length > 0) {
	console.error('residual ids:', residual.map((row) => row.id).join(','));
	process.exit(1);
}
console.log('DEC-03 test tail: CLEAN');
process.exit(0);
