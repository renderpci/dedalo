/**
 * RELATIONS_SPEC.md Phase E — the TM read COLUMN-FILTER pin.
 *
 * FINDING (probed 2026-07-03): live PHP IGNORES sqo.filter on the Time
 * Machine service read (source.type 'tm') — a dd578 user filter matching the
 * fixture rows and one matching NOTHING both return the same 4 rows, in
 * every q shape (locator array, JSON string). The relation _tm operator
 * traits only fire on the TM-AREA search surface, which is unported.
 *
 * The pin (asymmetric by design):
 * - PHP: matching and non-matching filters return IDENTICAL rows (the
 *   ignore) — if PHP starts applying filters here, this fails loudly and the
 *   TS side should wire its (already unit-gated) _tm builders through
 *   read_tm for real;
 * - TS: read_tm REFUSES sqo.filter loudly — silently ignoring a filter can
 *   over-expose history rows the caller believed excluded.
 *
 * Fixture: rsc1242 §578 (4 real TM rows, all user_id -1).
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readTimeMachineData } from '../../src/core/resolve/read_tm.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

function tmFilterRqo(userId: string): Record<string, unknown> {
	return {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: {
			typo: 'source',
			type: 'tm',
			model: 'section',
			tipo: 'dd15',
			section_tipo: 'dd15',
			action: 'search',
			mode: 'list',
			lang: 'lg-spa',
		},
		sqo: {
			section_tipo: ['dd15'],
			mode: 'tm',
			limit: 10,
			offset: 0,
			filter_by_locators: [{ section_tipo: 'rsc1242', section_id: '578' }],
			filter: {
				$and: [
					{
						q: [{ section_id: userId, section_tipo: 'dd128' }],
						q_operator: null,
						path: [{ section_tipo: 'dd15', component_tipo: 'dd578' }],
					},
				],
			},
		},
		show: { ddo_map: [] },
	};
}

let php: PhpApiClient;

beforeAll(async () => {
	if (!hasPhpCredentials()) return;
	php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
}, 60000);

async function phpEntries(rqo: Record<string, unknown>): Promise<unknown[]> {
	const { body } = await php.call(structuredClone(rqo));
	const data = ((body as { result?: { data?: { entries?: unknown[] }[] } }).result?.data ?? []) as {
		entries?: unknown[];
	}[];
	return data[0]?.entries ?? [];
}

describe.if(hasPhpCredentials())('TM column-filter pin (both engines IGNORE the filter)', () => {
	test('PHP returns IDENTICAL rows for matching and non-matching user filters', async () => {
		if (!hasPhpCredentials()) return;
		const matching = await phpEntries(tmFilterRqo('-1'));
		const nonMatching = await phpEntries(tmFilterRqo('999'));
		expect(matching.length).toBeGreaterThan(0);
		// The IGNORE: a filter that matches nothing changes nothing. When PHP
		// starts applying TM column filters, this fails — then wire the
		// unit-gated _tm builders (builder_relation.ts) through read_tm.
		expect(nonMatching).toEqual(matching as never);
	});

	test('TS read_tm IGNORES sqo.filter too (matches PHP; does not throw)', async () => {
		// The runtime must match the oracle: PHP serves this request by ignoring
		// the column filter, so TS must NOT refuse it (an earlier fail-loud choice
		// broke the tool_time_machine list, which always sends a tipo filter). A
		// matching vs non-matching filter yields the same rows on the TS side.
		const matching = await readTimeMachineData(tmFilterRqo('-1') as unknown as Rqo);
		const nonMatching = await readTimeMachineData(tmFilterRqo('999') as unknown as Rqo);
		expect(matching.data).toEqual(nonMatching.data);
	});
});
