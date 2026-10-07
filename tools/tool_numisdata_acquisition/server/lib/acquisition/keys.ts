/**
 * Pure key derivations for commit_lots' URL dedup: each source's CANONICAL lot URL, rebuilt from
 * the lot's own identity (SourceAdapter.canonicalLotUrl). No I/O, no engine imports - unit-tested
 * directly by test/unit/tool_numisdata_acquisition_keys.test.ts.
 *
 * Why rebuilt, never the scraped href: one lot used to reach the dedup under several spellings (a
 * pasted URL vs the listing card's href, tracking params, `www.`, http vs https), each its own
 * key - so a re-commit duplicated it; and a broken card href ("#") resolves to the LISTING page,
 * which every lot of that listing then shared as its "own" URL - across batches, where no in-batch
 * check sees it, so a different lot was silently skipped as "already imported". A key rebuilt from
 * the lot's id fields has exactly one spelling, and a lot whose id cannot be established gets NO
 * key (null), never a shared one.
 *
 * Every builder fails CLOSED: any field missing, malformed, or contradicting another (the lot
 * URL's id segment against the parsed lotIdentifier) gives null, and the lot falls back to the
 * (Auction, lot number) dedup alone. The canonical forms are each source's own single-lot URL
 * grammar, so the adapter's parseAuctionIdentifier reads one back as that same lot.
 *
 * The Entity name lock is NOT here any more: its key is folded in SQL by the search's own
 * function (index.ts acquireDedupLock), so it can never be finer than the '==' equality.
 */

import { parseBiddrSingleLotUrl } from '../sources/biddr/identifiers.ts';
import { parseNumisbidsLotUrl } from '../sources/numisbids/acquisition.ts';
import { parseSixbidLotUrl } from '../sources/sixbid/api.ts';
import type { LotKeyFields } from '../sources/types.ts';

const DIGITS = /^\d+$/;

/** A non-empty trimmed string, or null for anything else (commit_lots' lots are client-sent). */
function nonEmptyString(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed === '' ? null : trimmed;
}

/** The single capture of `pattern` against the lot's identifier, or null. */
function identifierPart(lot: LotKeyFields, pattern: RegExp): RegExpMatchArray | null {
	const identifier = nonEmptyString(lot.lotIdentifier);
	return identifier === null ? null : identifier.match(pattern);
}

/**
 * jesusvico: identity is (auction number, lot number), both carried by the parsed lotIdentifier
 * `jesusvico:<auction>:<lot>` (the auction from the listing/lot page URL, the lot from the card's
 * own "Lot N" text - never the card's href). An empty auction part (a listing URL with no
 * `I<n>` segment) gives no key.
 */
export function jesusvicoCanonicalLotUrl(lot: LotKeyFields): string | null {
	const match = identifierPart(lot, /^jesusvico:(\d+):(\d+[A-Za-z]*)$/);
	if (match === null) return null;
	return `https://www.jesusvico.com/lote/I${match[1]}/${match[2]}`;
}

/**
 * biddr: identity is the lot id (`l`, which the parser stores as lotIdentifier) under its auction
 * (`a`). The auction id is read from the lot's own URL, and only when that URL's `l` IS this lot's
 * identifier - a listing/search URL (no `l`), or a URL naming another lot, gives no key.
 */
export function biddrCanonicalLotUrl(lot: LotKeyFields): string | null {
	const lotId = identifierPart(lot, /^(\d+)$/)?.[1];
	const sourceUrl = nonEmptyString(lot.sourceUrl);
	if (lotId === undefined || sourceUrl === null) return null;
	const parsed = parseBiddrSingleLotUrl(sourceUrl);
	if (parsed === null || parsed.lotId !== lotId || !DIGITS.test(parsed.auctionId)) return null;
	return `https://www.biddr.com/auction?a=${parsed.auctionId}&l=${lotId}`;
}

/**
 * numisbids: identity is (sale, sale-scoped lot number) - the site's own `/sale/{id}/lot/{n}` lot
 * page. Requires the parsed lot's internal id (`numisbids:<lid>`, so an id-less card never keys)
 * and a lot URL in that grammar (a listing `/sale/{id}` never parses); when the lot carries its own
 * parsed lot number it must agree with the URL's.
 */
export function numisbidsCanonicalLotUrl(lot: LotKeyFields): string | null {
	if (identifierPart(lot, /^numisbids:(\d+)$/) === null) return null;
	const sourceUrl = nonEmptyString(lot.sourceUrl);
	if (sourceUrl === null) return null;
	const parsed = parseNumisbidsLotUrl(sourceUrl);
	if (parsed === null) return null;
	const lotNumber = nonEmptyString(lot.lotNumber);
	if (lotNumber !== null && lotNumber !== parsed.lotNumber) return null;
	return `https://www.numisbids.com/sale/${parsed.saleId}/lot/${parsed.lotNumber}`;
}

/**
 * sixbid: identity is the API's global lotId (`sixbid:<lotId>`), under its company/auction - read
 * from the lot's URL only when that URL's lot segment IS this lotId. The category and lot slugs
 * are display text, not identity, and are dropped.
 */
export function sixbidCanonicalLotUrl(lot: LotKeyFields): string | null {
	const lotId = identifierPart(lot, /^sixbid:(\d+)$/)?.[1];
	const sourceUrl = nonEmptyString(lot.sourceUrl);
	if (lotId === undefined || sourceUrl === null) return null;
	const parsed = parseSixbidLotUrl(sourceUrl);
	if (parsed === null || parsed.lotId !== lotId || !/^[a-z0-9-]+$/i.test(parsed.companySlug)) {
		return null;
	}
	return `https://www.sixbid.com/en/${parsed.companySlug.toLowerCase()}/${parsed.auctionId}/${lotId}`;
}
