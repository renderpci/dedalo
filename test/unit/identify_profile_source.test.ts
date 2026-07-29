/**
 * Loading a profile from the ontology descriptor (src/core/identify/profile_source.ts).
 *
 * The whole point of this module is the difference between three answers that a
 * lesser loader collapses into one:
 *
 *   ABSENT      → null. "This section does not do identification" is normal.
 *   MALFORMED   → throw. A criterion that quietly stops contributing still
 *                 produces a confident score from fewer features than the
 *                 curator configured, and ranked output hides that perfectly.
 *   UNREADABLE  → throw. An ontology read that FAILED is not a section without
 *                 a profile; caching it as one would be permanent.
 *
 * Descriptors are injected through the port seam — no test writes to
 * dd_ontology. The live-DB cases below use `test3`, which declares no
 * `properties.identify`, and therefore prove the real read path answers "no
 * profile" cleanly rather than crashing.
 */

import { describe, expect, test } from 'bun:test';
import { ProfileError } from '../../src/core/identify/profile.ts';
import {
	type ProfileSourceNode,
	type ProfileSourcePort,
	buildOntologyProfileSourcePort,
	clearIdentifyProfileCache,
	loadProfileForSection,
} from '../../src/core/identify/profile_source.ts';
import { DB_READY } from '../helpers/db_ready.ts';

/** A descriptor whose one criterion resolves against the live test3 playground. */
function descriptor(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		label: 'Test objects',
		criteria: [
			{
				id: 'legend',
				label: 'Legend',
				path: [{ section_tipo: 'test3', component_tipo: 'test52' }],
				role: 'identifying',
				weight: 2,
			},
		],
		...overrides,
	};
}

/** A port serving one canned descriptor for every section. */
function portFor(raw: unknown): ProfileSourcePort {
	return { getIdentifyDescriptor: async () => raw };
}

/**
 * The live-ontology cases are gated at COLLECTION time (test/helpers/db_ready.ts).
 * They used to carry `if (!dbReady) return;` in the body, which on a machine
 * without Postgres reported a PASS with no assertions — the "skips honestly" the
 * comment claimed was a green tick over nothing.
 */

describe.if(DB_READY)('loadProfileForSection — a valid descriptor', () => {
	test('parses, and takes its identity from the section it is declared on', async () => {
		const profile = await loadProfileForSection('test3', portFor(descriptor()));
		expect(profile).not.toBeNull();
		// The descriptor is LOCATED by section, so it need not repeat that location.
		expect(profile?.id).toBe('test3');
		expect(profile?.sectionTipos).toEqual(['test3']);
		expect(profile?.label).toBe('Test objects');
		expect(profile?.criteria).toHaveLength(1);
		expect(profile?.criteria[0]?.weight).toBe(2);
		// parseProfile's defaults still apply through the loader.
		expect(profile?.thresholds).toEqual({ sameType: 0.85, candidate: 0.5 });
	});

	test('an explicit sectionTipos list is honoured (cross-section identification)', async () => {
		const profile = await loadProfileForSection(
			'test3',
			portFor(descriptor({ id: 'objects', sectionTipos: ['test3', 'test2'] })),
		);
		expect(profile?.id).toBe('objects');
		expect(profile?.sectionTipos).toEqual(['test3', 'test2']);
	});
});

describe('loadProfileForSection — absence is not an error', () => {
	test('a section with no descriptor answers null', async () => {
		expect(await loadProfileForSection('test3', portFor(null))).toBeNull();
		expect(await loadProfileForSection('test3', portFor(undefined))).toBeNull();
	});

	test.if(DB_READY)(
		'the LIVE ontology read of a section without properties.identify answers null',
		async () => {
			// The real port, the real resolver, a real section: the "no profile" path
			// must be a clean answer, not a crash.
			clearIdentifyProfileCache();
			expect(await loadProfileForSection('test3')).toBeNull();
			// …and again, now served from the ontology cache.
			expect(await loadProfileForSection('test3')).toBeNull();
		},
	);
});

