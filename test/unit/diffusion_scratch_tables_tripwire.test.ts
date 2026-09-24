/**
 * DIFFUSION SCRATCH TABLES TRIPWIRE — a gate that names a diffusion scratch
 * table BUILDS it, in its own beforeAll (2026-09-24).
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * The bun-test preload points the engine's diffusion seams at scratch tables
 * (`DIFFUSION_JOBS_TABLE` + `_events`, `DIFFUSION_ACTIVITY_TABLE`), and nothing
 * builds them up front: the engine creates each lazily on its OWN entry points.
 * A gate that runs raw SQL on one of them is not an entry point — it was green
 * only when an earlier file in the same process had happened to create the
 * table. Measured on the unit census right after `bun run test:db:setup`:
 * ops_diffusion_queue (2), diffusion_runner_native (2 hook failures),
 * diffusion_dd1762_actor (1) went 42P01, and the runner's half-run teardown
 * leaked its zzdif domain into diffusion_seed_compiles_native (2) — seven
 * order-dependent reds, each passing alone. Fixed by determinism:
 * test/helpers/diffusion_scratch_tables.ts `ensureDiffusionScratchTables()`.
 *
 * ── WHAT IS ASSERTED ─────────────────────────────────────────────────────────
 *  1. THE HELPER'S OUTCOME. On a never-created activity table name the helper
 *     leaves the table EXISTING (to_regclass), and the jobs + events tables
 *     too; with the seam off (the production name) it REFUSES and creates
 *     nothing.
 *  2. THE INVENTORY (source scan, derived). Every file under `test/` that
 *     imports a scratch-table NAME binding (`activityTable`,
 *     `DIFFUSION_JOBS_TABLE`, `DIFFUSION_JOB_EVENTS_TABLE`) from the engine
 *     modules that own them calls `ensureDiffusionScratchTables(` inside a
 *     `beforeAll(` — or carries a named reason in EXEMPT. Staleness is failure:
 *     an exempt file that no longer binds a name, or that now calls the helper,
 *     is red.
 *
 * HONEST LIMIT. Leg 2 is a source scan: it proves the call is in a beforeAll,
 * not that it runs before every raw statement of the file (a module-level
 * top-level await, say). The per-file cold ORDER is what matters and no
 * in-process gate can observe it — the census run right after
 * `test:db:setup` is the outcome measurement this scan stands in for.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from '../../src/core/db/postgres.ts';
import { DB_READY } from '../helpers/db_ready.ts';
import { ensureDiffusionScratchTables } from '../helpers/diffusion_scratch_tables.ts';
import { stripComments } from '../helpers/strip_comments.ts';
import { testTreeSourceFiles } from '../helpers/test_tree_corpus.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const HELPER = 'test/helpers/diffusion_scratch_tables.ts';
const SELF = 'test/unit/diffusion_scratch_tables_tripwire.test.ts';

/** The engine modules that own the scratch-table names, and the name bindings. */
const OWNER_MODULE = /(?:diffusion_bridge\/diffusion_delete|diffusion\/jobs\/schema)\.ts$/;
const NAME_BINDINGS = new Set([
	'activityTable',
	'DIFFUSION_JOBS_TABLE',
	'DIFFUSION_JOB_EVENTS_TABLE',
]);

/**
 * Files that bind a name WITHOUT calling the helper, each with its reason.
 * Shrink-only in spirit; a stale entry is red.
 */
const EXEMPT: Readonly<Record<string, string>> = {
	'test/unit/diffusion_jobs_table_seam.test.ts':
		'NAMES ONLY — it asserts how the seam RESOLVES (prefix, events twin, the refusal of a non-scratch override in a child process) and runs no SQL on any of the tables.',
	'test/unit/activity_row_bound_native.test.ts':
		"OWNS A PRIVATE TABLE IT DROPS — it pins DIFFUSION_ACTIVITY_TABLE to its own name, DROPs it, and lets the engine's own logDiffusionActivity recreate it. Calling the helper first would fill the engine's per-table DDL memo, so after the DROP the engine would skip the CREATE and the leg would go 42P01.",
};

function read(file: string): string {
	return readFileSync(join(REPO_ROOT, file), 'utf8');
}

/** Every `.ts` under test/ (the registered test-tree lister), minus the helper and this gate. */
function testTreeFiles(): string[] {
	return testTreeSourceFiles().filter((file) => file !== HELPER && file !== SELF);
}

/** The name bindings a file IMPORTS from an owner module (import statements only). */
function boundNames(source: string): string[] {
	const code = stripComments(source);
	const names: string[] = [];
	for (const match of code.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
		const [, specifiers, from] = match;
		if (specifiers === undefined || from === undefined || !OWNER_MODULE.test(from)) continue;
		for (const raw of specifiers.split(',')) {
			const name =
				raw
					.trim()
					.replace(/^type\s+/, '')
					.split(/\s+as\s+/)[0] ?? '';
			if (NAME_BINDINGS.has(name)) names.push(name);
		}
	}
	return names;
}

