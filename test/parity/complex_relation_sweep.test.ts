/**
 * Phase 6 gate: COMPLEX RELATION COMPONENT sweep vs live PHP — the
 * user-nominated set of components with heterogeneous request_configs:
 *
 *   numisdata4.numisdata161  autocomplete        (rc: types)
 *   numisdata4.numisdata55   relation_related    (no rc)
 *   numisdata6.numisdata20   autocomplete_hi     (rc: hierarchy_types)
 *   numisdata6.numisdata163  portal              (rc: bibliography)
 *   numisdata3.numisdata77   portal              (rc: coins)
 *   rsc167.rsc860            autocomplete_hi     (rc: indexation)
 *   rsc197.rsc1435           portal              (rc; NO stored data — both
 *                            engines must agree on the empty case)
 *   cult1.hierarchy93        autocomplete        (rc; thesaurus section)
 *   cult1.hierarchy40        relation_index      (source.mode external —
 *                            computed inverse indexations)
 *
 * For each pair, a LIST-mode section read (2 pinned records with data) —
 * every emitted item compared on the normalized read fields.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { adoptEntriesArrayContract } from './normalize.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

interface SweepCase {
	section: string;
	component: string;
	ids: string[];
	/**
	 * A LEDGERED designed-empty fixture: the component has NO stored data on
	 * either engine, so the parity contract is "both agree the component is
	 * empty" — the item-level non-empty floor (which guards against a VANISHED
	 * fixture) is skipped, but the envelope-entries equality below still runs,
	 * so the case cannot pass on a truly empty read (the pinned records must
	 * still be present in the envelope).
	 */
	emptyByDesign?: boolean;
}

const CASES: SweepCase[] = [
	{ section: 'numisdata4', component: 'numisdata161', ids: ['1', '2'] },
	{ section: 'numisdata4', component: 'numisdata55', ids: ['6', '7'] },
	{ section: 'numisdata6', component: 'numisdata20', ids: ['2', '3'] },
	{ section: 'numisdata6', component: 'numisdata163', ids: ['2', '3'] },
	{ section: 'numisdata3', component: 'numisdata77', ids: ['1', '2'] },
	{ section: 'rsc167', component: 'rsc860', ids: ['1', '2'] },
	{ section: 'rsc197', component: 'rsc1435', ids: ['1', '2'], emptyByDesign: true },
	{ section: 'cult1', component: 'hierarchy93', ids: ['1', '2'] },
	{ section: 'cult1', component: 'hierarchy40', ids: ['1', '2'] },
	// autocomplete WITH DATAFRAME data on both main and frame (user fixture):
	// numisdata1449 dd490 entries paired by id_key + main_component_tipo, and
	// the frame's config child (rsc1246, mode edit) at the paired target.
	{ section: 'numisdata3', component: 'numisdata34', ids: ['15657', '15446'] },
];

function readRqo(sweep: SweepCase): Record<string, unknown> {
	return {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		options: {},
		source: {
			typo: 'source',
			model: 'section',
			tipo: sweep.section,
			section_tipo: sweep.section,
			action: 'search',
			mode: 'list',
			lang: 'lg-spa',
		},
		sqo: {
			section_tipo: [sweep.section],
			limit: 2,
			offset: 0,
			filter_by_locators: sweep.ids.map((id) => ({
				section_tipo: sweep.section,
				section_id: id,
			})),
			order: [{ direction: 'ASC', path: [{ component_tipo: 'section_id' }] }],
		},
		show: {
			ddo_map: [
				{
					tipo: sweep.component,
					section_tipo: sweep.section,
					parent: sweep.section,
					mode: 'list',
				},
			],
		},
	};
}

function comparableItem(item: Record<string, unknown>): Record<string, unknown> {
	return {
		tipo: item.tipo,
		section_tipo: item.section_tipo,
		section_id: item.section_id,
		mode: item.mode,
		lang: item.lang,
		from_component_tipo: item.from_component_tipo ?? null,
		entries: item.entries ?? null,
		fallback_value: item.fallback_value ?? null,
		row_section_id: item.row_section_id ?? null,
		parent_tipo: item.parent_tipo ?? null,
		pagination: item.pagination ?? null,
	};
}

