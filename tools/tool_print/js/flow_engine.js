// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals */
/*eslint no-undef: "error"*/



/**
* FLOW_ENGINE
*
* tool_print v2 document-flow layout engine. The layout is an ordered list of
* rows (layout.flow.rows); each row is a horizontal grid of cells; each cell
* holds one component. Rows stack top-to-bottom into a content column and
* paginate onto generated pages — like a word processor. A full-width table row
* splits its <tbody> rows across pages; every row after it reflows with no gaps.
*
* ONE engine serves both the editor preview and print: the caller supplies a
* `ctx` with the unit conversion (editor = mm·PX_PER_MM·zoom in px; print = mm)
* and a `measure(node)` fn, so geometry math stays consistent in either mode.
*
* Cell content reuses render_box_tool_print.render_box_content by treating the
* cell's block as a "box" (component_ref / render / style / table_columns …),
* so the literal/relation-table/cache rendering is shared with v1.
*
* Layout data shape (schema_version 2):
*   layout.flow.rows[]            — ordered array of row descriptors
*   row  { id, kind, cells[], space_after_mm, style }
*         kind === 'spacer'  → fixed-height gap (height_mm), no cells
*         kind === 'row'     → horizontal grid of 1…N cells
*   cell { id, width, block }
*         width: fractional share of column width (0…1); omit → equal share
*   block { type, component_tipo, render, style, table_columns[], … }
*         type === 'empty'           → placeholder (no render)
*         type === 'component'       → renders a live component value
*         type === 'static_text'     → renders a plain text label
*
* Context object (ctx) contract — callers MUST supply all of these:
*   root         {HTMLElement}  — container to append .print_page nodes into
*   page_w_mm    {number}       — physical page width in mm
*   page_h_mm    {number}       — physical page height in mm
*   margins      {Object}       — { top, right, bottom, left } all in mm
*   to_css(mm)   {Function}     — converts mm to a CSS string (px for editor, mm for print)
*   to_px(mm)    {Function}     — converts mm to a numeric pixel value used for comparison
*   measure(node){Function}     — returns the rendered height of a DOM node in px
*   pages        {Array}        — empty array; populated by layout_flow
*   current_page {Object|null}  — the active page descriptor { node, column }
*   print        {boolean}      — present and true only in make_print_ctx (omitted in editor)
*
* Exports: make_editor_ctx, make_print_ctx, layout_flow
*/

	import {ui} from '../../../core/common/js/ui.js'
	import {PX_PER_MM, page_dims, mm_to_px, apply_box_style} from './canvas_tool_print.js'
	import {render_box_content} from './render_box_tool_print.js'

	// minimum space (px) that must remain on the current page to START line-splitting a
	// text block there; below this the block is relocated to a fresh page first, so we
	// never strand it as a 0–1 line orphan (≈ label + two text lines).
	const LINE_FILL_MIN_PX = 60



/**
* MAKE_EDITOR_CTX
* Builds the layout context for the on-screen editor preview.
* All geometry is expressed in zoom-dependent CSS pixels: distances measured via
* getBoundingClientRect() match the values produced by to_px(), so the
* pagination arithmetic stays correct regardless of the current zoom level.
* The `print` property is intentionally absent so callers can detect the mode
* with `!!ctx.print`.
* @param {Object} self - The tool_print instance; must have layout.page_defaults and zoom
* @param {HTMLElement} root - Container that will receive the generated .print_page nodes
* @returns {Object} ctx - Layout context satisfying the ctx contract (see module header)
*/
export const make_editor_ctx = function(self, root) {
	const dims = page_dims(self, null)
	return {
		root,
		page_w_mm	: dims.width_mm,
		page_h_mm	: dims.height_mm,
		margins		: self.layout.page_defaults.margins_mm,
		to_css		: (mm) => mm_to_px(self, mm) + 'px',
		to_px		: (mm) => mm * PX_PER_MM * (self.zoom || 1),
		measure		: (node) => node.getBoundingClientRect().height,
		pages		: [],
		current_page: null
	}
}//end make_editor_ctx



/**
* MAKE_PRINT_CTX
* Builds the layout context for the physical print path (render_tool_print.do_print).
* Units are physical millimetres: to_css() emits "Nmm" strings consumed by
* @media print CSS, and to_px() uses the fixed PX_PER_MM constant (96 dpi/25.4)
* rather than zoom, so column widths and page-break thresholds match the paper.
* offsetHeight is used instead of getBoundingClientRect().height because the
* print document is rendered in a hidden iframe/overlay where layout is static.
* The `print: true` flag lets callers detect the print path (e.g. to skip
* editor-only decorations in canvas_tool_print.decorate_editor).
* @param {Object} self - The tool_print instance; must have layout.page_defaults
* @param {HTMLElement} root - Container that will receive the generated .print_page nodes
* @returns {Object} ctx - Layout context satisfying the ctx contract (see module header)
*/
export const make_print_ctx = function(self, root) {
	const dims = page_dims(self, null)
	return {
		root,
		page_w_mm	: dims.width_mm,
		page_h_mm	: dims.height_mm,
		margins		: self.layout.page_defaults.margins_mm,
		to_css		: (mm) => mm + 'mm',
		to_px		: (mm) => mm * PX_PER_MM,
		measure		: (node) => node.offsetHeight,
		print		: true,
		pages		: [],
		current_page: null
	}
}//end make_print_ctx



