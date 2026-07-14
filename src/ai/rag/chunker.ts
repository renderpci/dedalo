import { createHash } from 'node:crypto';
import { readEnv } from '../../config/env.ts';
import { readNumber, readString } from '../../config/readers.ts';

/**
 * Structure-aware SEMANTIC chunking — faithful port of PHP rag_chunker
 * (core/rag/class.rag_chunker.php), brought over from the reference
 * implementation `src/ai/rag2/src/chunker.ts` (Brick 1). Produces "solid"
 * chunks: each one coherent idea, aligned to the document structure, enriched
 * with a context header, and linked to its parent section for small-to-big
 * retrieval.
 *
 * Pipeline:
 *  1. STRUCTURE PARSE — hard boundaries: headings / paragraphs / page markers /
 *     timecode-speaker turns. A chunk NEVER crosses a structural boundary.
 *  2. SEMANTIC SEGMENTATION — soft boundaries: embed consecutive sentences and
 *     break where adjacent cosine distance exceeds a percentile threshold.
 *     Degrades to structural-only when no embedder is injected.
 *  3. PACK + DOUBLE-MERGE — pack toward max_tokens with a min_tokens floor that
 *     absorbs orphan trailing segments.
 *  4. CONTEXTUAL ENRICHMENT — prepend "{title › heading}" to the EMBEDDED text
 *     only (raw source_text stays clean for citation).
 *  5. SMALL-TO-BIG — each chunk carries a parent_key (its structural section).
 *
 * The embedder is INJECTED so this is fully unit-testable without a live model.
 * source_hash = sha256(VERSION '|' embed_text) so a VERSION bump deliberately
 * re-embeds every chunk.
 */

/** Synchronous embedder signature for semantic segmentation. */
export type ChunkEmbedder = (texts: string[]) => number[][];

export type ChunkMode = 'auto' | 'short' | 'transcription' | 'long_document';
export type ChunkStrategy = 'structural' | 'structural_semantic';

export interface ChunkOpts {
	mode?: ChunkMode;
	strategy?: ChunkStrategy;
	maxTokens?: number;
	minTokens?: number;
	documentTitle?: string;
	mediaTipo?: string | null;
	/** Injected embedder for semantic boundaries. Omit for structural-only. */
	embedder?: ChunkEmbedder;
	/** Percentile 0..1 for the semantic breakpoint. Default 0.92. */
	breakpointThreshold?: number;
}

export interface ChunkMeta {
	heading?: string | null;
	page?: number | null;
	charStart?: number | null;
	tcIn?: string | null;
	tcOut?: string | null;
	mediaTipo?: string | null;
}

export interface Chunk {
	chunkIndex: number;
	text: string;
	embedText: string;
	sourceHash: string;
	tokenCount: number;
	sourceKind: string;
	parentKey: string | null;
	chunkMeta: ChunkMeta;
}

interface StructuralUnit {
	sourceKind: string;
	headingPath: string;
	parentKey: string | null;
	meta: ChunkMeta;
	text: string;
}

/**
 * Chunker algorithm version, mixed into source_hash. Bump when the
 * segmentation/enrichment logic changes so a re-index re-embeds every chunk.
 */
export const CHUNKER_VERSION = 'v1';

// Install-level chunking knobs (PHP rag catalog keys; per-component ontology
// properties.rag config still overrides via ChunkOpts).
const DEFAULT_MAX_TOKENS = readNumber('DEDALO_RAG_CHUNK_TOKENS');
const DEFAULT_MIN_TOKENS = readNumber('DEDALO_RAG_CHUNK_MIN_TOKENS');
const DEFAULT_BREAKPOINT = readNumber('DEDALO_RAG_SEMANTIC_BREAKPOINT_THRESHOLD');
const DEFAULT_STRATEGY: ChunkStrategy =
	readString('DEDALO_RAG_CHUNK_STRATEGY') === 'structural' ? 'structural' : 'structural_semantic';

