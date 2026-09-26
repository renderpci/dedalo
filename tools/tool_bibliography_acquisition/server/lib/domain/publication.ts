/** One paper/article/publication record, the equivalent of the numismatic tool's "Lot". */
export interface ExtractedPublication {
	sourceUrl: string | null;
	/** Stable id for this record within its source (e.g. the OAI `<identifier>`). */
	publicationIdentifier: string;
	title: string | null;
	authors: string[];
	abstract: string | null;
	publisher: string | null;
	/** Raw `dc:type` values (e.g. "info:eu-repo/semantics/article") - index.ts maps recognized ones
	 * to a real Bibliographic typology thesaurus term; unrecognized ones are left unmatched. */
	types: string[];
	issn: string | null;
	seriesName: string | null;
	seriesNumber: string | null;
	pages: string | null;
	publicationDate: string | null;
	landingPageUrl: string | null;
	pdfUrl: string | null;
	detailFetched: boolean;
	raw: Record<string, unknown>;
}
