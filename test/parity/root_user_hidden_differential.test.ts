/**
 * Root-user hiding differential — the Users section (dd128) never serves the
 * root record (section_id -1) through list/count/pin on EITHER engine (PHP
 * search::build_main_where `section_id > 0`, core/search/trait.where.php:100-103;
 * TS buildSearchSql mirror), while resolve_data still resolves a stored -1
 * locator on both (PHP reaches -1 by design for label rendering — the activity
 * "who" chips). Read-only: no record is created or mutated.
 *
 * Vacuous-green guard: the direct SQL check that the -1 row physically exists
 * anchors every exclusion assertion — an empty users table could not fake these
 * greens. (The dd128 select-datalist include_negative parity is pinned white-box
 * in test/unit/root_user_hidden_tripwire.test.ts — the base ontology has no
 * select component targeting dd128 to compare over the wire.)
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { dropTestCorpus, ensureTestCorpus } from '../../src/core/test_data/test_corpus/ensure.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

/** A SEED-SHIPPED tipo, spelled out of the install-TLD census's token grammar. */
const seed = (tld: string, id: number): string => `${tld}${id}`;

/** The Users section — SEED-SHIPPED: every installation has it. */
const USERS = seed('dd', 128);

const LIST_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	options: {},
	source: {
		typo: 'source',
		model: 'section',
		tipo: USERS,
		section_tipo: USERS,
		action: 'search',
		mode: 'list',
		lang: 'lg-spa',
	},
	sqo: {
		section_tipo: [USERS],
		limit: 100,
		offset: 0,
		order: [{ direction: 'ASC', path: [{ component_tipo: 'section_id' }] }],
	},
};

const COUNT_RQO = {
	action: 'count',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	source: { model: 'section', tipo: USERS, mode: 'list' },
	sqo: { section_tipo: [USERS], limit: 10, offset: 0 },
};

const PIN_COUNT_RQO = {
	action: 'count',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	source: { model: 'section', tipo: USERS, mode: 'list' },
	sqo: {
		section_tipo: [USERS],
		filter_by_locators: [{ section_tipo: USERS, section_id: '-1' }],
		limit: 10,
		offset: 0,
	},
};

/** dd578 'Who' (dd15 Time Machine) — the autocomplete that renders user chips. */
const RESOLVE_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	options: {},
	source: {
		typo: 'source',
		model: 'component_autocomplete',
		tipo: 'dd578',
		section_tipo: 'dd15',
		section_id: null,
		mode: 'search',
		lang: 'lg-spa',
		action: 'resolve_data',
		value: [{ section_tipo: USERS, section_id: '-1', from_component_tipo: 'dd578' }],
	},
	sqo: { section_tipo: ['dd15'], limit: 10, offset: 0 },
};

async function tsCall(rqo: Record<string, unknown>): Promise<Record<string, unknown>> {
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	const outcome = await dispatchRqo(
		structuredClone(rqo) as unknown as Rqo,
		{
			requestId: 't',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		} as never,
	);
	expect(outcome.status).toBe(200);
	return outcome.body as Record<string, unknown>;
}

/** TS body — envelope v2: the payload lives under `data`. */
function tsDataOf(body: Record<string, unknown>): Record<string, unknown>[] {
	return ((body.data as { data?: unknown[] })?.data ?? []) as Record<string, unknown>[];
}

/** PHP oracle body — the frozen dd_manager envelope: payload under `result`. */
function phpDataOf(body: Record<string, unknown>): Record<string, unknown>[] {
	return ((body.result as { data?: unknown[] })?.data ?? []) as Record<string, unknown>[];
}

function rootItemsIn(data: Record<string, unknown>[]): Record<string, unknown>[] {
	return data.filter((item) => Number(item.section_id) === -1);
}

let php: PhpApiClient;

describe.if(hasPhpCredentials())('root user (dd128,-1) hidden differential', () => {
	beforeAll(async () => {
		// The users population comes from the COMMITTED corpus, never from
		// whatever the ambient database happens to hold.
		await ensureTestCorpus([USERS]);
		if (!hasPhpCredentials()) return;
		php = new PhpApiClient();
		await php.login(config.phpReference.username as string, config.phpReference.password as string);
	});

	afterAll(async () => {
		expect(await dropTestCorpus([USERS])).toBe(0);
	});

	test('the -1 row physically exists (anchor against vacuous greens)', async () => {
		const rows = (await sql`
			SELECT section_id FROM matrix_users WHERE section_tipo = ${USERS} AND section_id = -1
		`) as { section_id: number }[];
		expect(rows.length).toBe(1);
	});

	// Full list emission (portals, profile image) is slow on both engines.
	test('the users LIST excludes -1 on both engines (as root)', async () => {
		const tsData = tsDataOf(await tsCall(LIST_RQO));
		const phpData = phpDataOf(
			(await php.call(structuredClone(LIST_RQO) as Record<string, unknown>)).body as Record<
				string,
				unknown
			>,
		);
		expect(tsData.length).toBeGreaterThan(0); // real rows, not an empty read
		expect(phpData.length).toBeGreaterThan(0);
		expect(rootItemsIn(tsData)).toEqual([]);
		expect(rootItemsIn(phpData)).toEqual([]);
	}, 30000);

	test('the users COUNT matches PHP and equals the positive-id SQL truth', async () => {
		const tsTotal = ((await tsCall(COUNT_RQO)).data as { total: number }).total;
		const phpTotal = (
			(await php.call(structuredClone(COUNT_RQO) as Record<string, unknown>)).body.result as {
				total: number;
			}
		).total;
		const truth = (await sql`
			SELECT count(DISTINCT section_id)::int AS n FROM matrix_users
			WHERE section_tipo = ${USERS} AND section_id > 0
		`) as { n: number }[];
		expect(tsTotal).toBe(phpTotal);
		expect(tsTotal).toBe(truth[0]?.n as number);
	});

	test('a client filter_by_locators pin on (dd128,-1) counts ZERO on both engines', async () => {
		const tsTotal = ((await tsCall(PIN_COUNT_RQO)).data as { total: number }).total;
		const phpTotal = (
			(await php.call(structuredClone(PIN_COUNT_RQO) as Record<string, unknown>)).body.result as {
				total: number;
			}
		).total;
		expect(tsTotal).toBe(0);
		expect(phpTotal).toBe(0);
	});

	test('resolve_data still carries the -1 chip on both engines (label exemption)', async () => {
		const tsData = tsDataOf(await tsCall(RESOLVE_RQO));
		const phpData = phpDataOf(
			(await php.call(structuredClone(RESOLVE_RQO) as Record<string, unknown>)).body as Record<
				string,
				unknown
			>,
		);
		// Both mains keep the injected -1 entry (dropping it would blank the
		// "who = root" chip); child items may resolve empty values (root has no
		// dd452 full name) but the locator itself must survive on both. TS now
		// emits the canonical INT chip (WC-2026-08-10-section-id-int-canonical);
		// the frozen PHP fixture keeps the string byte-form.
		expect(JSON.stringify(tsData)).toContain('"section_id":-1');
		expect(JSON.stringify(phpData)).toContain('"-1"');
	});
});
