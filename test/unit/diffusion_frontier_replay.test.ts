/**
 * DIFF-1 — THE RUN LEDGER REPLAYS TO THE SAME RUN STATE.
 *
 * A publication run's resumable state is not its keyset cursor alone: the
 * relation FRONTIER (records queued by the primaries' hops, drained after them),
 * the set of records already USED and the list of ARTIFACTS the run published
 * all have to survive the runner's death. (No queue-time PUBLISHABLE decision is
 * part of it: the drain asks the live gate — gated by the in-run and resume
 * flips in diffusion_frontier_scope_native / diffusion_resume_ledger_native.)
 * The run ledger (a job-scoped table, one event per state change, appended in the
 * same transaction as the batch's checkpoint) is that state; these gates prove
 * the two halves of reading it back:
 *
 *   (a) the pure reducer `replayFrontier` rebuilds frontier / used /
 *       draining from an event stream — FIFO key order with re-queued keys at
 *       the TAIL, a half-drained key's remainder, and number-vs-string ids kept
 *       distinct (the frontier Set is sensitive to the difference; the ledger
 *       stores ids as jsonb);
 *   (b) THE OUTCOME: for EVERY cut k of a real resolution (the zzdif hop
 *       element, batches of one record, one portal hop), the first k batches
 *       followed by a resolution resumed from the ledger of those k batches
 *       deep-equals the uninterrupted run — sections, levels, records, rows.
 *       Before the ledger a resume had only the cursor: every cut inside the
 *       primaries lost the frontier its earlier primaries had queued;
 *  (b2) the resolver EMITS the `open` the order-independent fold relies on:
 *       every drained record is used under an `open` of its own key (the
 *       cut-by-cut outcome cannot see a missing `open` under a BFS drain);
 *   (c) the artifact MANIFEST the close unit reads from the ledger (SQL) equals
 *       a JS Set replay of the same `wrote`/`removed` events, over seeded
 *       sequences (add-add, add-remove-add, remove-only, and a fuzz);
 *   (d) PAGING: every ledger reader (the frontier keyset `readRunLedger`, the
 *       manifest and removed-ids cursors) returns the SAME stream across page
 *       boundaries — driven at tiny page sizes (a page break inside a batch,
 *       on a batch edge, every row its own page) AND at the production default
 *       with a ledger larger than one page (one batch alone larger than it, so
 *       the ord keyset is exercised inside a batch). A real heritage run crosses
 *       the default page at a few thousand records; nowhere else would a
 *       broken cursor (not advanced, `>=`, a return after page 1) be seen.
 *
 * (a) and (c) exercise NEW units (the reducer, the ledger store): before the fix
 * they fail because the units do not exist — latent by construction, with no
 * producer to reproduce. (b) is the red-first outcome proof, as are
 * diffusion_resume_ledger_native's crash / kill legs at the runner level.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { withTransaction } from '../../src/core/db/postgres.ts';
import { deleteJobsForTests } from '../../src/diffusion/jobs/queue.ts';
import { compileElementPlan } from '../../src/diffusion/plan/compile.ts';
import type { PublicationPlan } from '../../src/diffusion/plan/types.ts';
import type { VirtualDiffusionTree } from '../../src/diffusion/plan/virtual_tree.ts';
import { buildVirtualDiffusionTree } from '../../src/diffusion/plan/virtual_tree.ts';
import type { ResolvedBatch, ResolveOptions } from '../../src/diffusion/resolve/resolver.ts';
import { resolvePublication } from '../../src/diffusion/resolve/resolver.ts';
import { enqueueClaimSeeded } from '../helpers/diffusion_job_harness.ts';
import { ensureDiffusionScratchTables } from '../helpers/diffusion_scratch_tables.ts';
import {
	dropZzdifDomain,
	ensureZzdifDomain,
	ZZDIF_DOMAIN_NAME,
	ZZDIF_HOP_FILE_ELEMENT,
	ZZDIF_LINKED_SECTION,
	ZZDIF_SECTION,
} from '../helpers/zzdif_diffusion_domain.ts';

const FRONTIER_LEDGER = '../../src/diffusion/resolve/frontier_ledger.ts';
const RUN_LEDGER = '../../src/diffusion/jobs/run_ledger.ts';
const RUN_STARTED_AT = 1_800_000_000;

// ---------------------------------------------------------------- shapes (design §2.2)

interface ReplayEvent {
	kind: 'queue' | 'open' | 'used';
	level?: number;
	sectionTipo: string;
	sectionId?: number | string;
}
interface ResumeState {
	frontier: Map<string, Set<number | string>>;
	used: Set<string>;
	draining: { level: number; sectionTipo: string; ids: (number | string)[] } | null;
}
type ReplayFrontier = (events: AsyncIterable<ReplayEvent>) => Promise<ResumeState>;

async function* stream<T>(items: readonly T[]): AsyncIterable<T> {
	for (const item of items) yield item;
}

async function loadReplay(): Promise<ReplayFrontier> {
	const module = (await import(FRONTIER_LEDGER)) as Record<string, unknown>;
	expect(typeof module.replayFrontier, 'frontier_ledger.ts exports no replayFrontier').toBe(
		'function',
	);
	return module.replayFrontier as ReplayFrontier;
}

const queue = (level: number, sectionTipo: string, sectionId: number | string) =>
	({ kind: 'queue', level, sectionTipo, sectionId }) as const;
const open = (level: number, sectionTipo: string) =>
	({ kind: 'open', level, sectionTipo }) as const;
const used = (sectionTipo: string, sectionId: number | string) =>
	({ kind: 'used', sectionTipo, sectionId }) as const;

// ---------------------------------------------------------------- (a)

describe('(a) replayFrontier — the pure reducer', () => {
	test('FIFO key order; a key re-queued after it was opened goes to the TAIL', async () => {
		const replay = await loadReplay();
		const state = await replay(
			stream<ReplayEvent>([
				queue(0, 'k1', 'a'),
				queue(0, 'k2', 'b'),
				open(0, 'k1'),
				queue(0, 'k1', 'c'),
			]),
		);
		expect([...state.frontier.entries()].map(([key, ids]) => [key, [...ids]])).toEqual([
			['0:k2', ['b']],
			['0:k1', ['c']],
		]);
	});

	test('an opened key is DRAINING: its ids come back, and the used ones are known', async () => {
		const replay = await loadReplay();
		const state = await replay(
			stream<ReplayEvent>([queue(0, 'k1', 1), queue(0, 'k1', 2), open(0, 'k1'), used('k1', 1)]),
		);
		expect(state.frontier.size).toBe(0);
		expect(state.draining?.level).toBe(0);
		expect(state.draining?.sectionTipo).toBe('k1');
		const remainder = (state.draining?.ids ?? []).filter((id) => !state.used.has(`k1:${id}`));
		expect(remainder).toEqual([2]);
	});

	test('number and string ids stay DISTINCT frontier members (the Set is type-sensitive)', async () => {
		const replay = await loadReplay();
		const state = await replay(
			stream<ReplayEvent>([queue(0, 'k1', 940101), queue(0, 'k1', '940101')]),
		);
		expect([...(state.frontier.get('0:k1') ?? [])]).toEqual([940101, '940101']);
	});
});

// ---------------------------------------------------------------- (b)

let tree: VirtualDiffusionTree;
let plan: PublicationPlan;
const createdJobIds: string[] = [];

beforeAll(async () => {
	await ensureDiffusionScratchTables();
	await ensureZzdifDomain();
	const built = await buildVirtualDiffusionTree(ZZDIF_DOMAIN_NAME);
	if (built === null) throw new Error(`no dd1190 domain named '${ZZDIF_DOMAIN_NAME}'`);
	tree = built;
	plan = await compileElementPlan(ZZDIF_HOP_FILE_ELEMENT, { tree });
}, 120_000);

afterAll(async () => {
	await deleteJobsForTests(createdJobIds);
	const residue = await dropZzdifDomain();
	if (residue !== 0) throw new Error(`zzdif situation residue after drop: ${residue} rows`);
});

/** The comparable projection of a batch: what the writers consume. */
function comparable(batch: ResolvedBatch) {
	return {
		section: batch.section.sectionTipo,
		level: batch.level,
		records: batch.records.map((record) => [record.sectionId, record.status]),
		rows: batch.rows,
		unpublishIds: batch.unpublishIds,
	};
}

