import { describe, expect, test } from 'bun:test';
import type { RagEmbedGroup } from '../../src/ai/rag/config.ts';
import {
	type EmbedSourceDeps,
	RAG_SYSTEM_PRINCIPAL,
	resolveEmbedDocs,
} from '../../src/ai/rag/embed_source.ts';
import type { Ddo } from '../../src/core/concepts/ddo.ts';
import type { MatrixRecord } from '../../src/core/db/matrix.ts';
import { buildDataItem } from '../../src/core/resolve/component_data.ts';
import { currentDataLang } from '../../src/core/resolve/request_lang.ts';
import { currentPrincipal } from '../../src/core/security/request_context.ts';

/**
 * embed_source resolution — the ddo_map → composite-document driver (2026-07-22).
 * A fake emit seam stands in for read.ts emitDdoData, so these run offline and
 * assert the CONTRACT: one doc per (group, lang); deep-resolved relation text
 * (child items from the target section) harvested while locator MAIN entries are
 * skipped; map-order + `## label` headers; contributors carry the target
 * sections; empty entries prune; and — the coherence law — resolution runs under
 * the SYSTEM principal + the EXPLICIT doc lang, whatever ambient scope the
 * caller (a saving user) had.
 */

const SECTION = 'rsc205'; // "virtual" host — records keyed by this tipo
const RECORD: MatrixRecord = {
	id: 1,
	section_id: 42,
	section_tipo: SECTION,
} as unknown as MatrixRecord;

const TITLE_DDO: Ddo = { tipo: 'rsc140', section_tipo: 'self', mode: 'list' };
const MINT_DDO: Ddo = { tipo: 'rsc138', section_tipo: 'self', mode: 'list' };
const MINT_TERM_DDO: Ddo = {
	tipo: 'dd812',
	section_tipo: 'dd810',
	parent: 'rsc138',
	mode: 'list',
};

const GROUP: RagEmbedGroup = {
	id: 'card',
	ddoMap: [TITLE_DDO, MINT_DDO, MINT_TERM_DDO],
};

/** Values per (tipo, lang) the fake emit resolves. */
const VALUES: Record<string, Record<string, string>> = {
	rsc140: { 'lg-spa': 'Moneda de plata', 'lg-eng': 'Silver coin' },
	dd812: { 'lg-spa': 'Ceca de Lugdunum', 'lg-eng': 'Mint of Lugdunum' },
};

/**
 * The fake emit seam. Mirrors the real emitDdoData contract shape: the TITLE
 * literal pushes one item with a string value; the MINT relation pushes a MAIN
 * item whose entries are LOCATORS (no string value — must be skipped) plus the
 * deep-resolved dd812 child item attributed to the TARGET section dd810.
 */
const fakeEmit: EmbedSourceDeps['emitDdo'] = async (
	ddo,
	_ddoMap,
	_record,
	row,
	_mode,
	lang,
	_callerTipo,
	emission,
) => {
	if (ddo.tipo === 'rsc140') {
		const value = VALUES.rsc140?.[lang];
		emission.items.push(
			buildDataItem('rsc140', row.section_tipo, row.section_id, 'list', lang, [
				{ value: value ?? '' },
			]),
		);
		return;
	}
	if (ddo.tipo === 'rsc138') {
		// relation MAIN item: locator entries — no harvestable string value
		emission.items.push(
			buildDataItem('rsc138', row.section_tipo, row.section_id, 'list', lang, [
				{ section_tipo: 'dd810', section_id: 7 },
			]),
		);
		// deep child: the mint's term, resolved in the TARGET section
		const term = VALUES.dd812?.[lang];
		emission.items.push(buildDataItem('dd812', 'dd810', 7, 'list', lang, [{ value: term ?? '' }]));
		return;
	}
	throw new Error(`fakeEmit: unexpected top-level tipo '${ddo.tipo}'`);
};

function fakeDeps(overrides: Partial<EmbedSourceDeps> = {}): EmbedSourceDeps {
	return {
		emitDdo: fakeEmit,
		readRecord: async () => RECORD,
		resolveMatrixTable: async () => 'matrix',
		isRelation: async (tipo) => tipo === 'rsc138', // the mint relation
		entryUsesLangs: async () => true,
		labelOf: async (tipo, lang) =>
			tipo === 'rsc140' ? (lang === 'lg-spa' ? 'Título' : 'Title') : 'Mint',
		...overrides,
	};
}

