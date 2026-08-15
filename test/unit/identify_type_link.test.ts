/**
 * dd_identify_api:resolve_type_link — the read that makes TYPE PROMOTION
 * possible (src/core/api/handlers/dd_identify_api.ts).
 *
 * Promotion is the endpoint of "similarity first, then curator-promoted Type
 * records": a curator looking at a cluster mints (or picks) a canonical Type and
 * links every member to it. The LINK is an ordinary component_portal value, so
 * the write is the standard `change_value` save issued per member from the
 * client — there is no write endpoint here and this gate would notice if one
 * appeared, because everything below runs with fakes that cannot write.
 *
 * What is gated here is the three facts a client cannot work out for itself, and
 * each of them is a way to silently corrupt curatorial data if it is guessed:
 *
 *  1. WHETHER PROMOTION IS MEANINGFUL AT ALL. `typeSectionTipo: null` is a photo
 *     archive: it clusters, and it has nothing to promote INTO. That must be a
 *     distinct, stated decline — the panel says so in words instead of offering
 *     a button that cannot work.
 *  2. WHICH COMPONENT IS THE TYPE LINK. Derived from the profile (the entry
 *     component of a criterion whose FIRST hop lands in the Type section), never
 *     guessed. A section normally has several relation components aimed at the
 *     Type section, and writing thirty confirmations into the wrong one is
 *     invisible and permanent — so "no criterion reveals it" must REFUSE.
 *  3. WHAT THIS CALLER MAY DO. Write grants (link component, Type section, the
 *     Type's label component) are resolved server-side; a client-side guess about
 *     a permission is a guess about a permission.
 *
 * Plus the survey the common case rests on ("the type is already catalogued"):
 * the Types the given members already carry, gated twice — the component grant on
 * the member, then the record scope gate on the Type before its label is quoted.
 */

import { describe, expect, test } from 'bun:test';
import type { ApiRequestContext } from '../../src/core/api/dispatch.ts';
import {
	buildIdentifyByImage,
	buildResolveTypeLink,
	type IdentifyByImageDeps,
	type IdentifyTypeLinkDeps,
	identifyApiActions,
	MAX_SURVEY_RECORDS,
	typeLinkCandidates,
} from '../../src/core/api/handlers/dd_identify_api.ts';
import type { ApiResult } from '../../src/core/api/response.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import { ProfileError, parseProfile } from '../../src/core/identify/profile.ts';
import type { IdentificationProfile } from '../../src/core/identify/types.ts';
import type { Principal } from '../../src/core/security/permissions.ts';

const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };

const rqo = (options: Record<string, unknown>): Rqo => ({ options }) as unknown as Rqo;

const ctx = (principal: Principal): ApiRequestContext =>
	({
		requestId: 'test',
		clientIp: '127.0.0.1',
		session: null,
		csrfCandidate: null,
		principal,
	}) as ApiRequestContext;

/**
 * The coin profile of IDENTIFY_SPEC §3.1, reduced to what promotion reads:
 * `obverse_legend` hops Coin → Type through `numisdata161` (so THAT is the Type
 * link), `weight_g` stays on the coin, and `mint` hops somewhere else entirely.
 */
function coinProfile(overrides: Record<string, unknown> = {}): IdentificationProfile {
	return parseProfile({
		id: 'coin_types',
		label: 'Coin identification',
		sectionTipos: ['numisdata4'],
		typeSectionTipo: 'numisdata3',
		criteria: [
			{
				id: 'weight_g',
				label: 'Weight (g)',
				path: [{ section_tipo: 'numisdata4', component_tipo: 'numisdata22' }],
				role: 'descriptive',
				mode: 'numeric_tolerance',
				tolerance: 0.15,
			},
			{
				id: 'obverse_legend',
				label: 'Type › Obverse legend',
				path: [
					{ section_tipo: 'numisdata4', component_tipo: 'numisdata161' },
					{ section_tipo: 'numisdata3', component_tipo: 'numisdata40' },
				],
				role: 'identifying',
				mode: 'same_locator',
				weight: 3,
			},
			{
				id: 'reverse_legend',
				label: 'Type › Reverse legend',
				path: [
					{ section_tipo: 'numisdata4', component_tipo: 'numisdata161' },
					{ section_tipo: 'numisdata3', component_tipo: 'numisdata41' },
				],
				role: 'identifying',
				mode: 'same_locator',
				weight: 2,
			},
			{
				id: 'findspot',
				label: 'Findspot › Name',
				path: [
					{ section_tipo: 'numisdata4', component_tipo: 'numisdata99' },
					{ section_tipo: 'rsc2', component_tipo: 'rsc45' },
				],
				role: 'descriptive',
				mode: 'same_locator',
			},
		],
		...overrides,
	});
}

