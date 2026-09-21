/**
 * STORE RETENTION TRIPWIRE — every append-only store the engine INSERTs into has
 * a STATED retention rule the engine can EXECUTE (audit 2026-08-26 P2-9;
 * SEC-20, SEC-21, PUB-14).
 *
 * WHAT WENT WRONG. The engine pruned some of its stores and not others, and
 * nothing said which was which. Terminal diffusion jobs went at 7 days, media
 * process files at 30, error reports at 90 — while `matrix_activity` (one row
 * per action, one per DENIED LOGIN, which any unauthenticated caller can cause)
 * and the `dd1758` publication ledger (one row per record per publish run;
 * measured 293 MB for a single 500k-record run) had ZERO prune code anywhere.
 * The job purge even justified its own window by naming the dd1758 ledger as
 * "the durable audit trail" — so the store expected to hold history was the one
 * with no policy for it. All of it inside the database `pg_dump` copies.
 *
 * CENSUS: TOTAL, derived from the tree. Every `INSERT INTO` site under `src/` is
 * found by scanning, and the FILE it lives in must be claimed by a registry
 * entry's `writers` — or sit in a shrink-only exemption with a reason. A file
 * classification (rather than a table one) is what makes the census total:
 * two thirds of the sites interpolate their table name, and a gate that could
 * only see literal table names would be blind exactly where the seams are.
 *
 * WHAT THIS GATE CANNOT SEE, AND WHO DOES. It reads the registry: a window here
 * is a window that is DECLARED and wired to a function. Whether that function's
 * statements can actually RUN is an outcome, and outcomes need a database — the
 * session store shipped a `DELETE FROM sessions WHERE expires < ?` against a
 * table with no `expires` column and this gate was green over it. The
 * executability leg therefore lives in the DB-tier sibling
 * `activity_row_bound_native.test.ts`, which calls EVERY registered window prune
 * (dry, plus apply on the scratch session store) and reddens on a statement that
 * throws.
 *
 * MUTATION-VERIFIED: dropping a writer from the registry, replacing a `forever`
 * reason with an empty string, and turning a window policy's prune into a
 * missing function each turn a leg RED.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listRetentions, REGISTERED_NAMES } from '../../src/core/retention/registry.ts';
import { engineSourceFilesRelative } from '../helpers/engine_source_corpus.ts';
import '../../src/core/retention/prune.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/**
 * SQL only: the statement is spelled in upper case throughout this codebase, and
 * comment lines are skipped, so a docblock that TALKS about inserting (this
 * gate's own header, the registry's) is not mistaken for a writer.
 */
const INSERT_SITE = /INSERT\s+INTO/;
const COMMENT_LINE = /^\s*(?:\/\/|\*|\/\*)/;

interface InsertSite {
	file: string;
	line: number;
}

function insertSites(): InsertSite[] {
	const sites: InsertSite[] = [];
	for (const file of engineSourceFilesRelative()) {
		const lines = readFileSync(join(REPO_ROOT, file), 'utf8').split('\n');
		lines.forEach((text, index) => {
			if (!COMMENT_LINE.test(text) && INSERT_SITE.test(text)) {
				sites.push({ file, line: index + 1 });
			}
		});
	}
	return sites;
}

/**
 * INSERT sites whose target is NOT an engine-owned store: each entry names why.
 * SHRINK-ONLY — an entry is removed when the site goes, never added without a
 * reason a reader can check against the code.
 */
const NOT_AN_ENGINE_STORE: Readonly<Record<string, string>> = {
	'src/diffusion/targets/mariadb/sql_generator.ts':
		'GENERATES SQL text for a foreign public MariaDB tier; it inserts into nothing here. The tier is derived and rebuildable by re-publishing (DIFFUSION_SPEC).',
	'src/core/test_data/test_database_marker.ts':
		'Writes the `dedalo_test_marker` row that MAKES a database the suite database. One row, on a disposable fixture DB, never on an installation.',
	'src/ai/rag/test_rag_db.ts':
		'The suite vector database MARKER row — a test-tier fixture, written only against a database that says it is one.',
};

const sites = insertSites();
const definitions = listRetentions();
const claimedWriters = new Set(definitions.flatMap((definition) => definition.writers));

