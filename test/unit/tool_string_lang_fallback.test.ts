/**
 * The DETERMINISTIC lang fallback for a tool's translated program strings —
 * label (dd799) and description (dd612) — resolved through
 * src/core/resolve/lang_fallback.ts by src/core/tools/registry.ts.
 *
 * WHAT THIS GUARDS
 * PHP (and the TS port that mirrored it) resolved a missing translation with
 * `items[0]`: whatever lang the column's stored order put first. Storage sorts
 * by lang code, so an lg-spa install was served the GERMAN tool_indexation
 * description — lg-deu simply sorted first among the langs that DID exist. The
 * bug is not "German"; it is that the served language depended on which OTHER
 * translations happened to be present. The chain must instead be: requested →
 * linguistic alias → install default → MASTER_SOURCE_LANG → any.
 *
 * Divergence entry: engineering/wire_contract/
 * WC-2026-08-02-tool-string-lang-fallback.md. Stated in that resolver's header,
 * gated here (DEC-12).
 *
 * DB-backed for the registry half (the suite DB's matrix_tools is empty and the
 * app's registered tools are not a stable corpus, so this seeds its OWN scratch
 * tool row — reserved zz-prefixed name, deleted in afterAll), pure for the chain
 * half. Install-dependent values (default app lang, equivalence classes) are
 * READ from config rather than assumed, so the gate holds on any install.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { encodeForJsonb } from '../../src/core/db/json_codec.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { MASTER_SOURCE_LANG } from '../../src/core/labels/catalog.ts';
import { langFallbackChain, resolveLangItems } from '../../src/core/resolve/lang_fallback.ts';
import { runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';
import { TIPO, TOOLS_REGISTER_SECTION_TIPO } from '../../src/core/tools/ontology_map.ts';
import { buildToolElementContext } from '../../src/core/tools/registry.ts';

const TOOL = 'tool_zz_lang_fallback_gate';
const SECTION_ID = 999_702;

const DEFAULT_LANG = config.lang.applicationLangsDefault;
/** A lang nobody translates into — the "requested translation is missing" case. */
const ABSENT_LANG = 'lg-zzz';
/**
 * The TRAP lang: it must sort BEFORE every other seeded code so that the old
 * `items[0]` rule would pick it, making a regression visible rather than
 * accidental. 'lg-aaa' beats lg-deu/lg-eng and any plausible default.
 */
const TRAP_LANG = 'lg-aaa';

/** Seed a lang-array string column with one entry per lang, stored SORTED (as PHP wrote it). */
const items = (values: Record<string, string>): { id: number; lang: string; value: string }[] =>
	Object.keys(values)
		.sort()
		.map((lang, index) => ({ id: index + 1, lang, value: values[lang] as string }));

async function cleanScratch(): Promise<void> {
	await sql`
		DELETE FROM matrix_tools
		WHERE section_tipo = ${TOOLS_REGISTER_SECTION_TIPO}
		  AND section_id = ${SECTION_ID}
	`;
}

/** Reseed the scratch tool's label/description columns and read the context back. */
async function contextWith(
	label: Record<string, string>,
	description: Record<string, string>,
	lang: string,
): Promise<{ label: unknown; description: unknown }> {
	await cleanScratch();
	// $3 needs the ::text::jsonb cast — a bare bind lands as a jsonb STRING
	// scalar, not an object (matrix_write.ts uses the same cast for this reason).
	await sql.unsafe(
		`INSERT INTO matrix_tools (section_tipo, section_id, string)
		 VALUES ($1, $2, $3::text::jsonb)`,
		[
			TOOLS_REGISTER_SECTION_TIPO,
			SECTION_ID,
			encodeForJsonb({
				[TIPO.NAME]: [{ id: 1, value: TOOL }],
				[TIPO.LABEL]: items(label),
				[TIPO.DESCRIPTION]: items(description),
			}),
		],
	);
	const context = await runWithRequestLangs({ applicationLang: lang, dataLang: lang }, () =>
		buildToolElementContext(TOOL),
	);
	return { label: context?.label, description: context?.description };
}

beforeAll(cleanScratch);
afterAll(cleanScratch);