/** Everything permitted, nothing real behind it, no members surveyed. */
function fakeDeps(overrides: Partial<IdentifyTypeLinkDeps> = {}): IdentifyTypeLinkDeps {
	return {
		loadProfile: async () => coinProfile(),
		canReadSection: async () => true,
		componentGrant: async () => 2,
		componentModel: async (tipo) =>
			tipo === 'numisdata3_term' ? 'component_input_text' : 'component_portal',
		modelColumn: (model) => (model === 'component_portal' ? 'relation' : 'string'),
		labelComponent: async () => 'numisdata3_term',
		readValues: async () => null,
		scopeRecords: async (records) => records,
		// Every fake record exists unless a case says otherwise (the check itself
		// is exercised in identify_promote_write_path.test.ts).
		recordExists: async () => true,
		...overrides,
	};
}

const body = (res: ApiResult): Record<string, unknown> => res.body.data as Record<string, unknown>;

/**
 * ENVELOPE v2 (engineering/ERRORS_SPEC.md §4): a decline is a THROWN registry
 * code — the handler builds no failure body, and the dispatch chokepoint
 * converts it (registry status, `{ok:false, error:{code}}`). This unwraps the
 * throw so each case can assert the CODE, which is the contract now.
 */
async function declineOf(call: Promise<unknown>): Promise<DedaloError> {
	const outcome = await call.then(
		(value) => ({ threw: false as const, value }),
		(error: unknown) => ({ threw: true as const, error }),
	);
	if (!outcome.threw) {
		throw new Error(`expected a decline, got ${JSON.stringify(outcome.value)}`);
	}
	if (!(outcome.error instanceof DedaloError)) throw outcome.error;
	return outcome.error;
}

describe('typeLinkCandidates — the one rule, derived from the profile', () => {
	test('only a criterion whose FIRST hop lands in the Type section reveals the link', () => {
		const candidates = typeLinkCandidates(coinProfile(), 'numisdata4');
		expect(candidates.map((candidate) => candidate.componentTipo)).toEqual(['numisdata161']);
		// Both criteria that reach the typology through it are cited, so the panel
		// can say WHY this component and not another.
		expect(candidates[0]?.revealedBy.map((entry) => entry.criterionId)).toEqual([
			'obverse_legend',
			'reverse_legend',
		]);
	});

	test('a profile with no Type section reveals nothing at all', () => {
		expect(typeLinkCandidates(coinProfile({ typeSectionTipo: null }), 'numisdata4')).toEqual([]);
	});

	test('a Type reached TWO hops out is not a component of the object, so it is not a link', () => {
		const profile = coinProfile({
			criteria: [
				{
					id: 'far',
					label: 'Far',
					path: [
						{ section_tipo: 'numisdata4', component_tipo: 'numisdata99' },
						{ section_tipo: 'rsc2', component_tipo: 'rsc45' },
						{ section_tipo: 'numisdata3', component_tipo: 'numisdata40' },
					],
					role: 'identifying',
					mode: 'same_locator',
					weight: 1,
				},
			],
		});
		expect(typeLinkCandidates(profile, 'numisdata4')).toEqual([]);
	});
});

/**
 * THE ROW IN IDENTIFY_SPEC §8: "the Type-link rule has ONE definition, shared by
 * `identify_by_image` and promotion".
 *
 * `identify_by_image` reaches the rule through a module-private wrapper, so no
 * import can be asserted from here. What CAN be asserted is behaviour on a
 * fixture where the one rule and the rule it forbids disagree — which the coin
 * fixture above does not do, because every plausible rule picks `numisdata161`
 * there and the gate would have been green over a copy-pasted second definition.
 *
 * So: a section holding TWO relation components aimed at the Type section, only
 * one of which any criterion reveals. The forbidden fallback ("the portal that
 * happens to point at the right section") reads both and reports Type 88;
 * `typeLinkCandidates` reads only the revealed one and reports Type 77.
 */
