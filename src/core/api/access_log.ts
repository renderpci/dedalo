/**
 * Structured API access log + request gauges (audit S2-37, WS-E item 4).
 *
 * The minimum viable ops surface: ONE JSON line per API request on stdout —
 * `{ts, request_id, user_id, api, status, ms, error_code?, error_category?}`
 * (the error identity ONLY on an ok:false outcome) — enabled by DEDALO_ACCESS_LOG
 * (config.ops.accessLog; journald/systemd captures stdout, PRODUCTION.md).
 * Independent of the flag, requests slower than config.ops.slowRequestMs emit
 * a warn line, and every request feeds the in-memory counters the admin
 * counters endpoint aggregates (core/api/counters.ts).
 *
 * dispatchRqo calls this once per request from its logging wrapper — the
 * timing (`startedAt`, performance.now() based) and identity are already in
 * hand there; this module only formats and counts. No I/O beyond console.
 */

import { config } from '../../config/config.ts';
import { incrementCounter, observeRequest } from './counters.ts';

export interface AccessLogEntry {
	requestId: string;
	/** Resolved user id, or null for unauthenticated requests. */
	userId: number | null;
	apiClass: string;
	action: string;
	/** HTTP status of the dispatch outcome. */
	status: number;
	/** Wall-clock handler duration in milliseconds. */
	ms: number;
	/** Compact request-shape summary (dispatch summarizeRqo) — printed on the
	 * slow-request warn so a slow line is diagnosable after the fact. */
	detail?: string;
	/** Registered error code of an ok:false outcome (envelope v2); absent on success. */
	error_code?: string;
	/** Its category (caller/auth/permission/…); absent on success. */
	error_category?: string;
}

/** Log one finished API request (call unconditionally; flags are checked here). */
export function logApiAccess(entry: AccessLogEntry): void {
	const ms = Math.round(entry.ms * 10) / 10;
	const api = `${entry.apiClass}::${entry.action}`;
	observeRequest(entry.status, ms);
	if (config.ops.accessLog) {
		// One parseable JSON object per line — the documented log contract.
		console.log(
			JSON.stringify({
				ts: new Date().toISOString(),
				type: 'access',
				request_id: entry.requestId,
				user_id: entry.userId,
				api,
				status: entry.status,
				ms,
				// undefined on success → JSON.stringify drops the keys (no branch).
				error_code: entry.error_code,
				error_category: entry.error_category,
			}),
		);
	}
	if (config.ops.slowRequestMs > 0 && ms >= config.ops.slowRequestMs) {
		incrementCounter('requests_slow');
		const detail = entry.detail !== undefined && entry.detail !== '' ? ` ${entry.detail}` : '';
		console.warn(
			`[slow-request] ${api} took ${ms}ms (threshold ${config.ops.slowRequestMs}ms) ` +
				`[req ${entry.requestId}, user ${entry.userId ?? 'anon'}]${detail}`,
		);
	}
}
