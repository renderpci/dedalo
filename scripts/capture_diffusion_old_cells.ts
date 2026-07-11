/**
 * Snapshot the OLD-ENGINE-published MariaDB cells that the diffusion e2e
 * ddo-fns gate uses as its byte oracle (S2-43 channel 3).
 *
 * The old engine's tables are LIVE, prunable state: rows the audit relied on
 * have already been deleted once (mints#75). This script freezes the cells
 * into test/integration/fixtures/diffusion_old_engine_cells.json with capture
 * provenance, so the gate asserts against the frozen oracle and the live
 * table's rot is reported by the drift canary instead of failing the gate.
 *
 * Usage:
 *   bun run scripts/capture_diffusion_old_cells.ts            # refuses to overwrite frozen cells whose live row vanished
 *   bun run scripts/capture_diffusion_old_cells.ts --force    # re-freeze exactly what is live now (deliberate re-baseline)
 */

import { join, resolve } from 'node:path';
import { getCompiledPlan } from '../src/diffusion/plan/cache.ts';
import { getTargetPool } from '../src/diffusion/targets/mariadb/db.ts';

const ELEMENT = 'numisdata29'; // 'Web MIB' → database web_numisdata_mib

/** The cells the ddo-fns gate depends on (keep in sync with the test). */
const CELLS: { table: string; sectionId: number; column: string }[] = [
	{ table: 'coins', sectionId: 64019, column: 'public_info' },
	{ table: 'coins', sectionId: 203, column: 'countermark_obverse' },
	{ table: 'mints', sectionId: 75, column: 'georef_geojson' },
	{ table: 'findspots', sectionId: 3, column: 'georef_geojson' },
	{ table: 'designs', sectionId: 401, column: 'iconography' },
];

interface CellSnapshot {
	exists: boolean;
	value: string | null;
}

interface Fixture {
	meta: Record<string, unknown>;
	/** `${table}|${sectionId}|${column}` → per-lang snapshot. */
	cells: Record<string, Record<string, CellSnapshot>>;
}

const force = Bun.argv.includes('--force');
const fixturePath = join(
	resolve(import.meta.dir, '../test/integration/fixtures'),
	'diffusion_old_engine_cells.json',
);

const plan = await getCompiledPlan(ELEMENT);
if (plan.target.kind !== 'table') throw new Error('expected a table target');
const pool = getTargetPool(plan.target.database);
const langs = plan.langPolicy.langs;

const existingFile = Bun.file(fixturePath);
const previous: Fixture | null = (await existingFile.exists())
	? ((await existingFile.json()) as Fixture)
	: null;

let captureCommit = 'unknown';
try {
	captureCommit = (await Bun.$`git rev-parse --short HEAD`.text()).trim();
} catch {
	/* git unavailable — keep 'unknown' */
}

const cells: Fixture['cells'] = {};
for (const cell of CELLS) {
	const key = `${cell.table}|${cell.sectionId}|${cell.column}`;
	const perLang: Record<string, CellSnapshot> = {};
	for (const lang of langs) {
		const rows = (await pool.unsafe(
			`SELECT \`${cell.column}\` AS v FROM \`${cell.table}\` WHERE section_id = ? AND lang = ?`,
			[cell.sectionId, lang],
		)) as { v: unknown }[];
		const live: CellSnapshot =
			rows.length === 0
				? { exists: false, value: null }
				: {
						exists: true,
						value: rows[0]?.v === null || rows[0]?.v === undefined ? null : String(rows[0]?.v),
					};
		const frozen = previous?.cells?.[key]?.[lang];
		if (!force && frozen?.exists === true && live.exists === false) {
			console.warn(
				`[ROT] ${key}/${lang}: frozen oracle exists but the live old-engine row is GONE — keeping the frozen value (use --force to re-baseline).`,
			);
			perLang[lang] = frozen;
			continue;
		}
		perLang[lang] = live;
	}
	cells[key] = perLang;
}

const fixture: Fixture = {
	meta: {
		captured_at: new Date().toISOString(),
		capture_commit: captureCommit,
		database: plan.target.database,
		element: ELEMENT,
		langs,
		drift_policy:
			'These cells freeze the OLD diffusion engine’s published bytes (the oracle for the ported ddo fns). ' +
			'The live tables are prunable: when the drift canary in diffusion_publish_e2e reports divergence, adjudicate ' +
			'whether the live change is rot (keep the fixture) or a deliberate re-publish (re-run this script with --force).',
	},
	cells,
};

await Bun.write(fixturePath, `${JSON.stringify(fixture, null, '\t')}\n`);
console.log(`Captured ${Object.keys(cells).length} cell groups → ${fixturePath}`);
process.exit(0);
