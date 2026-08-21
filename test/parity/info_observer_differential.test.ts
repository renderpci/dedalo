/**
 * component_info OBSERVER recompute vs live PHP (the ledgered-out shapes,
 * closed 2026-07-10) — twin scratch chains, one saved through each engine:
 *
 *  A. filter:{SQO} (ARCHIVE_INFO ← COIN_USED): saving a coin's 'used' flag
 *     finds the archives referencing it through the archive's COINS portal and
 *     recomputes get_archive_weights AT each archive — ONE matrix_time_machine
 *     row per save (lg-nolan, the computed live shape), live misc UNTOUCHED
 *     (oracle-measured: stored misc values are legacy; current PHP never
 *     writes them), and NO observer item in the response (cross-section
 *     target ≠ the saved record).
 *
 *  B. filter:false (a seed-shipped state pair): the state observer lives on the SAME
 *     record — TM row + the recomputed info item rides the save response
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
// GENERIC-TLD MIGRATED 2026-08-20 (WC-2026-08-19-test-tld-replay).
// Chain A is written entirely in `test`-TLD terms (the cloned archive/coin
// sections and their cloned observer wiring — the clone rewrote the
// `observe`/`observers` properties along with the tipos, verified in
// dd_ontology); chain B's pair is SEED-SHIPPED ontology every installation
// ships, spelled through `seed()`. Both chains are BUILT at runtime and swept
// in afterAll, and the two locator TARGETS they address come from the
// committed corpus. This gate is FIXTURE-EXEMPT (its PHP round-trips are real
// mutations, so it runs only against a LIVE oracle, which the cutover
// decommissioned): the corpus is materialized under exactly that condition.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { normalizeWidgetEntryKeys } from '../../src/core/components/component_info/widgets/widget_common.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { dropTestCorpus, ensureTestCorpus } from '../../src/core/test_data/test_corpus/ensure.ts';
import { hasLivePhpOracle, PhpApiClient } from './php_client.ts';

/**
 * Seed-shipped ontology, spelled so the install-TLD census does not read it as
 * an install binding (the pilot's `seed()` convention).
 */
const seed = (tld: string, id: number): string => `${tld}${id}`;

/* --- chain A: the cloned archive/coin pair and its observer wiring --------- */
const ARCHIVES = 'test6099';
const COINS = 'test6100';
/** The archive's COINS portal — the path the observer filter walks. */
const ARCHIVE_COINS_PORTAL = 'test6157';
/** The component_info observer that recomputes at the archive. */
const ARCHIVE_INFO = 'test6400';
/** The coin's 'used' radio button, and its weight. */
const COIN_USED = 'test6139';
const COIN_WEIGHT = 'test6207';
/** The section the 'used' value points at. */
const USED_TARGET = 'test6337';

/* --- chain B: the seed-shipped same-record state pair ---------------------- */
const PERSONS = seed('rsc', 2);
const PERSON_STATE_INFO = seed('rsc', 19);
const PERSON_STATE_CHECK = seed('rsc', 156);
const STATE_TARGET = seed('dd', 501);
const RELATION_TYPE = seed('dd', 151);

/** The corpus sections the two chains address as locator TARGETS. */
const CORPUS_SCOPE = [USED_TARGET, STATE_TARGET];

const created: { sectionTipo: string; sectionId: number }[] = [];

function track(sectionTipo: string, sectionId: number): number {
	created.push({ sectionTipo, sectionId });
	return sectionId;
}

/**
 * The section's matrix table, RESOLVED from the ontology — never hardcoded: a
 * cloned `test` section stores in `matrix_test` and a seed-shipped one in its
 * own table, and this gate drives one of each.
 */
async function matrixTableOf(sectionTipo: string): Promise<string> {
	return (await getMatrixTableFromTipo(sectionTipo)) as string;
}

async function setColumn(
	sectionTipo: string,
	sectionId: number,
	column: string,
	componentTipo: string,
	items: unknown[],
): Promise<void> {
	const table = await matrixTableOf(sectionTipo);
	await sql.unsafe(
		`UPDATE ${table} SET ${column} = COALESCE(${column}, '{}'::jsonb) || jsonb_build_object($1::text, $2::text::jsonb)
		 WHERE section_tipo = $3 AND section_id = $4`,
		[componentTipo, JSON.stringify(items), sectionTipo, sectionId],
	);
}

