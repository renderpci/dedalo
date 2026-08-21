/**
 * ONE-TIME: strip the generic `test` TLD ontology out of the install seed.
 *
 *   bun run scripts/strip_test_tld_from_seed.ts
 *
 * NOTHING RUNS THIS AUTOMATICALLY — no gate, no installer, no CI step. It
 * writes `install/db/dedalo_install.pgsql.gz.new` plus a report and stops; the
 * operator decides when (and whether) to move it over the seed.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────
 * Since 2026-08-19 the generic `test` TLD has ONE source of record,
 * `src/core/test_data/test_tld_ontology.json`, materialized through the
 * engine's own doors by `src/core/test_data/test_tld_materialize.ts` (the
 * installer calls it right after the seed restore; `scripts/test_db_setup.ts`
 * calls it for the suite database). The seed's own copy of those rows is now a
 * SECOND source that can silently disagree with the file a human reviews —
 * exactly the drift the migration exists to end. So the seed loses:
 *
 *   - `dd_ontology`     rows with `tld = 'test'`          (217 today)
 *   - `matrix_ontology` rows with `section_tipo = 'test0'` (216 today)
 *
 * ── WHAT THE REBUILD STILL NEEDS IN THE SEED (verified empirically) ──────────
 * Measured on the suite database 2026-08-19 by deleting the rows above and
 * running the door from scratch: it reproduces all 217 nodes with
 * `inspectOntology('test').drift === []`. TWO bootstrap rows must survive, and
 * NEITHER is matched by the two filters above — no carve-out is needed, but
 * both must be checked before the new seed is trusted:
 *
 *  1. the `matrix_ontology_main` row (section `ontology35`) whose `hierarchy6`
 *     is `test`. `rebuildOntology('test')` → `ensureMainNode` → `addMainSection`
 *     reads it for the main node's TERM and TYPOLOGY. DELETING IT DOES NOT
 *     FAIL — `addMainSection` invents a replacement, and the `test0` node then
 *     comes out as term `{lg-spa: "test"}` under parent `ontologytype15`
 *     instead of "Test | test" under `ontologytype5`. A silent, wrong result:
 *     that is why this row is called out here.
 *  2. the ontology-typology grouper it points at — `dd_ontology` `ontologytype5`
 *     and its source record `matrix_ontology`/`ontologytype0`/5. Both carry tld
 *     `ontologytype`, so both survive the filters.
 *
 * The seed's `matrix_test` records (the canonical test3 playground) are a
 * different table and a different concern (`src/core/test_data/seed.ts` owns
 * them); they are untouched here.
 *
 * HERMETIC: reads and writes repo files only, no database.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

const REPO = join(import.meta.dir, '..');
const SEED_PATH = 'install/db/dedalo_install.pgsql.gz';
const OUT_PATH = `${SEED_PATH}.new`;
const REPORT_PATH = `${SEED_PATH}.strip_report.md`;
const TLD = 'test';

/** One COPY block's rows, with the column list, so a filter can name columns. */
interface CopyBlock {
	table: string;
	columns: string[];
	/** Byte offsets of the row region (between the header line and the `\.` line). */
	start: number;
	end: number;
	rows: string[];
}

/** Locate a `COPY public.<table> (cols) FROM stdin;` block in the dump text. */
function findCopyBlock(dump: string, table: string): CopyBlock | null {
	const header = new RegExp(`COPY public\\.${table} \\(([^)]*)\\) FROM stdin;\\n`);
	const match = header.exec(dump);
	if (match === null) return null;
	const start = match.index + match[0].length;
	const terminator = dump.indexOf('\n\\.\n', start);
	if (terminator === -1) throw new Error(`seed: COPY block for ${table} is unterminated`);
	const body = dump.slice(start, terminator);
	return {
		table,
		columns: (match[1] as string).split(',').map((column) => column.trim()),
		start,
		end: terminator,
		rows: body === '' ? [] : body.split('\n'),
	};
}

/** Drop the rows a predicate selects; returns the new dump text + what went. */
function stripRows(
	dump: string,
	table: string,
	predicate: (row: Record<string, string>) => boolean,
): { dump: string; before: number; after: number; removed: string[] } {
	const block = findCopyBlock(dump, table);
	if (block === null) throw new Error(`seed: no COPY block for ${table}`);
	const kept: string[] = [];
	const removed: string[] = [];
	for (const line of block.rows) {
		const fields = line.split('\t');
		const row: Record<string, string> = {};
		block.columns.forEach((column, index) => {
			row[column] = fields[index] ?? '\\N';
		});
		if (predicate(row)) removed.push(line);
		else kept.push(line);
	}
	const rewritten = dump.slice(0, block.start) + kept.join('\n') + dump.slice(block.end);
	return { dump: rewritten, before: block.rows.length, after: kept.length, removed };
}

/** The hierarchy6 (tld) value of one matrix_ontology_main row, or ''. */
function mainRowTld(row: Record<string, string>): string {
	try {
		const string = JSON.parse(row.string ?? 'null') as Record<string, { value?: unknown }[]> | null;
		return String(string?.hierarchy6?.[0]?.value ?? '');
	} catch {
		return '';
	}
}

