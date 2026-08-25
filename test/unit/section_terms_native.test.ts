/**
 * get_section_terms — the batch section_map term resolver (dd_core_api :1269,
 * PHP dd_core_api::get_section_terms :3482).
 *
 * Structure (CRAP tier 3.5): the weight is on the PURE layer, because the input
 * rules — safe_tipo grammar, section_id shape, first-occurrence dedup, the 1000
 * batch cap — are unprovable at the handler (a hostile tipo yields `{}`
 * downstream anyway, so a deleted SAFE_TIPO guard would still look green).
 * They were extracted VERBATIM into handlers/section_terms.ts; the source
 * assertions below pin the REWIRE, so a revert that re-inlines the loop (and
 * leaves the pure module orphaned but green) fails here.
 *
 * DB tier: only the two policy branches the pure layer cannot see — the
 * per-section read permission and the "no section_map term" skip — each with a
 * same-request positive control, so "everything was dropped" can never pass for
 * the wrong reason. Read-only: no scratch record is written (namespace
 * 945000-945999 stays unused), the canonical test3 playground is only read.
 *
 * Deliberately NOT tested here (see the plan): a dedupe assertion at the DB tier
 * (the response is an object — its keys dedupe by construction) and a 1000-cap
 * assertion at the DB tier (`<= 1000` is satisfied by an empty map).
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ApiRequestContext } from '../../src/core/api/handler_context.ts';
import { coreApiActions } from '../../src/core/api/handlers/dd_core_api.ts';
import {
	MAX_TERM_LOCATORS,
	normalizeTermLocators,
} from '../../src/core/api/handlers/section_terms.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import { getPermissions, type Principal } from '../../src/core/security/permissions.ts';
import { getTermByLocator, getTermTipos } from '../../src/core/ts_object/term_resolver.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');

// ---------------------------------------------------------------------------
// PURE — normalizeTermLocators
// ---------------------------------------------------------------------------

describe('normalizeTermLocators — validation', () => {
	test('the seven malformed shapes die per-case, valid neighbours survive', () => {
		const cases: { entry: unknown; label: string; survives: boolean }[] = [
			{ entry: null, label: 'null', survives: false },
			{ entry: undefined, label: 'undefined', survives: false },
			{ entry: 'DROP TABLE', label: 'a bare string', survives: false },
			{ entry: 42, label: 'a number', survives: false },
			{ entry: [{ section_tipo: 'test3', section_id: 1 }], label: 'an array', survives: false },
			{ entry: { section_tipo: 'test3' }, label: 'section_id missing', survives: false },
			{
				entry: { section_tipo: 'test3', section_id: null },
				label: 'section_id null',
				survives: false,
			},
			{
				entry: { section_tipo: 'test3', section_id: '' },
				label: 'section_id empty string',
				survives: false,
			},
			{
				entry: { section_tipo: 'test3', section_id: {} },
				label: 'section_id object',
				survives: false,
			},
			{
				entry: { section_tipo: 'test3', section_id: true },
				label: 'section_id boolean',
				survives: false,
			},
			{ entry: { section_tipo: '', section_id: 1 }, label: 'section_tipo empty', survives: false },
			{
				entry: { section_tipo: 42, section_id: 1 },
				label: 'section_tipo not a string',
				survives: false,
			},
			{
				entry: { section_tipo: 'Test3', section_id: 1 },
				label: 'section_tipo uppercase',
				survives: false,
			},
			{
				entry: { section_tipo: 'test', section_id: 1 },
				label: 'section_tipo without digits',
				survives: false,
			},
			{
				entry: { section_tipo: '3test', section_id: 1 },
				label: 'section_tipo digit-first',
				survives: false,
			},
			{
				entry: { section_tipo: 'test3; DROP TABLE matrix', section_id: 1 },
				label: 'SQL in the tipo',
				survives: false,
			},
			{
				entry: { section_tipo: 'test3', section_id: '1; DROP TABLE matrix' },
				label: 'SQL in the id (a string id is legal)',
				survives: true,
			},
			{
				entry: { section_tipo: 'test3', section_id: 0 },
				label: 'section_id numeric zero',
				survives: true,
			},
			{
				entry: { section_tipo: 'test3', section_id: '05' },
				label: 'section_id string form',
				survives: true,
			},
			{
				entry: { section_tipo: 'test3', section_id: 1, extra: 'x' },
				label: 'extra keys',
				survives: true,
			},
		];
		for (const { entry, label, survives } of cases) {
			const out = normalizeTermLocators([entry]);
			expect(out.length, `${label} should ${survives ? 'survive' : 'be dropped'}`).toBe(
				survives ? 1 : 0,
			);
		}
	});

	test("'DROP TABLE' dies IN normalization — the tipo never reaches a resolver", () => {
		const out = normalizeTermLocators([
			{ section_tipo: 'DROP TABLE matrix', section_id: 1 },
			{ section_tipo: "test3'--", section_id: 1 },
			{ section_tipo: 'test3', section_id: 1 },
		]);
		expect(out).toEqual([{ key: 'test3_1', section_tipo: 'test3', section_id: 1 }]);
	});

	test('section_id keeps its INCOMING form — no string/number coercion', () => {
		const out = normalizeTermLocators([
			{ section_tipo: 'test3', section_id: '05' },
			{ section_tipo: 'test3', section_id: 5 },
		]);
		// '05' and 5 are DIFFERENT composite keys — the map is keyed by the
		// client's own form (that is what the graph view looks its nodes up by).
		expect(out).toEqual([
			{ key: 'test3_05', section_tipo: 'test3', section_id: '05' },
			{ key: 'test3_5', section_tipo: 'test3', section_id: 5 },
		]);
		expect(typeof out[0]?.section_id).toBe('string');
		expect(typeof out[1]?.section_id).toBe('number');
	});

	test('a non-array input yields an empty batch', () => {
		expect(normalizeTermLocators('x')).toEqual([]);
		expect(normalizeTermLocators(null)).toEqual([]);
		expect(normalizeTermLocators(undefined)).toEqual([]);
		expect(normalizeTermLocators({ section_tipo: 'test3', section_id: 1 })).toEqual([]);
		expect(normalizeTermLocators([])).toEqual([]);
	});
});

describe('normalizeTermLocators — dedup', () => {
	test('three duplicates collapse to one, first occurrence wins', () => {
		const out = normalizeTermLocators([
			{ section_tipo: 'test3', section_id: 1, mark: 'first' },
			{ section_tipo: 'test3', section_id: 1, mark: 'second' },
			{ section_tipo: 'test3', section_id: 1, mark: 'third' },
		]);
		expect(out.length).toBe(1);
		expect(out[0]).toEqual({ key: 'test3_1', section_tipo: 'test3', section_id: 1 });
	});

	test('dedup is per composite key, not per tipo', () => {
		const out = normalizeTermLocators([
			{ section_tipo: 'test3', section_id: 1 },
			{ section_tipo: 'test3', section_id: 2 },
			{ section_tipo: 'testgeoa1', section_id: 1 },
			{ section_tipo: 'test3', section_id: 1 },
		]);
		expect(out.map((entry) => entry.key)).toEqual(['test3_1', 'test3_2', 'testgeoa1_1']);
	});
});

describe('normalizeTermLocators — the 1000 cap', () => {
	test('1500 distinct entries → exactly 1000 survivors, the 1001st key ABSENT', () => {
		const raw = Array.from({ length: 1500 }, (_, index) => ({
			section_tipo: 'test3',
			section_id: index + 1,
		}));
		const out = normalizeTermLocators(raw);
		expect(out.length).toBe(1000);
		expect(MAX_TERM_LOCATORS).toBe(1000);
		const keys = new Set(out.map((entry) => entry.key));
		expect(keys.has('test3_1')).toBe(true);
		expect(keys.has('test3_1000')).toBe(true); // the 1000th survives
		expect(keys.has('test3_1001')).toBe(false); // the 1001st does not
		expect(keys.has('test3_1500')).toBe(false);
	});

	test('exactly 1000 entries are NOT truncated (boundary)', () => {
		const raw = Array.from({ length: 1000 }, (_, index) => ({
			section_tipo: 'test3',
			section_id: index + 1,
		}));
		expect(normalizeTermLocators(raw).length).toBe(1000);
	});

	test('the cap is applied to the RAW batch — malformed entries consume slots', () => {
		// PHP order (:3491): truncate first, validate second. 1000 nulls followed
		// by 5 valid locators therefore yields NOTHING — the valid tail was cut
		// before it was ever looked at. If the cap moved AFTER validation this
		// would return 5.
		const raw: unknown[] = [
			...Array.from({ length: 1000 }, () => null),
			...Array.from({ length: 5 }, (_, index) => ({
				section_tipo: 'test3',
				section_id: index + 1,
			})),
		];
		expect(normalizeTermLocators(raw)).toEqual([]);
	});

	test('the cap counts RAW entries, not deduped survivors', () => {
		// 1200 copies of one locator + 3 distinct ones at the tail: the tail is
		// truncated away even though the survivor count is far below the cap.
		const raw: unknown[] = [
			...Array.from({ length: 1200 }, () => ({ section_tipo: 'test3', section_id: 1 })),
			{ section_tipo: 'test3', section_id: 2 },
			{ section_tipo: 'test3', section_id: 3 },
			{ section_tipo: 'test3', section_id: 4 },
		];
		expect(normalizeTermLocators(raw).map((entry) => entry.key)).toEqual(['test3_1']);
	});
});

// ---------------------------------------------------------------------------
// REWIRE — the handler must CALL the extraction, and the inline loop be gone
// ---------------------------------------------------------------------------

describe('get_section_terms is REWIRED onto normalizeTermLocators', () => {
	const handlerSource = readFileSync(
		join(REPO_ROOT, 'src/core/api/handlers/dd_core_api.ts'),
		'utf-8',
	);

	test('the handler calls the extraction', () => {
		expect(handlerSource).toContain("import { normalizeTermLocators } from './section_terms.ts';");
		expect(handlerSource).toContain('normalizeTermLocators(rawLocators)');
	});

	test('the inline validate/dedup/cap code is DELETED from the handler', () => {
		// Each marker is a line the extraction replaced. A revert that re-inlines
		// the loop — leaving the pure module green but orphaned — fails here.
		for (const marker of [
			'const maxLocators = 1000',
			'locatorEntries.slice(0, maxLocators)',
			'if (key in terms) continue',
			'SAFE_TIPO.test(sectionTipo)',
			'batch exceeds cap',
		]) {
			expect(handlerSource, `re-inlined into dd_core_api.ts: ${marker}`).not.toContain(marker);
		}
	});
});

// ---------------------------------------------------------------------------
// HANDLER — credless envelope (returns before any DB work)
// ---------------------------------------------------------------------------

function principalContext(principal: Principal): ApiRequestContext {
	return {
		requestId: 'section-terms-test',
		clientIp: '127.0.0.1',
		session: {
			userId: principal.userId,
			username: 'test',
			isGlobalAdmin: principal.isGlobalAdmin,
			csrfToken: 'tok',
			applicationLang: null,
			dataLang: null,
		},
		csrfCandidate: 'tok',
		principal,
	} as unknown as ApiRequestContext;
}

const ADMIN: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true } as Principal;
/** A user with no dd774 grant at all — the fail-closed side of the read gate. */
const NO_GRANT: Principal = {
	userId: 945001,
	isGlobalAdmin: false,
	isDeveloper: false,
} as Principal;