describe('the Type-link rule has ONE definition — identify_by_image applies it too', () => {
	/** `numisdata161` is revealed by a criterion; `numisdata900` is the decoy. */
	function twoPortalProfile(): IdentificationProfile {
		return coinProfile({
			criteria: [
				{
					id: 'obverse_legend',
					label: 'Type › Obverse legend',
					path: [
						{ section_tipo: 'numisdata4', component_tipo: 'numisdata161' },
						{ section_tipo: 'numisdata3', component_tipo: 'numisdata40' },
					],
					role: 'identifying',
					mode: 'same_locator',
					weight: 3,
				},
			],
		});
	}

	/** Both portals hold a locator into the Type section; only one is the link. */
	const REVEALED_TYPE_ID = 77;
	const DECOY_TYPE_ID = 88;

	function imageDeps(readComponents: string[]): IdentifyByImageDeps {
		return {
			ragEnabled: () => true,
			mediaEnabled: () => true,
			config: () => ({
				mediaEnabled: true,
				provider: 'local',
				model: 'fake-multimodal',
				endpoint: '',
				apiKey: undefined,
				imageMaxPx: 512,
				imageHybrid: true,
				nearDuplicateSimilarity: 0.93,
				characterizeTopK: 20,
				imageEgressPolicy: 'local_only',
			}),
			buildProvider: () => ({
				embedImage: async () => [[1, 0, 0]],
				embedTextForImageSearch: async () => [],
				dimension: () => 3,
				model: () => 'fake-multimodal',
				provider: () => 'local',
				isExternal: () => false,
			}),
			queryImagePartition: async () => [
				{
					sectionTipo: 'numisdata4',
					sectionId: 13,
					componentTipo: 'rsc29',
					lang: 'lg-nolan',
					chunkIndex: 0,
					sourceText: 'caption',
					sourceKind: 'image_visual',
					modality: 'image',
					egressClass: 'public',
					parentKey: 'numisdata4_13',
					chunkMeta: {},
					distance: 0.1,
				},
			],
			filterAccessible: async (_principal, candidates) => candidates,
			componentGrant: async () => 1,
			scopeRecords: async (records) => records,
			labelComponent: async () => 'numisdata3_term',
			loadProfile: async () => twoPortalProfile(),
			readValues: async (_record, path) => {
				const tipo = path[0]?.component_tipo ?? '';
				readComponents.push(tipo);
				if (tipo === 'numisdata161') {
					return {
						kind: 'locators',
						locators: [{ section_tipo: 'numisdata3', section_id: String(REVEALED_TYPE_ID) }],
					};
				}
				if (tipo === 'numisdata900') {
					return {
						kind: 'locators',
						locators: [{ section_tipo: 'numisdata3', section_id: String(DECOY_TYPE_ID) }],
					};
				}
				return { kind: 'text', values: ['a label'] };
			},
		};
	}

	test('the fixture really discriminates (the anti-vacuous half)', () => {
		// One rule says numisdata161. The forbidden "any portal aimed at the Type
		// section" fallback would additionally offer numisdata900 — which exists on
		// this section and holds a Type locator, and which no criterion mentions.
		expect(
			typeLinkCandidates(twoPortalProfile(), 'numisdata4').map(
				(candidate) => candidate.componentTipo,
			),
		).toEqual(['numisdata161']);
	});

	test('identify_by_image resolves Types through the revealed component ONLY', async () => {
		const read: string[] = [];
		const res = await buildIdentifyByImage(imageDeps(read))(
			rqo({
				image: `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64')}`,
			}),
			ctx(SUPERUSER),
		);
		const answer = res.body.data as { results: { types: { section_id: number }[] }[] };
		expect(answer.results[0]?.types.map((type) => type.section_id)).toEqual([REVEALED_TYPE_ID]);
		// The decoy was never even READ: the rule decided which component to open,
		// it did not filter the output of opening every portal.
		expect(read).not.toContain('numisdata900');
		expect(read).toContain('numisdata161');
	});

	test('and promotion derives the SAME component from the SAME profile', async () => {
		const res = await buildResolveTypeLink(
			fakeDeps({ loadProfile: async () => twoPortalProfile() }),
		)(rqo({ section_tipo: 'numisdata4' }), ctx(SUPERUSER));
		expect((body(res).links as { component_tipo: string }[]).map((l) => l.component_tipo)).toEqual([
			'numisdata161',
		]);
	});
});

