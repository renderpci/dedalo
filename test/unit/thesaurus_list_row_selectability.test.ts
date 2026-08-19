/**
 * PER-ROW SELECTABILITY on the section list envelope
 * (WC-2026-08-17-list-row-is-indexable).
 *
 * The thesaurus picker never offers an affordance on a guess: the client's
 * `term_selectability` (client/dedalo/core/area_thesaurus/js/thesaurus_picker.js)
 * reads the server's answer from `root_terms_selectable` (area read) or the
 * node's own `is_indexable` — and a LIST row carried neither, so a search
 * result, the primary way into a large thesaurus, could never be picked.
 * `readSection` now stamps `is_indexable` on each envelope entry, from the SAME
 * resolver the tree paths use (ts_object/node_repository.fetchNodeInfo).
 *
 * SCOPE is the contract: only sections whose `section_map.thesaurus` names an
 * `is_indexable` component get the key. Absent means "this section has no
 * selectable-term contract" — which is NOT the same as `false`, and stamping
 * `false` everywhere would paint every ordinary list as unpickable.
 *
 * Scratch hygiene: the two rsc197 rows are minted here at reserved high ids and
 * dropped in afterAll — rsc197 carries no fixture rows in the test DB.
 */
// BINDS INSTALL TLDs: rsc — install-specific fixtures, grandfathered in
// engineering/generic_tld_baseline.json (generic_tld_tripwire, shrink-only). This test
// is meaningful only on a database holding those installs' records. Migrate it to a
// built situation (src/core/test_data/situations) or the generic `test` TLD, then
// regenerate the baseline (`bun run scripts/generic_tld_baseline.ts`).

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { declaresTermSelectability, getSectionMap } from '../../src/core/ontology/section_map.ts';
import { runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';
import { readSection } from '../../src/core/section/read.ts';

// DB reachability probe: only a genuinely unreachable DB downgrades to SKIP.
let hasDb = false;
try {
	await sql`SELECT 1`;
	hasDb = true;
} catch {
	console.warn('[thesaurus_list_row_selectability] DB unavailable — gates SKIPPED');
}

// Reserved scratch ids on rsc197 (Personas, the thesaurus this regression was
// found on): one term flagged indexable, one not.
const SCRATCH_INDEXABLE = 999901;
const SCRATCH_PLAIN = 999902;

const readEntries = (tipo: string, mode: string) =>
	runWithRequestLangs({ applicationLang: 'lg-eng', dataLang: 'lg-eng' }, async () => {
		const result = await readSection({
			source: {
				model: 'section',
				tipo,
				section_tipo: tipo,
				mode,
				lang: 'lg-eng',
				action: 'search',
			},
			sqo: {
				section_tipo: [tipo],
				limit: 10,
				offset: 0,
			},
			// biome-ignore lint/suspicious/noExplicitAny: rqo shape is the wire contract, not a TS type
		} as any);
		const envelope = result.data.find(
			(item) => (item as { typo?: string }).typo === 'sections',
			// biome-ignore lint/suspicious/noExplicitAny: envelope entries are the assertion target
		) as any;
		return (envelope?.entries ?? []) as {
			section_id: number;
			is_indexable?: boolean;
			selectability_declared?: false;
		}[];
	});

describe.if(hasDb)('list-row selectability (thesaurus picker)', () => {
	beforeAll(async () => {
		// Literal jsonb, not a bound parameter: a bound string arrives as a jsonb
		// STRING and the matrix_relation_index trigger refuses it
		// (`cannot call jsonb_each on a non-object`) — the json_codec bind trap.
		await sql.unsafe(`
			INSERT INTO matrix (section_id, section_tipo, data, relation)
			VALUES
				(${SCRATCH_INDEXABLE}, 'rsc197', '{"label":"scratch indexable"}'::jsonb,
					'{"rsc1028":[{"section_tipo":"dd784","section_id":1}]}'::jsonb),
				(${SCRATCH_PLAIN}, 'rsc197', '{"label":"scratch plain"}'::jsonb, '{}'::jsonb)
			ON CONFLICT DO NOTHING
		`);
	});

	afterAll(async () => {
		await sql`
			DELETE FROM matrix
			WHERE section_tipo = 'rsc197' AND section_id IN (${SCRATCH_INDEXABLE}, ${SCRATCH_PLAIN})
		`;
	});

	test('rsc197 declares the contract, so every entry carries the server answer', async () => {
		const thesaurus = (await getSectionMap('rsc197'))?.thesaurus as { is_indexable?: unknown };
		expect(typeof thesaurus?.is_indexable).toBe('string');

		const entries = await readEntries('rsc197', 'list_thesaurus');
		expect(entries.length).toBeGreaterThan(0);
		for (const entry of entries) {
			expect(typeof entry.is_indexable).toBe('boolean');
		}
	});

	test('the answer is the term’s own flag, not a blanket true/false', async () => {
		const entries = await readEntries('rsc197', 'list_thesaurus');
		const byId = new Map(entries.map((entry) => [entry.section_id, entry.is_indexable]));
		// The flagged scratch term reads TRUE (rsc1028 → section_id 1 = "Yes");
		// the unflagged one reads FALSE. Both must be present, or the read is not
		// answering per row.
		expect(byId.get(SCRATCH_INDEXABLE)).toBe(true);
		expect(byId.get(SCRATCH_PLAIN)).toBe(false);
	});

	test('plain list mode gets the same answer (a picker list is not always list_thesaurus)', async () => {
		const entries = await readEntries('rsc197', 'list');
		const byId = new Map(entries.map((entry) => [entry.section_id, entry.is_indexable]));
		expect(byId.get(SCRATCH_INDEXABLE)).toBe(true);
	});

	test('a section with NO is_indexable contract says so, and never answers per row', async () => {
		// test3's section_map declares a thesaurus scope but no is_indexable
		// component — absent, never `false`. The read states THAT
		// (WC-2026-08-17-list-row-selectability-declared): silence used to be read
		// by the client as UNKNOWN, so rows the write gate exempts lost their
		// pick arrow.
		expect(await declaresTermSelectability('test3')).toBe(false);

		const entries = await readEntries('test3', 'list');
		expect(entries.length).toBeGreaterThan(0);
		for (const entry of entries) {
			expect('is_indexable' in entry).toBe(false);
			expect(entry.selectability_declared).toBe(false);
		}
	});

	test('the two keys are mutually exclusive — a declaring section never sends the exemption', async () => {
		// rsc197 declares the contract, so its rows answer per term and must NOT
		// carry the blanket exemption; otherwise a term explicitly flagged
		// NOT indexable would still be offered the arrow.
		expect(await declaresTermSelectability('rsc197')).toBe(true);

		const entries = await readEntries('rsc197', 'list_thesaurus');
		expect(entries.length).toBeGreaterThan(0);
		for (const entry of entries) {
			expect('selectability_declared' in entry).toBe(false);
		}
	});

	test('THE predicate is shared with the write gate, not copied', async () => {
		// gate 3's exemption scope (relations/save.ts targetDeclaresSelectability)
		// and the read's stamp must be the same function. Two copies is exactly
		// how the arrow went missing on rows the gate was already exempting, so
		// the private copy is gone and this pins the delegation.
		const source = await Bun.file('src/core/relations/save.ts').text();
		expect(source).toContain('declaresTermSelectability');
		// no re-derivation of the predicate next to the gate
		expect(source).not.toContain('thesaurus as { is_indexable?: unknown }');
	});
});
