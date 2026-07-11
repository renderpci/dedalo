/**
 * A SECTION's LIST defaults (page size + sort) are applied SERVER-SIDE when the
 * client omits them — PHP parity (resolve_pagination_defaults + the
 * request_config sqo.order, applied to the search). The byte-identical client's
 * first list load fires with a pre-context minimal sqo (no limit, NO order), so
 * without this the Activity grid (dd542 → dd549 config) would fall back to the
 * global 10-row / section_id-ASC default.
 *
 * These read the CONFIG then assert it is APPLIED (rather than hard-coding a
 * page size / direction), so they survive an admin re-tuning dd549's values.
 */

import { describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { deriveSectionListSqoDefaults } from '../../src/core/section/read.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';

const ACTIVITY = 'dd542';

/** direction of the first order clause, tolerating the object OR array shape. */
function orderDirection(order: unknown): string | undefined {
	const clause = Array.isArray(order) ? order[0] : order;
	return (clause as { direction?: string } | undefined)?.direction?.toUpperCase();
}

async function firstLoadIds(): Promise<number[]> {
	const session = getSession(createSession(-1, 'root', true));
	const principal = await resolvePrincipal(-1);
	// EXACTLY what the client sends on first list paint: no limit, no order.
	const res = await dispatchRqo(
		{
			action: 'read',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			options: {},
			source: {
				typo: 'source',
				model: 'section',
				tipo: ACTIVITY,
				section_tipo: ACTIVITY,
				action: 'search',
				mode: 'list',
				lang: 'lg-spa',
			},
			sqo: { section_tipo: [ACTIVITY] },
		} as never,
		{
			requestId: 't',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		} as never,
	);
	const data = (res.body as { result?: { data?: unknown[] } }).result?.data ?? [];
	const entries = ((data[0] as { entries?: { section_id?: unknown }[] })?.entries ?? []) as {
		section_id?: unknown;
	}[];
	return entries.map((e) => Number(e.section_id));
}

describe('section list defaults applied server-side (dd542 Activity)', () => {
	test('Activity declares a custom list config (page size + descending sort)', async () => {
		const defaults = await deriveSectionListSqoDefaults(ACTIVITY, ACTIVITY, 'list');
		expect(typeof defaults.limit).toBe('number');
		expect(defaults.limit as number).toBeGreaterThan(0);
		expect(defaults.order).toBeDefined();
		expect(orderDirection(defaults.order)).toBe('DESC');
	});

	test('a first (client-default) load applies that page size and descending order', async () => {
		const defaults = await deriveSectionListSqoDefaults(ACTIVITY, ACTIVITY, 'list');
		expect(typeof defaults.limit).toBe('number');
		const limit = defaults.limit as number;
		const ids = await firstLoadIds();
		// Configured page size, not the global maxRowsPerPage (10).
		expect(ids.length).toBe(limit);
		// Configured descending sort, not the global section_id ASC default. The
		// activity log is append-only so section_id tracks insertion order.
		const descending = [...ids].sort((a, b) => b - a);
		expect(ids).toEqual(descending);
		// Newest first (guards against an accidental ASC regression on a full page).
		expect(limit).toBeGreaterThan(0);
		expect(ids[0] as number).toBeGreaterThan(ids[ids.length - 1] as number);
	});
});
