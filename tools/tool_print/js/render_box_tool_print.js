// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals */
/*eslint no-undef: "error"*/



/**
* RENDER_BOX_TOOL_PRINT
*
* Per-box rendering helpers for tool_print: fills a box's content node with
* either a placeholder (template-edit mode) or the read-only, chrome-stripped
* value of the referenced component for the current preview record (fill mode).
*
* Two rendering paths exist:
*  - LITERAL components (text, date, checkbox, …): rendered in list mode (or
*    edit mode for component_text_area which truncates in list mode), then
*    flattened by flatten_print_node — inputs/selects/textareas become
*    static <span> nodes, edit chrome is removed.
*  - RELATION/PORTAL components: never rendered in list mode (they would need
*    a full section datum to build nested section_records). Instead, a
*    flat <table> is built from the portal's entries + per-column cell
*    instances; the table is cached per-record so column reorders/removes/
*    resizes do not trigger additional API calls.
*
* Exported symbols consumed by canvas_tool_print.js and render_tool_print.js:
*  - render_box_content   — main entry point
*  - render_component_value
*  - get_related_section_tipo
*  - get_default_columns
*  - column_key
*  - load_all_entries
*  - is_relation_model
*  - full_value_mode
*/

import {get_instance} from '../../../core/common/js/instances.js'
import {ui} from '../../../core/common/js/ui.js'
import {clone} from '../../../core/common/js/utils/index.js'



// RELATION_MODELS: component models whose list-mode view requires a full
// section datum to build nested section_records, making them unsuitable for
// standalone rendering in the print path. These are handled by build_portal_table
// (which fetches entries individually) rather than render_component_value.
	const RELATION_MODELS = new Set([
		'component_portal',
		'component_autocomplete',
		'component_autocomplete_hi',
		'component_relation_parent',
		'component_relation_children',
		'component_relation_model',
		'component_relation_index',
		'component_relation_radio_button'
	])

	// IS_RELATION_MODEL: returns true when the model belongs to RELATION_MODELS.
	// Relations render via the table path (edit mode, exposes the full column grid
	// of related records); literals render in list mode (flat value).
	export const is_relation_model = (model) => RELATION_MODELS.has(model)

	// FULL_VALUE_MODELS: component models that must render in edit mode even for
	// the print path, because their list-mode response is server-side truncated
	// (~220 chars for component_text_area). flatten_print_node then extracts the
	// complete value from the textarea / contenteditable element.
	const FULL_VALUE_MODELS = new Set(['component_text_area'])
	// FULL_VALUE_MODE: returns 'edit' for truncation-prone models, 'list' for all others.
	export const full_value_mode = (model) => FULL_VALUE_MODELS.has(model) ? 'edit' : 'list'



// PRINT_CHROME_SELECTORS: joined CSS selector that targets every piece of
// interactive/decorative chrome added by the component's default view —
// field labels, action buttons, paginators, grid headers. Used by
// flatten_print_node to remove these nodes so only raw data values remain.
// (!) The '.wrapper_component > .label' rule intentionally strips the
// per-field label added by edit mode; the box has its own print_label
// so keeping the component label would duplicate it in output.
	const PRINT_CHROME_SELECTORS = [
		'.buttons_container',
		'.buttons_fold',
		'.button',
		'.paginator_container',
		'.paginator',
		'.tools',
		'.wrap_buttons',
		'.grid_head',
		'.list_head',
		'.column_head',
		'.ui-sortable-handle',
		// edit-mode field label + lang note ("Título [lg-spa]") — the box shows its
		// own print_label, so this would be a duplicate
		'.wrapper_component > .label',
		'.label > .note'
	].join(',')



