/**
 * dd_error_report_api — the master installation's error-report intake
 * (WC-017; TS-only, no PHP twin; SECURITY_DECISIONS: error-report intake).
 *
 * ONE pre-auth action, `receive_report`: remote installations' servers relay
 * admin-submitted error reports here machine-to-machine. The dispatcher's Gate
 * 1c already refused the request unless the receiver flag is on and the caller
 * IP is allowed; this handler owns the remaining intake discipline, in order:
 *
 *   1. per-(entity, ip) sliding-window throttle — EVERY request consumes
 *      budget, so floods of junk and token-guessing loops rate-limit alike;
 *   2. shared-token check (constant-time; optional) — a wrong token answers
 *      with the EXACT unregistered-action shape (no existence leak);
 *   3. total-size clamp (the 256 MiB global body cap is useless here);
 *   4. strict shared schema — unknown fields REJECTED; failures answer a terse
 *      generic envelope, never the payload or field-level detail;
 *   5. append to the store, stamping source_ip — the only field (with
 *      received_at) the master trusts; everything else is self-reported.
 *
 * NEVER: fetch/resolve any URL-shaped field (no SSRF surface), log report
 * text (log-injection), or echo internals in error envelopes.
 */

import { reportTokenValid } from '../../error_report/gate.ts';
import {
	REPORT_MAX_SERIALIZED_BYTES,
	reportPayloadTooLarge,
	reportWireSchema,
} from '../../error_report/schema.ts';
import { ensureErrorReportsTable, insertErrorReport } from '../../error_report/store.ts';
import { DedaloError, ok } from '../../errors/index.ts';
import {
	buildThrottleKey,
	isThrottled,
	recordFailedAttempt,
} from '../../security/session_store.ts';
import type { ActionHandler } from '../handler_context.ts';

/** Accepted intake requests per trusted-hop IP, sliding window. */
const INTAKE_MAX_ATTEMPTS = 30;

/**
 * The exact Gate-1 unregistered-action refusal — BYTE-IDENTICAL to what
 * dispatch.ts's `unknownAction()` throws, `details.action` included (WC-017:
 * a wrong token must be indistinguishable from "this endpoint does not exist
 * on this host", and the disabled-receiver gate answers the same thing).
 */
function unknownAction(action: unknown): never {
	throw new DedaloError('request.unknown_action', {
		details: { action: typeof action === 'string' ? action : String(action) },
	});
}

/** The one terse refusal every intake-discipline failure answers with (no field detail, no echo). */
function invalidReport(): never {
	throw new DedaloError('request.invalid', { message: 'Invalid error report' });
}

/** dd_error_report_api action handlers, keyed by action (registered in dispatch.ts). */
export const errorReportApiActions: Record<string, ActionHandler> = {
	receive_report: async (rqo, context) => {
		const options: unknown = rqo.options ?? {};

		// 1 — throttle PER TRUSTED-HOP IP. The key deliberately does NOT include
		// any wire field: `entity` is an attacker-chosen claim, so folding it in
		// would let one IP mint unlimited buckets by rotating it. clientIp is the
		// trusted X-Forwarded-For hop (server.ts clientIpFromRequest), never the
		// spoofable left-most. recordFailedAttempt is the generic sliding-window
		// recorder (its name is login-legacy) and runs for EVERY request — junk,
		// bad tokens, and oversize bodies all spend budget.
		const throttleKey = buildThrottleKey('error_report', '', context.clientIp);
		if (isThrottled(throttleKey, INTAKE_MAX_ATTEMPTS)) {
			throw new DedaloError('rate.limited');
		}
		recordFailedAttempt(throttleKey);

		// 2 — cheap Content-Length fast-reject BEFORE the token/schema work, so a
		// hostile oversize body cannot force the JSON.stringify clamp below.
		// (The body was already parsed by the transport; this only avoids the
		// expensive re-serialization on a body that declares itself too large.)
		if (
			context.bodyByteLength !== undefined &&
			context.bodyByteLength > REPORT_MAX_SERIALIZED_BYTES
		) {
			invalidReport();
		}

		// 3 — optional shared token (constant-time; gate.ts). Wrong/missing when
		// required answers the unregistered-action shape — same as disabled.
		if (!reportTokenValid(context.reportTokenCandidate)) {
			unknownAction(rqo.action);
		}

		// 4 — endpoint-scale size clamp (authoritative; a missing/lying
		// Content-Length still gets caught here).
		if (reportPayloadTooLarge(options)) {
			invalidReport();
		}

		// 4 — strict schema. Terse generic denial: no field detail, no echo.
		const parsed = reportWireSchema.safeParse(options);
		if (!parsed.success) {
			invalidReport();
		}
		const report = parsed.data;

		// 5 — append. source_ip is the trusted-hop address; sender-stamped
		// claims (entity, user_id, versions, langs…) are stored as-is, as
		// self-reported context.
		try {
			await ensureErrorReportsTable();
			const id = await insertErrorReport({
				source_ip: context.clientIp,
				entity: report.entity,
				dedalo_version: report.dedalo_version,
				user_id: report.user_id,
				section_tipo: report.section_tipo,
				section_id: report.section_id,
				page_url: report.page_url,
				description: report.description,
				js_errors: report.js_errors,
				context: {
					entity_label: report.entity_label,
					langs: report.langs,
					sent_at: report.sent_at,
					user_agent: report.user_agent,
					client_globals: report.client_globals,
					report_version: report.report_version,
					screenshot: report.screenshot ?? null,
				},
			});
			// `report_id` ALSO rides at the top level as an extension key: the
			// relaying installation reads `body.ok === true` + `body.report_id`
			// (tools/tool_error_report/server/index.ts).
			return {
				status: 200,
				body: ok(true, { requestId: context.requestId, extend: { report_id: id } }),
			};
		} catch (error) {
			// Structured, id-less server-side note only — never the report text.
			console.warn('[error_report] intake store failed', error);
			throw new DedaloError('internal.unexpected', {
				message: 'error report could not be stored',
				cause: error,
			});
		}
	},
};
