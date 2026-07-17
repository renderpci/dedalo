/**
 * sqo_session — the section navigation SQO persisted per session (PHP
 * $_SESSION['dedalo']['config']['sqo'], write sites dd_core_api :2276-98,
 * per-call context stamp class.common.php:1695-98, sqo_id =
 * section::build_sqo_id = the caller tipo).
 *
 * Pins: (1) a section LIST read stores its resolved sqo on the session AND
 * the SAME response's section context carries it as `sqo_session` (PHP
 * stores before resolving context); (2) the store survives a fresh
 * getSession (sqlite round-trip); (3) source.session_save=false opts out;
 * (4) component-source reads never store; (5) sessions are isolated.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession, setSessionSqo } from '../../src/core/security/session_store.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

const SECTION = 'numisdata4';

let dbReady = false;
beforeAll(async () => {
	try {
		await sql`SELECT 1`;
		dbReady = true;
	} catch {
		dbReady = false;
	}
});

function readRqo(sessionSave: boolean | undefined): Rqo {
	return {
		id: 'sqo_session_test',
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		options: {},
		source: {
			typo: 'source',
			type: 'section',
			action: 'read',
			model: 'section',
			tipo: SECTION,
			section_tipo: SECTION,
			mode: 'list',
			lang: 'lg-spa',
			...(sessionSave === undefined ? {} : { session_save: sessionSave }),
		},
		show: { ddo_map: [], fields_separator: ' | ', columns: [] },
		sqo: { id: 'tmp', section_tipo: [SECTION], limit: 7, offset: 0 },
	} as unknown as Rqo;
}

async function dispatchWith(token: string, rqo: Rqo) {
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	const context = {
		requestId: 'sqo_session_test',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	};
	return { dispatched: await dispatchRqo(rqo, context), session };
}

describe('sqo_session store + context stamp', () => {
	test('a section list read stores the sqo AND stamps it on the SAME response context', async () => {
		if (!dbReady) return;
		const token = createSession(-1, 'root', true);
		const { dispatched, session } = await dispatchWith(token, readRqo(undefined));
		expect(dispatched.status).toBe(200);
		// In-memory store updated (same-request visibility).
		const stored = session?.sqoSession?.[SECTION] as { limit?: number } | undefined;
		expect(stored?.limit).toBe(7);
		// The response's SECTION context entry carries the stamp.
		const context = (dispatched.body as { result: { context: Record<string, unknown>[] } }).result
			.context;
		const sectionEntry = context.find(
			(entry) => entry.tipo === SECTION && entry.model === 'section',
		);
		expect((sectionEntry?.sqo_session as { limit?: number } | null)?.limit).toBe(7);
		// Sqlite round-trip: a FRESH session load sees the stored sqo.
		const reloaded = getSession(token);
		expect((reloaded?.sqoSession?.[SECTION] as { limit?: number } | undefined)?.limit).toBe(7);
	});

	test('session_save=false opts out (secondary windows never clobber navigation)', async () => {
		if (!dbReady) return;
		const token = createSession(-1, 'root', true);
		await dispatchWith(token, readRqo(false));
		const reloaded = getSession(token);
		expect(reloaded?.sqoSession?.[SECTION]).toBeUndefined();
	});

	test('sessions are isolated: one session’s navigation never leaks into another', async () => {
		if (!dbReady) return;
		const tokenA = createSession(-1, 'root', true);
		const tokenB = createSession(-1, 'root', true);
		await dispatchWith(tokenA, readRqo(undefined));
		expect(getSession(tokenA)?.sqoSession?.[SECTION]).toBeDefined();
		expect(getSession(tokenB)?.sqoSession?.[SECTION]).toBeUndefined();
	});

	// Read-back merge (PHP dd_core_api :2159-2199 "received case"): the
	// client's open_records_in_window stores a section_id filter via a dummy
	// build, then opens a PLAIN url — the new window's filter-less first read
	// must inherit that filter from the session or it shows the FULL section
	// (the relation_list_header / open-with-direct-relations bug).
	test('a stored session filter is applied to a filter-less read (secondary-window open)', async () => {
		if (!dbReady) return;
		const token = createSession(-1, 'root', true);
		// Discover real ids to filter on.
		const { dispatched: probe } = await dispatchWith(token, readRqo(undefined));
		const probeData = (
			probe.body as { result: { data: Record<string, unknown>[] } }
		).result.data.find((el) => el.typo === 'sections' && el.tipo === SECTION);
		const probeEntries = (probeData?.entries ?? []) as { section_id: unknown }[];
		expect(probeEntries.length).toBeGreaterThan(1);
		const targetIds = probeEntries.slice(0, 2).map((entry) => String(entry.section_id));
		// Seed the session exactly as the opener's dummy build would (the
		// client util.js open_records_in_window filter shape, csv id list).
		const session = getSession(token);
		setSessionSqo(session as NonNullable<typeof session>, SECTION, {
			section_tipo: [SECTION],
			limit: 1,
			offset: 0,
			filter: {
				$and: [
					{
						q: [targetIds.join(',')],
						path: [
							{
								section_tipo: SECTION,
								component_tipo: 'section_id',
								model: 'component_section_id',
								name: 'Id',
							},
						],
					},
				],
			},
		});
		// The new window's first load: sqo present but NO filter property.
		const { dispatched } = await dispatchWith(token, readRqo(undefined));
		expect(dispatched.status).toBe(200);
		const body = dispatched.body as {
			result: { context: Record<string, unknown>[]; data: Record<string, unknown>[] };
		};
		const data = body.result.data.find((el) => el.typo === 'sections' && el.tipo === SECTION);
		const entries = (data?.entries ?? []) as { section_id: unknown }[];
		expect(entries.map((entry) => String(entry.section_id)).sort()).toEqual(targetIds.sort());
		// The same response's context echoes the MERGED sqo (client resyncs on it).
		const sectionEntry = body.result.context.find(
			(entry) => entry.tipo === SECTION && entry.model === 'section',
		);
		expect((sectionEntry?.sqo_session as { filter?: unknown } | null)?.filter).toBeDefined();
	});

	test('session_save=false never inherits the stored filter (search-exact contract)', async () => {
		if (!dbReady) return;
		const token = createSession(-1, 'root', true);
		const session = getSession(token);
		setSessionSqo(session as NonNullable<typeof session>, SECTION, {
			section_tipo: [SECTION],
			filter: {
				$and: [
					{
						q: ['999999999'],
						path: [
							{
								section_tipo: SECTION,
								component_tipo: 'section_id',
								model: 'component_section_id',
								name: 'Id',
							},
						],
					},
				],
			},
		});
		const { dispatched } = await dispatchWith(token, readRqo(false));
		const body = dispatched.body as { result: { data: Record<string, unknown>[] } };
		const data = body.result.data.find((el) => el.typo === 'sections' && el.tipo === SECTION);
		const entries = (data?.entries ?? []) as unknown[];
		// The impossible-id filter was NOT merged: the read returns rows.
		expect(entries.length).toBeGreaterThan(0);
	});

	test('a section context WITHOUT a stored sqo stamps sqo_session: null (PHP shape)', async () => {
		if (!dbReady) return;
		const token = createSession(-1, 'root', true);
		// session_save=false → nothing stored → the stamp is null, key present.
		const { dispatched } = await dispatchWith(token, readRqo(false));
		const context = (dispatched.body as { result: { context: Record<string, unknown>[] } }).result
			.context;
		const sectionEntry = context.find(
			(entry) => entry.tipo === SECTION && entry.model === 'section',
		);
		expect(sectionEntry).toBeDefined();
		expect('sqo_session' in (sectionEntry as object)).toBe(true);
		expect(sectionEntry?.sqo_session).toBeNull();
	});
});
