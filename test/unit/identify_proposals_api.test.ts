/**
 * dd_identify_api:get_proposals — serving BOTH proposal sources to a curator.
 *
 * The action is the read half of "AI proposes, human confirms". Four things are
 * gated here, and only the first is "does it work":
 *
 * 1. THE VISION SOURCE IS OFF BY DEFAULT. It calls a paid model and may send the
 *    record's photograph off the host. A request that does not name it must NOT
 *    reach it — asserted by a dep that counts its calls, not by reading the
 *    answer (an answer with no vision proposals is exactly what a silently-run
 *    model that found nothing also produces).
 *
 * 2. PROVENANCE IS ON EVERY PROPOSAL. "Seven similar coins record this" and "a
 *    model looking at the photograph suggested this" are different claims. If a
 *    proposal could reach the panel without saying which one it is, the UI would
 *    be free to render them identically — so the wire is what enforces it.
 *
 * 3. IT DECLINES, IT DOES NOT EXPLODE. No profile, malformed profile, unreadable
 *    record, unusable seed, unknown source name. And the section grant is checked
 *    BEFORE the profile is loaded, so the codes cannot become an oracle.
 *
 * 4. IT SAYS WHERE AN ACCEPTED PROPOSAL MAY LAND. A multi-hop criterion's value
 *    belongs to a LINKED record; the client must never write it to the seed. The
 *    write grant is resolved server-side, not guessed by the panel.
 *
 * Every dep is injected: no DB, no model, no ontology descriptor (writing one is
 * forbidden by the engine's test rules).
 */

import { describe, expect, test } from 'bun:test';
import type {
	CategoricalElementProposal,
	ProposeInput,
	ProposeReport,
} from '../../src/ai/identify/propose.ts';
import type {
	VisionElementProposal,
	VisionProposeInput,
	VisionProposeReport,
} from '../../src/ai/identify/vision.ts';
import type { ApiRequestContext } from '../../src/core/api/dispatch.ts';
import {
	buildGetProposals,
	type IdentifyProposalsDeps,
	identifyApiActions,
	readProposalSources,
} from '../../src/core/api/handlers/dd_identify_api.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import { IdentifyAccessError } from '../../src/core/identify/match.ts';
import { ProfileError, parseProfile } from '../../src/core/identify/profile.ts';
import type { IdentificationProfile } from '../../src/core/identify/types.ts';
import type { Principal } from '../../src/core/security/permissions.ts';

const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };

const SEED = { sectionTipo: 'test3', sectionId: 101 };

const rqo = (options: Record<string, unknown>): Rqo => ({ options }) as unknown as Rqo;

const ctx = (principal: Principal): ApiRequestContext =>
	({
		requestId: 'test',
		clientIp: '127.0.0.1',
		session: null,
		csrfCandidate: null,
		principal,
	}) as ApiRequestContext;

const seedOptions = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
	section_tipo: SEED.sectionTipo,
	section_id: SEED.sectionId,
	...extra,
});

/**
 * A profile with one SINGLE-hop criterion (writable on the seed) and one
 * MULTI-hop one (whose value lives on the linked record).
 */
function profile(): IdentificationProfile {
	return parseProfile({
		id: 'test_objects',
		label: 'Test objects',
		sectionTipos: ['test3'],
		criteria: [
			{
				id: 'legend',
				label: 'Legend',
				path: [{ section_tipo: 'test3', component_tipo: 'test52' }],
				role: 'identifying',
				mode: 'normalized_text',
				weight: 1,
			},
			{
				id: 'type_mint',
				label: 'Type › Mint',
				path: [
					{ section_tipo: 'test3', component_tipo: 'test71' },
					{ section_tipo: 'test4', component_tipo: 'test80' },
				],
				role: 'identifying',
				mode: 'same_locator',
				weight: 2,
			},
		],
	});
}