/**
* LAYOUT_FLOW
* Main entry-point. Renders layout.flow.rows into paginated .print_page DOM
* nodes inside ctx.root and returns the page descriptor array.
*
* Algorithm (sequential, async because render_row_node awaits component renders):
*   1. Create the first page node and set `used = 0` (px consumed on the current page).
*   2. For each row in layout.flow.rows:
*      a. Spacer rows: add fixed-height gap; overflow to a new page if needed.
*      b. Content rows: render the full row, measure it, then:
*         - If it fits in the remaining space → append and advance `used`.
*         - Else if it is a 1-cell splittable container (table or rich text) →
*           split at unit boundaries (split_long_row), spreading overflow units
*           across as many new pages as required; `used` becomes the fill on the
*           last continuation page.
*         - Else (multi-cell row or non-splittable single-cell) → move the
*           already-appended node to a fresh page whole (no mid-row split).
*   3. Return ctx.pages (array populated in place by make_page_node).
*
* Side effects: modifies ctx.pages and ctx.current_page in place; appends DOM
* nodes to ctx.root. Each call must use a freshly constructed ctx (pages:[]).
*
* @param {Object} self - The tool_print instance; layout must be a valid v2 blob
* @param {Object} ctx - Layout context from make_editor_ctx or make_print_ctx
* @returns {Promise<Array>} Resolves to ctx.pages: [{node: HTMLElement, column: HTMLElement}, …]
*/
export const layout_flow = async function(self, ctx) {

	// guard: tolerate a layout blob that has no flow object yet (e.g. freshly created)
	const rows		= (self.layout.flow && Array.isArray(self.layout.flow.rows)) ? self.layout.flow.rows : []

	// total usable height of a page's content column in pixels (used for all comparisons)
	const usable_px	= ctx.to_px(ctx.page_h_mm - ctx.margins.top - ctx.margins.bottom)

	make_page_node(ctx)        // first page
	let used = 0               // px consumed on the current page's column so far

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i]

		// spacer row ----------------------------------------------------------
		if (row.kind==='spacer') {
			const h = ctx.to_px(row.height_mm || 8)
			// if the spacer itself overflows, open a new page (guard: used > 0 avoids
			// a blank page when a spacer is the very first element)
			if (used + h > usable_px && used > 0) { make_page_node(ctx); used = 0 }
			// a flow_row (with data-row-id) so the editor can select/move/remove it
			const sp = ui.create_dom_element({ element_type:'div', class_name:'flow_row flow_spacer', parent: ctx.current_page.column })
			sp.dataset.rowId = row.id
			sp.style.height = ctx.to_css(row.height_mm || 8)
			used += h
			continue
		}

		// content row ---------------------------------------------------------
		// render the full row into a detached fragment first, then append so that
		// ctx.measure() can read its natural height after layout is complete
		const row_node = await render_row_node(self, row, ctx)
		ctx.current_page.column.appendChild(row_node)
		let h			= ctx.measure(row_node)
		const remaining	= usable_px - used
		const gap		= ctx.to_px(row.space_after_mm || 0)

		if (h <= remaining) { used += h + gap; continue }   // fits — fast path

		// row doesn't fit: decide whether to split it or move it whole
		// split only when the row is a 1-cell full-width container of repeatable
		// block units (table <tr>s or rich-text paragraphs) — multi-cell rows with
		// heterogeneous heights cannot be split at shared boundaries
		const info = splittable_container(row, row_node)
		if (info) {
			// split_long_row removes overflow units from row_node in-place and builds
			// continuation segments on fresh pages; returns used px on the last page
			used = split_long_row(self, ctx, row_node, used, usable_px, info)
		} else {
			// not block-splittable. If the row is a single text block (e.g. a long
			// component_text_area paragraph), split it at LINE boundaries so it FILLS
			// the remaining space on this page and flows onto the next — rather than
			// jumping the whole block to a fresh page and leaving a gap. Only relocate
			// first when too little room remains here to start a couple of lines.
			const content	= row_node.querySelector('.cell_content')
			const target	= content ? find_line_split_target(content) : null
			if (target) {
				if (used > 0 && (usable_px - used) < LINE_FILL_MIN_PX) {
					ctx.current_page.column.removeChild(row_node)
					make_page_node(ctx)
					used = 0
					ctx.current_page.column.appendChild(row_node)
				}
				used = split_text_by_lines(ctx, row_node, target, usable_px)
				continue
			}
			// other unsplittable row: if there is already content on the page, pull the
			// row off, start a fresh page, and re-append it there; if the page is
			// already blank (used === 0) leave it in place to avoid an infinite loop
			// where a row taller than a full page keeps triggering new empty pages
			if (used > 0) {
				ctx.current_page.column.removeChild(row_node)
				make_page_node(ctx)
				used = 0
				ctx.current_page.column.appendChild(row_node)
				h = ctx.measure(row_node)
			}
			used += h + gap
		}
	}

	return ctx.pages
}//end layout_flow



