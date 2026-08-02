/**
 * OBSERVER SUBSCRIPTION REGISTRY — the DEC-12 gates
 * (src/core/section/record/observer_subscriptions.ts).
 *
 * THE DISPATCH RULE UNDER TEST (owner ruling 2026-08-02): an edge dispatches
 * iff the OBSERVER declares it in `properties.observe` with a `server` block
 * — plus wildcard edges compiled from forward specs. The ontology decides;
 * NO code table gates it (the transitional hand-written activation list was
 * removed the day it landed — it converted an ontology decision into a code
 * decision).
 *
 * What is pinned here, and why each pin exists:
 *
 * 1. SINGLE-DECLARATION MODEL — a REVERSE-ONLY declaration with a server
 *    block DISPATCHES (the defect that started the investigation: rsc19 ->
 *    oh28 was authored reverse-only and never fired under forward-only
 *    discovery). Proven on a hermetic fixture AND against the live ontology
 *    (rsc19->oh28 resolved + a real end-to-end reverse-only recompute).
 * 2. 'all' COMPILATION — the wildcard is a MATCHING rule compiled into
 *    exactly the forward specs naming the observer (pass 1 only; pass 2
 *    `continue`s on 'all'); it must NEVER subscribe the observer to every
 *    save in the system, and a wildcard with zero forward-declarers is RED.
 *    This is the SOLE residual dependency on the forward `observers` array
 *    (besides reused-component host targeting): 'all' has no intrinsic
 *    scope, so the forward specs are the only thing bounding it.
 * 3. HOST-SECTION RESOLUTION — the 4-step rule: observe-entry scope →
 *    forward-spec section (reused components are NEVER silently retargeted
 *    to the observer's own section) → the observer's own section with
 *    VIRTUAL↔REAL equivalence (numisdata5 ≡ numisdata276 through
 *    relations[0].tipo) → loud refusal (RED + runtime refusal, never a
 *    guessed fallback).
 * 4. DEAD CONFIG IS RED — a forward spec whose observer has no matching
 *    observe entry dispatches nothing on either side; it stays RED until the
 *    ontology is fixed (no code pin can hide it).
 * 5. ACYCLICITY — the declared (non-scratch) observer graph has zero cycles
 *    (measured depth 2 today); a cycle is an authoring error.
 * 6. IMMUTABILITY + LIFECYCLE — deep-frozen index, runtime-hardened Maps,
 *    rebuild-never-patch, S1-14 in-tx memoization.
 *
 * The suite-DB ontology is a strict subset of the app ontology (the tch555/
 * tch557 nodes are absent here) — DB-backed gates are written as
 * subset/equality over WHAT IS DECLARED IN THIS ONTOLOGY.
 *
 * Scratch namespace: edges touching `test999…` tipos are the observer
 * behavioural suites' per-run seeds (deliberate cycles included) — excluded
 * from diagnostics by the carve-out in observer_subscriptions.ts, so
 * crashed-run residue cannot flip these gates red.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sql, withTransaction } from '../../src/core/db/postgres.ts';
import type { NodeWithProperties } from '../../src/core/ontology/resolver.ts';
import {
	type HostSectionContext,
	buildSubscriptionIndex,
	clearObserverSubscriptionRegistry,
	entryServerBlock,
	getSubscriptionRegistry,
	validateSubscriptionContract,
} from '../../src/core/section/record/observer_subscriptions.ts';
import { propagateToObservers } from '../../src/core/section/record/observers.ts';

// ---------------------------------------------------------------------------
// Fixture helpers (hermetic half — the laws over synthetic ontologies)
// ---------------------------------------------------------------------------

function node(tipo: string, properties: Record<string, unknown>): NodeWithProperties {
	return { tipo, properties };
}

const EXTERNAL_SERVER = {
	config: { use_observable_dato: true },
	perform: { function: 'set_dato_external' },
};

/** An SQO server.filter whose first path step names `sectionTipo` (the
 * oh28/numisdata1478 shape). */
