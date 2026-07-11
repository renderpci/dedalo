/**
 * Hardened release-archive download (UPDATE_PROCESS Phase 4) — the same
 * transport posture as the Phase-2 ontology downloader
 * (data_io_import.downloadRemoteOntologyFile), generalized for a code archive:
 * TLS verification ON, origin-pinned to the configured code server, redirects
 * refused, streamed byte ceiling + stall guard, confined destination. The
 * caller verifies the sha256 (WC-024) after this returns.
 */

import { createWriteStream, rmSync } from 'node:fs';
import { assertTlsVerificationOn } from '../ontology/data_io_import.ts';

export const CODE_DOWNLOAD_TIMEOUT_MS = 600_000;
export const CODE_DOWNLOAD_STALL_TIMEOUT_MS = 60_000;
export const MAX_CODE_ARCHIVE_BYTES = 256 * 1024 * 1024;

export interface CodeDownloadResponse {
	result: boolean;
	msg: string;
	errors: string[];
	bytes?: number;
}

/**
 * Stream a release archive from `url` (must sit on `configuredOrigin`) to
 * `targetPath`. Refuses redirects, caps bytes, and guards against a stalled
 * socket. The destination is assumed already confined by the caller.
 */
export async function downloadReleaseArchive(options: {
	url: string;
	configuredOrigin: string;
	targetPath: string;
}): Promise<CodeDownloadResponse> {
	assertTlsVerificationOn();
	const response: CodeDownloadResponse = { result: false, msg: '', errors: [] };

	let parsed: URL;
	try {
		parsed = new URL(options.url);
	} catch {
		response.msg = 'Error. Invalid release URL';
		response.errors.push('invalid url');
		return response;
	}
	if (parsed.origin !== options.configuredOrigin) {
		response.msg = 'Error. Release URL is not on the configured code server';
		response.errors.push(`origin mismatch: ${parsed.origin} != ${options.configuredOrigin}`);
		return response;
	}

	try {
		const remote = await fetch(parsed, {
			redirect: 'error',
			signal: AbortSignal.timeout(CODE_DOWNLOAD_TIMEOUT_MS),
		});
		if (!remote.ok) {
			response.msg = `Error. bad server response code: ${remote.status}`;
			response.errors.push(`bad server response code: ${remote.status}`);
			return response;
		}
		const declared = Number(remote.headers.get('content-length') ?? '0');
		if (declared > MAX_CODE_ARCHIVE_BYTES) {
			response.msg = 'Error. Release archive exceeds the size cap';
			response.errors.push(`content-length ${declared} > ${MAX_CODE_ARCHIVE_BYTES}`);
			return response;
		}
		if (remote.body === null) {
			response.msg = 'Error. empty response body';
			response.errors.push('empty data');
			return response;
		}
		const reader = remote.body.getReader();
		const sink = createWriteStream(options.targetPath);
		let total = 0;
		try {
			for (;;) {
				const chunk = await Promise.race([
					reader.read(),
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error('download stalled')), CODE_DOWNLOAD_STALL_TIMEOUT_MS),
					),
				]);
				if (chunk.done) break;
				total += chunk.value.byteLength;
				if (total > MAX_CODE_ARCHIVE_BYTES) throw new Error('download exceeds the size cap');
				if (!sink.write(chunk.value)) {
					await new Promise<void>((resolveDrain) => sink.once('drain', () => resolveDrain()));
				}
			}
		} finally {
			await new Promise<void>((resolveEnd) => sink.end(() => resolveEnd()));
			reader.releaseLock();
		}
		if (total === 0) {
			rmSync(options.targetPath, { force: true });
			response.msg = 'Error. empty data';
			response.errors.push('empty data');
			return response;
		}
		response.result = true;
		response.msg = 'OK. Release downloaded';
		response.bytes = total;
		return response;
	} catch (error) {
		rmSync(options.targetPath, { force: true });
		response.msg = `Error. Release download failed: ${(error as Error).message}`;
		response.errors.push((error as Error).message);
		return response;
	}
}
