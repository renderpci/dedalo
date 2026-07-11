import { describe, expect, test } from 'bun:test';
import {
	CHUNKER_VERSION,
	type ChunkEmbedder,
	buildEmbedText,
	chunk,
	cosineDistance,
	detectMode,
	estimateTokens,
	packSegments,
	parseDocumentUnits,
	parseTranscriptionUnits,
	percentile,
	segmentUnit,
	splitSentences,
} from '../../src/ai/rag/chunker.ts';

/**
 * Structure-aware semantic chunker — behavioural coverage. Ported from
 * `src/ai/rag2/test/chunker.test.ts` (Brick 1). The reference test used the
 * rag2 `DeterministicEmbeddingProvider`; here we inline an equivalent sync
 * bag-of-words FNV embedder so texts sharing vocabulary land close in cosine
 * space (a real provider is not needed until Brick 4).
 */
const embedder: ChunkEmbedder = (texts) => texts.map((text) => embedOne(text, 64));

/** FNV-1a bag-of-words hashing embedder — vocab overlap → higher cosine sim. */
function embedOne(text: string, dimension: number): number[] {
	const vector = new Array<number>(dimension).fill(0);
	const tokens = text
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((token) => token.length > 1);
	for (const token of tokens) {
		let hash = 0x811c9dc5;
		for (let i = 0; i < token.length; i++) {
			hash ^= token.charCodeAt(i);
			hash = Math.imul(hash, 0x01000193);
		}
		const bucket = Math.abs(hash) % dimension;
		const sign = (hash & 1) === 0 ? 1 : -1;
		vector[bucket] = (vector[bucket] as number) + sign;
	}
	return vector;
}

describe('estimateTokens / percentile / cosineDistance', () => {
	test('estimateTokens is the conservative max of word/char estimates', () => {
		expect(estimateTokens('')).toBe(1);
		expect(estimateTokens('one two three')).toBeGreaterThanOrEqual(3);
		// dense CJK gets the char-based estimate
		expect(estimateTokens('字'.repeat(40))).toBeGreaterThanOrEqual(10);
	});

	test('percentile interpolates linearly', () => {
		expect(percentile([], 0.5)).toBe(0);
		expect(percentile([10], 0.9)).toBe(10);
		expect(percentile([0, 10], 0.5)).toBe(5);
		expect(percentile([0, 10, 20, 30], 0)).toBe(0);
		expect(percentile([0, 10, 20, 30], 1)).toBe(30);
	});

	test('cosineDistance: identical=0, orthogonal=1, zero-vector=1', () => {
		expect(cosineDistance([1, 0], [1, 0])).toBeCloseTo(0, 9);
		expect(cosineDistance([1, 0], [0, 1])).toBeCloseTo(1, 9);
		expect(cosineDistance([0, 0], [1, 1])).toBe(1);
	});
});

describe('splitSentences', () => {
	test('splits on terminal punctuation incl. CJK, keeps terminator', () => {
		const s = splitSentences('Hello world. How are you? Fine!');
		expect(s).toEqual(['Hello world.', 'How are you?', 'Fine!']);
	});
	test('empty → []', () => {
		expect(splitSentences('   ')).toEqual([]);
	});
	test('no terminator → single sentence', () => {
		expect(splitSentences('no terminator here')).toEqual(['no terminator here']);
	});
});

describe('detectMode', () => {
	test('detects transcription from a TC marker', () => {
		expect(detectMode('[TC_00:00:01.000_TC] hi', 450)).toBe('transcription');
	});
	test('short when it fits one chunk', () => {
		expect(detectMode('tiny text', 450)).toBe('short');
	});
	test('long_document when it exceeds the budget', () => {
		const big = 'word '.repeat(2000);
		expect(detectMode(big, 50)).toBe('long_document');
	});
});

