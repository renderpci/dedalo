import { describe, expect, test } from 'bun:test';
import { collapseToRecords, fuse } from '../../src/ai/rag/fusion.ts';
import type { Candidate } from '../../src/ai/rag/types.ts';

/**
 * PORT of test/server/rag/rag_fusion_Test.php — Reciprocal Rank Fusion (RRF) +
 * record collapse. Asserts the SAME merge math against the TS fusion port
 * (src/ai/rag/fusion.ts) with the SAME frozen values as the PHP test
 * (RRF k=60 → 1/(60+rank), an item at rank 1 in both lists → 2/(60+1)).
 */

function cand(sectionId: number, extra: Partial<Candidate> = {}): Candidate {
	return {
		sectionTipo: extra.sectionTipo ?? 's1',
		sectionId,
		componentTipo: extra.componentTipo ?? 'c1',
		lang: extra.lang ?? 'lg-eng',
		chunkIndex: extra.chunkIndex ?? 0,
		sourceText: extra.sourceText ?? `text-${sectionId}`,
		sourceKind: extra.sourceKind ?? 'text',
		modality: extra.modality ?? 'text',
		egressClass: extra.egressClass ?? 'public',
		parentKey: extra.parentKey ?? null,
		chunkMeta: extra.chunkMeta ?? null,
	};
}

describe('rag_fusion_Test::test_rrf_rewards_agreement', () => {
	test('a record high in BOTH lists beats a record strong in only one', () => {
		// record (s1,2) ranks 2nd in dense, 1st in lexical → tops the fused output.
		const dense = [cand(1), cand(2), cand(3)];
		const lexical = [cand(2), cand(4)];
		const fused = fuse([dense, lexical], undefined, 60);
		expect(fused[0]!.sectionId).toBe(2); // present in both → wins
		// scores are descending.
		for (let i = 1; i < fused.length; i++) {
			expect(fused[i - 1]!.rrfScore! >= fused[i]!.rrfScore!).toBe(true);
		}
	});
});

describe('rag_fusion_Test::test_rrf_dedupes_and_preserves_payload', () => {
	test('a record in both lists at rank 1 → one row, score 2/(60+1), payload preserved', () => {
		const dense = [cand(7, { sourceText: 'DENSE' })];
		const lexical = [cand(7, { sourceText: 'LEX' })];
		const fused = fuse([dense, lexical], undefined, 60);
		expect(fused.length).toBe(1); // deduplicated by natural key
		expect(fused[0]!.rrfScore).toBeCloseTo(2 / 61, 9); // 1/(60+1) + 1/(60+1)
		expect(fused[0]!.sourceText).toBe('DENSE'); // first list wins the row (payload survives)
	});
});

describe('rag_fusion_Test::test_collapse_to_records', () => {
	test('keeps the best-scoring chunk per record, descending by score', () => {
		// record (s1,1) has chunk 0 (0.3) and chunk 5 (0.9) → collapse keeps chunk 5.
		const c0 = { ...cand(1, { chunkIndex: 0 }), rrfScore: 0.3 };
		const c5 = { ...cand(1, { chunkIndex: 5 }), rrfScore: 0.9 };
		const c2 = { ...cand(2, { chunkIndex: 0 }), rrfScore: 0.5 };
		const records = collapseToRecords([c0, c5, c2], 'rrfScore');
		expect(records.length).toBe(2);
		expect(records[0]!.sectionId).toBe(1); // 0.9 wins overall
		expect(records[0]!.chunkIndex).toBe(5); // the better chunk of record 1
		expect(records[1]!.sectionId).toBe(2);
	});
});