const TC_DETECT = /\[TC_\d{1,2}:\d{1,2}:\d{1,2}(?:\.\d{1,3})?_TC\]/;

export function chunk(text: string, opts: ChunkOpts = {}): Chunk[] {
	const trimmed = text.trim();
	if (trimmed === '') return [];

	const strategy = opts.strategy ?? DEFAULT_STRATEGY;
	const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
	const minTokens = opts.minTokens ?? DEFAULT_MIN_TOKENS;
	const documentTitle = opts.documentTitle ?? '';
	const embedder = opts.embedder;
	const threshold = opts.breakpointThreshold ?? DEFAULT_BREAKPOINT;

	let mode: ChunkMode = opts.mode ?? 'auto';
	if (mode === 'auto') mode = detectMode(trimmed, maxTokens);

	const units =
		mode === 'transcription'
			? parseTranscriptionUnits(trimmed, opts.mediaTipo ?? null)
			: parseDocumentUnits(trimmed);

	const chunks: Chunk[] = [];
	let index = 0;
	for (const unit of units) {
		const segments = segmentUnit(
			unit.text,
			strategy === 'structural_semantic' ? embedder : undefined,
			threshold,
		);
		const packed = packSegments(segments, maxTokens, minTokens);

		for (const pieceText of packed) {
			const raw = pieceText.trim();
			if (raw === '') continue;
			const embedText = buildEmbedText(documentTitle, unit.headingPath, raw);
			chunks.push({
				chunkIndex: index,
				text: raw,
				embedText,
				sourceHash: createHash('sha256').update(`${CHUNKER_VERSION}|${embedText}`).digest('hex'),
				tokenCount: estimateTokens(raw),
				sourceKind: unit.sourceKind,
				parentKey: unit.parentKey,
				chunkMeta: unit.meta,
			});
			index++;
		}
	}

	return chunks;
}

/** short | transcription | long_document */
export function detectMode(text: string, maxTokens: number): ChunkMode {
	if (TC_DETECT.test(text)) return 'transcription';
	if (estimateTokens(text) <= maxTokens) return 'short';
	return 'long_document';
}

/**
 * Split a document into structural units a chunk must not cross: heading
 * sections (carrying the heading path), with page markers recorded. Headings are
 * [h1]..[h6] line prefixes; paragraphs are blank-line-separated within a heading.
 */
export function parseDocumentUnits(text: string): StructuralUnit[] {
	const lines = text.split(/\r\n|\r|\n/u);
	const units: StructuralUnit[] = [];

	let currentHeadingPath: Array<string | undefined> = [];
	let currentPage: number | null = null;
	let buffer = '';
	let bufferCharStart = 0;
	let charCursor = 0;

	const flush = (): void => {
		const body = buffer.trim();
		if (body !== '') {
			const headingPath = currentHeadingPath.filter((s): s is string => !!s).join(' › ');
			units.push({
				sourceKind: 'text',
				headingPath,
				parentKey: headingPath !== '' ? md5(headingPath) : null,
				meta: {
					heading: currentHeadingPath[currentHeadingPath.length - 1] ?? null,
					page: currentPage,
					charStart: bufferCharStart,
				},
				text: body,
			});
		}
		buffer = '';
	};

	for (const line of lines) {
		const lineLen = [...line].length + 1; // + newline

		const pm = /\[page-n-(\d+)\]/.exec(line);
		if (pm) {
			currentPage = Number.parseInt(pm[1] as string, 10);
			charCursor += lineLen;
			continue;
		}

		const hm = /^\s*\[h([1-6])\]\s*(.+?)\s*$/u.exec(line);
		if (hm) {
			flush();
			const level = Number.parseInt(hm[1] as string, 10);
			const title = (hm[2] as string).trim();
			currentHeadingPath = currentHeadingPath.slice(0, level - 1);
			currentHeadingPath[level - 1] = title;
			bufferCharStart = charCursor + lineLen;
			charCursor += lineLen;
			continue;
		}

		if (line.trim() === '') {
			buffer += '\n';
			charCursor += lineLen;
			continue;
		}

		if (buffer === '') bufferCharStart = charCursor;
		buffer += `${line}\n`;
		charCursor += lineLen;
	}
	flush();

	if (units.length === 0) {
		units.push({
			sourceKind: 'text',
			headingPath: '',
			parentKey: null,
			meta: { heading: null, page: null, charStart: 0 },
			text: text.trim(),
		});
	}

	return units;
}

