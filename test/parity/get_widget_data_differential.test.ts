/**
 * dd_component_info get_widget_data differential — the single-widget compute
 * channel (the client widget_common.js autoload path + the async widgets'
 * only delivery) vs the live PHP oracle.
 *
 * Compares the widget payload byte-for-byte (TS envelope v2 `data` vs the
 * frozen PHP `result`) and the REFUSALS by registry code (the PHP-era
 * {msg, errors} prose is not a v2 wire fact — ERRORS_SPEC §3):
 *  - state widget success (a scratch record → REAL seed vocab records);
 *  - get_archive_weights success (a scratch archive, 3 corpus coins);
 *  - unknown widget_name → PHP ' Empty widget_obj for widget <name>'
 *    ⇒ `widget.not_defined`;
 *  - a widgets-less tipo → PHP ' Empty defined widgets …' ⇒ `widget.empty`;
 *  - user_activity (async — this channel is its ONLY delivery): the
 *    three-tier totals over a scratch dd1521 stats day + a synthetic today
 *    matrix_activity row.
 *
 * Scratch-twin hygiene: every created row is tracked and deleted (0-row
 * deletes fail loudly — the dd128 leak lesson).
 */
// GENERIC-TLD MIGRATED 2026-08-20 (WC-2026-08-19-test-tld-replay).
// The archive/weights case is written in `test`-TLD terms (the cloned archive
// section, its cloned COINS portal and its cloned component_info) and its
// three coins are copied from a COMMITTED CORPUS record, not from whatever
// archive the ambient database happens to hold. Everything else is
// SEED-SHIPPED ontology every installation ships, spelled through `seed()`.
// Every row this gate writes is scratch and swept in afterAll. The gate is
// FIXTURE-EXEMPT (its PHP round-trips are real mutations, so it runs only
// against a LIVE oracle, which the cutover decommissioned): the corpus is
// materialized under exactly that condition.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { CATEGORY_STATUS, type ErrorCode, specOf } from '../../src/core/errors/registry.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { dropTestCorpus, ensureTestCorpus } from '../../src/core/test_data/test_corpus/ensure.ts';
import { adoptErrorEnvelopeV2 } from './normalize.ts';
import { hasLivePhpOracle, PhpApiClient } from './php_client.ts';

/**
 * Seed-shipped ontology, spelled so the install-TLD census does not read it as
 * an install binding (the pilot's `seed()` convention).
 */
const seed = (tld: string, id: number): string => `${tld}${id}`;

/* --- the cloned archive situation ----------------------------------------- */
/** The cloned archive section, its COINS portal and its component_info. */
const ARCHIVES = 'test6099';
const ARCHIVE_COINS_PORTAL = 'test6157';
const ARCHIVE_INFO = 'test6400';
/** The COMMITTED CORPUS archive whose coin locators the scratch archive borrows. */
const CORPUS_ARCHIVE_ID = 4;

/* --- the seed-shipped state situation ------------------------------------- */
const PERSONS = seed('rsc', 2);
const PERSON_STATE_INFO = seed('rsc', 19);
const PERSON_STATE_CHECK = seed('rsc', 156);
const PERSON_ACCESS = seed('rsc', 80);
/** A component of the persons section that defines NO widgets at all. */
const WIDGETLESS = seed('rsc', 85);
const STATE_TARGET = seed('dd', 501);
const ACCESS_TARGET = seed('dd', 174);
const RELATION_TYPE = seed('dd', 151);

const created: { table: string; sectionTipo: string; sectionId: number }[] = [];

/** The section's matrix table, RESOLVED from the ontology — never hardcoded. */
async function matrixTableOf(sectionTipo: string): Promise<string> {
	return (await getMatrixTableFromTipo(sectionTipo)) as string;
}

function track(sectionTipo: string, sectionId: number, table = 'matrix'): number {
	created.push({ table, sectionTipo, sectionId });
	return sectionId;
}

const locatorOf = (sectionTipo: string, sectionId: number | string, from: string, id = 1) => ({
	id,
	type: RELATION_TYPE,
	section_id: String(sectionId),
	section_tipo: sectionTipo,
	from_component_tipo: from,
});

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