describe('loadProfileForSection — malformed descriptors FAIL LOUDLY', () => {
	test('a descriptor that is not an object', async () => {
		await expect(loadProfileForSection('test3', portFor('yes'))).rejects.toThrow(
			/must be an object/,
		);
		// Present-but-wrong must never be laundered into "declares nothing".
		await expect(loadProfileForSection('test3', portFor(['a']))).rejects.toThrow(ProfileError);
	});

	test('a criterion with no identifying role, an unknown mode, or no path', async () => {
		await expect(
			loadProfileForSection(
				'test3',
				portFor(descriptor({ criteria: [{ id: 'x', path: [], role: 'identifying' }] })),
			),
		).rejects.toThrow(/no field path/);
		await expect(
			loadProfileForSection(
				'test3',
				portFor(
					descriptor({
						criteria: [
							{
								id: 'x',
								path: [{ section_tipo: 'test3', component_tipo: 'test52' }],
								role: 'identifying',
								mode: 'vibes',
							},
						],
					}),
				),
			),
		).rejects.toThrow(/unknown match mode/);
	});

	test.if(DB_READY)(
		'a path hop the live ontology does not have — never a silent skip',
		async () => {
			await expect(
				loadProfileForSection(
					'test3',
					portFor(
						descriptor({
							criteria: [
								{
									id: 'gone',
									path: [{ section_tipo: 'test3', component_tipo: 'test999999' }],
									role: 'identifying',
								},
							],
						}),
					),
				),
			).rejects.toThrow(/does not exist/);
		},
	);

	test('an UNKNOWN key is refused, with the nearest known spelling named', async () => {
		// `weigth: 5` parses fine and weighs 1 — the same defect as a dropped
		// criterion, wearing a typo. Refusing it is the only version a curator can
		// act on.
		await expect(
			loadProfileForSection(
				'test3',
				portFor(
					descriptor({
						criteria: [
							{
								id: 'x',
								path: [{ section_tipo: 'test3', component_tipo: 'test52' }],
								role: 'identifying',
								weigth: 5,
							},
						],
					}),
				),
			),
		).rejects.toThrow(/unknown key 'weigth'/);
		// The snake_case-vs-camelCase mistake gets the pointed message.
		await expect(
			loadProfileForSection('test3', portFor(descriptor({ section_tipos: ['test3'] }))),
		).rejects.toThrow(/did you mean 'sectionTipos'/);
		await expect(
			loadProfileForSection(
				'test3',
				portFor(descriptor({ thresholds: { same_type: 0.9, candidate: 0.5 } })),
			),
		).rejects.toThrow(/did you mean 'sameType'/);
	});

	test.if(DB_READY)(
		'previewComponent travels through the loader, and a wrong one is refused',
		async () => {
			const profile = await loadProfileForSection(
				'test3',
				portFor(descriptor({ previewComponent: 'test99' })),
			);
			expect(profile?.previewComponent).toBe('test99');

			// A misspelled or non-media preview component fails INVISIBLY at run time
			// (no thumbnail, forever, on a panel whose job is visual comparison), so
			// the descriptor is refused instead.
			await expect(
				loadProfileForSection('test3', portFor(descriptor({ previewComponent: 'test52' }))),
			).rejects.toThrow(/not a media component/);
			// …and the key itself must be spelled right, like every other one.
			await expect(
				loadProfileForSection('test3', portFor(descriptor({ preview_component: 'test99' }))),
			).rejects.toThrow(/did you mean 'previewComponent'/);
		},
	);

	test.if(DB_READY)(
		'a profile declaring it does not apply to the section it is attached to',
		async () => {
			// Silent consequence if allowed: the pool query would search OTHER sections
			// while the seed lives here.
			await expect(
				loadProfileForSection('test3', portFor(descriptor({ sectionTipos: ['test2'] }))),
			).rejects.toThrow(/but its sectionTipos are/);
		},
	);

	test('a FAILED ontology read is not reported as "no profile"', async () => {
		const broken: ProfileSourcePort = {
			getIdentifyDescriptor: async () => {
				throw new Error('connection reset');
			},
		};
		await expect(loadProfileForSection('test3', broken)).rejects.toThrow(/could not read/);
	});
});

describe('the ontology port', () => {
	const node = (properties: unknown, relations: unknown = null): ProfileSourceNode => ({
		properties,
		relations,
	});

	test('reads properties.identify off the section node', async () => {
		const port = buildOntologyProfileSourcePort(async (tipo) =>
			tipo === 'sec1' ? node({ identify: { id: 'p' }, rag: {} }) : null,
		);
		expect(await port.getIdentifyDescriptor('sec1')).toEqual({ id: 'p' });
		expect(await port.getIdentifyDescriptor('missing')).toBeNull();
		expect(await port.getIdentifyDescriptor('sec1')).not.toBeNull();
	});

	test('a VIRTUAL section falls through to its real section, but its own wins', async () => {
		// Same rule as every other per-section descriptor read (getSectionMap,
		// RagConfig): without the fallback, every virtual view of a section would
		// silently have no identification.
		const nodes: Record<string, ProfileSourceNode> = {
			real: node({ identify: { id: 'real' } }),
			virtual: node(null, [{ tipo: 'real' }]),
			overriding: node({ identify: { id: 'own' } }, [{ tipo: 'real' }]),
		};
		const port = buildOntologyProfileSourcePort(async (tipo) => nodes[tipo] ?? null);
		expect(await port.getIdentifyDescriptor('virtual')).toEqual({ id: 'real' });
		expect(await port.getIdentifyDescriptor('overriding')).toEqual({ id: 'own' });
	});

	test('a node with no properties at all is simply absent', async () => {
		const port = buildOntologyProfileSourcePort(async () => node(null));
		expect(await port.getIdentifyDescriptor('sec1')).toBeNull();
	});
});

describe('caching', () => {
	test.if(DB_READY)('an injected port neither reads nor poisons the shared cache', async () => {
		// A fake must never become what the server serves. Both directions:
		clearIdentifyProfileCache();
		expect((await loadProfileForSection('test3', portFor(descriptor())))?.id).toBe('test3');
		expect(await loadProfileForSection('test3')).toBeNull(); // the real ontology answers
		expect((await loadProfileForSection('test3', portFor(descriptor())))?.id).toBe('test3');
	});

	test('every call through an injected port re-reads it', async () => {
		let reads = 0;
		const counting: ProfileSourcePort = {
			getIdentifyDescriptor: async () => {
				reads++;
				return null;
			},
		};
		await loadProfileForSection('test3', counting);
		await loadProfileForSection('test3', counting);
		expect(reads).toBe(2);
	});
});
