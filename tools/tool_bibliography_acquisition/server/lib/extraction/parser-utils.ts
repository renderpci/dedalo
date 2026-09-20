export const PARSER_VERSION = '1.0.0';

/** Collapse whitespace and trim; returns null for empty results. */
export function cleanText(input: string | null | undefined): string | null {
	if (!input) return null;
	const cleaned = input.replace(/\s+/g, ' ').trim();
	return cleaned.length > 0 ? cleaned : null;
}

/** Extracts a query parameter's value from a URL. */
export function getQueryParam(url: string, key: string): string | null {
	try {
		return new URL(url).searchParams.get(key);
	} catch {
		return null;
	}
}

/** OAI-PMH `dc:date` is typically "YYYY", "YYYY-MM" or "YYYY-MM-DD" - never a full timestamp. */
export interface ParsedDcDate {
	year: number;
	month: number;
	day: number;
}

export function parseDcDate(text: string | null | undefined): ParsedDcDate | null {
	const cleaned = cleanText(text);
	if (!cleaned) return null;
	const match = cleaned.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
	if (!match) return null;
	const year = Number(match[1]);
	if (!Number.isFinite(year)) return null;
	return { year, month: match[2] ? Number(match[2]) : 1, day: match[3] ? Number(match[3]) : 1 };
}

const ISSN_PATTERN = /^\d{4}-\d{3}[\dXx]$/;

export function isIssn(text: string): boolean {
	return ISSN_PATTERN.test(text.trim());
}

export interface ParsedCitation {
	seriesName: string | null;
	seriesNumber: string | null;
	pages: string | null;
}

/** OJS's `dc:source` packs journal name, volume/issue, and page range into one semicolon-separated
 * string, e.g. "SAGVNTVM. Papeles...; Vol. 43 (2011); 177-192". A journal's ISSN sometimes arrives
 * as its own separate `dc:source` value instead - `isIssn` lets the caller skip those. */
export function parseDcSourceCitation(text: string | null | undefined): ParsedCitation | null {
	const cleaned = cleanText(text);
	if (!cleaned || isIssn(cleaned)) return null;

	const parts = cleaned
		.split(';')
		.map((p) => p.trim())
		.filter(Boolean);
	const seriesName = parts[0] ?? null;
	const issueText = parts[1] ?? null;
	const pages = parts[2] && /^\d+\s*-\s*\d+$/.test(parts[2]) ? parts[2] : null;

	let seriesNumber: string | null = null;
	if (issueText) {
		const volMatch = issueText.match(/(?:Vol\.?|Núm\.?|No\.?)\s*([^\s(),;]+)/i);
		seriesNumber = volMatch?.[1] ?? issueText;
	}

	return { seriesName, seriesNumber, pages };
}

/** OAI-PMH `dc:creator` values are already "Surname, Given name" - Dédalo's own People convention. */
export function splitAuthorName(raw: string): { surname: string; givenName: string | null } {
	const cleaned = cleanText(raw) ?? raw.trim();
	const commaIdx = cleaned.indexOf(',');
	if (commaIdx === -1) return { surname: cleaned, givenName: null };
	return {
		surname: cleaned.slice(0, commaIdx).trim(),
		givenName: cleaned.slice(commaIdx + 1).trim() || null,
	};
}
