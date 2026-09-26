import { fetchPublicPage, type RawSource } from '../../acquisition/http.ts';
import { assertSafeOaiUrl } from '../../acquisition/url-safety.ts';
import type { AcquisitionProgress, MultiPageAcquisition } from '../types.ts';
import { extractArticleIds, extractDownloadUrl, extractGalleyViewUrl } from './parser.ts';

export const OAI_FETCH_OPTIONS = {
	assertSafeUrl: assertSafeOaiUrl,
	// Multi-host protocol, not one fixed domain - e.g. Persée redirects www.persee.fr -> oai.persee.fr.
	allowRedirectHost: () => true,
};

const METADATA_PREFIX = 'oai_dc';
const ARTICLE_URL_PATTERN = /\/article\/view\/(\d+)(?:\/\d+)?(?:[/?#].*)?$/i;

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
	const identify = await fetchPublicPage(`${baseUrl}?verb=Identify`, OAI_FETCH_OPTIONS);
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

	let articleIds: string[];
	const singleId = singleArticleId(rawUrl);
	if (singleId !== null) {
		articleIds = [singleId];
	} else {
		const listing = await fetchPublicPage(rawUrl, OAI_FETCH_OPTIONS);
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
			const raw = await fetchPublicPage(requestUrl, OAI_FETCH_OPTIONS);
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
	const landing = await fetchPublicPage(landingPageUrl, OAI_FETCH_OPTIONS);
	const galleyUrl = extractGalleyViewUrl(landing.html, landing.finalUrl);
	if (!galleyUrl) return null;

	const galleyPage = await fetchPublicPage(galleyUrl, OAI_FETCH_OPTIONS);
	return extractDownloadUrl(galleyPage.html, galleyPage.finalUrl);
}
