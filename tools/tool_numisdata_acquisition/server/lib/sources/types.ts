import type { ExtractedAuction } from '../domain/auction.ts';
import type { AcquisitionMethod } from '../domain/image.ts';
import type { ExtractedLot } from '../domain/lot.ts';

/**
 * One fetched page, in the shape every parser already expects. Built from a
 * `HarvestResponse` (src/core/harvest/harvest.ts) at the acquisition layer -
 * kept as its own type rather than passing HarvestResponse straight through,
 * so the parsers stay decoupled from the harvesting door's own response shape.
 */
export interface RawSource {
	html: string;
	finalUrl: string;
	httpStatus: number;
	contentType: string | null;
}

export interface MultiPageAcquisition {
	auctionIdentifier: string;
	pages: RawSource[];
	method: AcquisitionMethod;
}

/** Called after each page is fetched, with the page just completed and the total known so far.
 * `message`, when present, overrides the default "page X of Y" text - used to surface the
 * harvesting door's own `onWait` pacing/robots notices instead of a page count. */
export type AcquisitionProgress = (
	currentPage: number,
	totalPages: number,
	message?: string,
) => void;

/**
 * The lot fields a canonical lot URL is rebuilt from. `unknown`, not ExtractedLot's own types:
 * commit_lots receives the lots back from the client, so every field is re-validated by the
 * adapter rather than trusted to still have its parsed shape.
 */
export interface LotKeyFields {
	lotIdentifier: unknown;
	lotNumber: unknown;
	sourceUrl: unknown;
}

/**
 * One implementation per acquisition source (Biddr, sixbid, ...). ingestion-service.ts picks the
 * matching adapter for a pasted URL and drives Retrieve/Refresh/Reimport through it generically
 * instead of hardcoding a single source.
 */
export interface SourceAdapter {
	id: string;
	/** Matches the DB's `auctions.source_domain` column for this source. */
	sourceDomain: string;
	/**
	 * The lot's CANONICAL page URL - commit_lots' auction-independent dedup key, stored in
	 * numisdata4's URI field and matched/locked on. Rebuilt from THIS source's own lot identity
	 * (the parsed lot's id fields: lotIdentifier, lotNumber, the id segments of its own lot URL),
	 * in one fixed https form - never the href as scraped, so a pasted URL, a card href, tracking
	 * params, `www.` or http/https all give the SAME key for one lot. Null whenever the lot's own
	 * id cannot be established (missing identifier, or a URL that does not name a lot - e.g. a
	 * broken card href resolving to the listing page): such a lot gets no URL key at all, never a
	 * shared one. Absent for a source with no per-lot identity URL (aureo).
	 */
	canonicalLotUrl?(lot: LotKeyFields): string | null;
	matchesUrl(rawUrl: string): boolean;
	/** Extracted synchronously from the URL alone (no network) - used for the dedupe fast path. */
	parseAuctionIdentifier(rawUrl: string): string | null;
	/**
	 * Fetches every page belonging to the auction at this URL, reporting page-by-page progress.
	 * numisbids and sixbid cannot be fetched automatically at all (both sites' robots.txt refuses
	 * every agent) - their adapters throw here with a clear message pointing at preview_html instead.
	 */
	acquire(rawUrl: string, onProgress?: AcquisitionProgress): Promise<MultiPageAcquisition>;
	parseAuction(firstPage: RawSource, sourceUrl: string): ExtractedAuction;
	parseLots(page: RawSource, sourceUrl: string): ExtractedLot[];
	/**
	 * Key for the on-disk raw-source directory (data/sources/auctions/<key>/). Must be unique
	 * across sources - it's keyed purely off this string, not the source domain, so two sources'
	 * own auction-identifier numbering spaces could otherwise collide on disk.
	 */
	storageKey(auctionIdentifier: string): string;
}

export function urlHostname(rawUrl: string): string | null {
	try {
		return new URL(rawUrl).hostname.toLowerCase();
	} catch {
		return null;
	}
}
