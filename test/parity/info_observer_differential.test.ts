/**
 * component_info OBSERVER recompute vs live PHP (the ledgered-out shapes,
 * closed 2026-07-10) — twin scratch chains, one saved through each engine:
 *
 *  A. filter:{SQO} (numisdata595 ← numisdata57): saving a coin's 'used' flag
 *     finds the archives referencing it through the numisdata77 portal and
 *     recomputes get_archive_weights AT each archive — ONE matrix_time_machine
 *     row per save (lg-nolan, the computed live shape), live misc UNTOUCHED
 *     (oracle-measured: stored misc values are legacy; current PHP never
 *     writes them), and NO observer item in the response (cross-section
 *     target ≠ the saved record).
 *
 *  B. filter:false (rsc19 ← rsc156): the state observer lives on the SAME
 *     record — TM row + the recomputed rsc19 item rides the save response
 *     (PHP observers_data; TS entries carry WC-026 dual keys, so the PHP
 *     side is normalized with the production fn before diffing).
 *
 * TM data bytes are compared engine-to-engine (twin chains are shaped
 * identically); timestamps/ids are engine-local and excluded. TM COUNTS are
 * compared DEDUPED: PHP's insert save runs twice (the saved component's own
 * TM doubles too — a pre-existing save-path quirk, not an observer
 * contract), so PHP writes two identical observer rows where TS writes one.
 * PHP dev-server debug_* keys are stripped (outside the surface by design).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { normalizeWidgetEntryKeys } from '../../src/core/components/component_info/widgets/widget_common.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { PhpApiClient, hasLivePhpOracle } from './php_client.ts';

const created: { table: string; sectionTipo: string; sectionId: number }[] = [];

function track(sectionTipo: string, sectionId: number, table = 'matrix'): number {
	created.push({ table, sectionTipo, sectionId });
	return sectionId;
}

async function setColumn(
	sectionTipo: string,
	sectionId: number,
	column: string,
	componentTipo: string,
	items: unknown[],
): Promise<void> {
	await sql.unsafe(
		`UPDATE matrix SET ${column} = COALESCE(${column}, '{}'::jsonb) || jsonb_build_object($1::text, $2::text::jsonb)
		 WHERE section_tipo = $3 AND section_id = $4`,
		[componentTipo, JSON.stringify(items), sectionTipo, sectionId],
	);
}

const locatorOf = (sectionTipo: string, sectionId: number | string, from: string, id = 1) => ({
	id,
	type: 'dd151',
	section_id: String(sectionId),
	section_tipo: sectionTipo,
	from_component_tipo: from,
});

let php: PhpApiClient;
let tsContext: Record<string, unknown>;

interface Chain {
	archive: number;
	coin: number;
	person: number;
}
const phpChain: Chain = { archive: 0, coin: 0, person: 0 };
const tsChain: Chain = { archive: 0, coin: 0, person: 0 };

async function buildChain(): Promise<Chain> {
	const archive = track('numisdata3', await createSectionRecord('numisdata3', -1));
	const coin = track('numisdata4', await createSectionRecord('numisdata4', -1));
	await setColumn('numisdata3', archive, 'relation', 'numisdata77', [
		locatorOf('numisdata4', coin, 'numisdata77'),
	]);
	// weights + used flag so the recompute yields real numbers
	await setColumn('numisdata4', coin, 'number', 'numisdata133', [{ id: 1, value: 4.5 }]);
	const person = track('rsc2', await createSectionRecord('rsc2', -1));
	return { archive, coin, person };
}

function usedSaveRqo(coin: number): Record<string, unknown> {
	return {
		action: 'save',
		dd_api: 'dd_core_api',
		source: {
			typo: 'source',
			type: 'component',
			action: 'save',
			model: 'component_radio_button',
			tipo: 'numisdata57',
			section_tipo: 'numisdata4',
			section_id: String(coin),
			mode: 'edit',
			lang: 'lg-nolan',
		},
		data: {
			changed_data: [
				{
					action: 'insert',
					key: 0,
					value: {
						type: 'dd151',
						section_id: '1',
						section_tipo: 'numisdata341',
						from_component_tipo: 'numisdata57',
					},
				},
			],
		},
	};
}

function stateSaveRqo(person: number): Record<string, unknown> {
	return {
		action: 'save',
		dd_api: 'dd_core_api',
		source: {
			typo: 'source',
			type: 'component',
			action: 'save',
			model: 'component_check_box',
			tipo: 'rsc156',
			section_tipo: 'rsc2',
			section_id: String(person),
			mode: 'edit',
			lang: 'lg-nolan',
		},
		data: {
			changed_data: [
				{
					action: 'insert',
					key: 0,
					value: {
						type: 'dd151',
						section_id: '2',
						section_tipo: 'dd501',
						from_component_tipo: 'rsc156',
					},
				},
			],
		},
	};
}

async function tmRows(
	sectionTipo: string,
	sectionId: number,
	componentTipo: string,
): Promise<{ lang: string; data: unknown }[]> {
	return (await sql.unsafe(
		`SELECT lang, data FROM matrix_time_machine
		 WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3 ORDER BY id`,
		[sectionTipo, sectionId, componentTipo],
	)) as { lang: string; data: unknown }[];
}

async function storedMisc(
	sectionTipo: string,
	sectionId: number,
	componentTipo: string,
): Promise<unknown> {
	const rows = (await sql.unsafe(
		'SELECT misc->$3 AS stored FROM matrix WHERE section_tipo = $1 AND section_id = $2',
		[sectionTipo, sectionId, componentTipo],
	)) as { stored: unknown }[];
	return rows[0]?.stored ?? null;
}

beforeAll(async () => {
	if (!hasLivePhpOracle()) return;
	php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	tsContext = {
		requestId: 't',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	};
	Object.assign(phpChain, await buildChain());
	Object.assign(tsChain, await buildChain());
}, 60000);

afterAll(async () => {
	if (!hasLivePhpOracle()) return;
	const leaked: string[] = [];
	for (const row of created) {
		const deleted = (await sql.unsafe(
			`DELETE FROM ${row.table} WHERE section_tipo = $1 AND section_id = $2 RETURNING id`,
			[row.sectionTipo, row.sectionId],
		)) as unknown[];
		if (deleted.length === 0) leaked.push(`${row.sectionTipo}/${row.sectionId}`);
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
			[row.sectionTipo, row.sectionId],
		);
	}
	if (leaked.length > 0) throw new Error(`Scratch cleanup failed: ${leaked.join(', ')}`);
});

describe.if(hasLivePhpOracle())('component_info observer recompute differential', () => {
	test('filter:{SQO} — coin save recomputes the archive observer (TM rows, misc untouched)', async () => {
		const phpResponse = (await php.call(usedSaveRqo(phpChain.coin))).body as {
			result?: { data?: { tipo?: string }[] };
		};
		const tsResponse = (await dispatchRqo(usedSaveRqo(tsChain.coin) as never, tsContext as never))
			.body as { result?: { data?: { tipo?: string }[] } };

		// neither response carries the cross-section observer item
		expect((phpResponse.result?.data ?? []).some((item) => item.tipo === 'numisdata595')).toBe(
			false,
		);
		expect((tsResponse.result?.data ?? []).some((item) => item.tipo === 'numisdata595')).toBe(
			false,
		);

		// TM rows at each engine's archive: byte-equal computed data (DEDUPED —
		// PHP's insert save double-fires, see header)
		const phpTm = await tmRows('numisdata3', phpChain.archive, 'numisdata595');
		const tsTm = await tmRows('numisdata3', tsChain.archive, 'numisdata595');
		expect(phpTm.length).toBeGreaterThan(0); // non-vacuity: the observer ran
		expect(tsTm.length).toBeGreaterThan(0);
		const dedupe = (rows: { lang: string; data: unknown }[]) => [
			...new Set(rows.map((row) => JSON.stringify({ lang: row.lang, data: row.data }))),
		];
		expect(dedupe(tsTm)).toEqual(dedupe(phpTm));

		// the live misc column stays untouched on BOTH engines (stored values
		// are legacy; the oracle-measured contract)
		expect(await storedMisc('numisdata3', phpChain.archive, 'numisdata595')).toBeNull();
		expect(await storedMisc('numisdata3', tsChain.archive, 'numisdata595')).toBeNull();
	}, 30000);

	test('filter:false — same-record state observer rides the save response + TM row', async () => {
		const phpResponse = (await php.call(stateSaveRqo(phpChain.person))).body as {
			result?: { data?: Record<string, unknown>[] };
		};
		const tsResponse = (
			await dispatchRqo(stateSaveRqo(tsChain.person) as never, tsContext as never)
		).body as { result?: { data?: Record<string, unknown>[] } };

		const phpItem = (phpResponse.result?.data ?? []).find((item) => item.tipo === 'rsc19');
		const tsItem = (tsResponse.result?.data ?? []).find((item) => item.tipo === 'rsc19');
		expect(phpItem).toBeDefined();
		expect(tsItem).toBeDefined();
		// WC-026: normalize the PHP entries with the production fn; twin ids
		// differ per chain (swap to a sentinel); strip the PHP dev-only debug_*
		// keys (outside the surface by design); entry locators carry the twin id
		// too — serialize-and-swap handles them.
		const normalize = (item: Record<string, unknown>, ownId: number) => {
			const { debug_model, debug_label, debug_dataframe, ...rest } = item as Record<
				string,
				unknown
			> & { debug_model?: unknown; debug_label?: unknown; debug_dataframe?: unknown };
			const swapped = JSON.parse(
				JSON.stringify(rest).replaceAll(`"${String(ownId)}"`, '"TWIN"'),
			) as Record<string, unknown>;
			return {
				...swapped,
				entries: Array.isArray(swapped.entries)
					? normalizeWidgetEntryKeys(swapped.entries)
					: swapped.entries,
			};
		};
		expect(normalize(tsItem as Record<string, unknown>, tsChain.person)).toEqual(
			normalize(phpItem as Record<string, unknown>, phpChain.person) as never,
		);

		const phpTm = await tmRows('rsc2', phpChain.person, 'rsc19');
		const tsTm = await tmRows('rsc2', tsChain.person, 'rsc19');
		expect(phpTm.length).toBeGreaterThan(0);
		expect(tsTm.length).toBeGreaterThan(0);
		const dedupe = (rows: { lang: string; data: unknown }[], ownId: number) => [
			...new Set(
				rows.map((row) =>
					JSON.stringify({ lang: row.lang, data: row.data }).replaceAll(
						`"${String(ownId)}"`,
						'"TWIN"',
					),
				),
			),
		];
		expect(dedupe(tsTm, tsChain.person)).toEqual(dedupe(phpTm, phpChain.person));

		expect(await storedMisc('rsc2', phpChain.person, 'rsc19')).toBeNull();
		expect(await storedMisc('rsc2', tsChain.person, 'rsc19')).toBeNull();
	}, 30000);
});