const INPUT = {
	sectionTipo: SECTION,
	sectionId: 42,
	groups: [GROUP],
	langs: ['lg-spa', 'lg-eng'] as const,
	nolan: 'lg-nolan',
};

describe('resolveEmbedDocs', () => {
	test('one doc per (group, lang); deep term harvested; locator MAIN skipped; headers in map order', async () => {
		const docs = await resolveEmbedDocs(INPUT, fakeDeps());
		expect(docs.length).toBe(2); // one per lang

		const spa = docs.find((d) => d.lang === 'lg-spa');
		expect(spa).toBeDefined();
		expect(spa!.group).toBe('card');
		// map order: title first, then the relation's deep-resolved term
		expect(spa!.text).toBe('## Título\nMoneda de plata\n\n## Mint\nCeca de Lugdunum');
		// the raw locator {section_tipo, section_id} never leaked into the text
		expect(spa!.text).not.toContain('dd810');

		const eng = docs.find((d) => d.lang === 'lg-eng');
		expect(eng!.text).toContain('Mint of Lugdunum');
	});

	test('contributors carry the contributing component AND the deep target section', async () => {
		const docs = await resolveEmbedDocs(INPUT, fakeDeps());
		const spa = docs.find((d) => d.lang === 'lg-spa');
		// rsc140's text came from the host; rsc138's harvested text came ONLY from
		// the deep target dd810 (its MAIN locator entries contribute no text) —
		// the host itself is egress-checked separately as the passage's section.
		expect(spa!.contributors).toEqual([
			{ componentTipo: 'rsc140', sectionTipos: [SECTION] },
			{ componentTipo: 'rsc138', sectionTipos: ['dd810'] },
		]);
	});

	test('COHERENCE: resolution runs under the SYSTEM principal + the explicit doc lang', async () => {
		const seen: Array<{ principal: unknown; dataLang: string; emitLang: string }> = [];
		const spyEmit: EmbedSourceDeps['emitDdo'] = async (ddo, m, r, row, mode, lang, c, emission) => {
			seen.push({
				principal: currentPrincipal(),
				dataLang: currentDataLang(),
				emitLang: lang,
			});
			return fakeEmit(ddo, m, r, row, mode, lang, c, emission);
		};
		await resolveEmbedDocs(INPUT, fakeDeps({ emitDdo: spyEmit }));
		expect(seen.length).toBeGreaterThan(0);
		for (const call of seen) {
			// the ambient identity inside resolution is ALWAYS the system principal…
			expect(call.principal).toBe(RAG_SYSTEM_PRINCIPAL);
			// …and the ALS data lang equals the explicit per-doc lang (never a
			// caller's ambient lang, never the install default by accident).
			expect(call.dataLang).toBe(call.emitLang);
		}
		const langsSeen = new Set(seen.map((s) => s.dataLang));
		expect(langsSeen).toEqual(new Set(['lg-spa', 'lg-eng']));
	});

	test('a lang-independent group resolves ONCE under nolan', async () => {
		const docs = await resolveEmbedDocs(
			{ ...INPUT, groups: [{ id: 'plain', ddoMap: [TITLE_DDO] }] },
			fakeDeps({
				entryUsesLangs: async () => false,
				emitDdo: async (_d, _m, _r, row, _mode, lang, _c, emission) => {
					emission.items.push(
						buildDataItem('rsc140', row.section_tipo, row.section_id, 'list', lang, [
							{ value: 'no-lang value' },
						]),
					);
				},
			}),
		);
		expect(docs.length).toBe(1);
		expect(docs[0]!.lang).toBe('lg-nolan');
	});

	test('empty entries prune; an all-empty group yields no doc', async () => {
		const docs = await resolveEmbedDocs(
			INPUT,
			fakeDeps({
				emitDdo: async (ddo, _m, _r, row, _mode, lang, _c, emission) => {
					if (ddo.tipo !== 'rsc140') return; // mint resolves to nothing
					emission.items.push(
						buildDataItem('rsc140', row.section_tipo, row.section_id, 'list', lang, [
							{ value: lang === 'lg-spa' ? 'Solo español' : '' },
						]),
					);
				},
			}),
		);
		// lg-eng resolved fully empty → no doc for it
		expect(docs.map((d) => d.lang)).toEqual(['lg-spa']);
		expect(docs[0]!.text).toBe('## Título\nSolo español');
		expect(docs[0]!.contributors).toEqual([{ componentTipo: 'rsc140', sectionTipos: [SECTION] }]);
	});

	test('a throwing entry is dropped deterministically; the rest of the doc survives', async () => {
		const docs = await resolveEmbedDocs(
			INPUT,
			fakeDeps({
				emitDdo: async (ddo, m, r, row, mode, lang, c, emission) => {
					if (ddo.tipo === 'rsc138') throw new Error('unknown ddo tipo');
					return fakeEmit(ddo, m, r, row, mode, lang, c, emission);
				},
			}),
		);
		const spa = docs.find((d) => d.lang === 'lg-spa');
		expect(spa!.text).toBe('## Título\nMoneda de plata');
	});

	test('MODE RULE: explicit mode honored verbatim; absent mode defaults literal→edit, relation→list', async () => {
		// The live bug this pins: mode 'list' triggers component_text_area's
		// 130-char list-preview truncation — a 2.1 MB transcription embedded as
		// 154 chars. Absent mode must default literals to edit (full value);
		// an explicitly authored mode is the author's call and passes verbatim.
		const seen: Array<{ tipo: string; mode: string; childModes: string[] }> = [];
		const spyEmit: EmbedSourceDeps['emitDdo'] = async (ddo, ddoMap, r, row, mode, lang, c, emission) => {
			seen.push({
				tipo: ddo.tipo,
				mode,
				childModes: ddoMap.filter((d) => d.parent === ddo.tipo).map((d) => d.mode ?? '?'),
			});
			return fakeEmit(ddo, ddoMap, r, row, mode, lang, c, emission);
		};
		// No modes authored anywhere → defaults apply (incl. the deep literal child).
		const bare: RagEmbedGroup = {
			id: 'card',
			ddoMap: [
				{ tipo: 'rsc140', section_tipo: 'self' },
				{ tipo: 'rsc138', section_tipo: 'self' },
				{ tipo: 'dd812', section_tipo: 'dd810', parent: 'rsc138' },
			],
		};
		await resolveEmbedDocs(
			{ ...INPUT, groups: [bare], langs: ['lg-spa'] },
			fakeDeps({ emitDdo: spyEmit }),
		);
		expect(seen.find((s) => s.tipo === 'rsc140')?.mode).toBe('edit'); // literal default
		const mint = seen.find((s) => s.tipo === 'rsc138');
		expect(mint?.mode).toBe('list'); // relation default
		expect(mint?.childModes).toEqual(['edit']); // deep literal child defaulted too

		// Explicit modes pass verbatim — even 'list' on a literal (author's call).
		seen.length = 0;
		await resolveEmbedDocs({ ...INPUT, langs: ['lg-spa'] }, fakeDeps({ emitDdo: spyEmit }));
		expect(seen.find((s) => s.tipo === 'rsc140')?.mode).toBe('list'); // INPUT's map authors 'list'
	});

	test('missing record or no groups → []', async () => {
		expect(await resolveEmbedDocs({ ...INPUT, groups: [] }, fakeDeps())).toEqual([]);
		expect(await resolveEmbedDocs(INPUT, fakeDeps({ readRecord: async () => null }))).toEqual([]);
	});

	test('HTML in values is flattened to plain text', async () => {
		const docs = await resolveEmbedDocs(
			{ ...INPUT, langs: ['lg-spa'] },
			fakeDeps({
				emitDdo: async (ddo, _m, _r, row, _mode, lang, _c, emission) => {
					if (ddo.tipo !== 'rsc140') return;
					emission.items.push(
						buildDataItem('rsc140', row.section_tipo, row.section_id, 'list', lang, [
							{ value: '<p>Hola <strong>mundo</strong></p>' },
						]),
					);
				},
			}),
		);
		expect(docs[0]!.text).toContain('Hola mundo');
		expect(docs[0]!.text).not.toContain('<strong>');
	});
});