describe('store retention tripwire (audit 2026-08-26 P2-9)', () => {
	test('the census actually scans the tree (corpus floor)', () => {
		// 47 INSERT sites across 26 files when this gate was written. A scan that
		// found none — a moved src/, a broken walk — would pass every other leg
		// vacuously.
		expect(
			sites.length,
			`only ${sites.length} INSERT site(s) found under src/ — the census is not scanning the tree`,
		).toBeGreaterThan(30);
		const files = new Set(sites.map((site) => site.file));
		expect(files.size).toBeGreaterThan(15);
		// It must reach the two stores the audit measured — the matrix DML writer
		// home (where the matrix_activity INSERT lives; activity_log.ts calls it)
		// and the dd1758 ledger's owner.
		expect(files.has('src/core/db/matrix_write.ts')).toBe(true);
		expect(files.has('src/core/diffusion_bridge/diffusion_delete.ts')).toBe(true);
	});

	test('every INSERT site belongs to a store with a stated retention rule', () => {
		const unclassified = [
			...new Set(
				sites
					.map((site) => site.file)
					.filter((file) => !claimedWriters.has(file) && NOT_AN_ENGINE_STORE[file] === undefined),
			),
		].sort();
		expect(
			unclassified,
			`INSERT site(s) in a store with NO retention rule:\n  ${unclassified.join('\n  ')}\nRegister the store in src/core/retention/prune.ts (a window with an executable prune, or an explicit reasoned 'forever'), or add a NOT_AN_ENGINE_STORE entry with the reason.`,
		).toEqual([]);
	});

	test('POSITIVE CONTROL: an unclassified writer is flagged', () => {
		const planted = [
			{ file: 'src/core/some_new_subsystem/writer.ts', line: 12 },
			{ file: 'src/core/api/handlers/activity_log.ts', line: 1 },
		];
		const flagged = planted
			.map((site) => site.file)
			.filter((file) => !claimedWriters.has(file) && NOT_AN_ENGINE_STORE[file] === undefined);
		expect(flagged).toEqual(['src/core/some_new_subsystem/writer.ts']);
	});

	test('every registered store states EITHER an executable window OR a reasoned forever', () => {
		expect(definitions.length, 'no retention definitions registered').toBeGreaterThan(5);
		const broken: string[] = [];
		for (const definition of definitions) {
			if (definition.description.trim().length < 20) {
				broken.push(`${definition.name}: no operator description`);
			}
			if (definition.store.trim().length === 0) broken.push(`${definition.name}: no store named`);
			if (definition.writers.length === 0) broken.push(`${definition.name}: no writer declared`);
			if (definition.policy.kind === 'forever') {
				// "Kept forever" is a legitimate rule and an illegitimate default —
				// the difference is exactly whether a reason was written down.
				if (definition.policy.reason.trim().length < 40) {
					broken.push(`${definition.name}: 'forever' with no stated reason`);
				}
				continue;
			}
			// A window is only a rule if the ENGINE can execute it.
			if (typeof definition.policy.prune !== 'function') {
				broken.push(`${definition.name}: window with no executable prune`);
			}
			if (typeof definition.policy.windowDays !== 'function') {
				broken.push(`${definition.name}: window with no configured length`);
			}
			if (definition.policy.configKey.trim().length === 0) {
				broken.push(`${definition.name}: window with no config key`);
			}
		}
		expect(broken, broken.join('\n')).toEqual([]);
	});

	test('the two stores the audit measured carry an EXECUTABLE window', () => {
		for (const name of ['matrix_activity', 'diffusion_publication_ledger', 'error_reports']) {
			const definition = definitions.find((entry) => entry.name === name);
			expect(definition, `store '${name}' is not registered`).toBeDefined();
			expect(definition?.policy.kind, `store '${name}' must carry a window, not 'forever'`).toBe(
				'window',
			);
		}
	});

	test('REGISTERED_NAMES is the closed set the catalog produces', () => {
		const registered = definitions.map((definition) => definition.name).sort();
		const declared = [...REGISTERED_NAMES].sort();
		expect(registered).toEqual(declared);
	});
});