/** The bodies of every `beforeAll(…)` call, bracket-matched on string-blanked code. */
function beforeAllBodies(source: string): string[] {
	const code = stripComments(source, {
		blankStrings: true,
		keepTemplateSubstitutions: true,
		blankRegexBodies: true,
	});
	const bodies: string[] = [];
	for (const match of code.matchAll(/\bbeforeAll\s*\(/g)) {
		const open = (match.index ?? 0) + match[0].length;
		let depth = 1;
		let index = open;
		while (index < code.length && depth > 0) {
			const char = code[index];
			if (char === '(') depth += 1;
			else if (char === ')') depth -= 1;
			index += 1;
		}
		bodies.push(code.slice(open, index - 1));
	}
	return bodies;
}

function callsHelperInBeforeAll(source: string): boolean {
	return beforeAllBodies(source).some((body) => /\bensureDiffusionScratchTables\s*\(/.test(body));
}

const binders = testTreeFiles().filter((file) => boundNames(read(file)).length > 0);

describe('leg 2 — every gate that names a diffusion scratch table builds it', () => {
	test('the scan finds the binders it is meant to see (anti-vacuity)', () => {
		// 16 binders measured 2026-09-24; a scan that finds a handful is broken.
		expect(binders.length).toBeGreaterThanOrEqual(12);
		for (const known of [
			'test/unit/ops_diffusion_queue.test.ts',
			'test/unit/diffusion_runner_native.test.ts',
			'test/unit/diffusion_dd1762_actor.test.ts',
		]) {
			expect(binders).toContain(known);
		}
	});

	test('the beforeAll matcher sees a call inside and not outside (anti-vacuity)', () => {
		const inside = 'beforeAll(async () => {\n\tawait ensureDiffusionScratchTables();\n});';
		const outside =
			'beforeAll(async () => { await purge(`${x}`); });\nawait ensureDiffusionScratchTables();';
		const inString = "beforeAll(() => { log('ensureDiffusionScratchTables()'); });";
		expect(callsHelperInBeforeAll(inside)).toBe(true);
		expect(callsHelperInBeforeAll(outside)).toBe(false);
		expect(callsHelperInBeforeAll(inString)).toBe(false);
	});

	test('every binder calls ensureDiffusionScratchTables() in a beforeAll, or is exempt with a reason', () => {
		const offenders = binders
			.filter((file) => EXEMPT[file] === undefined)
			.filter((file) => !callsHelperInBeforeAll(read(file)))
			.map((file) => `${file} binds ${boundNames(read(file)).join(', ')}`);
		expect(
			offenders,
			'these gates name a diffusion scratch table but never build it — call `await ensureDiffusionScratchTables()` (test/helpers/diffusion_scratch_tables.ts) in the file beforeAll, before its first raw statement',
		).toEqual([]);
	});

	test('no stale exemption', () => {
		const stale = Object.keys(EXEMPT).filter((file) => {
			if (!binders.includes(file)) return true;
			return callsHelperInBeforeAll(read(file));
		});
		expect(stale).toEqual([]);
	});
});

describe.if(DB_READY)('leg 1 — the helper leaves the tables EXISTING, or refuses', () => {
	async function exists(table: string): Promise<boolean> {
		const rows = (await sql.unsafe('SELECT to_regclass($1) IS NOT NULL AS ok', [`"${table}"`])) as {
			ok: boolean;
		}[];
		return rows[0]?.ok === true;
	}

	test('a never-created activity table exists after the call; jobs + events too', async () => {
		const fresh = `dedalo_ts_test_zzscr_${process.pid}`;
		const saved = process.env.DIFFUSION_ACTIVITY_TABLE;
		process.env.DIFFUSION_ACTIVITY_TABLE = fresh;
		try {
			expect(await exists(fresh)).toBe(false);
			const tables = await ensureDiffusionScratchTables();
			expect(tables.activity).toBe(fresh);
			expect(await exists(fresh)).toBe(true);
			expect(await exists(tables.jobs)).toBe(true);
			expect(await exists(tables.jobEvents)).toBe(true);
		} finally {
			if (saved === undefined) delete process.env.DIFFUSION_ACTIVITY_TABLE;
			else process.env.DIFFUSION_ACTIVITY_TABLE = saved;
			await sql.unsafe(`DROP TABLE IF EXISTS "${fresh}"`, []);
			await sql.unsafe(`DROP SEQUENCE IF EXISTS "${fresh}_section_id_seq"`, []);
		}
	});

	test('with the activity seam OFF (the production table) it refuses and creates nothing', async () => {
		const saved = process.env.DIFFUSION_ACTIVITY_TABLE;
		process.env.DIFFUSION_ACTIVITY_TABLE = '';
		try {
			await expect(ensureDiffusionScratchTables()).rejects.toThrow(
				/REFUSED: the activity table resolves to 'matrix_activity_diffusion'/,
			);
		} finally {
			if (saved === undefined) delete process.env.DIFFUSION_ACTIVITY_TABLE;
			else process.env.DIFFUSION_ACTIVITY_TABLE = saved;
		}
	});
});