async function callTerms(
	rqoExtras: Record<string, unknown>,
	principal: Principal = ADMIN,
): Promise<{ status: number; body: Record<string, unknown> }> {
	const handler = coreApiActions.get_section_terms;
	expect(handler, 'get_section_terms is not registered in coreApiActions').toBeDefined();
	const outcome = await (handler as NonNullable<typeof handler>)(
		{ action: 'get_section_terms', dd_api: 'dd_core_api', ...rqoExtras } as unknown as Rqo,
		principalContext(principal),
	);
	return { status: outcome.status, body: outcome.body as Record<string, unknown> };
}

/**
 * ENVELOPE v2 (engineering/ERRORS_SPEC.md §4): the PHP `{result:false,
 * msg:'Error. Invalid or empty locators', errors:['bad_locators']}` body is now
 * a THROWN `section.bad_locators` (400) — the exact code the parity reconciler
 * maps the frozen PHP body to (test/parity/normalize.ts FROZEN_ERROR_BODIES).
 */
describe('get_section_terms — bad locators refusal (credless)', () => {
	async function refusalOf(rqoExtras: Record<string, unknown>): Promise<DedaloError> {
		const outcome = await callTerms(rqoExtras).then(
			(value) => ({ threw: false as const, value }),
			(error: unknown) => ({ threw: true as const, error }),
		);
		if (!outcome.threw) {
			throw new Error(`expected a refusal, got ${JSON.stringify(outcome.value)}`);
		}
		if (!(outcome.error instanceof DedaloError)) throw outcome.error;
		return outcome.error;
	}

	test('missing locators → the registered refusal', async () => {
		const refusal = await refusalOf({});
		expect(refusal.code).toBe('section.bad_locators');
		expect(refusal.spec.status).toBe(400);
	});

	test('empty locators array → the registered refusal', async () => {
		expect((await refusalOf({ locators: [] })).code).toBe('section.bad_locators');
	});

	test('a non-array locators value → the registered refusal', async () => {
		for (const locators of ['x', 42, null, { section_tipo: 'test3', section_id: 1 }]) {
			expect((await refusalOf({ locators })).code).toBe('section.bad_locators');
		}
	});
});

