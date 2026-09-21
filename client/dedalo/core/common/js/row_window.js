// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/

/**
 * ROW_WINDOW — a list materializes only the rows the viewport can reach
 *
 * Audit P2-31 / CLI-29 / CLI-30. The list views built one section_record
 * instance per row for the WHOLE page (measured: ~11 instances, ~57 DOM nodes
 * and 5 <img> per row, so the 1000-row page DEC-07 permits was ~11,000
 * instances and ~57,000 nodes built synchronously on the main thread), and the
 * thesaurus tree built every child of an expanded node the same way. This
 * module is the ONE row-materialization engine those views route through: a
 * window of at most ROW_WINDOW_MAX_ROWS rows exists at any time, grown by
 * ROW_WINDOW_MARGIN rows as the viewport approaches an edge and RELEASED at the
 * opposite edge, with two spacer rows standing in for the rows not built.
 *
 * Contract
 *   create_row_window({
 *     owner,        the instance that owns the rows (its `row_window` property is
 *                   set; a previous window on it is destroyed first). Its
 *                   destroy MUST call `row_window.destroy()` — the observer is
 *                   stored here and disconnected there, nowhere else
 *                   (component_teardown_tripwire).
 *     container,    the element rows are appended into
 *     items,        the entries to window (array; `append` extends it)
 *     materialize,  async (item, index) → HTMLElement|null. Builds the row's
 *                   instance AND renders it. Never called twice for a live index.
 *     release,      (item, index, node) → void|Promise. Tears the row's
 *                   instance down. Optional.
 *     row_height,   estimated px per row for the spacers (default 40)
 *     max_rows,     window bound (default ROW_WINDOW_MAX_ROWS; a caller may only
 *                   LOWER it — the gate pins the exported bound)
 *     margin,       rows materialized per step (default ROW_WINDOW_MARGIN)
 *     spacer,       'grid' (default: the spacer spans every column of the list
 *                   grid — `.list_body` is a grid and both content_data and the
 *                   rows are display:contents) | 'block' (the tree container)
 *   })
 *   → {
 *     fill()          materialize the first window. Awaited by the view before
 *                     its content node is returned, so what render() resolves
 *                     with already holds the first rows.
 *     reveal(index)   make row `index` materialized (re-centering the window on
 *                     it when it is outside) and resolve its node. The door for
 *                     "find the instance of row N" consumers (tree search
 *                     hierarchization, scroll-to-record).
 *     append(items)   extend the item list (the tree's "show more" page).
 *     node_of(index)  the live node of a materialized row, or null.
 *     range()         {start, end, total} — the materialized half-open range.
 *     destroy()       disconnect the observer, forget the rows. Does NOT call
 *                     release: the owner's teardown destroys its own
 *                     dependencies; this only stops the window from acting.
 *   }
 *
 * Spacers are styled INLINE (`grid-column: 1 / -1` + an estimated height): a
 * deliberate choice so the window needs no LESS edit and no main.css rebuild —
 * the spacer is a mechanism of this module, not a theme concern.
 *
 * Gate: test/unit/client_render_budget_native.test.ts (the bound, its
 * adopters, and the browser suite test_render_budget that paints 5,000 entries
 * into ≤ ROW_WINDOW_MAX_ROWS rows).
 */

/**
 * ROW_WINDOW_MAX_ROWS
 * The most rows a windowed list materializes at once. SHRINK-ONLY: the gate
 * pins this number and refuses a raise.
 * @type {number}
 */
export const ROW_WINDOW_MAX_ROWS = 200;

/**
 * ROW_WINDOW_MARGIN
 * Rows materialized per step when the viewport reaches a window edge.
 * @type {number}
 */
export const ROW_WINDOW_MARGIN = 40;

/**
 * ROW_WINDOW_ROOT_MARGIN
 * How far ahead of the viewport a spacer counts as "reached" (px).
 * @type {string}
 */
export const ROW_WINDOW_ROOT_MARGIN = '600px 0px 600px 0px';

/**
 * CREATE_ROW_WINDOW
 * @param {Object} options - See the module header.
 * @returns {Object} The window handle.
 */
