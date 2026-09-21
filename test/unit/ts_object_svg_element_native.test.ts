/**
 * A thesaurus tree node's `img` element ships the SVG's URL, not the stored
 * media array (src/core/ts_object/ts_object.ts — the `component_svg` case of
 * PHP's format_component_data, the last item its coverage header listed as
 * DEFERRED "needs media machinery").
 *
 * WHY IT EXISTS. The client renders the element straight from the value
 * (`client/dedalo/core/ts_object/js/render_ts_line.js`, the 'img' case:
 * `src: current_element.value`). The stored array reached that DOM builder as a
 * non-URL and was refused by the scheme allowlist (`ui.js` safe_url, XSS-04) —
 * one console WARNING per node, no error, and every glyph illustration missing
 * from tool_cataloging's thesaurus panel. An EMPTY array is truthy in
 * JavaScript, so even a node with no file rendered an empty `<img>` shell.
 *
 * WHAT IS PINNED (outcomes, never spellings):
 *   1. a node whose file is ON DISK emits a STRING URL under the media web
 *      base, at the path buildMediaLocation builds (no second grammar);
 *   2. its query is the file's own mtime — the cache-buster PHP spent a
 *      per-request timestamp on (WC-2026-09-01-ts-object-svg-url);
 *   3. a node with NO file emits '' — falsy, which is what suppresses the
 *      client's `<img>`; never `[]`, never the stored items;
 *   4. the sibling `term` element is untouched, so the widened return type did
 *      not reroute another element type into the string branch.
 *
 * FIXTURE. `testscxibm1` — the repo-owned generic-TLD clone of a glyph
 * thesaurus (AGENTS.md: a test names only test* TLDs). Its
 * section_list_thesaurus (`testscxibm1023`) already declares
 * `{tipo:'testscxibm1038', type:'img'}` over a component_svg, which is the exact
 * ontology shape the browser bug was reported against.
 *
 * SCRATCH SURFACE (this file's namespace ONLY):
 *   rows of section_tipo 'testscxibm1' in the matrix table its ontology
 *   resolves (asked for, never assumed) plus matrix_time_machine,
 *   section_id 925000-925099, plus the one svg file it writes under the SUITE
 *   media root and removes again.
 */

import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { config } from '../../src/config/config.ts';
import { mediaTypeOf } from '../../src/core/concepts/media.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { resolveMediaPathOptions } from '../../src/core/media/ontology_path.ts';
import { buildMediaLocation } from '../../src/core/media/path.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { currentDataLang } from '../../src/core/resolve/request_lang.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { buildNodeData } from '../../src/core/ts_object/ts_object.ts';

const SECTION = 'testscxibm1';
const SVG_TIPO = 'testscxibm1038';
const TERM_TIPO = 'testscxibm1005';
const ID_MIN = 925000;
const ID_MAX = 925099;

const WITH_FILE = 925000;
const WITHOUT_FILE = 925001;

/** A fixed mtime so the cache-buster is an assertable value, not a race. */
const MTIME_SECONDS = 1_756_000_000;

const ADMIN = { userId: -1, isGlobalAdmin: true, isDeveloper: true } as const;

async function svgLocation(sectionId: number) {
	const spec = mediaTypeOf('component_svg');
	if (spec === null) throw new Error('component_svg has no media spec');
	const pathOptions = await resolveMediaPathOptions(SVG_TIPO, SECTION);
	return buildMediaLocation(
		spec,
		{ componentTipo: SVG_TIPO, sectionTipo: SECTION, sectionId, lang: null },
		spec.defaultQuality,
		spec.defaultExtension,
		pathOptions,
	);
}

/** The table the ONTOLOGY resolves for this section — never a guess. */
async function sectionTable(): Promise<string> {
	const table = await getMatrixTableFromTipo(SECTION);
	if (table === null) throw new Error(`no matrix table for ${SECTION}`);
	return table;
}

async function cleanScratch(): Promise<void> {
	for (const table of [await sectionTable(), 'matrix_time_machine']) {
		await sql.unsafe(
			`DELETE FROM "${table}" WHERE section_tipo = $1 AND section_id BETWEEN $2 AND $3`,
			[SECTION, ID_MIN, ID_MAX],
		);
	}
	for (const id of [WITH_FILE, WITHOUT_FILE]) {
		rmSync((await svgLocation(id)).absolutePath, { force: true });
	}
}

/** The element the tree renders as the thumbnail, or undefined when suppressed. */
async function imgElementValue(sectionId: number): Promise<unknown> {
	const node = await buildNodeData(SECTION, sectionId, {}, null, ADMIN);
	return node.ar_elements.find((element) => element.tipo === SVG_TIPO)?.value;
}

