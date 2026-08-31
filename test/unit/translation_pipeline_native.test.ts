/**
 * THE BABEL TRANSLATION PIPELINE — native write-path gate (audit 2026-08 §5.6).
 *
 * Six defects this file exists to keep dead:
 *
 * 1. **Provider error text persisted as a translation.** `babelProvider` used to
 *    be a bare form POST whose response body was returned verbatim as the
 *    translated value. An Apertium box answering `Error: Mode sp-en not
 *    installed` therefore OVERWROTE the target-language slot with that sentence
 *    and reported success. PHP (tools/tool_lang/translators/class.babel.php:134)
 *    screens the raw body for the known error strings and returns
 *    `result === false`, which the caller treats as a hard stop.
 *
 * 2. **Dédalo marks sent to the translator unprotected.** PHP wraps every
 *    timecode / index / person / note / reference / svg / geo / page mark in
 *    `<apertium-notrans>` before sending (TR::addBabelTagsOnTheFly), decodes the
 *    HTML entities the engine returns, and strips the residual wrappers. Without
 *    that, Apertium rewrites the marks — and a mangled `[TC_…_TC]` breaks the
 *    alignment between a transcription and its recording, which is the single
 *    most expensive thing to lose in an oral-history archive.
 *
 * 3. **Concurrent "translate all" clobbering.** `translateAndWrite` did an
 *    unlocked read-modify-write, so two requests translating the SAME component
 *    into DIFFERENT languages both merged onto the same stale snapshot and the
 *    second write silently dropped the first language.
 *
 * 4. **A LEGACY non-array value destroyed by the merge.** Taking the lock was
 *    right; taking the merge BASE from `readMatrixKeyForUpdate` was not. It
 *    answers `[]` for a component whose stored value is a bare object (the
 *    pre-matrix_dd shape), which is indistinguishable from "no items" — so the
 *    merge wrote the new target language over the record's only existing one.
 *    The base must come from the read chokepoint (`readComponentItems`), the
 *    same decode that produced the source slice.
 *
 * 5. **The direction the translator is asked for.** PHP
 *    `babel::get_babel_direction` is `substr($lang, 3, 2)` — 'sp-en', with a
 *    German special case. The port asked for 'spa-eng', a mode the babel box
 *    does not have, which is how defect 1's `Error: Mode …` body arises at all.
 *
 * 6. **The provider error message truncated in the wrong unit.** PHP budgets 512
 *    BYTES; the port counted UTF-16 code units and could `slice` a surrogate
 *    pair in half. See WC-2026-08-09-provider-message-truncation-boundary.
 *
 * DB surface: the scratch section `test2` (→ matrix_test) at reserved
 * 9174xx ids, with a REAL translatable component (testmint1002, input_text,
 * translatable → the `string` column). Rows + TM audit rows are cleaned before
 * and after.
 */
// Generic-TLD migration 2026-08-20 (AGENTS.md hard rule). Install tipos were replaced
// by their twins (src/core/test_data/test_tld_tipo_map.json); the seed-shipped ones
// (rsc/dd/hierarchy/ontology/lg) ship with every installation and stay, spelled through
// `seed()` so the census can tell a reference from a binding.

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { MATRIX_JSONB_COLUMNS, readMatrixRecord } from '../../src/core/db/matrix.ts';
import { updateMatrixRecord } from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';
import {
	addBabelNotransTags,
	BABEL_INVALID_RESPONSES,
	decodeBabelEntities,
	sanitizeBabelResult,
} from '../../src/core/tools/babel.ts';
import {
	babelDirection,
	babelProvider,
	defaultTranslationSourceLang,
	type TranslationProvider,
	translateAndWrite,
	truncateProviderMessage,
} from '../../src/core/tools/translation.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

// A PUBLIC IP LITERAL, deliberately. The provider now goes through
// `fetchGuardedText`, which RESOLVES a DNS name before fetching — so a
// `.example.org` stub URI would make this suite depend on a DNS answer (and
// fail closed offline). A literal takes the guard's no-lookup path, so the run
// stays hermetic while exercising the real guard instead of stepping around it.
// 93.184.216.34 is IANA's example-address; nothing is ever dialled, since the
// fetch itself is stubbed below.
const URI = 'https://93.184.216.34/translate';
const TEST_TABLE = 'matrix_test';
const SECTION_TIPO = 'test2';
/** input_text, translatable → 'string' column, one item per language. */
const COMPONENT_TIPO = 'testmint1002';
const MODEL = 'component_input_text';
const ERROR_ID = 917481;
const RACE_ID = 917482;
const LEGACY_ID = 917483;
const SCRATCH_IDS = [ERROR_ID, RACE_ID, LEGACY_ID];

