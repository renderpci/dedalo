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
*/

	import {ui} from '../../../core/common/js/ui.js'
	import {PX_PER_MM, page_dims, mm_to_px, apply_box_style} from './canvas_tool_print.js'
	import {render_box_content} from './render_box_tool_print.js'



/**
* MAKE_EDITOR_CTX
* Layout context for the on-screen editor (zoom-dependent px).
* @param object self
* @param HTMLElement root
* @return object ctx
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
* Layout context for print: physical mm units, zoom-independent.
* @param object self
* @param HTMLElement root
* @return object ctx
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
* Renders the layout's flow into generated pages inside ctx.root, paginating.
* @param object self
* @param object ctx - from make_editor_ctx / make_print_ctx
* @return promise object[] - the generated page descriptors [{node, column}]
*/
export const layout_flow = async function(self, ctx) {

	const rows		= (self.layout.flow && Array.isArray(self.layout.flow.rows)) ? self.layout.flow.rows : []
	const usable_px	= ctx.to_px(ctx.page_h_mm - ctx.margins.top - ctx.margins.bottom)

	make_page_node(ctx)        // first page
	let used = 0               // px used in the current page's column

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i]

		// spacer row ----------------------------------------------------------
		if (row.kind==='spacer') {
			const h = ctx.to_px(row.height_mm || 8)
			if (used + h > usable_px && used > 0) { make_page_node(ctx); used = 0 }
			// a flow_row (with data-row-id) so the editor can select/move/remove it
			const sp = ui.create_dom_element({ element_type:'div', class_name:'flow_row flow_spacer', parent: ctx.current_page.column })
			sp.dataset.rowId = row.id
			sp.style.height = ctx.to_css(row.height_mm || 8)
			used += h
			continue
		}

		// content row ---------------------------------------------------------
		const row_node = await render_row_node(self, row, ctx)
		ctx.current_page.column.appendChild(row_node)
		let h			= ctx.measure(row_node)
		const remaining	= usable_px - used
		const gap		= ctx.to_px(row.space_after_mm || 0)

		if (h <= remaining) { used += h + gap; continue }   // fits

		// doesn't fit: split if the row is a single full-width block of repeatable
		// units (table rows or text paragraphs), else move it whole to a fresh page
		const info = splittable_container(row, row_node)
		if (info) {
			used = split_long_row(self, ctx, row_node, used, usable_px, info)
		} else {
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
* appends it to ctx.root, and sets it as the current page.
* @param object ctx
* @return object page { node, column }
*/
const make_page_node = function(ctx) {

	const pg = ui.create_dom_element({ element_type:'div', class_name:'print_page', parent: ctx.root })
	pg.style.width	= ctx.to_css(ctx.page_w_mm)
	pg.style.height	= ctx.to_css(ctx.page_h_mm)
	pg.dataset.wmm	= ctx.page_w_mm
	pg.dataset.hmm	= ctx.page_h_mm
	pg.dataset.pageIndex = ctx.pages.length

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
* Builds a flow row (flex of cells), rendering each cell's component value via
* the shared render_box_content (the cell's block acts as the "box").
* @param object self
* @param object row
* @param object ctx
* @return promise HTMLElement row node
*/
const render_row_node = async function(self, row, ctx) {

	const row_node = ui.create_dom_element({ element_type:'div', class_name:'flow_row' })
	row_node.dataset.rowId = row.id
	if (row.space_after_mm) row_node.style.marginBottom = ctx.to_css(row.space_after_mm)

	const cells	= Array.isArray(row.cells) ? row.cells : []
	const n		= cells.length || 1

	for (let i = 0; i < cells.length; i++) {
		const cell		= cells[i]
		// a lone cell always fills the column (100%); only shared rows use fractions
		const frac		= (n===1) ? 1 : ((typeof cell.width==='number' && cell.width>0) ? cell.width : (1 / n))
		const cell_node	= ui.create_dom_element({ element_type:'div', class_name:'flow_cell', parent: row_node })
		cell_node.dataset.cellId = cell.id
		cell_node.dataset.rowId	= row.id
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
* A 1-cell full-width row can be split across pages when its content has a
* container of repeatable block units: a portal table's <tbody> (>1 <tr>), OR a
* rich-text block container (>1 paragraphs — e.g. a long text_area transcription).
* @return object|null { kind:'table'|'text', content, container, table? }
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

const is_splittable_row = (row, row_node) => !!splittable_container(row, row_node)

/**
* FIND_TEXT_CONTAINER
* The element holding the paragraphs of a rendered text value (CKEditor content),
* descending past single-child wrappers to the element with the actual blocks.
*/
const find_text_container = function(content) {
	let c = content.querySelector('.ck-content, .value_container, .editor_container')
	if (c) {
		let guard = 0
		while (c && c.children.length===1 && c.firstElementChild && c.firstElementChild.children.length>1 && guard++<8) {
			c = c.firstElementChild
		}
		if (c && c.children.length>1) return c
	}
	// fallback: the deepest element with the most block children
	let best = null, bestN = 1
	content.querySelectorAll('*').forEach(el => { if (el.children.length>bestN) { bestN = el.children.length; best = el } })
	return best
}//end find_text_container



/**
* SPLIT_LONG_ROW
* Splits a 1-cell row (table or text) across pages at its unit boundaries (<tr>
* or paragraphs): units that fit below the current fill stay; the rest move onto
* fresh pages. Returns the px used on the LAST page.
* @return number used px on the final page
*/
const split_long_row = function(self, ctx, row_node, used, usable_px, info) {

	const content	= info.content
	const units		= [...info.container.children]
	if (units.length < 2) return used + ctx.measure(row_node)

	// identify the master cell so continuation segments can re-select it on click
	const master_cell	= row_node.querySelector('.flow_cell[data-cell-id]')
	const master_ids	= { row: row_node.dataset.rowId || '', cell: master_cell ? master_cell.dataset.cellId : '' }

	// height consumed above the units within the cell content
	const c_top		= content.getBoundingClientRect().top
	const head_h	= Math.max(0, info.container.getBoundingClientRect().top - c_top)
	const thead		= (info.kind==='table') ? info.table.querySelector('thead') : null
	const thead_h	= thead ? ctx.measure(thead) : 0
	const unit_h	= units.map(u => ctx.measure(u))

	// how many units fit below the current fill on this page
	const avail_first = usable_px - used - head_h
	let u = 0, k = 0
	for (; k < units.length; k++) {
		if (u + unit_h[k] > avail_first && k > 0) break
		u += unit_h[k]
	}
	if (k >= units.length) return used + head_h + u   // everything fit after all

	const overflow		= units.slice(k)
	const overflow_h	= unit_h.slice(k)
	overflow.forEach(n => n.remove())

	// continuation pages: tables repeat the header; text continues the paragraphs
	const cont_head = (info.kind==='table') ? thead_h : 0
	let idx = 0, guard = 0
	while (idx < overflow.length && guard++ < 5000) {
		make_page_node(ctx)
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
		used = cont_head + v
	}

	return used
}//end split_long_row



/**
* BUILD_CONTINUATION_TEXT_NODE
* A full-width flow row continuing a text block: copies the master cell content's
* inline style (color/font) and re-wraps the moved paragraphs so the auto-height
* CSS applies.
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
* BUILD_CONTINUATION_TABLE_NODE
* A full-width flow row holding a table segment (cloned colgroup + header +
* the given moved <tr>), for a continuation page. Copies the master cell
* content's inline style (color/font/align) so the segment matches the master.
* @param HTMLElement table - the master table (colgroup/header source)
* @param HTMLElement[] seg_rows - <tr> nodes to place (moved)
* @param object ctx
* @param HTMLElement master_content - the master .cell_content (style source)
* @return HTMLElement row node
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
