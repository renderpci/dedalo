/**
 * Search-mode portal link (link_record) on a CONSULTATION-ONLY section — the
 * dd543 "Who" portal of Activity (dd542). Reported 2026-07-17: picking a Who
 * value in search threw a 500 ("Throwable Exception … createSectionRecord:
 * section 'dd542' is consultation-only"). The search picker lands on a
 * client-minted synthetic id ('search_<n>') that is NOT a matrix row — the
 * value is a search FILTER, never a persisted relation — so the save must
 * RESOLVE + ECHO the picked locator WITHOUT writing (which materializes the host
 * record and fails on read-only sections). This gate dispatches the exact client
 * save and asserts it succeeds with the picked target resolved.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { ApiRequestContext } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

const ACTIVITY = 'dd542'; // consultation-only
const WHO_PORTAL = 'dd543'; // component_portal → matrix_activity.relation
const USERS = 'dd128';
const ROOT_USER_ID = 1;

let ctx: ApiRequestContext;

beforeAll(async () => {
	const token = createSession(-1, 'root', true);
	registerSessionCleanup();
	const session = getSession(token);
	ctx = {
		requestId: 'search_portal_link_test',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal: await resolvePrincipal(-1),
	} as ApiRequestContext;
}, 60000);

function linkRqo(sectionId: string, locator: Record<string, unknown>): Rqo {
	return {
		action: 'save',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: {
			typo: 'source',
			type: 'component',
			model: 'component_portal',
			tipo: WHO_PORTAL,
			section_tipo: ACTIVITY,
			section_id: sectionId,
			mode: 'search',
			lang: 'lg-eng',
			action: null,
		},
		data: {
			section_id: sectionId,
			section_tipo: ACTIVITY,
			tipo: WHO_PORTAL,
			lang: 'lg-eng',
			from_component_tipo: WHO_PORTAL,
			changed_data: [{ action: 'insert', id: null, value: locator }],
		},
	} as unknown as Rqo;
}

describe('search-mode portal link on a read-only section (Activity dd542)', () => {
	test('link_record resolves + echoes the picked locator (no createSectionRecord throw)', async () => {
		const locator = {
			section_tipo: USERS,
			section_id: ROOT_USER_ID,
			from_component_tipo: WHO_PORTAL,
		};
		const { body } = await dispatchRqo(linkRqo('search_99', locator), ctx);
		const result = (body as { result?: unknown }).result as
			| { context?: unknown[]; data?: Record<string, unknown>[] }
			| false;

		// The old bug returned result:false with a Throwable; the fix returns an
		// echo envelope (context + data), never touching the read-only matrix.
		expect(result).not.toBe(false);
		expect(Array.isArray(result && result.context)).toBe(true);
		expect((result as { context: unknown[] }).context.length).toBeGreaterThan(0);

		// The Who component item carries the picked locator + the count the client's
		// link_record duplicate-check reads (pagination.total must exceed 0).
		const data = (result as { data: Record<string, unknown>[] }).data;
		const mainItem = data.find(
			(item) => item.tipo === WHO_PORTAL && String(item.section_id) === 'search_99',
		) as { entries?: unknown[]; pagination?: { total?: number } } | undefined;
		expect(mainItem).toBeDefined();
		expect(mainItem?.pagination?.total).toBe(1);
		expect(Array.isArray(mainItem?.entries)).toBe(true);
	});

	test('unlink (delete-only) echoes an empty set without writing', async () => {
		const rqo = linkRqo('search_99', {}) as unknown as {
			data: { changed_data: { action: string; value: unknown }[] };
		};
		rqo.data.changed_data = [{ action: 'delete', value: { section_tipo: USERS, section_id: 1 } }];
		const { body } = await dispatchRqo(rqo as unknown as Rqo, ctx);
		const result = (body as { result?: unknown }).result as
			| { data?: Record<string, unknown>[] }
			| false;
		expect(result).not.toBe(false);
		const mainItem = (result as { data: Record<string, unknown>[] }).data.find(
			(item) => item.tipo === WHO_PORTAL,
		) as { pagination?: { total?: number } } | undefined;
		expect(mainItem?.pagination?.total).toBe(0);
	});
});