// ---------------------------------------------------------------------------
// fetch seam
// ---------------------------------------------------------------------------

const REAL_FETCH = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = REAL_FETCH;
});

/** The `text` field of the last POST the provider issued. */
let lastPostedText: string | null = null;

/** Install a fake Babel endpoint answering `respond(postedText)` with 200. */
function stubBabel(respond: (postedText: string) => string): void {
	globalThis.fetch = (async (_url: unknown, init: { body?: unknown }) => {
		const body = init.body as URLSearchParams;
		lastPostedText = body.get('text') ?? '';
		return new Response(respond(lastPostedText), { status: 200 });
	}) as unknown as typeof fetch;
}

/** PHP htmlspecialchars-ish encoding: Babel returns specials as entities. */
function toEntities(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * An Apertium-shaped engine: it "translates" (upper-cases) everything OUTSIDE
 * an `<apertium-notrans>` element, leaves the protected content alone, and
 * entity-encodes the specials of both — exactly the behaviour the PHP pipeline
 * was written against.
 */
function fakeApertium(text: string): string {
	const parts = text.split(/(<apertium-notrans>[\s\S]*?<\/apertium-notrans>)/);
	return parts
		.map((part, index) => {
			if (index % 2 === 1) {
				const inner = part.slice('<apertium-notrans>'.length, -'</apertium-notrans>'.length);
				return `<apertium-notrans>${toEntities(inner)}</apertium-notrans>`;
			}
			return toEntities(part.toUpperCase());
		})
		.join('');
}

// ---------------------------------------------------------------------------
// The protected marks
// ---------------------------------------------------------------------------

const MARKS = {
	tc: '[TC_00:01:25.627_TC]',
	indexIn: '[index-n-12-Guerra civil-data:{"section_tipo":"test6813"}:data]',
	indexOut: '[/index-n-12-Guerra civil-data:{"section_tipo":"test6813"}:data]',
	svg: '[svg-n-3-label-data:{"section_tipo":"test3","section_id":"5"}:data]',
	geo: '[geo-n-4-label-data:{"lat":"41.1"}:data]',
	page: '[page-n-7-label-data:{"page":"12"}:data]',
	person: '[person-a-9-Maria-data:{"section_tipo":"dd15","section_id":"5"}:data]',
	note: '[note-a-11-nota-data:{"section_tipo":"test6813","section_id":"3"}:data]',
	referenceIn: '[reference-n-5-ref-data:{"section_tipo":"test370"}:data]',
	referenceOut: '[/reference-n-5-ref-data:{"section_tipo":"test370"}:data]',
} as const;

describe('addBabelNotransTags (PHP TR::addBabelTagsOnTheFly)', () => {
	for (const [name, mark] of Object.entries(MARKS)) {
		test(`wraps a ${name} mark in <apertium-notrans>`, () => {
			const wrapped = addBabelNotransTags(`antes ${mark} despues`);
			expect(wrapped).toBe(`antes <apertium-notrans>${mark}</apertium-notrans> despues`);
		});
	}

	test('plain prose is left untouched', () => {
		const text = 'La guerra civil espanola comenzo en 1936.';
		expect(addBabelNotransTags(text)).toBe(text);
	});

	test('every mark of a real transcription paragraph is protected', () => {
		const text = `${MARKS.tc} ${MARKS.indexIn}la retirada${MARKS.indexOut} ${MARKS.person} fin.`;
		const wrapped = addBabelNotransTags(text);
		// Nothing unprotected: no bare mark opener survives outside a wrapper.
		const unprotected = wrapped.replace(/<apertium-notrans>[\s\S]*?<\/apertium-notrans>/g, '');
		expect(unprotected).not.toContain('[');
	});
});

describe('decodeBabelEntities (PHP html_entity_decode, ENT_COMPAT + UTF-8)', () => {
	test('decodes the double quote, the ampersand and the latin-1 names', () => {
		expect(decodeBabelEntities('a &quot;b&quot; &amp; c')).toBe('a "b" & c');
		expect(decodeBabelEntities('Espa&ntilde;a Andaluc&iacute;a')).toBe('España Andalucía');
		expect(decodeBabelEntities('&#8364;10')).toBe('€10');
	});

	test('ENT_COMPAT leaves the SINGLE quote encoded', () => {
		expect(decodeBabelEntities('l&#039;home')).toBe('l&#039;home');
		expect(decodeBabelEntities('l&apos;home')).toBe('l&apos;home');
	});
});

describe('the default SOURCE language is the request data lang, never a literal', () => {
	// PHP: `$source_lang = $options->source_lang ?? DEDALO_DATA_LANG` — the
	// REQUEST's data language. The port hardcoded 'lg-eng', so a request that
	// omitted source_lang read the English slice of a record whose source is
	// Catalan and "translated" nothing (or the wrong text). Languages are
	// configuration, never module literals.
	test('follows the ALS request data lang', () => {
		expect(
			runWithRequestLangs({ applicationLang: 'lg-spa', dataLang: 'lg-cat' }, () =>
				defaultTranslationSourceLang(),
			),
		).toBe('lg-cat');
	});

	test('outside a request it is the installation default, not a literal', () => {
		expect(defaultTranslationSourceLang()).toBe(config.menu.dataLang);
	});
});

describe('babelDirection (PHP babel::get_babel_direction)', () => {
	// class.babel.php:190-201 — `substr($lang, 3, 2)`, i.e. the FIRST TWO letters
	// of the ISO code, not the whole code. The docblock states the contract of the
	// service Dédalo actually talks to: "uses two-letter codes for most language
	// pairs but requires the full three-letter 'deu'/'eng' suffix for the German
	// pair". The port returned 'spa-eng', so every request named a direction mode
	// the box does not have — which is precisely how the `Error: Mode …` body the
	// audit found persisted gets produced in the first place.
	test('two-letter codes for the ordinary pairs', () => {
		expect(babelDirection('lg-spa', 'lg-eng')).toBe('sp-en');
		expect(babelDirection('lg-cat', 'lg-spa')).toBe('ca-sp');
		expect(babelDirection('lg-eng', 'lg-fra')).toBe('en-fr');
	});

	test('the German source is the FULL three-letter code', () => {
		// PHP reassigns the target too — but ONLY when it is English.
		expect(babelDirection('lg-deu', 'lg-eng')).toBe('deu-eng');
		expect(babelDirection('lg-deu', 'lg-spa')).toBe('deu-sp');
	});

	test('German as a TARGET keeps the generic extraction (PHP does not special-case it)', () => {
		expect(babelDirection('lg-eng', 'lg-deu')).toBe('en-de');
	});

	test('a malformed lang yields PHP substr’s empty slice, never a throw', () => {
		expect(babelDirection('lg', 'lg-eng')).toBe('-en');
	});
});

describe('truncateProviderMessage (PHP tool_lang:270 strlen/substr)', () => {
	// PHP budgets 512 BYTES (strlen/substr), not 512 UTF-16 code units. A
	// translator error page in Spanish or Greek therefore truncated at a
	// different point in TS than in PHP, and `slice` could cut a surrogate pair
	// in half and emit a LONE SURROGATE into the JSON response.
	const utf8Len = (text: string) => new TextEncoder().encode(text).length;

	test('a short message passes through untouched', () => {
		expect(truncateProviderMessage('boom')).toBe('boom');
	});

	test('exactly 512 bytes is NOT truncated (PHP: strlen > 512)', () => {
		const message = 'a'.repeat(512);
		expect(truncateProviderMessage(message)).toBe(message);
	});

	test('the budget is BYTES, not UTF-16 code units', () => {
		// 400 'ñ' = 800 UTF-8 bytes but only 400 code units: PHP truncates this,
		// the code-unit version did not.
		const message = 'ñ'.repeat(400);
		expect(message.length).toBeLessThan(512);
		expect(utf8Len(message)).toBeGreaterThan(512);
		const out = truncateProviderMessage(message);
		expect(out.endsWith('..')).toBe(true);
		expect(utf8Len(out.slice(0, -2))).toBeLessThanOrEqual(512);
	});

	test('an astral character is never split into a lone surrogate', () => {
		// 128 * 4 bytes = 512, so the 129th emoji straddles the byte budget.
		const message = '𝄞'.repeat(200);
		const out = truncateProviderMessage(message);
		expect(out.endsWith('..')).toBe(true);
		const body = out.slice(0, -2);
		// No unpaired surrogate anywhere in the result.
		expect(
			/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(body),
		).toBe(false);
		// …and it is still a whole number of characters of the original.
		expect(message.startsWith(body)).toBe(true);
		expect(utf8Len(body)).toBeLessThanOrEqual(512);
	});

	test('a multibyte character straddling byte 512 is dropped whole, never halved', () => {
		const message = `${'a'.repeat(511)}€${'b'.repeat(50)}`;
		const body = truncateProviderMessage(message).slice(0, -2);
		expect(body).toBe('a'.repeat(511));
	});
});

describe('sanitizeBabelResult (PHP strip_tags allowlist)', () => {
	test('removes the apertium wrapper, keeps <p><br><strong><em>', () => {
		expect(sanitizeBabelResult('<apertium-notrans>[TC_00:00:01.000_TC]</apertium-notrans>')).toBe(
			'[TC_00:00:01.000_TC]',
		);
		expect(sanitizeBabelResult('<p>uno<br><strong>dos</strong><em>tres</em></p>')).toBe(
			'<p>uno<br><strong>dos</strong><em>tres</em></p>',
		);
		expect(sanitizeBabelResult('<div class="x">uno</div>')).toBe('uno');
	});
});

describe('babelProvider — the round trip', () => {
	test('POSTs every Dédalo mark wrapped, never bare', async () => {
		stubBabel(fakeApertium);
		const text = `${MARKS.tc} hola ${MARKS.indexIn}guerra${MARKS.indexOut}`;
		await babelProvider({
			uri: URI,
			key: 'k',
			sourceLang: 'lg-spa',
			targetLang: 'lg-eng',
			text,
		});
		expect(lastPostedText).not.toBeNull();
		const bare = (lastPostedText ?? '').replace(
			/<apertium-notrans>[\s\S]*?<\/apertium-notrans>/g,
			'',
		);
		expect(bare).not.toContain('[');
	});

	test('marks come back BYTE-IDENTICAL while the prose is translated', async () => {
		stubBabel(fakeApertium);
		const text = `${MARKS.tc} la retirada ${MARKS.person} fin`;
		const out = await babelProvider({
			uri: URI,
			key: 'k',
			sourceLang: 'lg-spa',
			targetLang: 'lg-eng',
			text,
		});
		expect(out.ok).toBe(true);
		const result = (out as { text: string }).text;
		expect(result).toContain(MARKS.tc);
		expect(result).toContain(MARKS.person);
		// the unprotected prose WAS transformed by the engine…
		expect(result).toContain('LA RETIRADA');
		// …and no wrapper leaked into the stored value.
		expect(result).not.toContain('apertium-notrans');
	});

	test('a residual wrapper is never returned even around plain text', async () => {
		stubBabel(() => '<apertium-notrans>hola</apertium-notrans> mundo');
		const out = await babelProvider({
			uri: URI,
			key: 'k',
			sourceLang: 'lg-spa',
			targetLang: 'lg-eng',
			text: 'hola mundo',
		});
		expect((out as { text?: string }).text).toBe('hola mundo');
	});

	for (const marker of BABEL_INVALID_RESPONSES) {
		test(`a '${marker}' response is a FAILURE, never a translation`, async () => {
			stubBabel(() => `${marker} sp-en is not available on this server`);
			const out = await babelProvider({
				uri: URI,
				key: 'k',
				sourceLang: 'lg-spa',
				targetLang: 'lg-eng',
				text: 'hola',
			});
			expect(out.ok).toBe(false);
			expect(out.msg).toContain(marker);
		});
	}
});

// ---------------------------------------------------------------------------
// The write path
// ---------------------------------------------------------------------------

/**
 * Seed the component key with EXACTLY `items` — typed `unknown` on purpose: the
 * legacy gate below stores a BARE OBJECT where today's engine stores an array,
 * which is the shape the whole merge-base defect turns on.
 */
async function seed(sectionId: number, items: unknown): Promise<void> {
	await cleanScratchRecord(SECTION_TIPO, sectionId, TEST_TABLE);
	const values: Record<string, unknown> = {};
	for (const name of MATRIX_JSONB_COLUMNS) values[name] = null;
	values.string = { [COMPONENT_TIPO]: items };
	expect(await updateMatrixRecord(TEST_TABLE, SECTION_TIPO, sectionId, values)).toBe('inserted');
}

async function storedItems(sectionId: number): Promise<Record<string, unknown>[]> {
	const record = await readMatrixRecord(TEST_TABLE, SECTION_TIPO, sectionId);
	const column = (record?.columns.string ?? {}) as Record<string, unknown>;
	const items = column[COMPONENT_TIPO];
	return Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
}

async function timeMachineRows(sectionId: number): Promise<number> {
	const rows = (await sql`
		SELECT count(*)::int AS n FROM matrix_time_machine
		WHERE section_tipo = ${SECTION_TIPO} AND section_id = ${sectionId}
	`) as { n: number }[];
	return rows[0]?.n ?? 0;
}

beforeAll(async () => {
	for (const id of SCRATCH_IDS) {
		await cleanScratchRecord(SECTION_TIPO, id, TEST_TABLE);
	}
});

afterAll(async () => {
	for (const id of SCRATCH_IDS) {
		await cleanScratchRecord(SECTION_TIPO, id, TEST_TABLE);
	}
});

describe('translateAndWrite — a provider error is NEVER persisted', () => {
	test('an error-text response leaves the record untouched', async () => {
		await seed(ERROR_ID, [{ id: 1, lang: 'lg-eng', value: 'the retreat' }]);
		stubBabel(() => 'Error: Mode eng-spa is not installed');

		const outcome = await translateAndWrite({
			model: MODEL,
			componentTipo: COMPONENT_TIPO,
			sectionTipo: SECTION_TIPO,
			sectionId: ERROR_ID,
			sourceLang: 'lg-eng',
			targetLang: 'lg-spa',
			provider: babelProvider,
			uri: URI,
			key: 'k',
			userId: -1,
		});

		expect(outcome.ok).toBe(false);
		expect(outcome.msg).toContain('Error: Mode');
		expect(await storedItems(ERROR_ID)).toEqual([{ id: 1, lang: 'lg-eng', value: 'the retreat' }]);
		expect(await timeMachineRows(ERROR_ID)).toBe(0);
	});
});

describe('translateAndWrite — a LEGACY non-array stored value survives the merge', () => {
	// Pre-matrix_dd records store the component value as a BARE OBJECT, not an
	// array. `readComponentItems` coerces it to `[items]` ("PHP coerces non-array
	// data to [$data]"), which is why the source slice resolves and the
	// translation proceeds at all — but `readMatrixKeyForUpdate` answers `[]` for
	// the same value, indistinguishable from "this component has no items". Merging
	// the new target language onto THAT base deletes the record's only existing
	// language. The merge base must be the read chokepoint's decode.
	test('the source language is not destroyed when the stored value is a bare object', async () => {
		await seed(LEGACY_ID, { id: 1, lang: 'lg-eng', value: 'the retreat' });

		const stub: TranslationProvider = async (req) => ({
			ok: true,
			text: `${req.text} (es)`,
			msg: 'ok',
		});
		const outcome = await translateAndWrite({
			model: MODEL,
			componentTipo: COMPONENT_TIPO,
			sectionTipo: SECTION_TIPO,
			sectionId: LEGACY_ID,
			sourceLang: 'lg-eng',
			targetLang: 'lg-spa',
			provider: stub,
			uri: URI,
			key: 'k',
			userId: -1,
		});

		expect(outcome.ok).toBe(true);
		const items = await storedItems(LEGACY_ID);
		expect(items.map((item) => item.lang).sort()).toEqual(['lg-eng', 'lg-spa']);
		// The legacy item is preserved BYTE-FOR-BYTE, not re-minted.
		expect(items.find((item) => item.lang === 'lg-eng')).toEqual({
			id: 1,
			lang: 'lg-eng',
			value: 'the retreat',
		});
	});
});

describe('translateAndWrite — locked read-modify-write', () => {
	test('concurrent translations into different langs do not clobber each other', async () => {
		await seed(RACE_ID, [{ id: 1, lang: 'lg-eng', value: 'the retreat' }]);

		// Both requests are forced to complete their SOURCE read and their
		// provider call before either writes — the exact interleaving that made
		// the unlocked read-modify-write lose a language.
		let entered = 0;
		let open: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			open = resolve;
		});
		const barrier = async (): Promise<void> => {
			entered += 1;
			if (entered === 2) open();
			await gate;
		};
		const provider =
			(label: string): TranslationProvider =>
			async (req) => {
				await barrier();
				return { ok: true, text: `${req.text} [${label}]`, msg: 'ok' };
			};

		const run = (targetLang: string, label: string) =>
			translateAndWrite({
				model: MODEL,
				componentTipo: COMPONENT_TIPO,
				sectionTipo: SECTION_TIPO,
				sectionId: RACE_ID,
				sourceLang: 'lg-eng',
				targetLang,
				provider: provider(label),
				uri: URI,
				key: 'k',
				userId: -1,
			});

		const [spa, fra] = await Promise.all([run('lg-spa', 'spa'), run('lg-fra', 'fra')]);
		expect(spa.ok).toBe(true);
		expect(fra.ok).toBe(true);

		const langs = (await storedItems(RACE_ID)).map((item) => item.lang).sort();
		expect(langs).toEqual(['lg-eng', 'lg-fra', 'lg-spa']);
	});
});