/**
 * Split a timecoded transcription into structural units, one per [TC_..._TC]
 * turn, carrying tc_in/tc_out provenance. Packing regroups consecutive turns
 * within token budget downstream.
 */
export function parseTranscriptionUnits(text: string, mediaTipo: string | null): StructuralUnit[] {
	const re = /\[TC_(\d{1,2}:\d{1,2}:\d{1,2}(?:\.\d{1,3})?)_TC\]/g;
	const matches: Array<{ tc: string; start: number; end: number }> = [];
	let m: RegExpExecArray | null;
	// biome-ignore lint/suspicious/noAssignInExpressions: standard regex-loop idiom.
	while ((m = re.exec(text)) !== null) {
		matches.push({ tc: m[1] as string, start: m.index, end: m.index + m[0].length });
	}

	if (matches.length === 0) {
		return [
			{
				sourceKind: 'av_transcript',
				headingPath: '',
				parentKey: null,
				meta: { tcIn: null, tcOut: null, mediaTipo },
				text: text.trim(),
			},
		];
	}

	const units: StructuralUnit[] = [];
	for (let i = 0; i < matches.length; i++) {
		const cur = matches[i] as { tc: string; start: number; end: number };
		const next = matches[i + 1];
		const bodyEnd = next ? next.start : text.length;
		const body = text.substring(cur.end, bodyEnd).trim();
		const tcOut = next ? next.tc : null;
		if (body === '') continue;
		units.push({
			sourceKind: 'av_transcript',
			headingPath: '',
			parentKey: mediaTipo ? `av:${mediaTipo}` : null,
			meta: { tcIn: cur.tc, tcOut, mediaTipo },
			text: body,
		});
	}
	return units;
}

/**
 * Split a unit's text into semantic segments. With an embedder, breaks at the
 * cosine-distance percentile over consecutive sentences; without one, returns
 * the whole unit (structural-only).
 */
export function segmentUnit(
	text: string,
	embedder: ChunkEmbedder | undefined,
	threshold: number,
): string[] {
	const sentences = splitSentences(text);
	if (sentences.length <= 1 || !embedder) return [text.trim()];

	const vectors = embedder(sentences);
	if (!Array.isArray(vectors) || vectors.length !== sentences.length) {
		return [text.trim()]; // embedder failed → structural-only
	}

	const distances: number[] = [];
	for (let i = 0; i < sentences.length - 1; i++) {
		distances.push(cosineDistance(vectors[i] as number[], vectors[i + 1] as number[]));
	}
	if (distances.length === 0) return [text.trim()];

	const cut = percentile(distances, threshold);

	const segments: string[] = [];
	let current: string[] = [sentences[0] as string];
	for (let i = 0; i < distances.length; i++) {
		if ((distances[i] as number) > cut) {
			segments.push(current.join(' ').trim());
			current = [];
		}
		current.push(sentences[i + 1] as string);
	}
	if (current.length > 0) segments.push(current.join(' ').trim());

	return segments.filter((s) => s !== '');
}

/**
 * Greedily pack segments toward max_tokens. A trailing chunk below min_tokens is
 * merged back into the previous (orphan absorption / double-merge). An oversize
 * single segment is hard-split on sentence boundaries.
 */