// ---------------------------------------------------------------------------
// DB TIER — the two policy branches, each with a same-request positive control
// ---------------------------------------------------------------------------

describe('get_section_terms — policy branches (DB, read-only)', () => {
	const TERMED = { section_tipo: 'test3', section_id: 1 }; // canonical test3 record
	const UNTERMED = { section_tipo: 'test61', section_id: 1 }; // no section_map term

	test('FIXTURE precondition: test3 has a section_map term, test61 has none', async () => {
		// A missing fixture must FAIL, never silently green the branch tests.
		expect(await getTermTipos('test3', null)).not.toEqual([]);
		expect(await getTermTipos('test61', null)).toEqual([]);
		const term = await getTermByLocator(TERMED, 'lg-spa', true, null);
		expect(typeof term).toBe('string');
		expect((term as string).length).toBeGreaterThan(0);
		expect(term).not.toBe('test3_1'); // not the "{tipo}_{id}" fallback
	});

	test('a principal without the read grant gets {} — admin control resolves the SAME batch', async () => {
		const locators = [TERMED];
		expect(await getPermissions(NO_GRANT, 'test3', 'test3')).toBeLessThan(1);

		const denied = await callTerms({ locators, lang: 'lg-spa' }, NO_GRANT);
		expect(denied.status).toBe(200);
		expect(denied.body.data).toEqual({});

		// Same locators, same request shape, admin principal: the batch is good,
		// so the empty map above is the permission gate and not a broken fixture.
		const allowed = await callTerms({ locators, lang: 'lg-spa' }, ADMIN);
		expect(allowed.status).toBe(200);
		const terms = allowed.body.data as Record<string, unknown>;
		expect(Object.keys(terms)).toEqual(['test3_1']);
		expect(typeof terms.test3_1).toBe('string');
	});

	test('a PERMITTED section with no section_map term is omitted — the termed one is not', async () => {
		expect(await getPermissions(ADMIN, 'test61', 'test61')).toBeGreaterThanOrEqual(1);

		const { status, body } = await callTerms(
			{ locators: [UNTERMED, TERMED], lang: 'lg-spa' },
			ADMIN,
		);
		expect(status).toBe(200);
		const terms = body.data as Record<string, unknown>;
		// The skip is the term gate, not the permission gate (asserted above),
		// and the same-request control proves the request itself resolved.
		expect(Object.keys(terms)).toEqual(['test3_1']);
		expect('test61_1' in terms).toBe(false);
		expect(body.ok).toBe(true);
	});
});
