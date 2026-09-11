export const PARSER_VERSION = '1.0.0';

/** Collapse whitespace and trim; returns null for empty results. */
export function cleanText(input: string | null | undefined): string | null {
	if (!input) return null;
	const cleaned = input.replace(/\s+/g, ' ').trim();
	return cleaned.length > 0 ? cleaned : null;
}

/** Keep newlines (for multi-line descriptions) but collapse runs of spaces/tabs and trim each line. */
export function cleanMultilineText(input: string | null | undefined): string | null {
	if (!input) return null;
	const cleaned = input
		.split('\n')
		.map((line) => line.replace(/[ \t]+/g, ' ').trim())
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	return cleaned.length > 0 ? cleaned : null;
}

export interface ParsedPrice {
	amount: number;
	currency: string | null;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
	'€': 'EUR',
	$: 'USD',
	'£': 'GBP',
	'¥': 'JPY',
	CHF: 'CHF',
};

/**
 * Some sources (numisbids' large-amount display, e.g. "250 000 USD") use a narrow no-break space
 * (U+202F, which JS's `\s` already matches, same as a plain space or U+00A0) as a thousands
 * separator rather than "," - confirmed live on a six-figure lot, where the digit-matching regexes
 * below would otherwise only capture the last group ("000"), silently turning 250000 into 0.
 * Strips whitespace specifically *between two digits* (never elsewhere, so the required space
 * before a currency code, or the " - " in a range, is untouched) before any amount regex runs.
 */
export function stripDigitGroupingSpaces(text: string): string {
	return text.replace(/(\d)\s+(?=\d)/g, '$1');
}

/**
 * Parses a price string as found on Biddr, e.g. "125 EUR", "20 GBP", "€1,250", "50 GBP".
 * Biddr consistently renders amount + ISO currency code, but we tolerate symbols too.
 */
export function parsePrice(text: string | null | undefined): ParsedPrice | null {
	if (!text) return null;
	const cleaned = cleanText(text);
	if (!cleaned) return null;
	const normalized = stripDigitGroupingSpaces(cleaned);

	// "1,234.56 EUR" / "1234 GBP"
	const codeMatch = normalized.match(/([\d.,]+)\s*([A-Z]{3})\b/);
	if (codeMatch) {
		const amount = parseAmount(codeMatch[1]!);
		if (amount === null) return null;
		return { amount, currency: codeMatch[2]! };
	}

	// Symbol-prefixed, e.g. "€1,250"
	const symbolMatch = normalized.match(/(€|\$|£|¥)\s*([\d.,]+)/);
	if (symbolMatch) {
		const amount = parseAmount(symbolMatch[2]!);
		if (amount === null) return null;
		return { amount, currency: CURRENCY_SYMBOLS[symbolMatch[1]!] ?? null };
	}

	return null;
}

export interface ParsedPriceRange {
	low: number | null;
	high: number | null;
	currency: string | null;
}

/** Parses an estimate that may be a single value ("50 GBP") or a range ("500 - 700 GBP"). */
export function parsePriceRange(text: string | null | undefined): ParsedPriceRange | null {
	if (!text) return null;
	const cleaned = cleanText(text);
	if (!cleaned) return null;
	const normalized = stripDigitGroupingSpaces(cleaned);

	const rangeMatch = normalized.match(/([\d.,]+)\s*[-–—]\s*([\d.,]+)\s*([A-Z]{3})?/);
	if (rangeMatch) {
		const low = parseAmount(rangeMatch[1]!);
		const high = parseAmount(rangeMatch[2]!);
		if (low !== null && high !== null) {
			return { low, high, currency: rangeMatch[3] ?? null };
		}
	}

	const single = parsePrice(cleaned);
	if (single) return { low: single.amount, high: single.amount, currency: single.currency };
	return null;
}

function parseAmount(raw: string): number | null {
	// Biddr uses "," as a thousands separator and "." as decimal, e.g. "1,234.56".
	const normalized = raw.replace(/,/g, '');
	const value = Number.parseFloat(normalized);
	return Number.isFinite(value) ? value : null;
}

/**
 * Parses a price in the European convention (e.g. jesusvico.com's "6.000 €", "1.234,56 €") -
 * "." as thousands separator, "," as decimal, symbol after the amount. Kept separate from
 * parsePrice (Biddr/sixbid's "1,234.56 EUR" convention) deliberately: a round amount like "6.000"
 * means 6000 in this convention and 6.0 in the other, so a single merged parser would silently
 * misparse one source or the other depending on which won a shared regex.
 */
export function parseEuropeanPrice(text: string | null | undefined): ParsedPrice | null {
	if (!text) return null;
	const cleaned = cleanText(text);
	if (!cleaned) return null;

	const match = cleaned.match(/([\d.]+(?:,\d+)?)\s*(€|\$|£|¥|CHF)/);
	if (!match) return null;

	const amount = parseEuropeanAmount(match[1]!);
	if (amount === null) return null;
	return { amount, currency: CURRENCY_SYMBOLS[match[2]!] ?? null };
}

function parseEuropeanAmount(raw: string): number | null {
	// "6.000" -> 6000, "1.234,56" -> 1234.56
	const normalized = raw.replace(/\./g, '').replace(',', '.');
	const value = Number.parseFloat(normalized);
	return Number.isFinite(value) ? value : null;
}

/** Extracts "Weight: 7.68g." style fields from free-text lot descriptions. */
export function extractWeight(text: string | null | undefined): string | null {
	if (!text) return null;
	const match = text.match(/weight[:\s]*([\d.,]+\s*(?:g|gr|grams?|grammes?|kg))\b/i);
	return match ? match[1]!.trim() : null;
}

