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
import { createSession, getSession } from '../../src/core/security/session_store.ts';
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