/**
* MAKE_PAGE_NODE
* Creates a .print_page with an absolutely-positioned .flow_column content area,
* appends it to ctx.root, and advances ctx.current_page to the new page.
*
* The .print_page receives explicit width/height (in the ctx unit: px or mm) so
* both the on-screen editor and the @media print path see the correct paper size.
* The data-wmm/data-hmm attributes let decorate_editor read dimensions without
* re-querying the layout object. data-page-index is zero-based and matches the
* index into ctx.pages.
*
* The .flow_column is positioned absolutely within the page using the four margin
* values; its width is page_width − left_margin − right_margin so that flex cells
* fill the available text area precisely. Height is intentionally unconstrained
* (content drives it) — the pagination loop in layout_flow enforces the limit
* through `used` / `usable_px` arithmetic.
*
* @param {Object} ctx - The active layout context (mutated: pages[] appended, current_page set)
* @returns {Object} page - { node: HTMLElement (.print_page), column: HTMLElement (.flow_column) }
*/
const make_page_node = function(ctx) {

	const pg = ui.create_dom_element({ element_type:'div', class_name:'print_page', parent: ctx.root })
	pg.style.width	= ctx.to_css(ctx.page_w_mm)
	pg.style.height	= ctx.to_css(ctx.page_h_mm)
	pg.dataset.wmm	= ctx.page_w_mm
	pg.dataset.hmm	= ctx.page_h_mm
	pg.dataset.pageIndex = ctx.pages.length

	// editor-only dashed guide showing the clear margin box (the usable area);
	// hidden in @media print so it never appears on the printed sheet.
	const guide = ui.create_dom_element({ element_type:'div', class_name:'margin_guide', parent: pg })
	guide.style.position	= 'absolute'
	guide.style.left		= ctx.to_css(ctx.margins.left)
	guide.style.top			= ctx.to_css(ctx.margins.top)
	guide.style.width		= ctx.to_css(ctx.page_w_mm - ctx.margins.left - ctx.margins.right)
	guide.style.height		= ctx.to_css(ctx.page_h_mm - ctx.margins.top - ctx.margins.bottom)

	const col = ui.create_dom_element({ element_type:'div', class_name:'flow_column', parent: pg })
	col.style.position	= 'absolute'
	col.style.left		= ctx.to_css(ctx.margins.left)
	col.style.top		= ctx.to_css(ctx.margins.top)
	col.style.width		= ctx.to_css(ctx.page_w_mm - ctx.margins.left - ctx.margins.right)

	const page = { node: pg, column: col }
	ctx.pages.push(page)
	ctx.current_page = page
	return page
}//end make_page_node



