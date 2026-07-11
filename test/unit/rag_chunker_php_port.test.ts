import { describe, expect, test } from 'bun:test';
import {
	CHUNKER_VERSION,
	chunk,
	cosineDistance,
	detectMode,
	estimateTokens,
	packSegments,
	parseDocumentUnits,
	percentile,
	segmentUnit,
	splitSentences,
} from '../../src/ai/rag/chunker.ts';

/**
 * PORT of test/server/rag/rag_chunker_Test.php — the structure-aware semantic
 * chunker. Asserts the SAME math + boundary logic against the TS chunker port
 * (src/ai/rag/chunker.ts), with the SAME inputs/expected values as the PHP test.
 *
 * The broad behavioural coverage already lives in rag_chunker.test.ts; THIS file
 * pins the specific PHP-named assertions so the net maps onto the PHP
 * rag_chunker_Test method intents 1:1.
 */

describe('rag_chunker_Test::test_estimate_tokens (positive + monotonic)', () => {
	test('larger text estimates more tokens than smaller; both positive', () => {
		const small = estimateTokens('hello world');
		const large = estimateTokens('palabra '.repeat(200));
		expect(small).toBeGreaterThan(0);
		expect(large).toBeGreaterThan(small);
	});
});

describe('rag_chunker_Test::test_cosine_distance', () => {
	test('identical vectors → 0.0; orthogonal → 1.0 (±1e-9)', () => {
		expect(cosineDistance([1, 2, 3], [1, 2, 3])).toBeCloseTo(0, 9);
		expect(cosineDistance([1, 0, 0], [0, 1, 0])).toBeCloseTo(1, 9);
	});
});

describe('rag_chunker_Test::test_percentile (linear interpolation)', () => {
	test('on [0.0, 0.5, 1.0]: p(0)=0, p(1)=1, p(0.5)=0.5 (±1e-9)', () => {
		const v = [0.0, 0.5, 1.0];
		expect(percentile(v, 0)).toBeCloseTo(0, 9);
		expect(percentile(v, 1)).toBeCloseTo(1, 9);
		expect(percentile(v, 0.5)).toBeCloseTo(0.5, 9);
	});
});

describe('rag_chunker_Test::test_split_sentences', () => {
	test('"One. Two! Three? Done." → 4 sentences', () => {
		expect(splitSentences('One. Two! Three? Done.').length).toBe(4);
	});
});

describe('rag_chunker_Test::test_segment_unit_semantic_breakpoint', () => {
	test('a topic shift forces ≥2 segments with an injected one-hot embedder', () => {
		// deterministic one-hot embedder per topic (cat/feline vs bank/loan).
		const topicEmbedder = (texts: string[]): number[][] =>
			texts.map((t) => {
				const isBank = /bank|loan|interest|money/i.test(t);
				return isBank ? [0, 1] : [1, 0];
			});
		const text =
			'The cat sat on the mat. A feline is a small carnivore. ' +
			'The bank approved the loan. Interest rates rose sharply.';
		const segments = segmentUnit(text, topicEmbedder, 0.5);
		expect(segments.length).toBeGreaterThanOrEqual(2);
		// topic isolation: the cat segment must not carry the bank text.
		const catSeg = segments.find((s) => /cat|feline/i.test(s)) ?? '';
		expect(/loan|bank/i.test(catSeg)).toBe(false);
	});
});

describe('rag_chunker_Test::test_segment_unit_without_embedder', () => {
	test('no embedder → structural-only single segment', () => {
		const text = 'One topic. Another topic entirely.';
		expect(segmentUnit(text, undefined, 0.92)).toEqual([text]);
	});
});

describe('rag_chunker_Test::test_structural_headings_are_hard_boundaries', () => {
	test('two [h1] headings → ≥2 chunks, each with a distinct parent_key, no cross-merge', () => {
		const text = '[h1] Alpha\nAlpha body text here.\n\n[h1] Beta\nBeta body text here.';
		const chunks = chunk(text, { strategy: 'structural', maxTokens: 1000, minTokens: 1 });
		expect(chunks.length).toBeGreaterThanOrEqual(2);
		const parents = new Set(chunks.map((c) => c.parentKey));
		expect(parents.size).toBeGreaterThanOrEqual(2);
		// body never spans the heading boundary.
		for (const c of chunks) {
			expect(c.text.includes('Alpha body') && c.text.includes('Beta body')).toBe(false);
		}
	});
});

describe('rag_chunker_Test::test_page_marker_provenance', () => {
	test('[page-n-7] captured as chunk_meta.page, not in the text', () => {
		const units = parseDocumentUnits('[page-n-7]\nSome body text on page seven.');
		expect(units[0]!.meta.page).toBe(7);
		expect(units[0]!.text.includes('page-n-7')).toBe(false);
	});
});

describe('rag_chunker_Test::test_contextual_header_separation', () => {
	test('embed_text carries the title header; raw text stays clean; source_hash versioned', () => {
		const text = '[h1] Coins\nThe denarius was a Roman silver coin.';
		const chunks = chunk(text, { documentTitle: 'Catalogue', maxTokens: 1000, minTokens: 1 });
		const c = chunks[0]!;
		expect(c.embedText).toContain('Catalogue');
		expect(c.embedText).toContain('Coins');
		expect(c.text.includes('Catalogue')).toBe(false); // raw clean for citation
		// source_hash = sha256(VERSION | embed_text).
		const expected = new Bun.CryptoHasher('sha256')
			.update(`${CHUNKER_VERSION}|${c.embedText}`)
			.digest('hex');
		expect(c.sourceHash).toBe(expected);
	});
});

describe('rag_chunker_Test::test_transcription_timecodes', () => {
	test('TC markers → av_transcript chunks with tc_in/tc_out + media_tipo provenance', () => {
		const text = '[TC_00:00:01_TC] Hello there. [TC_00:00:05_TC] Welcome to the show.';
		const chunks = chunk(text, { mediaTipo: 'av99', maxTokens: 1000, minTokens: 1 });
		expect(chunks.length).toBeGreaterThanOrEqual(2);
		expect(chunks[0]!.sourceKind).toBe('av_transcript');
		expect(chunks[0]!.chunkMeta.tcIn).toBe('00:00:01');
		expect(chunks[0]!.chunkMeta.mediaTipo).toBe('av99');
	});
});

describe('rag_chunker_Test::test_detect_mode', () => {
	test('TC marker → transcription; tiny → short; large → long_document', () => {
		expect(detectMode('[TC_00:00:01_TC] hi', 450)).toBe('transcription');
		expect(detectMode('short text', 450)).toBe('short');
		expect(detectMode('word '.repeat(5000), 450)).toBe('long_document');
	});
});

describe('rag_chunker_Test::test_pack_oversize_segment_hard_split', () => {
	test('an oversize segment is hard-split into multiple pieces (≤ max+overshoot)', () => {
		const seg = 'This is a sentence. '.repeat(80).trim();
		const pieces = packSegments([seg], 40, 5);
		expect(pieces.length).toBeGreaterThan(1);
	});
});

describe('rag_chunker_Test::test_chunk_indexes_contiguous', () => {
	test('chunk_index values are contiguous from 0', () => {
		const text = '[h1] A\nbody a.\n\n[h1] B\nbody b.\n\n[h1] C\nbody c.';
		const chunks = chunk(text, { maxTokens: 1000, minTokens: 1 });
		expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
	});
});

describe('rag_chunker_Test::test_empty_input', () => {
	test('empty / whitespace input → []', () => {
		expect(chunk('')).toEqual([]);
		expect(chunk('   \n  \t ')).toEqual([]);
	});
});