function sqoServer(sectionTipo: string): Record<string, unknown> {
	return {
		filter: {
			$and: [{ q: null, path: [{ section_tipo: sectionTipo, component_tipo: 'p1' }] }],
		},
	};
}

function hostCtx(
	own: Record<string, string>,
	real: Record<string, string> = {},
): HostSectionContext {
	return {
		ownSectionByTipo: new Map(Object.entries(own)),
		realSectionByTipo: new Map(Object.entries(real)),
	};
}

describe('single-declaration model (the defect generator closing — gate a)', () => {
	test('a REVERSE-ONLY observe+server declaration is a dispatchable subscription, no table needed', () => {
		// obs1 subscribes itself to src1 — the observed node declares NOTHING.
		const index = buildSubscriptionIndex([
			node('obs1', { observe: [{ component_tipo: 'src1', server: { filter: false } }] }),
		]);
		expect(index.diagnostics.reverseOnly).toEqual(['src1->obs1']);
		const sub = index.byObserved.get('src1')?.[0];
		expect(sub?.declaration).toBe('reverse-only');
		expect(sub?.observerTipo).toBe('obs1');
		expect(sub?.entry?.server).toBeDefined(); // dispatchability IS server presence
		// The ontology's declaration is legal as-is: NO contract violation.
		expect(validateSubscriptionContract(index)).toEqual([]);
	});

	test('a reverse-only SQO edge resolves its host from the observer own section (rsc19->oh28 shape)', () => {
		const index = buildSubscriptionIndex(
			[node('obs2', { observe: [{ component_tipo: 'src2', server: sqoServer('sec1') }] })],
			hostCtx({ obs2: 'sec1' }),
		);
		expect(index.byObserved.get('src2')?.[0]?.hostSection).toBe('sec1');
		expect(index.diagnostics.hostUnresolved).toEqual([]);
		expect(validateSubscriptionContract(index)).toEqual([]);
	});

	test('client-only observe entries register no server edge', () => {
		const index = buildSubscriptionIndex([
			node('obs3', { observe: [{ component_tipo: 'src3', client: { event: 'x' } }] }),
		]);
		expect(index.edges).toHaveLength(0);
		expect(index.diagnostics.reverseOnly).toEqual([]);
	});
});

