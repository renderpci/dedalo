/**
 * Phase D fail-closed security gates (engineering/AREA_SPEC.md §9), TS-side (DB-derived,
 * no PHP). Covers: area_ontology superuser-only read + menu hiding; model-vs-tipo
 * validation on area reads; area-write refusal (save/create/delete/duplicate).
 * The PHP divergence for the dd917 quirk is pinned in
 * area_security_differential.test.ts (PHP accepts, TS refuses).
 */

import { describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { getMenuTreeDatalist } from '../../src/core/api/handlers/menu.ts';
import { AREA_ONTOLOGY_TIPO } from '../../src/core/concepts/area.ts';
import { type Principal, resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';

const NON_ADMIN_USER = 16;

function contextFor(
	userId: number,
	username: string,
	isGlobalAdmin: boolean,
	principal: Principal,
) {
	const token = createSession(userId, username, isGlobalAdmin);
	const session = getSession(token);
	return {
		requestId: 't',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	};
}

function readRqo(model: string, tipo: string, extra: Record<string, unknown> = {}) {
	return {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		options: {},
		source: { typo: 'source', model, tipo, section_tipo: tipo, mode: 'list', lang: 'lg-spa' },
		...extra,
	};
}

describe('area_ontology is superuser-only', () => {
	test('superuser reads area_ontology (dd5)', async () => {
		const principal = await resolvePrincipal(-1);
		const context = contextFor(-1, 'root', true, principal);
		const result = await dispatchRqo(
			readRqo('area_ontology', AREA_ONTOLOGY_TIPO) as never,
			context as never,
		);
		expect(result.status).toBe(200);
		expect((result.body.result as { data?: unknown[] }).data).toBeDefined();
	});

	test('a non-superuser is refused area_ontology (403)', async () => {
		const principal = await resolvePrincipal(NON_ADMIN_USER);
		const context = contextFor(NON_ADMIN_USER, 'josep', false, principal);
		const result = await dispatchRqo(
			readRqo('area_ontology', AREA_ONTOLOGY_TIPO) as never,
			context as never,
		);
		expect(result.status).toBe(403);
		expect(result.body.result).toBe(false);
	});
});

describe('model-vs-tipo validation on area reads', () => {
	test('area_ontology with a non-ontology tipo (dd917 field_text) is refused (400)', async () => {
		const principal = await resolvePrincipal(-1);
		const context = contextFor(-1, 'root', true, principal);
		const result = await dispatchRqo(readRqo('area_ontology', 'dd917') as never, context as never);
		expect(result.status).toBe(400);
		expect(result.body.result).toBe(false);
	});

	test('area_root with an area_ontology tipo (dd5) is refused (400)', async () => {
		const principal = await resolvePrincipal(-1);
		const context = contextFor(-1, 'root', true, principal);
		const result = await dispatchRqo(
			readRqo('area_root', AREA_ONTOLOGY_TIPO) as never,
			context as never,
		);
		expect(result.status).toBe(400);
		expect(result.body.result).toBe(false);
	});
});

describe('area-write refusal (areas hold no data)', () => {
	const AREA = 'dd242'; // area_root

	test('save addressed at an area is refused', async () => {
		const principal = await resolvePrincipal(-1);
		const context = contextFor(-1, 'root', true, principal);
		const rqo = {
			action: 'save',
			dd_api: 'dd_core_api',
			source: { model: 'area_root', tipo: AREA, section_tipo: AREA, section_id: 1 },
			data: { changed_data: [] },
		};
		const result = await dispatchRqo(rqo as never, context as never);
		expect(result.status).toBe(400);
		expect(result.body.result).toBe(false);
	});

	test('create addressed at an area is refused', async () => {
		const principal = await resolvePrincipal(-1);
		const context = contextFor(-1, 'root', true, principal);
		const rqo = {
			action: 'create',
			dd_api: 'dd_core_api',
			source: { model: 'area_root', section_tipo: AREA },
		};
		const result = await dispatchRqo(rqo as never, context as never);
		expect(result.status).toBe(400);
		expect(result.body.result).toBe(false);
	});

	test('delete addressed at an area is refused', async () => {
		const principal = await resolvePrincipal(-1);
		const context = contextFor(-1, 'root', true, principal);
		const rqo = {
			action: 'delete',
			dd_api: 'dd_core_api',
			source: { model: 'area_root', section_tipo: AREA, section_id: 1 },
		};
		const result = await dispatchRqo(rqo as never, context as never);
		expect(result.status).toBe(400);
		expect(result.body.result).toBe(false);
	});
});

describe('menu hides area_ontology from non-superusers', () => {
	test('superuser menu contains dd5; non-admin menu does not', async () => {
		const superuserMenu = await getMenuTreeDatalist();
		const nonAdminMenu = await getMenuTreeDatalist({
			userId: NON_ADMIN_USER,
			isGlobalAdmin: false,
			isDeveloper: false,
		});
		const hasOntology = (menu: { tree_datalist: { tipo: string }[] }): boolean =>
			menu.tree_datalist.some((node) => node.tipo === AREA_ONTOLOGY_TIPO);
		expect(hasOntology(superuserMenu)).toBe(true);
		expect(hasOntology(nonAdminMenu)).toBe(false);
	});
});
