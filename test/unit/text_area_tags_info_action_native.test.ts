/**
 * CRAP item 2.23b — `get_tags_info`
 * (api/handlers/dd_component_text_area_api.ts:25), the resolved-tag feed of a
 * transcription (tool_tr_print's only source).
 *
 * Branch inventory of the ACTION (buildTagsInfo itself is gated elsewhere;
 * what is pinned here is the door: argument refusals, the AUTHZ-01 record
 * gate, the lang choice and the unknown-type report), in execution order:
 *  1. requirePrincipal — no anonymous read;
 *  2. coordinate refusal: missing tipo / section_tipo / section_id ⇒
 *     `errors:['bad_source']` + the byte-exact message. `section_id: 0` is
 *     NOT a coordinate refusal — it survives to the record gate (and is
 *     refused there, by record_scope's `sectionId < 1`);
 *  3. options refusal: absent `ar_type`, a non-array, or an array with no
 *     string ⇒ `errors:['bad_options']` — checked BEFORE the record gate;
 *  4. AUTHZ-01 (TS-stronger than PHP): an EXISTING record outside the
 *     caller's scope ⇒ the forbidden envelope, and NO tags shape leaks;
 *  5. lang: `source.lang` when a non-empty string, else currentDataLang();
 *     the transcription text is per-lang, so the wrong lang resolves nothing;
 *  6. unknown requested types are NAMED in `msg` (never silently narrowed),
 *     known-only ⇒ `msg === []`.
 *
 * Scratch surface (namespace: rsc167 ids 934100-934199): matrix rsc167/934100 —
 * an rsc36 transcription (lg-spa ONLY) carrying a note mark, plus an rsc860
 * index locator. Direct INSERT (no counter bump); swept in afterAll with its
 * matrix_time_machine tail, fail-loud on residue. The note mark points at
 * rsc326/934101, a record that deliberately does NOT exist (the missing-note
 * ddo defaults are the deterministic, in-namespace shape); no rsc326 row is
 * ever written. No dd_ontology write anywhere in this file.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { ApiRequestContext } from '../../src/core/api/handler_context.ts';
import { componentTextAreaApiActions } from '../../src/core/api/handlers/dd_component_text_area_api.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import type { Session } from '../../src/core/security/session_store.ts';
import { mustGet } from '../helpers/assert.ts';

const SECTION = 'rsc167'; // matrix
const SECTION_ID = 934100; // scratch band 934100-934199
const TEXT_AREA = 'rsc36'; // component_text_area, translatable; declares tags_index/tags_notes
const NOTE_SECTION = 'rsc326'; // properties.tags_notes key — never written by this file
const MISSING_NOTE_ID = '934101'; // deliberately absent record

/** The transcription, stored ONLY in lg-spa (the lang half of the file). */
const SPA_TEXT =
	'<p>uno [index-n-1-Person-data:x:data]dos[/index-n-1] tres' +
	` [note-a-1-data:{'section_tipo':'${NOTE_SECTION}','section_id':'${MISSING_NOTE_ID}'}:data] fin.</p>`;

const ADMIN: Principal = { userId: 1, isGlobalAdmin: true, isDeveloper: true };
/** No user record, hence no projects: every non-admin record scope check fails. */
const NO_ACCESS: Principal = { userId: 999999, isGlobalAdmin: false, isDeveloper: false };

const contextFor = (principal: Principal): ApiRequestContext => ({
	requestId: 'crap-2-23b',
	clientIp: '127.0.0.1',
	session: {
		userId: principal.userId,
		username: `scratch_${principal.userId}`,
		isGlobalAdmin: principal.isGlobalAdmin,
		csrfToken: 'x',
		applicationLang: null,
		dataLang: null,
	} as Session,
	csrfCandidate: null,
	principal,
});

const contextWithoutPrincipal = (): ApiRequestContext => ({
	requestId: 'crap-2-23b',
	clientIp: '127.0.0.1',
	session: null,
	csrfCandidate: null,
});

const rqoOf = (source: unknown, options?: unknown): Rqo =>
	({
		action: 'get_tags_info',
		dd_api: 'dd_component_text_area_api',
		source,
		options,
	}) as unknown as Rqo;

const getTagsInfo = mustGet(componentTextAreaApiActions.get_tags_info, 'get_tags_info handler');

/** The full host source, with optional lang override. */
const hostSource = (extra: Record<string, unknown> = {}) => ({
	tipo: TEXT_AREA,
	section_tipo: SECTION,
	section_id: SECTION_ID,
	...extra,
});