export function packSegments(segments: string[], maxTokens: number, minTokens: number): string[] {
	const chunks: string[] = [];
	let current = '';
	let currentTok = 0;

	for (const seg of segments) {
		const segTok = estimateTokens(seg);

		if (segTok > maxTokens) {
			if (current !== '') {
				chunks.push(current);
				current = '';
				currentTok = 0;
			}
			for (const piece of hardSplit(seg, maxTokens)) chunks.push(piece);
			continue;
		}

		if (currentTok + segTok <= maxTokens || current === '') {
			current = current === '' ? seg : `${current}\n${seg}`;
			currentTok += segTok;
		} else {
			chunks.push(current);
			current = seg;
			currentTok = segTok;
		}
	}
	if (current !== '') chunks.push(current);

	// orphan absorption: a final chunk below the floor merges into its prev
	const n = chunks.length;
	if (n >= 2 && estimateTokens(chunks[n - 1] as string) < minTokens) {
		chunks[n - 2] = `${chunks[n - 2] as string}\n${chunks[n - 1] as string}`;
		chunks.pop();
	}

	return chunks;
}

/** Last-resort sentence-boundary split of an oversize segment. */
function hardSplit(text: string, maxTokens: number): string[] {
	const sentences = splitSentences(text);
	const out: string[] = [];
	let cur = '';
	let curTok = 0;
	for (const s of sentences) {
		const t = estimateTokens(s);
		if (curTok + t > maxTokens && cur !== '') {
			out.push(cur);
			cur = s;
			curTok = t;
		} else {
			cur = cur === '' ? s : `${cur} ${s}`;
			curTok += t;
		}
	}
	if (cur !== '') out.push(cur);
	return out;
}

/** Contextual-retrieval header + raw chunk: "{title › heading}\n{raw}". */
export function buildEmbedText(documentTitle: string, headingPath: string, raw: string): string {
	const headerParts = [documentTitle.trim(), headingPath.trim()].filter((s) => s !== '');
	if (headerParts.length === 0) return raw;
	return `${headerParts.join(' › ')}\n${raw}`;
}

/**
 * Lightweight multilingual sentence splitter. Splits on . ! ? and the CJK
 * terminals 。！？ followed by whitespace/end. Good enough to feed semantic
 * segmentation; not a full NLP tokenizer.
 */
export function splitSentences(text: string): string[] {
	const normalised = text.replace(/\s+/gu, ' ').trim();
	if (normalised === '') return [];
	const parts = normalised.split(/(?<=[.!?。！？])\s+/u);
	const out = parts.map((p) => p.trim()).filter((p) => p !== '');
	return out.length === 0 ? [normalised] : out;
}

/**
 * Cheap, language-aware token estimate: max(word-based, char-based) so both
 * space-delimited and dense (CJK) scripts get a conservative estimate.
 */
export function estimateTokens(text: string): number {
	const chars = [...text].length;
	const words = (text.match(/\S+/gu) ?? []).length;
	const byWords = Math.ceil(words * 1.3);
	const byChars = Math.ceil(chars / 4);
	return Math.max(1, byWords, byChars);
}

/** 1 - cosine_similarity (0 = identical, up to 2 = opposite). */
export function cosineDistance(a: number[], b: number[]): number {
	let dot = 0;
	let na = 0;
	let nb = 0;
	const len = Math.min(a.length, b.length);
	for (let i = 0; i < len; i++) {
		const ai = a[i] as number;
		const bi = b[i] as number;
		dot += ai * bi;
		na += ai * ai;
		nb += bi * bi;
	}
	if (na <= 0 || nb <= 0) return 1;
	return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Linear-interpolation percentile of a value list. p in 0..1. */
export function percentile(values: number[], p: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((x, y) => x - y);
	const pp = Math.max(0, Math.min(1, p));
	const rank = pp * (sorted.length - 1);
	const low = Math.floor(rank);
	const high = Math.ceil(rank);
	if (low === high) return sorted[low] as number;
	const frac = rank - low;
	return (sorted[low] as number) + ((sorted[high] as number) - (sorted[low] as number)) * frac;
}

/** md5 hex — used only as a stable structural parent_key, never for security. */
function md5(text: string): string {
	return createHash('md5').update(text).digest('hex');
}
