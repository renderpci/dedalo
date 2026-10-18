// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, before, after, assert */
/*eslint no-undef: "error"*/

/**
* TEST_SECTION_LIST_HEADER
* The section list header survives pagination.
*
* The list is ONE grid: `.list_body` (display:grid) owns the header cells and
* every row cell, because `.header_wrapper_list`, `.content_data` and each
* `.section_record.list` are `display: contents`. The header is therefore ROW 1
* of that grid, and pagination replaces the whole `.content_data` node
* (`common.render` render_level 'content').
*
* THE WEBKIT TRAP (the bug this suite exists for):
*   `.head_column` must NOT clip its VERTICAL overflow. With
*   `overflow: hidden` WebKit (Safari) keeps a WRONG intrinsic height for row 1
*   after the content_data swap: the header row collapses to a sliver and every
*   cell clips its title to ~2px. Reproduced and measured in WebKit on oh1 —
*   48.1px → 22.1px on page 1 and 35.1px on page 2 — and it persists across
*   every subsequent swap; Chrome/Gecko are unaffected. `overflow-x: clip;
*   overflow-y: visible` keeps the horizontal clip (the label ellipsis itself
*   lives on `.name`, truncate_text) while leaving the row height intrinsic,
*   and holds the header at 48.13px across repeated cycles.
*
* The clipping/alignment asserts pass in Chrome either way (Chromium sizes the
* row correctly); they pin the BEHAVIOUR. The CSSOM/computed asserts pin the
* DECLARATIONS that keep WebKit honest, and they are the half that fails if the
* overflow law is dropped. Chrome cannot reproduce the WebKit failure itself —
* it is verified in a WebKit/Safari probe (see the changes entry).
*
* VIEWPORT: the list view is responsive — under 1024px `.list_body` drops to
* `display: block` and the header is hidden, so the suite iframe (narrower than
* the desktop breakpoint) cannot host the desktop fixture. The fixture therefore
* lives in its own 1200px iframe loading the REAL main.css, where the desktop
* grid path applies exactly as in production.
*
* Backend-free: a synthetic grid with the real classes and the real stylesheet.
*/

// the compiled stylesheet the suite frame must load, resolved from this module
// (js/ → client/ → test/ → dedalo/ → core/page/css/main.css)
const STYLESHEET_HREF = new URL('../../../core/page/css/main.css', import.meta.url).href

// The two content generations deliberately have DIFFERENT row heights — the
// trigger condition for the WebKit track re-size.
const FIRST_GENERATION_HEIGHTS = [
	[36, 36, 36],
	[120, 90, 120],
	[36, 36, 36]
]
const SECOND_GENERATION_HEIGHTS = [
	[90, 36, 90],
	[36, 36, 36],
	[150, 120, 150]
]

let frame = null
let frame_doc = null
let frame_win = null
let test_container = null

/**
* WAIT_FOR
* Poll a predicate until true or the timeout elapses. Used instead of the
* link's `load` event: a stylesheet already served from cache can fire before
* the listener is attached.
* @param {Function} predicate
* @param {number} [timeout_ms]
* @returns {Promise<boolean>}
*/
const wait_for = async (predicate, timeout_ms=3000) => {

	const start = Date.now()
	while (Date.now() - start < timeout_ms) {
		if (predicate()) {
			return true
		}
		await new Promise((resolve) => setTimeout(resolve, 25))
	}

	return predicate()
}//end wait_for

