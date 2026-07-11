/**
 * Capture the canonical test3 fixture from the LIVE shared DB.
 *
 * Usage:
 *   bun run scripts/capture_test3_fixture.ts [section_id ...]
 *
 * Reads the canonical `test3` records from matrix_test (default: the canonical
 * record set from src/core/test_data/manifest.ts) and writes
 * src/core/test_data/test3_canonical.json — THE single source the seed module,
 * the unit_test maintenance widget, the test suites and the client runner all
 * consume.
 *
 * Column values are read as `col::text` (readMatrixRecord's rawText): jsonb
 * text output is Postgres-canonical, so parse → insert (::text::jsonb) → read
 * round-trips to deep-equal values. The fixture stores the PARSED objects
 * (hand-editable, formatter-stable); never byte-compare its serialized form
 * against live text — always JSON.parse + Bun.deepEquals.
 */

import { resolve } from 'node:path';
import { readMatrixRecord } from '../src/core/db/matrix.ts';
import { BASE_RECORD_IDS, CANONICAL_SECTION_TIPO } from '../src/core/test_data/manifest.ts';

const outputPath = resolve(import.meta.dir, '../src/core/test_data/test3_canonical.json');

const argIds = Bun.argv.slice(2).map((raw) => Number.parseInt(raw, 10));
if (argIds.some((id) => !Number.isInteger(id) || id <= 0)) {
	console.error('Usage: bun run scripts/capture_test3_fixture.ts [section_id ...]');
	process.exit(1);
}
// Capture reads only the LIVE base records; the per-suite isolation clones are
// materialized deterministically at seed time (seed.ts), never captured.
const sectionIds = argIds.length > 0 ? argIds : [...BASE_RECORD_IDS];

const records: Record<string, unknown>[] = [];
for (const sectionId of sectionIds) {
	const record = await readMatrixRecord('matrix_test', CANONICAL_SECTION_TIPO, sectionId);
	if (record === null) {
		console.error(`No ${CANONICAL_SECTION_TIPO}/${sectionId} row in matrix_test — aborting.`);
		process.exit(1);
	}
	const entry: Record<string, unknown> = { section_id: sectionId };
	for (const [column, text] of Object.entries(record.rawText)) {
		entry[column] = typeof text === 'string' ? JSON.parse(text) : null;
	}
	records.push(entry);
}

// Capture-commit provenance (S2-43 channel 1): the fixture pins LIVE, mutable
// shared-DB records, so every capture records the repo commit and drift policy.
let captureCommit = 'unknown';
try {
	captureCommit = (await Bun.$`git rev-parse --short HEAD`.text()).trim();
} catch {
	// git unavailable (exported tree) — keep 'unknown' rather than fail.
}

const fixture = {
	meta: {
		captured_at: new Date().toISOString(),
		capture_commit: captureCommit,
		comment:
			'Canonical test3 playground records (single verified source). Consumed by ' +
			'src/core/test_data/seed.ts; verified by test/unit/test3_canonical_fixture.test.ts ' +
			'against src/core/test_data/manifest.ts.',
		drift_policy:
			'The live rows are mutable (client sweeps write test3/1). A red canonical gate with NO ' +
			'engine change means the live record drifted: run restoreCanonicalTest3() to heal, or — ' +
			'when the drift is a DELIBERATE fixture change — re-capture with ' +
			'`bun run scripts/capture_test3_fixture.ts` and reconcile manifest.ts in the same change.',
	},
	section_tipo: CANONICAL_SECTION_TIPO,
	records,
};

await Bun.write(outputPath, `${JSON.stringify(fixture, null, '\t')}\n`);
console.log(
	`Captured ${records.length} ${CANONICAL_SECTION_TIPO} record(s) [${sectionIds.join(', ')}] → ${outputPath}`,
);

process.exit(0);
