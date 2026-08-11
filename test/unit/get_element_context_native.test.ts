/**
 * `dd_core_api.get_element_context` — one element's structure context
 * (plan item 4.2.7, comp 18, CRAP 329).
 *
 * WHY THIS FILE EXISTS. The handler is a DISCLOSURE door with two independent
 * authorization arms, and both were ungated:
 *
 *   1. the TOOL branch answers BEFORE any permission call, gated only by
 *      `getUserTools`. Delete that check and the endpoint hands the full tool
 *      context (labels, properties, developer, url) to any logged-in user.
 *   2. the ELEMENT branch checks `getPermissions(principal, sectionTipo, tipo)`
 *      where `sectionTipo = source.section_tipo ?? tipo`. That default is
 *      load-bearing: check the WRONG PAIR and a grant on one section
 *      authorises reading an element of another. The bug is INVISIBLE when both
 *      tipos are the same, so the fixture must grant on one and not the other —
 *      which is exactly what `test/helpers/acl_identity_fixture.ts` mints
 *      (non-admin: `test3` yes, `dd88` no; admin: both).
 *
 * ANTI-VACUITY. Every refusal here is paired with the identity that IS allowed
 * to do the same thing. A 403-everything handler, or one that error-envelopes
 * every call, fails this file. The first test re-asserts that the fixture's
 * contrast is non-degenerate, so a degraded fixture cannot turn the pairs into
 * zero-versus-zero.
 *
 * NO SCRATCH RECORDS. Every input is an installed ontology node (`test3`,
 * `dd88`, `dd151`) or a registered tool row; the handler is read-only and this
 * file writes nothing but the shared ACL fixture (swept by its own helper).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { getPermissions, resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import {
	ACL_ADMIN_USER_ID,
	ACL_NON_ADMIN_USER_ID,
	installAclIdentityFixture,
	removeAclIdentityFixture,
} from '../helpers/acl_identity_fixture.ts';
import { DB_READY } from '../helpers/db_ready.ts';

/** The section the non-admin holds a read grant on. */
const GRANTED_SECTION = 'test3';
/**
 * dd88 (maintenance) — model `area_maintenance`, granted at 2 to the fixture
 * ADMIN and refused to the non-admin. It is also TRANSLATABLE, so its context
 * entry echoes the request lang: the one element family where the handler's
 * `source.lang` default is observable on the wire.
 */
const ADMIN_ONLY_AREA = 'dd88';
/** dd151 — a `relation_type` node: a real tipo the generic builder cannot build. */
const UNCOVERED_MODEL_TIPO = 'dd151';
/** Its model, which the 400 must NAME. */
const UNCOVERED_MODEL = 'relation_type';
/** A registered tool the fixture non-admin's profile does NOT grant. */
const RESTRICTED_TOOL = 'tool_export';
/** A registered `always_active` tool — authorized for BOTH identities. */
const ALWAYS_ACTIVE_TOOL = 'tool_user_admin';
/** The hardcoded default in `source.lang ?? 'lg-spa'`. */
const DEFAULT_LANG = 'lg-spa';

function contextFor(userId: number, isGlobalAdmin: boolean, principal: unknown) {
	const token = createSession(userId, `zzcnt_${userId}`, isGlobalAdmin);
	const session = getSession(token);
	return {
		requestId: 'zzcnt',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	};
}

function elementRqo(source: Record<string, unknown>) {
	return { action: 'get_element_context', dd_api: 'dd_core_api', source };
}

function entriesOf(body: Record<string, unknown>): Record<string, unknown>[] {
	return body.result as Record<string, unknown>[];
}