describe("'all' wildcard compilation (merge-blocker law — gate b)", () => {
	const nodes = [
		node('wcobs1', { observe: [{ component_tipo: 'all', server: EXTERNAL_SERVER }] }),
		node('fwd1', { observers: [{ component_tipo: 'wcobs1' }] }),
		node('fwd2', { observers: [{ component_tipo: 'wcobs1' }] }),
		// A node that observes/declares NOTHING towards wcobs1 — the naive
		// "subscribe to every save" reading would give wcobs1 an edge here too.
		node('bystander1', { observers: [{ component_tipo: 'elsewhere1' }] }),
	];

	test('the wildcard compiles to EXACTLY its forward-declarers, never the universe', () => {
		const index = buildSubscriptionIndex(nodes);
		expect(index.diagnostics.wildcardCompiled.get('wcobs1')).toEqual([
			'fwd1->wcobs1',
			'fwd2->wcobs1',
		]);
		const wcEdges = index.edges.filter((sub) => sub.observerTipo === 'wcobs1');
		expect(wcEdges.map((sub) => sub.observedTipo).sort()).toEqual(['fwd1', 'fwd2']);
		for (const sub of wcEdges) {
			expect(sub.declaration).toBe('mirrored');
			expect(sub.viaWildcard).toBe(true);
			expect(sub.entry?.server).toBeDefined();
		}
		// The bystander gained NO subscription to the wildcard observer — and
		// pass 2 minted NO reverse edge from the 'all' entry itself.
		expect(
			(index.byObserved.get('bystander1') ?? []).some((sub) => sub.observerTipo === 'wcobs1'),
		).toBe(false);
		expect(index.diagnostics.reverseOnly).toEqual([]);
	});

	test('a server wildcard nobody forward-declares admits ZERO edges and is RED', () => {
		const index = buildSubscriptionIndex([
			node('lonelywc1', { observe: [{ component_tipo: 'all', server: EXTERNAL_SERVER }] }),
		]);
		expect(index.edges).toHaveLength(0);
		expect(index.diagnostics.deadWildcards).toEqual(['lonelywc1']);
		const errors = validateSubscriptionContract(index);
		expect(errors.some((e) => e.includes("dead 'all' wildcard") && e.includes('lonelywc1'))).toBe(
			true,
		);
	});

	test('a wildcard SHADOWED by an earlier exact sibling (compiled to zero edges) is RED too', () => {
		// shadowwc1 declares [exact x, 'all'] and x forward-declares it: the
		// first-match law routes the edge through the EXACT entry, so the
		// wildcard compiles to nothing — dead config.
		const index = buildSubscriptionIndex([
			node('shadowsrc1', { observers: [{ component_tipo: 'shadowwc1' }] }),
			node('shadowwc1', {
				observe: [
					{ component_tipo: 'shadowsrc1', server: EXTERNAL_SERVER },
					{ component_tipo: 'all', server: EXTERNAL_SERVER },
				],
			}),
		]);
		// The exact entry mirrors the edge (dispatch unaffected)…
		expect(index.diagnostics.mirroredServer).toEqual(['shadowsrc1->shadowwc1']);
		expect(index.edges[0]?.viaWildcard).toBe(false);
		// …but the wildcard itself compiled to zero edges and must be flagged.
		expect(index.diagnostics.wildcardCompiled.get('shadowwc1')).toBeUndefined();
		expect(index.diagnostics.deadWildcards).toEqual(['shadowwc1']);
		const errors = validateSubscriptionContract(index);
		expect(errors.some((e) => e.includes("dead 'all' wildcard") && e.includes('shadowwc1'))).toBe(
			true,
		);
	});

	test('a reverse-only sibling entry does NOT count as a wildcard declarer (order-independent)', () => {
		// revwc1 observes an exact tipo (reverse-only) AND declares 'all'; no
		// forward spec names revwc1 at all — the wildcard is dead even though
		// the exact sibling dispatches.
		const index = buildSubscriptionIndex([
			node('revwc1', {
				observe: [
					{ component_tipo: 'revsrc1', server: EXTERNAL_SERVER },
					{ component_tipo: 'all', server: EXTERNAL_SERVER },
				],
			}),
		]);
		expect(index.diagnostics.deadWildcards).toEqual(['revwc1']);
		expect(index.diagnostics.reverseOnly).toEqual(['revsrc1->revwc1']);
	});
});

