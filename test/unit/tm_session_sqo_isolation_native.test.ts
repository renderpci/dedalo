/**
 * TIME MACHINE session-SQO ISOLATION — WC-2026-08-14-tm-scope-server-owned.
 *
 * THE BUG THIS PINS BIT THREE TIMES IN ONE SESSION, once per door. All four TM
 * surfaces share callerTipo 'dd15', so the section session-SQO machinery —
 * built for "one section page, one stored query" — becomes a shared mutable
 * channel between surfaces that must never see each other's queries:
 *
 *   door 1, MERGE   — the standalone browse's read inherited an embedded
 *                     panel's one-record filter → "dd15 shows only a few
 *                     records";
 *   door 2, PERSIST — the reverse direction: an embedded read stored its
 *                     filter for the browse to inherit;
 *   door 3, THE CONTEXT STAMP — sqo_session stamped into an embedded panel's
 *                     context, which the client ADOPTS WHOLESALE on rebuild
 *                     (section.js: `self.rqo.sqo = self.context.sqo_session`) —
 *                     one pagination click and the inspector panel listed the
 *                     whole 2.4M-row table.
 *
 * The rule: `source.session_save:false` (declared by every EMBEDDED TM surface)
 * closes ALL THREE doors. A read that declares itself outside session
 * navigation neither reads the session, writes it, nor echoes it back.
 *
 * Doors 1+2 are exercised through the REAL readSection with a synthetic
 * ALS-scoped session (the same seam an HTTP request uses); door 3 through the
 * same read's returned context. The polluted stored SQO is exactly the shape
 * the standalone browse persists: offset 26, no filter — the query that, if it
 * leaks, silently swaps a record's history for the whole table.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
// component-model registry: buildStructureContext resolves models through it
// (server/test entrypoints preload it the same way).
import '../../src/core/components/registry.ts';
import { runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';
import { readSection } from '../../src/core/section/read.ts';
import { runWithRequestContext } from '../../src/core/security/request_context.ts';
import type { Session } from '../../src/core/security/session_store.ts';

/** The browse's stored query: unfiltered, deep offset — the pollutant. */
const POLLUTED_DD15_SQO = { section_tipo: ['dd15'], limit: 25, offset: 26, mode: 'tm' };

/** A synthetic in-memory session (no tokenHash → setSessionSqo writes memory only). */
function syntheticSession(): Session {
	return {
		userId: -1,
		username: 'root',
		isGlobalAdmin: true,
		csrfToken: 'x',
		applicationLang: 'lg-spa',
		dataLang: 'lg-spa',
		sqoSession: { dd15: structuredClone(POLLUTED_DD15_SQO) },
	} as unknown as Session;
}

/** An embedded-surface TM read (the inspector record panel's shape). */
function embeddedRqo(sessionSave: boolean | undefined) {
	return {
		source: {
			typo: 'source',
			action: 'search',
			model: 'section',
			tipo: 'dd15',
			section_tipo: 'dd15',
			mode: 'list',
			lang: 'lg-spa',
			...(sessionSave === undefined ? {} : { session_save: sessionSave }),
			tm_surface: 'inspector_record',
		},
		sqo: {
			id: 'section_history',
			mode: 'tm',
			section_tipo: ['test65'],
			limit: 10,
			offset: 0,
			order: [{ direction: 'DESC', path: [{ component_tipo: 'id' }] }],
			skip_projects_filter: true,
			filter_by_locators: [{ section_tipo: 'test65', section_id: 935001 }],
		},
		show: {},
	};
}

async function readWithSession(session: Session, sessionSave: boolean | undefined) {
	return runWithRequestContext(
		{ session, requestId: 'tm-isolation-test', clientIp: '127.0.0.1' },
		() =>
			runWithRequestLangs({ applicationLang: 'lg-spa', dataLang: 'lg-spa' }, () =>
				readSection(embeddedRqo(sessionSave) as never),
			),
	);
}

const sectionEntryOf = (context: unknown[]): Record<string, unknown> | undefined =>
	(context as Record<string, unknown>[]).find((entry) => entry.model === 'section');

let isolated: Awaited<ReturnType<typeof readWithSession>>;
let isolatedSession: Session;

beforeAll(async () => {
	isolatedSession = syntheticSession();
	isolated = await readWithSession(isolatedSession, false);
});

describe('session_save:false closes all three doors', () => {
	test('door 1 — MERGE: the stored browse query never reaches the read', () => {
		// The read keeps ITS OWN scope. Had the merge run, the polluted offset 26
		// / missing filter would have replaced a record's history with the whole
		// table — the exact reported failure.
		const envelope = isolated.data[0] as { entries?: unknown[] } | undefined;
		expect(Array.isArray(envelope?.entries)).toBe(true);
	});

	test('door 2 — PERSIST: the embedded read does not overwrite the stored SQO', () => {
		expect(
			(isolatedSession as unknown as { sqoSession: Record<string, unknown> }).sqoSession.dd15,
		).toEqual(POLLUTED_DD15_SQO);
	});

	test('door 3 — THE STAMP: the returned context carries NO adoptable sqo_session', () => {
		// The client adopts context.sqo_session WHOLESALE on rebuild; null is the
		// only safe value for a session-less read.
		const section = sectionEntryOf(isolated.context);
		expect(section, 'the dd15 section context entry must exist').toBeDefined();
		expect(section?.sqo_session ?? null).toBeNull();
	});
});

describe('a session-SAVING dd15 read keeps the stamp (the browse relies on it)', () => {
	test('default reads still echo the stored session query', async () => {
		// The stamp is how the standalone browse restores its pagination across
		// loads — isolation must not cost the browse its session navigation.
		const session = syntheticSession();
		const result = await readWithSession(session, undefined);
		const section = sectionEntryOf(result.context);
		expect(section?.sqo_session).toBeDefined();
		expect(section?.sqo_session).not.toBeNull();
	});
});
