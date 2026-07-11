import { describe, expect, test } from 'bun:test';
import { collapseToRecords, fuse, tagScore } from '../../src/ai/rag/fusion.ts';
import type { Candidate } from '../../src/ai/rag/types.ts';

/**
 * Reciprocal Rank Fusion + record collapse — behavioural coverage. Ported from
 * `src/ai/rag2/test/fusion.test.ts` (Brick 1).
 */

function cand(p: Partial<Candidate> & { sectionId: number }): Candidate {
	return {
		sectionTipo: p.sectionTipo ?? 'dd1',
		sectionId: p.sectionId,
		componentTipo: p.componentTipo ?? 'c1',
		lang: p.lang ?? 'es',
		chunkIndex: p.chunkIndex ?? 0,
		sourceText: p.sourceText ?? `text-${p.sectionId}`,
		sourceKind: p.sourceKind ?? 'text',
		modality: p.modality ?? 'text',
		egressClass: p.egressClass ?? 'public',
		parentKey: p.parentKey ?? null,
		chunkMeta: p.chunkMeta ?? null,
		...(p.distance !== undefined ? { distance: p.distance } : {}),
		...(p.lexRank !== undefined ? { lexRank: p.lexRank } : {}),
	};
}

describe('fuse — Reciprocal Rank Fusion', () => {
	test('an item ranked high in BOTH lists wins (RRF agreement)', () => {
		const dense = [cand({ sectionId: 1 }), cand({ sectionId: 2 }), cand({ sectionId: 3 })];
		const lexical = [cand({ sectionId: 1 }), cand({ sectionId: 3 }), cand({ sectionId: 2 })];
		const fused = fuse([dense, lexical], undefined, 60);
		expect(fused[0]!.sectionId).toBe(1); // top in both lists
		// score == 1/(60+1) + 1/(60+1)
		expect(fused[0]!.rrfScore).toBeCloseTo(2 / 61, 9);
	});

	test('a candidate present in only one list still scores from that list', () => {
		const a = [cand({ sectionId: 1 })];
		const b = [cand({ sectionId: 2 })];
		const fused = fuse([a, b]);
		expect(fused.map((c) => c.sectionId).sort()).toEqual([1, 2]);
		// both at rank 1 in their single list → equal scores
		expect(fused[0]!.rrfScore).toBeCloseTo(fused[1]!.rrfScore!, 9);
	});

	test('preserves the first-seen full row (provenance survives)', () => {
		const dense = [cand({ sectionId: 5, sourceText: 'DENSE-TEXT' })];
		const lexical = [cand({ sectionId: 5, sourceText: 'LEX-TEXT' })];
		const fused = fuse([dense, lexical]);
		expect(fused.length).toBe(1);
		expect(fused[0]!.sourceText).toBe('DENSE-TEXT'); // first list wins the row
		expect(fused[0]!.rrfScore).toBeCloseTo(2 / 61, 9);
	});

	test('output is sorted descending by rrf_score', () => {
		const dense = [cand({ sectionId: 1 }), cand({ sectionId: 2 })];
		const lexical = [cand({ sectionId: 2 })];
		const fused = fuse([dense, lexical]);
		expect(fused[0]!.sectionId).toBe(2); // appears in both → higher
		expect(fused[0]!.rrfScore! >= fused[1]!.rrfScore!).toBe(true);
	});

	test('a larger k flattens the rank advantage', () => {
		// Asymmetric: item 1 is rank-1 in both lists, item 2 is rank-2 in both, so a
		// genuine score gap exists; a larger k shrinks it toward zero.
		const dense = [cand({ sectionId: 1 }), cand({ sectionId: 2 })];
		const lexical = [cand({ sectionId: 1 }), cand({ sectionId: 2 })];
		const small = fuse([dense, lexical], undefined, 1);
		const large = fuse([dense, lexical], undefined, 1000);
		const spreadSmall = Math.abs(small[0]!.rrfScore! - small[1]!.rrfScore!);
		const spreadLarge = Math.abs(large[0]!.rrfScore! - large[1]!.rrfScore!);
		expect(spreadLarge).toBeLessThan(spreadSmall);
	});
});

describe('collapseToRecords — best chunk per record', () => {
	test('keeps the highest-scored chunk for each (section_tipo, section_id)', () => {
		const c1 = { ...cand({ sectionId: 1, chunkIndex: 0 }), rrfScore: 0.1 };
		const c2 = { ...cand({ sectionId: 1, chunkIndex: 1 }), rrfScore: 0.9 };
		const c3 = { ...cand({ sectionId: 2, chunkIndex: 0 }), rrfScore: 0.5 };
		const records = collapseToRecords([c1, c2, c3], 'rrfScore');
		expect(records.length).toBe(2);
		expect(records[0]!.sectionId).toBe(1); // 0.9 wins overall
		expect(records[0]!.chunkIndex).toBe(1); // the better chunk of record 1
		expect(records[1]!.sectionId).toBe(2);
	});

	test('collapses on the score-only key too', () => {
		const a = { ...cand({ sectionId: 9 }), score: 0.3 };
		const b = { ...cand({ sectionId: 9, chunkIndex: 2 }), score: 0.7 };
		const recs = collapseToRecords([a, b], 'score');
		expect(recs.length).toBe(1);
		expect(recs[0]!.chunkIndex).toBe(2);
	});

	test('records of different section_tipo but same id do not collapse together', () => {
		const a = { ...cand({ sectionTipo: 'dd1', sectionId: 1 }), rrfScore: 0.2 };
		const b = { ...cand({ sectionTipo: 'dd2', sectionId: 1 }), rrfScore: 0.4 };
		const recs = collapseToRecords([a, b], 'rrfScore');
		expect(recs.length).toBe(2);
	});
});

describe('tagScore — single-leg uniform score', () => {
	test('score = 1/(1+distance), closer is higher', () => {
		const tagged = tagScore([
			cand({ sectionId: 1, distance: 0 }),
			cand({ sectionId: 2, distance: 1 }),
		]);
		expect(tagged[0]!.score).toBeCloseTo(1, 9);
		expect(tagged[1]!.score).toBeCloseTo(0.5, 9);
	});
	test('missing distance defaults to 1', () => {
		const tagged = tagScore([cand({ sectionId: 1 })]);
		expect(tagged[0]!.score).toBeCloseTo(0.5, 9);
	});
});
