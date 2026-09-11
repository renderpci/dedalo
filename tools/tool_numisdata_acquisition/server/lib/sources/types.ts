import type { RawSource } from '../acquisition/http.ts';
import type { ExtractedAuction } from '../domain/auction.ts';
import type { AcquisitionMethod } from '../domain/image.ts';
import type { ExtractedLot } from '../domain/lot.ts';

export interface MultiPageAcquisition {
	auctionIdentifier: string;
	pages: RawSource[];
	method: AcquisitionMethod;
}

/** Called after each page is fetched, with the page just completed and the total known so far. */
export type AcquisitionProgress = (currentPage: number, totalPages: number) => void;

/**
 * One implementation per acquisition source (Biddr, sixbid, ...). ingestion-service.ts picks the
 * matching adapter for a pasted URL and drives Retrieve/Refresh/Reimport through it generically
 * instead of hardcoding a single source.
 */
export interface SourceAdapter {
	id: string;
	/** Matches the DB's `auctions.source_domain` column for this source. */
	sourceDomain: string;
	matchesUrl(rawUrl: string): boolean;
	/** Throws UnsafeUrlError with a specific reason (https-only, wrong host, private IP, ...). */
	assertSafeUrl(rawUrl: string): URL;
	/** Extracted synchronously from the URL alone (no network) - used for the dedupe fast path. */
	parseAuctionIdentifier(rawUrl: string): string | null;
	/** Fetches every page belonging to the auction at this URL, reporting page-by-page progress. */
	acquire(rawUrl: string, onProgress?: AcquisitionProgress): Promise<MultiPageAcquisition>;
	parseAuction(firstPage: RawSource, sourceUrl: string): ExtractedAuction;
	parseLots(page: RawSource, sourceUrl: string): ExtractedLot[];
	/**
	 * Key used for the on-disk raw-source directory (data/sources/auctions/<key>/), passed to
	 * source-storage.ts. Must be unique across sources - source-storage.ts keys purely off this
	 * string, not the source domain, so two sources' own auction-identifier numbering spaces could
	 * otherwise collide on disk.
	 */
	storageKey(auctionIdentifier: string): string;

	/**
	 * Fetches and parses a single lot's own detail page, for sources whose listing already carries
	 * everything (detailFetched: true, e.g. sixbid) this is omitted entirely - lot-detail-service.ts
	 * only calls it when present. Returns null if the detail page couldn't be parsed.
	 */
	fetchLotDetail?(lotSourceUrl: string): Promise<ExtractedLot | null>;
}

export function urlHostname(rawUrl: string): string | null {
	try {
		return new URL(rawUrl).hostname.toLowerCase();
	} catch {
		return null;
	}
}
