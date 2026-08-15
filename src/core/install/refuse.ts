/**
 * The install surface's ONE refusal helper (engineering/ERRORS_SPEC.md §4: a
 * helper may exist only if it THROWS — it may never build a body).
 *
 * Why it carries the sentence TWICE. The install wizard is PRE-AUTH and runs on
 * a machine with no ontology and no label catalog, so the only thing
 * render_installer.js can show is the envelope's message (it reads `msg`, which
 * the compat mirror fills from `error.message`). The install codes are therefore
 * `disclosure: 'public'` and the exact reason travels as `publicMessage`.
 * `message` is the SAME sentence for the LOG side (and for `Error.message`,
 * which is what the CLI installer prints from its top-level catch) — without it
 * the operator would read the generic registry English while the wizard read the
 * detail.
 */

import { DedaloError, type ErrorCode } from '../errors/index.ts';

/**
 * Refuse one install step with a caller-readable sentence.
 *
 * `code` picks the category (and therefore the HTTP status): `install.invalid_input`
 * for a bad submitted value, `install.state_conflict` for "not in this state",
 * `install.step_failed` for a machine-side failure (psql, filesystem).
 */
export function refuseInstall(code: ErrorCode, detail: string, cause?: unknown): never {
	throw new DedaloError(code, { message: detail, publicMessage: detail, cause });
}
