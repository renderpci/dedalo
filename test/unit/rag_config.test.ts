import { describe, expect, test } from 'bun:test';
import { type OntologyPort, RagConfig } from '../../src/ai/rag/config.ts';

/**
 * RAG config opt-in resolution. Ported from `src/ai/rag2/test/rag_config.test.ts`
 * (Brick 2), adapted to this branch's `OntologyPort` seam (adds getTranslatable).
 */

/** Minimal fake OntologyPort: properties + model + children maps. */
function fakeOntology(opts: {
	properties?: Record<string, Record<string, unknown>>;
	models?: Record<string, string>;
	children?: Record<string, string[]>;
	translatable?: Record<string, boolean>;
}): OntologyPort {
	return {
		getProperties: async (tipo: string) => opts.properties?.[tipo] ?? null,
		getModelByTipo: async (tipo: string) => opts.models?.[tipo] ?? null,
		getRecursiveChildren: async (tipo: string) => opts.children?.[tipo] ?? [],
		getTranslatable: async (tipo: string) => opts.translatable?.[tipo] ?? false,
	};
}

describe('RagConfig.sectionIsRagEnabled', () => {
	test('true only when properties.rag.enabled === true', async () => {
		const cfg = new RagConfig(
			fakeOntology({
				properties: {
					dd_on: { rag: { enabled: true } },
					dd_off: { rag: { enabled: false } },
					dd_none: {},
				},
			}),
		);
		expect(await cfg.sectionIsRagEnabled('dd_on')).toBe(true);
		expect(await cfg.sectionIsRagEnabled('dd_off')).toBe(false);
		expect(await cfg.sectionIsRagEnabled('dd_none')).toBe(false);
		expect(await cfg.sectionIsRagEnabled('dd_missing')).toBe(false);
	});
});

describe('RagConfig.componentIsEmbeddable', () => {
	test('true only when properties.rag.embed === true', async () => {
		const cfg = new RagConfig(
			fakeOntology({ properties: { c_yes: { rag: { embed: true } }, c_no: { rag: {} } } }),
		);
		expect(await cfg.componentIsEmbeddable('c_yes')).toBe(true);
		expect(await cfg.componentIsEmbeddable('c_no')).toBe(false);
	});
});

describe('RagConfig.getEmbeddableComponentTipos', () => {
	test('returns embeddable text-bearing children, filtered by model AND flag', async () => {
		const cfg = new RagConfig(
			fakeOntology({
				children: { dd_sec: ['c_text', 'c_img', 'c_textnoembed', 'c_other'] },
				models: {
					c_text: 'component_text_area',
					c_img: 'component_image',
					c_textnoembed: 'component_input_text',
					c_other: 'component_select',
				},
				properties: {
					c_text: { rag: { embed: true } },
					c_img: { rag: { embed: true } }, // wrong model → excluded
					c_textnoembed: { rag: { embed: false } }, // right model, not opted in
				},
			}),
		);
		expect(await cfg.getEmbeddableComponentTipos('dd_sec')).toEqual(['c_text']);
	});

	test('caches the result per instance', async () => {
		let calls = 0;
		const onto: OntologyPort = {
			getRecursiveChildren: async () => {
				calls++;
				return [];
			},
			getModelByTipo: async () => null,
			getProperties: async () => null,
			getTranslatable: async () => false,
		};
		const cfg = new RagConfig(onto);
		await cfg.getEmbeddableComponentTipos('dd_sec');
		await cfg.getEmbeddableComponentTipos('dd_sec');
		expect(calls).toBe(1);
	});
});

describe('RagConfig.getComponentRagConfig', () => {
	test('reads strategy / mode / chunk budgets / system_prompt', async () => {
		const cfg = new RagConfig(
			fakeOntology({
				properties: {
					c: {
						rag: {
							embed: true,
							strategy: 'structural',
							mode: 'transcription',
							chunk: { max_tokens: 300, min_tokens: 80 },
							system_prompt: 'be terse',
						},
					},
				},
			}),
		);
		const rc = await cfg.getComponentRagConfig('c');
		expect(rc.embed).toBe(true);
		expect(rc.strategy).toBe('structural');
		expect(rc.mode).toBe('transcription');
		expect(rc.chunk).toEqual({ maxTokens: 300, minTokens: 80 });
		expect(rc.systemPrompt).toBe('be terse');
	});

	test('defaults strategy/mode when rag is sparse', async () => {
		const cfg = new RagConfig(fakeOntology({ properties: { c: { rag: { embed: true } } } }));
		const rc = await cfg.getComponentRagConfig('c');
		expect(rc.strategy).toBe('structural_semantic');
		expect(rc.mode).toBe('auto');
	});
});