async function resolveAll(options: Partial<ResolveOptions>): Promise<ResolvedBatch[]> {
	const batches: ResolvedBatch[] = [];
	for await (const batch of resolvePublication(plan, {
		sectionTipo: ZZDIF_SECTION,
		runStartedAt: RUN_STARTED_AT,
		tree,
		batchSize: 1,
		maxLevels: 1,
		...options,
	})) {
		batches.push(batch);
	}
	return batches;
}

describe('(b) resume from the ledger reproduces the uninterrupted run at EVERY cut', () => {
	test('first k batches + the resumed remainder == the reference, for every k', async () => {
		const reference = await resolveAll({});
		// Non-degenerate: primaries AND a frontier drained at level 0.
		expect(reference.some((batch) => batch.level === 0)).toBe(true);
		expect(reference.length).toBeGreaterThan(2);

		// The replay unit, when present; without it a resume has only the cursor
		// (the pre-ledger state) and the comparison below measures exactly that.
		const replay = (await import(FRONTIER_LEDGER).catch(() => null)) as {
			replayFrontier?: ReplayFrontier;
		} | null;
		for (let cut = 1; cut < reference.length; cut++) {
			const done = reference.slice(0, cut);
			const events = done.flatMap(
				(batch) => (batch as unknown as { ledger?: ReplayEvent[] }).ledger ?? [],
			);
			const resume =
				replay?.replayFrontier !== undefined
					? await replay.replayFrontier(stream(events))
					: undefined;
			const resumed = await resolveAll({
				afterSectionId: (done.at(-1) as ResolvedBatch).cursor,
				...(resume !== undefined ? { resume } : {}),
			} as Partial<ResolveOptions>);
			expect(
				[...done, ...resumed].map(comparable),
				`cut after batch ${cut}: the resumed run diverged from the uninterrupted one`,
			).toEqual(reference.map(comparable));
		}
	}, 120_000);
});