/**
* RENDER_COMPONENT_VALUE
* Returns a DOM node with the flat print value of a built component instance.
* For relation/portal models, delegates to build_portal_table (which assembles
* a flat <table> from entry rows + per-column cell instances), falling back to
* build_relation_node (ddinfo label list) when there are no entries or the table
* cannot be constructed. For literal models, calls component.render(), then
* strips chrome via flatten_print_node (inputs/selects/textareas become
* inert <span> nodes; contenteditable is neutralised).
* @param {Object} component - a fully built component instance
* @param {string} model - the component model name (e.g. 'component_input_text')
* @param {Object} [options={}] - optional overrides: {columns, self, lang, show_header}
* @returns {Promise<HTMLElement>} flat, chrome-free DOM node ready for print insertion
*/
export const render_component_value = async function(component, model, options={}) {

	// portals/relations → data-driven flat table (one row per related record,
	// one column per chosen ddo). Built from component.data.entries +
	// per-record cell instances, so columns can be freely added/removed.
	if (RELATION_MODELS.has(model)) {
		const table = await build_portal_table(component, options.columns, options.self, options.lang, options.show_header)
		if (table) return table
		return build_relation_node(component) // no entries / fallback
	}

	// literals → flat value (list view), inputs converted to text, chrome stripped
	const node = await component.render()
	flatten_print_node(node)
	return node
}//end render_component_value



/**
* GET_RELATED_SECTION_TIPO
* Returns the section_tipo of the first related record in the portal's entries
* (i.e. the section to which the related records belong). Used by
* get_default_columns to filter ddo_map entries that belong to the related
* section (skipping parent-paired / dataframe columns), and by render_relation_table
* to set block.related_section_tipo for the inspector's column-picker.
* Returns null when the portal has no entries.
* @param {Object} component - a fully built portal/relation component instance
* @returns {string|null} section_tipo string or null when entries is empty
*/
export const get_related_section_tipo = function(component) {
	const entries = (component.data && Array.isArray(component.data.entries)) ? component.data.entries : []
	return entries.length ? entries[0].section_tipo : null
}//end get_related_section_tipo



/**
* GET_DEFAULT_COLUMNS
* Builds the default column set for a portal/relation table: always an 'id'
* column (prints the related record's section_id), followed by every entry from
* context.request_config[0].show.ddo_map whose section_tipo matches the
* related section. Columns whose section_tipo differs are parent-paired
* (e.g. dataframe qualifier columns on the parent record) and cannot be
* rendered per related record, so they are excluded.
* @param {Object} component - a fully built portal/relation component instance
* @returns {Array<Object>} column descriptors [{type, label, tipo?, section_tipo?, model?}]
*/
export const get_default_columns = function(component) {

	const rc		= component.context && component.context.request_config
	const ddo_map	= (rc && rc[0] && rc[0].show && Array.isArray(rc[0].show.ddo_map)) ? rc[0].show.ddo_map : []
	const related	= get_related_section_tipo(component)

	const cols = [{ type:'id', label:'Id' }]
	for (let i = 0; i < ddo_map.length; i++) {
		const d = ddo_map[i]
		if (!d || !d.tipo || !d.label) continue
		const st = Array.isArray(d.section_tipo) ? d.section_tipo[0] : d.section_tipo
		if (related && st !== related) continue
		cols.push({ type:'component', label:d.label, tipo:d.tipo, section_tipo:st, model:d.model })
	}

	return cols
}//end get_default_columns



/**
* COLUMN_KEY
* Returns a stable string identity for a column descriptor, used as the key in
* the cell matrix cache (box._table_render.matrix) and for deduplication in the
* inspector column-picker. The 'id' column has the literal key 'id'; component
* columns are keyed by their tipo (e.g. 'c:dd345'), which is unique per section.
* @param {Object} col - column descriptor with at minimum {type} and, for type='component', {tipo}
* @returns {string} stable column key
*/
export const column_key = function(col) {
	return col.type==='id' ? 'id' : ('c:' + col.tipo)
}//end column_key



