/**
 * THE EXPORT ARTIFACT DOWNLOAD — `GET /dedalo/export/artifact/<jobId>/<basename>`.
 *
 * A built export file (csv, tsv, html, xlsx, ods, ndjson, media zip) leaves the
 * server ONLY through here, as a plain GET link, so the browser writes it
 * straight to disk: no Blob, no `data:` URL, no DOM copy. The route is
 * registered through the tool contract (`tool.httpRoutes` in index.ts; the
 * router finds it with loader.ts toolHttpRouteFor, so src/ never names this
 * tool); every decision lives in this module.
 *
 * WHO MAY DOWNLOAD — decided on EVERY request, never from a stamp:
 *   1. an authenticated session, its Principal resolved as of THIS request
 *      (security/session_gate.ts sessionPrincipalFromCookie) — which also
 *      applies the dispatcher's Gate 2b: under maintenance a non-root session
 *      is not authenticated (refusedUnderMaintenance, the one rule);
 *   2. OWNERSHIP by construction: the job is looked up under the CALLER's own
 *      `<root>/<userId>/` directory, and the manifest inside must name the same
 *      user and job (artifact_store readManifest) — another user's job id is
 *      simply not there;
 *   3. the TOOL gate the dispatcher gives every other export door: tool_export
 *      ACTIVE (dd1324) and AUTHORIZED for the user (access.ts
 *      exportToolAuthorized = registry getUserTools) — deactivating the tool or
 *      removing it from the user's profile closes every built file at once;
 *   3b. the build's OWN read gates, re-asked now over the recorded options
 *      (access.ts exportStillReadable — the section, every sqo section, every
 *      declared column, the dedalo_raw frames, every runtime frontier grant
 *      the walk read under): a grant revoked after the build closes the file;
 *   4. the job has `ended` and the basename is a file the builder COMMITTED
 *      (recorded in manifest.files) — a spool, the manifest, a temp or a partial
 *      file is never offered;
 *   5. the basename passes the artifact store's closed allowlist and its ONE
 *      confinement (`resolveArtifactFile`: grammar, `resolve().startsWith`,
 *      regular file, no symlink).
 * Anything else answers null, which the route turns into the one 404
 * `resource.not_found` — never 403, so a probe cannot tell "not yours" from
 * "does not exist".
 *
 * THE PATH is taken RAW (never percent-decoded): the job id and basename
 * grammars are plain ASCII without `%`, `.`-segments or `/`, so an encoded
 * traversal (`%2e%2e`, `%2f`) fails the grammar instead of being decoded into
 * one. Exactly two segments follow the prefix.
 */

import { SECURITY_HEADERS } from '../../../src/core/api/static_asset.ts';
import {
	DedaloError,
	isDedaloError,
	logError,
	toDedaloError,
} from '../../../src/core/errors/index.ts';
import { sessionPrincipalFromCookie } from '../../../src/core/security/session_gate.ts';
import { exportStillReadable, exportToolAuthorized } from './access.ts';
import {
	type ArtifactStore,
	EXPORT_FORMATS,
	type ExportFormat,
	type ExportManifest,
	FORMAT_SPECS,
	isDownloadableArtifactName,
	isValidArtifactJobId,
	openArtifactStore,
} from './artifact_store.ts';

/**
 * The route prefix (index.ts registers it as the tool's httpRoute; the router dispatches every GET under it here) — THE one
 * spelling: the job API builds its links through exportArtifactUrl below.
 */
export const EXPORT_ARTIFACT_URL_PREFIX = '/dedalo/export/artifact/';

/** Test seam: the store to read (default: the configured one, opened per request). */
export interface ExportArtifactDownloadOptions {
	store?: ArtifactStore;
}

/**
 * THE download link builder for one built file (what the job API emits and the
 * client puts in an `<a href>`). Both grammars are unreserved ASCII, so encoding
 * is a no-op for every valid name. Gated end to end (emitted link → route → 200)
 * in export_artifact_download_native.test.ts.
 */
export function exportArtifactUrl(jobId: string, basename: string): string {
	return `${EXPORT_ARTIFACT_URL_PREFIX}${encodeURIComponent(jobId)}/${encodeURIComponent(basename)}`;
}

/**
 * The route's two path segments, or null. RAW — see the module note: no
 * decoding, exactly `<jobId>/<basename>`, both matching their grammar.
 */
export function parseExportArtifactPath(
	pathname: string,
): { jobId: string; basename: string } | null {
	if (!pathname.startsWith(EXPORT_ARTIFACT_URL_PREFIX)) return null;
	const parts = pathname.slice(EXPORT_ARTIFACT_URL_PREFIX.length).split('/');
	if (parts.length !== 2) return null;
	const [jobId, basename] = parts as [string, string];
	if (!isValidArtifactJobId(jobId) || !isDownloadableArtifactName(basename)) return null;
	return { jobId, basename };
}

/** The format a downloadable basename carries (`media*.zip` → media_zip). */
export function formatOfArtifactName(basename: string): ExportFormat | null {
	if (!isDownloadableArtifactName(basename)) return null;
	if (basename.startsWith('media')) return 'media_zip';
	const extension = basename.slice(basename.lastIndexOf('.') + 1);
	return (
		EXPORT_FORMATS.find(
			(format) => format !== 'media_zip' && FORMAT_SPECS[format].extension === extension,
		) ?? null
	);
}

