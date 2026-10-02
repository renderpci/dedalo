/** The journal/collection a batch of publications belongs to - the coin tool's "Auction" equivalent. */
export interface ExtractedSeries {
	sourceUrl: string;
	sourceDomain: string;
	/** Stable id for this journal/collection within its source (e.g. the OAI repository's base URL). */
	seriesIdentifier: string;
	name: string | null;
	issn: string | null;
	publicationCount: number | null;
	raw: Record<string, unknown>;
}