describe.if(DB_READY)('dd_core_api.get_element_context', () => {
	let adminContext: unknown;
	let nonAdminContext: unknown;

	beforeAll(async () => {
		await installAclIdentityFixture();
		adminContext = contextFor(ACL_ADMIN_USER_ID, true, await resolvePrincipal(ACL_ADMIN_USER_ID));
		nonAdminContext = contextFor(
			ACL_NON_ADMIN_USER_ID,
			false,
			await resolvePrincipal(ACL_NON_ADMIN_USER_ID),
		);
	});

	afterAll(removeAclIdentityFixture);

	test('the contrast is live (guards every pair below)', async () => {
		const admin = await resolvePrincipal(ACL_ADMIN_USER_ID);
		const nonAdmin = await resolvePrincipal(ACL_NON_ADMIN_USER_ID);
		expect(admin.isGlobalAdmin).toBe(true);
		expect(nonAdmin.isGlobalAdmin).toBe(false);
		// The non-admin reads test3 and NOT dd88; the admin reads both. Without
		// this split the wrong-pair case below is unobservable.
		expect(await getPermissions(nonAdmin, GRANTED_SECTION, GRANTED_SECTION)).toBeGreaterThanOrEqual(
			1,
		);
		expect(await getPermissions(nonAdmin, ADMIN_ONLY_AREA, ADMIN_ONLY_AREA)).toBe(0);
		expect(await getPermissions(admin, ADMIN_ONLY_AREA, ADMIN_ONLY_AREA)).toBeGreaterThanOrEqual(1);
	});

	describe('the tool branch', () => {
		test('an AUTHORIZED tool returns its context; the same tool is 403 for a user without it', async () => {
			// POSITIVE CONTROL FIRST — a handler that refuses everything must fail.
			const allowed = await dispatchRqo(
				elementRqo({ model: RESTRICTED_TOOL }) as never,
				adminContext as never,
			);
			expect(allowed.status).toBe(200);
			const [toolContext] = entriesOf(allowed.body);
			expect(toolContext).toBeDefined();
			expect(toolContext?.model).toBe(RESTRICTED_TOOL);
			expect(toolContext?.type).toBe('tool');

			const refused = await dispatchRqo(
				elementRqo({ model: RESTRICTED_TOOL }) as never,
				nonAdminContext as never,
			);
			expect(refused.status).toBe(403);
			expect(refused.body.result).toBe(false);
			expect(refused.body.msg).toBe('Tool not authorized for current user');
		});

		test('an always_active tool IS authorized for the non-admin (the check is per-tool, not per-role)', async () => {
			const result = await dispatchRqo(
				elementRqo({ model: ALWAYS_ACTIVE_TOOL }) as never,
				nonAdminContext as never,
			);
			expect(result.status).toBe(200);
			expect(entriesOf(result.body)[0]?.model).toBe(ALWAYS_ACTIVE_TOOL);
		});
	});

	describe('input contract', () => {
		test('a missing source.tipo is a named 400', async () => {
			const result = await dispatchRqo(elementRqo({}) as never, adminContext as never);
			expect(result.status).toBe(400);
			expect(result.body.result).toBe(false);
			expect(result.body.msg).toBe('get_element_context: source.tipo is required');
		});

		test('an uncovered model is a 400 that NAMES the model (never a 500)', async () => {
			const result = await dispatchRqo(
				elementRqo({ tipo: UNCOVERED_MODEL_TIPO }) as never,
				adminContext as never,
			);
			expect(result.status).toBe(400);
			expect(result.body.msg).toBe(
				`get_element_context: model '${UNCOVERED_MODEL}' not implemented (section/component/area only)`,
			);
		});
	});

	describe('the permission is checked on the (section_tipo, tipo) PAIR', () => {
		test('an omitted source.section_tipo defaults to the tipo — the grant on test3 authorises test3', async () => {
			const result = await dispatchRqo(
				elementRqo({ tipo: GRANTED_SECTION }) as never,
				nonAdminContext as never,
			);
			// Drop the `?? tipo` default and the pair becomes (undefined, test3):
			// a grant nobody holds, and this 200 turns into a 403.
			expect(result.status).toBe(200);
			const [entry] = entriesOf(result.body);
			expect(entry?.tipo).toBe(GRANTED_SECTION);
			expect(entry?.section_tipo).toBe(GRANTED_SECTION);
			// The resolved level rides on the entry — the grant is the fixture's 1.
			expect(entry?.permissions).toBe(1);
		});

		test('a SUPPLIED section_tipo is honoured: the test3 grant does NOT authorise (dd88, test3)', async () => {
			const result = await dispatchRqo(
				elementRqo({ tipo: GRANTED_SECTION, section_tipo: ADMIN_ONLY_AREA }) as never,
				nonAdminContext as never,
			);
			// Ignoring source.section_tipo (checking (tipo, tipo) instead) makes
			// this 200: a grant on one section reading an element of another.
			expect(result.status).toBe(403);
			expect(result.body.msg).toBe('Insufficient permissions to read');
		});

		test('permission level 0 is 403 — and the identity holding the grant gets 200', async () => {
			const refused = await dispatchRqo(
				elementRqo({ tipo: ADMIN_ONLY_AREA }) as never,
				nonAdminContext as never,
			);
			expect(refused.status).toBe(403);
			expect(refused.body.result).toBe(false);
			expect(refused.body.msg).toBe('Insufficient permissions to read');

			const allowed = await dispatchRqo(
				elementRqo({ tipo: ADMIN_ONLY_AREA }) as never,
				adminContext as never,
			);
			expect(allowed.status).toBe(200);
			expect(entriesOf(allowed.body)[0]?.tipo).toBe(ADMIN_ONLY_AREA);
		});
	});

	test("source.lang defaults to 'lg-spa' and an explicit lang overrides it", async () => {
		// dd88 is an AREA and translatable, so buildStructureContext stamps the
		// request lang verbatim instead of forcing lg-nolan — the only place this
		// hardcoded default is visible on the wire.
		const defaulted = await dispatchRqo(
			elementRqo({ tipo: ADMIN_ONLY_AREA }) as never,
			adminContext as never,
		);
		expect(defaulted.status).toBe(200);
		expect(entriesOf(defaulted.body)[0]?.lang).toBe(DEFAULT_LANG);

		const explicit = await dispatchRqo(
			elementRqo({ tipo: ADMIN_ONLY_AREA, lang: 'lg-eng' }) as never,
			adminContext as never,
		);
		expect(entriesOf(explicit.body)[0]?.lang).toBe('lg-eng');
	});

	test('source.mode rides through to the built entry (default list)', async () => {
		const listMode = await dispatchRqo(
			elementRqo({ tipo: GRANTED_SECTION }) as never,
			nonAdminContext as never,
		);
		expect(entriesOf(listMode.body)[0]?.mode).toBe('list');
		const editMode = await dispatchRqo(
			elementRqo({ tipo: GRANTED_SECTION, mode: 'edit' }) as never,
			nonAdminContext as never,
		);
		expect(entriesOf(editMode.body)[0]?.mode).toBe('edit');
	});
});