/**
* MAKE_HEADER_CELL
* One `.head_column`, optionally the two-line sub-header shape used by the
* Audiovisual column (a nested grid inside the header cell).
* @param {Document} doc
* @param {string} label
* @param {Array<string>} [sub_labels]
* @returns {HTMLElement}
*/
const make_header_cell = (doc, label, sub_labels) => {

	const cell = doc.createElement('div')
	cell.className = 'head_column' + (sub_labels ? ' with_sub_header' : '')

	const name = doc.createElement('span')
	name.className = 'name'
	name.textContent = label
	cell.appendChild(name)

	if (sub_labels) {
		const sub_header = doc.createElement('div')
		sub_header.className = 'sub_header'
		// set_element_css would inject this through rAF; inline keeps the
		// fixture synchronous and is what the rendered page ends up with.
		sub_header.style.gridTemplateColumns = '1fr 1fr'
		for (const sub_label of sub_labels) {
			const sub_cell = doc.createElement('div')
			sub_cell.className = 'head_column'
			const sub_name = doc.createElement('span')
			sub_name.className = 'name'
			sub_name.textContent = sub_label
			sub_cell.appendChild(sub_name)
			sub_header.appendChild(sub_cell)
		}
		cell.appendChild(sub_header)
	}

	return cell
}//end make_header_cell

/**
* MAKE_ROW
* A `.section_record.list` with one `.column` per height. The inline-height
* block is the cell's content; the columns themselves stay `height:auto` as in
* the real renderer.
* @param {Document} doc
* @param {Array<number>} heights
* @returns {HTMLElement}
*/
const make_row = (doc, heights) => {

	const row = doc.createElement('div')
	row.className = 'section_record list'

	for (const height of heights) {
		const column = doc.createElement('div')
		column.className = 'column'
		const content = doc.createElement('div')
		content.className = 'list_cell_content'
		content.style.height = `${height}px`
		column.appendChild(content)
		row.appendChild(column)
	}

	return row
}//end make_row

/**
* MAKE_GRID
* The real list DOM shape: section > list_body > [header_wrapper_list |
* content_data > section_record.list], with the display:contents wrappers.
* @param {Document} doc
* @param {Array<Array<number>>} rows_heights
* @returns {Object} { section, list_body, header, content_data }
*/
const make_grid = (doc, rows_heights) => {

	const section = doc.createElement('section')
	section.className = 'wrapper_section section list view_default'

	const list_body = doc.createElement('div')
	list_body.className = 'list_body'
	// what view_default_list_section sets from ui.flat_column_items
	list_body.style.gridTemplateColumns = '1fr 1fr 1fr'

	const header = doc.createElement('div')
	header.className = 'header_wrapper_list section'
	header.appendChild(make_header_cell(doc, 'Id'))
	header.appendChild(make_header_cell(doc, 'Title'))
	header.appendChild(make_header_cell(doc, 'Audiovisual', ['Transcribed', 'Indexed']))

	const content_data = doc.createElement('div')
	content_data.className = 'content_data list section'
	for (const heights of rows_heights) {
		content_data.appendChild(make_row(doc, heights))
	}

	list_body.appendChild(header)
	list_body.appendChild(content_data)
	section.appendChild(list_body)
	test_container.appendChild(section)

	return { section, list_body, header, content_data }
}//end make_grid

/**
* HEADER_CELLS / ROW_CELLS
* @param {Object} grid
* @returns {Array<HTMLElement>}
*/
const header_cells = (grid) => Array.from(grid.header.querySelectorAll(':scope > .head_column'))
const row_cells = (grid, row_index=0) => Array.from(
	grid.content_data.querySelectorAll('.section_record.list')[row_index].querySelectorAll(':scope > .column')
)

