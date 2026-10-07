/**
 * Pure URL-identifier parsing for biddr.com — split out of acquisition.ts so that both
 * acquisition.ts (needs them to resolve what to fetch) and auction-parser.ts (needs them to label
 * a parsed auction) can import them without creating a two-file import cycle
 * (acquisition.ts -> auction-parser.ts -> acquisition.ts, review item: import_scc_tripwire, PR #114
 * 2026-10-06 follow-up). No network, no DedaloError — just string parsing + a hash.
 */

import { createHash } from 'node:crypto';

/**
 * Validates a Biddr single-lot URL (`biddr.com/{house}/auction?a=...&l=...`). Requires BOTH `a`
 * and `l` - a plain `?a=...` with no `l` is a full auction listing, not this.
 */
export function parseBiddrSingleLotUrl(
	rawUrl: string,
): { auctionId: string; lotId: string } | null {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return null;
	}
	if (!/biddr\.com$/i.test(url.hostname)) return null;
	const auctionId = url.searchParams.get('a');
	const lotId = url.searchParams.get('l');
	if (!auctionId || !lotId) return null;
	return { auctionId, lotId };
}

/**
 * A stable identifier for a single-lot retrieval, distinct from the full auction's own numeric id
 * - otherwise pasting a single-lot URL would make a later full-auction retrieval look like it
 * already exists.
 */
export function biddrSingleLotIdentifier(rawUrl: string): string | null {
	const parsed = parseBiddrSingleLotUrl(rawUrl);
	return parsed ? `lot-${parsed.lotId}` : null;
}

/**
 * Validates a Biddr search-results URL (`biddr.com/search?s=...&c=...&pf=...&pt=...&pc=...`) and
 * returns its query params, or null if this isn't a search URL. The unit of retrieval here is a
 * search spanning however many auctions matched, not one complete auction.
 */
export function parseBiddrSearchUrl(rawUrl: string): URLSearchParams | null {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return null;
	}
	if (!/biddr\.com$/i.test(url.hostname)) return null;
	if (url.pathname !== '/search') return null;
	return url.searchParams;
}

/**
 * A stable, deterministic identifier for a search (dedupe + on-disk storage key) - a hash of the
 * normalized, sorted query string, since search terms can contain unicode unsafe for a directory
 * name.
 */
export function biddrSearchIdentifier(rawUrl: string): string | null {
	const params = parseBiddrSearchUrl(rawUrl);
	if (!params) return null;
	const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
	const normalized = new URLSearchParams(sorted).toString();
	return createHash('sha256').update(normalized, 'utf-8').digest('hex').slice(0, 16);
}