describe('resolve_type_link — declines, in order', () => {
	test('a missing or unusable section_tipo', async () => {
		const handler = buildResolveTypeLink(fakeDeps());
		for (const options of [{}, { section_tipo: '' }, { section_tipo: 'not a tipo!' }]) {
			const decline = await declineOf(handler(rqo(options), ctx(SUPERUSER)));
			expect(decline.code).toBe('identify.missing_section');
			expect(decline.spec.status).toBe(400);
		}
	});

	test('the section grant is checked BEFORE the profile is loaded', async () => {
		// Otherwise the decline codes become an oracle for which sections declare a
		// typology, for a caller who cannot open the section at all.
		let profileLoaded = false;
		const decline = await declineOf(
			buildResolveTypeLink(
				fakeDeps({
					canReadSection: async () => false,
					loadProfile: async () => {
						profileLoaded = true;
						return coinProfile();
					},
				}),
			)(rqo({ section_tipo: 'numisdata4' }), ctx(SUPERUSER)),
		);
		expect(decline.code).toBe('perm.denied');
		expect(profileLoaded).toBe(false);
	});

	test('no profile, and a malformed one (whose parser message travels)', async () => {
		const none = await declineOf(
			buildResolveTypeLink(fakeDeps({ loadProfile: async () => null }))(
				rqo({ section_tipo: 'numisdata4' }),
				ctx(SUPERUSER),
			),
		);
		expect(none.code).toBe('identify.no_profile');

		const bad = await declineOf(
			buildResolveTypeLink(
				fakeDeps({
					loadProfile: async () => {
						throw new ProfileError("criterion 'legend' hop 1 names component 'x'");
					},
				}),
			)(rqo({ section_tipo: 'numisdata4' }), ctx(SUPERUSER)),
		);
		expect(bad.code).toBe('identify.invalid_profile');
		// PUBLIC disclosure — the parser sentence reaches the wire.
		expect(bad.publicMessage).toContain("criterion 'legend' hop 1");
	});

	test('NO TYPE SECTION is its own decline: a photo archive clusters and promotes nowhere', async () => {
		const decline = await declineOf(
			buildResolveTypeLink(
				fakeDeps({ loadProfile: async () => coinProfile({ typeSectionTipo: null }) }),
			)(rqo({ section_tipo: 'numisdata4' }), ctx(SUPERUSER)),
		);
		expect(decline.code).toBe('identify.no_type_section');
		// Said in words, because the panel repeats it instead of showing a button
		// — and the code is PUBLIC disclosure, so the words reach the wire.
		expect(decline.publicMessage).toContain('nothing to promote');
	});

	test('a Type section with NO criterion reaching it REFUSES rather than guessing a portal', async () => {
		const profile = coinProfile({
			criteria: [
				{
					id: 'weight_g',
					label: 'Weight (g)',
					path: [{ section_tipo: 'numisdata4', component_tipo: 'numisdata22' }],
					role: 'identifying',
					mode: 'numeric_tolerance',
					tolerance: 0.15,
					weight: 1,
				},
			],
		});
		let modelAsked = false;
		const decline = await declineOf(
			buildResolveTypeLink(
				fakeDeps({
					loadProfile: async () => profile,
					componentModel: async () => {
						modelAsked = true;
						return 'component_portal';
					},
				}),
			)(rqo({ section_tipo: 'numisdata4' }), ctx(SUPERUSER)),
		);
		expect(decline.code).toBe('identify.no_link_component');
		expect(decline.publicMessage).toContain('numisdata3');
		// It did not go looking for a plausible component either.
		expect(modelAsked).toBe(false);
	});
});

