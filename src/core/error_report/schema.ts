/**
 * Shared payload schema for the error-report flow (WC-017/019).
 *
 * ONE schema validates at BOTH trust boundaries:
 * - the sender tool handler (tools/tool_error_report/server) validates what the
 *   browser submitted before stamping identity and relaying;
 * - the receiver intake (api/handlers/dd_error_report_api.ts) re-validates the
 *   whole wire payload — the master cannot verify a remote installation, so
 *   every field arrives as an untrusted claim regardless of what the sender
 *   asserts (SECURITY_DECISIONS: error-report intake).
 *
 * Shape rules (security design, 2026-07-10):
 * - `.strict()` everywhere: unknown fields are REJECTED, not stripped;
 * - every string is length-clamped; `section_tipo` passes the REWRITE_SPEC §7.6
 *   identifier chokepoint shape before it may ever reach SQL or logs;
 * - the whole serialized payload is capped (REPORT_MAX_SERIALIZED_BYTES) — the
 *   global body cap (256 MiB) is far too large for this endpoint.
 *
 * Explicitly NEVER part of the schema: csrf_token, username, db name, engine
 * versions, filesystem paths, raw query strings (see the tool's client JS —
 * the payload is allowlist-CONSTRUCTED, never spread from page_globals).
 */

import { z } from 'zod';

/** REWRITE_SPEC §7.6 identifier chokepoint shape (is_valid_tipo). */
const TIPO_PATTERN = /^[a-z]+[0-9]+$/;

/** Hard cap on the serialized options payload at both ends (bytes). */
export const REPORT_MAX_SERIALIZED_BYTES = 256 * 1024;

/** Max captured-error entries per report (matches the client buffer bound). */
export const REPORT_MAX_JS_ERRORS = 50;

/** One captured entry of the client buffer (window.dedalo_js_errors). */
const jsErrorSchema = z
	.object({
		type: z.enum(['error', 'unhandledrejection']),
		msg: z.string().max(2000).nullable(),
		source: z.string().max(1024).nullable(),
		line: z.number().int().nullable(),
		col: z.number().int().nullable(),
		stack: z.string().max(6000).nullable(),
		time: z.string().max(40).nullable(),
		count: z.number().int().min(1).max(1_000_000),
	})
	.strict();

/**
 * Informational browser snapshot. Stored inside the `context` jsonb, never
 * trusted and never used for identity — the servers stamp their own.
 */
const clientGlobalsSchema = z
	.object({
		user_id: z.number().int().nullable(),
		dedalo_version: z.string().max(128).nullable(),
		application_lang: z.string().max(128).nullable(),
		data_lang: z.string().max(128).nullable(),
	})
	.strict();

/** What the BROWSER may legitimately supply (only client-observable context). */
export const reportSubmissionSchema = z
	.object({
		description: z.string().min(1).max(8000),
		page_url: z.string().max(2048).nullable(),
		section_tipo: z.string().regex(TIPO_PATTERN).max(64).nullable(),
		section_id: z.string().max(64).nullable(),
		user_agent: z.string().max(512).nullable(),
		js_errors: z.array(jsErrorSchema).max(REPORT_MAX_JS_ERRORS),
		client_globals: clientGlobalsSchema.nullable(),
	})
	.strict();

export type ReportSubmission = z.infer<typeof reportSubmissionSchema>;

/**
 * The full wire payload the receiver accepts: the submission plus the fields
 * the SENDER'S SERVER stamped (self-reported claims on the receiving side).
 */
export const reportWireSchema = reportSubmissionSchema
	.extend({
		user_id: z.number().int().nullable(),
		entity: z.string().max(128).nullable(),
		entity_label: z.string().max(128).nullable(),
		dedalo_version: z.string().max(128).nullable(),
		langs: z
			.object({
				application: z.string().max(128).nullable(),
				data: z.string().max(128).nullable(),
			})
			.strict()
			.nullable(),
		sent_at: z.string().max(40).nullable(),
		report_version: z.literal(1),
	})
	.strict();

export type ReportWire = z.infer<typeof reportWireSchema>;

/** True when the serialized payload exceeds the endpoint cap. */
export function reportPayloadTooLarge(payload: unknown): boolean {
	try {
		return JSON.stringify(payload).length > REPORT_MAX_SERIALIZED_BYTES;
	} catch {
		// Unserializable (circular/bigint) input never passes the schema anyway;
		// treat it as oversized so the caller refuses early.
		return true;
	}
}