export const create_row_window = (options) => {
	const owner = options.owner || null;
	const container = options.container;
	const items = Array.isArray(options.items) ? options.items : [];
	const materialize = options.materialize;
	const release = typeof options.release === 'function' ? options.release : null;
	const row_height = Number(options.row_height) > 0 ? Number(options.row_height) : 40;
	const max_rows = Math.max(
		1,
		Math.min(ROW_WINDOW_MAX_ROWS, Number(options.max_rows) || ROW_WINDOW_MAX_ROWS),
	);
	const margin = Math.max(1, Math.min(max_rows, Number(options.margin) || ROW_WINDOW_MARGIN));
	const spacer_mode = options.spacer === 'block' ? 'block' : 'grid';

	if (!container || typeof materialize !== 'function') {
		throw new Error('[row_window] container and materialize are required');
	}

	// a previous window on the same owner is replaced, never stacked
	if (owner?.row_window && typeof owner.row_window.destroy === 'function') {
		owner.row_window.destroy();
	}

	// state. The materialized range is [start, end); nodes keyed by index.
	const nodes = new Map();
	let start = 0;
	let end = 0;
	let destroyed = false;
	let queue = Promise.resolve();

	// spacers
	const top_spacer = create_spacer(spacer_mode, 'top');
	const bottom_spacer = create_spacer(spacer_mode, 'bottom');
	container.appendChild(top_spacer);
	container.appendChild(bottom_spacer);

	const update_spacers = () => {
		const total = items.length;
		top_spacer.style.height = `${start * row_height}px`;
		bottom_spacer.style.height = `${Math.max(0, total - end) * row_height}px`;
		top_spacer.hidden = start === 0;
		bottom_spacer.hidden = end >= total;
	};

	// serialize every mutation of the range: grows, reveals and appends never
	// interleave (materialize is async and the observer fires at will)
	const run = (fn) => {
		queue = queue.then(fn).catch((error) => {
			console.error('[row_window] step failed:', error);
		});
		return queue;
	};

	/**
	 * MATERIALIZE_RANGE
	 * Builds rows [from, to) in parallel and inserts them in order, before
	 * `before_node`. Rows that materialize to null are skipped (kept out of the
	 * map, so node_of answers null for them).
	 */
	const materialize_range = async (from, to, before_node) => {
		if (destroyed || to <= from) {
			return;
		}
		const built = await Promise.all(
			items
				.slice(from, to)
				.map((item, offset) => Promise.resolve(materialize(item, from + offset))),
		);
		if (destroyed) {
			return;
		}
		const fragment = new DocumentFragment();
		for (let i = 0; i < built.length; i++) {
			const node = built[i];
			if (node) {
				nodes.set(from + i, node);
				fragment.appendChild(node);
			}
		}
		container.insertBefore(fragment, before_node);
	};

	/**
	 * RELEASE_RANGE
	 * Removes rows [from, to) from the DOM and hands them to `release`.
	 */
	const release_range = async (from, to) => {
		for (let i = from; i < to; i++) {
			const node = nodes.get(i);
			nodes.delete(i);
			if (node) {
				node.remove();
			}
			if (release) {
				await release(items[i], i, node || null);
			}
		}
	};

	const grow_down = async () => {
		const total = items.length;
		if (destroyed || end >= total) {
			return;
		}
		const to = Math.min(total, end + margin);
		await materialize_range(end, to, bottom_spacer);
		end = to;
		if (end - start > max_rows) {
			const new_start = end - max_rows;
			await release_range(start, new_start);
			start = new_start;
		}
		update_spacers();
	};

	const grow_up = async () => {
		if (destroyed || start <= 0) {
			return;
		}
		const from = Math.max(0, start - margin);
		await materialize_range(from, start, top_spacer.nextSibling);
		start = from;
		if (end - start > max_rows) {
			const new_end = start + max_rows;
			await release_range(new_end, end);
			end = new_end;
		}
		update_spacers();
	};

	/**
	 * RECENTER
	 * Releases everything and materializes a full window around `index`.
	 */
	const recenter = async (index) => {
		await release_range(start, end);
		const total = items.length;
		const from = Math.max(0, Math.min(index - Math.floor(max_rows / 2), total - max_rows));
		const to = Math.min(total, from + max_rows);
		start = from;
		end = from;
		await materialize_range(from, to, bottom_spacer);
		end = to;
		update_spacers();
	};

	// observer. Stored on the handle; disconnected in destroy().
	const observer =
		typeof IntersectionObserver === 'function'
			? new IntersectionObserver(
					(entries) => {
						for (const entry of entries) {
							if (!entry.isIntersecting) {
								continue;
							}
							const step = entry.target === bottom_spacer ? grow_down : grow_up;
							run(step).then(() => {
								// re-arm: the spacer may still be in reach after the step (the
								// observer only fires on threshold crossings)
								if (!destroyed) {
									observer.unobserve(entry.target);
									observer.observe(entry.target);
								}
							});
						}
					},
					{ root: null, rootMargin: ROW_WINDOW_ROOT_MARGIN },
				)
			: null;

	const handle = {
		max_rows: max_rows,
		observer: observer,
		fill: () =>
			run(async () => {
				await materialize_range(0, Math.min(items.length, max_rows), bottom_spacer);
				end = Math.min(items.length, max_rows);
				update_spacers();
				if (observer) {
					observer.observe(top_spacer);
					observer.observe(bottom_spacer);
				}
			}),
		reveal: (index) =>
			run(async () => {
				if (destroyed || !Number.isInteger(index) || index < 0 || index >= items.length) {
					return null;
				}
				if (index < start || index >= end) {
					await recenter(index);
				}
				return nodes.get(index) || null;
			}),
		append: (new_items) =>
			run(async () => {
				if (destroyed || !Array.isArray(new_items) || new_items.length === 0) {
					return;
				}
				items.push(...new_items);
				update_spacers();
				// the window was at the end and has room: fill it now
				if (end - start < max_rows) {
					await grow_down();
				}
			}),
		node_of: (index) => nodes.get(index) || null,
		range: () => ({ start: start, end: end, total: items.length }),
		destroy: () => {
			if (destroyed) {
				return;
			}
			destroyed = true;
			if (observer) {
				observer.disconnect();
			}
			nodes.clear();
			top_spacer.remove();
			bottom_spacer.remove();
			if (owner && owner.row_window === handle) {
				owner.row_window = null;
			}
		},
	};

	if (owner) {
		owner.row_window = handle;
	}

	return handle;
}; //end create_row_window

/**
 * CREATE_SPACER
 * A stand-in for the rows not materialized on one side of the window.
 * Inline styles on purpose (see the module header).
 * @param {string} mode - 'grid' | 'block'
 * @param {string} side - 'top' | 'bottom'
 * @returns {HTMLElement}
 */
const create_spacer = (mode, side) => {
	const spacer = document.createElement('div');
	spacer.className = `row_window_spacer ${side}`;
	spacer.setAttribute('aria-hidden', 'true');
	spacer.style.height = '0px';
	if (mode === 'grid') {
		spacer.style.gridColumn = '1 / -1';
	}
	spacer.hidden = true;

	return spacer;
}; //end create_spacer

// @license-end