describe('pass-2 first-match law + malformed server declarations (review 2026-08-02)', () => {
	test('duplicate same-tipo observe entries: the FIRST in array order owns the tipo (client-only first → no dispatch)', () => {
		// The same law as pass 1 (the PHP dispatch first-match). Without it,
		// [client-only A, server A] would dispatch reverse-only yet STOP
		// dispatching the day a forward spec on A appears (pass-1 first-match
		// picks the client-only entry) — the same declaration pair behaving
		// differently depending on the legacy forward array. Zero live
		// instances of the mixed shape on either ontology (census 2026-08-02).
		const index = buildSubscriptionIndex([
			node('dupobs1', {
				observe: [
					{ component_tipo: 'dupsrc1', client: { event: 'x' } },
					{ component_tipo: 'dupsrc1', server: EXTERNAL_SERVER },
				],
			}),
		]);
		expect(index.edges).toHaveLength(0);
		expect(index.diagnostics.reverseOnly).toEqual([]);
	});

	test('duplicate same-tipo observe entries: server first → ONE subscription from the first entry (rsc36->rsc860 shape)', () => {
		const index = buildSubscriptionIndex([
			node('dupobs2', {
				observe: [
					{ component_tipo: 'dupsrc2', server: { filter: false } },
					{ component_tipo: 'dupsrc2', server: EXTERNAL_SERVER },
				],
			}),
		]);
		expect(index.diagnostics.reverseOnly).toEqual(['dupsrc2->dupobs2']);
		const subs = index.byObserved.get('dupsrc2') ?? [];
		expect(subs).toHaveLength(1);
		// The FIRST entry's server block dispatches (filter:false), never the
		// later duplicate's.
		expect(subs[0]?.entry?.server?.filter).toBe(false);
	});

	test('a non-object server value (server:null) is MALFORMED — not dispatchable, RED', () => {
		const index = buildSubscriptionIndex([
			node('malobs1', { observe: [{ component_tipo: 'malsrc1', server: null }] }),
		]);
		expect(index.edges).toHaveLength(0);
		expect(index.diagnostics.reverseOnly).toEqual([]);
		expect(index.diagnostics.malformedServerEntries).toEqual([
			{ observerTipo: 'malobs1', componentTipo: 'malsrc1' },
		]);
		const errors = validateSubscriptionContract(index);
		expect(errors.some((e) => e.includes('malformed declaration') && e.includes("'malobs1'"))).toBe(
			true,
		);
	});

	test('a MIRRORED edge with a malformed server is excluded from dispatchability too (entryServerBlock is the one predicate)', () => {
		const index = buildSubscriptionIndex([
			node('malsrc2', { observers: [{ component_tipo: 'malobs2' }] }),
			node('malobs2', { observe: [{ component_tipo: 'malsrc2', server: 'yes' }] }),
		]);
		// The declaration pair exists (mirrored, not dead-forward)…
		expect(index.diagnostics.forwardOnly).toEqual([]);
		// …but it is NOT a dispatchable server edge, and the malformed value is RED.
		expect(index.diagnostics.mirroredServer).toEqual([]);
		expect(index.diagnostics.malformedServerEntries).toEqual([
			{ observerTipo: 'malobs2', componentTipo: 'malsrc2' },
		]);
		expect(entryServerBlock(index.byObserved.get('malsrc2')?.[0]?.entry)).toBeUndefined();
	});
});

