import * as cheerio from 'cheerio';
import type { AuctionStatus, ExtractedAuction } from '../../domain/auction.ts';
import type { ExtractedImage, ExtractedLot } from '../../domain/lot.ts';
import {
	cleanText,
	extractDenomination,
	extractMaterial,
	extractRulerAndDate,
	parseEuropeanDateText,
	parseEuropeanPrice,
} from '../../extraction/parser-utils.ts';
import {
	jesusvicoLotIdentifier,
	parseJesusvicoAuctionNumber,
	parseJesusvicoLotNumber,
} from './acquisition.ts';

function absoluteUrl(href: string | undefined | null, base: string): string | null {
	if (!href) return null;
	try {
		return new URL(href, base).toString();
	} catch {
		return null;
	}
}

/**
 * jesusvico serves every lot photo through a "/thumbs/838/" bucket by default (838px wide) - but
 * that's still just a thumbnail. The real, full-resolution original lives at the exact same path
 * with "thumbs/838/" removed (confirmed live: 838x425px/~84KB thumbnail vs. 2659x1350px/~1.3MB
 * original for the same photo, byte-identical aside from resolution). Previously stored the
 * thumbnail directly - this strips the bucket segment so every jesusvico image is the original.
 */
function toFullResolutionUrl(url: string): string {
	return url.replace(/\/thumbs\/838\//, '/');
}

/** Total pagination pages, found by scanning ?page=N links present in the page (no dedicated
 * "last page" control was found live - the max page number linked anywhere is a safe proxy). */
export function parseJesusvicoTotalPages(html: string): number {
	const $ = cheerio.load(html);
	let max = 1;
	$("a[href*='page=']").each((_, el) => {
		const href = $(el).attr('href');
		if (!href) return;
		try {
			const page = Number.parseInt(
				new URL(href, 'https://www.jesusvico.com').searchParams.get('page') ?? '',
				10,
			);
			if (Number.isFinite(page) && page > max) max = page;
		} catch {
			// ignore malformed hrefs
		}
	});
	return max;
}

/**
 * jesusvico.com weight/diameter appear as bare "26.92 g. 36.7 mm." right after the grade, with no
 * "weight:"/"diameter:" label the shared parser-utils.ts heuristics require - confirmed across
 * multiple live samples, so these are jesusvico-scoped rather than guessed, and kept local to this
 * file rather than loosening the shared heuristics other sources rely on. The English-locale
 * listing uses a period decimal ("26.92 g."), but the Spanish locale ("/es/lote/...", confirmed
 * live) uses a comma ("6,75 g.") - a period-only pattern doesn't just fail to match a comma value,
 * it silently matches the WRONG number (e.g. "75g" out of "6,75 g.", skipping the "6,"), so both
 * separators are matched and normalized to a period for storage.
 */
function extractJesusvicoWeight(text: string | null | undefined): string | null {
	if (!text) return null;
	const match = text.match(/(\d+(?:[.,]\d+)?)\s*g\.?\s/i);
	return match ? `${match[1]!.replace(',', '.')}g` : null;
}

function extractJesusvicoDiameter(text: string | null | undefined): string | null {
	if (!text) return null;
	const match = text.match(/(\d+(?:[.,]\d+)?)\s*mm\.?/i);
	return match ? `${match[1]!.replace(',', '.')}mm` : null;
}

/**
 * jesusvico.com's lot-detail description opens with "<Ruler/issuer> (<date
 * range>)." - a PARENTHESIZED date directly after the name, with no comma -
 * confirmed live ("CATHOLIC MONARCHS (1475-1504). 2 reales. ..."). This is a
 * different convention from the shared extractRulerAndDate in
 * parser-utils.ts (Biddr's "Ruler, 1475-1603" comma form), which is why that
 * one silently returned null against this text rather than mismatching it -
 * kept local to this file for the same reason as the weight/diameter
 * extractors above, rather than loosening the shared heuristic other sources
 * rely on. Scoped to the FIRST period-delimited segment only, matching where
 * this fact actually appears in the observed samples.
 */
function extractJesusvicoRulerAndDate(text: string | null | undefined): {
	ruler: string | null;
	datePeriod: string | null;
} {
	if (!text) return { ruler: null, datePeriod: null };
	const firstSegment = text.split('.')[0]?.trim() ?? '';
	const match = firstSegment.match(/^(.+?)\s*\(([^)]+)\)$/);
	if (!match) return { ruler: null, datePeriod: null };
	return { ruler: match[1]!.trim(), datePeriod: match[2]!.trim() };
}

