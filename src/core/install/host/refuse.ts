/**
 * THE HOST STEPS' REFUSAL (terminal installer phase 4, 2026-10-12) — the same
 * sentence-twice DedaloError as ../refuse.ts (ERRORS_SPEC §4: a helper may only
 * THROW), built from the error CLASS only: the root process never loads the
 * error log/counters side (the privilege gate holds host/** config-free).
 */

import { DedaloError } from '../../errors/dedalo_error.ts';

export type HostRefusalCode =
	| 'install.invalid_input'
	| 'install.state_conflict'
	| 'install.step_failed';

/** Refuse with `detail` — the operator reads this sentence (never raw exception text). */
export function hostRefuse(code: HostRefusalCode, detail: string): never {
	throw new DedaloError(code, { message: detail, publicMessage: detail });
}