/**
* ASSERT_HEADER_INTACT
* The header is fully painted, does not overlap the first row, and stays
* column-aligned with it.
* @param {Object} grid
* @param {string} context - assertion label
* @returns {void}
*/
const assert_header_intact = (grid, context) => {

	const cells = header_cells(grid)
	const first_row = row_cells(grid)
	assert.equal(cells.length, 3, `${context}: three header cells`)
	assert.equal(first_row.length, 3, `${context}: three cells in the first row`)

	for (let i = 0; i < cells.length; i++) {
		const cell = cells[i]
		const name = cell.querySelector(':scope > .name')

		// not clipped by the cell's own overflow:hidden
		assert.equal(
			cell.scrollHeight <= cell.clientHeight + 1,
			true,
			`${context}: header cell ${i} content (${cell.scrollHeight}px) fits its box (${cell.clientHeight}px)`
		)

		// the box carries the label line, not a sliver of it
		assert.equal(
			cell.getBoundingClientRect().height >= name.getBoundingClientRect().height - 1,
			true,
			`${context}: header cell ${i} is at least as tall as its name line`
		)

		// shared grid columns: the header cell and the row cell line up
		const header_rect = cell.getBoundingClientRect()
		const row_rect = first_row[i].getBoundingClientRect()
		assert.equal(
			Math.abs(header_rect.left - row_rect.left) <= 1,
			true,
			`${context}: header cell ${i} left aligns with its row cell (${header_rect.left} vs ${row_rect.left})`
		)
		assert.equal(
			Math.abs(header_rect.width - row_rect.width) <= 1,
			true,
			`${context}: header cell ${i} width matches its row cell (${header_rect.width} vs ${row_rect.width})`
		)

		// no vertical overlap with the first data row
		assert.equal(
			first_row[i].getBoundingClientRect().top >= header_rect.bottom - 1,
			true,
			`${context}: header cell ${i} does not overlap the first row`
		)
	}
}//end assert_header_intact

/**
* FIND_RULES
* Walk every style rule (media queries and CSS nesting included) and collect
* the declarations whose selectorText matches `selector` exactly.
* (!) Modern Chrome exposes `cssRules` on plain CSSStyleRule objects too (CSS
* nesting), so a rule must be matched on its selectorText BEFORE deciding
* whether it is a container — treating `cssRules` alone as "container" skips
* every style rule.
* @param {Array<CSSStyleSheet>} style_sheets
* @param {string} selector
* @returns {Array<CSSStyleDeclaration>}
*/
const find_rules = (style_sheets, selector) => {

	const found = []
	const walk = (rules) => {
		for (const rule of rules) {
			if (rule.selectorText === selector && rule.style) {
				found.push(rule.style)
			}
			if (rule.cssRules && rule.cssRules.length > 0) {
				walk(rule.cssRules)
			}
		}
	}
	for (const sheet of style_sheets) {
		let rules
		try {
			rules = sheet.cssRules
		} catch (error) {
			continue // cross-origin sheet: nothing of ours
		}
		if (rules) {
			walk(rules)
		}
	}

	return found
}//end find_rules



