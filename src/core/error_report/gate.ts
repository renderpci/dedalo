/**
 * Error-report intake gate (WC-017; SECURITY_DECISIONS: error-report intake).
 *
 * The intake action (dd_error_report_api:receive_report) is pre-auth by design:
 * remote installations relay reports machine-to-machine with no session on the
 * master. Mirroring the install-window gate, this module owns the predicates
 * and the dispatcher wires them in front of the auth gate (Gate 1c):
 * - receiver disabled → the dispatcher answers with the EXACT unregistered-
 *   action shape, so a probe cannot learn the endpoint exists on this host;
 * - IP allowlist (optional, DEDALO_ERROR_REPORT_ALLOWED_IPS) on the trusted-hop
 *   clientIp, same grammar as the install gate;
 * - shared token (optional, DEDALO_ERROR_REPORT_TOKEN): a per-master-deployment
 *   spam filter, checked constant-time INSIDE the handler (after the throttle,
 *   so token guessing consumes throttle budget) — never an authentication
 *   factor; payload fields stay untrusted regardless.
 *
 * Like the install gate, the predicates read env AT CALL TIME (readEnv, the
 * sanctioned reader) rather than the boot-frozen config catalog — the same
 * keys are censused in config.errorReport for the relay side.
 */

import crypto from 'node:crypto';
import { readEnv } from '../../config/env.ts';
import { readString } from '../../config/readers.ts';

/** The (class:action) pairs that make up the pre-auth intake surface. */
export const ERROR_REPORT_ACTION_KEYS: ReadonlySet<string> = new Set([
	'dd_error_report_api:receive_report',
]);

/** True when THIS server exposes the intake (only the designated master). */
export function receiverEnabled(): boolean {
	return readString('DEDALO_ERROR_REPORT_RECEIVER') === 'true';
}

/**
 * Is the caller's IP allowed to reach the intake? Same grammar as the install
 * gate: comma-separated entries, `loopback` shorthand, unset → open (the
 * intake is still throttled + size-capped). `clientIp` is the dispatcher's
 * already-resolved trusted-hop address (server.ts clientIpFromRequest).
 */
export function reporterIpAllowed(clientIp: string): boolean {
	const raw = readEnv('DEDALO_ERROR_REPORT_ALLOWED_IPS');
	if (raw === undefined || raw.trim() === '') return true;
	const loopback = new Set(['local', '127.0.0.1', '::1', '::ffff:127.0.0.1']);
	for (const entry of raw.split(',').map((item) => item.trim())) {
		if (entry === '') continue;
		if (entry === 'loopback' && loopback.has(clientIp)) return true;
		if (entry === clientIp) return true;
	}
	return false;
}

/**
 * Constant-time token check (hash_equals posture, like verifyCsrf). When no
 * token is configured the check passes — the operator opted out of the filter.
 */
export function reportTokenValid(candidate: string | null | undefined): boolean {
	const expected = readEnv('DEDALO_ERROR_REPORT_TOKEN');
	if (expected === undefined || expected === '') return true;
	if (candidate === null || candidate === undefined || candidate.length === 0) return false;
	const expectedBuffer = Buffer.from(expected);
	const candidateBuffer = Buffer.from(candidate);
	if (expectedBuffer.length !== candidateBuffer.length) return false;
	return crypto.timingSafeEqual(expectedBuffer, candidateBuffer);
}