/**
* BUILD_PORTAL_TABLE
* Async: builds a flat <table> from the portal component's entry data.
* For each non-id column, calls render_cell_value for every entry to produce the
* cell matrix, then delegates to assemble_table_dom for the final DOM.
* Returns null when the portal has no entries or no usable columns (caller
* falls back to build_relation_node in that case).
* This function does NOT cache: the cache lives in box._table_render (managed
* by render_relation_table). This path is used for the no-cache preview call
* inside render_component_value.
* @param {Object} component - the built portal/relation component instance
* @param {Array<Object>|undefined} columns - explicit column list from box.table_columns,
*   or undefined to derive from get_default_columns
* @param {Object} self - tool_print instance (passed through to render_cell_value)
* @param {string} lang - BCP-47 language code for cell render calls
* @param {boolean} show_header - whether to render the <thead> row
* @returns {Promise<HTMLElement|null>} assembled <table> element or null when empty
*/
const build_portal_table = async function(component, columns, self, lang, show_header) {

	const entries = (component.data && Array.isArray(component.data.entries)) ? component.data.entries : []
	if (!entries.length) {
		return null
	}
	const cols = (Array.isArray(columns) && columns.length) ? columns : get_default_columns(component)
	if (!cols.length) {
		return null
	}

	// render the cell value nodes once (fresh; print path has no cache)
	const matrix = {}
	for (let c = 0; c < cols.length; c++) {
		const col = cols[c]
		if (col.type==='id') continue
		const ck = column_key(col)
		matrix[ck] = []
		for (let r = 0; r < entries.length; r++) {
			matrix[ck].push(await render_cell_value(self, col, entries[r].section_id, entries[r].section_tipo, lang))
		}
	}

	return assemble_table_dom(cols, entries, matrix, { show_header: show_header !== false })
}//end build_portal_table



/**
* ASSEMBLE_TABLE_DOM
* Synchronously builds the final <table> DOM from a fully pre-rendered cell matrix.
* Cell nodes are cloned from the matrix (cloneNode(true)) so the caller's cache
* remains reusable for subsequent column reorders, removes, or resizes without
* re-fetching data. 'id' columns write entries[r].section_id as plain text.
* An optional colgroup is generated when any column carries a 'width' (in mm),
* switching table-layout to 'fixed' for predictable print output.
* The header row respects col.header (can be an empty string to suppress the
* label while keeping the column) falling back to col.label.
* @param {Array<Object>} cols - ordered column descriptors
* @param {Array<Object>} entries - related records [{section_id, section_tipo}]
* @param {Object} matrix - keyed cell cache: { [column_key]: HTMLElement[] }
* @param {Object} opts - render options: {show_header: boolean}
* @returns {HTMLElement} assembled <table> element
*/
const assemble_table_dom = function(cols, entries, matrix, opts) {

	const show_header = !opts || opts.show_header !== false

	const table = document.createElement('table')
	table.className = 'portal_table'

	if (cols.some(c => c.width)) {
		table.style.tableLayout = 'fixed'
		const colgroup = document.createElement('colgroup')
		for (let c = 0; c < cols.length; c++) {
			const colEl = document.createElement('col')
			if (cols[c].width) colEl.style.width = cols[c].width + 'mm'
			colgroup.appendChild(colEl)
		}
		table.appendChild(colgroup)
	}

	// header (optional). Each column can override its title via col.header
	// (blank string = keep the column but show an empty heading).
	if (show_header) {
		const thead	= document.createElement('thead')
		const htr	= document.createElement('tr')
		for (let c = 0; c < cols.length; c++) {
			const th = document.createElement('th')
			th.textContent = (cols[c].header !== undefined && cols[c].header !== null)
				? cols[c].header
				: (cols[c].label || '')
			htr.appendChild(th)
		}
		thead.appendChild(htr)
		table.appendChild(thead)
	}

	const tbody = document.createElement('tbody')
	for (let r = 0; r < entries.length; r++) {
		const tr = document.createElement('tr')
		for (let c = 0; c < cols.length; c++) {
			const col	= cols[c]
			const td	= document.createElement('td')
			if (col.type==='id') {
				td.textContent = '' + (entries[r].section_id ?? '')
			} else {
				const node = matrix[column_key(col)] && matrix[column_key(col)][r]
				if (node) td.appendChild(node.cloneNode(true))
			}
			tr.appendChild(td)
		}
		tbody.appendChild(tr)
	}
	table.appendChild(tbody)


	return table
}//end assemble_table_dom



