/**
 * tool_error_report — server half (WC-019; SECURITY_DECISIONS: error-report
 * intake). ONE action, `send_report`: the tool's client posts the admin's
 * report here (authenticated tool_request), and this handler validates,
 * SERVER-STAMPS identity, and relays it to the master installation's intake
 * (dd_error_report_api:receive_report, WC-017).
 *
 * Trust model (RT-1/RT-2): the browser supplies only client-observable context
 * (description, page path, section locator, captured JS errors); this handler
 * stamps user_id/entity/version/langs/sent_at itself from principal + config —
 * the browser can never spoof who reported or from where. The receiver still
 * re-validates everything (the master trusts no remote installation).
 *
 * Routing: DEDALO_ERROR_REPORT_MASTER_URL set → outbound relay (https-only,
 * loopback http allowed for dev; AbortController + config timeout; optional
 * X-Dedalo-Report-Token). Else, when THIS server is the master
 * (DEDALO_ERROR_REPORT_RECEIVER) → store directly, no HTTP loopback. Else →
 * honest "not configured" failure. Best-effort per CONVENTIONS §1: a failed
 * relay logs a message-only warn (never the payload or token) and returns an
 * honest failure envelope so the admin gets feedback.
 */

import { config } from '../../../src/config/config.ts';
import {
	type ReportWire,
	reportPayloadTooLarge,
	reportSubmissionSchema,
} from '../../../src/core/error_report/schema.ts';
import {
	ensureErrorReportsTable,
	insertErrorReport,
} from '../../../src/core/error_report/store.ts';
import { currentApplicationLang, currentDataLang } from '../../../src/core/resolve/request_lang.ts';
import type {
	ToolActionContext,
	ToolResponse,
	ToolServerModule,
} from '../../../src/core/tools/module.ts';
import { DEDALO_ENGINE_VERSION } from '../../../src/core/update/version.ts';

/** The relay-routing settings (defaults to the boot config catalog). */
export interface RelaySettings {
	masterApiUrl: string | undefined;
	receiverEnabled: boolean;
	token: string | undefined;
	relayTimeoutMs: number;
}

/** Injectable seams for tests (mock fetch / local store / settings). */
export interface SendReportDeps {
	fetchImpl: typeof fetch;
	storeLocally: (report: ReportWire) => Promise<number>;
	settings?: RelaySettings;
}

const defaultDeps: SendReportDeps = {
	fetchImpl: fetch,
	storeLocally: async (report) => {
		await ensureErrorReportsTable();
		return insertErrorReport({
			// The master's own admin reporting on the master itself: the "sender"
			// and receiver are the same process, so the source is local.
			source_ip: 'local',
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
			},
		});
	},
};

function failed(msg: string, errors: string[]): ToolResponse {
	return { result: false, msg, errors };
}

/** https-only, except loopback http for the two-server dev flow. */
export function masterUrlAllowed(rawUrl: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(rawUrl);
	} catch {
		return false;
	}
	if (parsed.protocol === 'https:') return true;
	if (parsed.protocol !== 'http:') return false;
	return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(parsed.hostname);
}

/** Build the send_report handler with injectable deps (tests mock the seams). */
export function buildSendReportHandler(deps: SendReportDeps = defaultDeps) {
	return async function sendReport(context: ToolActionContext): Promise<ToolResponse> {
		const settings: RelaySettings = deps.settings ?? config.errorReport;
		// Defense in depth over the registry non-grant: admins only.
		if (!context.principal.isGlobalAdmin) {
			return failed('Error report is an administrators-only tool', ['unauthorized']);
		}

		// Validate the browser-supplied submission (shared schema; strict).
		const parsed = reportSubmissionSchema.safeParse(context.options);
		if (!parsed.success) {
			return failed('Invalid error report submission', ['invalid_submission']);
		}
		const submission = parsed.data;

		// Server-stamp identity/time (never from the browser).
		const report: ReportWire = {
			...submission,
			user_id: context.userId,
			entity: config.entity,
			entity_label: config.identity.entityLabel ?? null,
			dedalo_version: DEDALO_ENGINE_VERSION,
			langs: { application: currentApplicationLang(), data: currentDataLang() },
			sent_at: new Date().toISOString(),
			report_version: 1,
		};

		// Fit the size cap by dropping the OLDEST captured errors first — never
		// fail the admin's submit on size (the description always survives).
		while (reportPayloadTooLarge(report) && report.js_errors.length > 0) {
			report.js_errors = report.js_errors.slice(1);
		}
		if (reportPayloadTooLarge(report)) {
			return failed('Error report is too large', ['too_large']);
		}

		const masterUrl = settings.masterApiUrl;
		if (masterUrl !== undefined && masterUrl !== '') {
			if (!masterUrlAllowed(masterUrl)) {
				console.warn('[tool_error_report] DEDALO_ERROR_REPORT_MASTER_URL refused (https required)');
				return failed('Error report relay is misconfigured', ['relay_misconfigured']);
			}
			// Outbound relay (the llm_provider fetch shape: abort + try/finally).
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), settings.relayTimeoutMs);
			try {
				const headers: Record<string, string> = { 'Content-Type': 'application/json' };
				if (settings.token !== undefined && settings.token !== '') {
					headers['X-Dedalo-Report-Token'] = settings.token;
				}
				const response = await deps.fetchImpl(masterUrl, {
					method: 'POST',
					headers,
					body: JSON.stringify({
						dd_api: 'dd_error_report_api',
						action: 'receive_report',
						options: report,
					}),
					signal: controller.signal,
				});
				if (!response.ok) {
					throw new Error(`relay_http_${response.status}`);
				}
				const body = (await response.json()) as { result?: unknown; report_id?: unknown };
				if (body.result !== true) {
					throw new Error('relay_rejected');
				}
				return {
					result: { delivered: true, via: 'master' },
					msg: 'OK. Report sent to the master installation',
					errors: [],
				};
			} catch (error) {
				// Message only — NEVER the payload or the token (CONVENTIONS §1).
				const message = error instanceof Error ? error.message : String(error);
				console.warn('[tool_error_report] relay failed', message);
				return failed('The report could not be delivered to the master installation', [
					'relay_failed',
				]);
			} finally {
				clearTimeout(timer);
			}
		}

		if (settings.receiverEnabled) {
			// THIS server is the master: store directly, no HTTP loopback.
			try {
				const id = await deps.storeLocally(report);
				return {
					result: { delivered: true, via: 'local', report_id: id },
					msg: 'OK. Report stored on this installation',
					errors: [],
				};
			} catch (error) {
				console.warn('[tool_error_report] local store failed', error);
				return failed('The report could not be stored', ['store_failed']);
			}
		}

		return failed('Error report relay is not configured (set DEDALO_ERROR_REPORT_MASTER_URL)', [
			'relay_not_configured',
		]);
	};
}

export const tool: ToolServerModule = {
	name: 'tool_error_report',
	apiActions: {
		// permission: null — the gate is imperative: isGlobalAdmin, first line of
		// the handler (the registry non-grant already hides the tool from
		// non-admins; this is the defense-in-depth backstop).
		send_report: { permission: null, handler: buildSendReportHandler() },
	},
};