/**
* RENDER_ROW_NODE
* Builds a .flow_row DOM node (a flex container of .flow_cell nodes) and renders
* each cell's component value by delegating to the shared render_box_content.
*
* Cell width: the `cell.width` property is a fractional share of the column (0…1).
* For a single-cell row the fraction is always 1 (100%). For multi-cell rows it
* falls back to equal shares (1/n) when the stored width is absent or zero, so a
* layout round-tripped through an older serialiser still displays correctly.
*
* Block-as-box adaptation: render_box_content was written for the v1 absolute-box
* model. We mutate the cell's block in place to satisfy its interface:
*   block.id           — required by render_box_content for cache keying
*   block.content_node — the .box_content/.cell_content div to fill
*   block.overflow     — { mode:'grow' } tells it NOT to clip; the engine paginates
*
* Empty blocks (type === 'empty') skip the render entirely; the cell gets the
* `flow_cell_empty` class so CSS can give it a visual placeholder in the editor.
*
* @param {Object} self - The tool_print instance
* @param {Object} row - Row descriptor from layout.flow.rows[] (kind === 'row')
* @param {Object} ctx - The active layout context (provides to_css for spacing)
* @returns {Promise<HTMLElement>} The completed .flow_row node (NOT yet appended to the DOM)
*/
const render_row_node = async function(self, row, ctx) {

	const row_node = ui.create_dom_element({ element_type:'div', class_name:'flow_row' })
	row_node.dataset.rowId = row.id
	// space_after_mm becomes a bottom margin on the row node so gap is preserved
	// between consecutive content rows (the pagination loop accounts for it via `gap`)
	if (row.space_after_mm) row_node.style.marginBottom = ctx.to_css(row.space_after_mm)

	const cells	= Array.isArray(row.cells) ? row.cells : []
	const n		= cells.length || 1

	for (let i = 0; i < cells.length; i++) {
		const cell		= cells[i]
		// a lone cell always fills the column (100%); only shared rows use fractions
		const frac		= (n===1) ? 1 : ((typeof cell.width==='number' && cell.width>0) ? cell.width : (1 / n))
		const cell_node	= ui.create_dom_element({ element_type:'div', class_name:'flow_cell', parent: row_node })
		cell_node.dataset.cellId = cell.id
		// rowId is duplicated on the cell so that click handlers in canvas_tool_print
		// can identify the parent row without walking the DOM
		cell_node.dataset.rowId	= row.id
		// flex: 0 0 N% + maxWidth pins the cell to its exact fraction without
		// growing or shrinking — critical so splittable_container can detect the
		// single-cell case by checking cells.length === 1
		cell_node.style.flex	= '0 0 ' + (frac * 100) + '%'
		cell_node.style.maxWidth= (frac * 100) + '%'

		const content = ui.create_dom_element({ element_type:'div', class_name:'box_content cell_content', parent: cell_node })

		const block = cell.block || { type: 'empty' }
		if (block.type==='empty') { cell_node.classList.add('flow_cell_empty'); continue }

		// adapt the block as a "box" for render_box_content (shared with v1)
		block.id			= block.id || cell.id
		block.type			= block.type
		block.content_node	= content
		block.overflow		= { mode: 'grow' }   // natural height; engine handles pagination
		apply_box_style(self, block)
		await render_box_content(self, block)
	}

	return row_node
}//end render_row_node



/**
* SPLITTABLE_CONTAINER
* Determines whether a rendered row node can be split across page boundaries and,
* if so, returns a descriptor of the splittable container within it.
*
* A row is splittable when ALL of the following hold:
*   1. It has exactly one cell (multi-cell rows can't be split at shared row boundaries).
*   2. That cell contains either:
*      a. A .portal_table with a <tbody> holding more than one <tr>
*         (relation/portal component tables rendered by render_box_tool_print).
*      b. A rich-text container (CKEditor .ck-content, .value_container, or
*         .editor_container) holding more than one block-level child paragraph
*         (a long component_text_area transcription is the primary use-case).
*   3. In the text case, find_text_container descends past single-child wrapper
*      divs to find the element that actually owns the paragraphs.
*
* Tables take precedence: if both a table and text content exist (unlikely but
* possible), the table path is returned.
*
* @param {Object} row - Row descriptor from layout.flow.rows[]
* @param {HTMLElement} row_node - The rendered .flow_row DOM node
* @returns {Object|null} info - null if unsplittable; otherwise:
*   { kind: 'table'|'text', content: HTMLElement, container: HTMLElement, table?: HTMLElement }
*   content   — the .cell_content div (style source for continuation nodes)
*   container — the <tbody> or text block parent whose children are the split units
*   table     — (table only) the full <table> element (colgroup/thead source)
*/
const splittable_container = function(row, row_node) {
	if (!row || row.kind==='spacer') return null
	if (!Array.isArray(row.cells) || row.cells.length!==1) return null
	const content = row_node.querySelector('.cell_content')
	if (!content) return null
	const table = content.querySelector('table.portal_table')
	const tbody = table && table.querySelector('tbody')
	if (tbody && tbody.children.length > 1) return { kind:'table', content, container: tbody, table }
	const tc = find_text_container(content)
	if (tc && tc.children.length > 1) return { kind:'text', content, container: tc }
	return null
}//end splittable_container

/**
* IS_SPLITTABLE_ROW
* Boolean predicate wrapping splittable_container. Used by callers that only need
* to know whether splitting is possible, without needing the container descriptor.
* @param {Object} row - Row descriptor from layout.flow.rows[]
* @param {HTMLElement} row_node - The rendered .flow_row DOM node
* @returns {boolean} true if the row can be split across page boundaries
*/
const is_splittable_row = (row, row_node) => !!splittable_container(row, row_node)