export function extractDiameter(text: string | null | undefined): string | null {
	if (!text) return null;
	const match = text.match(/diameter[:\s]*([\d.,]+\s*mm)\b/i);
	return match ? match[1]!.trim() : null;
}

const KNOWN_MATERIALS = [
	'gold',
	'silver',
	'bronze',
	'copper',
	'billon',
	'electrum',
	'nickel',
	'brass',
	'lead',
	'tin',
	'platinum',
	'orichalcum',
	'potin',
	'aluminium',
	'aluminum',
	'cupro-nickel',
	'copper-nickel',
];

/** Extracts material/composition, preferring an explicit "Composition:"/"Metal:" label over a keyword guess. */
export function extractMaterial(text: string | null | undefined): string | null {
	if (!text) return null;
	const labelMatch = text.match(
		/(?:composition|metal|material)[:\s]*([a-zA-Z][a-zA-Z\s-]*?)[.,\n]/i,
	);
	if (labelMatch) {
		const value = labelMatch[1]!.trim();
		if (value.length > 0 && value.length < 40) return value;
	}
	const lower = text.toLowerCase();
	for (const material of KNOWN_MATERIALS) {
		if (new RegExp(`\\b${material}\\b`).test(lower)) {
			return material.charAt(0).toUpperCase() + material.slice(1);
		}
	}
	return null;
}

const DENOMINATIONS = [
	'tetradrachm',
	'drachm',
	'obol',
	'stater',
	'hemidrachm',
	'didrachm',
	'denarius',
	'sestertius',
	'solidus',
	'follis',
	'antoninianus',
	'aureus',
	'siliqua',
	'thaler',
	'taler',
	'guinea',
	'sovereign',
	'crown',
	'florin',
	'groat',
	'shilling',
	'penny',
	'pence',
	'farthing',
	'half crown',
	'dollar',
	'dinar',
	'dirham',
	'rupee',
	'franc',
	'reichsmark',
	'ducat',
	'escudo',
	'real',
	'peso',
	'kreuzer',
	'gulden',
	'ruble',
	'rouble',
	'yuan',
	'sen',
	'rial',
];

/** Best-effort denomination guess from a title/description (e.g. "Silver Shilling"). */
export function extractDenomination(text: string | null | undefined): string | null {
	if (!text) return null;
	const lower = text.toLowerCase();
	for (const denom of DENOMINATIONS) {
		const match = lower.match(new RegExp(`\\b${denom.replace(/\s/g, '\\s')}s?\\b`));
		if (match) {
			const word = match[0];
			return word.charAt(0).toUpperCase() + word.slice(1);
		}
	}
	return null;
}

/**
 * Many Biddr coin descriptions start "COUNTRY/ISSUER. Ruler, date-range. ..." e.g.
 * "ENGLAND. Elizabeth I, 1558-1603." This is a heuristic, not guaranteed to match every
 * cataloguing style — callers should treat the result as best-effort.
 */
export function extractRulerAndDate(title: string | null | undefined): {
	ruler: string | null;
	datePeriod: string | null;
} {
	if (!title) return { ruler: null, datePeriod: null };
	const segments = title
		.split('.')
		.map((s) => s.trim())
		.filter(Boolean);
	for (const segment of segments) {
		const match = segment.match(
			/^(.+?),\s*((?:ND|CIRCA|C\.)?\s*\d{1,4}\s*(?:BC|AD)?\s*[-–—]\s*\d{1,4}\s*(?:BC|AD)?|\d{3,4}\s*(?:BC|AD))$/i,
		);
		if (match) {
			return { ruler: match[1]!.trim(), datePeriod: match[2]!.trim() };
		}
	}
	return { ruler: null, datePeriod: null };
}

/**
 * Parses Biddr's timetable phrasing, e.g. "Tuesday, 18 August 2026, from 1:00 PM CEST" or
 * "Tuesday, 11 August 2026, from 2:00 PM CEST". Returns an ISO-ish string when the date portion
 * parses; falls back to the raw text so nothing is lost.
 */
export function parseBiddrDateText(text: string | null | undefined): string | null {
	if (!text) return null;
	const cleaned = cleanText(text);
	if (!cleaned) return null;

	const match = cleaned.match(
		/(\d{1,2}\s+[A-Za-z]+\s+\d{4})(?:,?\s*(?:from\s*)?(\d{1,2}:\d{2}\s*[AP]M))?/,
	);
	if (match) {
		const datePart = match[1]!;
		const timePart = match[2] ?? '';
		const parsed = new Date(`${datePart} ${timePart}`.trim());
		if (!Number.isNaN(parsed.getTime())) {
			return parsed.toISOString();
		}
	}
	return cleaned;
}

/**
 * Parses a European-style date/time (e.g. jesusvico.com's "02/07/2026 11:00 CET") - DD/MM/YYYY,
 * optional HH:MM. Kept separate from parseBiddrDateText (English month names) for the same
 * ambiguity reason as parseEuropeanPrice above.
 */
export function parseEuropeanDateText(text: string | null | undefined): string | null {
	if (!text) return null;
	const cleaned = cleanText(text);
	if (!cleaned) return null;

	const match = cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
	if (!match) return cleaned;

	const [, day, month, year, hour, minute] = match;
	const parsed = new Date(
		Number(year),
		Number(month) - 1,
		Number(day),
		hour ? Number(hour) : 0,
		minute ? Number(minute) : 0,
	);
	return Number.isNaN(parsed.getTime()) ? cleaned : parsed.toISOString();
}

/** Extracts a query parameter's numeric/string value from a Biddr-style URL. */
export function getQueryParam(url: string, key: string): string | null {
	try {
		const parsed = new URL(url, 'https://www.biddr.com');
		return parsed.searchParams.get(key);
	} catch {
		return null;
	}
}
