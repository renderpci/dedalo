/**
 * ============================================================================
 * S1-03 DATA REPAIR — requires DEC-03 approval — DO NOT RUN.
 * ============================================================================
 *
 * Repairs the UTC-stamped matrix_time_machine rows written by the TS
 * save/relations/translation paths before the shared DEDALO_TIMEZONE-aware
 * helper landed (src/core/db/db_timestamp.ts). Those paths stamped
 * `new Date().toISOString()` (UTC) into a table every other writer — PHP and
 * the TS create/delete/duplicate paths — stamps with DEDALO_TIMEZONE
 * wall-clock time, so the affected rows sort up to a whole zone offset early
 * in every `ORDER BY timestamp DESC` restore timeline.
 *
 * DST SAFETY (the reason this is a script, not one UPDATE): "add the offset"
 * is WRONG for Europe/Madrid (UTC+1 winter / UTC+2 summer). Each row is
 * converted from its stored instant UTC → zone-local wall time AT THAT
 * INSTANT, entirely inside Postgres:
 *
 *     timestamp AT TIME ZONE 'UTC' AT TIME ZONE '<DEDALO_TIMEZONE>'
 *
 * SCOPE — never a blanket offset. A row is repaired only when ALL hold:
 *   1. its id lies inside the TS deployment window you pass explicitly
 *      (--from-id/--to-id — resolve them from the deployment dates first);
 *   2. it carries the UTC-writer skew signature: stamped more than
 *      --skew-minutes (default 30) BEFORE its insertion-order (id) predecessor
 *      — impossible for a healthy local-time writer at production write rates,
 *      and exactly what the audit measured on the live table (135 rows);
 *   3. applying the conversion REMOVES that skew (guards against rows whose
 *      backdated stamp has some other cause — those are reported, not touched).
 *
 * Rows PHP wrote in the window can never match (2): PHP stamps local time, so
 * they sit at/after their predecessors. The dd201 (modified date) column of
 * the affected records corroborates the window but is not machine-joined here;
 * review the dry-run listing against it before ever passing --execute.
 *
 * USAGE (dry-run is the default and prints the full candidate listing):
 *
 *     bun scripts/repair_tm_timestamps.ts --from-id 1234 --to-id 5678
 *     bun scripts/repair_tm_timestamps.ts --from-id 1234 --to-id 5678 \
 *         --skew-minutes 30 --execute        # DEC-03 approval required
 *
 * BURST TAILS (--id-ranges s-e,s-e,…): dense same-second bursts are internally
 * consistent, so the skew detector only sees each burst's FIRST row; the
 * unrepaired tail is selected by EXPLICIT id range (resolved by inspection —
 * each range runs from the detected head to the row before the +offset local
 * resumption). Per-row safety = the boundary check (the conversion must not
 * pass the first row AFTER the range); still single-pass, still --execute-gated.
 *
 * After --execute the script re-runs the audit invariant over the window and
 * reports it: zero rows stamped > skew-minutes before their insertion-order
 * predecessor (the REMEDIATION post-repair gate).
 */

import { config } from '../src/config/config.ts';
import { sql, withTransaction } from '../src/core/db/postgres.ts';

interface Args {
	fromId: number;
	toId: number;
	skewMinutes: number;
	execute: boolean;
	/** Explicit burst ranges (--id-ranges s-e,s-e): bypass the skew detector. */
	idRanges: [number, number][] | null;
}

function usage(message: string): never {
	console.error(`repair_tm_timestamps: ${message}`);
	console.error(
		'usage: bun scripts/repair_tm_timestamps.ts --from-id <id> --to-id <id> [--skew-minutes 30] [--id-ranges s-e,s-e,…] [--execute]',
	);
	process.exit(1);
}