let php: PhpApiClient;
let tsContext: Record<string, unknown>;

const fixtures = {
	stateRecord: 0, // a scratch persons record → REAL seed vocab records
	archive: 0, // a scratch archive with 3 coins from the corpus archive
	user: 0, // a scratch user (matrix_users) with synthetic stats + activity
};

function widgetRqo(
	tipo: string,
	sectionTipo: string,
	sectionId: number | string,
	widgetName: string,
	mode = 'edit',
): Record<string, unknown> {
	return {
		action: 'get_widget_data',
		dd_api: 'dd_component_info',
		options: { widget_name: widgetName },
		source: {
			typo: 'source',
			type: 'widget',
			tipo,
			section_tipo: sectionTipo,
			section_id: String(sectionId),
			mode,
		},
	};
}

/**
 * WC-2026-08-03-state-widget-total-source-count — the TS state widget adds
 * `items` (the source-locator count, the total's own divisor) to every `total`
 * item; PHP never emitted it. Strip it TS-side before diffing (the WC-001
 * pattern: transform the response, never re-harvest the frozen store).
 *
 * The strip RETURNS whether it found the key, and the state test asserts it did
 * — a normalizer that silently no-ops is how a divergence quietly becomes a
 * regression the day the field stops being emitted.
 */
function stripStateTotalItems(body: unknown): boolean {
	const data = (body as { data?: unknown }).data;
	if (!Array.isArray(data)) return false;
	let found = false;
	for (const entry of data) {
		const item = entry as { widget?: unknown; type?: unknown; items?: unknown };
		if (item?.widget !== 'state' || item?.type !== 'total') continue;
		if (item.items === undefined) continue;
		found = true;
		// The key must be GONE, not undefined: a present-but-undefined key is a
		// different object shape, and the diff would then depend on how the matcher
		// treats it rather than on what the engines actually emit.
		// biome-ignore lint/performance/noDelete: removing the key IS the assertion
		delete (item as { items?: unknown }).items;
	}
	return found;
}

/**
 * SUCCESS parity: the TS envelope v2 payload (`data`) against the frozen PHP
 * `result`, byte-for-byte. The PHP-era `msg`/`errors` prose is not compared —
 * the converter never emits it (ERRORS_SPEC §3.0), and the refusals assert the
 * registry code instead (expectRefusalParity).
 */
async function expectEnvelopeParity(
	rqo: Record<string, unknown>,
	options: { nonEmpty?: boolean; expectStateItems?: boolean } = {},
): Promise<void> {
	const phpBody = (await php.call(structuredClone(rqo))).body;
	const tsOutcome = await dispatchRqo(structuredClone(rqo) as never, tsContext as never);
	const tsBody = tsOutcome.body;
	// WC-2026-08-03-state-widget-total-source-count
	const strippedItems = stripStateTotalItems(tsBody);
	if (options.expectStateItems === true) {
		expect(strippedItems).toBe(true);
	}
	if (options.nonEmpty === true) {
		// non-vacuity floor: a both-engines empty answer would "match" too —
		// the success cases must return actual widget items.
		expect(Array.isArray((phpBody as { result?: unknown }).result)).toBe(true);
		expect(((phpBody as { result?: unknown[] }).result ?? []).length).toBeGreaterThan(0);
	}
	expect(tsOutcome.status).toBe(200);
	expect(tsBody.ok).toBe(true);
	expect((tsBody as { data?: unknown }).data).toEqual(
		(phpBody as { result?: unknown }).result as never,
	);
}

/**
 * REFUSAL parity restated in envelope v2: PHP answered `result:false` + free
 * prose at HTTP 200; TS throws a REGISTRY CODE at the registry status. The
 * frozen PHP body is projected through the parity reconciler
 * (normalize.ts FROZEN_ERROR_BODIES → code), so both engines are compared on
 * the code — the retired prose is no longer a wire fact on either side.
 */
