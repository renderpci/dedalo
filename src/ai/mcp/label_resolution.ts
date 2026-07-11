/**
 * Name→tipo resolution — the "never guess a tipo" machinery (review doc §2).
 *
 * An LLM knows sections and fields by their human labels ("People", "Name",
 * "Surname"); the engines only speak tipos. This module resolves labels to
 * ranked tipo candidates over the ontology census / a section's field list,
 * accent- and case-insensitively, and NEVER auto-picks among ambiguous
 * matches: callers surface the candidates (label_ambiguous / a ranked list)
 * so the model chooses explicitly. Resolution reads the cached resolver layer
 * only — no direct SQL here.
 */

import { isValidTipo } from '../../core/concepts/ontology.ts';
import { listSectionNodes } from '../../core/ontology/resolver.ts';

/** One ranked resolution candidate. */
export interface LabelCandidate {
	tipo: string;
	/** The label that matched (in the matched language). */
	label: string;
	/** Which language key of the term matched. */
	lang: string;
	/** 0 = exact normalized match, 1 = prefix, 2 = substring. */
	rank: 0 | 1 | 2;
}

/**
 * Normalize a label for matching: NFD-decompose and strip combining marks
 * (accent-insensitive), lowercase, collapse inner whitespace. "Historia oral"
 * ≡ "história  ORAL".
 */
export function normalizeLabel(value: string): string {
	return (
		value
			.normalize('NFD')
			// biome-ignore lint/suspicious/noMisleadingCharacterClass: stripping combining marks after NFD is the point
			.replace(/[̀-ͯ]/g, '')
			.toLowerCase()
			.trim()
			.replace(/\s+/g, ' ')
	);
}

/**
 * Match one multilingual term object against a normalized query. Returns the
 * best (lowest-rank) match across the term's languages, or null.
 */
export function matchTerm(
	term: Record<string, string> | null | undefined,
	normalizedQuery: string,
): { label: string; lang: string; rank: 0 | 1 | 2 } | null {
	if (term === null || term === undefined) return null;
	let best: { label: string; lang: string; rank: 0 | 1 | 2 } | null = null;
	for (const [lang, label] of Object.entries(term)) {
		if (typeof label !== 'string' || label === '') continue;
		const normalized = normalizeLabel(label);
		let rank: 0 | 1 | 2;
		if (normalized === normalizedQuery) rank = 0;
		else if (normalized.startsWith(normalizedQuery)) rank = 1;
		else if (normalized.includes(normalizedQuery)) rank = 2;
		else continue;
		if (best === null || rank < best.rank) best = { label, lang, rank };
		if (best.rank === 0) break;
	}
	return best;
}

/** Rank-then-tipo comparator for stable candidate lists. */
export function compareCandidates(a: LabelCandidate, b: LabelCandidate): number {
	if (a.rank !== b.rank) return a.rank - b.rank;
	return a.tipo < b.tipo ? -1 : a.tipo > b.tipo ? 1 : 0;
}

/**
 * Resolve a section reference: a valid tipo passes through unchanged; anything
 * else is matched against the section census labels. Returns ALL candidates in
 * rank order — the caller decides what one/none/many means for its tool.
 */
export async function resolveSectionCandidates(reference: string): Promise<LabelCandidate[]> {
	if (isValidTipo(reference)) {
		return [{ tipo: reference, label: reference, lang: '', rank: 0 }];
	}
	const normalized = normalizeLabel(reference);
	if (normalized === '') return [];
	const candidates: LabelCandidate[] = [];
	for (const node of await listSectionNodes()) {
		const match = matchTerm(node.term, normalized);
		if (match !== null) candidates.push({ tipo: node.tipo, ...match });
	}
	return candidates.sort(compareCandidates);
}

/**
 * Resolve a field reference against a prepared field list (tipo + term pairs,
 * e.g. a section's component subtree). Same pass-through/ranking contract as
 * resolveSectionCandidates.
 */
export function resolveFieldCandidates(
	reference: string,
	fields: { tipo: string; term: Record<string, string> | null }[],
): LabelCandidate[] {
	if (isValidTipo(reference)) {
		return [{ tipo: reference, label: reference, lang: '', rank: 0 }];
	}
	const normalized = normalizeLabel(reference);
	if (normalized === '') return [];
	const candidates: LabelCandidate[] = [];
	for (const field of fields) {
		const match = matchTerm(field.term, normalized);
		if (match !== null) candidates.push({ tipo: field.tipo, ...match });
	}
	return candidates.sort(compareCandidates);
}

/**
 * Collapse a candidate list to exactly one EXACT match when it is unambiguous:
 * one rank-0 candidate wins even when looser (prefix/substring) matches exist;
 * several rank-0 candidates are ambiguous. Returns null when there is no safe
 * single answer — the caller surfaces the candidates instead of guessing.
 */
export function pickUnambiguous(candidates: LabelCandidate[]): LabelCandidate | null {
	const exact = candidates.filter((candidate) => candidate.rank === 0);
	if (exact.length === 1) return exact[0] ?? null;
	if (exact.length === 0 && candidates.length === 1) return candidates[0] ?? null;
	return null;
}
