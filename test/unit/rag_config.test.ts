// Migrated to the generic `test` TLD 2026-08-20 (AGENTS.md hard rule). No database:
// this gate feeds a section_map descriptor in and reads the resolved config out, so
// every tipo is an opaque identifier and the migration is a rename.

import { describe, expect, test } from 'bun:test';
import { type OntologyPort, RagConfig } from '../../src/ai/rag/config.ts';

/**
 * RAG config resolution — the 2026-07-22 GROUP model: a section opts in via its
 * section_map `rag.embed` ARRAY of `{id, ddo_map, chunk?, mode?, strategy?}`
 * groups (ONE canonical shape — no per-component boolean, no polymorphism).
 * The image-context surface (properties.rag.context, section NODE) is unchanged.
 */

/** Minimal fake OntologyPort: node properties + section_map rag scopes. */
function fakeOntology(opts: {
	properties?: Record<string, Record<string, unknown>>;
	models?: Record<string, string>;
	translatable?: Record<string, boolean>;
	sectionMapRag?: Record<string, Record<string, unknown> | null>;
}): OntologyPort {
	return {
		getProperties: async (tipo: string) => opts.properties?.[tipo] ?? null,
		getModelByTipo: async (tipo: string) => opts.models?.[tipo] ?? null,
		getTranslatable: async (tipo: string) => opts.translatable?.[tipo] ?? false,
		getSectionMapRag: async (tipo: string) => opts.sectionMapRag?.[tipo] ?? null,
	};
}

const CARD_GROUP = {
	id: 'card',
	ddo_map: [
		{ tipo: 'test140', section_tipo: 'self', mode: 'list' },
		{ tipo: 'test221', section_tipo: 'self', mode: 'list' },
	],
};

describe('RagConfig.getEmbedGroups (section_map rag.embed)', () => {
	test('parses the canonical array-of-groups shape', async () => {
		const cfg = new RagConfig(fakeOntology({ sectionMapRag: { dd_sec: { embed: [CARD_GROUP] } } }));
		const groups = await cfg.getEmbedGroups('dd_sec');
		expect(groups.length).toBe(1);
		expect(groups[0]?.id).toBe('card');
		expect(groups[0]?.ddoMap.length).toBe(2);
		expect(groups[0]?.ddoMap[0]?.tipo).toBe('test140');
	});

	test('drops malformed groups loudly and keeps valid ones', async () => {
		const cfg = new RagConfig(
			fakeOntology({
				sectionMapRag: {
					dd_sec: {
						embed: [
							CARD_GROUP,
							'not-an-object', // dropped
							{ id: 'BAD ID!', ddo_map: CARD_GROUP.ddo_map }, // invalid slug
							{ id: 'noddomap' }, // missing ddo_map
							{ id: 'empty', ddo_map: [] }, // no valid entries
							{ id: 'card', ddo_map: CARD_GROUP.ddo_map }, // duplicate id
						],
					},
				},
			}),
		);
		const groups = await cfg.getEmbedGroups('dd_sec');
		expect(groups.map((g) => g.id)).toEqual(['card']);
	});

	test('a non-array embed (legacy/typo shape) yields no groups', async () => {
		const cfg = new RagConfig(
			fakeOntology({ sectionMapRag: { dd_sec: { embed: { card: CARD_GROUP } } } }),
		);
		expect(await cfg.getEmbedGroups('dd_sec')).toEqual([]);
	});

	test('invalid ddo entries are dropped, valid ones kept', async () => {
		const cfg = new RagConfig(
			fakeOntology({
				sectionMapRag: {
					dd_sec: {
						embed: [
							{
								id: 'default',
								ddo_map: [
									{ tipo: 'test140', section_tipo: 'self', mode: 'list' },
									{ no_tipo: true }, // fails ddoSchema → dropped
								],
							},
						],
					},
				},
			}),
		);
		const groups = await cfg.getEmbedGroups('dd_sec');
		expect(groups[0]?.ddoMap.length).toBe(1);
	});

	test('caches per instance (one section_map read)', async () => {
		let calls = 0;
		const onto: OntologyPort = {
			getProperties: async () => null,
			getModelByTipo: async () => null,
			getTranslatable: async () => false,
			getSectionMapRag: async () => {
				calls++;
				return { embed: [CARD_GROUP] };
			},
		};
		const cfg = new RagConfig(onto);
		await cfg.getEmbedGroups('dd_sec');
		await cfg.getEmbedGroups('dd_sec');
		expect(calls).toBe(1);
	});
});

describe('RagConfig.sectionIsRagEnabled', () => {
	test('true iff at least one valid embed group exists', async () => {
		const cfg = new RagConfig(
			fakeOntology({
				sectionMapRag: {
					dd_on: { embed: [CARD_GROUP] },
					dd_empty: { embed: [] },
					dd_none: {},
				},
			}),
		);
		expect(await cfg.sectionIsRagEnabled('dd_on')).toBe(true);
		expect(await cfg.sectionIsRagEnabled('dd_empty')).toBe(false);
		expect(await cfg.sectionIsRagEnabled('dd_none')).toBe(false);
		expect(await cfg.sectionIsRagEnabled('dd_missing')).toBe(false);
	});

	test('the RETIRED boolean opt-in (properties.rag.enabled) no longer enables', async () => {
		const cfg = new RagConfig(
			fakeOntology({ properties: { dd_bool: { rag: { enabled: true } } } }),
		);
		expect(await cfg.sectionIsRagEnabled('dd_bool')).toBe(false);
	});
});