async function expectRefusalParity(rqo: Record<string, unknown>, code: ErrorCode): Promise<void> {
	const phpBody = (await php.call(structuredClone(rqo))).body;
	const adopted = adoptErrorEnvelopeV2(phpBody);
	expect(adopted.matched).toBe(true);
	expect(adopted.kind).toBe('error');
	expect((adopted.projection as { error: { code: string } }).error.code).toBe(code);

	const tsOutcome = await dispatchRqo(structuredClone(rqo) as never, tsContext as never);
	expect(tsOutcome.status).toBe(CATEGORY_STATUS[specOf(code).category]);
	expect(tsOutcome.body.ok).toBe(false);
	expect((tsOutcome.body as { error?: { code?: string } }).error?.code).toBe(code);
}

beforeAll(async () => {
	// Fixture-exempt gate: the corpus is only needed (and only written) when a
	// LIVE oracle makes the tests run at all.
	if (!hasLivePhpOracle()) return;
	await ensureTestCorpus([ARCHIVES]);
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

	// state widget host: a scratch persons record pointing at REAL seed vocab rows
	fixtures.stateRecord = track(PERSONS, await createSectionRecord(PERSONS, -1));
	await setColumn(PERSONS, fixtures.stateRecord, 'relation', PERSON_STATE_CHECK, [
		locatorOf(STATE_TARGET, 2, PERSON_STATE_CHECK),
	]);
	await setColumn(PERSONS, fixtures.stateRecord, 'relation', PERSON_ACCESS, [
		locatorOf(ACCESS_TARGET, 1, PERSON_ACCESS),
	]);

	// get_archive_weights host: a scratch archive carrying 3 coins copied from
	// the COMMITTED CORPUS archive (never from an ambient install record).
	fixtures.archive = track(ARCHIVES, await createSectionRecord(ARCHIVES, -1));
	const archivesTable = await matrixTableOf(ARCHIVES);
	const coins = (await sql.unsafe(
		`SELECT relation->$1 AS v FROM ${archivesTable} WHERE section_tipo = $2 AND section_id = $3`,
		[ARCHIVE_COINS_PORTAL, ARCHIVES, CORPUS_ARCHIVE_ID],
	)) as { v: unknown[] }[];
	// Non-vacuity: an empty borrow would make the weights case compute nothing.
	expect((coins[0]?.v ?? []).length).toBeGreaterThan(0);
	await setColumn(
		ARCHIVES,
		fixtures.archive,
		'relation',
		ARCHIVE_COINS_PORTAL,
		(coins[0]?.v ?? []).slice(0, 3),
	);

	// user_activity: scratch dd128 user + one saved dd1521 stats day (2 days
	// ago — tier 1) + one synthetic matrix_activity row TODAY (tier 2). All
	// three engines' tiers are exercised deterministically on scratch rows.
	fixtures.user = track('dd128', await createSectionRecord('dd128', -1), 'matrix_users');
	await sql.unsafe(
		`UPDATE matrix_users SET string = COALESCE(string, '{}'::jsonb) || jsonb_build_object('dd132'::text, $1::text::jsonb)
		 WHERE section_tipo = 'dd128' AND section_id = $2`,
		[JSON.stringify([{ id: 1, lang: 'lg-nolan', value: 'Widget Probe' }]), fixtures.user],
	);
	const userLocator = (from: string) => [
		{
			id: 1,
			type: 'dd151',
			section_id: String(fixtures.user),
			section_tipo: 'dd128',
			from_component_tipo: from,
		},
	];
	const statsId = track('dd1521', await createSectionRecord('dd1521', -1), 'matrix_stats');
	const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000);
	await sql.unsafe(
		`UPDATE matrix_stats SET
		   relation = COALESCE(relation, '{}'::jsonb) || jsonb_build_object('dd1522'::text, $1::text::jsonb),
		   string = COALESCE(string, '{}'::jsonb) || jsonb_build_object('dd1531'::text, $2::text::jsonb),
		   date = COALESCE(date, '{}'::jsonb) || jsonb_build_object('dd1530'::text, $3::text::jsonb),
		   misc = COALESCE(misc, '{}'::jsonb) || jsonb_build_object('dd1523'::text, $4::text::jsonb)
		 WHERE section_tipo = 'dd1521' AND section_id = $5`,
		[
			JSON.stringify(userLocator('dd1522')),
			JSON.stringify([{ id: 1, lang: 'lg-nolan', value: 'day' }]),
			JSON.stringify([
				{
					id: 1,
					start: {
						year: twoDaysAgo.getFullYear(),
						month: twoDaysAgo.getMonth() + 1,
						day: twoDaysAgo.getDate(),
						// dd_date virtual seconds — the PHP date-range search matches
						// on it; a stats row without `time` is invisible to PHP tier 1
						time:
							(twoDaysAgo.getFullYear() * 372 +
								twoDaysAgo.getMonth() * 31 +
								(twoDaysAgo.getDate() - 1)) *
							86400,
					},
				},
			]),
			JSON.stringify([
				{
					id: 1,
					lang: 'lg-nolan',
					value: [
						{ type: 'what', tipo: 'dd700', value: 3, label: 'Guardar' },
						{ type: 'where', tipo: ARCHIVES, value: 2 },
						{ type: 'when', hour: 10, value: 5 },
					],
				},
			]),
			statsId,
		],
	);
	// today's live activity row (synthetic high section_id, dd1758-test pattern).
	// TODAY is computed at run time — a hardcoded date here is a calendar
	// time-bomb: the original {2026-07-10} literal turned the today-supplement
	// pins red at the first midnight (caught 2026-07-11). Hour stays 14, the
	// value the `when` pins key on.
	const today = new Date();
	const activityId = 999999901;
	// timestamp must be DEDALO_TIMEZONE wall-clock (dbTimestamp), NOT now():
	// now() is UTC, so between local midnight and the zone offset the row reads
	// as YESTERDAY to the engines' today-filter (the S1-03 lesson; second half
	// of the calendar time-bomb caught 2026-07-11 just after midnight).
	const { dbTimestamp } = await import('../../src/core/db/db_timestamp.ts');
	await sql.unsafe(
		`INSERT INTO matrix_activity (section_id, section_tipo, timestamp, relation, string, date)
		 VALUES ($1, 'dd542', $5, $2::text::jsonb, $3::text::jsonb, $4::text::jsonb)`,
		[
			activityId,
			JSON.stringify({
				dd543: userLocator('dd543'),
				dd545: [
					{ type: 'dd151', section_id: '6', section_tipo: 'dd42', from_component_tipo: 'dd545' },
				],
			}),
			JSON.stringify({ dd546: [{ lang: 'lg-nolan', value: ARCHIVES }] }),
			JSON.stringify({
				dd547: [
					{
						start: {
							year: today.getFullYear(),
							month: today.getMonth() + 1,
							day: today.getDate(),
							hour: 14,
						},
					},
				],
			}),
			dbTimestamp(),
		],
	);
	track('dd542', activityId, 'matrix_activity');
}, 60000);

