/**
 * WC-079 DOOR gate — the scratch store through the REAL wiring.
 *
 * temporal_scratch_store.test.ts drives the store's own API against an
 * injectable scratch table. That proves the store works; it proves NOTHING
 * about whether the door is wired to it. Every assertion there would still pass
 * if `persistTemporalScratch` were never called and the read never grafted.
 *
 * This file closes that gap: it goes through `dispatchRqo`, against the REAL
 * table, and asserts the behaviours a user would notice —
 *   - a scoped save survives and comes back on a later read;
 *   - an UNSCOPED temporal save persists nothing (the contract that keeps the
 *     propagate tool and the text_area pickers on their old behaviour);
 *   - an empty scratch still emits an ITEM (the empty-set trap, the highest-risk
 *     regression in the change: expandPortal emits nothing for an empty locator
 *     set, and a missing item leaves the widget with no entries array at all);
 *   - one user cannot see another's scratch through the door;
 *   - a temporal element ships NO component toolbar.
 *
 * Rows are written under a test-only scope and torn down in afterAll.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { clearTemporalScratch } from '../../src/core/section/record/temporal_store.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';

const SECTION = 'test3';
const LITERAL = 'test52';
const PORTAL = 'test80';
const SENTINEL_ID = 1;
const SCOPE = 'tool_scratch_door_test';
const OTHER_USER = -424242;

let tsContext: Record<string, unknown>;

let hasDb = false;
try {
	await sql`SELECT 1`;
	hasDb = true;
} catch {
	console.warn('[temporal_scratch_door] DB unavailable — door drives SKIPPED');
}
const testIfDb = test.if(hasDb);

beforeAll(async () => {
	if (!hasDb) return;
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	tsContext = {
		requestId: 'temporal_scratch_door',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	};
	await clearTemporalScratch(-1, SCOPE);
	await clearTemporalScratch(OTHER_USER, SCOPE);
});

afterAll(async () => {
	if (!hasDb) return;
	await clearTemporalScratch(-1, SCOPE);
	await clearTemporalScratch(OTHER_USER, SCOPE);
});

/** A temporal source; `scope` omitted reproduces the other four producers. */
const source = (over: Record<string, unknown> = {}) => ({
	model: 'component_input_text',
	tipo: LITERAL,
	section_tipo: SECTION,
	section_id: SENTINEL_ID,
	mode: 'edit',
	lang: 'lg-eng',
	is_temporal: true,
	...over,
});

const save = (src: Record<string, unknown>, value: unknown[]) =>
	dispatchRqo(
		{
			action: 'save',
			dd_api: 'dd_core_api',
			source: src,
			data: { changed_data: [{ action: 'set_data', id: null, value }], entries: value },
		} as unknown as Rqo,
		tsContext as never,
	);

const read = (src: Record<string, unknown>) =>
	dispatchRqo(
		{
			action: 'read',
			dd_api: 'dd_core_api',
			source: { ...src, action: 'get_data' },
		} as unknown as Rqo,
		tsContext as never,
	);

const itemOf = (response: { body: unknown }, tipo: string) =>
	((response.body as { result?: { data?: Record<string, unknown>[] } }).result?.data ?? []).find(
		(entry) => entry.tipo === tipo,
	);

describe('WC-079 door — a scoped temporal value survives, an unscoped one does not', () => {
	testIfDb('a SCOPED save comes back on a later read (the whole point)', async () => {
		const src = source({ temporal_scope: SCOPE, tipo: LITERAL });
		await save(src, [{ lang: 'lg-eng', value: 'door round trip' }]);

		const after = await read(src);
		expect(after.status).toBe(200);
		const item = itemOf(after, LITERAL);
		expect(item).toBeDefined();
		expect(item?.entries).toEqual([
			expect.objectContaining({ lang: 'lg-eng', value: 'door round trip' }),
		]);
	});

	testIfDb(
		'an UNSCOPED temporal save persists NOTHING (the other-4-producers contract)',
		async () => {
			// This is what keeps tool_propagate_component_data and the two
			// component_text_area pickers on their pre-WC-079 behaviour. If this ever
			// fails, the propagate tool has started restoring stale values into a bulk
			// write across every SQO match.
			const unscoped = source({ tipo: LITERAL, section_tipo: SECTION });
			await save(unscoped, [{ lang: 'lg-eng', value: 'must not persist' }]);

			const after = await read(unscoped);
			const item = itemOf(after, LITERAL);
			expect(item).toBeDefined();
			expect(item?.entries).toEqual([]);
			// And it must not have leaked into the scoped address either.
			const rows = (await sql.unsafe(
				`SELECT count(*)::int AS n FROM dedalo_ts_temporal_scratch
			 WHERE user_id = $1 AND scope = $2 AND component_tipo = $3`,
				[-1, SCOPE, LITERAL],
			)) as { n: number }[];
			// (the scoped test above wrote exactly one row for this component)
			expect(rows[0]?.n).toBeLessThanOrEqual(1);
		},
	);
});