describe('resolve_type_link — what a caller may actually do', () => {
	test('the derived link, its model, and the criteria that revealed it', async () => {
		const res = await buildResolveTypeLink(fakeDeps())(
			rqo({ section_tipo: 'numisdata4' }),
			ctx(SUPERUSER),
		);
		const result = body(res);
		const links = result.links as Record<string, unknown>[];
		expect(links).toHaveLength(1);
		expect(links[0]?.component_tipo).toBe('numisdata161');
		expect(links[0]?.component_model).toBe('component_portal');
		expect(links[0]?.writable).toBe(true);
		expect(links[0]?.reason).toBe('ok');
		expect(
			(links[0]?.revealed_by as { criterion_id: string }[]).map((e) => e.criterion_id),
		).toEqual(['obverse_legend', 'reverse_legend']);
		expect((result.type_section as Record<string, unknown>).section_tipo).toBe('numisdata3');
	});

	test('read-but-not-write on the link component is reported, not silently writable', async () => {
		const res = await buildResolveTypeLink(
			fakeDeps({
				componentGrant: async (_principal, _sectionTipo, componentTipo) =>
					componentTipo === 'numisdata161' ? 1 : 2,
			}),
		)(rqo({ section_tipo: 'numisdata4' }), ctx(SUPERUSER));
		const links = body(res).links as Record<string, unknown>[];
		expect(links[0]?.writable).toBe(false);
		expect(links[0]?.reason).toBe('forbidden_component');
		expect(String(links[0]?.detail)).toContain('numisdata161');
	});

	test('a link component that does not store locators cannot hold a Type link', async () => {
		const res = await buildResolveTypeLink(
			fakeDeps({
				componentModel: async () => 'component_input_text',
				modelColumn: () => 'string',
			}),
		)(rqo({ section_tipo: 'numisdata4' }), ctx(SUPERUSER));
		const links = body(res).links as Record<string, unknown>[];
		expect(links[0]?.writable).toBe(false);
		expect(links[0]?.reason).toBe('unsupported_component_model');
	});

	test('minting a new Type needs the write grant on the TYPE section, not on this one', async () => {
		const res = await buildResolveTypeLink(
			fakeDeps({
				componentGrant: async (_principal, sectionTipo) => (sectionTipo === 'numisdata3' ? 1 : 2),
			}),
		)(rqo({ section_tipo: 'numisdata4' }), ctx(SUPERUSER));
		const typeSection = body(res).type_section as Record<string, unknown>;
		expect(typeSection.can_create).toBe(false);
		// …and its label component is read-only for the same caller.
		expect((typeSection.label_component as Record<string, unknown>).writable).toBe(false);
	});

	test('a Type section whose main term is a RELATION cannot be named from the panel', async () => {
		const res = await buildResolveTypeLink(
			fakeDeps({
				componentModel: async (tipo) =>
					tipo === 'numisdata3_term' ? 'component_autocomplete' : 'component_portal',
				modelColumn: () => 'relation',
			}),
		)(rqo({ section_tipo: 'numisdata4' }), ctx(SUPERUSER));
		const label = (body(res).type_section as Record<string, unknown>).label_component as Record<
			string,
			unknown
		>;
		expect(label.kind).toBe('relation');
		// A typed string cannot be composed into a thesaurus link: say so, never
		// write an approximation of the curator's name for the Type.
		expect(label.writable).toBe(false);
	});

	test('a Type section that declares no label component at all is null, not a crash', async () => {
		const res = await buildResolveTypeLink(fakeDeps({ labelComponent: async () => null }))(
			rqo({ section_tipo: 'numisdata4' }),
			ctx(SUPERUSER),
		);
		expect((body(res).type_section as Record<string, unknown>).label_component).toBeNull();
	});
});

