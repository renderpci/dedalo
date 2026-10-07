/**
 * area_ontology (dd5) access — ONE rule for read AND menu (engineering/AREA_SPEC.md §9,
 * WC-2026-10-07-ontology-area-admin-grant, TODO-025/026): the superuser, or a
 * global admin whose profile grants dd5. Inside the area each TLD hierarchy
 * answers the ordinary ACL — no admin bypass. Each half of the conjunction is
 * proven by its own built identity (test/helpers/ontology_area_access_fixture.ts).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { getMenuTreeDatalist } from '../../src/core/api/handlers/menu.ts';
import { AREA_ONTOLOGY_TIPO } from '../../src/core/concepts/area.ts';
import {
	canAccessOntologyArea,
	type Principal,
	resolvePrincipal,
	SUPERUSER_ID,
} from '../../src/core/security/permissions.ts';
import {
	createSession,
	destroySession,
	getSession,
} from '../../src/core/security/session_store.ts';
import {
	installOntologyAreaAccessFixture,
	OA_DENIED_TLD_SECTION,
	OA_GRANTED_ADMIN_ID,
	OA_GRANTED_NON_ADMIN_ID,
	OA_GRANTED_TLD_SECTION,
	OA_UNGRANTED_ADMIN_ID,
	removeOntologyAreaAccessFixture,
} from '../helpers/ontology_area_access_fixture.ts';

const tokens: string[] = [];

async function readOntologyArea(userId: number) {
	const principal = await resolvePrincipal(userId);
	const token = createSession(userId, `zzoa_${userId}`, principal.isGlobalAdmin);
	tokens.push(token);
	const session = getSession(token);
	const rqo = {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		options: {},
		source: {
			typo: 'source',
			model: 'area_ontology',
			tipo: AREA_ONTOLOGY_TIPO,
			section_tipo: AREA_ONTOLOGY_TIPO,
			mode: 'list',
			lang: 'lg-spa',
		},
	};
	return dispatchRqo(
		rqo as never,
		{
			requestId: 't',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		} as never,
	);
}

/** The served hierarchy targets of a 200 ontology-area read. */
function servedTargets(body: unknown): string[] {
	const items = (body as { data?: { data?: { value?: unknown }[] } }).data?.data ?? [];
	const targets: string[] = [];
	for (const item of items) {
		if (!Array.isArray(item.value)) continue;
		for (const h of item.value as { target_section_tipo: string }[]) {
			targets.push(h.target_section_tipo);
		}
	}
	return targets;
}

async function menuHasOntology(principal: Principal): Promise<boolean> {
	const { tree_datalist } = await getMenuTreeDatalist(principal);
	return tree_datalist.some((node) => node.tipo === AREA_ONTOLOGY_TIPO);
}

beforeAll(async () => {
	await installOntologyAreaAccessFixture();
});

afterAll(async () => {
	for (const token of tokens) destroySession(token);
	await removeOntologyAreaAccessFixture();
});

describe('who opens area_ontology (read AND menu)', () => {
	test('identities are what the fixture claims (non-vacuity)', async () => {
		expect((await resolvePrincipal(OA_GRANTED_ADMIN_ID)).isGlobalAdmin).toBe(true);
		expect((await resolvePrincipal(OA_UNGRANTED_ADMIN_ID)).isGlobalAdmin).toBe(true);
		expect((await resolvePrincipal(OA_GRANTED_NON_ADMIN_ID)).isGlobalAdmin).toBe(false);
	});

	test('superuser: read 200, menu shows dd5', async () => {
		const principal = await resolvePrincipal(SUPERUSER_ID);
		expect(await canAccessOntologyArea(principal)).toBe(true);
		expect(await menuHasOntology(principal)).toBe(true);
		expect((await readOntologyArea(SUPERUSER_ID)).status).toBe(200);
	});

	test('global admin + dd5 grant: read 200, menu shows dd5', async () => {
		const principal = await resolvePrincipal(OA_GRANTED_ADMIN_ID);
		expect(await canAccessOntologyArea(principal)).toBe(true);
		expect(await menuHasOntology(principal)).toBe(true);
		expect((await readOntologyArea(OA_GRANTED_ADMIN_ID)).status).toBe(200);
	});

	test('global admin WITHOUT the dd5 grant: read 403, menu hides dd5', async () => {
		const principal = await resolvePrincipal(OA_UNGRANTED_ADMIN_ID);
		expect(await canAccessOntologyArea(principal)).toBe(false);
		expect(await menuHasOntology(principal)).toBe(false);
		const result = await readOntologyArea(OA_UNGRANTED_ADMIN_ID);
		expect(result.status).toBe(403);
		expect(result.body.ok).toBe(false);
	});

	test('non-admin WITH the dd5 grant: read 403, menu hides dd5', async () => {
		const principal = await resolvePrincipal(OA_GRANTED_NON_ADMIN_ID);
		expect(await canAccessOntologyArea(principal)).toBe(false);
		expect(await menuHasOntology(principal)).toBe(false);
		const result = await readOntologyArea(OA_GRANTED_NON_ADMIN_ID);
		expect(result.status).toBe(403);
		expect(result.body.ok).toBe(false);
	});
});

describe('inside area_ontology: ordinary ACL per TLD hierarchy, no admin bypass', () => {
	test('superuser is served both the granted and the ungranted TLD (non-vacuity)', async () => {
		const targets = servedTargets((await readOntologyArea(SUPERUSER_ID)).body);
		expect(targets).toContain(OA_GRANTED_TLD_SECTION);
		expect(targets).toContain(OA_DENIED_TLD_SECTION);
	});

	test('granted admin is served exactly the TLD its profile grants', async () => {
		const targets = servedTargets((await readOntologyArea(OA_GRANTED_ADMIN_ID)).body);
		expect(targets).toEqual([OA_GRANTED_TLD_SECTION]);
	});
});
