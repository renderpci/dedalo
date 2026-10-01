import type { ExtractedPublication } from '../domain/publication.ts';
import type { ExtractedSeries } from '../domain/series.ts';

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
	seriesIdentifier: string;
	pages: RawSource[];
	/** Set when a page fetch failed part-way through (real, observed flakiness on some OAI-PMH
	 * hosts near the tail of their record set) - pages gathered before the failure are still
	 * returned rather than discarded. */
	partialError?: string;
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
 * One implementation per acquisition source (OAI-PMH, ...). index.ts picks the matching adapter
 * for a pasted URL and drives preview/commit through it generically instead of hardcoding a
 * single source. Mirrors tool_numisdata_acquisition's SourceAdapter contract exactly.
 */
export interface SourceAdapter {
	id: string;
	sourceDomain: string;
	matchesUrl(rawUrl: string): boolean;
	/** Extracted synchronously from the URL alone (no network) - used for the dedupe fast path. */
	parseSeriesIdentifier(rawUrl: string): string | null;
	/** Fetches every page belonging to the series/listing at this URL, reporting page-by-page progress. */
	acquire(rawUrl: string, onProgress?: AcquisitionProgress): Promise<MultiPageAcquisition>;
	parseSeries(firstPage: RawSource, sourceUrl: string): ExtractedSeries;
	parsePublications(page: RawSource, sourceUrl: string): ExtractedPublication[];
	/**
	 * Key for the on-disk raw-source directory. Must be unique across sources - it's keyed purely
	 * off this string, not the source domain, so two sources' own identifier numbering spaces
	 * could otherwise collide on disk.
	 */
	storageKey(seriesIdentifier: string): string;

	/** Resolves a downloadable PDF URL for one publication, when listing metadata doesn't carry one
	 * directly. Omitted for a source that doesn't need it; returns null rather than throwing. */
	resolvePdfUrl?(landingPageUrl: string): Promise<string | null>;
}

export function urlHostname(rawUrl: string): string | null {
	try {
		return new URL(rawUrl).hostname.toLowerCase();
	} catch {
		return null;
	}
}