/**
 * The fold replays the Map/Set operations, so it is drain-ORDER independent —
 * but only if the resolver TELLS it which key it opened. Under today's
 * level-ordered BFS a missing `open` is invisible to the cut-by-cut outcome
 * above (the replayed remainder happens to coincide); under any other drain
 * order the resumed run would lose the draining remainder. So the emission is
 * gated itself: every record a frontier drain uses is used while the LAST
 * `open` in the stream names the key it is drained from.
 */
describe('(b2) the resolver announces every drained key (`open`) before it uses its records', () => {
	test('each drained record is used under an `open` of its own key', async () => {
		const reference = await resolveAll({});
		const drained = reference.filter((batch) => batch.level < 1);
		expect(drained.length, 'no frontier drain in the reference (degenerate)').toBeGreaterThan(0);
		let lastOpen: string | null = null;
		let checked = 0;
		for (const batch of reference) {
			const isDrain = batch.level < 1;
			const drainedIds = new Set(
				batch.records.map((record) => `${batch.section.sectionTipo}:${record.sectionId}`),
			);
			for (const event of (batch as unknown as { ledger: ReplayEvent[] }).ledger) {
				if (event.kind === 'open') {
					lastOpen = `${event.level}:${event.sectionTipo}`;
					continue;
				}
				if (event.kind !== 'used' || !isDrain) continue;
				if (!drainedIds.has(`${event.sectionTipo}:${event.sectionId}`)) continue;
				expect(
					lastOpen,
					`drained record ${event.sectionTipo}:${event.sectionId} used with no \`open\` of ${batch.level}:${batch.section.sectionTipo} before it — a resume under a non-BFS drain loses the remainder`,
				).toBe(`${batch.level}:${batch.section.sectionTipo}`);
				checked++;
			}
		}
		expect(checked, 'no drained record was used in the stream (degenerate)').toBeGreaterThan(0);
	}, 120_000);
});

