import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { AuctionStatus, ExtractedAuction } from '../../domain/auction.ts';
import type { ExtractedImage, ExtractedLot } from '../../domain/lot.ts';
import {
	cleanMultilineText,
	cleanText,
	extractDenomination,
	extractDiameter,
	extractMaterial,
	extractRulerAndDate,
	parseEuropeanDateText,
	parseEuropeanPrice,
} from '../../extraction/parser-utils.ts';
import { parseAureoAuctionId } from './acquisition.ts';

function absoluteUrl(href: string | undefined | null, base: string): string | null {
	if (!href) return null;
	try {
		return new URL(href, base).toString();
	} catch {
		return null;
	}
}

/**
 * aureo.com's own descriptions use "7,14 g." (comma decimal, no "weight:" label) - the same bare-
 * pattern gap jesusvico's descriptions have, but with a comma rather than jesusvico's period, so
 * kept as its own extractor rather than reusing jesusvico's (which would misparse the decimal).
 */
function extractAureoWeight(text: string | null): string | null {
	if (!text) return null;
	const match = text.match(/(\d+(?:,\d+)?)\s*g\.?\s/i);
	return match ? `${match[1]!.replace(',', '.')}g` : null;
}

/**
 * Spanish numismatic grading scale (worst to best: RC, BC, MBC, EBC, SC/FDC), confirmed live in
 * lot descriptions right after the weight - kept as its own field (`condition`) rather than mapped
 * onto an English equivalent, so the original grading vocabulary isn't lost or guessed at.
 */
function extractAureoCondition(text: string | null): string | null {
	if (!text) return null;
	// A trailing \b doesn't work here - "-"/"+" aren't word characters, so \b fails right after a
	// grade like "MBC-" (neither side of "- " is a word char). A negative lookahead for another
	// letter/digit achieves the same "don't match mid-word" guard without that failure mode.
	const match = text.match(
		/\b(FDC|SC\+|SC-|SC|EBC\+|EBC-|EBC|MBC\+|MBC-|MBC|BC\+|BC-|BC|RC)(?![A-Za-z0-9])/,
	);
	return match ? match[1]! : null;
}

interface AureoPriceInfo {
	startingPrice: number | null;
	realizedPrice: number | null;
	currency: string | null;
}

/**
 * A card always shows "Start: N€"; "Hammer price: N€" is only present once a lot has sold (its
 * container is replaced by a live bid form otherwise, confirmed by reading the site's own
 * script.js) - so presence/absence of "Hammer price" is itself the sold/still-open signal.
 */
function extractAureoPriceInfo(priceText: string): AureoPriceInfo {
	const startSegment = priceText.match(/Start:\s*([^\n]*)/i)?.[1] ?? null;
	const hammerSegment = priceText.match(/Hammer price:\s*([^\n]*)/i)?.[1] ?? null;
	const startParsed = parseEuropeanPrice(startSegment);
	const hammerParsed = parseEuropeanPrice(hammerSegment);
	return {
		startingPrice: startParsed?.amount ?? null,
		realizedPrice: hammerParsed?.amount ?? null,
		currency: hammerParsed?.currency ?? startParsed?.currency ?? null,
	};
}