/**
 * Extracts auction-level metadata from a jesusvico.com auction listing page. Single auction-house
 * site (unlike sixbid or the aggregator model coinarchives would have been) - auctionHouse is
 * simply fixed.
 */
export function parseJesusvicoAuction(html: string, sourceUrl: string): ExtractedAuction {
	const $ = cheerio.load(html);

	const title = cleanText($('h1.text-uppercase b').first().text());
	const auctionNumber = parseJesusvicoAuctionNumber(sourceUrl);

	const dataClosed = $('[data-closed]').first().attr('data-closed');
	const dateText = $('.filters-auction-countdown .filter-title p').last().text();
	const startDate = parseEuropeanDateText(dateText);

	const status = deriveStatus(dataClosed, startDate);

	const lotCount = $('.lot-card').length;

	return {
		sourceUrl,
		sourceDomain: 'jesusvico.com',
		auctionIdentifier: auctionNumber ?? '',
		auctionHouse: 'Jesús Vico',
		title,
		auctionNumber,
		description: null,
		location: null,
		startDate,
		endDate: null,
		status,
		lotCount: lotCount > 0 ? lotCount : null,
		categories: [],
		raw: {},
	};
}

/**
 * data-closed is the primary signal, but its exact semantics weren't fully confirmed live (a
 * "data-closed=0" was observed on an auction where every sampled lot was already marked SOLD) -
 * cross-checked against the parsed start date so a stale/ambiguous flag can't produce "upcoming"
 * for an auction that has clearly already happened.
 */
function deriveStatus(dataClosed: string | undefined, startDate: string | null): AuctionStatus {
	const startMs = startDate ? new Date(startDate).getTime() : NaN;
	const startIsPast = !Number.isNaN(startMs) && startMs <= Date.now();

	if (dataClosed === '1' || startIsPast) return 'closed';
	if (!Number.isNaN(startMs)) return 'upcoming';
	return 'unknown';
}

/**
 * Builds a pseudo-auction for a single-lot URL. Unlike Biddr's/sixbid's equivalent, a jesusvico
 * lot detail page carries no reusable auction-level header (confirmed live: no breadcrumb, no
 * `data-closed`, no auction title anywhere on the page) - honestly left unknown/null rather than
 * guessed, matching the same discipline used elsewhere in this app for genuinely unavailable
 * fields. Fetching the real parent auction's own page just for this metadata would double the
 * request count for what's meant to be a lightweight single-lot retrieval, so it isn't done.
 */
export function parseJesusvicoSingleLotAuction(sourceUrl: string): ExtractedAuction {
	const auctionNumber = parseJesusvicoAuctionNumber(sourceUrl);
	const lotNumber = parseJesusvicoLotNumber(sourceUrl);

	return {
		sourceUrl,
		sourceDomain: 'jesusvico.com',
		auctionIdentifier: jesusvicoLotIdentifier(sourceUrl) ?? '',
		auctionHouse: 'Jesús Vico',
		title: auctionNumber ? `Auction ${auctionNumber}, Lot ${lotNumber ?? '?'}` : null,
		auctionNumber,
		description: null,
		location: null,
		startDate: null,
		endDate: null,
		status: 'unknown',
		lotCount: 1,
		categories: [],
		raw: {},
	};
}

/**
 * Extracts every lot card from a jesusvico.com listing page. Confirmed live that card text is not
 * truncated relative to the lot's own detail page (unlike the description text truncation the
 * removed coinarchives integration had) - detailFetched is still false, because the detail page
 * adds a real multi-image gallery the listing doesn't have (confirmed 4 images vs. 1 thumbnail).
 */
