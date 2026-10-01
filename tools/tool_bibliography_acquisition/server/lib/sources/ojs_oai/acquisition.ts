import { harvestFetch } from '../../../../../../src/core/harvest/harvest.ts';
import type { AcquisitionProgress, MultiPageAcquisition, RawSource } from '../types.ts';
import { extractArticleIds, extractDownloadUrl, extractGalleyViewUrl } from './parser.ts';

const METADATA_PREFIX = 'oai_dc';
const ARTICLE_URL_PATTERN = /\/article\/view\/(\d+)(?:\/\d+)?(?:[/?#].*)?$/i;

/**
 * One GET through the harvesting door - OAI-PMH is spoken by many independent
 * hosts (hosts:'public'), still https-only (requireHttps), same as the
 * deleted url-safety.ts enforced. harvestFetch returns a non-2xx rather than
 * throwing, so that half of the old fetchPublicPage contract is reproduced
 * here explicitly.
 */
async function fetchOaiPage(
	url: string,
	onWait?: (ms: number, origin: string) => void,
): Promise<RawSource> {
	const response = await harvestFetch({
		url,
		hosts: 'public',
		requireHttps: true,
		headers: { Accept: 'text/xml,application/xml,text/html,application/xhtml+xml' },
		onWait,
	});
	if (!response.ok) {
		throw new Error(`Server returned HTTP ${response.status} for ${url}.`);
	}
	return {
		html: response.text(),
		finalUrl: response.url,
		httpStatus: response.status,
		contentType: response.contentType,
	};
}

/**
 * Normalizes whatever URL the user pasted to the journal's real OAI-PMH base URL - either the OAI
 * base URL itself (ends "/oai"), or a normal OJS URL, from which it's derived via OJS's own
 * "<site>/index.php/<journal>/..." convention.
 */
export function deriveOaiBaseUrl(rawUrl: string): string | null {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return null;
	}
	const trimmedPath = url.pathname.replace(/\/+$/, '');
	if (/\/oai$/i.test(trimmedPath)) {
		return `${url.origin}${trimmedPath}`;
	}
	const ojsMatch = trimmedPath.match(/^(.*\/index\.php\/[^/]+)(?:\/.*)?$/i);
	if (ojsMatch) {
		return `${url.origin}${ojsMatch[1]}/oai`;
	}
	return null;
}

export function oaiSeriesIdentifier(rawUrl: string): string | null {
	return deriveOaiBaseUrl(rawUrl);
}

/** The numeric article id when `rawUrl` is itself a single-article page, else null. */
function singleArticleId(rawUrl: string): string | null {
	return rawUrl.match(ARTICLE_URL_PATTERN)?.[1] ?? null;
}

/** OAI identifiers are "oai:<repository-id>:article/<id>" - the repository id is per-install (every
 * one checked this session happened to be the PKP default, "ojs.pkp.sfu.ca", but nothing about the
 * protocol guarantees that), so it's read from a real Identify call rather than assumed. */
async function repositoryId(baseUrl: string): Promise<string> {
	const identify = await fetchOaiPage(`${baseUrl}?verb=Identify`);
	const match = identify.html.match(/<repositoryIdentifier>([^<]+)<\/repositoryIdentifier>/);
	if (!match) {
		throw new Error("Could not read this journal's OAI repository identifier from Identify.");
	}
	return match[1]?.trim() ?? '';
}

function extractOaiErrorMessage(xml: string): string | null {
	const match = xml.match(/<error code="([^"]*)">([^<]*)<\/error>/);
	if (!match) return null;
	return `OAI-PMH error (${match[1]}): ${(match[2] ?? '').trim() || 'no message'}`;
}

/**
 * Resolves ONE bounded, structured set of articles from the pasted URL - never a whole journal's
 * history. Either the URL names a single article directly, or it's a listing page (a journal
 * homepage showing its current issue, an issue page, a search result, ...) that gets scanned for
 * real `article/view/<id>` links, the same way the coin tool scrapes one auction's lot listing
 * rather than an auction house's entire history. Each discovered article is then fetched
 * individually via OAI-PMH GetRecord, for the same reliable oai_dc metadata ListRecords gave.
 */
export async function acquireArticleSet(
	rawUrl: string,
	onProgress?: AcquisitionProgress,
): Promise<MultiPageAcquisition> {
	const baseUrl = deriveOaiBaseUrl(rawUrl);
	if (!baseUrl) {
		throw new Error("Could not determine this journal's OAI-PMH endpoint from the given URL.");
	}

	const onWait = (ms: number, origin: string): void => {
		onProgress?.(0, 0, `Waiting ${Math.round(ms / 1000)}s for ${origin}`);
	};

	let articleIds: string[];
	const singleId = singleArticleId(rawUrl);
	if (singleId !== null) {
		articleIds = [singleId];
	} else {
		const listing = await fetchOaiPage(rawUrl, onWait);
		articleIds = extractArticleIds(listing.html);
		if (articleIds.length === 0) {
			throw new Error(
				'No article links found at this URL - paste a journal homepage, an issue page, or a single article URL.',
			);
		}
	}

	const repoId = await repositoryId(baseUrl);

	const pages: RawSource[] = [];
	let failures = 0;
	for (let i = 0; i < articleIds.length; i++) {
		const identifier = `oai:${repoId}:article/${articleIds[i]}`;
		const requestUrl = `${baseUrl}?verb=GetRecord&identifier=${encodeURIComponent(identifier)}&metadataPrefix=${METADATA_PREFIX}`;
		try {
			const raw = await fetchOaiPage(requestUrl, (ms, origin) =>
				onProgress?.(i + 1, articleIds.length, `Waiting ${Math.round(ms / 1000)}s for ${origin}`),
			);
			const oaiError = extractOaiErrorMessage(raw.html);
			if (oaiError) throw new Error(oaiError);
			pages.push(raw);
		} catch {
			// One article's metadata failing to resolve doesn't sink the whole bounded batch -
			// same reasoning as the coin tool's per-lot best-effort steps.
			failures += 1;
		}
		onProgress?.(i + 1, articleIds.length);
	}

	if (pages.length === 0) {
		throw new Error(
			`Could not resolve metadata for any of the ${articleIds.length} article(s) found.`,
		);
	}

	return {
		seriesIdentifier: baseUrl,
		pages,
		partialError:
			failures > 0
				? `${failures} of ${articleIds.length} article(s) could not be resolved and were skipped.`
				: undefined,
	};
}

/**
 * Resolves the real downloadable PDF URL for one publication - a two-hop scrape (landing page ->
 * galley view page -> real file), since OAI-PMH data alone never carries it. Returns null rather
 * than throwing when the landing page is unreachable (e.g. blocked) or has no PDF galley link.
 */
export async function resolvePdfUrl(landingPageUrl: string): Promise<string | null> {
	const landing = await fetchOaiPage(landingPageUrl);
	const galleyUrl = extractGalleyViewUrl(landing.html, landing.finalUrl);
	if (!galleyUrl) return null;

	const galleyPage = await fetchOaiPage(galleyUrl);
	return extractDownloadUrl(galleyPage.html, galleyPage.finalUrl);
}