/**
* RENDER_RELATION_TABLE
* Cached editor/fill-mode renderer for portal and relation boxes.
* State lives in box._table_render = { key, entries, matrix }:
*  - key = `${preview_id}|${tipo}|${lang}` — rebuilt when the viewed record
*    or language changes; stale on navigation.
*  - entries = [{section_id, section_tipo}] for all related records (loaded via
*    load_all_entries so pagination is bypassed).
*  - matrix = { [column_key]: HTMLElement[] } — per-column cell cache. Only
*    newly added columns (not in matrix) trigger an API round-trip; column
*    removes/reorders/resizes reuse the cache.
* After the initial build the portal component is destroyed (to release memory);
* only the lightweight entries + matrix are kept on the box object.
* Returns null (→ build_relation_node fallback) when the portal has no entries.
* @param {Object} self - tool_print instance
* @param {Object} box - the box descriptor (mutated: sets _table_render, available_columns,
*   related_section_tipo)
* @param {Object} ref - box.component_ref {model, tipo, section_tipo, view}
* @param {string} lang - BCP-47 language code
* @param {string|number} preview_id - the section_id of the record being previewed
* @returns {Promise<HTMLElement|null>} assembled <table> element or null when empty
*/
const render_relation_table = async function(self, box, ref, lang, preview_id) {

	const cache_key = preview_id + '|' + ref.tipo + '|' + lang

	// build the portal once per record: rows (entries) + available columns
	if (!box._table_render || box._table_render.key !== cache_key) {

		let component = await get_instance({
			model			: ref.model,
			tipo			: ref.tipo,
			section_tipo	: ref.section_tipo,
			section_id		: preview_id,
			lang			: lang,
			mode			: 'edit',
			permissions		: 1,
			view			: ref.view || 'default',
			id_variant		: 'tool_print_' + box.id,
			caller			: self
		})
		await component.build(true)
		component = await load_all_entries(self, component, {
			model: ref.model, tipo: ref.tipo, section_tipo: ref.section_tipo,
			section_id: preview_id, lang, view: ref.view, box_id: box.id
		})

		box.available_columns		= get_default_columns(component)
		box.related_section_tipo	= get_related_section_tipo(component)

		const entries = (component.data && Array.isArray(component.data.entries))
			? component.data.entries.map(e => ({ section_id: e.section_id, section_tipo: e.section_tipo }))
			: []

		try { component.destroy(true, true, true) } catch (e) { /* noop */ }

		box._table_render = { key: cache_key, entries, matrix: {} }
	}

	const entries	= box._table_render.entries
	const matrix	= box._table_render.matrix
	if (!entries.length) return build_relation_node({ data:{ entries:[] }, datum:null })

	const cols = (Array.isArray(box.table_columns) && box.table_columns.length)
		? box.table_columns
		: box.available_columns

	// fetch ONLY the columns whose cells are not cached yet (e.g. a just-added one)
	for (let c = 0; c < cols.length; c++) {
		const col = cols[c]
		if (col.type==='id') continue
		const ck = column_key(col)
		if (!matrix[ck]) {
			matrix[ck] = []
			for (let r = 0; r < entries.length; r++) {
				matrix[ck].push(await render_cell_value(self, col, entries[r].section_id, entries[r].section_tipo, lang))
			}
		}
	}

	return assemble_table_dom(cols, entries, matrix, { show_header: box.show_table_header !== false })
}//end render_relation_table



