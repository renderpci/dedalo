// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/

import { request_failed, response_data } from './api_error.js';
import { data_manager } from './data_manager.js';
import { clone } from './utils/util.js';

/**
 * SQO_LIMIT — the client never sends an unbounded limit
 *
 * Audit P2-31 / CLI-29 / CLI-30. `limit: 0` used to mean "everything" on the
 * client while the server (DEC-07, sanitizeClientSqo → clampClientLimit) read it
 * as "give me the ceiling" — so every "show all", every post-duplicate tree
 * refresh and every completeness read (emails, related records, recursive
 * children) was an undeclared ask the server silently truncated at
 * DEDALO_SEARCH_CLIENT_MAX_LIMIT, and the client then rendered the whole page it
 * got. This module is the ONE place the client resolves that bound:
 *
 *   - max_page_limit()      the SERVER's ceiling, read from
 *                           page_globals.dedalo_search_client_max_limit
 *                           (WC-2026-09-04-client-limit-bound). Never a client
 *                           constant: the client bounds to what the server WILL
 *                           apply, so the two cannot drift.
 *   - bound_sqo_limit(n)    a limit a client may send: a positive integer no
 *                           larger than the ceiling. 0, negatives, NaN and
 *                           anything above the ceiling become the ceiling —
 *                           mirroring clampClientLimit exactly.
 *   - request_complete()    for the consumers that genuinely need EVERY record
 *                           (component_email, relation_list.get_related_records,
 *                           ts_object.get_children_recursive): walks the offsets
 *                           at the ceiling and concatenates the pages, instead
 *                           of one request that pretends to be complete.
 *
 * DISPLAY consumers ("show all", the open-relations 'found' scope, tool_qr) send
 * max_page_limit() and surface the truncation through their paginator total.
 *
 * Gate: test/unit/client_limit_zero_tripwire.test.ts — no client call site sends
 * `limit: 0` / `.limit = 0` at all.
 */

/**
 * ENGINE_DEFAULT_MAX_LIMIT
 * The engine's own default for DEDALO_SEARCH_CLIENT_MAX_LIMIT
 * (src/config/catalog/defaults.ts). Used ONLY as the loud fallback when the
 * page_globals key is absent — a page rendered without the environment (a
 * broken boot, a test page that never loaded it). It is NOT the bound: the
 * bound is whatever the server published.
 * @type {number}
 */
export const ENGINE_DEFAULT_MAX_LIMIT = 1000;

/**
 * MAX_PAGE_LIMIT
 * The server's client ceiling. Positive integer.
 *
 * Fallback (a stated exception, never silence): when page_globals does not
 * carry a valid `dedalo_search_client_max_limit` the engine default is used and
 * a console.error names the missing key — a client that guessed quietly would
 * be the drift this module exists to prevent.
 *
 * @returns {number}
 */
export const max_page_limit = () => {
	const raw =
		typeof page_globals !== 'undefined' && page_globals
			? page_globals.dedalo_search_client_max_limit
			: undefined;

	const value = Number(raw);
	if (!Number.isInteger(value) || value < 1) {
		console.error(
			'[sqo_limit] page_globals.dedalo_search_client_max_limit is missing or invalid; using the engine default',
			raw,
			ENGINE_DEFAULT_MAX_LIMIT,
		);
		return ENGINE_DEFAULT_MAX_LIMIT;
	}

	return value;
}; //end max_page_limit

/**
 * BOUND_SQO_LIMIT
 * The limit a client may send for a requested page size: a positive integer no
 * larger than max_page_limit(). Mirrors the server's clampClientLimit so what
 * the client sends is what the server applies.
 *
 * @param {*} limit - The wanted page size (any type).
 * @returns {number} 1..max_page_limit()
 */
export const bound_sqo_limit = (limit) => {
	const max = max_page_limit();
	const value = Math.trunc(Number(limit));

	if (!Number.isFinite(value) || value < 1 || value > max) {
		return max;
	}

	return value;
}; //end bound_sqo_limit

/**
 * REQUEST_COMPLETE
 * Reads EVERY row of a search by walking the offsets at the server ceiling.
 *
 * The rqo is cloned; its sqo.limit is set to max_page_limit() and sqo.offset
 * walked from 0. Pages are requested until one comes back SHORT (fewer rows
 * than the limit) or, when `total` is known, until offset reaches it. The
 * pages' data items are concatenated in order; the context of the first page
 * is kept. The result has the datum shape the callers already read
 * (`{context, data}`) plus `pagination: {total, pages, complete}`.
 *
 * Rows per page are counted by `options.count_rows(datum)`: the callers know
 * their own row sentinel (one item per record for a single-ddo read, the
 * `component_tipo==='id'` items for a relation list…). Without it the distinct
 * `section_tipo_section_id` pairs among the page's data items are counted.
 *
 * A hard stop (`max_pages`, default 200 pages = 200 × ceiling rows) bounds the
 * walk even when the server keeps answering full pages: a completeness read
 * is still a bounded read, and hitting the stop is reported as
 * `complete:false`, never silently.
 *
 * @param {Object} rqo - The read RQO (cloned, never mutated).
 * @param {Object} [options]
 * @param {number|null} [options.total] - Known total rows, when the caller has it.
 * @param {Function} [options.count_rows] - (datum) → rows in this page.
 * @param {number} [options.max_pages=200]
 * @returns {Promise<Object|false>} `{context, data, pagination}` or false on an API error.
 */
export const request_complete = async (rqo, options = {}) => {
	const max = max_page_limit();
	const total = Number.isFinite(Number(options.total)) ? Number(options.total) : null;
	const max_pages =
		Number.isInteger(options.max_pages) && options.max_pages > 0 ? options.max_pages : 200;
	const count_rows =
		typeof options.count_rows === 'function' ? options.count_rows : default_count_rows;

	const body = clone(rqo);
	body.sqo = body.sqo || {};
	body.sqo.limit = max;
	body.sqo.offset = 0;

	const data = [];
	let context = [];
	let pages = 0;
	let complete = false;

	while (pages < max_pages) {
		const api_response = await data_manager.request({
			body: body,
		});
		if (request_failed(api_response)) {
			console.error('[sqo_limit.request_complete] API error on page', pages, api_response.error);
			return false;
		}
		const datum = response_data(api_response);
		if (!datum || !Array.isArray(datum.data)) {
			console.error('[sqo_limit.request_complete] invalid datum on page', pages, api_response);
			return false;
		}

		if (pages === 0 && Array.isArray(datum.context)) {
			context = datum.context;
		}
		data.push(...datum.data);
		pages++;

		const rows = count_rows(datum);
		body.sqo.offset += max;

		if (rows < max || (total !== null && body.sqo.offset >= total)) {
			complete = true;
			break;
		}
	}

	if (!complete) {
		console.error(
			'[sqo_limit.request_complete] stopped at max_pages',
			max_pages,
			'the result is NOT complete',
			rqo,
		);
	}

	return {
		context: context,
		data: data,
		pagination: {
			total: total,
			pages: pages,
			complete: complete,
		},
	};
}; //end request_complete

/**
 * DEFAULT_COUNT_ROWS
 * Rows in a page: the distinct records its data items belong to.
 * @param {Object} datum - `{data: Array}`
 * @returns {number}
 */
const default_count_rows = (datum) => {
	const seen = new Set();
	for (const item of datum.data) {
		if (item?.section_tipo && item.section_id !== undefined && item.section_id !== null) {
			seen.add(`${item.section_tipo}_${item.section_id}`);
		}
	}

	return seen.size;
}; //end default_count_rows

// @license-end
