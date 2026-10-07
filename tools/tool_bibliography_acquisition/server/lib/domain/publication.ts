/** One paper/article/publication record, the equivalent of the numismatic tool's "Lot". */
export interface ExtractedPublication {
	sourceUrl: string | null;
	/** Stable id for this record within its source (e.g. the OAI `<identifier>`). */
	publicationIdentifier: string;
	title: string | null;
	authors: string[];
	/** The merged (English-preferred) abstract text - kept for callers that just want ONE string. */
	abstract: string | null;
	/** Every `dc:description` language variant, lang names the RAW `xml:lang` attribute (e.g. "en",
	 * "es") - null when the source carried no language tag at all. index.ts maps each to a real
	 * engine lang code and writes it into ITS OWN slot, rather than merging every variant into
	 * whichever one `abstract` happened to prefer (review item: "Abstract language"). */
	abstractVariants: { lang: string | null; text: string }[];
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
