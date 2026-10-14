/**
 * THE PROBE FAILURE SENTENCE (terminal installer, 2026-10-12) — what a probe
 * answer says when a probe THREW instead of answering.
 *
 * A refusal of ours (refuseInstall: a DedaloError with a vetted
 * `publicMessage`) IS the deliberate sentence and travels verbatim — every
 * expected failure of the probes (an unreachable ontology server, a bad
 * archive, a version mismatch) is one.
 *
 * Any other throw is a DEFECT the operator must be able to report (campaign 3,
 * 2026-10-13: a bare "(Error)" said nothing). The answer names the error's
 * class AND a SHORT summary — the message's first line, made inert for a
 * terminal (display_text.ts sanitizeLine), credentials in a URL or a
 * `password=` pair masked, the request's secrets redacted, capped — and WHERE
 * the full text (stack, cause) was written: a 0600 file of its own under the
 * system temp dir, created exclusively (the probe child's stderr is dropped by
 * the parent once the child answered — install_probe_client.ts — so stderr is
 * no place to send the operator). This answer is the INSTALLER OPERATOR'S
 * TERMINAL on their own machine, never an HTTP wire (engineering/ERRORS_SPEC.md
 * SEC-17/SEC-18 govern the API envelope; the summary is still bounded and
 * redacted the same way a log line is).
 *
 * Config-free on purpose: the probe child imports it before seeding its boot
 * environment.
 */

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDedaloError } from '../errors/dedalo_error.ts';
import { firstLine } from './display_text.ts';
import { redactSecrets } from './run_files_core.ts';

/** The summary's bound (columns): one screen line, never a dump. */
export const SUMMARY_MAX = 160;

/** Where the full text goes: answers the path written, or null when it could not be. */
export type FailureLogWriter = (what: string, text: string) => string | null;

/** The default writer: a fresh 0600 file under the system temp dir (`wx`: never follows or reuses one). */
export const tempFileFailureLog: FailureLogWriter = (what, text) => {
	const path = join(
		tmpdir(),
		`dedalo-install-probe-${what.replace(/[^a-z0-9_-]/gi, '_')}-${process.pid}-${Date.now()}.log`,
	);
	try {
		writeFileSync(path, text, { mode: 0o600, flag: 'wx' });
		return path;
	} catch {
		return null;
	}
};

/** Credentials a message may carry by accident: `scheme://user:pass@` and `password=…` pairs. */
export function maskCredentials(text: string): string {
	return text
		.replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]*@/gi, '$1***@')
		.replace(/\b(pass(?:word)?|pwd|secret|token)(\s*[=:]\s*)\S+/gi, '$1$2***');
}

/** The thrown value's own text (an Error's message; anything else, its string form). */
function thrownText(error: unknown): string {
	if (error instanceof Error) return error.message;
	return typeof error === 'string' ? error : '';
}

/** The class an operator reports: a registry code, an Error's name, else 'unknown error'. */
function thrownClass(error: unknown): string {
	if (isDedaloError(error)) return error.code;
	const name = (error as { name?: unknown } | null)?.name;
	return typeof name === 'string' && name !== '' ? name : 'unknown error';
}

/** The summary: the first line, sanitized, credentials masked, secrets redacted, capped. */
export function failureSummary(error: unknown, secrets: readonly string[] = []): string {
	const line = redactSecrets(maskCredentials(firstLine(thrownText(error))), secrets).trim();
	return line.length > SUMMARY_MAX ? `${line.slice(0, SUMMARY_MAX - 1)}…` : line;
}

/**
 * The operator's sentence for a probe that threw (`what` names the probe).
 * `secrets`: the request's secret values (redacted from the summary AND the
 * logged text); `log`: where the full text goes (a gate injects one).
 */
export function probeFailureSentence(
	what: string,
	error: unknown,
	secrets: readonly string[] = [],
	log: FailureLogWriter = tempFileFailureLog,
): string {
	if (isDedaloError(error) && error.publicMessage !== undefined) return error.publicMessage;
	const full = redactSecrets(maskCredentials(Bun.inspect(error)), secrets);
	console.error(`install probe '${what}': unexpected failure\n${full}`);
	const path = log(what, `install probe '${what}': unexpected failure\n${full}\n`);
	const summary = failureSummary(error, secrets);
	const where =
		path === null
			? 'the full text could not be written to a log file'
			: `full text logged to ${path}`;
	return `the ${what} probe failed unexpectedly (${thrownClass(error)}${summary === '' ? '' : `: ${summary}`}) — ${where}`;
}
