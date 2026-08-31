/**
 * TRIPWIRE — the SHIPPED SEED equals the DECLARED definitions (P2-34 /
 * UPD-01 + UPD-02).
 *
 * `0001_baseline.sql`'s own header states the rule: every schema change lands as
 * the next numbered migration and runs at boot before serving. The artefact an
 * install actually receives had drifted from the definitions in BOTH directions,
 * measured 2026-08-31 against `install/db/dedalo_install.pgsql.gz`:
 *
 *  - UPD-01 — FOUR declared indexes were missing from the seed (declared
 *    2026-07-26/27, seed last regenerated 2026-07-21). No migration shipped
 *    them, so they reached an existing install only if an operator happened to
 *    press "recreate DB assets", and a FRESH install never. One is measured at
 *    84x on a 1.2M-row clone and serves the Time Machine inspector panel a
 *    curator opens on any record.
 *  - UPD-02 — the seed created 120 GIN expression indexes for five families
 *    retired 2026-07-20 as DROP-ONLY, across 24 matrix tables. No emitted query
 *    shape can use them, and every one is maintained on EVERY SAVE: +32%
 *    measured on the relation write path from one family of the five.
 *
 * NO SIDE EFFECTS, deliberately. The gate that appeared to cover this compares
 * two SOURCE files and never the artefact — and it CREATES the declared indexes
 * on the test database before inspecting, so it is structurally incapable of
 * seeing an index the seed lacks. This one reads two files and touches nothing.
 */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import definitions from '../../src/core/db/db_pg_definitions.json';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const SEED = 'install/db/dedalo_install.pgsql.gz';
const MIGRATIONS = join(REPO_ROOT, 'install', 'db', 'migrations');

interface AssetEntry {
	tables?: string[];
	add: string;
	name?: string;
}

const INDEX_NAME =
	/CREATE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:CONCURRENTLY\s+)?([A-Za-z0-9_]+)\s+ON/gi;

/**
 * The five families retired 2026-07-20 as drop-only. A drop-only entry must be
 * ABSENT from the seed — that is the UPD-02 half of the equality.
 */
const RETIRED_FAMILIES = [
	'relation_flat_fct_st_si_gin',
	'relation_flat_st_si_gin',
	'relation_flat_ty_st_gin',
	'relation_flat_ty_st_si_gin',
	'relation_locators_gin',
] as const;

/**
 * Undeclared indexes in the seed that are NOT a retired family: older indexes
 * that predate `ar_index` and are not governed by it. Enumerated so the census
 * stays total — "not in ar_index" must never quietly mean "ignored".
 */
const UNGOVERNED_SEED_INDEXES: readonly string[] = [
	'matrix_activity_diffusion_id_desc_idx',
	'matrix_activity_diffusion_section_id_desc_idx',
	'matrix_activity_diffusion_timestamp_idx',
	'matrix_activity_timestamp_date_idx',
	'matrix_time_machine_lang_idx',
	'matrix_time_machine_si_bulk_st_tipo_lang_idx',
	'matrix_time_machine_timestamp_date_idx',
];

async function seedIndexNames(): Promise<Set<string>> {
	const text = await Bun.$`gzcat ${SEED}`.cwd(REPO_ROOT).text();
	const names = new Set<string>();
	for (const match of text.matchAll(INDEX_NAME)) names.add((match[1] as string).toLowerCase());
	return names;
}

/** Every index the definitions declare, expanded per table exactly as rebuildTemplated does. */
function declaredIndexNames(): Set<string> {
	const names = new Set<string>();
	for (const entry of definitions.ar_index as AssetEntry[]) {
		for (const table of entry.tables ?? []) {
			const add = entry.add.replaceAll('{$table}', table);
			const match = /CREATE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_]+)\s+ON/i.exec(add);
			if (match) names.add((match[1] as string).toLowerCase());
		}
	}
	return names;
}