async function purgeScratch(): Promise<void> {
	await sql.unsafe('DELETE FROM matrix WHERE section_tipo = $1 AND section_id = $2', [
		SECTION,
		SECTION_ID,
	]);
	await sql.unsafe('DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2', [
		SECTION,
		SECTION_ID,
	]);
}

beforeAll(async () => {
	await purgeScratch(); // belt and braces: a crashed earlier run
	await sql.unsafe(
		'INSERT INTO matrix (section_id, section_tipo, string, relation) VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb)',
		[
			SECTION_ID,
			SECTION,
			JSON.stringify({ [TEXT_AREA]: [{ id: 1, lang: 'lg-spa', value: SPA_TEXT }] }),
			JSON.stringify({
				rsc860: [
					{
						id: 1,
						type: 'dd151',
						section_id: 1, // NUMERIC on purpose: the wire law stringifies it
						section_tipo: 'test3',
						from_component_tipo: 'rsc860',
					},
				],
			}),
		],
	);
});

afterAll(async () => {
	await purgeScratch();
	const residue = (await sql.unsafe(
		'SELECT id FROM matrix WHERE section_tipo = $1 AND section_id = $2',
		[SECTION, SECTION_ID],
	)) as unknown[];
	const tmResidue = (await sql.unsafe(
		'SELECT id FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
		[SECTION, SECTION_ID],
	)) as unknown[];
	// The note target must never have been created by this file.
	const noteResidue = (await sql.unsafe(
		'SELECT id FROM matrix WHERE section_tipo = $1 AND section_id = $2',
		[NOTE_SECTION, Number(MISSING_NOTE_ID)],
	)) as unknown[];
	if (residue.length > 0 || tmResidue.length > 0 || noteResidue.length > 0) {
		throw new Error(
			`scratch residue: ${residue.length} matrix + ${tmResidue.length} TM row(s) for ${SECTION}/${SECTION_ID}, ${noteResidue.length} ${NOTE_SECTION} row(s)`,
		);
	}
});

const BAD_SOURCE_BODY = {
	result: false,
	msg: [' Bad request: source.tipo, source.section_tipo and source.section_id are mandatory'],
	errors: ['bad_source'],
};
const BAD_OPTIONS_BODY = {
	result: false,
	msg: [' Bad request: options.ar_type must be a non-empty array of tag types'],
	errors: ['bad_options'],
};
const FORBIDDEN_BODY = { result: false, msg: [' Forbidden record'], errors: ['forbidden'] };

describe('get_tags_info — argument refusals', () => {
	test('no seeded principal ⇒ requirePrincipal throws (never an anonymous feed)', async () => {
		await expect(
			getTagsInfo(rqoOf(hostSource(), { ar_type: ['index'] }), contextWithoutPrincipal()),
		).rejects.toThrow(/no authenticated principal/);
	});

	test('each missing coordinate ⇒ bad_source, byte-exact', async () => {
		const cases: unknown[] = [
			{},
			{ section_tipo: SECTION, section_id: SECTION_ID }, // no tipo
			{ tipo: TEXT_AREA, section_id: SECTION_ID }, // no section_tipo
			{ tipo: TEXT_AREA, section_tipo: SECTION }, // no section_id
			{ tipo: TEXT_AREA, section_tipo: SECTION, section_id: null },
			{ tipo: '', section_tipo: SECTION, section_id: SECTION_ID },
		];
		for (const source of cases) {
			const result = await getTagsInfo(rqoOf(source, { ar_type: ['index'] }), contextFor(ADMIN));
			expect(result).toEqual({ status: 200, body: BAD_SOURCE_BODY });
		}
	});

	test('section_id 0 is NOT a coordinate refusal — it reaches the record gate', async () => {
		const result = await getTagsInfo(
			rqoOf({ tipo: TEXT_AREA, section_tipo: SECTION, section_id: 0 }, { ar_type: ['index'] }),
			contextFor(ADMIN),
		);
		// Admin, so the ONLY thing that can refuse here is record_scope's
		// `sectionId < 1` — proving the coordinate check let 0 through.
		expect(result).toEqual({ status: 200, body: FORBIDDEN_BODY });
	});

	test('a missing / non-array / string-less ar_type ⇒ bad_options, byte-exact', async () => {
		const cases: unknown[] = [
			undefined,
			{},
			{ ar_type: 'index' },
			{ ar_type: [] },
			{ ar_type: [42] },
		];
		for (const options of cases) {
			const result = await getTagsInfo(rqoOf(hostSource(), options), contextFor(ADMIN));
			expect(result).toEqual({ status: 200, body: BAD_OPTIONS_BODY });
		}
	});

	test('the options refusal is decided BEFORE the record gate', async () => {
		// An out-of-scope caller on a bad-options request still gets bad_options:
		// the order in the handler is arguments → authz.
		const result = await getTagsInfo(rqoOf(hostSource(), { ar_type: [] }), contextFor(NO_ACCESS));
		expect(result.body).toEqual(BAD_OPTIONS_BODY);
	});
});