describe('parseDocumentUnits — structural hard boundaries', () => {
	test('headings open new units and build a heading path', () => {
		const text = '[h1] Top\nintro para\n\n[h2] Sub\nbody para';
		const units = parseDocumentUnits(text);
		expect(units.length).toBe(2);
		expect(units[0]!.headingPath).toBe('Top');
		expect(units[0]!.text).toContain('intro para');
		expect(units[1]!.headingPath).toBe('Top › Sub');
		expect(units[1]!.text).toContain('body para');
		// each heading unit carries a stable parent_key (md5 of heading path)
		expect(units[0]!.parentKey).toBeTruthy();
		expect(units[0]!.parentKey).not.toBe(units[1]!.parentKey);
	});

	test('a deeper heading truncates the path to its level', () => {
		const text = '[h1] A\nx\n[h2] B\ny\n[h1] C\nz';
		const units = parseDocumentUnits(text);
		expect(units.map((u) => u.headingPath)).toEqual(['A', 'A › B', 'C']);
	});

	test('page markers are recorded as provenance, not as text', () => {
		const text = '[page-n-7]\n[h1] Heading\nsome body';
		const units = parseDocumentUnits(text);
		expect(units[0]!.meta.page).toBe(7);
		expect(units[0]!.text).not.toContain('page-n-7');
	});

	test('no structure → single unit covering the whole text', () => {
		const units = parseDocumentUnits('just a flat paragraph with no headings');
		expect(units.length).toBe(1);
		expect(units[0]!.headingPath).toBe('');
		expect(units[0]!.parentKey).toBeNull();
	});
});

describe('parseTranscriptionUnits — TC turns are hard boundaries', () => {
	test('one unit per TC turn, with tc_in/tc_out provenance', () => {
		const text = '[TC_00:00:01.000_TC] first speaker line [TC_00:00:05.500_TC] second speaker line';
		const units = parseTranscriptionUnits(text, 'dd123');
		expect(units.length).toBe(2);
		expect(units[0]!.sourceKind).toBe('av_transcript');
		expect(units[0]!.meta.tcIn).toBe('00:00:01.000');
		expect(units[0]!.meta.tcOut).toBe('00:00:05.500');
		expect(units[0]!.text).toBe('first speaker line');
		expect(units[1]!.meta.tcIn).toBe('00:00:05.500');
		expect(units[1]!.meta.tcOut).toBeNull();
		expect(units[0]!.parentKey).toBe('av:dd123');
	});

	test('no markers despite detection → single av_transcript unit', () => {
		const units = parseTranscriptionUnits('no markers', null);
		expect(units.length).toBe(1);
		expect(units[0]!.sourceKind).toBe('av_transcript');
	});
});

describe('segmentUnit — semantic soft boundaries', () => {
	test('without an embedder returns one structural segment', () => {
		const seg = segmentUnit('A. B. C. D.', undefined, 0.5);
		expect(seg).toEqual(['A. B. C. D.']);
	});

	test('with an embedder, a topic shift forces a semantic break', () => {
		// Two tight topical clusters; the seam between them is the largest distance.
		const text =
			'cats purr softly. cats chase mice. cats love warm laps. ' +
			'rockets burn fuel. rockets reach orbit. rockets carry crews.';
		const segments = segmentUnit(text, embedder, 0.5);
		expect(segments.length).toBeGreaterThan(1);
		// the cat cluster and rocket cluster should not be fused into one segment
		const joined = segments.join(' || ');
		expect(joined).toMatch(/cats[^|]*\|\|/); // a break occurs after the cats run
	});

	test('embedder returning the wrong count degrades to structural-only', () => {
		const broken: ChunkEmbedder = () => [[1, 2, 3]]; // too few
		expect(segmentUnit('A. B. C.', broken, 0.5)).toEqual(['A. B. C.']);
	});
});

