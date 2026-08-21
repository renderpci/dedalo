/**
 * NO TEST WRITES INTO THE INSTALLATION'S TABLE.
 *
 * `matrix` is where an installation's own records live. The suite has its own
 * disposable table, `matrix_test`, and every cloned `test*` section carries the
 * `test24` matrix_table relation so the engine puts its rows there.
 *
 * WHY A GATE (measured 2026-08-21). The failure mode is silent by construction:
 * a file that provisions its ontology BY HAND (`upsertDdOntologyNode` rather
 * than `situation()`) gets a section with no matrix_table relation, so
 * `getMatrixTableFromTipo` falls back to the PHP default — `matrix` — and if
 * that file also reads with raw SQL it is perfectly self-consistent. It passes,
 * for years, while writing scratch rows into the install-shaped table.
 * `component_alias` was doing exactly that and was green throughout.
 *
 * The tell is a raw `INSERT/UPDATE/DELETE ... matrix` (not `matrix_test`, not
 * `matrix_hierarchy`, …) inside a test. Some are legitimate: a SEED-shipped
 * section (`rsc`, `dd`, `hierarchy`, `lg`, …) genuinely lives in `matrix` on
 * every installation, and a test that drives one has to write where the engine
 * will look.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 * The SET of test files that write to `matrix` may only SHRINK. The baseline
 * below is the population on adoption day, each with what it writes and why.
 * A new one is refused; a fixed one must delete its own name (a stale entry is
 * red, because a stale entry is how a ratchet quietly stops ratcheting).
 *
 * ── HONEST LIMITATIONS ───────────────────────────────────────────────────────
 *  - It matches SOURCE TEXT, so a query built by concatenation is invisible.
 *    It catches the common shape, not every shape.
 *  - It cannot tell a seed-section write (fine) from a scratch-section write
 *    (not fine) — that judgement is in the baseline's notes, made once, by
 *    reading each file.
 *
 * HERMETIC: filesystem reads of tracked test source. No DB, no network, no clock.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const UNIT_DIR = import.meta.dir;
/** This file NAMES the pattern it hunts; it never runs a query. */
const SELF = 'install_table_write_tripwire.test.ts';

/**
 * Files that write to `matrix`, with the reason each is (or is not) legitimate.
 * Shrink-only.
 */
const INSTALL_TABLE_WRITERS: Record<string, string> = {
	'external_multi_source_native.test.ts':
		'NOT legitimate, and NOT a one-line fix: its fixture section `test970` has no dd_ontology node at all, so the ENGINE resolves it to `matrix` too (unknown tipo → default). Moving only the fixture reddens four cases — verified 2026-08-21. Fixing it means giving that section a node with the test24 relation, which is a fixture build, not a table swap.',
	'test_db_marker_tripwire.test.ts':
		"NOT a query: the string appears inside that gate's own matcher self-test (it asserts its write-seam detector fires on a sample and not on a comment). A source-text scan cannot tell a sample from a statement, so it is named here rather than pretended away.",
	'observer_reconcile_sweep_native.test.ts':
		'sweeps rows a crashed earlier run may have left in `matrix` under the OLD install-anchored fixture — a cleanup of history, not a write of new test data.',
};

function unitFiles(): string[] {
	return readdirSync(UNIT_DIR)
		.filter((name) => name.endsWith('.test.ts') && name !== SELF)
		.sort();
}

/** Raw writes naming `matrix` exactly — never `matrix_test`, `matrix_hierarchy`, … */
const WRITE_TO_MATRIX = /\b(?:INSERT\s+INTO|DELETE\s+FROM|UPDATE)\s+matrix\b(?!_)/i;

function writersOfInstallTable(): string[] {
	return unitFiles().filter((file) =>
		WRITE_TO_MATRIX.test(readFileSync(join(UNIT_DIR, file), 'utf8')),
	);
}

describe('no test writes into the installation table', () => {
	test('NO NEW file writes to `matrix` (shrink-only)', () => {
		const added = writersOfInstallTable().filter((file) => !(file in INSTALL_TABLE_WRITERS));
		expect(
			added,
			'`matrix` holds an INSTALLATION\'s records. Test data belongs in `matrix_test`: build the section through `situation()` (it grants the test24 matrix_table relation automatically), or declare `relations: [{ tipo: "test24" }]` if you provision by hand. A file that writes AND reads with raw SQL stays self-consistent and green while polluting the install table — which is the accident this gate exists to make impossible.',
		).toEqual([]);
	});

	test('the baseline is LIVE — a stale entry is a finding', () => {
		const writers = new Set(writersOfInstallTable());
		expect(
			Object.keys(INSTALL_TABLE_WRITERS).filter((file) => !writers.has(file)),
			'fixed — delete these names in the same change that fixed them',
		).toEqual([]);
	});

	test('ANTI-VACUITY: the matcher finds real writes, and ignores the other matrix tables', () => {
		// It must actually match something, or every rule above is free.
		expect(writersOfInstallTable().length).toBeGreaterThan(0);
		// And it must NOT fire on the suite's own tables, which is the whole point
		// of the negative lookahead.
		expect(WRITE_TO_MATRIX.test('DELETE FROM matrix_test WHERE section_tipo = $1')).toBe(false);
		expect(WRITE_TO_MATRIX.test('INSERT INTO matrix_hierarchy (section_id) VALUES ($1)')).toBe(
			false,
		);
		expect(WRITE_TO_MATRIX.test('DELETE FROM matrix_time_machine WHERE id = $1')).toBe(false);
		expect(WRITE_TO_MATRIX.test('INSERT INTO matrix (section_id) VALUES ($1)')).toBe(true);
	});
});
