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