describe('RagConfig.getGroupRagConfig', () => {
	test('group chunk/mode/strategy win; section-level strategy/system_prompt fall back', async () => {
		const cfg = new RagConfig(
			fakeOntology({
				sectionMapRag: {
					dd_sec: {
						strategy: 'structural',
						system_prompt: 'be terse',
						embed: [
							CARD_GROUP,
							{
								id: 'fulltext',
								ddo_map: [{ tipo: 'test210', section_tipo: 'self', mode: 'list' }],
								mode: 'long_document',
								strategy: 'structural_semantic',
								chunk: { max_tokens: 300, min_tokens: 80 },
							},
						],
					},
				},
			}),
		);
		const fulltext = await cfg.getGroupRagConfig('dd_sec', 'fulltext');
		expect(fulltext.embed).toBe(true);
		expect(fulltext.mode).toBe('long_document');
		expect(fulltext.strategy).toBe('structural_semantic'); // group override
		expect(fulltext.chunk).toEqual({ maxTokens: 300, minTokens: 80 });
		expect(fulltext.systemPrompt).toBe('be terse'); // section-level

		const card = await cfg.getGroupRagConfig('dd_sec', 'card');
		expect(card.embed).toBe(true);
		expect(card.strategy).toBe('structural'); // section-level fallback
		expect(card.mode).toBe('auto');

		const missing = await cfg.getGroupRagConfig('dd_sec', 'nope');
		expect(missing.embed).toBe(false);
	});
});

describe('RagConfig.getContext (properties.rag.context — unchanged surface)', () => {
	function ctxOntology(props: Record<string, Record<string, unknown>>): OntologyPort {
		return {
			getProperties: async (t: string) => props[t] ?? null,
			getModelByTipo: async () => null,
			getTranslatable: async () => false,
			getSectionMapRag: async () => null,
		};
	}

	test('normalizes images (object + bare string), metadata, compare_scope', async () => {
		const cfg = new RagConfig(
			ctxOntology({
				test3: {
					rag: {
						enabled: true,
						context: {
							images: [
								{ tipo: 'test99', view: 'obverse' },
								'test30',
								{ tipo: '', view: 'x' },
								{ view: 'y' },
							],
							metadata: { typology: 'test26', material: 'test27', bad: '', other: 5 },
							compare_scope: ['test3', 'test6', ''],
						},
					},
				},
			}),
		);
		const ctx = await cfg.getContext('test3');
		expect(ctx).not.toBeNull();
		expect(ctx!.images).toEqual([
			{ tipo: 'test99', view: 'obverse' },
			{ tipo: 'test30', view: null },
		]);
		expect(ctx!.metadata).toEqual({ typology: 'test26', material: 'test27' });
		expect(ctx!.compareScope).toEqual(['test3', 'test6']);
	});

	test('getContextImages / getContextMetadata / sectionHasImageContext', async () => {
		const cfg = new RagConfig(
			ctxOntology({
				test3: { rag: { context: { images: ['test99'], metadata: { typology: 'test26' } } } },
			}),
		);
		expect(await cfg.sectionHasImageContext('test3')).toBe(true);
		expect(await cfg.getContextImages('test3')).toEqual([{ tipo: 'test99', view: null }]);
		expect(await cfg.getContextMetadata('test3')).toEqual({ typology: 'test26' });
	});

	test('getCompareScope defaults to [sectionTipo] when absent or not an array', async () => {
		const cfg = new RagConfig(
			ctxOntology({
				test3: { rag: { context: { images: ['test99'], compare_scope: 'same_section' } } },
				test6: { rag: { context: { images: ['test99'] } } },
			}),
		);
		expect(await cfg.getCompareScope('test3')).toEqual(['test3']);
		expect(await cfg.getCompareScope('test6')).toEqual(['test6']);
	});

	test('no context → null + empty getters + same_section scope', async () => {
		const cfg = new RagConfig(ctxOntology({ test3: { rag: { enabled: true } } }));
		expect(await cfg.getContext('test3')).toBeNull();
		expect(await cfg.sectionHasImageContext('test3')).toBe(false);
		expect(await cfg.getContextImages('test3')).toEqual([]);
		expect(await cfg.getContextMetadata('test3')).toEqual({});
		expect(await cfg.getCompareScope('test3')).toEqual(['test3']);
	});

	test('context is cached per instance (one ontology read)', async () => {
		let reads = 0;
		const ontology: OntologyPort = {
			getProperties: async () => {
				reads++;
				return { rag: { context: { images: ['test99'] } } };
			},
			getModelByTipo: async () => null,
			getTranslatable: async () => false,
			getSectionMapRag: async () => null,
		};
		const cfg = new RagConfig(ontology);
		await cfg.getContext('test3');
		await cfg.getContextImages('test3');
		await cfg.getCompareScope('test3');
		expect(reads).toBe(1);
	});
});