const locatorOf = (sectionTipo: string, sectionId: number | string, from: string, id = 1) => ({
	id,
	type: RELATION_TYPE,
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
	const archive = track(ARCHIVES, await createSectionRecord(ARCHIVES, -1));
	const coin = track(COINS, await createSectionRecord(COINS, -1));
	await setColumn(ARCHIVES, archive, 'relation', ARCHIVE_COINS_PORTAL, [
		locatorOf(COINS, coin, ARCHIVE_COINS_PORTAL),
	]);
	// weights + used flag so the recompute yields real numbers
	await setColumn(COINS, coin, 'number', COIN_WEIGHT, [{ id: 1, value: 4.5 }]);
	const person = track(PERSONS, await createSectionRecord(PERSONS, -1));
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
			tipo: COIN_USED,
			section_tipo: COINS,
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
						type: RELATION_TYPE,
						section_id: '1',
						section_tipo: USED_TARGET,
						from_component_tipo: COIN_USED,
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
			tipo: PERSON_STATE_CHECK,
			section_tipo: PERSONS,
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
						type: RELATION_TYPE,
						section_id: '2',
						section_tipo: STATE_TARGET,
						from_component_tipo: PERSON_STATE_CHECK,
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
	const table = await matrixTableOf(sectionTipo);
	const rows = (await sql.unsafe(
		`SELECT misc->$3 AS stored FROM ${table} WHERE section_tipo = $1 AND section_id = $2`,
		[sectionTipo, sectionId, componentTipo],
	)) as { stored: unknown }[];
	return rows[0]?.stored ?? null;
}

beforeAll(async () => {
	// Fixture-exempt gate: the corpus is only needed (and only written) when a
	// LIVE oracle makes the tests run at all.
	if (!hasLivePhpOracle()) return;
	await ensureTestCorpus(CORPUS_SCOPE);
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
		const table = await matrixTableOf(row.sectionTipo);
		const deleted = (await sql.unsafe(
			`DELETE FROM ${table} WHERE section_tipo = $1 AND section_id = $2 RETURNING id`,
			[row.sectionTipo, row.sectionId],
		)) as unknown[];
		if (deleted.length === 0) leaked.push(`${row.sectionTipo}/${row.sectionId}`);
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
			[row.sectionTipo, row.sectionId],
		);
	}
	expect(await dropTestCorpus(CORPUS_SCOPE)).toBe(0);
	if (leaked.length > 0) throw new Error(`Scratch cleanup failed: ${leaked.join(', ')}`);
});

describe.if(hasLivePhpOracle())('component_info observer recompute differential', () => {
	test('filter:{SQO} — coin save recomputes the archive observer (TM rows, misc untouched)', async () => {
		const phpResponse = (await php.call(usedSaveRqo(phpChain.coin))).body as {
			result?: { data?: { tipo?: string }[] };
		};
		const tsResponse = (await dispatchRqo(usedSaveRqo(tsChain.coin) as never, tsContext as never))
			.body as { data?: { data?: { tipo?: string }[] } };

		// neither response carries the cross-section observer item
		expect((phpResponse.result?.data ?? []).some((item) => item.tipo === ARCHIVE_INFO)).toBe(false);
		expect((tsResponse.data?.data ?? []).some((item) => item.tipo === ARCHIVE_INFO)).toBe(false);

		// TM rows at each engine's archive: byte-equal computed data (DEDUPED —
		// PHP's insert save double-fires, see header)
		const phpTm = await tmRows(ARCHIVES, phpChain.archive, ARCHIVE_INFO);
		const tsTm = await tmRows(ARCHIVES, tsChain.archive, ARCHIVE_INFO);
		expect(phpTm.length).toBeGreaterThan(0); // non-vacuity: the observer ran
		expect(tsTm.length).toBeGreaterThan(0);
		const dedupe = (rows: { lang: string; data: unknown }[]) => [
			...new Set(rows.map((row) => JSON.stringify({ lang: row.lang, data: row.data }))),
		];
		expect(dedupe(tsTm)).toEqual(dedupe(phpTm));

		// the live misc column stays untouched on BOTH engines (stored values
		// are legacy; the oracle-measured contract)
		expect(await storedMisc(ARCHIVES, phpChain.archive, ARCHIVE_INFO)).toBeNull();
		expect(await storedMisc(ARCHIVES, tsChain.archive, ARCHIVE_INFO)).toBeNull();
	}, 30000);

	test('filter:false — same-record state observer rides the save response + TM row', async () => {
		const phpResponse = (await php.call(stateSaveRqo(phpChain.person))).body as {
			result?: { data?: Record<string, unknown>[] };
		};
		const tsResponse = (
			await dispatchRqo(stateSaveRqo(tsChain.person) as never, tsContext as never)
		).body as { data?: { data?: Record<string, unknown>[] } };

		const phpItem = (phpResponse.result?.data ?? []).find(
			(item) => item.tipo === PERSON_STATE_INFO,
		);
		const tsItem = (tsResponse.data?.data ?? []).find((item) => item.tipo === PERSON_STATE_INFO);
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

		const phpTm = await tmRows(PERSONS, phpChain.person, PERSON_STATE_INFO);
		const tsTm = await tmRows(PERSONS, tsChain.person, PERSON_STATE_INFO);
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

		expect(await storedMisc(PERSONS, phpChain.person, PERSON_STATE_INFO)).toBeNull();
		expect(await storedMisc(PERSONS, tsChain.person, PERSON_STATE_INFO)).toBeNull();
	}, 30000);
});