// ---------------------------------------------------------------- (c)

interface ArtifactEvent {
	op: 'wrote' | 'removed';
	sectionTipo: string;
	sectionId: number | string;
}

/** The JS Set replay the manifest must equal: wrote = add if absent, removed = delete. */
function setReplay(events: ArtifactEvent[]): [string, number | string][] {
	const manifest = new Map<string, [string, number | string]>();
	for (const event of events) {
		const key = `${event.sectionTipo}:${typeof event.sectionId}:${event.sectionId}`;
		if (event.op === 'wrote') {
			if (!manifest.has(key)) manifest.set(key, [event.sectionTipo, event.sectionId]);
		} else manifest.delete(key);
	}
	return [...manifest.values()];
}

function fuzzSequence(seed: number, length: number): ArtifactEvent[] {
	let state = seed >>> 0;
	const next = () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 4294967296;
	};
	return Array.from({ length }, () => ({
		op: next() < 0.7 ? 'wrote' : 'removed',
		sectionTipo: next() < 0.5 ? ZZDIF_SECTION : ZZDIF_LINKED_SECTION,
		sectionId: Math.floor(next() * 6) + 1,
	}));
}

const SEQUENCES: Record<string, ArtifactEvent[][]> = {
	'add-add (idempotent)': [
		[
			{ op: 'wrote', sectionTipo: ZZDIF_SECTION, sectionId: 1 },
			{ op: 'wrote', sectionTipo: ZZDIF_SECTION, sectionId: 2 },
		],
		[{ op: 'wrote', sectionTipo: ZZDIF_SECTION, sectionId: 1 }],
	],
	'add-remove-add (re-added goes to the tail)': [
		[
			{ op: 'wrote', sectionTipo: ZZDIF_SECTION, sectionId: 1 },
			{ op: 'wrote', sectionTipo: ZZDIF_SECTION, sectionId: 2 },
		],
		[{ op: 'removed', sectionTipo: ZZDIF_SECTION, sectionId: 1 }],
		[{ op: 'wrote', sectionTipo: ZZDIF_SECTION, sectionId: 1 }],
	],
	'remove-only': [[{ op: 'removed', sectionTipo: ZZDIF_LINKED_SECTION, sectionId: 9 }]],
	'fuzz (seed 1758)': [fuzzSequence(1758, 20), fuzzSequence(1759, 20), fuzzSequence(1760, 20)],
};

describe('(c) the ledger manifest (SQL) equals a JS Set replay', () => {
	for (const [name, batches] of Object.entries(SEQUENCES)) {
		test(name, async () => {
			const ledger = (await import(RUN_LEDGER)) as Record<string, unknown>;
			expect(typeof ledger.appendRunLedger, 'run_ledger.ts exports no appendRunLedger').toBe(
				'function',
			);
			const append = ledger.appendRunLedger as (
				lease: { job_id: string; attempt: number },
				batchSeq: number,
				events: unknown[],
			) => Promise<unknown>;
			const manifestOf = ledger.openArtifactManifest as (
				jobId: string,
			) => AsyncIterable<{ sectionTipo: string; sectionId: number | string }>;
			const job = await enqueueClaimSeeded(
				{
					elementTipo: `zzdifr${Object.keys(SEQUENCES).indexOf(name)}`,
					sectionTipo: 'zzdifrsec',
					type: 'markdown',
					ownerUserId: -1,
				},
				createdJobIds,
			);
			const lease = { job_id: job.job_id, attempt: job.attempt };
			for (const [index, events] of batches.entries()) await append(lease, index + 1, events);
			const manifest = await withTransaction(async () => {
				const out: [string, number | string][] = [];
				for await (const entry of manifestOf(job.job_id))
					out.push([entry.sectionTipo, entry.sectionId]);
				return out;
			});
			expect(manifest).toEqual(setReplay(batches.flat()));
		});
	}
});

// ---------------------------------------------------------------- (d)

