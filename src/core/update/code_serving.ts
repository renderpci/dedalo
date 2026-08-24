/**
 * Code-master release SERVING (UPDATE_PROCESS Phase 4): GET
 * /dedalo/install/code/<major.minor.patch>/<file> — the exact URL
 * `buildCodeUpdateInfo` advertises, and the only way a remote install can fetch
 * the archive it was just offered. Until 2026-08-15 the manifest advertised a
 * URL NOTHING served (the ontology twin existed, this one did not), so every
 * code update died on a 404 after passing every gate before it.
 *
 * Fail-closed, same posture as `serveOntologyIoFile` (server.ts):
 *  - only when IS_A_CODE_SERVER is set and DEDALO_CODE_FILES_DIR is configured;
 *  - only a version-shaped dir segment, and only that release's own
 *    `<version>.zip` or `<version>-dev.zip` (or their `.sha256` sidecars — the
 *    digest the consumer verifies, harmless to publish and useful to an
 *    operator). The `-dev` channel (code_build_plan.ts releaseFileName) is
 *    SERVABLE but NEVER ADVERTISED: `buildCodeUpdateInfo` only looks for
 *    `<v>.zip`, so a developer build reaches only an operator who types its
 *    URL, never a consumer following the manifest;
 *  - the on-disk path is re-derived through `codeReleasePath`, the SAME
 *    confinement gate the manifest uses, never string-joined from the request.
 * Anonymous by design: the archive is public code, and the manifest that names
 * it is already code-gated.
 */

import { SECURITY_HEADERS } from '../api/static_asset.ts';
import { toErrorEnvelope } from '../errors/convert.ts';
import { DedaloError } from '../errors/dedalo_error.ts';
import { codeReleasePath } from './code_manifest.ts';

const RELEASE_URL_RE = /^\/dedalo\/install\/code\/(\d+\.\d+\.\d+)\/([A-Za-z0-9_.-]+)$/;

/** The URL prefix the server routes to this handler. */
export const CODE_RELEASE_URL_PREFIX = '/dedalo/install/code/';

export interface CodeServingConfig {
	isCodeServer: boolean;
	codeFilesDir: string | undefined;
}

/**
 * The file a release URL names, or null when it names nothing servable (the
 * caller answers the SAME 404 for every null — an unconfigured master, a
 * malformed URL and a missing archive are indistinguishable from outside).
 */
export function resolveCodeReleaseFile(
	pathname: string,
	cfg: CodeServingConfig,
): { path: string; contentType: string } | null {
	const filesDir = cfg.isCodeServer === true ? cfg.codeFilesDir : undefined;
	if (filesDir === undefined) return null;
	const named = parseReleaseUrl(pathname);
	if (named === null) return null;
	const archivePath = codeReleasePath(filesDir, named.triple, named.archiveName);
	if (archivePath === null) return null;
	return named.isSidecar
		? { path: `${archivePath}.sha256`, contentType: 'text/plain; charset=utf-8' }
		: { path: archivePath, contentType: 'application/zip' };
}

/** The release a URL names, or null when the URL is not one of ours. */
function parseReleaseUrl(
	pathname: string,
): { version: string; triple: number[]; archiveName: string; isSidecar: boolean } | null {
	const match = pathname.match(RELEASE_URL_RE);
	if (match === null) return null;
	const [, version, fileName] = match as unknown as [string, string, string];
	// A release dir holds its own archive on two channels: the published
	// `<v>.zip` and the un-advertised developer `<v>-dev.zip`. Anything else
	// (a neighbour version, another grammar) is a probe.
	const archiveName = fileName.startsWith(`${version}-dev`)
		? `${version}-dev.zip`
		: `${version}.zip`;
	const isSidecar = fileName === `${archiveName}.sha256`;
	if (!isSidecar && fileName !== archiveName) return null;
	return { version, triple: version.split('.').map(Number), archiveName, isSidecar };
}

/** The HTTP half: 404 (JSON, like every other not-found here) or the file. */
export async function serveCodeReleaseRequest(
	pathname: string,
	cfg: CodeServingConfig,
	requestId: string = crypto.randomUUID(),
): Promise<Response> {
	// The same opaque miss every route answers (server.ts notFoundResponse):
	// converter-made `resource.not_found` envelope v2 — never a hand-built body.
	const notFound = () => {
		const { status, body } = toErrorEnvelope(new DedaloError('resource.not_found'), {
			requestId,
		});
		return new Response(JSON.stringify(body), {
			status,
			headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS },
		});
	};
	const target = resolveCodeReleaseFile(pathname, cfg);
	if (target === null) return notFound();
	const file = Bun.file(target.path);
	if (!(await file.exists())) return notFound();
	return new Response(file, {
		headers: {
			'Content-Type': target.contentType,
			'Cache-Control': 'no-store',
			...SECURITY_HEADERS,
		},
	});
}
