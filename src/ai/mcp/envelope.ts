/**
 * MCP structured-output envelope — the ONE response shape every Dédalo tool
 * returns, on every surface (stdio server, in-process HTTP bridge, agent
 * loop). Adopted from the dedalo-work-mcp reference (rewrite/ai/mcp_review.md §3):
 *
 *   success: { ok: true,  data, pagination? }
 *   failure: { ok: false, error: { code, message, hint? } }
 *
 * The hint is FOR THE MODEL: each one states the next move an agent should
 * take (resolve the tipo, ask an admin, refine the match), so a failed call
 * steers the loop instead of dead-ending it. Handlers stay pure and THROW
 * plain engine errors; `wrapError` is the single place those become coded
 * envelopes — tools never invent ad-hoc error shapes.
 */

export interface PaginationOut {
	/** Gated total when the search counted, null when it did not (cheap page). */
	total: number | null;
	offset: number;
	/** Items actually returned on this page. */
	count: number;
	has_more: boolean;
	next_offset: number | null;
}

export interface StructuredOk<T = unknown> {
	ok: true;
	data: T;
	pagination?: PaginationOut;
}

export interface StructuredErr {
	ok: false;
	error: { code: string; message: string; hint?: string; details?: unknown };
}

export type Structured<T = unknown> = StructuredOk<T> | StructuredErr;

/**
 * The hint catalog — every code an envelope can carry, with the model-facing
 * next move. Keep hints imperative and specific (review doc §3): a hint that
 * just restates the error teaches the model nothing.
 */
export const HINTS: Record<string, string> = {
	invalid_tipo:
		'The identifier is not a valid ontology tipo. Resolve names to tipos first ' +
		'(dedalo_resolve / dedalo_list_sections) — never guess a tipo.',
	permission_denied:
		'The configured Dédalo user does not have permission for this action. ' +
		'Use a section this user can write, or ask an administrator to widen the profile.',
	out_of_scope:
		"The record exists outside the user's project scope. The user cannot " +
		'reach it; pick a record from their own search results.',
	section_not_writable:
		'The section is not in the write allowlist (DEDALO_MCP_WRITE_SECTIONS). ' +
		'Write to an allowlisted section or ask the deployer to extend the list.',
	label_ambiguous:
		'More than one field matches that label. Pick one of the returned ' +
		'candidates by its tipo and retry with the tipo.',
	ambiguous_match:
		'More than one record matches. Refine the match fields or pick one of ' +
		'the returned candidates and use its section_id directly.',
	not_found: 'Nothing matches. Verify the tipo/id via discovery tools before retrying.',
	invalid_request: 'The input did not match the tool schema. Review the parameters and retry.',
	media_path_disabled:
		'File-path media sources are disabled (DEDALO_MCP_MEDIA_IMPORT_DIR is not set). ' +
		'Send the file as base64 instead, or ask the deployer to configure the import dir.',
	media_too_large: 'The file exceeds DEDALO_MCP_MEDIA_MAX_BYTES. Reduce it or raise the limit.',
	plan_hash_mismatch:
		'The change plan differs from what was confirmed. Re-propose the plan and ' +
		'confirm it again — never edit a confirmed plan in place.',
	egress_restricted:
		'This content is restricted from external model providers and was not included. ' +
		'Answer without it, or suggest the user switch this conversation to a model ' +
		'marked "local" in the model picker to include restricted records.',
};

export function ok<T>(data: T, pagination?: PaginationOut): StructuredOk<T> {
	return pagination === undefined ? { ok: true, data } : { ok: true, data, pagination };
}

export function err(
	code: string,
	message: string,
	hint?: string,
	details?: unknown,
): StructuredErr {
	const resolvedHint = hint ?? HINTS[code];
	const error: StructuredErr['error'] = { code, message };
	if (resolvedHint !== undefined) error.hint = resolvedHint;
	if (details !== undefined) error.details = details;
	return { ok: false, error };
}

/**
 * A handler-thrown error that already knows its envelope code (and optionally
 * a details payload the model needs — e.g. label_ambiguous candidates).
 * wrapError maps it 1:1; plain engine errors keep going through the pattern
 * table below.
 */
export class ToolError extends Error {
	readonly code: string;
	readonly details?: unknown;
	constructor(code: string, message: string, details?: unknown) {
		super(message);
		this.name = 'ToolError';
		this.code = code;
		this.details = details;
	}
}

/**
 * A paged handler result: runTool unwraps it into `{ok, data, pagination}` so
 * pagination lands at the envelope top level (list/search tools only).
 */
export class Page<T = unknown> {
	constructor(
		readonly data: T,
		readonly pagination: PaginationOut,
	) {}
}

/**
 * Map a thrown engine error to a coded envelope. Pattern-matching on the
 * engine messages is deliberate: the engines are the authority and keep their
 * own wording; this is the single translation table (add a pattern here when
 * a new engine error class appears — never inside a tool).
 */
export function wrapError(error: unknown): StructuredErr {
	if (error instanceof ToolError) {
		return err(error.code, error.message, undefined, error.details);
	}
	const message = error instanceof Error ? error.message : String(error);
	if (/identifier gate: invalid (tipo|component_tipo|data column)/.test(message)) {
		return err('invalid_tipo', message);
	}
	if (/identifier gate: invalid lang/.test(message)) {
		return err('invalid_request', message);
	}
	if (/Insufficient permissions/i.test(message)) {
		return err('permission_denied', message);
	}
	if (/out of the user scope/i.test(message)) {
		return err('out_of_scope', message);
	}
	if (/not in the write allowlist/i.test(message)) {
		return err('section_not_writable', message);
	}
	return err('unknown', message);
}

/** Derive the pagination block for a list page (reference semantics). */
export function buildPagination(
	total: number | null,
	offset: number,
	count: number,
	limit: number,
): PaginationOut {
	const has_more = total !== null ? offset + count < total : count === limit;
	return {
		total,
		offset,
		count,
		has_more,
		next_offset: has_more ? offset + count : null,
	};
}

/**
 * Wrap an envelope as the MCP tool-result payload: machine-readable
 * `structuredContent` plus a JSON text copy for clients without
 * structured-content support (both carry the SAME envelope).
 */
export function asToolResult(structured: Structured): {
	content: { type: 'text'; text: string }[];
	structuredContent: Record<string, unknown>;
} {
	return {
		content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
		structuredContent: structured as unknown as Record<string, unknown>,
	};
}