type LedgerModule = {
	appendRunLedger: (
		lease: { job_id: string; attempt: number },
		batchSeq: number,
		events: unknown[],
	) => Promise<unknown>;
	readRunLedger: (jobId: string, options?: { pageRows?: number }) => AsyncIterable<ReplayEvent>;
	openArtifactManifest: (
		jobId: string,
		options?: { pageRows?: number },
	) => AsyncIterable<{ sectionTipo: string; sectionId: number | string }>;
	removedIdsFor: (
		jobId: string,
		sectionTipo: string,
		options?: { pageRows?: number },
	) => AsyncIterable<number | string>;
	LEDGER_PAGE_ROWS: number;
};

type MixedEvent = ReplayEvent | ArtifactEvent;

/** A deterministic mixed ledger: frontier AND artifact events, several section tipos. */
function mixedBatch(seed: number, length: number, idSpace: number): MixedEvent[] {
	let state = seed >>> 0;
	const next = () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 4294967296;
	};
	return Array.from({ length }, (): MixedEvent => {
		const roll = next();
		const sectionTipo = next() < 0.5 ? ZZDIF_SECTION : ZZDIF_LINKED_SECTION;
		// A small id space: re-adds, removals of present records; half number / half string.
		const raw = Math.floor(next() * idSpace) + 1;
		const sectionId = next() < 0.5 ? raw : String(raw);
		if (roll < 0.25)
			return { kind: 'queue', level: Math.floor(next() * 3), sectionTipo, sectionId };
		if (roll < 0.3) return { kind: 'open', level: Math.floor(next() * 3), sectionTipo };
		if (roll < 0.45) return { kind: 'used', sectionTipo, sectionId };
		if (roll < 0.7) return { op: 'wrote', sectionTipo, sectionId };
		return { op: 'removed', sectionTipo, sectionId };
	});
}

const isFrontier = (event: MixedEvent): event is ReplayEvent => 'kind' in event;
const isArtifact = (event: MixedEvent): event is ArtifactEvent => 'op' in event;

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
	const out: T[] = [];
	for await (const item of items) out.push(item);
	return out;
}

/** Append `batches`, then read every reader at `pageRows` and compare with the JS replays. */
async function assertPagedReadersEqual(
	ledger: LedgerModule,
	name: string,
	batches: MixedEvent[][],
	pageSizes: (number | undefined)[],
): Promise<void> {
	const job = await enqueueClaimSeeded(
		{ elementTipo: `zzdifp_${name}`, sectionTipo: 'zzdifpsec', type: 'markdown', ownerUserId: -1 },
		createdJobIds,
	);
	const lease = { job_id: job.job_id, attempt: job.attempt };
	for (const [index, events] of batches.entries()) {
		await ledger.appendRunLedger(lease, index + 1, events);
	}
	const all = batches.flat();
	const frontierEvents = all.filter(isFrontier);
	const replay = await loadReplay();
	const expectedState = await replay(stream(frontierEvents));
	const expectedManifest = setReplay(all.filter(isArtifact));
	const expectedRemoved = all
		.filter(isArtifact)
		.filter((event) => event.op === 'removed' && event.sectionTipo === ZZDIF_LINKED_SECTION)
		.map((event) => event.sectionId);
	for (const pageRows of pageSizes) {
		const options = pageRows === undefined ? undefined : { pageRows };
		const label = `${name}, pageRows ${pageRows ?? `default ${ledger.LEDGER_PAGE_ROWS}`}`;
		// The raw stream first: a re-read or a skipped page shows here as a count.
		const read = await collect(ledger.readRunLedger(job.job_id, options));
		expect(read.length, `${label}: readRunLedger returned the wrong number of events`).toBe(
			frontierEvents.length,
		);
		expect(read, `${label}: readRunLedger diverged from the appended events`).toEqual(
			frontierEvents,
		);
		expect(
			await replay(ledger.readRunLedger(job.job_id, options)),
			`${label}: the paged replay diverged from the in-memory reducer`,
		).toEqual(expectedState);
		const [manifest, removed] = await withTransaction(async () => [
			(await collect(ledger.openArtifactManifest(job.job_id, options))).map(
				(entry) => [entry.sectionTipo, entry.sectionId] as [string, number | string],
			),
			await collect(ledger.removedIdsFor(job.job_id, ZZDIF_LINKED_SECTION, options)),
		]);
		expect(manifest, `${label}: the paged manifest diverged from the Set replay`).toEqual(
			expectedManifest,
		);
		expect(removed, `${label}: removedIdsFor diverged`).toEqual(expectedRemoved);
	}
}