/**
* RENDER_CELL_VALUE
* Builds and renders a single read-only, chrome-stripped component value for
* one cell of the portal table. Each call is independent (unique id_variant
* 'tpcell_{tipo}_{section_id}') so cells across rows do not share state.
* The component is destroyed immediately after cloning to avoid memory
* accumulation when rendering large portals with many columns.
* Errors are caught and logged; the cell is null on failure (table still renders).
* (!) mode is always 'list' here, even for component_text_area — the portal
* table already aggregates short values across rows and full-length text is
* not practical in a table cell.
* @param {Object} self - tool_print instance (passed as caller)
* @param {Object} col - column descriptor {tipo, section_tipo, model}
* @param {string|number} section_id - section_id of the related record to render
* @param {string} section_tipo - section_tipo of the related record (fallback when
*   col.section_tipo is absent)
* @param {string} lang - BCP-47 language code
* @returns {Promise<HTMLElement|null>} cloned, inert DOM node for the cell, or null on error
*/
const render_cell_value = async function(self, col, section_id, section_tipo, lang) {

	try {
		const component = await get_instance({
			model			: col.model,
			tipo			: col.tipo,
			section_tipo	: col.section_tipo || section_tipo,
			section_id		: section_id,
			lang			: lang || page_globals.dedalo_data_lang,
			mode			: 'list',
			permissions		: 1,
			id_variant		: 'tpcell_' + col.tipo + '_' + section_id, // unique per cell
			caller			: self
		})
		await component.build(true)
		const node	= await component.render()
		flatten_print_node(node)
		const clone	= node ? node.cloneNode(true) : null
		try { component.destroy(true, true, true) } catch (e) { /* noop */ }
		return clone
	} catch (error) {
		console.warn('tool_print: cell render failed', col, section_id, error)
		return null
	}
}//end render_cell_value



/**
* FLATTEN_PRINT_NODE
* Mutates a rendered component node in-place to produce a static, print-safe
* version: strips interactive/decorative chrome (buttons, paginators, labels,
* grid headers) matching PRINT_CHROME_SELECTORS, then converts every form
* control to an inert <span class="print_value">:
*  - <select>  → selected option text
*  - <input type="checkbox|radio"> → '✓' or ''
*  - <input>   → input.value
*  - <textarea> → textarea.value
* Removes contenteditable from rich-text editors so their content is static.
* Adds class 'print_flat' to the root for CSS targeting.
* Iterates collections in reverse order (length-1 → 0) to keep indices valid
* when earlier nodes are removed from the live NodeList.
* Returns the same node (mutated), or the original if it is not a DOM element.
* @param {HTMLElement} node - root element of a rendered component
* @returns {HTMLElement} the same node, now chrome-free and static
*/
const flatten_print_node = function(node) {

	if (!node || typeof node.querySelectorAll!=='function') {
		return node
	}

	// remove chrome (buttons, paginators, grid headers)
		const chrome = node.querySelectorAll(PRINT_CHROME_SELECTORS)
		for (let i = chrome.length - 1; i >= 0; i--) {
			chrome[i].remove()
		}

	// convert edit form controls to static text (their value lives in the
	// element, not in textContent / the value attribute, so a clone would lose it)
		const selects = node.querySelectorAll('select')
		for (let i = selects.length - 1; i >= 0; i--) {
			const sel = selects[i]
			const txt = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : ''
			sel.replaceWith(make_text_span(txt))
		}
		const inputs = node.querySelectorAll('input')
		for (let i = inputs.length - 1; i >= 0; i--) {
			const inp = inputs[i]
			const txt = (inp.type==='checkbox' || inp.type==='radio')
				? (inp.checked ? '✓' : '')
				: (inp.value || '')
			inp.replaceWith(make_text_span(txt))
		}
		const areas = node.querySelectorAll('textarea')
		for (let i = areas.length - 1; i >= 0; i--) {
			areas[i].replaceWith(make_text_span(areas[i].value || ''))
		}

	// neutralize contenteditable (rich text editors)
		const editables = node.querySelectorAll('[contenteditable="true"]')
		for (let i = editables.length - 1; i >= 0; i--) {
			editables[i].removeAttribute('contenteditable')
		}

	node.classList.add('print_flat')


	return node
}//end flatten_print_node