function voteProposal(criterionId: string, label: string): CategoricalElementProposal {
	return {
		kind: 'categorical',
		criterionId,
		label,
		role: 'identifying',
		votes: 7,
		evidence: [
			{ sectionTipo: 'test3', sectionId: 55, value: 'ATHENA', weight: 0.9, thumbUrl: null },
			{ sectionTipo: 'test3', sectionId: 56, value: 'ATHENA', weight: 0.7, thumbUrl: null },
		],
		confidence: 0.82,
		display: 'ATHENA',
		value: { kind: 'text', values: ['ATHENA'] },
		distribution: [
			{ value: 'ATHENA', share: 0.82 },
			{ value: 'ROMA', share: 0.18 },
		],
	};
}

function voteReport(proposals: CategoricalElementProposal[]): ProposeReport {
	return {
		seed: SEED,
		profileId: 'test_objects',
		neighbourSource: 'structural',
		neighbourSourceReason: 'section declares no image index',
		neighboursConsidered: 7,
		proposals,
		skipped: [],
	};
}

function visionProposal(criterionId: string, label: string): VisionElementProposal {
	return {
		kind: 'categorical',
		source: 'vision_model',
		model: { id: 'vision-1', label: 'Vision One', egress: 'external' },
		criterionId,
		label,
		role: 'identifying',
		votes: 0,
		distribution: [],
		display: 'ATHENA',
		value: { kind: 'text', values: ['ATHENA'] },
		reason: 'a helmeted head faces right on the obverse',
		image: { componentTipo: 'test90', quality: 'thumb', thumbUrl: '/media/thumb.jpg' },
		evidence: [
			{
				sectionTipo: SEED.sectionTipo,
				sectionId: SEED.sectionId,
				value: 'a helmeted head faces right on the obverse',
				weight: 0.6,
				thumbUrl: '/media/thumb.jpg',
			},
		],
		confidence: 0.6,
	};
}

function visionReport(proposals: VisionElementProposal[]): VisionProposeReport {
	return {
		seed: SEED,
		profileId: 'test_objects',
		source: 'vision_model',
		model: { id: 'vision-1', label: 'Vision One', egress: 'external' },
		image: { componentTipo: 'test90', quality: 'thumb', thumbUrl: '/media/thumb.jpg' },
		proposals,
		skipped: [],
		declined: null,
		discarded: [],
	};
}

/** Counting seams: what actually ran is a fact about calls, not about the answer. */
interface Spy {
	deps: IdentifyProposalsDeps;
	voteCalls: ProposeInput[];
	visionCalls: VisionProposeInput[];
}

function spyDeps(overrides: Partial<IdentifyProposalsDeps> = {}): Spy {
	const voteCalls: ProposeInput[] = [];
	const visionCalls: VisionProposeInput[] = [];
	const deps: IdentifyProposalsDeps = {
		loadProfile: async () => profile(),
		canReadSection: async () => true,
		runNeighbourVote: async (input) => {
			voteCalls.push(input);
			return voteReport([voteProposal('legend', 'Legend')]);
		},
		runVision: async (input) => {
			visionCalls.push(input);
			return visionReport([visionProposal('legend', 'Legend')]);
		},
		componentGrant: async () => 2,
		componentModel: async () => 'component_input_text',
		readValues: async () => null,
		scopeRecords: async (records) => records,
		...overrides,
	};
	return { deps, voteCalls, visionCalls };
}

/* ─────────────────────────── the source switch ──────────────────────────── */

describe('get_proposals — the source switch', () => {
	test('an unnamed source means the neighbour vote ALONE', () => {
		expect(readProposalSources(undefined)).toEqual({ ok: true, sources: ['neighbour_vote'] });
		expect(readProposalSources('')).toEqual({ ok: true, sources: ['neighbour_vote'] });
	});

	test("'vision' and 'all' are the opt-ins, and aliases resolve", () => {
		expect(readProposalSources('vision')).toEqual({ ok: true, sources: ['vision_model'] });
		expect(readProposalSources('all')).toEqual({
			ok: true,
			sources: ['neighbour_vote', 'vision_model'],
		});
		expect(readProposalSources(['neighbours', 'vision_model'])).toEqual({
			ok: true,
			sources: ['neighbour_vote', 'vision_model'],
		});
	});

	test('an unknown source is REFUSED, never quietly defaulted', () => {
		// A client that misspells 'vision' and silently gets the vote would report a
		// corpus consensus as a model's opinion.
		const answer = readProposalSources('visoin');
		expect(answer.ok).toBe(false);
		if (!answer.ok) expect(answer.msg).toContain('visoin');
	});
});