/** Index names any numbered migration creates — the sanctioned way to ship one. */
async function migrationCreatedNames(): Promise<Set<string>> {
	const names = new Set<string>();
	for (const file of new Bun.Glob('*.sql').scanSync({ cwd: MIGRATIONS })) {
		const text = await Bun.file(join(MIGRATIONS, file)).text();
		for (const match of text.matchAll(INDEX_NAME)) names.add((match[1] as string).toLowerCase());
	}
	return names;
}

/** Index names any numbered migration drops. */
async function migrationDroppedNames(): Promise<Set<string>> {
	const names = new Set<string>();
	for (const file of new Bun.Glob('*.sql').scanSync({ cwd: MIGRATIONS })) {
		const text = await Bun.file(join(MIGRATIONS, file)).text();
		for (const match of text.matchAll(/DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?([A-Za-z0-9_]+)/gi)) {
			names.add((match[1] as string).toLowerCase());
		}
	}
	return names;
}

describe('the shipped seed equals the declared definitions', () => {
	test('both artefacts are actually read (anti-vacuity)', async () => {
		// The whole gate is set difference: either side coming back empty would
		// make every assertion below pass while comparing nothing.
		const seed = await seedIndexNames();
		const declared = declaredIndexNames();
		expect(seed.size).toBeGreaterThan(300);
		expect(declared.size).toBeGreaterThan(200);
	});

	test('every DECLARED index reaches an install (seed, or a numbered migration)', async () => {
		const seed = await seedIndexNames();
		const shipped = await migrationCreatedNames();
		const unreachable = [...declaredIndexNames()]
			.filter((name) => !seed.has(name) && !shipped.has(name))
			.sort();
		expect(
			unreachable,
			'These indexes are DECLARED but reach no install: not in the shipped seed and not ' +
				'created by any numbered migration. A fresh install never gets them, and an ' +
				'existing one only if an operator happens to press "recreate DB assets". Ship them ' +
				`as the next numbered migration.\n  ${unreachable.join('\n  ')}`,
		).toEqual([]);
	});

	test('a DROP-ONLY family is gone from every install', async () => {
		const seed = await seedIndexNames();
		const dropped = await migrationDroppedNames();
		const stillCreated = [...seed]
			.filter((name) => RETIRED_FAMILIES.some((family) => name.endsWith(`_${family}_idx`)))
			.filter((name) => !dropped.has(name))
			.sort();
		expect(
			stillCreated.length,
			`${stillCreated.length} retired-family indexes are created by the seed and dropped by ` +
				'no migration. Nothing can use them and every one is maintained on EVERY SAVE ' +
				'(+32% measured on the relation write path from one family). Ship the drops.',
		).toBe(0);
	});

	test('the seed creates nothing undeclared and unaccounted for', async () => {
		const declared = declaredIndexNames();
		const ungoverned = new Set(UNGOVERNED_SEED_INDEXES);
		const surprises = [...(await seedIndexNames())]
			.filter((name) => !declared.has(name))
			.filter((name) => !RETIRED_FAMILIES.some((family) => name.endsWith(`_${family}_idx`)))
			.filter((name) => !ungoverned.has(name))
			.sort();
		expect(
			surprises,
			'The seed creates indexes that are neither declared in ar_index, nor a known retired ' +
				'family, nor in the enumerated ungoverned list. An index nobody declares is an ' +
				`index nobody maintains.\n  ${surprises.join('\n  ')}`,
		).toEqual([]);
	});

	test('the ungoverned list is still accurate in both directions', async () => {
		// A stale entry makes the census above look total while hiding a real
		// surprise behind a name that no longer exists.
		const seed = await seedIndexNames();
		const stale = UNGOVERNED_SEED_INDEXES.filter((name) => !seed.has(name));
		expect(stale, `no longer in the seed — DELETE:\n  ${stale.join('\n  ')}`).toEqual([]);
	});
});