beforeAll(async () => {
	await cleanScratch();

	for (const id of [WITH_FILE, WITHOUT_FILE]) {
		await sql.unsafe(
			`INSERT INTO "${await sectionTable()}" (section_id, section_tipo, "string")
			 VALUES ($1, $2, $3::text::jsonb)`,
			[
				id,
				SECTION,
				// Every plausible element lang: the point of this row is the SIBLING
				// assertion (the term is still a string), not which lang wins.
				JSON.stringify({
					[TERM_TIPO]: ['lg-spa', 'lg-eng', 'lg-nolan'].map((lang, index) => ({
						id: index + 1,
						lang,
						value: `glyph ${id}`,
					})),
				}),
			] as (string | number | null)[],
		);
	}

	// ONE file, for ONE of the two records — the pair is what makes the
	// existence check an assertion instead of a coincidence.
	const location = await svgLocation(WITH_FILE);
	mkdirSync(location.absolutePath.replace(/\/[^/]+$/, ''), { recursive: true });
	writeFileSync(location.absolutePath, '<svg xmlns="http://www.w3.org/2000/svg"/>');
	utimesSync(location.absolutePath, MTIME_SECONDS, MTIME_SECONDS);
});

afterAll(cleanScratch);

test('a node whose svg is on disk emits its URL, under the media web base', async () => {
	const value = await imgElementValue(WITH_FILE);
	const location = await svgLocation(WITH_FILE);

	expect(typeof value).toBe('string');
	expect(value).toBe(`${config.media.webBase}${location.relativePath}?${MTIME_SECONDS * 1000}`);
	// The path half is the shared grammar's, not a second copy of it.
	expect(String(value).startsWith(`${config.media.webBase}${location.relativePath}?`)).toBe(true);
});

test("a node with NO file emits '' — falsy, which is what hides the client's img", async () => {
	const value = await imgElementValue(WITHOUT_FILE);

	expect(value).toBe('');
	// The pre-fix value was the stored array; `[]` is TRUTHY, which is exactly
	// how an empty <img> shell reached the DOM and got refused.
	expect(Array.isArray(value)).toBe(false);
});

test('the term element beside it is untouched by the widened value type', async () => {
	const node = await buildNodeData(SECTION, WITH_FILE, {}, null, ADMIN);
	const term = node.ar_elements.find((element) => element.tipo === TERM_TIPO);

	expect(typeof term?.value).toBe('string');
	expect(String(term?.value)).toContain(`glyph ${WITH_FILE}`);
});

// ---------------------------------------------------------------------------
// THE TWO PATH INPUTS THE FIXTURE ABOVE CANNOT EXERCISE.
//
// `testscxibm1038` declares no `additional_path` and is not translatable, so
// the record-scoped resolver call and the node-translatable lang both resolve
// to the SAME path as the section-scoped/lang-null forms — i.e. reverting
// either one leaves every assertion above green. Both are load-bearing: each
// wrong answer stats a path nothing was ever written to and the thumbnail is
// gone for good, silently. So they get their own situation.
// ---------------------------------------------------------------------------

const P_SECTION = 'zzsvp1';
const P_LIST = 'zzsvp2';
const P_BUCKET_SVG = 'zzsvp3'; // declares additional_path
const P_SIBLING = 'zzsvp4'; // the sibling whose VALUE names the bucket
const P_LANG_SVG = 'zzsvp5'; // translatable
const P_ID = 1;
const BUCKET = 'cession_files';

const P = situation({
	name: 'ts_object svg path inputs',
	tld: 'zzsvp',
	nodes: [
		{ tipo: P_SECTION, parent: 'test1', model: 'section', relations: [{ tipo: 'test24' }] },
		{
			tipo: P_LIST,
			parent: P_SECTION,
			model: 'section_list_thesaurus',
			properties: {
				show: {
					ddo_map: [
						{ tipo: P_BUCKET_SVG, type: 'img' },
						{ tipo: P_LANG_SVG, type: 'img' },
					],
				},
			},
		},
		{
			tipo: P_BUCKET_SVG,
			parent: P_SECTION,
			model: 'component_svg',
			properties: { additional_path: P_SIBLING },
		},
		{ tipo: P_SIBLING, parent: P_SECTION, model: 'component_input_text' },
		{ tipo: P_LANG_SVG, parent: P_SECTION, model: 'component_svg', is_translatable: true },
	],
	records: [
		{
			section_tipo: P_SECTION,
			section_id: P_ID,
			columns: {
				string: {
					[P_SIBLING]: [
						{ id: 1, lang: 'lg-nolan', value: BUCKET },
						{ id: 2, lang: 'lg-spa', value: BUCKET },
						{ id: 3, lang: 'lg-eng', value: BUCKET },
					],
				},
			},
		},
	],
});