describe('lang fallback chain (pure)', () => {
	test('requested lang comes first, then install default, then the source lang', () => {
		const chain = langFallbackChain(ABSENT_LANG);
		expect(chain[0]).toBe(ABSENT_LANG);
		expect(chain.indexOf(DEFAULT_LANG)).toBeLessThan(chain.indexOf(MASTER_SOURCE_LANG));
		expect(chain).toContain(MASTER_SOURCE_LANG);
	});

	test('the chain is deduplicated (requesting the default lang lists it once)', () => {
		const chain = langFallbackChain(DEFAULT_LANG);
		expect(chain.filter((lang) => lang === DEFAULT_LANG)).toHaveLength(1);
	});

	test.if(config.lang.equivalences.length > 0)(
		'a declared linguistic alias is preferred over the install default',
		() => {
			const group = config.lang.equivalences[0] as readonly string[];
			const [canonical, member] = [group[0] as string, group[1] as string];
			const chain = langFallbackChain(member);
			expect(chain.indexOf(canonical)).toBe(1);
			expect(chain.indexOf(canonical)).toBeLessThan(chain.indexOf(MASTER_SOURCE_LANG));
		},
	);

	test('nothing translated in any chain lang still yields a value, not null', () => {
		expect(resolveLangItems(items({ [TRAP_LANG]: 'trap' }), ABSENT_LANG)).toBe('trap');
	});

	test('an empty or absent column yields null, never an empty string', () => {
		expect(resolveLangItems(undefined, DEFAULT_LANG)).toBeNull();
		expect(resolveLangItems([], DEFAULT_LANG)).toBeNull();
		expect(resolveLangItems([{ lang: DEFAULT_LANG, value: '' }], DEFAULT_LANG)).toBeNull();
	});
});

describe('tool element context: label + description lang fallback', () => {
	test('the requested lang wins when present', async () => {
		const seen = await contextWith(
			{ [TRAP_LANG]: 'Trap label', [ABSENT_LANG]: 'Requested label' },
			{ [TRAP_LANG]: 'Trap desc', [ABSENT_LANG]: 'Requested desc' },
			ABSENT_LANG,
		);
		expect(seen).toEqual({ label: 'Requested label', description: 'Requested desc' });
	});

	test('a missing translation falls back to the INSTALL DEFAULT, not to the first stored lang', async () => {
		const seen = await contextWith(
			{
				[TRAP_LANG]: 'Trap label',
				[DEFAULT_LANG]: 'Default label',
				[MASTER_SOURCE_LANG]: 'Source label',
			},
			{
				[TRAP_LANG]: 'Trap desc',
				[DEFAULT_LANG]: 'Default desc',
				[MASTER_SOURCE_LANG]: 'Source desc',
			},
			ABSENT_LANG,
		);
		expect(seen).toEqual({ label: 'Default label', description: 'Default desc' });
	});

	test('with no install-default translation it falls back to the SOURCE lang, not to the first stored lang', async () => {
		const seen = await contextWith(
			{ [TRAP_LANG]: 'Trap label', [MASTER_SOURCE_LANG]: 'Source label' },
			{ [TRAP_LANG]: 'Trap desc', [MASTER_SOURCE_LANG]: 'Source desc' },
			ABSENT_LANG,
		);
		expect(seen).toEqual({ label: 'Source label', description: 'Source desc' });
	});

	test('only an off-chain translation exists: it is served rather than dropped', async () => {
		const seen = await contextWith(
			{ [TRAP_LANG]: 'Trap label' },
			{ [TRAP_LANG]: 'Trap desc' },
			ABSENT_LANG,
		);
		expect(seen).toEqual({ label: 'Trap label', description: 'Trap desc' });
	});

	test('an untranslated label falls back to the tool NAME; an absent description is omitted', async () => {
		await cleanScratch();
		await sql.unsafe(
			`INSERT INTO matrix_tools (section_tipo, section_id, string)
			 VALUES ($1, $2, $3::text::jsonb)`,
			[
				TOOLS_REGISTER_SECTION_TIPO,
				SECTION_ID,
				encodeForJsonb({ [TIPO.NAME]: [{ id: 1, value: TOOL }] }),
			],
		);
		const context = await runWithRequestLangs(
			{ applicationLang: ABSENT_LANG, dataLang: ABSENT_LANG },
			() => buildToolElementContext(TOOL),
		);
		expect(context?.label).toBe(TOOL);
		expect(context && 'description' in context).toBe(false);
	});
});