describe('get_proposals — the vision source is OPT-IN', () => {
	test('a default request never reaches the vision model', async () => {
		const spy = spyDeps();
		const res = await buildGetProposals(spy.deps)(rqo(seedOptions()), ctx(SUPERUSER));

		// The fact, asserted at the seam: it was not called. An answer with no
		// vision proposals is not evidence — a model that ran and found nothing
		// produces exactly the same answer.
		expect(spy.visionCalls.length).toBe(0);
		expect(spy.voteCalls.length).toBe(1);

		const result = res.body.data as Record<string, unknown>;
		const sources = result.sources as Record<string, unknown>[];
		const vision = sources.find((source) => source.source === 'vision_model');
		expect(vision?.requested).toBe(false);
		expect(vision?.ran).toBe(false);
		// SAID OUT LOUD: "no vision proposals" must never read as "the model looked".
		expect((vision?.declined as { reason: string }).reason).toBe('not_requested');
	});

	test("source:'vision' runs it, and only it", async () => {
		const spy = spyDeps();
		const res = await buildGetProposals(spy.deps)(
			rqo(seedOptions({ source: 'vision' })),
			ctx(SUPERUSER),
		);

		expect(spy.visionCalls.length).toBe(1);
		expect(spy.voteCalls.length).toBe(0);

		const result = res.body.data as Record<string, unknown>;
		const proposals = result.proposals as Record<string, unknown>[];
		expect(proposals.every((proposal) => proposal.source === 'vision_model')).toBe(true);
	});

	test("source:'all' runs both, and the vote is listed first for one criterion", async () => {
		const spy = spyDeps();
		const res = await buildGetProposals(spy.deps)(
			rqo(seedOptions({ source: 'all' })),
			ctx(SUPERUSER),
		);

		expect(spy.voteCalls.length).toBe(1);
		expect(spy.visionCalls.length).toBe(1);

		const result = res.body.data as Record<string, unknown>;
		const proposals = result.proposals as Record<string, unknown>[];
		expect(proposals.map((proposal) => proposal.source)).toEqual([
			'neighbour_vote',
			'vision_model',
		]);
	});

	test('the model id a request names reaches the vision source', async () => {
		const spy = spyDeps();
		await buildGetProposals(spy.deps)(
			rqo(seedOptions({ source: 'vision', model_id: 'other-model' })),
			ctx(SUPERUSER),
		);
		expect(spy.visionCalls[0]?.modelId).toBe('other-model');
	});
});

/* ─────────────────────────── provenance ─────────────────────────────────── */

