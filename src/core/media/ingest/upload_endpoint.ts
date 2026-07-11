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
	// CSRF: state-changing, constant-time compare.
	if (!verifyCsrf(session, csrfCandidate)) {
		return json({ result: false, msg: 'CSRF validation failed' }, 403);
	}
	try {
		const parsed = await parseUploadRequest(request);
		const received = receiveUpload(parsed, session.userId);
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
			},
		});
	} catch (error) {
		// Validation failures (bad MIME, traversal, polyglot) → 400, no detail leak.
		return json({ result: false, msg: 'Upload rejected', errors: [(error as Error).message] }, 400);
	}
}