function parseArgs(argv: string[]): Args {
	let fromId: number | null = null;
	let toId: number | null = null;
	let skewMinutes = 30;
	let execute = false;
	let idRanges: [number, number][] | null = null;
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		switch (arg) {
			case '--from-id':
				fromId = Number(argv[++index]);
				break;
			case '--to-id':
				toId = Number(argv[++index]);
				break;
			case '--skew-minutes':
				skewMinutes = Number(argv[++index]);
				break;
			case '--id-ranges': {
				const raw = argv[++index] ?? '';
				idRanges = raw.split(',').map((pair) => {
					const [start, end] = pair.split('-').map(Number);
					if (
						start === undefined ||
						end === undefined ||
						!Number.isInteger(start) ||
						!Number.isInteger(end) ||
						start <= 0 ||
						end < start
					) {
						usage(`invalid --id-ranges pair '${pair}' (expected <start>-<end>)`);
					}
					return [start, end] as [number, number];
				});
				if (idRanges.length === 0) usage('--id-ranges must list at least one s-e pair');
				break;
			}
			case '--execute':
				execute = true;
				break;
			default:
				usage(`unknown argument '${arg}'`);
		}
	}
	if (fromId === null || !Number.isInteger(fromId) || fromId <= 0) {
		usage('--from-id is required (first TM id of the TS deployment window)');
	}
	if (toId === null || !Number.isInteger(toId) || toId < fromId) {
		usage('--to-id is required and must be >= --from-id');
	}
	if (!Number.isFinite(skewMinutes) || skewMinutes <= 0) {
		usage('--skew-minutes must be a positive number');
	}
	if (idRanges !== null) {
		for (const [start, end] of idRanges) {
			if (start < fromId || end > toId) {
				usage(`--id-ranges pair ${start}-${end} lies outside the [--from-id..--to-id] window`);
			}
		}
	}
	return { fromId, toId, skewMinutes, execute, idRanges };
}

interface CandidateRow {
	id: number;
	section_tipo: string;
	section_id: number;
	tipo: string;
	old_ts: string;
	prev_ts: string;
	new_ts: string;
	repair_fixes_skew: boolean;
}

/**
 * Candidate selection — all three scope conditions in one query. The
 * conversion (`AT TIME ZONE 'UTC' AT TIME ZONE $zone`) is evaluated per row at
 * the row's own instant, so winter (UTC+1) and summer (UTC+2) rows each get
 * their correct local time.
 */
const CANDIDATE_SQL = `
	WITH windowed AS (
		SELECT id, section_tipo, section_id, tipo, timestamp,
		       LAG(timestamp) OVER (ORDER BY id) AS prev_ts
		FROM matrix_time_machine
		WHERE id BETWEEN $1 AND $2
	)
	SELECT
		id, section_tipo, section_id, tipo,
		to_char(timestamp, 'YYYY-MM-DD HH24:MI:SS') AS old_ts,
		to_char(prev_ts, 'YYYY-MM-DD HH24:MI:SS') AS prev_ts,
		to_char(timestamp AT TIME ZONE 'UTC' AT TIME ZONE $4,
		        'YYYY-MM-DD HH24:MI:SS') AS new_ts,
		((timestamp AT TIME ZONE 'UTC' AT TIME ZONE $4)
			>= prev_ts - make_interval(mins => $3::int)) AS repair_fixes_skew
	FROM windowed
	WHERE prev_ts IS NOT NULL
	  AND timestamp < prev_ts - make_interval(mins => $3::int)
	ORDER BY id
`;

/**
 * EXPLICIT-RANGE candidate selection (--id-ranges): the burst-tail mode the
 * single-pass prescription calls for ("enumerate its ids explicitly"). The
 * dense same-second bursts are internally consistent, so the LAG detector only
 * ever sees each burst's FIRST row — the tail is selected by id range instead.
 * Safety per row is the BOUNDARY check: the conversion must not push the row
 * past the first row AFTER its range end (the local-writer resumption), within
 * the skew slack — a violation reports as SKIP, never repaired.
 */
const RANGE_CANDIDATE_SQL = `
	WITH ranges AS (
		SELECT split_part(pair, '-', 1)::int AS s, split_part(pair, '-', 2)::int AS e
		FROM unnest(string_to_array($1, ',')) AS pair
	),
	bounds AS (
		SELECT r.s, r.e,
		       (SELECT timestamp FROM matrix_time_machine WHERE id > r.e ORDER BY id ASC LIMIT 1) AS next_local_ts
		FROM ranges r
	)
	SELECT
		m.id, m.section_tipo, m.section_id, m.tipo,
		to_char(m.timestamp, 'YYYY-MM-DD HH24:MI:SS') AS old_ts,
		to_char(b.next_local_ts, 'YYYY-MM-DD HH24:MI:SS') AS prev_ts,
		to_char(m.timestamp AT TIME ZONE 'UTC' AT TIME ZONE $2,
		        'YYYY-MM-DD HH24:MI:SS') AS new_ts,
		((m.timestamp AT TIME ZONE 'UTC' AT TIME ZONE $2)
			<= b.next_local_ts + make_interval(mins => $3::int)) AS repair_fixes_skew
	FROM bounds b
	JOIN matrix_time_machine m ON m.id BETWEEN b.s AND b.e
	ORDER BY m.id
`;

/** Post-repair audit invariant: rows still stamped > skew before their id-order
 * predecessor inside the window. Must return 0 after --execute. */