/** Parses one `.card.lot-item` card from an aureo.com auction listing (a loaditems.php response). */
function parseAureoLotCard(card: cheerio.Cheerio<AnyNode>, pageUrl: string): ExtractedLot | null {
	const topCols = card.find('.row.my-0.small .col-4');
	const lotNumberMatch = cleanText(topCols.eq(0).text())?.match(/Lot\s+(\d+)/i);
	const lotNumber = lotNumberMatch ? lotNumberMatch[1]! : null;
	if (!lotNumber) return null;

	const dateText = cleanText(topCols.eq(1).text());
	const auctionMatch = cleanText(topCols.eq(2).text())?.match(/Auction\s+(\d+)/i);
	const auctionNumber = auctionMatch ? auctionMatch[1]! : null;

	const thumbLink = card.find('.item-thumb a').first();
	const auctionIdPadded = thumbLink.attr('data-auction');
	const numcatalog = thumbLink.attr('data-numcatalog') ?? lotNumber;
	const imageUrl =
		auctionIdPadded && numcatalog
			? absoluteUrl(
					`https://media.aureo.com/images/subastas/${auctionIdPadded}/${numcatalog}.jpg`,
					pageUrl,
				)
			: absoluteUrl(card.find('.item-thumb img').first().attr('src'), pageUrl);
	const images: ExtractedImage[] = imageUrl
		? [{ sourceUrl: imageUrl, order: 0, width: null, height: null }]
		: [];

	const description = cleanMultilineText(card.find('.item-text').text());
	const priceText = card.find('.row .col-12.small').first().text();
	const priceInfo = extractAureoPriceInfo(priceText);

	const { ruler, datePeriod } = extractRulerAndDate(description);
	const lotIdentifierAuction = auctionIdPadded ?? auctionNumber ?? '';

	// aureo.com has no bookmarkable per-lot URL (pure client-side AJAX navigation, confirmed live -
	// every lot link is a plain "#") - the most useful honest link is that lot's own auction page.
	const lotSourceUrl = auctionIdPadded
		? `https://www.aureo.com/en/subasta/${auctionIdPadded}`
		: pageUrl;

	return {
		sourceUrl: lotSourceUrl,
		lotIdentifier: `aureo:${lotIdentifierAuction}:${numcatalog}`,
		lotNumber,
		title: description,
		description,
		descriptionHtml: null,
		category: null,
		estimateLow: null,
		estimateHigh: null,
		startingPrice: priceInfo.startingPrice,
		realizedPrice: priceInfo.realizedPrice,
		currency: priceInfo.currency,
		weight: extractAureoWeight(description),
		diameter: extractDiameter(description),
		material: extractMaterial(description),
		mint: null,
		ruler,
		denomination: extractDenomination(description),
		datePeriod,
		condition: extractAureoCondition(description),
		referenceNumber: null,
		detailFetched: true,
		images,
		raw: dateText ? { closingDate: dateText } : {},
	};
}

/** Extracts lot cards from an aureo.com auction listing page (a loaditems.php response). */
export function parseAureoLots(html: string, sourceUrl: string): ExtractedLot[] {
	const $ = cheerio.load(html);
	const lots: ExtractedLot[] = [];
	$('.card.lot-item').each((_, el) => {
		const lot = parseAureoLotCard($(el), sourceUrl);
		if (lot) lots.push(lot);
	});
	return lots;
}

/**
 * Builds auction-level metadata for a single aureo.com auction from its first loaditems.php page.
 * The shell page at `/en/subasta/{id}` carries no title/date itself (confirmed live - lots are
 * loaded entirely via AJAX) so this reads the auction number from the breadcrumb and the closing
 * date from the first lot card, both already present on the page being parsed.
 */
export function parseAureoAuction(html: string, sourceUrl: string): ExtractedAuction {
	const $ = cheerio.load(html);
	const auctionId = parseAureoAuctionId(sourceUrl) ?? '';
	const breadcrumbMatch = html.match(/AUCTION\s+(\d+)/i);
	const auctionNumber = breadcrumbMatch
		? breadcrumbMatch[1]!
		: String(Number.parseInt(auctionId, 10) || auctionId);

	const firstCard = $('.card.lot-item').first();
	const dateText = cleanText(firstCard.find('.row.my-0.small .col-4').eq(1).text());
	const closingDate = parseEuropeanDateText(dateText);

	const hasAnyHammerPrice = /Hammer price:/i.test(html);
	const status = deriveAureoStatus(hasAnyHammerPrice, closingDate);

	const lotCount = $('.card.lot-item').length;

	return {
		sourceUrl,
		sourceDomain: 'aureo.com',
		auctionIdentifier: auctionId,
		auctionHouse: 'Aureo & Calicó',
		title: `Auction ${auctionNumber}`,
		auctionNumber,
		description: null,
		location: null,
		startDate: closingDate,
		endDate: closingDate,
		status,
		lotCount: lotCount > 0 ? lotCount : null,
		categories: [],
		raw: {},
	};
}

/**
 * No explicit open/closed flag is exposed - a "Hammer price" only ever appears once a lot has sold
 * (see extractAureoPriceInfo's comment), so its presence anywhere on the page is a reliable closed
 * signal; its absence falls back to comparing the closing date against now, since a genuinely live
 * auction wasn't available to confirm this against directly during development.
 */
function deriveAureoStatus(hasAnyHammerPrice: boolean, closingDate: string | null): AuctionStatus {
	if (hasAnyHammerPrice) return 'closed';
	if (!closingDate) return 'unknown';
	const dateMs = new Date(closingDate).getTime();
	if (Number.isNaN(dateMs)) return 'unknown';
	return dateMs > Date.now() ? 'upcoming' : 'closed';
}
