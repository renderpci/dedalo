export type AuctionStatus = 'upcoming' | 'live' | 'closed' | 'unknown';

export interface Auction {
	id: number;
	sourceUrl: string;
	sourceDomain: string;
	auctionIdentifier: string;
	auctionHouse: string | null;
	title: string | null;
	auctionNumber: string | null;
	description: string | null;
	location: string | null;
	startDate: string | null;
	endDate: string | null;
	status: AuctionStatus;
	lotCount: number | null;
	importedAt: string;
	updatedAt: string;
	acquisitionMethod: string;
	rawSourcePath: string | null;
}

/** Fields extracted from a source, prior to being persisted (no id/timestamps yet). */
export interface ExtractedAuction {
	sourceUrl: string;
	sourceDomain: string;
	auctionIdentifier: string;
	auctionHouse: string | null;
	title: string | null;
	auctionNumber: string | null;
	description: string | null;
	location: string | null;
	startDate: string | null;
	endDate: string | null;
	status: AuctionStatus;
	lotCount: number | null;
	categories: Array<{ id: string; name: string; count: number | null }>;
	raw: Record<string, unknown>;
}
