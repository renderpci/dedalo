/**
 * Regression gate: the BARE dd15 (Time Machine) list — the exact request the
 * client sends when the Time Machine section is opened directly from the menu:
 *   source.mode 'list', sqo.mode 'tm', section_tipo ['dd15'],
 *   NO filter_by_locators, NO tipo filter, NO show.ddo_map.
 *
 * This used to 500 ("TM read: filter_by_locators or a tipo filter is required")
 * and then, when that throw was softened to empty, it wrongly returned 0 rows.
 * PHP `search_tm` has an EMPTY main-where: a bare dd15 list returns ALL
 * matrix_time_machine rows (newest-first, paginated) with dd15's OWN default
 * columns (dd559/dd578+dd132/dd577/dd1772/dd1212/rsc329/dd1371) — resolved
 * through the generic section pipeline. This gate pins that against live PHP by
 * STRUCTURAL parity (item + context tipo SETS and the envelope row count) — the
 * values are live TM history, so exact bytes are not asserted.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

/** The verbatim client RQO for "open the Time Machine section in list mode". */
const BARE_TM_RQO = {
	id: 'section_dd15_dd15_list_lg-spa',
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	source: {
		typo: 'source',
		type: 'section',
		action: 'search',
		model: 'section',
		tipo: 'dd15',
		section_tipo: 'dd15',
		section_id: null,
		mode: 'list',
		view: null,
		lang: 'lg-spa',
		session_save: true,
		session_key: 'dd15',
	},
	sqo: { section_tipo: ['dd15'], limit: null, offset: null, mode: 'tm' },
};

type Result = {
	context?: { tipo?: unknown }[];
	data?: { typo?: unknown; tipo?: unknown; entries?: unknown[] }[];
};

const tipoSet = (items: { tipo?: unknown }[] | undefined): string[] =>
	[...new Set((items ?? []).map((i) => String(i.tipo)))].sort();

let php: Result = {};
let ts: Result = {};
let tsStatus = 0;

beforeAll(async () => {
	if (!hasPhpCredentials()) return;
	const client = new PhpApiClient();
	await client.login(
		config.phpReference.username as string,
		config.phpReference.password as string,
	);
	php =
		(
			(await client.call(structuredClone(BARE_TM_RQO) as Record<string, unknown>)).body as {
				result?: Result;
			}
		).result ?? {};

	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	const res = await dispatchRqo(
		structuredClone(BARE_TM_RQO) as never,
		{
			requestId: 't',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		} as never,
	);
	tsStatus = res.status;
	ts = (res.body as { result?: Result }).result ?? {};
});

describe.if(hasPhpCredentials())('bare dd15 Time Machine list', () => {
	test('does NOT 500 (the reported bug)', () => {
		if (!hasPhpCredentials()) return;
		expect(tsStatus).toBe(200);
	});

	test('returns the same number of history rows as PHP (all TM rows, paginated)', () => {
		if (!hasPhpCredentials()) return;
		const phpEntries = (php.data?.[0]?.entries ?? []) as unknown[];
		const tsEntries = (ts.data?.[0]?.entries ?? []) as unknown[];
		expect(phpEntries.length).toBeGreaterThan(0); // sanity: PHP has history
		expect(tsEntries.length).toBe(phpEntries.length);
	});

	test('emits the same dd15 default column tipos as PHP', () => {
		if (!hasPhpCredentials()) return;
		expect(tipoSet(ts.data?.slice(1))).toEqual(tipoSet(php.data?.slice(1)));
	});

	test('builds the same context tipos as PHP (section + columns + dd132 subdatum)', () => {
		if (!hasPhpCredentials()) return;
		expect(tipoSet(ts.context)).toEqual(tipoSet(php.context));
	});
});
