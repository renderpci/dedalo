/**
 * A DECLARED THESAURUS NEVER BLOCKS, NEVER IS FORCED — the install_hierarchies STEP
 * (src/core/install/step_runs.ts STEP_RUNS.install_hierarchies, the ONE step table the
 * executor runs; 2026-10-10, WC-2026-10-10-ontology-dependencies-hierarchy60).
 *
 * OWNER DECISION 2026-10-10: a thesaurus dependency NEVER blocks an install — the
 * plan's list is the operator's answer on every one (declared ones pre-ticked;
 * unticking declines), a mandatory one is STRONGLY RECOMMENDED. The WARNING half
 * (a declined mandatory thesaurus, or one with no hierarchy.json entry, is a plan
 * WARNING on every front end, never an error) is decided at PLAN time and gated in
 * install_plan_parity_tripwire (i). This gate holds the STEP half: with the core `lg`
 * registry row declaring a MANDATORY thesaurus, running the step on [] — the plan's
 * answer when the operator declined it — answers ok and imports NOTHING. A step that
 * still force-added the thesaurus goes red on the row count.
 *
 * (Until 2026-10-12 the browser wizard's router ran this step in a restarted process
 * with no plan and re-read the declarations from the registry rows to warn; that
 * route and its reader are gone — WC-2026-10-12-install-surface-removed.)
 *
 * SCRATCH: the suite's real `lg` registry row's `misc` is SNAPSHOTTED first and
 * RESTORED in `finally` (asserted equal); the declared thesaurus is a vendored one the
 * suite does not hold (no `<tld>1` row), so nothing is created. Suite database only.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { offeredHierarchyTlds } from '../../src/core/install/ontology_choice.ts';
import { STEP_RUNS } from '../../src/core/install/step_runs.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

const DOOR = 'install_hierarchy_dependencies_native';

beforeAll(async () => {
	await assertTestDatabase(DOOR);
});

/** The suite's core `lg` registry row id + its `misc`, as stored. */
async function lgRow(): Promise<{ section_id: number; misc: unknown }> {
	const rows = (await sql.unsafe(
		`SELECT section_id, misc FROM matrix_ontology_main
		  WHERE section_tipo = 'ontology35' AND string->'hierarchy6' @> $1::text::jsonb`,
		[JSON.stringify([{ value: 'lg' }])],
	)) as { section_id: number; misc: unknown }[];
	if (rows.length !== 1) throw new Error(`expected one lg registry row, got ${rows.length}`);
	return rows[0] as { section_id: number; misc: unknown };
}

async function setLgMisc(sectionId: number, misc: unknown): Promise<void> {
	await sql.unsafe(
		`UPDATE matrix_ontology_main SET misc = $2::text::jsonb
		  WHERE section_tipo = 'ontology35' AND section_id = $1`,
		[sectionId, misc === null ? null : JSON.stringify(misc)],
	);
}

async function hierarchyRowCount(tld: string): Promise<number> {
	const rows = (await sql.unsafe(
		'SELECT count(*) AS n FROM matrix_hierarchy WHERE section_tipo = $1',
		[`${tld}1`],
	)) as { n: number }[];
	return Number(rows[0]?.n ?? -1);
}

/** A vendored thesaurus the suite database does not hold (no `<tld>1` row). */
async function absentVendored(): Promise<string> {
	for (const tld of [...offeredHierarchyTlds()].sort()) {
		if ((await hierarchyRowCount(tld)) === 0) return tld;
	}
	throw new Error('every vendored thesaurus is installed in the suite database');
}

/** Run `body` with the lg row declaring `dependencies`; lg's misc is restored and checked. */
async function withLgDeclaring(dependencies: unknown[], body: () => Promise<void>): Promise<void> {
	const snapshot = await lgRow();
	try {
		await setLgMisc(snapshot.section_id, {
			...((snapshot.misc as Record<string, unknown> | null) ?? {}),
			hierarchy60: [{ id: 1, value: dependencies }],
		});
		await body();
	} finally {
		await setLgMisc(snapshot.section_id, snapshot.misc);
	}
	expect(await lgRow()).toEqual(snapshot);
}

describe('the install_hierarchies STEP: a declared thesaurus is never forced', () => {
	for (const [label, declared] of [
		['a vendored MANDATORY thesaurus', 'vendored'],
		['a MANDATORY thesaurus with no hierarchy.json entry', 'zzhdx'],
	] as const) {
		test(`[] with ${label} declared by lg — ok, nothing imported, no refusal`, async () => {
			// anti-vacuity: there IS a vendored offer to force from
			expect([...offeredHierarchyTlds()].length).toBeGreaterThan(0);
			const fresh = await absentVendored();
			const tld = declared === 'vendored' ? fresh : declared;
			await withLgDeclaring([{ tld, main: 'hierarchy1', mandatory: true }], async () => {
				const outcome = await STEP_RUNS.install_hierarchies({
					posted: {},
					createDirectories: false,
					actorUserId: -1,
					hierarchies: [],
				});
				expect(outcome.ok).toBe(true);
				expect(outcome.responses ?? []).toEqual([]);
			});
			expect(await hierarchyRowCount(fresh)).toBe(0);
		});
	}
});
