import { DedaloError } from '../../../../../../src/core/errors/dedalo_error.ts';
import { harvestFetch } from '../../../../../../src/core/harvest/harvest.ts';
import { looksBlocked } from '../../acquisition/block-signals.ts';
import type { AcquisitionProgress, MultiPageAcquisition, RawSource } from '../types.ts';
import { describeFailure } from './error_summary.ts';
import { extractArticleIds, extractDownloadUrl, extractGalleyViewUrl } from './parser.ts';

const METADATA_PREFIX = 'oai_dc';
const ARTICLE_URL_PATTERN = /\/article\/view\/(\d+)(?:\/\d+)?(?:[/?#].*)?$/i;
// A listing page's article links are UNBOUNDED input (review item G): one GetRecord fetch per
// article, each paced at least 3s apart by the harvesting door, so a pathological listing (every
// article a journal ever published, rather than one issue) would otherwise turn one preview into
// an hours-long job. Real issues run to a few dozen articles; this leaves wide headroom.
const MAX_ARTICLES = 200;

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
		throw new DedaloError('external.http_status', {
			coordinates: { source: 'ojs_oai', url, status: response.status },
		});
	}
	const html = response.text();
	// A Cloudflare/CAPTCHA interstitial is commonly served as a plain 2xx - mainly a landing-page
	// risk here (confirmed live: some OJS hosts block it), not the OAI-PMH XML endpoints themselves,
	// but response.ok alone still does not mean "this is the real page" either way (review item:
	// "block-signals.ts is never imported").
	if (response.headers['cf-mitigated'] || looksBlocked(html)) {
		throw new DedaloError('external.protocol', {
			coordinates: { source: 'ojs_oai', url, cf_mitigated: response.headers['cf-mitigated'] ?? '' },
		});
	}
	return {
		html,
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
		throw new DedaloError('external.protocol', {
			coordinates: { source: 'ojs_oai', baseUrl },
		});
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
		throw new DedaloError('request.invalid_options', {
			publicMessage: "Could not determine this journal's OAI-PMH endpoint from the given URL.",
		});
	}

	const onWait = (ms: number, origin: string): void => {
		onProgress?.(0, 0, `Waiting ${Math.round(ms / 1000)}s for ${origin}`);
	};

	let articleIds: string[];
	let truncatedCount = 0;
	const singleId = singleArticleId(rawUrl);
	if (singleId !== null) {
		articleIds = [singleId];
	} else {
		const listing = await fetchOaiPage(rawUrl, onWait);
		const found = extractArticleIds(listing.html);
		if (found.length === 0) {
			throw new DedaloError('resource.not_found', {
				publicMessage:
					'No article links found at this URL - paste a journal homepage, an issue page, or a single article URL.',
			});
		}
		articleIds = found.slice(0, MAX_ARTICLES);
		truncatedCount = found.length - articleIds.length;
	}

	const repoId = await repositoryId(baseUrl);

	const pages: RawSource[] = [];
	// One article's metadata failing to resolve doesn't sink the whole bounded batch - same
	// reasoning as the coin tool's per-lot best-effort steps. But the reason is kept (never a
	// silent count): each failure is classified through toDedaloError/toErrorBody, same as a
	// per-item result elsewhere, so the operator can tell a transient refusal from a real
	// idDoesNotExist for a SPECIFIC article instead of just seeing "3 failed".
	const failureDetails: string[] = [];
	for (let i = 0; i < articleIds.length; i++) {
		const identifier = `oai:${repoId}:article/${articleIds[i]}`;
		const requestUrl = `${baseUrl}?verb=GetRecord&identifier=${encodeURIComponent(identifier)}&metadataPrefix=${METADATA_PREFIX}`;
		try {
			const raw = await fetchOaiPage(requestUrl, (ms, origin) =>
				onProgress?.(i + 1, articleIds.length, `Waiting ${Math.round(ms / 1000)}s for ${origin}`),
			);
			const oaiError = extractOaiErrorMessage(raw.html);
			if (oaiError) {
				// `resource.not_found` (public disclosure), not `external.protocol`: this failure is
				// reported per-article into `partialError` (an ok:true result field a cataloguer
				// reads), so the REAL OAI-PMH reason must reach it - an operator-disclosure code would
				// have the converter replace it with a generic sentence before it got that far.
				throw new DedaloError('resource.not_found', {
					publicMessage: oaiError,
					coordinates: { source: 'ojs_oai', identifier },
				});
			}
			pages.push(raw);
		} catch (error) {
			failureDetails.push(`${articleIds[i]}: ${describeFailure(error)}`);
		}
		onProgress?.(i + 1, articleIds.length);
	}

	if (pages.length === 0) {
		throw new DedaloError('resource.not_found', {
			publicMessage: `Could not resolve metadata for any of the ${articleIds.length} article(s) found.`,
			coordinates: { source: 'ojs_oai', baseUrl },
		});
	}

	return {
		seriesIdentifier: baseUrl,
		pages,
		truncatedBy: truncatedCount > 0 ? truncatedCount : undefined,
		partialError:
			failureDetails.length > 0
				? `${failureDetails.length} of ${articleIds.length} article(s) could not be resolved: ${failureDetails.join('; ')}`
				: undefined,
	};
}

/**
 * Resolves the real downloadable PDF URL for one publication - a two-hop scrape (landing page ->
 * galley view page -> real file), since OAI-PMH data alone never carries it. Returns null when a
 * fetched page simply has no PDF galley link; a page that cannot be FETCHED at all (blocked,
 * unreachable) throws instead - the caller (index.ts's resolvePublicationPdfUrl) is the one that
 * turns that into a best-effort null.
 */
export async function resolvePdfUrl(landingPageUrl: string): Promise<string | null> {
	const landing = await fetchOaiPage(landingPageUrl);
	const galleyUrl = extractGalleyViewUrl(landing.html, landing.finalUrl);
	if (!galleyUrl) return null;

	const galleyPage = await fetchOaiPage(galleyUrl);
	return extractDownloadUrl(galleyPage.html, galleyPage.finalUrl);
}