describe('host-section resolution (the 4-step rule — gates c/d)', () => {
	test("step 1: the observe entry's own section_tipo wins over everything", () => {
		const index = buildSubscriptionIndex(
			[
				node('hsrc1', { observers: [{ component_tipo: 'hobs1', section_tipo: 'spec1' }] }),
				node('hobs1', {
					observe: [
						{ component_tipo: 'hsrc1', section_tipo: 'entryscope1', server: sqoServer('own1') },
					],
				}),
			],
			hostCtx({ hobs1: 'own1' }),
		);
		expect(index.byObserved.get('hsrc1')?.[0]?.hostSection).toBe('entryscope1');
	});

	test('step 2: a REUSED component keeps each forward spec host — never retargeted to its own section (hierarchy93 shape)', () => {
		// One observer declared ONCE, forward-declared by one observed component
		// three times with different section scopes (rsc387 -> hierarchy93 with
		// on1/ts1/dc1 while hierarchy93's own section is hierarchy20).
		const index = buildSubscriptionIndex(
			[
				node('rsrc1', {
					observers: [
						{ component_tipo: 'robs1', section_tipo: 'secA' },
						{ component_tipo: 'robs1', section_tipo: 'secB' },
						{ component_tipo: 'robs1', section_tipo: 'secC' },
					],
				}),
				node('robs1', { observe: [{ component_tipo: 'rsrc1', server: EXTERNAL_SERVER }] }),
			],
			hostCtx({ robs1: 'ownHier1' }),
		);
		const hosts = (index.byObserved.get('rsrc1') ?? []).map((sub) => sub.hostSection);
		expect(hosts).toEqual(['secA', 'secB', 'secC']);
		expect(hosts).not.toContain('ownHier1');
	});

	test("step 2→3: the literal 'self' spec section falls through to the observer's own section", () => {
		const index = buildSubscriptionIndex(
			[
				node('ssrc1', { observers: [{ component_tipo: 'sobs1', section_tipo: 'self' }] }),
				node('sobs1', { observe: [{ component_tipo: 'ssrc1', server: EXTERNAL_SERVER }] }),
			],
			hostCtx({ sobs1: 'ownsec1' }),
		);
		expect(index.byObserved.get('ssrc1')?.[0]?.hostSection).toBe('ownsec1');
	});

	test('step 3 VIRTUAL↔REAL: a filter path naming the VIRTUAL face of the observer own REAL section resolves to the path face (numisdata5/numisdata276 shape)', () => {
		// vobs1's own ontology section is real276; its SQO filter path names
		// virt5, whose relations[0].tipo is real276 — same section, and the
		// PATH's face is the one the stored records carry, so it wins.
		const index = buildSubscriptionIndex(
			[node('vobs1', { observe: [{ component_tipo: 'vsrc1', server: sqoServer('virt5') }] })],
			hostCtx({ vobs1: 'real276' }, { virt5: 'real276', real276: 'real276' }),
		);
		expect(index.byObserved.get('vsrc1')?.[0]?.hostSection).toBe('virt5');
		expect(index.diagnostics.hostUnresolved).toEqual([]);
		expect(validateSubscriptionContract(index)).toEqual([]);
	});

	test('step 3 without a filter path: the observer own section is the host', () => {
		const index = buildSubscriptionIndex(
			[node('oobs1', { observe: [{ component_tipo: 'osrc1', server: EXTERNAL_SERVER }] })],
			hostCtx({ oobs1: 'ownsec2' }),
		);
		expect(index.byObserved.get('osrc1')?.[0]?.hostSection).toBe('ownsec2');
	});

	test('step 4: a NON-equivalent filter-path section resolves to NOTHING and is RED (never a silent retarget)', () => {
		const index = buildSubscriptionIndex(
			[node('xobs1', { observe: [{ component_tipo: 'xsrc1', server: sqoServer('othersec1') }] })],
			hostCtx({ xobs1: 'ownsec3' }, { othersec1: 'otherreal1', ownsec3: 'ownsec3' }),
		);
		expect(index.byObserved.get('xsrc1')?.[0]?.hostSection).toBeUndefined();
		expect(index.diagnostics.hostUnresolved).toEqual(['xsrc1->xobs1']);
		const errors = validateSubscriptionContract(index);
		expect(
			errors.some((e) => e.includes('unresolved host section') && e.includes("'xsrc1->xobs1'")),
		).toBe(true);
	});

	test('step 4: an SQO edge with no section facts at all is RED', () => {
		// No entry scope, no forward spec, no own-section knowledge, no path…
		const bare = buildSubscriptionIndex([
			node('bobs1', { observe: [{ component_tipo: 'bsrc1', server: { filter: { $and: [] } } }] }),
		]);
		expect(bare.diagnostics.hostUnresolved).toEqual(['bsrc1->bobs1']);
		// …while a non-SQO shape (filter:false / set_dato_external) needs no
		// host and stays clean.
		const nonSqo = buildSubscriptionIndex([
			node('bobs2', { observe: [{ component_tipo: 'bsrc2', server: { filter: false } }] }),
		]);
		expect(nonSqo.diagnostics.hostUnresolved).toEqual([]);
	});
});

describe('dead config is RED (no code pin can hide it)', () => {
	test('a forward spec with no observe entry at all is RED naming the edge', () => {
		const index = buildSubscriptionIndex([
			node('src2', { observers: [{ component_tipo: 'obs2' }] }),
			node('obs2', { observe: [{ component_tipo: 'unrelated1', server: { filter: false } }] }),
		]);
		expect(index.diagnostics.forwardOnly).toEqual(['src2->obs2']);
		const errors = validateSubscriptionContract(index);
		expect(errors.some((e) => e.includes("'src2->obs2'") && e.includes('dead config'))).toBe(true);
		// The observer's own reverse-only entry towards a THIRD tipo dispatches
		// fine — it is not the dead half.
		expect(index.diagnostics.reverseOnly).toEqual(['unrelated1->obs2']);
	});
});

describe('acyclicity of the declared graph', () => {
	test('a declared cycle is detected and RED', () => {
		const index = buildSubscriptionIndex([
			node('x1', {
				observers: [{ component_tipo: 'y1' }],
				observe: [{ component_tipo: 'y1', server: EXTERNAL_SERVER }],
			}),
			node('y1', {
				observers: [{ component_tipo: 'x1' }],
				observe: [{ component_tipo: 'x1', server: EXTERNAL_SERVER }],
			}),
		]);
		expect(index.diagnostics.cycles.length).toBeGreaterThan(0);
		const errors = validateSubscriptionContract(index);
		expect(errors.some((e) => e.includes('CYCLE'))).toBe(true);
	});
});