/**
* MAKE_TEXT_SPAN
* Creates a minimal <span class="print_value"> containing the given text,
* used by flatten_print_node to replace form controls with inert equivalents.
* @param {string} text - the text content to display (may be empty)
* @returns {HTMLElement} a <span> element with class 'print_value'
*/
const make_text_span = function(text) {
	const span = document.createElement('span')
	span.className = 'print_value'
	span.textContent = text
	return span
}//end make_text_span



/**
* BUILD_RELATION_NODE
* Fallback renderer for relation/portal components that have no table (no
* entries, or entries lack a matching ddinfo label). Builds a <div> list of
* one <div class="relation_item"> per related record whose ddinfo label can be
* resolved. When no labels are available but entries exist, renders a single
* <span class="relation_empty"> with the numeric count as a last resort.
* ddinfo items in datum.data are filtered by exact (section_id, section_tipo)
* match so multi-section portals resolve each label correctly.
* @param {Object} component - built portal/relation instance with .data.entries
*   and .datum.data (ddinfo items); a bare object with empty arrays is accepted
*   (used when called with a stub on the empty-entries branch).
* @returns {HTMLElement} <div class="wrapper_component relation_value"> container
*/
const build_relation_node = function(component) {

	const wrap = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'wrapper_component relation_value'
	})

	const entries	= (component.data && Array.isArray(component.data.entries)) ? component.data.entries : []
	const ddinfo	= (component.datum && Array.isArray(component.datum.data))
		? component.datum.data.filter(x => x.tipo==='ddinfo')
		: []

	let rendered = 0
	for (let i = 0; i < entries.length; i++) {
		const e		= entries[i]
		const info	= ddinfo.find(d => d.section_id===e.section_id && d.section_tipo===e.section_tipo)
		const label	= (info && info.value)
			? (Array.isArray(info.value) ? info.value.join(', ') : String(info.value))
			: null
		if (label) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'relation_item',
				inner_html		: label,
				parent			: wrap
			})
			rendered++
		}
	}

	// fallback: at least show the related-record count when labels are absent
	if (rendered===0 && entries.length>0) {
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'relation_empty',
			inner_html		: entries.length + '',
			parent			: wrap
		})
	}


	return wrap
}//end build_relation_node



/**
* LOAD_ALL_ENTRIES
* Ensures that a portal/relation component has ALL its related records loaded,
* not just the first page. Portals default to a server-side pagination limit
* (typically ~10 entries). When component.data.pagination.total exceeds the
* number of loaded entries, this function:
*  1. Clones the existing request_config.
*  2. Sets sqo.limit = total and sqo.offset = 0 on the clone.
*  3. Destroys the original component instance.
*  4. Rebuilds a fresh instance with the expanded limit.
* Returns the original component unchanged when total ≤ loaded (already
* complete) or when request_config / sqo is absent (cannot be overridden).
* (!) The destroyed component must not be used after this call; the return
* value is always the component to use.
* @param {Object} self - tool_print instance (passed as caller to get_instance)
* @param {Object} component - the already-built portal component (may be destroyed)
* @param {Object} opts - rebuild parameters:
*   {model, tipo, section_tipo, section_id, lang, view: string, box_id: string|number}
* @returns {Promise<Object>} component instance with all entries in .data.entries
*/
export const load_all_entries = async function(self, component, opts) {

	const pag		= component.data && component.data.pagination
	const total		= pag && pag.total
	const loaded	= (component.data && Array.isArray(component.data.entries)) ? component.data.entries.length : 0

	if (!total || total <= loaded) {
		return component // nothing more to load
	}

	// rebuild with a request_config whose sqo.limit covers the whole relation
	const rc = (component.context && component.context.request_config)
		? clone(component.context.request_config)
		: null
	if (!rc || !rc[0] || !rc[0].sqo) {
		return component // can't override; keep the first page
	}
	rc[0].sqo.limit = total
	rc[0].sqo.offset = 0

	try { component.destroy(true, true, true) } catch (e) { /* noop */ }

	const full = await get_instance({
		model			: opts.model,
		tipo			: opts.tipo,
		section_tipo	: opts.section_tipo,
		section_id		: opts.section_id,
		lang			: opts.lang,
		mode			: 'edit',
		permissions		: 1,
		view			: opts.view || 'default',
		id_variant		: 'tool_print_' + opts.box_id + '_all',
		request_config	: rc,
		caller			: self
	})
	await full.build(true)


	return full
}//end load_all_entries