/**
* FIND_TEXT_CONTAINER
* Locates the DOM element that directly contains the paragraph-level block children
* of a rendered CKEditor text value, so that individual paragraphs can be measured
* and moved as split units.
*
* Strategy (two-pass):
*   Pass 1 — named container heuristic: look for a well-known CKEditor/Dédalo class
*   (.ck-content, .value_container, .editor_container). If found, unwrap single-child
*   intermediary divs (up to 8 levels, guard-protected) to reach the element that
*   directly owns multiple block children.
*   Pass 2 — fallback: if no named container is found (or pass-1 element has ≤1 child),
*   walk every descendant and return the one with the most direct children. This handles
*   future component renders that do not use the expected class names.
*
* Returns null / single-child container when no multi-child element is found — the
* caller in splittable_container guards `tc.children.length > 1` before using it.
*
* @param {HTMLElement} content - The .cell_content div of the rendered cell
* @returns {HTMLElement|null} The element whose direct children are the split units, or null
*/
const find_text_container = function(content) {
	// Score an element as a BLOCK-STACK split container: it must have ≥2 children
	// whose heights STACK VERTICALLY (each starts at/after the previous bottom) AND
	// ACCOUNT FOR most of the element's own height. The height check is what rejects
	// a single paragraph whose "children" are inline <i>/<a>/<br> sharing lines — their
	// heights (one line each) sum to far less than the wrapped paragraph's height, so
	// splitting at those boundaries would be wrong (that needs line-level splitting,
	// not yet supported; such a block instead moves whole to the next page). Returns
	// the stacked-unit count as a score, or 0 when the element is not a real stack.
	const score = function(el) {
		const kids = el.children
		if (kids.length < 2) return 0
		const eh = el.getBoundingClientRect().height
		if (eh <= 0) return 0
		let sum = 0, stacked = 0, prev_bottom = -Infinity
		for (let k = 0; k < kids.length; k++) {
			const r = kids[k].getBoundingClientRect()
			if (r.height <= 0) continue
			sum += r.height
			if (r.top >= prev_bottom - 2) { stacked++; prev_bottom = r.bottom }
		}
		return (stacked >= 2 && sum >= eh * 0.7) ? stacked : 0
	}

	// pass 1 — named CKEditor / Dédalo value containers. Descend through ANY chain
	// of single-child wrappers (e.g. .content_data > .content_value > .ck-content)
	// until reaching the element that actually holds the block children, then validate.
	let c = content.querySelector('.ck-content, .value_container, .editor_container, .content_data')
	if (c) {
		let guard = 0
		while (c && c.children.length===1 && c.firstElementChild && guard++<12) {
			c = c.firstElementChild
		}
		if (c && score(c) > 0) return c
	}
	// pass 2 — generic: the element that is the strongest vertical block stack. Makes
	// ANY component rendering stacked blocks splittable (multi-paragraph text_area,
	// multi-value lists for iri/input_text, dataframes…) without falsely splitting an
	// inline-only paragraph.
	let best = null, best_n = 0
	const candidates = content.querySelectorAll('*')
	for (let i = 0; i < candidates.length; i++) {
		const s = score(candidates[i])
		if (s > best_n) { best_n = s; best = candidates[i] }
	}
	return best
}//end find_text_container