/** Write the file exactly where the RIGHT answer says it lives, and only there. */
async function writeAt(componentTipo: string, lang: string | null): Promise<string> {
	const spec = mediaTypeOf('component_svg');
	if (spec === null) throw new Error('component_svg has no media spec');
	const options = await resolveMediaPathOptions(componentTipo, P_SECTION, P_ID);
	const location = buildMediaLocation(
		spec,
		{ componentTipo, sectionTipo: P_SECTION, sectionId: P_ID, lang },
		spec.defaultQuality,
		spec.defaultExtension,
		options,
	);
	mkdirSync(location.absolutePath.replace(/\/[^/]+$/, ''), { recursive: true });
	writeFileSync(location.absolutePath, '<svg xmlns="http://www.w3.org/2000/svg"/>');
	return location.absolutePath;
}

const written: string[] = [];

beforeAll(async () => {
	await ensureSituation(P);
	written.push(await writeAt(P_BUCKET_SVG, null));
	written.push(await writeAt(P_LANG_SVG, currentDataLang()));
}, 60000);

afterAll(async () => {
	for (const file of written) rmSync(file, { force: true });
	expect(await dropSituation(P)).toBe(0);
}, 60000);

async function imgValueOf(tipo: string): Promise<unknown> {
	const node = await buildNodeData(P_SECTION, P_ID, {}, null, ADMIN);
	return node.ar_elements.find((element) => element.tipo === tipo)?.value;
}

test('the bucket comes from the RECORD: properties.additional_path is resolved', async () => {
	const value = String(await imgValueOf(P_BUCKET_SVG));

	// The section-scoped resolver leaves additional_path undefined and the
	// numeric max_items_folder bucket wins — the file would not be found.
	expect(value).toContain(`/${BUCKET}/`);
	expect(value).not.toBe('');
});

test("a TRANSLATABLE node's identifier carries the lang", async () => {
	const value = String(await imgValueOf(P_LANG_SVG));
	const lang = currentDataLang();

	// `lang: null` here reads `<id>.svg` while the writer stored `<id>_<lang>.svg`.
	expect(value).toContain(`${P_LANG_SVG}_${P_SECTION}_${P_ID}_${lang}.svg`);
});

// ---------------------------------------------------------------------------
// THE CHOKEPOINT: only component_svg resolves to a URL here, so an `img`
// element over any OTHER media model must be emptied and REPORTED, never
// handed to the client as an array (which is how this whole class stayed
// invisible: the client refuses it with a console warning nobody reads).
// ---------------------------------------------------------------------------

const I_SECTION = 'zzimg1';
const I_LIST = 'zzimg2';
const I_IMAGE = 'zzimg3'; // component_IMAGE declared as an img element

const I = situation({
	name: 'img element over a non-svg media model',
	tld: 'zzimg',
	nodes: [
		{ tipo: I_SECTION, parent: 'test1', model: 'section', relations: [{ tipo: 'test24' }] },
		{
			tipo: I_LIST,
			parent: I_SECTION,
			model: 'section_list_thesaurus',
			properties: { show: { ddo_map: [{ tipo: I_IMAGE, type: 'img' }] } },
		},
		{ tipo: I_IMAGE, parent: I_SECTION, model: 'component_image' },
	],
	records: [
		{
			section_tipo: I_SECTION,
			section_id: 1,
			columns: {
				media: {
					[I_IMAGE]: [{ id: 1, files_info: [], original_normalized_name: 'x.jpg' }],
				},
			},
		},
	],
});

beforeAll(async () => {
	await ensureSituation(I);
}, 60000);

afterAll(async () => {
	expect(await dropSituation(I)).toBe(0);
}, 60000);

test('an img element over a non-svg model is emptied and REPORTED, never an array', async () => {
	const reported: string[] = [];
	const realError = console.error;
	console.error = (...args: unknown[]) => {
		reported.push(args.map(String).join(' '));
	};
	let value: unknown;
	try {
		const node = await buildNodeData(I_SECTION, 1, {}, null, ADMIN);
		value = node.ar_elements.find((element) => element.tipo === I_IMAGE)?.value;
	} finally {
		console.error = realError;
	}

	// The client assigns this to an <img> src: an array is refused there,
	// silently, and renders an empty shell.
	expect(typeof value).toBe('string');
	expect(value).toBe('');
	// And the mis-declaration is something an OPERATOR can act on, so it is
	// said once, loudly, naming the element.
	expect(reported.some((line) => line.includes(I_IMAGE) && line.includes(I_SECTION))).toBe(true);
});
