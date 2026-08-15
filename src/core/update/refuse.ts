/**
 * The update subsystem's ONE refusal helper (engineering/ERRORS_SPEC.md §4: a
 * helper may exist only if it THROWS — it may never build a body).
 *
 * The update codes are `disclosure: 'public'` because the operator running a
 * code update from the maintenance dashboard has to be told WHICH gate refused
 * ("checksum mismatch", "no supervisor detected", "not a linear upgrade") —
 * a generic sentence would leave a stuck install with nothing to act on. The
 * same sentence is passed as `message` so the LOG line and `Error.message`
 * carry it too, instead of the generic registry English.
 */

import { DedaloError, type ErrorCode, isDedaloError } from '../errors/index.ts';

/**
 * Refuse an update step with an operator-readable sentence.
 *
 * `code`: `request.invalid_options` for a malformed request field,
 * `update.refused` for a state gate, `update.failed` for the machine/network
 * half (download, extract, swap).
 */
export function refuseUpdate(code: ErrorCode, detail: string, cause?: unknown): never {
	throw new DedaloError(code, { message: detail, publicMessage: detail, cause });
}

/**
 * The catch-all of a pipeline whose own gates throw: a REGISTERED refusal that
 * bubbled out of the try is rethrown UNCHANGED (laundering `update.refused —
 * checksum mismatch` into a generic `update.failed` would destroy the one thing
 * the operator needs), and anything else is wrapped as `code` with the original
 * kept as `cause`.
 */
export function rethrowOrRefuseUpdate(error: unknown, code: ErrorCode, detail: string): never {
	if (isDedaloError(error)) throw error;
	refuseUpdate(code, detail, error);
}