/**
* SPLIT_LONG_ROW
* Splits a 1-cell row (table or text) across page boundaries at its unit
* boundaries (<tr> rows for tables, block children for rich text). Units that
* fit in the remaining space on the current page stay in the original row_node;
* the rest are moved onto fresh continuation pages.
*
* Algorithm:
*   1. Snapshot all unit nodes and their individual heights (getBoundingClientRect /
*      offsetHeight depending on ctx.measure).
*   2. Measure the overhead above the units (title header, table wrapper, etc.) to
*      compute avail_first — the px available for units on the current page.
*   3. Greedily pack units onto the current page (k = first overflow index).
*      If everything fits (k >= units.length), return early without splitting.
*   4. Remove overflow units from the DOM (row_node stays in place with the
*      remaining units above the cut).
*   5. Loop: for each continuation page, call make_page_node, greedily pack the
*      next slice, build a continuation node, and append it to the new page.
*      Tables repeat the <thead> on each continuation page; text continues
*      paragraphs without any repeated header.
*   6. The guard (< 5000 iterations) prevents an infinite loop if a single unit
*      is taller than a full page — that unit is placed alone and the loop advances.
*
* Side effects: modifies the DOM of row_node in place (overflow units removed);
* creates new page nodes via make_page_node (mutates ctx.pages, ctx.current_page).
*
* @param {Object} self - The tool_print instance
* @param {Object} ctx - The active layout context
* @param {HTMLElement} row_node - The already-appended .flow_row node to split
* @param {number} used - Px already consumed on the current page before this row
* @param {number} usable_px - Total usable column height in px (constant per layout)
* @param {Object} info - Splittable container descriptor from splittable_container()
* @returns {number} Px consumed on the final continuation page (used value for the next row)
*/
const split_long_row = function(self, ctx, row_node, used, usable_px, info) {

	const content	= info.content
	// snapshot children NOW: removing nodes later would change .children live
	const units		= [...info.container.children]
	// a container with only one unit cannot be split — treat as unsplittable
	if (units.length < 2) return used + ctx.measure(row_node)

	// identify the master cell so continuation segments can re-select it on click
	// in the editor; master_ids are stamped as data attributes on every cont_row
	const master_cell	= row_node.querySelector('.flow_cell[data-cell-id]')
	const master_ids	= { row: row_node.dataset.rowId || '', cell: master_cell ? master_cell.dataset.cellId : '' }

	// height consumed above the units within the cell content:
	// c_top is the top of .cell_content; head_h is the gap between cell_content
	// top and the container (e.g. a table caption or a wrapper div above <tbody>)
	const c_top		= content.getBoundingClientRect().top
	const head_h	= Math.max(0, info.container.getBoundingClientRect().top - c_top)
	// thead_h is the height of the repeated table header on continuation pages
	const thead		= (info.kind==='table') ? info.table.querySelector('thead') : null
	const thead_h	= thead ? ctx.measure(thead) : 0
	// pre-measure all unit heights while they are still in the DOM
	const unit_h	= units.map(u => ctx.measure(u))

	// if the current page is too full for even the first unit (+ any table header),
	// relocate the whole row to a fresh page before splitting. Otherwise the k>0
	// guard below would cram an overflowing first unit into the tail of a nearly-full
	// page, spilling into the bottom margin.
	if (used > 0 && head_h + thead_h + (unit_h[0] || 0) > usable_px - used) {
		make_page_node(ctx)
		ctx.current_page.column.appendChild(row_node)
		used = 0
	}

	// greedy-pack pass: find k = the first unit that does NOT fit on the current page
	// k > 0 guard: always place at least one unit even if it overflows (avoids loops)
	const avail_first = usable_px - used - head_h
	let u = 0, k = 0
	for (; k < units.length; k++) {
		if (u + unit_h[k] > avail_first && k > 0) break
		u += unit_h[k]
	}
	if (k >= units.length) return used + head_h + u   // everything fit after all

	// remove the overflow units from the DOM (units[0..k-1] stay in the original row_node)
	const overflow		= units.slice(k)
	const overflow_h	= unit_h.slice(k)
	overflow.forEach(n => n.remove())

	// continuation pages: tables repeat the <thead> on every page; text has no repeated header
	const cont_head = (info.kind==='table') ? thead_h : 0
	let idx = 0, guard = 0
	while (idx < overflow.length && guard++ < 5000) {
		make_page_node(ctx)
		// greedy-pack the next slice of overflow units onto this continuation page
		// m > idx guard: always advance by at least one unit to prevent an infinite loop
		// when a single unit is taller than a full page
		let v = 0, m = idx
		for (; m < overflow.length; m++) {
			if (v + overflow_h[m] > (usable_px - cont_head) && m > idx) break
			v += overflow_h[m]
		}
		const seg = overflow.slice(idx, m)
		idx = m
		const cont_row = (info.kind==='table')
			? build_continuation_table_node(info.table, seg, ctx, content)
			: build_continuation_text_node(content, info.container, seg, ctx)
		// link the continuation back to the master cell (editor selection)
		cont_row.dataset.masterRowId	= master_ids.row
		cont_row.dataset.masterCellId	= master_ids.cell
		ctx.current_page.column.appendChild(cont_row)
		// track used on the last page for the caller to resume from
		used = cont_head + v
	}

	return used
}//end split_long_row



/**
* BUILD_CONTINUATION_TEXT_NODE
* Builds a full-width .flow_row.flow_continued node for a slice of rich-text
* paragraphs that overflowed onto a continuation page.
*
* Structure mirrors a normal single-cell row (flow_row > flow_cell > box_content +
* cell_content > wrapper_component > paragraphs) so that the same CSS rules that
* control spacing, borders, and font in the master row apply to the continuation.
*
* The master cell content's inline style (cssText) is copied verbatim so that
* color, font-family, font-size and text-align set by the inspector are preserved
* across page breaks without querying the layout blob again.
*
* The `holder` element inherits the master container's className (e.g. `ck-content`)
* so that CKEditor typography styles (headings, lists, blockquotes) continue to
* apply on continuation pages.
*
* seg_nodes are MOVED (appendChild), not cloned — they are already disconnected
* from the original container by the caller (split_long_row → n.remove()).
*
* @param {HTMLElement} master_content   - The .cell_content div of the master row (style source)
* @param {HTMLElement} master_container - The text container (className source for holder)
* @param {Array} seg_nodes             - Paragraph nodes to place on this continuation page
* @param {Object} ctx                  - The active layout context (not used directly here;
*                                        reserved for future to_css calls, e.g. thead height)
* @returns {HTMLElement} A .flow_row.flow_continued node ready to append to a .flow_column
*/
const build_continuation_text_node = function(master_content, master_container, seg_nodes, ctx) {
	const row_node	= ui.create_dom_element({ element_type:'div', class_name:'flow_row flow_continued' })
	const cell_node	= ui.create_dom_element({ element_type:'div', class_name:'flow_cell', parent: row_node })
	cell_node.style.flex = '0 0 100%'
	const content	= ui.create_dom_element({ element_type:'div', class_name:'box_content cell_content', parent: cell_node })
	content.style.cssText = master_content.style.cssText   // color / font / align
	const holder	= ui.create_dom_element({ element_type:'div', class_name:'wrapper_component', parent: content })
	if (master_container.className) holder.className += ' ' + master_container.className
	for (let i = 0; i < seg_nodes.length; i++) holder.appendChild(seg_nodes[i])   // move
	return row_node
}//end build_continuation_text_node