afterAll(async () => {
	if (!hasLivePhpOracle()) return;
	const leaked: string[] = [];
	for (const row of created) {
		const deleted = (await sql.unsafe(
			`DELETE FROM ${row.table} WHERE section_tipo = $1 AND section_id = $2 RETURNING id`,
			[row.sectionTipo, row.sectionId],
		)) as unknown[];
		if (deleted.length === 0) {
			leaked.push(`${row.sectionTipo}/${row.sectionId} (table ${row.table})`);
		}
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
			[row.sectionTipo, row.sectionId],
		);
	}
	expect(await dropTestCorpus([ARCHIVES])).toBe(0);
	if (leaked.length > 0) {
		throw new Error(
			`Scratch cleanup targeted the wrong matrix table — leaked: ${leaked.join(', ')}`,
		);
	}
});

describe.if(hasLivePhpOracle())('dd_component_info get_widget_data differential', () => {
	test('state widget: single-widget compute envelope (scratch record, real vocab)', async () => {
		await expectEnvelopeParity(
			widgetRqo(PERSON_STATE_INFO, PERSONS, fixtures.stateRecord, 'state'),
			{
				nonEmpty: true,
				expectStateItems: true,
			},
		);
	});

	test('get_archive_weights: single-widget compute envelope (scratch archive)', async () => {
		await expectEnvelopeParity(
			widgetRqo(ARCHIVE_INFO, ARCHIVES, fixtures.archive, 'get_archive_weights'),
			{ nonEmpty: true },
		);
	});

	test('unknown widget_name: the PHP Empty-widget_obj refusal ⇒ widget.not_defined', async () => {
		await expectRefusalParity(
			widgetRqo(ARCHIVE_INFO, ARCHIVES, fixtures.archive, 'no_such_widget'),
			'widget.not_defined',
		);
	});

	test('widgets-less tipo: the PHP Empty-defined-widgets refusal ⇒ widget.empty', async () => {
		await expectRefusalParity(
			widgetRqo(WIDGETLESS, PERSONS, fixtures.stateRecord, 'state'),
			'widget.empty',
		);
	});

	test('user_activity (async): three-tier totals — BOTH engines pinned (PHP tier-1 live defect)', async () => {
		// (!) PHP LIVE DEFECT (oracle-verified 2026-07-10): cross_users_range_data
		// finds the dd1521 rows but never decodes the misc totals select — tier 1
		// aggregates NOTHING on live PHP (saved history never shows; only the
		// today supplement / live fallback carry data), and the who dimension is
		// dead (array_find over the relation column's per-tipo arrays). TS
		// implements tier 1 correctly, mirrors the dead who, and this test pins
		// EACH engine against its own deterministic expectation over the scratch
		// fixtures. When the PHP pin fails, PHP fixed the decode — reconcile.
		const rqo = widgetRqo('dd1537', 'dd128', fixtures.user, 'user_activity');
		const phpBody = (await php.call(structuredClone(rqo))).body as {
			result?: { value?: Record<string, unknown> }[];
			msg?: unknown;
			errors?: unknown;
		};
		const tsBody = (await dispatchRqo(structuredClone(rqo) as never, tsContext as never)).body as {
			ok?: boolean;
			data?: { value?: Record<string, unknown> }[];
		};
		// Envelope v2: the async delivery SUCCEEDS (the PHP-era {msg, errors}
		// prose is not a wire fact; the payload pins below carry the contract).
		expect(tsBody.ok).toBe(true);

		const { termByTipo } = await import('../../src/core/ontology/labels.ts');
		// Session data lang on both engines (the root PHP session + tsContext).
		const editLabel = await termByTipo('dd694', 'lg-spa');
		const saveLabel = await termByTipo('dd700', 'lg-spa');
		const whereLabel = await termByTipo(ARCHIVES, 'lg-spa');
		const zeroWhen = Array.from({ length: 24 }, (_, hour) => ({
			key: hour,
			label: String(hour).padStart(2, '0'),
			value: 0,
		}));

		// PHP: tier 1 dead → the zero canonical + ONLY today's activity merged.
		const phpValue = phpBody.result?.[0]?.value as Record<string, unknown>;
		expect(phpValue.what).toEqual([{ key: 'dd694', label: editLabel, value: 1 }] as never);
		expect(phpValue.where).toEqual([{ key: ARCHIVES, label: whereLabel, value: 1 }] as never);
		expect(phpValue.who).toEqual([] as never);
		expect(phpValue.when).toEqual(
			zeroWhen.map((entry) => (entry.key === 14 ? { ...entry, value: 1 } : entry)) as never,
		);

		// TS: tier 1 WORKS → saved stats day + today merged (who stays dead —
		// PHP-mirrored) — the widget actually shows the saved history.
		const tsValue = tsBody.data?.[0]?.value as Record<string, unknown>;
		expect(tsValue.what).toEqual([
			{ key: 'dd700', label: saveLabel, value: 3 },
			{ key: 'dd694', label: editLabel, value: 1 },
		] as never);
		expect(tsValue.where).toEqual([{ key: ARCHIVES, label: whereLabel, value: 3 }] as never);
		expect(tsValue.who).toEqual([] as never);
		expect(tsValue.when).toEqual(
			zeroWhen.map((entry) =>
				entry.key === 10
					? { ...entry, value: 5 }
					: entry.key === 14
						? { ...entry, value: 1 }
						: entry,
			) as never,
		);
		expect(tsValue.publish).toEqual([] as never);
	});
});