describe('get_proposals — provenance is on EVERY proposal', () => {
	test('a vote cites its neighbours; a vision proposal names its model and reason', async () => {
		const spy = spyDeps();
		const res = await buildGetProposals(spy.deps)(
			rqo(seedOptions({ source: 'all' })),
			ctx(SUPERUSER),
		);
		const result = res.body.data as Record<string, unknown>;
		const proposals = result.proposals as Record<string, unknown>[];

		expect(proposals.length).toBe(2);
		// EVERY proposal, without exception.
		for (const proposal of proposals) {
			expect(typeof proposal.source).toBe('string');
			expect(proposal.provenance).toBeDefined();
			expect((proposal.provenance as { kind: string }).kind).toBe(proposal.source as string);
		}

		const vote = proposals.find((proposal) => proposal.source === 'neighbour_vote');
		const voteProvenance = vote?.provenance as Record<string, unknown>;
		expect(voteProvenance.neighbour_source).toBe('structural');
		expect(voteProvenance.neighbours_considered).toBe(7);
		expect(voteProvenance.votes).toBe(7);
		// The citing neighbours themselves, so a curator can check the claim.
		expect((vote?.evidence as unknown[]).length).toBe(2);
		expect((vote?.evidence as Record<string, unknown>[])[0]).toMatchObject({
			section_tipo: 'test3',
			section_id: 55,
		});

		const vision = proposals.find((proposal) => proposal.source === 'vision_model');
		const visionProvenance = vision?.provenance as Record<string, unknown>;
		expect(visionProvenance.model).toMatchObject({ id: 'vision-1', egress: 'external' });
		// The model's STATED reason: the whole evidence a curator has for it.
		expect(visionProvenance.reason).toContain('helmeted head');
		expect(visionProvenance.image).toMatchObject({ component_tipo: 'test90' });
		// No record voted for it, and none is manufactured.
		expect(vision?.votes).toBe(0);
		expect(vision?.distribution).toEqual([]);
	});

	test('the two sources are never merged into one claim', async () => {
		const spy = spyDeps();
		const res = await buildGetProposals(spy.deps)(
			rqo(seedOptions({ source: 'all' })),
			ctx(SUPERUSER),
		);
		const proposals = (res.body.data as Record<string, unknown>).proposals as Record<
			string,
			unknown
		>[];
		// Same criterion, same value — TWO proposals, because they are two claims.
		expect(proposals.length).toBe(2);
		expect(proposals[0]?.criterion_id).toBe('legend');
		expect(proposals[1]?.criterion_id).toBe('legend');
		expect(proposals[0]?.source).not.toBe(proposals[1]?.source);
	});
});

/* ─────────────────────────── declines ───────────────────────────────────── */

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