/**
* DOM_POSITION_AT_Y
* Finds the DOM position {node, offset} of the first character in `root` whose line
* box extends BELOW the absolute viewport y `target_y` — i.e. the first character that
* does not fit above the page break. Binary-searches character offsets inside each
* text node (measuring with a Range), so it is O(text_nodes · log chars). Returns null
* when all of root's text fits above target_y.
* @returns {{node:Text, offset:number}|null}
*/
const dom_position_at_y = function(root, target_y) {
	const range	= document.createRange()
	const walker	= document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
	let tn
	while ((tn = walker.nextNode())) {
		const len = tn.textContent.length
		if (!len) continue
		range.selectNodeContents(tn)
		const rr = range.getBoundingClientRect()
		if (rr.bottom <= target_y) continue          // this whole text node fits above the break
		// binary-search the first offset whose character bottom exceeds target_y
		let lo = 0, hi = len
		while (lo < hi) {
			const mid = (lo + hi) >> 1
			range.setStart(tn, mid)
			range.setEnd(tn, mid + 1)
			const cr = range.getBoundingClientRect()
			if (cr.bottom > target_y) hi = mid; else lo = mid + 1
		}
		return { node: tn, offset: lo }
	}
	return null
}//end dom_position_at_y



/**
* BUILD_CONTINUATION_TEXTBLOCK_NODE
* Builds a .flow_row.flow_continued for a slice of a SINGLE text block (e.g. a long
* <p>) split at line boundaries. Rebuilds the wrapper chain between the master cell
* content and the text block (cloned shallow) so font/value styling is preserved,
* then mounts `cont_block` (the tail clone holding the overflow content).
* @returns {HTMLElement}
*/
const build_continuation_textblock_node = function(master_content, master_block, cont_block) {
	const row_node	= ui.create_dom_element({ element_type:'div', class_name:'flow_row flow_continued' })
	const cell_node	= ui.create_dom_element({ element_type:'div', class_name:'flow_cell', parent: row_node })
	cell_node.style.flex = '0 0 100%'
	const content	= ui.create_dom_element({ element_type:'div', class_name:'box_content cell_content', parent: cell_node })
	content.style.cssText = master_content.style.cssText
	// clone the ancestor chain (cell_content → … → text block) shallow, preserving classes
	const chain = []
	let a = master_block.parentElement
	while (a && a !== master_content && chain.length < 8) { chain.unshift(a); a = a.parentElement }
	let mount = content
	for (let i = 0; i < chain.length; i++) { const cl = chain[i].cloneNode(false); mount.appendChild(cl); mount = cl }
	mount.appendChild(cont_block)
	return row_node
}//end build_continuation_textblock_node



/**
* FIND_LINE_SPLIT_TARGET
* Locates the single text block to split by LINES inside a cell whose content is one
* block taller than a page (a long component_text_area paragraph). Descends named
* value containers through single-child wrappers to the deepest element that holds
* the wrapped text. Returns null when there is no text to split.
* @returns {HTMLElement|null}
*/
const find_line_split_target = function(content) {
	let c = content.querySelector('.ck-content, .value_container, .editor_container, .content_data') || content
	let guard = 0
	while (c && c.children.length===1 && c.firstElementChild && guard++<12) c = c.firstElementChild
	return (c && (c.textContent||'').trim().length) ? c : null
}//end find_line_split_target