/**
* RENDER_BOX_CONTENT
* Main entry point: decides which rendering path to use for the given box and
* writes the result into box.content_node. Three branches:
*
*  1. static_text — in-place contenteditable editor (heading / caption text
*     the user types manually; persisted as box.static.text via mark_dirty).
*
*  2. Placeholder — when not in fill mode, no preview_id, box is not a
*     component, or component_ref is missing: renders a cheap dashed-frame
*     placeholder (label only, no instance built).
*
*  3. Fill mode component — instantiates the component read-only and renders
*     its value:
*     - RELATION/PORTAL: render_relation_table (cached per-record; column
*       changes reuse the cache).
*     - LITERAL: fresh get_instance + render_component_value + clone; destroyed
*       immediately. Text areas get 'edit' mode (full_value_mode) because list
*       mode truncates server-side.
*     After rendering, a .print_label div (field name) is prepended inside
*     content_node; the box.show_label CSS flag hides it when false.
*
* Errors in fill mode are caught per-box: render_error_placeholder replaces
* the content with a warning span so the rest of the layout is unaffected.
*
* @param {Object} self - tool_print instance (carries fill_mode, preview_section_id)
* @param {Object} box - box descriptor (carries content_node, type, component_ref,
*   render.lang, table_columns, show_table_header, id, static; mutated by
*   render_relation_table on the relation path)
* @returns {Promise<boolean>} always true (even on error — the placeholder replaces content)
*/
export const render_box_content = async function(self, box) {

	const content = box.content_node
	if (!content) return false

	// static free-text box: editable in place (e.g. "Report of …")
		if (box.type==='static_text') {
			render_static_text(self, box)
			return true
		}

	// template / placeholder mode: cheap label, no instance built
		const preview_id = self.preview_section_id
		if (!self.fill_mode || !preview_id || box.type!=='component' || !box.component_ref) {
			render_placeholder(box)
			return true
		}

	// fill mode: instantiate the component read-only and render its value
		try {

			const ref	= box.component_ref
			const lang	= (box.render?.lang && box.render.lang!=='inherit')
				? box.render.lang
				: page_globals.dedalo_data_lang

			let value_node = null

			if (is_relation_model(ref.model)) {

				// RELATION/PORTAL → cached table. The portal is built (API) only once
				// per record; column remove/reorder/resize and return-from-print reuse
				// the cache (no API) — only a newly added column fetches its cells.
				value_node = await render_relation_table(self, box, ref, lang, preview_id)

			} else {

				// LITERAL → flat value, built fresh, cloned inert. Text areas are
				// TRUNCATED (~220 chars) server-side in list mode, so render them in
				// edit mode (full untruncated value); flatten_print_node then pulls
				// the complete textarea/contenteditable text. Other literals: list.
				const component = await get_instance({
					model			: ref.model,
					tipo			: ref.tipo,
					section_tipo	: ref.section_tipo,
					section_id		: preview_id,
					lang			: lang,
					mode			: full_value_mode(ref.model),
					permissions		: 1,
					view			: ref.view || 'default',
					id_variant		: 'tool_print_' + box.id,
					caller			: self
				})
				await component.build(true)
				const node = await render_component_value(component, ref.model, { columns: box.table_columns, self, lang })
				value_node = node ? node.cloneNode(true) : null
				try { component.destroy(true, true, true) } catch (e) { /* noop */ }
			}

			content.replaceChildren()
			// optional field label (identifies the component); CSS hides it when
			// box.show_label===false via the .hide_label class on box_content
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'print_label',
				inner_html		: ref.label_snapshot || '',
				parent			: content
			})
			if (value_node) content.appendChild(value_node)

		} catch (error) {
			console.error('tool_print render_box_content error for box', box.id, error)
			render_error_placeholder(box, ref_label(box))
		}


	return true
}//end render_box_content