const AUDIT_SQL = `
	WITH windowed AS (
		SELECT id, timestamp, LAG(timestamp) OVER (ORDER BY id) AS prev_ts
		FROM matrix_time_machine
		WHERE id BETWEEN $1 AND $2
	)
	SELECT count(*)::int AS bad
	FROM windowed
	WHERE prev_ts IS NOT NULL
	  AND timestamp < prev_ts - make_interval(mins => $3::int)
`;

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const zone = config.timezone;

	console.log(
		`repair_tm_timestamps — window ids [${args.fromId}..${args.toId}], zone ${zone}, ` +
			`skew > ${args.skewMinutes} min, mode ${args.execute ? 'EXECUTE' : 'DRY-RUN'}`,
	);
	if (args.execute) {
		console.log('EXECUTE MODE: this run REQUIRES recorded DEC-03 approval.');
	}

	if (args.idRanges !== null) {
		console.log(
			`explicit burst ranges: ${args.idRanges.map(([s, e]) => `${s}-${e}`).join(', ')} (skew detector bypassed; boundary check per row)`,
		);
	}
	const candidates =
		args.idRanges !== null
			? ((await sql.unsafe(RANGE_CANDIDATE_SQL, [
					args.idRanges.map(([s, e]) => `${s}-${e}`).join(','),
					zone,
					args.skewMinutes,
				])) as unknown as CandidateRow[])
			: ((await sql.unsafe(CANDIDATE_SQL, [
					args.fromId,
					args.toId,
					args.skewMinutes,
					zone,
				])) as unknown as CandidateRow[]);

	const repairable = candidates.filter((row) => row.repair_fixes_skew);
	const suspicious = candidates.filter((row) => !row.repair_fixes_skew);

	console.log(`\ncandidates with the UTC-writer skew signature: ${candidates.length}`);
	for (const row of repairable) {
		console.log(
			`  REPAIR id=${row.id} ${row.section_tipo}/${row.section_id} ${row.tipo} ` +
				`${row.old_ts} -> ${row.new_ts} (predecessor ${row.prev_ts})`,
		);
	}
	for (const row of suspicious) {
		console.log(
			`  SKIP   id=${row.id} ${row.section_tipo}/${row.section_id} ${row.tipo} ` +
				`${row.old_ts}: UTC->${zone} conversion does NOT explain the skew ` +
				`(predecessor ${row.prev_ts}) — investigate manually`,
		);
	}

	if (!args.execute) {
		console.log(
			`\nDRY-RUN complete: ${repairable.length} row(s) would be repaired, ${suspicious.length} skipped. Review against dd201/modified dates, obtain DEC-03 approval, then re-run with --execute.`,
		);
		return;
	}

	if (repairable.length === 0) {
		console.log('\nnothing to repair in the window.');
		return;
	}

	// SINGLE PASS ONLY — repair exactly the reviewed dry-run set, once. Do NOT
	// wrap this in a detect->repair fixpoint loop: dense same-second edit bursts
	// (a bulk record re-save) are internally consistent, so the predecessor-skew
	// detector only ever sees the FIRST row of each burst; a loop walks the burst
	// one boundary at a time and can run thousands of passes. If a burst needs
	// completing, enumerate its ids explicitly and widen this set — never iterate.
	//
	// withTransaction (not raw BEGIN — Bun.sql pooled connections reject manual
	// transaction statements with ERR_POSTGRES_UNSAFE_TRANSACTION). ids bound as a
	// joined string because Bun.sql's native int[] bind mis-encodes on the wire
	// (08P01) — same string_to_array pattern as relations/select_lang.ts.
	const ids = repairable.map((row) => row.id);
	await withTransaction(async () => {
		await sql.unsafe(
			`UPDATE matrix_time_machine
			 SET timestamp = timestamp AT TIME ZONE 'UTC' AT TIME ZONE $2
			 WHERE id = ANY(string_to_array($1, ',')::int[])`,
			[ids.join(','), zone],
		);
	});
	console.log(`\nrepaired ${ids.length} row(s).`);

	const audit = (await sql.unsafe(AUDIT_SQL, [
		args.fromId,
		args.toId,
		args.skewMinutes,
	])) as unknown as { bad: number }[];
	const bad = audit[0]?.bad ?? -1;
	console.log(
		`post-repair audit (rows stamped > ${args.skewMinutes} min before their ` +
			`insertion-order predecessor in the window): ${bad} ${bad === 0 ? '— GATE GREEN' : '— GATE RED, investigate'}`,
	);
}

await main();
process.exit(0);
