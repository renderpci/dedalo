/**
 * failureBody — the one place a door-holding module in this source turns an unknown caught value
 * into its reportable form: the error system's whole wire body (code, category, message,
 * label_key, ...), never a flattened message string, so the client renders it with the same
 * label/message helpers as every other per-item error. Kept in its own file (imports NO outbound
 * door) so acquisition.ts (which imports harvestFetch) never itself carries a literal property
 * read off an error/result object in its own source — the tool-wide rule a door holder's file
 * must honor (ssrf_one_guard_tripwire, docs/development/tools/security.md item 7).
 */

import {
	type ApiErrorBody,
	toDedaloError,
	toErrorBody,
} from '../../../../../../src/core/errors/index.ts';

export function failureBody(error: unknown): ApiErrorBody {
	return toErrorBody(toDedaloError(error));
}