describe('get_proposals — the clean declines', () => {
	test('an unusable seed', async () => {
		const spy = spyDeps();
		const decline = await declineOf(
			buildGetProposals(spy.deps)(rqo({ section_tipo: '' }), ctx(SUPERUSER)),
		);
		expect(decline.code).toBe('identify.missing_seed');
		expect(decline.spec.status).toBe(400);
	});

	test('a section the principal may not read — checked BEFORE the profile', async () => {
		let profileLoaded = false;
		const spy = spyDeps({
			canReadSection: async () => false,
			loadProfile: async () => {
				profileLoaded = true;
				return profile();
			},
		});
		const decline = await declineOf(
			buildGetProposals(spy.deps)(rqo(seedOptions()), ctx(SUPERUSER)),
		);
		expect(decline.code).toBe('perm.denied');
		// The decline codes must not be an oracle for which sections have a profile.
		expect(profileLoaded).toBe(false);
	});

	test('a section with no profile', async () => {
		const spy = spyDeps({ loadProfile: async () => null });
		const decline = await declineOf(
			buildGetProposals(spy.deps)(rqo(seedOptions()), ctx(SUPERUSER)),
		);
		expect(decline.code).toBe('identify.no_profile');
	});

	test('a malformed profile — declined, but the parser message travels', async () => {
		const spy = spyDeps({
			loadProfile: async () => {
				throw new ProfileError("criterion 'legend' hop 1 names component 'nope'");
			},
		});
		const decline = await declineOf(
			buildGetProposals(spy.deps)(rqo(seedOptions()), ctx(SUPERUSER)),
		);
		expect(decline.code).toBe('identify.invalid_profile');
		// PUBLIC disclosure — the parser sentence reaches the wire.
		expect(decline.publicMessage).toContain("hop 1 names component 'nope'");
	});

	test('an unknown source name', async () => {
		const spy = spyDeps();
		const decline = await declineOf(
			buildGetProposals(spy.deps)(rqo(seedOptions({ source: 'astrology' })), ctx(SUPERUSER)),
		);
		expect(decline.code).toBe('identify.invalid_source');
		expect(spy.voteCalls.length).toBe(0);
		expect(spy.visionCalls.length).toBe(0);
	});

	test('a denied SEED is the whole request’s answer, and leaks nothing', async () => {
		const spy = spyDeps({
			runNeighbourVote: async () => {
				throw new IdentifyAccessError(SEED);
			},
		});
		const decline = await declineOf(
			buildGetProposals(spy.deps)(rqo(seedOptions()), ctx(SUPERUSER)),
		);
		expect(decline.code).toBe('perm.denied');
		expect(decline.spec.status).toBe(403);
		// `perm.denied` is OPERATOR disclosure: nothing about the record can be
		// named on the wire, whatever the site passes.
		expect(decline.spec.message).toBe('Insufficient permissions');
	});

	test('a SOURCE being unavailable is not a request failure', async () => {
		// The vote still answers; the vision failure travels as that source's own
		// decline rather than deleting a valid half of the answer.
		const spy = spyDeps({
			runVision: async () => {
				throw new Error('provider refused the connection');
			},
		});
		const res = await buildGetProposals(spy.deps)(
			rqo(seedOptions({ source: 'all' })),
			ctx(SUPERUSER),
		);
		expect(res.body.ok).toBe(true);
		const result = res.body.data as Record<string, unknown>;
		expect((result.proposals as unknown[]).length).toBe(1);
		const vision = (result.sources as Record<string, unknown>[]).find(
			(source) => source.source === 'vision_model',
		);
		expect((vision?.declined as { reason: string }).reason).toBe('source_failed');
		// THE FAILURE TRAVELS; THE EXCEPTION TEXT DOES NOT (P2-8 / SEC-17).
		//
		// This asserted `toContain('refused the connection')` — the raw message of
		// whatever threw, echoed inside an `ok:true` payload where the disclosure
		// ladder does not reach. The same path carries Postgres error output and
		// filesystem messages with absolute paths, so the field cannot be a
		// passthrough for one caller's convenience.
		//
		// The test's INTENT is unchanged and still asserted above: the source's
		// failure is reported as its own decline instead of deleting a valid half
		// of the answer. What the curator now gets is that it failed and where to
		// look; the provider's sentence goes to the log.
		const detail = (vision?.declined as { detail: string }).detail;
		expect(detail).not.toContain('refused the connection');
		expect(detail).toContain('the server log records why');
	});

	test("a vision source that declined itself reports its OWN reason, not 'failed'", async () => {
		const spy = spyDeps({
			runVision: async () => ({
				...visionReport([]),
				model: null,
				image: null,
				declined: { reason: 'egress_forbidden', detail: 'policy is local_only' },
			}),
		});
		const res = await buildGetProposals(spy.deps)(
			rqo(seedOptions({ source: 'vision' })),
			ctx(SUPERUSER),
		);
		const vision = (
			(res.body.data as Record<string, unknown>).sources as Record<string, unknown>[]
		).find((source) => source.source === 'vision_model');
		expect(vision?.ran).toBe(false);
		expect((vision?.declined as { reason: string }).reason).toBe('egress_forbidden');
		expect((vision?.declined as { detail: string }).detail).toContain('local_only');
	});
});

/* ─────────────────────────── the principal ──────────────────────────────── */

describe('get_proposals — the principal is the gate', () => {
	test('the request principal is what both engines are gated with', async () => {
		const spy = spyDeps();
		await buildGetProposals(spy.deps)(rqo(seedOptions({ source: 'all' })), ctx(SUPERUSER));
		expect(spy.voteCalls[0]?.principal).toBe(SUPERUSER);
		expect(spy.visionCalls[0]?.principal).toBe(SUPERUSER);
		expect(spy.voteCalls[0]?.seed).toEqual(SEED);
	});

	test('a component the caller may not write is served READ-ONLY, not hidden', async () => {
		// Level 1 = may read the record, may not write this component. The proposal
		// is still evidence; it is simply not acceptable from here.
		const spy = spyDeps({ componentGrant: async () => 1 });
		const res = await buildGetProposals(spy.deps)(rqo(seedOptions()), ctx(SUPERUSER));
		const proposals = (res.body.data as Record<string, unknown>).proposals as Record<
			string,
			unknown
		>[];
		const target = proposals[0]?.target as Record<string, unknown>;
		expect(target.writable).toBe(false);
		expect(target.reason).toBe('forbidden_component');
	});
});

/* ─────────────────────────── the accept target ──────────────────────────── */

