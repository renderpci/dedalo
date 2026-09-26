export interface Lot {
	id: number;
	auctionId: number;
	sourceUrl: string | null;
	lotIdentifier: string;
	lotNumber: string | null;
	title: string | null;
	description: string | null;
	descriptionHtml: string | null;
	category: string | null;
	estimateLow: number | null;
	estimateHigh: number | null;
	startingPrice: number | null;
	realizedPrice: number | null;
	currency: string | null;
	weight: string | null;
	diameter: string | null;
	material: string | null;
	mint: string | null;
	ruler: string | null;
	denomination: string | null;
	datePeriod: string | null;
	condition: string | null;
	referenceNumber: string | null;
	detailFetched: boolean;
	importedAt: string;
	updatedAt: string;
	rawDataJson: string | null;
}

/** Fields extracted from a source, prior to being persisted. */
export interface ExtractedLot {
	sourceUrl: string | null;
	lotIdentifier: string;
	lotNumber: string | null;
	title: string | null;
	description: string | null;
	descriptionHtml: string | null;
	category: string | null;
	estimateLow: number | null;
	estimateHigh: number | null;
	startingPrice: number | null;
	realizedPrice: number | null;
	currency: string | null;
	weight: string | null;
	diameter: string | null;
	material: string | null;
	mint: string | null;
	ruler: string | null;
	denomination: string | null;
	datePeriod: string | null;
	condition: string | null;
	referenceNumber: string | null;
	/** true when extracted from a full lot detail page rather than a listing card. */
	detailFetched: boolean;
	images: ExtractedImage[];
	raw: Record<string, unknown>;
}

export interface ExtractedImage {
	sourceUrl: string;
	order: number;
	width: number | null;
	height: number | null;
}