/**
 * A `Content-Disposition: attachment` value that is safe for ANY name: the quoted
 * `filename` is an ASCII fallback (controls, quotes, backslashes, separators and
 * every non-ASCII code point become `_`), and a name that is not plain ASCII also
 * gets the RFC 5987 / RFC 6266 `filename*=UTF-8''…` form, which every current
 * browser prefers.
 */
export function attachmentDisposition(filename: string): string {
	const fallback = filename.replace(/[^\x20-\x7e]|["\\/;]/g, '_') || 'download';
	if (/^[\x20-\x7e]*$/.test(filename) && fallback === filename) {
		return `attachment; filename="${fallback}"`;
	}
	const encoded = encodeURIComponent(filename).replace(
		/['()*]/g,
		(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
	);
	return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/**
 * The name the browser saves the file under: `dedalo_export_<section>_<date>` +
 * the artifact's own suffix (`.csv`, `_media_web.zip`…). The section tipo comes
 * from the manifest; it is reduced to its tipo grammar anyway so the header never
 * carries whatever a hand-edited manifest might hold.
 */
export function downloadFileName(manifest: ExportManifest, basename: string): string {
	const section = String(manifest.section_tipo ?? '').replace(/[^A-Za-z0-9_-]/g, '') || 'section';
	const created = String(manifest.ended_at ?? manifest.created_at ?? '');
	const date = /^\d{4}-\d{2}-\d{2}/.test(created) ? created.slice(0, 10) : '';
	const stem = `dedalo_export_${section}${date === '' ? '' : `_${date}`}`;
	// `export[_<options hash>].<ext>` → `<stem>.<ext>`: the hash only keeps two
	// option sets apart on the server; the saved name does not need it.
	const exported = /^export(?:_[a-z0-9]+)?(\.[a-z]+)$/.exec(basename);
	return exported !== null ? `${stem}${exported[1]}` : `${stem}_${basename}`;
}

/**
 * Serve one artifact to its owner, or null (→ the route's 404) for every refusal.
 * Never throws for a caller-shaped input: an unreadable manifest, a malformed id,
 * a missing file are all "not found".
 */
export async function serveExportArtifact(
	pathname: string,
	cookieHeader: string | null,
	options: ExportArtifactDownloadOptions = {},
): Promise<Response | null> {
	const target = parseExportArtifactPath(pathname);
	if (target === null) return null;
	const caller = await sessionPrincipalFromCookie(cookieHeader);
	if (caller === null) return null;
	const userId = caller.session.userId;
	const store = options.store ?? openArtifactStore();

	let manifest: ExportManifest;
	try {
		manifest = await store.readManifest(store.jobRef(userId, target.jobId));
	} catch {
		return null;
	}
	if (manifest.user_id !== userId || manifest.job_id !== target.jobId) return null;
	if (manifest.status !== 'ended') return null;
	const recorded = manifest.files?.[target.basename];
	if (recorded === undefined || recorded.basename !== target.basename) return null;
	// (Gate 2b, maintenance, was applied by sessionPrincipalFromCookie above.)
	// The TOOL gate the dispatcher applies to every other export door (Gates 3+4:
	// tool_export active in dd1324 AND authorized for this user) — this route is
	// reached by the router, not the dispatcher, so it asks here. Then the build's
	// own gates, re-asked NOW (access.ts — the one re-check door the preview,
	// file build and listing use too). Fail closed on anything thrown — but an
	// UNEXPECTED failure (the DB gone, a bug) is journaled first: a refusal
	// (perm.*) is traffic, anything else is a fault the operator must see, never
	// a silent 404 (the error system's rule; the dispatcher doors log theirs).
	try {
		if (!(await exportToolAuthorized(userId))) return null;
		if (!(await exportStillReadable(caller.principal, manifest, store))) return null;
	} catch (error) {
		if (!(isDedaloError(error) && error.code.startsWith('perm.'))) {
			const typed = toDedaloError(error);
			logError(
				new DedaloError(typed.code, {
					message: `export download re-check failed: ${typed.message}`,
					coordinates: { user_id: userId, job_id: target.jobId },
					cause: error,
				}),
				{ subsystem: 'tool_export' },
			);
		}
		return null;
	}

	const path = await store.resolveArtifactFile(userId, target.jobId, target.basename);
	if (path === null) return null;
	const format = formatOfArtifactName(target.basename);
	if (format === null) return null;
	const file = Bun.file(path);
	if (!(await file.exists())) return null;

	return new Response(file, {
		headers: {
			...SECURITY_HEADERS,
			// Never rendered by the app: an exported HTML opened in place still gets no
			// script, no subresource and an opaque origin (the media responses' CSP).
			'Content-Security-Policy': "default-src 'none'; sandbox",
			'Content-Type': FORMAT_SPECS[format].contentType,
			'Content-Disposition': attachmentDisposition(downloadFileName(manifest, target.basename)),
			'Content-Length': String(file.size),
			'Cache-Control': 'no-store',
		},
	});
}
