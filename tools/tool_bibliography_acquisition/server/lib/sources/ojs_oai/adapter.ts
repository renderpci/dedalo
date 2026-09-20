import { assertSafeOaiUrl } from '../../acquisition/url-safety.ts';
import type { SourceAdapter } from '../types.ts';
import {
	acquireOaiSeries,
	deriveOaiBaseUrl,
	oaiSeriesIdentifier,
	resolvePdfUrl,
} from './acquisition.ts';
import { parseOaiPublications, parseOaiSeries } from './parser.ts';

/**
 * Adapter for OAI-PMH, as spoken by OJS journals and Persée - not tied to a single fixed domain
 * like the coin tool's adapters, since it's an open protocol many hosts speak.
 * resolvePdfUrl is best-effort: some hosts (e.g. Saguntum) block the landing-page fetch it needs.
 */
export const ojsOaiAdapter: SourceAdapter = {
	id: 'ojs-oai',
	sourceDomain: 'oai-pmh',

	matchesUrl(rawUrl) {
		return deriveOaiBaseUrl(rawUrl) !== null;
	},

	assertSafeUrl: assertSafeOaiUrl,

	parseSeriesIdentifier: oaiSeriesIdentifier,

	acquire: (rawUrl, onProgress) => acquireOaiSeries(rawUrl, onProgress),

	parseSeries: (firstPage, sourceUrl) =>
		parseOaiSeries(firstPage.html, deriveOaiBaseUrl(sourceUrl) ?? sourceUrl),

	parsePublications: (page) => parseOaiPublications(page.html),

	storageKey: (seriesIdentifier) => `ojs-oai-${encodeURIComponent(seriesIdentifier)}`,

	resolvePdfUrl,
};