const phpBySweep = new Map<string, Record<string, unknown>[]>();
const tsBySweep = new Map<string, Record<string, unknown>[]>();

beforeAll(async () => {
	if (!hasPhpCredentials()) return;
	const php = new PhpApiClient();
	const loggedIn = await php.login(
		config.phpReference.username as string,
		config.phpReference.password as string,
	);
	if (!loggedIn) throw new Error('PHP login failed');
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);

	for (const sweep of CASES) {
		const key = `${sweep.section}.${sweep.component}`;
		const phpBody = (await php.call(readRqo(sweep))).body as {
			result?: { data?: unknown[] } | false;
		};
		// Fail LOUD on a failed PHP call — result:false must never degrade to an
		// empty array (empty-vs-empty would pass degenerately).
		if (phpBody.result === false || phpBody.result === undefined || phpBody.result === null) {
			throw new Error(`PHP read failed for ${key}: ${JSON.stringify(phpBody).slice(0, 300)}`);
		}
		// WC-001 (unified []): PHP emits entries:null for empty values; the TS
		// engine emits [] for EVERY model. Rewrite the PHP side only.
		phpBySweep.set(
			key,
			adoptEntriesArrayContract((phpBody.result.data ?? []) as Record<string, unknown>[]),
		);

		try {
			const tsResult = await dispatchRqo(
				readRqo(sweep) as never,
				{
					requestId: 't',
					clientIp: '127.0.0.1',
					session,
					csrfCandidate: session?.csrfToken ?? null,
					principal,
				} as never,
			);
			tsBySweep.set(
				key,
				((tsResult.body as { result?: { data?: unknown[] } }).result?.data ?? []) as Record<
					string,
					unknown
				>[],
			);
		} catch (error) {
			tsBySweep.set(key, [{ __ts_error: error instanceof Error ? error.message : String(error) }]);
		}
	}
}, 120000);

describe.if(hasPhpCredentials())('complex relation component sweep (list mode)', () => {
	for (const sweep of CASES) {
		const key = `${sweep.section}.${sweep.component}`;
		test(`${key} items match PHP`, () => {
			if (!hasPhpCredentials()) return;
			const phpData = phpBySweep.get(key) ?? [];
			const tsData = tsBySweep.get(key) ?? [];
			const tsError = (tsData[0] as { __ts_error?: string } | undefined)?.__ts_error;
			if (tsError !== undefined) {
				throw new Error(`TS read failed: ${tsError}`);
			}
			// Envelope entries must match exactly.
			expect((tsData[0] as { entries?: unknown[] })?.entries).toEqual(
				(phpData[0] as { entries?: unknown[] })?.entries,
			);
			// Items: same key set, each equal on normalized fields.
			const keyOf = (item: Record<string, unknown>): string =>
				`${item.row_section_id}|${item.tipo}|${item.section_id}`;
			const phpByKey = new Map(phpData.slice(1).map((item) => [keyOf(item), comparableItem(item)]));
			const tsByKey = new Map(tsData.slice(1).map((item) => [keyOf(item), comparableItem(item)]));
			// Non-empty floor: a vanished fixture must redden, not compare 0
			// items — EXCEPT the ledgered designed-empty case, whose contract is
			// exactly the empty component (the envelope-entries equality above
			// already proved the pinned records are present, so this case still
			// cannot pass on a truly empty read).
			if (!sweep.emptyByDesign) {
				expect(phpByKey.size).toBeGreaterThan(0);
			}
			expect([...tsByKey.keys()].sort()).toEqual([...phpByKey.keys()].sort());
			for (const [itemKey, phpItem] of phpByKey) {
				expect(tsByKey.get(itemKey)).toEqual(phpItem);
			}
		});
	}
});