describe('SECTION LIST HEADER — the overflow law', () => {

	before(async function () {

		// the default 2000ms is not enough for a cold iframe + stylesheet load
		// in the run's own browser: a hook timeout here aborts the suite before
		// any it() runs (the card then reads "registered zero tests")
		this.timeout(20000)

		// off-screen (NOT display:none: a hidden frame skips layout) and wide
		// enough that the desktop grid path applies inside it
		frame = document.createElement('iframe')
		frame.style.cssText = 'position:absolute;left:-10000px;top:0;width:1200px;height:800px;border:0;'
		// listener BEFORE append: an about:blank load event can fire in the
		// append itself, and a listener attached afterwards would never hear it
		const frame_loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }))
		document.body.appendChild(frame)
		if (!frame.contentDocument || frame.contentDocument.readyState !== 'complete') {
			await Promise.race([
				frame_loaded,
				new Promise((resolve) => setTimeout(resolve, 5000)),
			])
		}

		frame_doc = frame.contentDocument
		frame_win = frame.contentWindow
		frame_doc.open()
		frame_doc.write(
			'<!doctype html><html><head><meta charset="utf-8">'
			+ `<link rel="stylesheet" href="${STYLESHEET_HREF}">`
			+ '</head><body></body></html>'
		)
		frame_doc.close()

		const ready = await wait_for(() => {
			try {
				return frame_doc.styleSheets.length > 0 && frame_doc.styleSheets[0].cssRules.length > 0
			} catch (error) {
				return false
			}
		}, 8000)
		assert.equal(ready, true, 'the suite frame loaded main.css')

		test_container = frame_doc.createElement('div')
		test_container.className = 'container section_list_header'
		frame_doc.body.appendChild(test_container)
	})

	after(() => {
		if (frame) {
			frame.remove()
		}
	})

	it('keeps the header cells\' vertical overflow visible (the WebKit row-height trap)', () => {

		const cell_rules = find_rules(frame_doc.styleSheets, '.header_wrapper_list .head_column')
		const sub_header_rules = find_rules(frame_doc.styleSheets, '.header_wrapper_list .head_column.with_sub_header')
		assert.equal(cell_rules.length >= 1, true, 'main.css has a .head_column rule')
		assert.equal(sub_header_rules.length >= 1, true, 'main.css has a .head_column.with_sub_header rule')

		const declares_visible = (styles) => styles.some((style) => style.overflowY === 'visible')
		assert.equal(
			declares_visible(cell_rules),
			true,
			'.head_column declares `overflow-y: visible` — WebKit collapses the header row after pagination when the vertical axis is clipped'
		)
		assert.equal(
			declares_visible(sub_header_rules),
			true,
			'.head_column.with_sub_header declares `overflow-y: visible` too (it re-declares overflow)'
		)

		const declares_hidden = (styles) => styles.some((style) => style.overflowY === 'hidden')
		assert.equal(declares_hidden(cell_rules), false, 'no .head_column rule clips the vertical axis')
		assert.equal(declares_hidden(sub_header_rules), false, 'no .with_sub_header rule clips the vertical axis')

		// the horizontal clip (and with it the label truncation) is kept
		assert.equal(
			cell_rules.some((style) => style.overflowX === 'clip' || style.overflowX === 'hidden'),
			true,
			'.head_column still clips horizontally'
		)
		const name_rules = find_rules(frame_doc.styleSheets, '.header_wrapper_list .head_column > .name')
		assert.equal(
			name_rules.some((style) => style.textOverflow === 'ellipsis' && style.whiteSpace === 'nowrap'),
			true,
			'the label ellipsis lives on .name and stays enabled'
		)
	})

	it('keeps the header unclipped and column-aligned across a pagination swap with mixed row heights', () => {

		// the fixture must really be in the desktop branch the bug needs
		assert.equal(
			frame_win.matchMedia('(min-width: 1025px)').matches,
			true,
			'fixture viewport is the desktop breakpoint (responsive list grid active)'
		)

		const grid = make_grid(frame_doc, FIRST_GENERATION_HEIGHTS)

		// the trigger condition is really in the fixture: the two data rows
		// do NOT share a height
		const first_row_cells = row_cells(grid, 0)
		const second_row_cells = row_cells(grid, 1)
		assert.equal(
			Math.abs(first_row_cells[0].getBoundingClientRect().height - second_row_cells[0].getBoundingClientRect().height) > 10,
			true,
			'fixture: data rows have different heights'
		)

		// computed declarations on the live element (the CSSOM asserts above
		// prove the source; this proves they reach the element)
		assert.equal(frame_win.getComputedStyle(grid.list_body).display, 'grid', 'list_body is a grid')
		const cell_style = frame_win.getComputedStyle(header_cells(grid)[0])
		assert.equal(cell_style.overflowY, 'visible', 'header cells compute overflow-y: visible')
		assert.equal(cell_style.overflowX, 'clip', 'header cells compute overflow-x: clip')

		assert_header_intact(grid, 'first page')

		const header_height = header_cells(grid)[0].getBoundingClientRect().height

		// PAGINATION: replace the whole content_data node, exactly as
		// common.render render_level 'content' does.
		const next_content_data = frame_doc.createElement('div')
		next_content_data.className = 'content_data list section'
		for (const heights of SECOND_GENERATION_HEIGHTS) {
			next_content_data.appendChild(make_row(frame_doc, heights))
		}
		grid.content_data.replaceWith(next_content_data)
		grid.content_data = next_content_data

		// force the grid to resolve the new tracks before measuring
		void grid.list_body.offsetHeight

		assert_header_intact(grid, 'after pagination')

		assert.equal(
			Math.abs(header_cells(grid)[0].getBoundingClientRect().height - header_height) <= 1,
			true,
			`the header row keeps its height across pagination (${header_height}px)`
		)

		grid.section.remove()
	})
})