/**
* RENDER_STATIC_TEXT
* Renders a static_text box as an in-place contenteditable editor so the user
* can type free text (headings, captions such as "Report of …") that no
* component provides. The content is stored as innerHTML in box.static.text
* and persisted via self.mark_dirty() on every input event. Mousedown
* is stopped to prevent the canvas drag handler from intercepting typing.
* (!) box.static is initialised to {} here if absent — callers must not
* assume static was pre-populated before render_static_text runs.
* @param {Object} self - tool_print instance (must expose mark_dirty method)
* @param {Object} box - box descriptor with content_node and optional static.text
*/
const render_static_text = function(self, box) {

	const content = box.content_node
	content.replaceChildren()

	box.static = box.static || {}

	const editor = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'static_text_edit',
		inner_html		: box.static.text || '',
		parent			: content
	})
	editor.contentEditable = 'true'
	editor.spellcheck = false
	editor.dataset.placeholder = 'Text…'

	editor.addEventListener('input', () => {
		box.static.text = editor.innerHTML
		self.mark_dirty?.()
	})
	// keep typing/clicks inside the editor from starting a box drag
	editor.addEventListener('mousedown', (e) => e.stopPropagation())
}//end render_static_text



/**
* RENDER_PLACEHOLDER
* Template-edit placeholder: clears the content node and inserts a single
* <span class="box_placeholder no_print"> carrying the component's label.
* Used when not in fill mode (template is being designed, not previewed).
* 'no_print' keeps this span out of the actual print output.
* @param {Object} box - box descriptor with content_node and component_ref
*/
const render_placeholder = function(box) {
	const content = box.content_node
	content.replaceChildren()
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'box_placeholder no_print',
		inner_html		: ref_label(box),
		parent			: content
	})
}//end render_placeholder



/**
* RENDER_ERROR_PLACEHOLDER
* Graceful degradation: clears the content node and inserts a
* <span class="box_placeholder box_unavailable"> with a warning prefix ('⚠ ')
* and the component label. Invoked by the catch block in render_box_content
* when the component cannot be instantiated or rendered (e.g. the tipo was
* removed from the ontology, or a network error occurred). Keeping the box
* visible (with a warning) preserves the surrounding layout geometry.
* @param {Object} box - box descriptor with content_node
* @param {string} label - human-readable identifier (from ref_label)
*/
const render_error_placeholder = function(box, label) {
	const content = box.content_node
	content.replaceChildren()
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'box_placeholder box_unavailable',
		inner_html		: '⚠ ' + label,
		parent			: content
	})
}//end render_error_placeholder



/**
* REF_LABEL
* Returns the most human-readable available label for a box. Prefers
* box.component_ref.label_snapshot (the ontology label snapshotted when the
* component was dragged onto the layout) and falls back to box.type (e.g.
* 'static_text') when no ref is stored. Used in placeholders and error nodes.
* @param {Object} box - box descriptor
* @returns {string} display label for the box
*/
const ref_label = function(box) {
	return (box.component_ref && box.component_ref.label_snapshot)
		? box.component_ref.label_snapshot
		: (box.type || 'box')
}//end ref_label



// @license-end
