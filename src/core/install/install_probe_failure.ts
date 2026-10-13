/**
 * THE PROBE FAILURE SENTENCE (terminal installer, 2026-10-12) — what a probe
 * answer says when a probe THREW instead of answering.
 *
 * Same law as every wire (engineering/ERRORS_SPEC.md, SEC-17/SEC-18): the raw
 * exception text is the LOG's, never the answer's. A refusal of ours
 * (refuseInstall: a DedaloError with a vetted `publicMessage`) IS the deliberate
 * sentence and travels verbatim — every expected failure of the probes (an
 * unreachable ontology server, a bad archive, a version mismatch) is one. Any
 * other throw is logged to stderr (the probe child's log channel) and answered
 * with a fixed sentence naming only the error's class.
 *
 * Config-free on purpose: the probe child imports it before seeding its boot
 * environment.
 */

import { isDedaloError } from '../errors/dedalo_error.ts';

/** The operator's sentence for a probe that threw (`what` names the probe). */
export function probeFailureSentence(what: string, error: unknown): string {
	if (isDedaloError(error) && error.publicMessage !== undefined) return error.publicMessage;
	console.error(`install probe '${what}': unexpected failure`, error);
	const kind = isDedaloError(error) ? error.code : (error as { name?: unknown })?.name;
	return `the ${what} probe failed unexpectedly (${typeof kind === 'string' ? kind : 'unknown error'})`;
}