describe('get_tags_info — AUTHZ-01 record gate', () => {
	test('an EXISTING record outside the caller scope ⇒ forbidden envelope, no tags shape', async () => {
		const result = await getTagsInfo(
			rqoOf(hostSource(), { ar_type: ['index', 'note'] }),
			contextFor(NO_ACCESS),
		);
		expect(result).toEqual({ status: 200, body: FORBIDDEN_BODY });
	});

	test('the SAME record + an admin principal passes the gate (the refusal is scope, not fixture)', async () => {
		const result = await getTagsInfo(
			rqoOf(hostSource(), { ar_type: ['index'] }),
			contextFor(ADMIN),
		);
		const body = result.body as { result: { tags_index?: unknown[] } };
		expect(body.result).not.toBe(false);
		expect(body.result.tags_index).toHaveLength(1);
	});
});

describe('get_tags_info — resolved payload', () => {
	test('index tags come back with STRING ids (WC-077/WC-065) and their term label', async () => {
		const result = await getTagsInfo(
			rqoOf(hostSource(), { ar_type: ['index'] }),
			contextFor(ADMIN),
		);
		expect(result.status).toBe(200);
		const body = result.body as { result: { tags_index: unknown[] }; msg: string[]; errors: [] };
		expect(body.msg).toEqual([]);
		expect(body.errors).toEqual([]);
		expect(body.result.tags_index).toEqual([
			{
				data: {
					id: 1,
					type: 'dd151',
					section_id: '1', // stringified from the stored NUMERIC 1
					section_tipo: 'test3',
					from_component_tipo: 'rsc860',
				},
				label: 'input text content of one', // canonical test3/1
			},
		]);
	});

	test('an unknown type is NAMED in msg and never silently narrows the payload', async () => {
		const result = await getTagsInfo(
			rqoOf(hostSource(), { ar_type: ['index', 'not_a_type'] }),
			contextFor(ADMIN),
		);
		const body = result.body as { result: { tags_index?: unknown[] }; msg: string[] };
		expect(body.msg).toEqual([' Unsupported tag type(s) ignored: not_a_type']);
		expect(body.result.tags_index).toHaveLength(1); // the known type still resolved
	});

	test('several unknown types are joined in one message', async () => {
		const result = await getTagsInfo(
			rqoOf(hostSource(), { ar_type: ['zzz_one', 'index', 'zzz_two'] }),
			contextFor(ADMIN),
		);
		expect((result.body as { msg: string[] }).msg).toEqual([
			' Unsupported tag type(s) ignored: zzz_one, zzz_two',
		]);
	});
});

describe('get_tags_info — the lang of the transcription', () => {
	/** buildTagsInfo can OMIT a key entirely, so never compare `undefined` to []. */
	const notesOf = (result: { body: unknown }): unknown[] =>
		((result.body as { result: { tags_notes?: unknown[] } }).result.tags_notes ?? []) as unknown[];

	test("source.lang 'lg-spa' resolves the note marks of the lg-spa text", async () => {
		const result = await getTagsInfo(
			rqoOf(hostSource({ lang: 'lg-spa' }), { ar_type: ['note'] }),
			contextFor(ADMIN),
		);
		expect(notesOf(result)).toEqual([
			{
				data: { section_tipo: NOTE_SECTION, section_id: MISSING_NOTE_ID },
				// the note RECORD does not exist: text ddos default to [], bool to false
				title: [],
				body: [],
				publishable: false,
			},
		]);
	});

	test("source.lang 'lg-eng' resolves NOTHING — the text is stored only in lg-spa", async () => {
		const result = await getTagsInfo(
			rqoOf(hostSource({ lang: 'lg-eng' }), { ar_type: ['note'] }),
			contextFor(ADMIN),
		);
		expect(notesOf(result)).toEqual([]);
	});

	test('an empty / absent source.lang falls back to currentDataLang (lg-spa here)', async () => {
		for (const source of [hostSource({ lang: '' }), hostSource()]) {
			const result = await getTagsInfo(rqoOf(source, { ar_type: ['note'] }), contextFor(ADMIN));
			expect(notesOf(result)).toHaveLength(1);
		}
	});

	test('a non-string source.lang is ignored (same fallback)', async () => {
		const result = await getTagsInfo(
			rqoOf(hostSource({ lang: 42 }), { ar_type: ['note'] }),
			contextFor(ADMIN),
		);
		expect(notesOf(result)).toHaveLength(1);
	});
});