describe('packSegments — budget + min-token double-merge', () => {
	test('packs greedily toward max_tokens', () => {
		const segs = ['aa bb cc', 'dd ee ff', 'gg hh ii'];
		const packed = packSegments(segs, 8, 1);
		// each segment ~4 tokens, budget 8 → ~2 per chunk
		expect(packed.length).toBeGreaterThanOrEqual(2);
	});

	test('a trailing orphan below min_tokens merges into the previous chunk', () => {
		// first big segment, then a 1-token orphan
		const big = 'word '.repeat(30).trim();
		const packed = packSegments([big, 'tail'], 50, 20);
		expect(packed.length).toBe(1);
		expect(packed[0]).toContain('tail');
	});

	test('an oversize single segment is hard-split on sentences', () => {
		const oversize = 'one two three four. five six seven eight. nine ten eleven twelve.';
		const packed = packSegments([oversize], 5, 1);
		expect(packed.length).toBeGreaterThan(1);
	});
});

describe('buildEmbedText — header on embedded text only', () => {
	test('prepends "{title › heading}" header', () => {
		expect(buildEmbedText('Doc', 'Chap › Sec', 'body')).toBe('Doc › Chap › Sec\nbody');
	});
	test('no header parts → raw unchanged', () => {
		expect(buildEmbedText('', '', 'body')).toBe('body');
	});
});

describe('chunk — end-to-end', () => {
	test('header enriches embed_text but raw text stays clean for citation', () => {
		const text = '[h1] History\nThe site was excavated in 1932. Many finds emerged.';
		const chunks = chunk(text, { documentTitle: 'Catalog', embedder });
		expect(chunks.length).toBeGreaterThanOrEqual(1);
		const c = chunks[0]!;
		expect(c.embedText.startsWith('Catalog › History')).toBe(true);
		expect(c.text).not.toContain('Catalog');
		expect(c.text).not.toContain('History\n'); // heading is not in the raw body
		expect(c.parentKey).toBeTruthy();
		expect(c.sourceKind).toBe('text');
	});

	test('source_hash = sha256(VERSION | embed_text) and is version-sensitive', () => {
		const text = 'A single short paragraph.';
		const chunks = chunk(text, { documentTitle: 'T' });
		const expected = new Bun.CryptoHasher('sha256')
			.update(`${CHUNKER_VERSION}|${chunks[0]!.embedText}`)
			.digest('hex');
		expect(chunks[0]!.sourceHash).toBe(expected);
		// a different VERSION would change every hash (simulate by hashing v2)
		const v2 = new Bun.CryptoHasher('sha256').update(`v2|${chunks[0]!.embedText}`).digest('hex');
		expect(v2).not.toBe(chunks[0]!.sourceHash);
	});

	test('chunk_index is contiguous across all produced chunks', () => {
		const text = `[h1] One\n${'a. '.repeat(60)}\n[h1] Two\n${'b. '.repeat(60)}`;
		const chunks = chunk(text, { maxTokens: 20, minTokens: 5, embedder });
		expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
	});

	test('transcription mode produces av_transcript chunks with tc provenance', () => {
		const text = '[TC_00:00:01.000_TC] hello there [TC_00:00:09.000_TC] goodbye now';
		const chunks = chunk(text, { mediaTipo: 'dd9' });
		expect(chunks.every((c) => c.sourceKind === 'av_transcript')).toBe(true);
		expect(chunks[0]!.chunkMeta.tcIn).toBe('00:00:01.000');
	});

	test('empty input → no chunks', () => {
		expect(chunk('   ')).toEqual([]);
	});

	test('structural-only strategy ignores the embedder (no semantic split)', () => {
		const text = 'cats purr. rockets fly. dogs bark. planets orbit.';
		const withSem = chunk(text, { strategy: 'structural_semantic', embedder, maxTokens: 500 });
		const structOnly = chunk(text, { strategy: 'structural', embedder, maxTokens: 500 });
		// structural-only keeps it as one chunk; semantic may break it
		expect(structOnly.length).toBe(1);
		expect(withSem.length).toBeGreaterThanOrEqual(structOnly.length);
	});
});
