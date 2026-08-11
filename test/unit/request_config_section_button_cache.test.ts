/**
 * Gate: the sqo target-section BUTTON lookup is cached, and hub-invalidated.
 *
 * `buildSqoSectionTipoDdos` enriches EVERY resolved sqo target section, and above
 * read level it probes each one for a `button_new` and a `button_delete` child.
 * That probe was uncached, and a section with NO such child cost FOUR queries (two
 * misses, then the virtual-section fallback's two) — so an sqo whose source is
 * `ontology_sections`, which resolves to every ontology registry target on the
 * install, paid it 205× per resolution. Measured on dedalo7_mht: 42ms for ONE
 * `ontology10` resolution, 17.3s of a 20.6s LLM-map build, and the same 42ms on
 * every live autocomplete of that component. With the cache: 0.64ms, and the built
 * map is byte-identical (sha256 verified over 9,065,936 bytes).
 *
 * Three properties, all load-bearing, none observable from the return value alone —
 * hence the invalidation sandwich rather than a timing assertion:
 *   1. the answer is memoized (a second resolution does not re-read dd_ontology);
 *   2. `null` — "no button of this model", the common AND expensive case — is a
 *      cached answer, not a re-derived one;
 *   3. an ontology write drops it, or a newly authored button_new would stay
 *      invisible until the process restarted.
 *
 * Scratch: dd_ontology tipos `zzbtn*` only. Seeded with RAW sql on purpose:
 * `upsertDdOntologyNode` fans out `clearOntologyDerivedCaches()`, which would erase
 * the very staleness property 1 and 2 are proving.
 */

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { buildSqoSectionTipoDdos } from '../../src/core/relations/request_config/explicit.ts';

const SECTION = 'zzbtn0';
const BUTTON = 'zzbtn1';

/** Raw insert — deliberately does NOT invalidate (see the header). */
async function rawNode(tipo: string, model: string, parent: string | null): Promise<void> {
	await sql.unsafe(
		`INSERT INTO dd_ontology (tipo, parent, model, tld, term, is_main)
		 VALUES ($1, $2, $3, 'zzbtn', $4::text::jsonb, false)
		 ON CONFLICT (tipo) DO UPDATE SET parent = EXCLUDED.parent, model = EXCLUDED.model`,
		[tipo, parent, model, JSON.stringify({ 'lg-eng': tipo })],
	);
}

async function sweep(): Promise<void> {
	await sql.unsafe("DELETE FROM dd_ontology WHERE tld = 'zzbtn'");
	await clearOntologyDerivedCaches();
}

const buttonsOf = async (tipo: string): Promise<string[]> => {
	const [ddo] = await buildSqoSectionTipoDdos([tipo]);
	return (ddo?.buttons ?? []).map((button) => button.model);
};

beforeEach(async () => {
	await sweep();
	await rawNode(SECTION, 'section', null);
	await clearOntologyDerivedCaches();
});

afterAll(sweep);

describe('section button lookup caching (buildSqoSectionTipoDdos)', () => {
	test('a button added WITHOUT invalidation stays invisible — the lookup is memoized', async () => {
		expect(await buttonsOf(SECTION)).toEqual([]); // fills the cache with the null answer

		await rawNode(BUTTON, 'button_new', SECTION); // no cache fan-out, by design

		// Property 1 + 2: the null answer was cached, so the new child is not seen.
		// A re-query here would return ['button_new'] and this assertion would fail —
		// which is exactly the regression (an uncached probe) this file exists to catch.
		expect(await buttonsOf(SECTION)).toEqual([]);
	});

	test('the ontology invalidation hub drops it — a real write is seen', async () => {
		expect(await buttonsOf(SECTION)).toEqual([]);
		await rawNode(BUTTON, 'button_new', SECTION);

		// Property 3: what every REAL writer does (upsertDdOntologyNode, rebuildOntology,
		// deleteTldNodes all fan out through this hub).
		await clearOntologyDerivedCaches();

		expect(await buttonsOf(SECTION)).toEqual(['button_new']);
	});

	test('a cached answer is the same answer — repeated enrichment is stable', async () => {
		await rawNode(BUTTON, 'button_delete', SECTION);
		await clearOntologyDerivedCaches();

		const first = await buildSqoSectionTipoDdos([SECTION]);
		const second = await buildSqoSectionTipoDdos([SECTION]);
		expect(second).toEqual(first);
		expect(first[0]?.buttons.map((button) => button.model)).toEqual(['button_delete']);
	});
});
