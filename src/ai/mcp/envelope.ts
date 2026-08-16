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
 * steers the loop instead of dead-ending it. Hints live on the ERROR REGISTRY
 * (`ErrorSpec.hint`, src/core/errors/registry.ts) — one closed vocabulary for
 * every surface. Handlers stay pure and THROW `DedaloError`s (a registry code
 * + a model-facing `publicMessage`; a payload the model needs, such as
 * `candidates`, goes in `extend`); `toStructuredErr` (src/core/errors) is the
 * single place a throw becomes the structured error — tools never invent
 * ad-hoc error shapes.
 */

import type { StructuredErrV2 } from '../../core/errors/convert.ts';

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

/**
 * The failure shape — converter-made (`toStructuredErr`, src/core/errors):
 * `error.code` is a registry ErrorCode, `message` the registry English or the
 * tool's vetted `publicMessage`, `hint` the registry's model-facing next move,
 * `details` the code's declared scalars; a tool's model-facing payload
 * (`candidates`) rides as extension keys beside `error`.
 */
export type StructuredErr = StructuredErrV2;

export type Structured<T = unknown> = StructuredOk<T> | StructuredErr;

export function ok<T>(data: T, pagination?: PaginationOut): StructuredOk<T> {
	return pagination === undefined ? { ok: true, data } : { ok: true, data, pagination };
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
