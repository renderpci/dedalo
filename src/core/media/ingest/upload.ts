/**
 * UPLOAD RECEIVER — multipart/chunked upload staging (PHP dd_utils_api::upload
 * :925 + join_chunked_files_uploaded :1379).
 *
 * Parses the vendored client's multipart form (Content-Range / X-File-Name /
 * fields key_dir,file_name,chunked,start,end,chunk_index,total_chunks,
 * file_to_upload), sniffs the MAGIC BYTES (never the client Content-Type),
 * cross-validates the extension, stages under the per-user upload tmp dir, and
 * on the final chunk joins + RE-SNIFFS the assembled file (SEC-066). Returns the
 * staged tmp name once the upload is complete; the caller then runs
 * processUploadedFile to add_file + regenerate.
 *
 * Bun's native request.formData() parses the body — no third-party library.
 * Chunks are client-capped (~MB) so buffering one in memory is acceptable;
 * streaming multipart is ledgered as a later optimization.
 */

import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { resolve, sep } from 'node:path';
import { config } from '../../../config/config.ts';
import { sniffAndValidate } from '../engine/mime.ts';
import { sanitizeSegment, stagingDir } from './add_file.ts';

/** The parsed upload request fields. */
export interface ParsedUpload {
	keyDir: string;
	fileName: string;
	chunked: boolean;
	chunkIndex: number;
	totalChunks: number;
	blob: Uint8Array;
}

/** The result of receiving one chunk / a single-shot upload. */
export interface UploadReceiveResult {
	/** True when the whole file is staged and ready for add_file. */
	complete: boolean;
	/** The staged temp file name (present for every chunk, not just the last). */
	tmpName?: string;
	/** The validated/declared extension. */
	extension?: string;
	/** Echoed back so the client can count chunk completion (chunked flow). */
	chunkIndex?: number;
	totalChunks?: number;
}

/** Parse the multipart form into the upload fields. Throws on a malformed body. */
export async function parseUploadRequest(request: Request): Promise<ParsedUpload> {
	const form = await request.formData();
	const fileNameHeader = request.headers.get('X-File-Name');
	const fileNameField = form.get('file_name');
	const fileName = decodeURIComponent(
		typeof fileNameHeader === 'string' && fileNameHeader !== ''
			? fileNameHeader
			: typeof fileNameField === 'string'
				? fileNameField
				: '',
	);
	const file = form.get('file_to_upload');
	if (!(file instanceof Blob)) throw new Error('upload: missing file_to_upload');
	// Server-side size enforcement (M6): reject a received part larger than the
	// configured cap (the value get_system_info advertises), rather than trusting
	// the client. The transport-layer maxRequestBodySize is the outer bound; this
	// enforces the ADVERTISED limit explicitly with a clean error.
	if (file.size > config.media.upload.maxSizeBytes) {
		throw new Error('upload: file exceeds the maximum allowed size');
	}
	const blob = new Uint8Array(await file.arrayBuffer());
	const chunked = String(form.get('chunked') ?? 'false') === 'true';
	return {
		keyDir: String(form.get('key_dir') ?? ''),
		fileName,
		chunked,
		chunkIndex: Number(form.get('chunk_index') ?? 0),
		totalChunks: Number(form.get('total_chunks') ?? 1),
		blob,
	};
}

/** Extension from a file name (lowercased, no dot); '' when none. */
function extensionOf(fileName: string): string {
	const dot = fileName.lastIndexOf('.');
	return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

/** A stable, sanitized staged base name derived from the client file name. */
function stagedTmpName(fileName: string): string {
	const base = fileName.split('/').pop() ?? fileName;
	const cleaned = base.replace(/[^A-Za-z0-9_.\-]/g, '_');
	return cleaned === '' ? 'upload.bin' : cleaned;
}

/**
 * Receive one chunk (or a single-shot upload) for a user. Stages under the
 * per-user upload dir. `mediaRoot` overrides the configured root (scratch tests).
 *
 * IMPORTANT (client contract): the vendored client ALWAYS chunks when the
 * DEDALO_UPLOAD_SERVICE_CHUNK_FILES global is > 0 (even a small 1-chunk file),
 * counts responses by `file_data.chunk_index` / `file_data.total_chunks`, and
 * only AFTER all chunks arrive fires a separate `join_chunked_files_uploaded`
 * RQO. So a chunk POST here just STORES the part and echoes its index/total —
 * the join (assemble + SEC-066 re-sniff) happens in joinChunkedUpload, not here.
 */
export function receiveUpload(
	parsed: ParsedUpload,
	userId: number,
	mediaRoot?: string,
): UploadReceiveResult {
	const dir = stagingDir(userId, parsed.keyDir, mediaRoot);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o750 });
	const tmpName = stagedTmpName(parsed.fileName);
	const extension = extensionOf(parsed.fileName);

	if (!parsed.chunked) {
		// Single-shot: sniff the bytes, validate against the extension, stage.
		sniffAndValidate(parsed.blob, extension);
		writeFileSync(confine(dir, tmpName), parsed.blob);
		return { complete: true, tmpName, extension, chunkIndex: 0, totalChunks: 1 };
	}

	// Chunked: store the part as <chunkIndex>-<tmp>.blob. The client drives the
	// join once it has counted all chunks. Echo index/total so its counter works.
	writeFileSync(confine(dir, `${parsed.chunkIndex}-${tmpName}.blob`), parsed.blob);
	return {
		complete: false,
		tmpName,
		extension,
		chunkIndex: parsed.chunkIndex,
		totalChunks: parsed.totalChunks,
	};
}

/**
 * Assemble a chunked upload's parts into the final staged file and RE-SNIFF the
 * whole (SEC-066), then return the staged descriptor. Called by the
 * dd_utils_api.join_chunked_files_uploaded action after the client has posted
 * every chunk. `totalChunks` is derived from the client's files_chunked array.
 */
export function joinChunkedUpload(
	keyDir: string,
	tmpName: string,
	totalChunks: number,
	userId: number,
	mediaRoot?: string,
): UploadReceiveResult {
	const dir = stagingDir(userId, keyDir, mediaRoot);
	const safeTmp = sanitizeSegment(tmpName);
	const extension = extensionOf(safeTmp);
	// Confirm every part is present before joining (fail-closed).
	for (let i = 0; i < totalChunks; i++) {
		if (!existsSync(confine(dir, `${i}-${safeTmp}.blob`))) {
			throw new Error(`join: missing chunk ${i} of ${totalChunks}`);
		}
	}
	const assembled = confine(dir, `${safeTmp}.assembling`);
	if (existsSync(assembled)) unlinkSync(assembled);
	writeFileSync(assembled, new Uint8Array(0));
	for (let i = 0; i < totalChunks; i++) {
		const part = confine(dir, `${i}-${safeTmp}.blob`);
		appendFileSync(assembled, new Uint8Array(readFileSync(part)));
		unlinkSync(part);
	}
	const bytes = new Uint8Array(readFileSync(assembled));
	try {
		sniffAndValidate(bytes, extension);
	} catch (error) {
		unlinkSync(assembled);
		throw error;
	}
	renameSync(assembled, confine(dir, safeTmp));
	return { complete: true, tmpName: safeTmp, extension, chunkIndex: 0, totalChunks };
}

/** Confine a name inside the staging dir (defense in depth over sanitizeSegment). */
function confine(dir: string, name: string): string {
	const safe = name.includes('/') ? sanitizeSegment(name) : name;
	const full = resolve(dir, safe);
	if (!full.startsWith(dir + sep)) {
		throw new Error('upload path escapes staging dir');
	}
	return full;
}
