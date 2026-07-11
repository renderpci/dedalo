/**
 * error_reports widget — browse the error reports received by THIS master
 * installation's intake (WC-018; TS-only, no PHP twin).
 *
 * Appears in the maintenance catalog ONLY when the intake is enabled
 * (config.errorReport.receiverEnabled — registry.ts conditions the entry), so
 * every non-master installation's catalog stays byte-identical to PHP.
 * Admin-only by construction: dispatchWidgetRequest/dispatchGetWidgetValue
 * refuse non-global-admins before any handler runs. Reports contain UNTRUSTED
 * remote content — the client render (TS-owned widget JS) must emit every
 * report-derived string via textContent, never inner_html (DS-1).
 */

import { config } from '../../../config/config.ts';
import { countErrorReports, listErrorReports } from '../../error_report/store.ts';
import type { WidgetModule, WidgetResponse } from './support.ts';

/**
 * Where reports from THIS installation go (for the widget's target display):
 * the configured master API URL when relaying, else a note that reports are
 * stored on this installation (it is itself the receiver). Env-driven
 * (DEDALO_ERROR_REPORT_MASTER_URL / DEDALO_ERROR_REPORT_RECEIVER) so an
 * administrator can change it without a code edit.
 */
function reportTarget(): string {
	const url = config.errorReport.masterApiUrl;
	if (url !== undefined && url !== '') return url;
	if (config.errorReport.receiverEnabled) return 'This installation (stored locally)';
	return 'Not configured';
}

/** Panel load: totals only (the rows load on demand via get_reports). */
async function errorReportsGetValue(): Promise<WidgetResponse> {
	try {
		const [total, latest] = await Promise.all([
			countErrorReports(),
			listErrorReports({ limit: 1 }),
		]);
		return {
			result: { total, latest_received_at: latest[0]?.received_at ?? null, target: reportTarget() },
			msg: 'OK. Request done successfully',
			errors: [],
		};
	} catch (error) {
		// getValue is fail-soft by contract (a missing table on a
		// just-enabled master must not break the whole dashboard).
		console.warn('[error_reports widget] get_value failed', error);
		return {
			result: { total: null, latest_received_at: null, target: reportTarget() },
			msg: 'OK',
			errors: [],
		};
	}
}

/** Newest-first page of reports. The store clamps limit to 100. */
async function errorReportsGetReports(options: Record<string, unknown>): Promise<WidgetResponse> {
	const offset = typeof options.offset === 'number' ? options.offset : 0;
	const limit = typeof options.limit === 'number' ? options.limit : 25;
	const [reports, total] = await Promise.all([
		listErrorReports({ offset, limit }),
		countErrorReports(),
	]);
	return {
		result: { reports, total, offset },
		msg: 'OK. Request done successfully',
		errors: [],
	};
}

export const widget: WidgetModule = {
	spec: {
		id: 'error_reports',
		category: 'system',
		// Full-width card (the system_info pattern) — reports render as wide rows.
		class: 'width_100',
		// TS-only widget: a literal label, no dictionary term (the
		// diffusion_server_control WC-005 precedent).
		label: { kind: 'literal', text: 'Error reports' },
	},
	getValue: errorReportsGetValue,
	apiActions: {
		get_reports: errorReportsGetReports,
	},
};