describe('RagConfig.getContext (properties.rag.context)', () => {
	function ctxOntology(props: Record<string, Record<string, unknown>>): OntologyPort {
		return {
			getProperties: async (t: string) => props[t] ?? null,
			getModelByTipo: async () => null,
			getRecursiveChildren: async () => [],
			getTranslatable: async () => false,
		};
	}

	test('normalizes images (object + bare string), metadata, compare_scope', async () => {
		const cfg = new RagConfig(
			ctxOntology({
				rsc170: {
					rag: {
						enabled: true,
						context: {
							images: [
								{ tipo: 'rsc29', view: 'obverse' },
								'rsc30',
								{ tipo: '', view: 'x' },
								{ view: 'y' },
							],
							metadata: { typology: 'rsc40', material: 'rsc41', bad: '', other: 5 },
							compare_scope: ['rsc170', 'rsc6', ''],
						},
					},
				},
			}),
		);
		const ctx = await cfg.getContext('rsc170');
		expect(ctx).not.toBeNull();
		expect(ctx!.images).toEqual([
			{ tipo: 'rsc29', view: 'obverse' },
			{ tipo: 'rsc30', view: null },
		]);
		expect(ctx!.metadata).toEqual({ typology: 'rsc40', material: 'rsc41' });
		expect(ctx!.compareScope).toEqual(['rsc170', 'rsc6']);
	});

	test('getContextImages / getContextMetadata / sectionHasImageContext', async () => {
		const cfg = new RagConfig(
			ctxOntology({
				rsc170: { rag: { context: { images: ['rsc29'], metadata: { typology: 'rsc40' } } } },
			}),
		);
		expect(await cfg.sectionHasImageContext('rsc170')).toBe(true);
		expect(await cfg.getContextImages('rsc170')).toEqual([{ tipo: 'rsc29', view: null }]);
		expect(await cfg.getContextMetadata('rsc170')).toEqual({ typology: 'rsc40' });
	});

	test('getCompareScope defaults to [sectionTipo] when absent or not an array', async () => {
		const cfg = new RagConfig(
			ctxOntology({
				rsc170: { rag: { context: { images: ['rsc29'], compare_scope: 'same_section' } } },
				rsc6: { rag: { context: { images: ['rsc29'] } } },
			}),
		);
		expect(await cfg.getCompareScope('rsc170')).toEqual(['rsc170']);
		expect(await cfg.getCompareScope('rsc6')).toEqual(['rsc6']);
	});

	test('no context → null + empty getters + same_section scope', async () => {
		const cfg = new RagConfig(ctxOntology({ rsc170: { rag: { enabled: true } } }));
		expect(await cfg.getContext('rsc170')).toBeNull();
		expect(await cfg.sectionHasImageContext('rsc170')).toBe(false);
		expect(await cfg.getContextImages('rsc170')).toEqual([]);
		expect(await cfg.getContextMetadata('rsc170')).toEqual({});
		expect(await cfg.getCompareScope('rsc170')).toEqual(['rsc170']);
	});

	test('context is cached per instance (one ontology read)', async () => {
		let reads = 0;
		const ontology: OntologyPort = {
			getProperties: async () => {
				reads++;
				return { rag: { context: { images: ['rsc29'] } } };
			},
			getModelByTipo: async () => null,
			getRecursiveChildren: async () => [],
			getTranslatable: async () => false,
		};
		const cfg = new RagConfig(ontology);
		await cfg.getContext('rsc170');
		await cfg.getContextImages('rsc170');
		await cfg.getCompareScope('rsc170');
		expect(reads).toBe(1);
	});
});
