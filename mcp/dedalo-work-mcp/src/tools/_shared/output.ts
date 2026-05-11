import type { DedaloResponse } from '@dedalo/mcp-common';

/**
 * Pagination metadata normalised across Dédalo response shapes.
 */
export interface PaginationOut {
	total: number | null;
	offset: number;
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
	error: {
		code: string;
		message: string;
		hint?: string;
	};
}

export type Structured<T = unknown> = StructuredOk<T> | StructuredErr;

/**
 * Build a normalised pagination block from a Dédalo response when
 * `full_count: true` was requested, or infer minimal metadata from the
 * returned array length.
 */
export function buildPagination(raw: DedaloResponse, offset: number, limit: number): PaginationOut | undefined {
	const total = typeof raw.total === 'number' ? raw.total : null;
	const data = raw.data;
	const count = Array.isArray(data) ? data.length : 0;
	const has_more = total !== null ? offset + count < total : count === limit;
	return {
		total,
		offset,
		count,
		has_more,
		next_offset: has_more ? offset + count : null,
	};
}