describe('resolve_type_link — the survey of the members', () => {
	/** Members 11 and 12 already carry Type 5; member 13 carries Type 9. */
	const linkedDeps = (overrides: Partial<IdentifyTypeLinkDeps> = {}) =>
		fakeDeps({
			readValues: async (record, path) => {
				const step = path[0];
				if (step?.component_tipo === 'numisdata161') {
					const typeId = record.sectionId === 13 ? 9 : record.sectionId <= 12 ? 5 : null;
					if (typeId === null) return null;
					return {
						kind: 'locators',
						locators: [{ section_tipo: 'numisdata3', section_id: typeId }],
					};
				}
				if (step?.component_tipo === 'numisdata3_term') {
					return { kind: 'text', values: [`Type ${record.sectionId}`] };
				}
				return null;
			},
			...overrides,
		});

	const members = [
		{ section_tipo: 'numisdata4', section_id: 11 },
		{ section_tipo: 'numisdata4', section_id: 12 },
		{ section_tipo: 'numisdata4', section_id: 13 },
		{ section_tipo: 'numisdata4', section_id: 14 },
	];

	test('the Types the members already carry, commonest first, with their labels', async () => {
		const res = await buildResolveTypeLink(linkedDeps())(
			rqo({ section_tipo: 'numisdata4', records: members }),
			ctx(SUPERUSER),
		);
		const result = body(res);
		expect(result.members_surveyed).toBe(4);
		expect(result.existing_types).toEqual([
			{ section_tipo: 'numisdata3', section_id: 5, label: 'Type 5', member_count: 2 },
			{ section_tipo: 'numisdata3', section_id: 9, label: 'Type 9', member_count: 1 },
		]);
	});

	test('a member the caller may not read is surveyed not at all', async () => {
		const res = await buildResolveTypeLink(
			linkedDeps({
				// The record-scope gate drops 11 and 12: only 13's Type survives.
				scopeRecords: async (records) =>
					records.filter((record) => record.section_id !== 11 && record.section_id !== 12),
			}),
		)(rqo({ section_tipo: 'numisdata4', records: members }), ctx(SUPERUSER));
		const result = body(res);
		expect(result.members_surveyed).toBe(2);
		expect((result.existing_types as { section_id: number }[]).map((t) => t.section_id)).toEqual([
			9,
		]);
	});

	test('a member whose link component the caller may not READ casts no vote', async () => {
		const res = await buildResolveTypeLink(
			linkedDeps({
				componentGrant: async (_principal, sectionTipo, componentTipo) =>
					// readable on the object section for everything except the link itself
					sectionTipo === 'numisdata4' && componentTipo === 'numisdata161' ? 0 : 2,
			}),
		)(rqo({ section_tipo: 'numisdata4', records: members }), ctx(SUPERUSER));
		// The link is still reported (its own grant is the section-level one below),
		// but nothing was read off the members.
		expect(body(res).existing_types).toEqual([]);
	});

	test('a Type record the caller may not read is never named', async () => {
		const res = await buildResolveTypeLink(
			linkedDeps({
				scopeRecords: async (records) =>
					records.filter(
						(record) => !(record.section_tipo === 'numisdata3' && record.section_id === 5),
					),
			}),
		)(rqo({ section_tipo: 'numisdata4', records: members }), ctx(SUPERUSER));
		expect((body(res).existing_types as { section_id: number }[]).map((t) => t.section_id)).toEqual(
			[9],
		);
	});

	test('a member from ANOTHER section is not surveyed: the link component is this section’s', async () => {
		// Reading numisdata161 off an rsc2 record would be reading a component that
		// section does not have. A cluster spanning two sections is two questions.
		const res = await buildResolveTypeLink(linkedDeps())(
			rqo({
				section_tipo: 'numisdata4',
				records: [
					{ section_tipo: 'rsc2', section_id: 11 },
					{ section_tipo: 'numisdata4', section_id: 13 },
				],
			}),
			ctx(SUPERUSER),
		);
		expect(body(res).members_surveyed).toBe(1);
		expect((body(res).existing_types as { section_id: number }[]).map((t) => t.section_id)).toEqual(
			[9],
		);
	});

	test('no members named is an empty survey, not an error', async () => {
		for (const records of [undefined, [], 'nonsense', [{ section_tipo: 'x!', section_id: 0 }]]) {
			const res = await buildResolveTypeLink(linkedDeps())(
				rqo({ section_tipo: 'numisdata4', records }),
				ctx(SUPERUSER),
			);
			expect(res.body.ok).toBe(true);
			expect(body(res).existing_types).toEqual([]);
			expect(body(res).members_surveyed).toBe(0);
		}
	});

	test('the survey is capped: an unbounded member list cannot be a bulk read', async () => {
		const many = Array.from({ length: 500 }, (_value, index) => ({
			section_tipo: 'numisdata4',
			section_id: index + 1,
		}));
		let scoped = 0;
		const res = await buildResolveTypeLink(
			linkedDeps({
				scopeRecords: async (records) => {
					scoped = Math.max(scoped, records.length);
					return records;
				},
			}),
		)(rqo({ section_tipo: 'numisdata4', records: many }), ctx(SUPERUSER));
		// EXACTLY the cap, not "at most" it: `toBeLessThanOrEqual(300)` is also
		// satisfied by 0, so it passed just as happily if the survey never ran at
		// all — and a survey that silently reads nothing is the failure this case
		// is here to notice, not the one it was catching.
		expect(scoped).toBe(MAX_SURVEY_RECORDS);
		expect(body(res).members_surveyed).toBe(MAX_SURVEY_RECORDS);
	});
});

describe('resolve_type_link — registration', () => {
	test('it is on the dd_identify_api action table', () => {
		expect(typeof identifyApiActions.resolve_type_link).toBe('function');
	});
});
