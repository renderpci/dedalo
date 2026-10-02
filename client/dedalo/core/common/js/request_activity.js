// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/

/**
 * REQUEST_ACTIVITY
 * "The server is slow" as a page STATE, not a stream of events.
 *
 * WHAT IT REPLACES. The transport's mid-attempt /health probe used to raise a
 * yellow "Awaiting for busy server.." bubble per request at timeout/2 (2.5 s):
 * N slow parallel reads stacked N identical bubbles, and each lingered on its own
 * timer after its response had already arrived. A wait is a state with a
 * beginning and an end; this module owns exactly that.
 *
 * MODEL. One entry per LOGICAL request (all its retries included), keyed by an
 * opaque id. Each entry climbs its level on ELAPSED time — 'slow' after
 * `slow_ms`, 'very_slow' after `very_slow_ms` — and the page level is the
 * highest level of any pending entry. `on_change({level, pending})` fires ONLY
 * when that page level changes, so the UI renders one indicator however many
 * requests wait, and drops it the instant the last one settles.
 *
 * No imports, no DOM: data_manager binds the singleton to event_manager, and
 * test/unit/request_activity_native.test.ts drives the factory directly.
 */

/** Ordered levels: index = rank. */
export const REQUEST_ACTIVITY_LEVELS = ['idle', 'slow', 'very_slow'];

/** Elapsed ms before a request counts as slow (quiet cue, no text). */
export const REQUEST_SLOW_MS = 1500;

/** Elapsed ms before the cue gains its one sentence. */
export const REQUEST_VERY_SLOW_MS = 8000;

/**
 * CREATE_REQUEST_ACTIVITY
 * @param {Object} [options]
 *   slow_ms      {number}   default REQUEST_SLOW_MS
 *   very_slow_ms {number}   default REQUEST_VERY_SLOW_MS
 *   on_change    {Function} ({level, pending}) — called on page-level changes only
 * @return {Object} {begin, level, pending}
 */
export const create_request_activity = (options = {}) => {
	const slow_ms = options.slow_ms ?? REQUEST_SLOW_MS;
	const very_slow_ms = options.very_slow_ms ?? REQUEST_VERY_SLOW_MS;
	const on_change = options.on_change || null;

	// id → {rank, timers}
	const entries = new Map();
	let next_id = 0;
	let page_rank = 0;

	const recompute = () => {
		let rank = 0;
		for (const entry of entries.values()) {
			if (entry.rank > rank) rank = entry.rank;
		}
		if (rank === page_rank) return;
		page_rank = rank;
		if (on_change) {
			on_change({
				level: REQUEST_ACTIVITY_LEVELS[rank],
				pending: entries.size,
			});
		}
	};

	/**
	 * BEGIN
	 * Track one logical request. Returns its `end` — idempotent, safe to call from
	 * every exit path (success, failure, abort, throw).
	 * @return {Function} end
	 */
	const begin = () => {
		const id = ++next_id;
		const entry = { rank: 0, timers: [] };
		const raise = (rank) => () => {
			entry.rank = rank;
			recompute();
		};
		entry.timers.push(setTimeout(raise(1), slow_ms));
		entry.timers.push(setTimeout(raise(2), very_slow_ms));
		entries.set(id, entry);

		return () => {
			if (!entries.has(id)) return;
			entry.timers.forEach(clearTimeout);
			entries.delete(id);
			recompute();
		};
	};

	return {
		begin,
		level: () => REQUEST_ACTIVITY_LEVELS[page_rank],
		pending: () => entries.size,
	};
}; //end create_request_activity

// @license-end
