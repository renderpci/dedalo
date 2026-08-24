/**
 * Non-admin hierarchy PRUNING on the tree-area boot data (PHP
 * area_thesaurus_json per-hierarchy read-permission loop, mirrored in
 * src/core/area/read.ts filterHierarchiesByGrant) — the Phase-C gate deferred
 * 2026-07-03 for want of a fixture.
 *
 * REBUILT 2026-08-23 under the generic-TLD law. The 2026-07-10 form asserted
 * the mht install's live matrix ("user 4, profile 13, partial hierarchy
 * split") — on the suite database that user does not exist and all three
 * tests reddened as claims about an ABSENT install; its discovery probe also
 * bound only the STRING section_id form, which matches 0 post-int-sweep rows
 * (the exact trap relations/request_config/explicit.ts documents). The gate
 * now BUILDS the split (test/helpers/hierarchy_pruning_fixture.ts): a scratch
 * non-admin whose profile grants the thesaurus area + ONE of two scratch
 * hierarchies' targets. Both hierarchies are servable by construction, so
 * "denied is absent" is pruning, never a config drop — and the superuser leg
 * proves exactly that.
 *
 * The old `if (!dbReady) return;` guard also made every test silently green
 * with the DB down (zero assertions). Gone: an unreachable database now fails
 * the beforeAll loudly.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import {
	getPermissions,
	resolvePrincipal,
	SUPERUSER_ID,
} from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import {
	HP_AREA_TIPO,
	HP_DENIED_TARGET,
	HP_GRANTED_TARGET,
	HP_NON_ADMIN_USER_ID,
	installHierarchyPruningFixture,
	removeHierarchyPruningFixture,
} from '../helpers/hierarchy_pruning_fixture.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

let nonAdmin: Principal;
let superuser: Principal;

beforeAll(async () => {
	await installHierarchyPruningFixture();
	nonAdmin = await resolvePrincipal(HP_NON_ADMIN_USER_ID);
	superuser = await resolvePrincipal(SUPERUSER_ID);
});

afterAll(removeHierarchyPruningFixture);

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
			tipo: HP_AREA_TIPO,
			section_tipo: HP_AREA_TIPO,
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
	const data = (dispatched.body as { data?: { data?: { value?: unknown[] }[] } }).data?.data;
	return (data?.[0]?.value ?? []) as { target_section_tipo?: string }[];
}

describe('tree-area non-admin hierarchy pruning (PHP area_thesaurus_json loop)', () => {
	test('fixture floor: the scratch non-admin holds area access and a REAL granted/denied split', async () => {
		expect(nonAdmin.isGlobalAdmin).toBe(false);
		// Verified through the real permission door, not by trusting the insert:
		// a grant that does not confer reddens HERE, before the tree is read.
		expect(await getPermissions(nonAdmin, HP_AREA_TIPO, HP_AREA_TIPO)).toBeGreaterThanOrEqual(1);
		expect(
			await getPermissions(nonAdmin, HP_GRANTED_TARGET, HP_GRANTED_TARGET),
		).toBeGreaterThanOrEqual(1);
		expect(await getPermissions(nonAdmin, HP_DENIED_TARGET, HP_DENIED_TARGET)).toBeLessThan(1);
	});

	test('the non-admin boot tree PRUNES the denied hierarchy and keeps the granted one', async () => {
		const tree = await readTree(nonAdmin);
		expect(tree.length).toBeGreaterThan(0);
		const served = new Set(tree.map((entry) => entry.target_section_tipo));
		expect(served.has(HP_GRANTED_TARGET)).toBe(true);
		expect(served.has(HP_DENIED_TARGET)).toBe(false);
		// The pruning law itself, over the WHOLE tree: nothing served may be a
		// target the principal cannot read.
		for (const target of served) {
			if (typeof target !== 'string') continue;
			expect(
				await getPermissions(nonAdmin, target, target),
				`served target '${target}' is not readable by the non-admin — the pruning loop leaked it`,
			).toBeGreaterThanOrEqual(1);
		}
	});

	test('the SUPERUSER boot tree carries BOTH scratch hierarchies (denied is pruned, not unservable)', async () => {
		const tree = await readTree(superuser);
		const served = new Set(tree.map((entry) => entry.target_section_tipo));
		// Both must serve: if the DENIED one is missing here, its absence from
		// the non-admin tree proves nothing (a config drop, not pruning).
		expect(served.has(HP_GRANTED_TARGET)).toBe(true);
		expect(served.has(HP_DENIED_TARGET)).toBe(true);
	});
});
