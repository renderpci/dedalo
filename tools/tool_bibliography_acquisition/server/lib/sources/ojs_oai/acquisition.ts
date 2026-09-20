import { fetchPublicPage, type RawSource } from '../../acquisition/http.ts';
import { assertSafeOaiUrl } from '../../acquisition/url-safety.ts';
import type { AcquisitionProgress, MultiPageAcquisition } from '../types.ts';
import { extractDownloadUrl, extractGalleyViewUrl } from './parser.ts';

export const OAI_FETCH_OPTIONS = {
	assertSafeUrl: assertSafeOaiUrl,
	// Multi-host protocol, not one fixed domain - e.g. Persée redirects www.persee.fr -> oai.persee.fr.
	allowRedirectHost: () => true,
};

const MAX_PAGES = 500;
const METADATA_PREFIX = 'oai_dc';

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

interface OaiErrorInfo {
	code: string;
	message: string;
}

function extractOaiError(xml: string): OaiErrorInfo | null {
	const match = xml.match(/<error code="([^"]*)">([^<]*)<\/error>/);
	if (!match) return null;
	return { code: match[1] ?? '', message: (match[2] ?? '').trim() };
}

function extractResumptionToken(xml: string): string | null {
	const match = xml.match(/<resumptionToken[^>]*>([^<]*)<\/resumptionToken>/);
	const token = match?.[1]?.trim();
	return token && token.length > 0 ? token : null;
}

/**
 * Harvests every record via ListRecords, following resumptionToken pagination until exhausted.
 * A `noRecordsMatch` response is a legitimate "nothing here yet", not a failure - every other OAI
 * <error> aborts the run.
 */
export async function acquireOaiSeries(
	rawUrl: string,
	onProgress?: AcquisitionProgress,
): Promise<MultiPageAcquisition> {
	const baseUrl = deriveOaiBaseUrl(rawUrl);
	if (!baseUrl) {
		throw new Error("Could not determine this journal's OAI-PMH endpoint from the given URL.");
	}

	const pages: RawSource[] = [];
	let requestUrl = `${baseUrl}?verb=ListRecords&metadataPrefix=${METADATA_PREFIX}`;

	for (let page = 1; page <= MAX_PAGES; page++) {
		const raw = await fetchPublicPage(requestUrl, OAI_FETCH_OPTIONS);

		const oaiError = extractOaiError(raw.html);
		if (oaiError && oaiError.code !== 'noRecordsMatch') {
			throw new Error(`OAI-PMH error (${oaiError.code}): ${oaiError.message || 'no message'}`);
		}

		pages.push(raw);
		if (oaiError) break; // noRecordsMatch - nothing to paginate.

		const resumptionToken = extractResumptionToken(raw.html);
		if (!resumptionToken) {
			onProgress?.(page, page);
			break;
		}
		onProgress?.(page, page + 1);
		requestUrl = `${baseUrl}?verb=ListRecords&resumptionToken=${encodeURIComponent(resumptionToken)}`;
	}

	return { seriesIdentifier: baseUrl, pages };
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