describe('index immutability', () => {
	test('the built index is deep-frozen (rebuild on invalidation, never patch)', () => {
		const index = buildSubscriptionIndex([
			node('fsrc1', { observers: [{ component_tipo: 'fobs1' }] }),
			node('fobs1', { observe: [{ component_tipo: 'fsrc1', server: { filter: false } }] }),
		]);
		expect(Object.isFrozen(index)).toBe(true);
		expect(Object.isFrozen(index.edges)).toBe(true);
		expect(Object.isFrozen(index.edges[0])).toBe(true);
		expect(Object.isFrozen(index.edges[0]?.entry)).toBe(true);
		expect(Object.isFrozen(index.diagnostics)).toBe(true);
		// Maps are RUNTIME-hardened, not just ReadonlyMap-typed: Object.freeze
		// does not seal Map internals, so the mutators are shadowed to throw
		// (a consumer casting past the types could otherwise patch the
		// process-shared index in place).
		const patchable = index.byObserved as unknown as Map<string, unknown>;
		expect(() => patchable.set('x', [])).toThrow(/immutable/);
		expect(() => patchable.delete('fsrc1')).toThrow(/immutable/);
		expect(() => patchable.clear()).toThrow(/immutable/);
		const wc = index.diagnostics.wildcardCompiled as unknown as Map<string, unknown>;
		expect(() => wc.set('x', [])).toThrow(/immutable/);
		// Reads keep their prototype behaviour.
		expect(index.byObserved.get('fsrc1')?.length).toBe(1);
	});
});

describe('wiring tripwires (DEC-12: header claims are gated, not prose)', () => {
	const read = (relativePath: string): string =>
		readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

	test('server.ts warms the registry at boot and registers the observers_registry gauge', () => {
		// The boot probe is the PRODUCTION coverage locus ("read once at bun
		// start"): edges authored only in a production ontology surface there,
		// never in CI. Deleting the block or renaming the gauge must turn RED.
		const src = read('../../src/server.ts');
		expect(src).toContain("registerOpsGauge('observers_registry'");
		expect(src).toContain('await getSubscriptionRegistry(); // warm');
	});

	test('the seed-race build token is planted BEFORE the ontology reads and gates the cache seed', () => {
		// The header's seed-race law (a dd_ontology COMMIT between the builder's
		// reads and its cache write must prevent seeding) is carried by three
		// source facts, in this order: token plant → ontology reads → seed
		// guarded by token survival. A mid-build interposition cannot be staged
		// without cross-file mock leakage, so the ORDER is the mechanical gate.
		const src = read('../../src/core/section/record/observer_subscriptions.ts');
		const plant = src.indexOf('buildTokenCache.set(BUILD_TOKEN_KEY, buildToken)');
		const firstOntologyRead = src.indexOf("await getNodesWithProperty('observers')");
		const survivalGuard = src.indexOf('buildTokenCache.get(BUILD_TOKEN_KEY) === buildToken');
		const cacheSeed = src.indexOf('registryCache.set(REGISTRY_KEY, index)');
		expect(plant).toBeGreaterThan(-1);
		expect(firstOntologyRead).toBeGreaterThan(plant);
		expect(survivalGuard).toBeGreaterThan(firstOntologyRead);
		expect(cacheSeed).toBeGreaterThan(survivalGuard);
	});
});

// ---------------------------------------------------------------------------
// DB-backed half — the LIVE ontology of the suite DB.
// ---------------------------------------------------------------------------

/** The dead-forward census (measured 2026-08-02; rsc1531 exists only in the
 * suite-DB ontology snapshot, the rsc19 four in both DBs). A NEW dead forward
 * spec — one not in this census — fails the live-contract gate the day it is
 * authored. Fixing these means an ONTOLOGY edit (add the observe half or
 * delete the stale spec), never a code pin. */