/**
* SPLIT_TEXT_BY_LINES
* Splits a single text block (too tall for one page) across pages at LINE boundaries.
* The block's content above each page break stays; the overflow tail is extracted and
* rebuilt as a continuation block on a fresh page; repeats until the remainder fits.
* This is the fallback for a long paragraph that has no internal block units to split
* at (component_text_area transcription longer than a page).
* @param {Object} ctx
* @param {HTMLElement} row_node - the row on the current page (already placed)
* @param {HTMLElement} target   - the text block element to split
* @param {number} usable_px     - usable column height per page
* @returns {number} px used on the final continuation page
*/
const split_text_by_lines = function(ctx, row_node, target, usable_px) {
	const master_content = row_node.querySelector('.cell_content') || row_node
	let guard = 0
	while (guard++ < 400) {
		const col		= ctx.current_page.column
		const col_top	= col.getBoundingClientRect().top
		const tr		= target.getBoundingClientRect()
		const head		= tr.top - col_top
		if (tr.height <= usable_px - head + 1) return head + tr.height   // fits — done

		const break_y	= col_top + usable_px
		const pos		= dom_position_at_y(target, break_y)
		if (!pos) return head + tr.height
		// back up to a word boundary so we never cut mid-word
		let node = pos.node, offset = pos.offset
		while (offset > 0 && !/\s/.test(node.textContent[offset-1])) offset--
		// loop guard: if nothing would stay on this page (first line taller than the page
		// height, or head leaves no room), place the block whole and stop
		const first_tn = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, null).nextNode()
		if (offset <= 0 && node === first_tn) return head + tr.height

		const range = document.createRange()
		range.setStart(node, offset)
		range.setEndAfter(target.lastChild)
		const tail = range.extractContents()
		if (!tail || !(tail.textContent||'').trim().length) return head + target.getBoundingClientRect().height

		make_page_node(ctx)
		const cont_target	= target.cloneNode(false)
		cont_target.appendChild(tail)
		const cont_row		= build_continuation_textblock_node(master_content, target, cont_target)
		const mcell			= row_node.querySelector('.flow_cell')
		cont_row.dataset.masterRowId	= row_node.dataset.masterRowId || row_node.dataset.rowId || ''
		cont_row.dataset.masterCellId	= row_node.dataset.masterCellId || (mcell ? mcell.dataset.cellId : '') || ''
		ctx.current_page.column.appendChild(cont_row)
		target		= cont_target
		row_node	= cont_row
	}
	return usable_px
}//end split_text_by_lines



/**
* BUILD_CONTINUATION_TABLE_NODE
* Builds a full-width .flow_row.flow_continued node for a slice of table <tr>
* nodes that overflowed onto a continuation page.
*
* The continuation table is structurally complete: it gets a cloned <colgroup>
* (so column widths match the master), a cloned <thead> (repeated header row),
* and a fresh <tbody> containing the moved <tr> nodes. This means each
* continuation page is self-contained and will print correctly even if the
* browser splits it at the wrong boundary.
*
* Cloning colgroup/thead with cloneNode(true) is intentional — the originals must
* remain in the master table for the first page. The <tr> nodes are MOVED
* (appendChild, not cloneNode) because they were already removed from the original
* <tbody> by split_long_row → n.remove().
*
* The portal_table className + tableLayout inline style are copied so the
* continuation table inherits any fixed-layout column sizing set by the renderer.
*
* master_content may be null in edge cases where the cell was rendered but its
* content node was not yet in the DOM when split_long_row ran (null-guarded inline).
*
* @param {HTMLElement} table          - The master <table> element (colgroup/thead source)
* @param {Array} seg_rows             - <tr> nodes to place in the continuation <tbody> (moved)
* @param {Object} ctx                 - The active layout context (reserved for future use)
* @param {HTMLElement} master_content - The master .cell_content div (inline style source); may be null
* @returns {HTMLElement} A .flow_row.flow_continued node ready to append to a .flow_column
*/
const build_continuation_table_node = function(table, seg_rows, ctx, master_content) {

	const row_node	= ui.create_dom_element({ element_type:'div', class_name:'flow_row flow_continued' })
	const cell_node	= ui.create_dom_element({ element_type:'div', class_name:'flow_cell', parent: row_node })
	cell_node.style.flex = '0 0 100%'
	const content	= ui.create_dom_element({ element_type:'div', class_name:'box_content cell_content', parent: cell_node })
	if (master_content) content.style.cssText = master_content.style.cssText   // color / font / align

	const t2 = document.createElement('table')
	t2.className = 'portal_table'
	if (table.style.tableLayout) t2.style.tableLayout = table.style.tableLayout
	const cg = table.querySelector('colgroup')
	if (cg) t2.appendChild(cg.cloneNode(true))
	const th = table.querySelector('thead')
	if (th) t2.appendChild(th.cloneNode(true))
	const tb = document.createElement('tbody')
	for (let i = 0; i < seg_rows.length; i++) tb.appendChild(seg_rows[i])  // move
	t2.appendChild(tb)
	content.appendChild(t2)

	return row_node
}//end build_continuation_table_node



// @license-end
