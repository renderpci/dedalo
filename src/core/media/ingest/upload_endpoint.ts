/**
 * MEDIA UPLOAD HTTP ENDPOINT — the multipart branch of the API path.
 *
 * Authenticates the session, enforces CSRF (upload is NOT exempt — SEC-008),
 * receives/stages the chunk(s), and returns the `file_data` descriptor the
 * client hands to tool_upload.process_uploaded_file (PHP two-call flow:
 * dd_utils_api::upload → tool_upload::process_uploaded_file). Fail-closed: no
 * session → 404 (no existence leak), bad CSRF → 403, bad file → 400.
 */

import type { Session } from '../../security/session_store.ts';
import { verifyCsrf } from '../../security/session_store.ts';
import { createStagedThumbnail } from './staged_thumbnail.ts';
import { parseUploadRequest, receiveUpload } from './upload.ts';

/** Build a JSON Response with a status. */
function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

/**
 * Handle a multipart upload POST. `session` is the resolved TS session (null =
 * anonymous), `csrfCandidate` the header/field token.
 */
export async function handleMediaUpload(
	request: Request,
	session: Session | null,
	csrfCandidate: string | null,
): Promise<Response> {
	// Auth: anonymous callers get a 404 (never reveal the endpoint or leak state).
	if (session === null) return json({ result: false, msg: 'Not found' }, 404);

	// CSRF: state-changing, constant-time compare. Accepts the header OR the
	// `csrf_token` form field (SEC-008 twin — both upload clients send both; the
	// field covers an intermediary that strips the custom header). Reading the
	// field means parsing the body BEFORE the CSRF verdict, which is safe here
	// because the session gate above already ran and the body is bounded by the
	// transport-level maxRequestBodySize plus the per-part size cap in
	// parseUploadRequest. Fail-closed: a parse failure never reaches the verdict.
	let parsed: Awaited<ReturnType<typeof parseUploadRequest>>;
	try {
		parsed = await parseUploadRequest(request);
	} catch (error) {
		return json(
			{
				result: false,
				msg: 'Upload rejected',
				errors: [(error as Error).message],
			},
			400,
		);
	}
	if (!verifyCsrf(session, csrfCandidate) && !verifyCsrf(session, parsed.csrfToken)) {
		return json(
			{ result: false, msg: 'CSRF validation failed', errors: ['CSRF validation failed'] },
			403,
		);
	}
	try {
		const received = receiveUpload(parsed, session.userId);
		// Preview thumbnail (PHP file_data->thumbnail_url). Only once the whole
		// file is staged — a lone chunk is not an image yet. Best effort: null on
		// any failure, and the client then keeps its own local preview.
		const thumbnailUrl =
			received.complete && received.tmpName
				? await createStagedThumbnail(
						session.userId,
						parsed.keyDir,
						received.tmpName,
						received.extension ?? null,
					)
				: null;
		return json({
			result: true,
			msg: 'ok',
			// file_data MUST echo chunk_index + total_chunks: the client counts
			// chunk completion by these (files_chunked[chunk_index]=tmp_name;
			// count === total_chunks → fire join_chunked_files_uploaded). Omitting
			// them made total_chunks NaN → the join never fired → uploads hung.
			file_data: {
				key_dir: parsed.keyDir,
				tmp_name: received.tmpName ?? null,
				extension: received.extension ?? null,
				chunked: parsed.chunked,
				chunk_index: received.chunkIndex ?? 0,
				total_chunks: received.totalChunks ?? 1,
				complete: received.complete,
				// The TRANSFER IDENTITY (WC-2026-08-03-chunked-upload-identity).
				// Echoed so it round-trips: the client forwards the LAST chunk's
				// file_data verbatim into join_chunked_files_uploaded, which is how the
				// join finds exactly THIS transfer's parts instead of guessing from a
				// file name two different uploads can share.
				upload_id: received.uploadId ?? null,
				// PHP dd_utils_api :1269 — null when the format is not previewable.
				thumbnail_url: thumbnailUrl,
			},
		});
	} catch (error) {
		// Validation failures (bad MIME, traversal, polyglot) → 400, no detail leak.
		// ONE machine-readable error key: `errors` (array), the shape
		// `upload_transport.js` reads (`errors[]` then `msg`). The former sibling
		// `error` (string) existed ONLY because Dropzone 5's default renderer
		// unwraps `.error`; with service_dropzone deleted it has no consumer
		// (WC-2026-08-03-service-dropzone-folded-into-service-upload, which
		// REVERSES the WC-078 "error bodies gain an `error` string key" section).
		// The rejection body key set is pinned by test/unit/media_upload_endpoint.
		return json(
			{
				result: false,
				msg: 'Upload rejected',
				errors: [(error as Error).message],
			},
			400,
		);
	}
}