/** Rows of a COPY block as column-keyed objects. */
function rowsOf(block: CopyBlock | null): Record<string, string>[] {
	if (block === null) return [];
	return block.rows.map((line) => {
		const fields = line.split('\t');
		const row: Record<string, string> = {};
		block.columns.forEach((column, index) => {
			row[column] = fields[index] ?? '\\N';
		});
		return row;
	});
}

function main(): void {
	const seedFile = join(REPO, SEED_PATH);
	if (!existsSync(seedFile)) throw new Error(`seed not found: ${SEED_PATH}`);
	const original = gunzipSync(readFileSync(seedFile)).toString('utf8');
	const recordColumns = findCopyBlock(original, 'matrix_ontology')?.columns ?? [];
	const sectionIdIndex = recordColumns.indexOf('section_id');
	// dd_ontology's first column is `id` (the sequence), NOT `tipo`.
	const tipoIndex = (findCopyBlock(original, 'dd_ontology')?.columns ?? []).indexOf('tipo');

	let dump = original;
	const ontologyRows = stripRows(dump, 'dd_ontology', (row) => row.tld === TLD);
	dump = ontologyRows.dump;
	const recordRows = stripRows(dump, 'matrix_ontology', (row) => row.section_tipo === `${TLD}0`);
	dump = recordRows.dump;

	// The bootstrap the rebuild reads — asserted PRESENT in the STRIPPED dump, so
	// this script can never produce a seed that silently rebuilds a wrong main node.
	const mainRows = rowsOf(findCopyBlock(dump, 'matrix_ontology_main')).filter(
		(row) => row.section_tipo === 'ontology35' && mainRowTld(row) === TLD,
	);
	const grouperRows = rowsOf(findCopyBlock(dump, 'dd_ontology')).filter(
		(row) => row.tipo === 'ontologytype5',
	);
	if (mainRows.length === 0) {
		throw new Error(
			`REFUSING: the stripped seed has no matrix_ontology_main (ontology35) row naming tld '${TLD}' — the rebuild would invent a WRONG ${TLD}0 main node (see the header).`,
		);
	}
	if (grouperRows.length === 0) {
		throw new Error(
			'REFUSING: the stripped seed has no ontologytype5 grouper node — the rebuilt main node would land under a different parent (see the header).',
		);
	}

	writeFileSync(join(REPO, OUT_PATH), gzipSync(Buffer.from(dump, 'utf8'), { level: 9 }));

	const removedTipos = ontologyRows.removed.map((line) => line.split('\t')[tipoIndex] ?? '?');
	const removedIds = recordRows.removed.map((line) => line.split('\t')[sectionIdIndex] ?? '?');
	const report = [
		`# Seed strip report — generic \`${TLD}\` TLD`,
		'',
		`Source: \`${SEED_PATH}\`  →  \`${OUT_PATH}\` (the seed itself was NOT touched).`,
		'',
		'| table | filter | rows before | rows after | removed |',
		'|---|---|---:|---:|---:|',
		`| dd_ontology | \`tld = '${TLD}'\` | ${ontologyRows.before} | ${ontologyRows.after} | ${ontologyRows.removed.length} |`,
		`| matrix_ontology | \`section_tipo = '${TLD}0'\` | ${recordRows.before} | ${recordRows.after} | ${recordRows.removed.length} |`,
		'',
		'## Bootstrap rows kept (the rebuild reads them)',
		'',
		`- \`matrix_ontology_main\` (ontology35) rows naming tld \`${TLD}\`: ${mainRows.length}`,
		`- \`dd_ontology\` \`ontologytype5\` grouper: ${grouperRows.length}`,
		'',
		'## Removed dd_ontology tipos',
		'',
		removedTipos.join(', '),
		'',
		'## Removed matrix_ontology section_ids',
		'',
		removedIds.join(', '),
		'',
		'After moving the new file over the seed, verify with:',
		'',
		'```',
		'bun run test:db:setup',
		'bun test test/unit/test_tld_ontology_gate.test.ts',
		'```',
		'',
	].join('\n');
	writeFileSync(join(REPO, REPORT_PATH), report);

	console.log(
		`[strip] dd_ontology     tld='${TLD}':      ${ontologyRows.before} → ${ontologyRows.after} (-${ontologyRows.removed.length})`,
	);
	console.log(
		`[strip] matrix_ontology '${TLD}0' records: ${recordRows.before} → ${recordRows.after} (-${recordRows.removed.length})`,
	);
	console.log(
		`[strip] bootstrap kept: matrix_ontology_main '${TLD}' rows = ${mainRows.length}, ontologytype5 grouper = ${grouperRows.length}`,
	);
	console.log(
		`[strip] wrote ${OUT_PATH} + ${REPORT_PATH} — the seed itself is UNCHANGED (move it yourself when you are ready).`,
	);
}

if (import.meta.main) main();