const KNOWN_DEAD_FORWARD = new Set([
	'rsc1139->rsc19',
	'rsc1140->rsc19',
	'rsc1401->rsc19',
	'rsc1403->rsc19',
	'rsc1531->rsc1214',
]);

/** The reverse-only server declarations measured on the live ontology
 * 2026-08-02 — under the ontology-decided rule ALL of these dispatch. */
const KNOWN_REVERSE_ONLY = [
	'numisdata1373->numisdata1478',
	'numisdata1373->numisdata1479',
	'numisdata282->numisdata321',
	'oh93->oh28',
	'rsc19->oh28',
	'rsc30->rsc1369',
	'rsc36->rsc1368',
	'rsc36->rsc860',
	'rsc860->oh87',
];

/** Scratch id for the end-to-end reverse-only recompute (oh1 record that does
 * not exist — the same-record recompute writes ONE TM row, swept below). */
const SCRATCH_OH1_ID = 999_999_955;

afterAll(async () => {
	await sql.unsafe(
		`DELETE FROM matrix_time_machine WHERE section_tipo = 'oh1' AND section_id = $1 AND tipo = 'oh28'`,
		[SCRATCH_OH1_ID],
	);
});

describe('live-ontology gates (suite DB)', () => {
	test('the contract holds: the ONLY violations are the known dead-forward specs (ontology bugs, loud until fixed)', async () => {
		const registry = await getSubscriptionRegistry();
		const errors = validateSubscriptionContract(registry);
		// Every violation is a dead-config one naming a censused edge…
		for (const error of errors) {
			expect(error).toContain('dead config');
			expect([...KNOWN_DEAD_FORWARD].some((key) => error.includes(`'${key}'`))).toBe(true);
		}
		// …and the census covers exactly what this ontology declares dead.
		const declaredDead = registry.diagnostics.forwardOnly;
		expect(declaredDead.every((key) => KNOWN_DEAD_FORWARD.has(key))).toBe(true);
		expect(errors.length).toBe(declaredDead.length);
		// Nothing else is wrong on the live ontology.
		expect(registry.diagnostics.deadWildcards).toEqual([]);
		expect(registry.diagnostics.hostUnresolved).toEqual([]);
		expect(registry.diagnostics.cycles).toEqual([]);
	});

	test('SINGLE-DECLARATION (gate a, live): rsc19->oh28 — the originally reported bug edge — is dispatchable with host oh1', async () => {
		const registry = await getSubscriptionRegistry();
		const sub = (registry.byObserved.get('rsc19') ?? []).find(
			(candidate) => candidate.observerTipo === 'oh28',
		);
		expect(sub).toBeDefined();
		expect(sub?.declaration).toBe('reverse-only');
		expect(sub?.entry?.server).toBeDefined(); // dispatches — no table gates it
		// 4-step resolution: no entry scope, no forward spec → the observer's
		// own section (oh28 → oh1), agreeing with the filter path's oh1.
		expect(sub?.hostSection).toBe('oh1');
	});

	test('the reverse-only census: every measured one-sided declaration is registered (and dispatches)', async () => {
		const registry = await getSubscriptionRegistry();
		expect([...registry.diagnostics.reverseOnly].sort()).toEqual(KNOWN_REVERSE_ONLY);
		// And the virtual↔real pair resolved: numisdata1478/79's own section is
		// numisdata276 (real) while the filter path names numisdata5 (virtual)
		// — equivalent, the path face wins (that is where the records live).
		for (const observer of ['numisdata1478', 'numisdata1479']) {
			const sub = (registry.byObserved.get('numisdata1373') ?? []).find(
				(candidate) => candidate.observerTipo === observer,
			);
			expect(sub?.hostSection).toBe('numisdata5');
		}
	});

	test('REUSED COMPONENT (gate d, live): rsc387->hierarchy93 keeps each forward-spec host, never its own section', async () => {
		const registry = await getSubscriptionRegistry();
		const hosts = (registry.byObserved.get('rsc387') ?? [])
			.filter((sub) => sub.observerTipo === 'hierarchy93')
			.map((sub) => sub.hostSection);
		expect([...hosts].sort()).toEqual(['dc1', 'on1', 'ts1']);
		expect(hosts).not.toContain('hierarchy20'); // hierarchy93's own section
	});

	test("'all' wildcards compile to their forward-declarers only (gate b, live)", async () => {
		const registry = await getSubscriptionRegistry();
		const expected: Record<string, string[]> = {
			numisdata250: ['numisdata282->numisdata250'],
			numisdata257: ['numisdata1451->numisdata257'],
			tch557: ['tch555->tch557'], // absent from the suite DB — asserted when present
		};
		const mirrored = new Set(registry.diagnostics.mirroredServer);
		for (const [observer, compiled] of registry.diagnostics.wildcardCompiled) {
			// Every compiled wildcard edge is a MIRRORED edge (forward-declared) —
			// the wildcard never invents subscriptions.
			for (const key of compiled) expect(mirrored.has(key)).toBe(true);
			// And the compiled set matches the pinned census exactly.
			expect(expected[observer]).toBeDefined();
			expect([...compiled].sort()).toEqual([...(expected[observer] ?? [])].sort());
		}
		// No NEW wildcard observer appeared without this gate learning about it.
		for (const observer of Object.keys(expected)) {
			if (registry.diagnostics.wildcardCompiled.has(observer)) continue;
			// tch557 is allowed to be absent here (suite DB); the numisdata pair is not.
			expect(observer).toBe('tch557');
		}
	});

	test('lifecycle: in-tx builds memoize per TRANSACTION and never seed the shared cache (S1-14 + import fix)', async () => {
		clearObserverSubscriptionRegistry();
		let first: unknown;
		let second: unknown;
		await withTransaction(async () => {
			// Read-only: the transaction only READS dd_ontology through the
			// registry build; nothing is written.
			first = await getSubscriptionRegistry();
			second = await getSubscriptionRegistry();
		});
		// One build per transaction span (the cold-cache import pathology fix:
		// pre-remediation every in-tx call rebuilt the whole index).
		expect(second).toBe(first);
		// The in-tx build never seeded the process-wide cache (S1-14)…
		const outside = await getSubscriptionRegistry();
		expect(outside).not.toBe(first);
		// …and the out-of-tx build-of-record did.
		expect(await getSubscriptionRegistry()).toBe(outside);
	});

	test('runtime (gate a, end-to-end): a reverse-only edge DISPATCHES — oh93 save recomputes the oh28 state widget', async () => {
		// oh93 declares NO forward observers; oh28 subscribes reverse-only with
		// server:{filter:false} (component_state = component_info alias → the
		// same-record recompute). Under forward-only discovery this edge was
		// invisible; under the ontology-decided rule the save response carries
		// the recomputed widget item and ONE TM row is written (scratch id,
		// swept in afterAll).
		const result = await propagateToObservers('oh93', 'oh1', SCRATCH_OH1_ID, [], -1);
		expect(result).toHaveLength(1);
		const item = result[0] as { tipo?: string; section_tipo?: string; section_id?: string };
		expect(item.tipo).toBe('oh28');
		expect(item.section_tipo).toBe('oh1');
		expect(item.section_id).toBe(String(SCRATCH_OH1_ID));
		const tmRows = (await sql.unsafe(
			`SELECT 1 FROM matrix_time_machine WHERE section_tipo = 'oh1' AND section_id = $1 AND tipo = 'oh28'`,
			[SCRATCH_OH1_ID],
		)) as unknown[];
		expect(tmRows.length).toBeGreaterThan(0);
	});

	test('runtime: the hi-family reverse-only filter:false edges dispatch into the terminal no-op (nothing written)', async () => {
		// rsc36 -> rsc860 / rsc1368 (autocomplete_hi, filter:false): dispatch
		// reaches the entries (no skip filter exists any more) and lands on the
		// oracle-pinned terminal no-op — the response stays empty and no error
		// is thrown.
		const result = await propagateToObservers('rsc36', 'rsc1', 999_999_991, [], -1);
		expect(result).toEqual([]);
	});
});
