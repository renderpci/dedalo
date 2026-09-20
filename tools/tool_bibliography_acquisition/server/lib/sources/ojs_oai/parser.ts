import * as cheerio from 'cheerio';
import type { ExtractedPublication } from '../../domain/publication.ts';
import type { ExtractedSeries } from '../../domain/series.ts';
import { cleanText, isIssn, parseDcSourceCitation } from '../../extraction/parser-utils.ts';

interface OaiRecord {
	identifier: string;
	title: string | null;
	creators: string[];
	abstract: string | null;
	publisher: string | null;
	date: string | null;
	sourceValues: string[];
	landingPageUrl: string | null;
}

/** Prefers an English-tagged `xml:lang` value when several language variants are given. */
function pickPreferredText(
	$: cheerio.CheerioAPI,
	els: ReturnType<cheerio.CheerioAPI>,
): string | null {
	let fallback: string | null = null;
	let preferred: string | null = null;
	els.each((_, el) => {
		const text = cleanText($(el).text());
		if (!text) return;
		fallback ??= text;
		const lang = $(el).attr('xml:lang') ?? $(el).attr('lang');
		if (lang && /^en/i.test(lang)) preferred ??= text;
	});
	return preferred ?? fallback;
}

function collectText($: cheerio.CheerioAPI, els: ReturnType<cheerio.CheerioAPI>): string[] {
	const values: string[] = [];
	els.each((_, el) => {
		const text = cleanText($(el).text());
		if (text) values.push(text);
	});
	return values;
}

function parseOaiRecords(xml: string): OaiRecord[] {
	const $ = cheerio.load(xml, { xmlMode: true });
	const records: OaiRecord[] = [];

	$('record').each((_, recordEl) => {
		const record = $(recordEl);
		const header = record.find('header').first();
		if (header.attr('status') === 'deleted') return;

		const identifier = cleanText(header.find('identifier').first().text());
		if (!identifier) return;

		const metadata = record.find('metadata').first();
		const title = pickPreferredText($, metadata.find('dc\\:title'));
		const creators = collectText($, metadata.find('dc\\:creator'));
		const abstract = pickPreferredText($, metadata.find('dc\\:description'));
		const publisher = cleanText(metadata.find('dc\\:publisher').first().text());
		const date = cleanText(metadata.find('dc\\:date').first().text());
		const sourceValues = collectText($, metadata.find('dc\\:source'));
		const identifierValues = collectText($, metadata.find('dc\\:identifier'));
		const landingPageUrl = identifierValues.find((v) => /^https?:\/\//i.test(v)) ?? null;

		records.push({
			identifier,
			title,
			creators,
			abstract,
			publisher,
			date,
			sourceValues,
			landingPageUrl,
		});
	});

	return records;
}

/** The first non-ISSN `dc:source` value is the packed "<journal>; Vol...; pages" citation string. */
function firstCitation(sourceValues: string[]) {
	for (const value of sourceValues) {
		const citation = parseDcSourceCitation(value);
		if (citation) return citation;
	}
	return null;
}

/**
 * OAI-PMH's ListRecords has no separate "journal info" endpoint - like sixbid's API denormalizing
 * auction fields onto every lot, OJS packs the journal name and ISSN onto every record's own
 * `dc:source` values, so the series is derived from the first record rather than a second fetch.
 */
export function parseOaiSeries(xml: string, seriesIdentifier: string): ExtractedSeries {
	const [first] = parseOaiRecords(xml);
	const citation = first ? firstCitation(first.sourceValues) : null;
	const issn = first?.sourceValues.find((v) => isIssn(v)) ?? null;

	return {
		sourceUrl: seriesIdentifier,
		sourceDomain: 'oai-pmh',
		seriesIdentifier,
		name: citation?.seriesName ?? null,
		issn,
		publicationCount: null,
		raw: {},
	};
}

function absoluteUrl(href: string | undefined, baseUrl: string): string | null {
	if (!href) return null;
	try {
		return new URL(href, baseUrl).toString();
	} catch {
		return null;
	}
}

/** The landing page's PDF galley link (`<a class="obj_galley_link pdf">`) - one level short of the
 * real downloadable file, see extractDownloadUrl. */
export function extractGalleyViewUrl(html: string, baseUrl: string): string | null {
	const $ = cheerio.load(html);
	return absoluteUrl($('a.obj_galley_link.pdf').first().attr('href'), baseUrl);
}

/** The galley view page's real file link: `/article/download/{articleId}/{galleyId}/{fileId}`. */
export function extractDownloadUrl(html: string, baseUrl: string): string | null {
	const $ = cheerio.load(html);
	return absoluteUrl($('a[href*="/article/download/"]').first().attr('href'), baseUrl);
}

export function parseOaiPublications(xml: string): ExtractedPublication[] {
	return parseOaiRecords(xml).map((record) => {
		const citation = firstCitation(record.sourceValues);
		return {
			sourceUrl: record.landingPageUrl,
			publicationIdentifier: record.identifier,
			title: record.title,
			authors: record.creators,
			abstract: record.abstract,
			publisher: record.publisher,
			seriesName: citation?.seriesName ?? null,
			seriesNumber: citation?.seriesNumber ?? null,
			pages: citation?.pages ?? null,
			publicationDate: record.date,
			landingPageUrl: record.landingPageUrl,
			pdfUrl: null,
			detailFetched: false,
			raw: { sourceValues: record.sourceValues },
		};
	});
}