export function parseJesusvicoLots(html: string, sourceUrl: string): ExtractedLot[] {
	const $ = cheerio.load(html);
	const lots: ExtractedLot[] = [];
	const auctionNumber = parseJesusvicoAuctionNumber(sourceUrl) ?? '';

	$('.lot-card').each((_, el) => {
		const card = $(el);
		const lotUrl = absoluteUrl(card.find('a.stretched-link').first().attr('href'), sourceUrl);

		const lotNumberText = cleanText(card.find('.card-lot-title').first().text());
		// "Lot 215" on the English locale, "Lote 215" on the Spanish one (confirmed live) - matched
		// literally rather than assuming "Lot" is a language-agnostic prefix.
		const lotNumberMatch = lotNumberText?.match(/Lote?\s+(\S+)/i);
		const lotNumber = lotNumberMatch ? lotNumberMatch[1]! : null;
		if (!lotNumber) return;

		const title = cleanText(card.find('.card-title').first().text());

		const startingPriceText = cleanText(card.find('.lot-salida-price-value').first().text());
		const startingPrice = parseEuropeanPrice(startingPriceText);

		const realizedEl = card.find('.lot-buy-to-value').first();
		const realizedPrice =
			realizedEl.length > 0 ? parseEuropeanPrice(cleanText(realizedEl.text())) : null;

		const rawImageUrl = absoluteUrl(card.find('.card-img-top').first().attr('src'), sourceUrl);
		const imageUrl = rawImageUrl ? toFullResolutionUrl(rawImageUrl) : null;
		const images: ExtractedImage[] = [];
		if (imageUrl) images.push({ sourceUrl: imageUrl, order: 0, width: null, height: null });

		const { ruler, datePeriod } = extractRulerAndDate(title);

		lots.push({
			sourceUrl: lotUrl,
			lotIdentifier: `jesusvico:${auctionNumber}:${lotNumber}`,
			lotNumber,
			title,
			description: title,
			descriptionHtml: null,
			category: null,
			estimateLow: null,
			estimateHigh: null,
			startingPrice: startingPrice?.amount ?? null,
			realizedPrice: realizedPrice?.amount ?? null,
			currency: realizedPrice?.currency ?? startingPrice?.currency ?? null,
			weight: extractJesusvicoWeight(title),
			diameter: extractJesusvicoDiameter(title),
			material: extractMaterial(title),
			mint: null,
			ruler,
			denomination: extractDenomination(title),
			datePeriod,
			condition: null,
			referenceNumber: null,
			detailFetched: false,
			images,
			raw: {},
		});
	});

	return lots;
}

/**
 * Parses a jesusvico.com lot detail page - adds the full image gallery (the listing only has one
 * thumbnail). Description/price fields are left null/absent here rather than re-derived: confirmed
 * the listing's own text is already complete, and LotRepository.upsert's mergeLot already keeps
 * the listing's richer price values whenever a merge input is null, so there's nothing to gain
 * (and a real risk of drift) from re-parsing them from a page structure that wasn't built for it.
 */
export function parseJesusvicoLotDetail(html: string, sourceUrl: string): ExtractedLot | null {
	const $ = cheerio.load(html);
	if ($('.long-description').length === 0) return null;

	const auctionNumber = parseJesusvicoAuctionNumber(sourceUrl);
	const lotNumber = parseJesusvicoLotNumber(sourceUrl);
	if (!auctionNumber || !lotNumber) return null;

	const description = cleanText($('.long-description').text());
	const { ruler, datePeriod } = extractJesusvicoRulerAndDate(description);

	const images: ExtractedImage[] = [];
	const seen = new Set<string>();
	// Matched by the "/thumbs/838/" bucket (still the reliable way to find just the gallery photos
	// among the page's other images), then upgraded to the full-resolution original - see
	// toFullResolutionUrl's comment above.
	$("img[src*='/thumbs/838/']").each((i, el) => {
		const rawSrc = absoluteUrl($(el).attr('src'), sourceUrl);
		const src = rawSrc ? toFullResolutionUrl(rawSrc) : null;
		if (src && !seen.has(src)) {
			seen.add(src);
			images.push({ sourceUrl: src, order: images.length, width: null, height: null });
		}
	});

	return {
		sourceUrl,
		lotIdentifier: `jesusvico:${auctionNumber}:${lotNumber}`,
		lotNumber,
		title: null,
		description,
		descriptionHtml: null,
		category: null,
		estimateLow: null,
		estimateHigh: null,
		startingPrice: null,
		realizedPrice: null,
		currency: null,
		weight: extractJesusvicoWeight(description),
		diameter: extractJesusvicoDiameter(description),
		material: extractMaterial(description),
		mint: null,
		ruler,
		denomination: null,
		datePeriod,
		condition: null,
		referenceNumber: null,
		detailFetched: true,
		images,
		raw: {},
	};
}
