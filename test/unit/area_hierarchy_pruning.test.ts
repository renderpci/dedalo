/**
 * Non-admin hierarchy PRUNING on the tree-area boot data (PHP
 * area_thesaurus_json per-hierarchy read-permission loop, mirrored in
 * src/core/area/read.ts readTreeArea) — the Phase-C gate deferred 2026-07-03
 * for want of a fixture ("no fixture user has area-access-but-partial-
 * hierarchy-access"; user 16 is denied at the area level).
 *
 * FIXTURE FOUND 2026-07-10 (read-only census of the live matrix): user 4
 * (profile 13) is a NON-admin (dd244 → 2, not 1) holding dd100 thesaurus-area
 * level 2 and PARTIAL hierarchy coverage — 5 ACTIVE hierarchies carry NO
 * self-grant (dc1, object1, special1, tn1, utoponymy1) while es1/fr1/tchi1/…
 * are granted. The gate discovers the denied/granted split from the live
 * matrix at run time (data drift re-aims it instead of falsely reddening)
 * with a non-vacuity floor on both sides.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { getPermissions, resolvePrincipal } from '../../src/core/security/permissions.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

const FIXTURE_USER = 4; // profile 13: dd100=2, partial hierarchy self-grants
const AREA_TIPO = 'dd100';

let dbReady = false;
let nonAdmin: Principal;
let admin: Principal;
let deniedTargets: string[] = [];
let grantedTargets: string[] = [];

beforeAll(async () => {
	try {
		await sql`SELECT 1`;
		dbReady = true;
	} catch {
		dbReady = false;
		return;
	}
	nonAdmin = await resolvePrincipal(FIXTURE_USER);
	admin = await resolvePrincipal(-1);
	// Discover the split from the ACTIVE hierarchy registry vs the fixture's
	// live grants (the same self-keyed lookup the pruning loop applies).
	const rows = (await sql`
		SELECT COALESCE(data->'hierarchy53', string->'hierarchy53')->0->>'value' AS target
		FROM matrix_hierarchy_main
		WHERE section_tipo = 'hierarchy1'
		  AND relation->'hierarchy4' @> '[{"section_id":"1","section_tipo":"dd64"}]'::jsonb
	`) as { target: string | null }[];
	for (const row of rows) {
		const target = row.target;
		if (typeof target !== 'string' || target === '') continue;
		if ((await getPermissions(nonAdmin, target, target)) < 1) deniedTargets.push(target);
		else grantedTargets.push(target);
	}
	deniedTargets = [...new Set(deniedTargets)];
	grantedTargets = [...new Set(grantedTargets)];
});

async function readTree(principal: Principal): Promise<{ target_section_tipo?: string }[]> {
	const token = createSession(
		principal.userId,
		`user_${principal.userId}`,
		principal.isGlobalAdmin,
	);
	const session = getSession(token);
	const rqo = {
		id: 'hierarchy_pruning_gate',
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		options: {},
		source: {
			typo: 'source',
			model: 'area_thesaurus',
			tipo: AREA_TIPO,
			section_tipo: AREA_TIPO,
			action: 'get_data',
			mode: 'list',
			lang: 'lg-spa',
		},
	} as unknown as Rqo;
	const dispatched = await dispatchRqo(rqo, {
		requestId: 'hierarchy_pruning_gate',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	} as never);
	const data = (dispatched.body as { result?: { data?: { value?: unknown[] }[] } }).result?.data;
	return (data?.[0]?.value ?? []) as { target_section_tipo?: string }[];
}

describe('tree-area non-admin hierarchy pruning (PHP area_thesaurus_json loop)', () => {
	test('fixture floor: user 4 is non-admin with area access and BOTH granted and denied hierarchies', async () => {
		if (!dbReady) return;
		expect(nonAdmin.isGlobalAdmin).toBe(false);
		expect(await getPermissions(nonAdmin, AREA_TIPO, AREA_TIPO)).toBeGreaterThanOrEqual(1);
		// If either side empties, the profile changed — re-aim the fixture, the
		// gate is vacuous without a real split.
		expect(deniedTargets.length).toBeGreaterThan(0);
		expect(grantedTargets.length).toBeGreaterThan(0);
	});

	test('the non-admin boot tree PRUNES every denied hierarchy and keeps granted ones', async () => {
		if (!dbReady) return;
		const tree = await readTree(nonAdmin);
		expect(tree.length).toBeGreaterThan(0);
		const served = new Set(tree.map((entry) => entry.target_section_tipo));
		for (const denied of deniedTargets) {
			expect(served.has(denied)).toBe(false);
		}
		// At least one granted hierarchy must actually serve (some granted
		// targets are skipped for structural reasons — no root terms/children —
		// so assert the intersection, not full coverage).
		expect(grantedTargets.some((granted) => served.has(granted))).toBe(true);
	});

	test('the ADMIN boot tree still carries hierarchies the fixture is denied (no over-prune)', async () => {
		if (!dbReady) return;
		const tree = await readTree(admin);
		const served = new Set(tree.map((entry) => entry.target_section_tipo));
		expect(deniedTargets.some((denied) => served.has(denied))).toBe(true);
	});
});