describe('WC-079 door — the EMPTY-SET trap (the highest-risk regression)', () => {
	// expandPortal returns early on an empty locator set and emits NO data item;
	// the client then does `self.data = data || {}` and the widget has no entries
	// array at all — unrecoverable, because nothing can be picked and so no save
	// echo ever arrives. A scoped portal with NO scratch row must still emit the
	// bare item. If someone "simplifies" the length>0 guard in read.ts, this fails.
	testIfDb('a scoped PORTAL with no scratch row still emits an item with entries: []', async () => {
		const src = source({ model: 'component_portal', tipo: PORTAL, temporal_scope: SCOPE });
		await clearTemporalScratch(-1, SCOPE);

		const after = await read(src);
		expect(after.status).toBe(200);
		const item = itemOf(after, PORTAL);
		expect(
			item,
			'a temporal portal must ALWAYS emit an item, even with nothing staged',
		).toBeDefined();
		expect(item?.entries).toEqual([]);
		expect(String(item?.section_id)).toBe(String(SENTINEL_ID));
	});

	testIfDb(
		'a scoped LITERAL with no scratch row still emits an item with entries: []',
		async () => {
			const src = source({ tipo: LITERAL, temporal_scope: SCOPE });
			await clearTemporalScratch(-1, SCOPE);
			const item = itemOf(await read(src), LITERAL);
			expect(item).toBeDefined();
			expect(item?.entries).toEqual([]);
		},
	);
});

describe('WC-079 door — isolation through the door', () => {
	testIfDb('another user’s scratch is invisible at the same address', async () => {
		const src = source({ tipo: LITERAL, temporal_scope: SCOPE });
		// Seed a row for a DIFFERENT user at the address this session reads.
		const { writeTemporalScratch, temporalScratchAddress } = await import(
			'../../src/core/section/record/temporal_store.ts'
		);
		const address = temporalScratchAddress(src as never);
		expect(address).not.toBeNull();
		await clearTemporalScratch(-1, SCOPE);
		await writeTemporalScratch(OTHER_USER, address as never, [
			{ lang: 'lg-eng', value: 'OTHER USER PRIVATE' },
		]);

		const body = JSON.stringify((await read(src)).body);
		expect(body).not.toContain('OTHER USER PRIVATE');
		expect(itemOf(await read(src), LITERAL)?.entries).toEqual([]);
	});
});

describe('WC-079 door — a temporal element ships no component toolbar', () => {
	testIfDb('the temporal context carries tools: []', async () => {
		const response = await read(source({ tipo: LITERAL, temporal_scope: SCOPE }));
		const context = (response.body as { result?: { context?: Record<string, unknown>[] } }).result
			?.context;
		const entry = (context ?? []).find((c) => c.tipo === LITERAL);
		expect(entry, 'the component context must be present to assert on it').toBeDefined();
		expect(entry?.tools).toEqual([]);
	});

	testIfDb('the SAME component NON-temporally still gets its toolbar (the control)', async () => {
		// Without this half, `tools: []` could mean "suppression works" or "this
		// component never had tools" — and the assertion above would prove nothing.
		const response = await read({
			model: 'component_input_text',
			tipo: LITERAL,
			section_tipo: SECTION,
			section_id: SENTINEL_ID,
			mode: 'edit',
			lang: 'lg-eng',
		});
		const context = (response.body as { result?: { context?: Record<string, unknown>[] } }).result
			?.context;
		const entry = (context ?? []).find((c) => c.tipo === LITERAL);
		expect(entry).toBeDefined();
		expect((entry?.tools as unknown[])?.length).toBeGreaterThan(0);
	});
});