describe('(d) every ledger reader streams the same events across page boundaries', () => {
	test('tiny pages: a break inside a batch, on a batch edge, every row its own page', async () => {
		const ledger = (await import(RUN_LEDGER)) as LedgerModule;
		// Batch sizes 20 / 18 / 22 against page sizes 1, 2, 3, 7 (page breaks
		// inside every batch, and on a batch edge at size 1).
		const batches = [mixedBatch(11, 20, 4), mixedBatch(12, 18, 4), mixedBatch(13, 22, 4)];
		// Non-degenerate: every reader has more than one page to read at size 2.
		const all = batches.flat();
		expect(all.filter(isFrontier).length).toBeGreaterThan(4);
		expect(setReplay(all.filter(isArtifact)).length).toBeGreaterThan(2);
		expect(
			all.filter(
				(event) =>
					isArtifact(event) && event.op === 'removed' && event.sectionTipo === ZZDIF_LINKED_SECTION,
			).length,
		).toBeGreaterThan(2);
		await assertPagedReadersEqual(ledger, 'tiny', batches, [1, 2, 3, 7]);
	});

	test('the production page: a ledger of several default pages, one batch alone larger than a page', async () => {
		const ledger = (await import(RUN_LEDGER)) as LedgerModule;
		const page = ledger.LEDGER_PAGE_ROWS;
		// Sized from the page so each reader crosses it, and the frontier page
		// break falls INSIDE batch 2 (the ord keyset within one batch_seq).
		const queued = (from: number, count: number): ReplayEvent[] =>
			Array.from({ length: count }, (_, i) => queue(i % 3, ZZDIF_SECTION, from + i));
		const wrote = (from: number, count: number): ArtifactEvent[] =>
			Array.from({ length: count }, (_, i) => ({
				op: 'wrote',
				sectionTipo: ZZDIF_LINKED_SECTION,
				sectionId: i % 2 === 0 ? from + i : String(from + i),
			}));
		const removed = (from: number, count: number): ArtifactEvent[] =>
			Array.from({ length: count }, (_, i) => ({
				op: 'removed',
				sectionTipo: ZZDIF_LINKED_SECTION,
				sectionId: i % 2 === 0 ? from + i : String(from + i),
			}));
		const interleave = (...lists: MixedEvent[][]): MixedEvent[] => {
			const out: MixedEvent[] = [];
			const longest = Math.max(...lists.map((list) => list.length));
			for (let i = 0; i < longest; i++) {
				for (const list of lists) if (i < list.length) out.push(list[i] as MixedEvent);
			}
			return out;
		};
		const half = Math.floor(page / 2);
		const batches: MixedEvent[][] = [
			interleave(queued(1, page - half), wrote(1, page - half)),
			// Alone larger than a page.
			interleave(queued(page, half + 500), wrote(page, half + 1000), removed(1, 500)),
			interleave([used(ZZDIF_SECTION, 1), open(0, ZZDIF_SECTION)], removed(3 * page, page)),
		];
		const all = batches.flat();
		expect((batches[1] as MixedEvent[]).length).toBeGreaterThan(page);
		expect(all.filter(isFrontier).length).toBeGreaterThan(page);
		expect(setReplay(all.filter(isArtifact)).length).toBeGreaterThan(page);
		expect(
			all.filter((event) => isArtifact(event) && event.op === 'removed').length,
		).toBeGreaterThan(page);
		await assertPagedReadersEqual(ledger, 'default', batches, [undefined]);
	}, 60_000);
});