describe('get_proposals — where an accepted proposal would land', () => {
	test('a single-hop criterion is writable, and names its exact component', async () => {
		const spy = spyDeps();
		const res = await buildGetProposals(spy.deps)(rqo(seedOptions()), ctx(SUPERUSER));
		const proposals = (res.body.data as Record<string, unknown>).proposals as Record<
			string,
			unknown
		>[];
		const target = proposals[0]?.target as Record<string, unknown>;
		expect(target).toMatchObject({
			writable: true,
			reason: 'ok',
			section_tipo: 'test3',
			component_tipo: 'test52',
			component_model: 'component_input_text',
			multi_hop: false,
		});
	});

	test('a MULTI-HOP criterion is never writable here, and says where the value lives', async () => {
		const spy = spyDeps({
			runNeighbourVote: async () => voteReport([voteProposal('type_mint', 'Type › Mint')]),
			// the seed's first hop links to one Type record
			readValues: async () => ({
				kind: 'locators',
				locators: [{ section_tipo: 'test4', section_id: 77 }],
			}),
		});
		const res = await buildGetProposals(spy.deps)(rqo(seedOptions()), ctx(SUPERUSER));
		const proposals = (res.body.data as Record<string, unknown>).proposals as Record<
			string,
			unknown
		>[];
		const target = proposals[0]?.target as Record<string, unknown>;

		expect(target.writable).toBe(false);
		expect(target.reason).toBe('multi_hop');
		expect(target.multi_hop).toBe(true);
		// It never names a component on the SEED — the whole point: a client that
		// wrote `component_tipo` blindly would put the value in the wrong record.
		expect(target.component_tipo).toBeNull();
		expect(target.hops).toEqual([
			{ section_tipo: 'test3', component_tipo: 'test71' },
			{ section_tipo: 'test4', component_tipo: 'test80' },
		]);
		// …and it offers the linked record to open instead.
		expect(target.open_records).toEqual([{ section_tipo: 'test4', section_id: 77 }]);
		expect(target.detail).toContain('test4');
	});

	test('a multi-hop target the caller may not read offers nothing to open', async () => {
		const spy = spyDeps({
			runNeighbourVote: async () => voteReport([voteProposal('type_mint', 'Type › Mint')]),
			readValues: async () => ({
				kind: 'locators',
				locators: [{ section_tipo: 'test4', section_id: 77 }],
			}),
			// the record-scope gate drops it: a hidden record is never named
			scopeRecords: async () => [],
		});
		const res = await buildGetProposals(spy.deps)(rqo(seedOptions()), ctx(SUPERUSER));
		const target = (
			(res.body.data as Record<string, unknown>).proposals as Record<string, unknown>[]
		)[0]?.target as Record<string, unknown>;
		expect(target.open_records).toEqual([]);
		expect(target.detail).toContain('nothing to open');
	});

	test('a proposed DATE RANGE is read-only, and says why', async () => {
		const spy = spyDeps({
			runNeighbourVote: async () => ({
				...voteReport([]),
				proposals: [
					{
						kind: 'date_range',
						criterionId: 'legend',
						label: 'Legend',
						role: 'identifying',
						votes: 3,
						evidence: [],
						confidence: 0.5,
						display: { earliest: '1628', latest: '1650', central: '1639' },
						value: { kind: 'date', ranges: [{ from: 1, to: 2 }] },
					},
				],
			}),
		});
		const res = await buildGetProposals(spy.deps)(rqo(seedOptions()), ctx(SUPERUSER));
		const proposal = (
			(res.body.data as Record<string, unknown>).proposals as Record<string, unknown>[]
		)[0];
		// One string for one renderer, with the parts alongside.
		expect(proposal?.display).toBe('1628 – 1650');
		expect(proposal?.date_range).toMatchObject({ central: '1639' });
		const target = proposal?.target as Record<string, unknown>;
		expect(target.writable).toBe(false);
		expect(target.reason).toBe('unsupported_value_kind');
	});
});

/* ─────────────────────────── registration ───────────────────────────────── */

describe('get_proposals — registration', () => {
	test('the action is on the class table', () => {
		expect(Object.keys(identifyApiActions)).toContain('get_proposals');
	});
});
