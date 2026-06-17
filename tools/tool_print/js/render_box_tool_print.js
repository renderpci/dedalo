// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals */
/*eslint no-undef: "error"*/



/**
* RENDER_BOX_TOOL_PRINT
*
* Fills a box's content node with either a placeholder (template-edit mode) or
* the read-only value of the referenced component for the current preview
* record (fill mode). List mode is inherently read-only, so the printed/preview
* output shows values, never editable widgets.
*
* Component instances are tracked in self.ar_instances and on box.component_instance
* so they can be destroyed on box removal / tool close (bounded memory; avoids
* instance-id collisions via id_variant:'tool_print').
*/

	import {get_instance} from '../../../core/common/js/instances.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {clone} from '../../../core/common/js/utils/index.js'



// relation/portal/autocomplete models. Their full list view renders nested
// section_records that need a section datum and break standalone, so we render
// their resolved labels (datum ddinfo) directly instead.
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

	// is_relation_model. Relations render in edit mode (exposes the full column
	// grid of related records); literals render in list mode (flat value).
	export const is_relation_model = (model) => RELATION_MODELS.has(model)



// chrome stripped by the flat "print view": field labels, action buttons,
// paginators, grid headers and other interactive/visual additions of the
// default view. Only the data values remain.
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
		'.ui-sortable-handle'
	].join(',')



/**
* RENDER_COMPONENT_VALUE
* Returns a DOM node with the FLAT print value of a built component instance.
* The data comes from edit mode (complete, unpaginated); the node is then
* flattened — every label, button, paginator and grid header of the default
* view is removed so the component prints as flat as possible. render() works
* for every model (including portals) given a fresh instance (unique id_variant
* per box). If render() still fails for a relation model, fall back to its
* resolved ddinfo labels.
* @param object component - a built component instance (edit mode)
* @param string model
* @return promise HTMLElement
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
* GET_PORTAL_COLUMNS
* Returns the selectable column labels of a built portal (its columns_map,
* dropping the empty 'remove' column). Used to populate the inspector's
* column-picker for a relation box.
* @param object component
* @return string[]
*/
export const get_related_section_tipo = function(component) {
	const entries = (component.data && Array.isArray(component.data.entries)) ? component.data.entries : []
	return entries.length ? entries[0].section_tipo : null
}//end get_related_section_tipo



/**
* GET_DEFAULT_COLUMNS
* Default table columns for a portal: an 'Id' column plus every RQO column
* (context.request_config[0].show.ddo_map) that belongs to the related record's
* own section. Parent-paired columns (e.g. dataframes on the parent record) are
* skipped — they need relation pairing and cannot be rendered per related record.
* @param object component - built portal instance
* @return object[] column descriptors {type, label, tipo?, section_tipo?, model?}
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
* Stable identity for a column descriptor (for dedupe / inspector matching).
* @param object col
* @return string
*/
export const column_key = function(col) {
	return col.type==='id' ? 'id' : ('c:' + col.tipo)
}//end column_key



/**
* BUILD_PORTAL_TABLE
* Builds a flat <table> from a portal rendered in edit mode (which exposes the
* full column set per related record): header from the portal columns_map
* (skipping the empty 'remove' column), one row per related record
* (top-level .section_record), one cell per column (skipping the remove cell).
* Cells are stripped of their own labels/chrome (the header carries the names).
* Falls back to a single-cell row when a portal view concatenates its columns.
* Returns null if there are no rows.
* @param object component - the built portal instance
* @param HTMLElement node - the portal's rendered (already flattened) node
* @return HTMLElement|null
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
* Builds the <table> synchronously from a pre-rendered cell matrix: header +
* optional colgroup widths + one row per entry, each cell a clone of the cached
* value node (so the matrix can be reused for column reorders/removes/resizes
* WITHOUT re-fetching). 'id' columns print the record's section_id.
* @param object[] cols - column descriptors (order = table order)
* @param object[] entries - related records [{section_id, section_tipo}]
* @param object matrix - { columnKey: [valueNode per entry] }
* @return HTMLElement table
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
* Editor table renderer WITH a per-box cache. The portal is built (API) only
* once per record (to get the related rows + available columns); each column's
* cells are fetched once and cached. Re-rendering for a column remove / reorder /
* resize / return-from-print then reuses the cache (NO API) — only a newly added
* column fetches its cells.
* @param object self
* @param object box
* @param object ref - box.component_ref
* @param string lang
* @param string|int preview_id - the record id
* @return promise HTMLElement|null
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

		// refresh the inspector now that available columns are known
		if (self.selected_box_id===box.id && typeof self.sync_inspector==='function') {
			self.sync_inspector(box)
		}
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
* Renders one component value (read-only, flat, inert clone) for one related
* record — a single table cell. List mode keeps even nested portals to a line.
* @param object self - tool instance
* @param object col - column descriptor {tipo, section_tipo, model}
* @param string|int section_id - related record id
* @param string section_tipo - related record section (fallback)
* @param string lang
* @return promise HTMLElement|null
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
* Strips the default view chrome (labels, buttons, paginators, grid headers)
* from a rendered component node, leaving only the data values.
* @param HTMLElement node
* @return HTMLElement
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
* @param string text
* @return HTMLElement
*/
const make_text_span = function(text) {
	const span = document.createElement('span')
	span.className = 'print_value'
	span.textContent = text
	return span
}//end make_text_span



/**
* BUILD_RELATION_NODE
* Builds a clean list of related-record labels from the component's datum
* ddinfo entries (the resolved, parent-qualified labels).
* @param object component
* @return HTMLElement
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
* Relations paginate (default limit ~10). When a portal has more related records
* than were loaded, rebuild it with the full limit so every row appears in the
* table. Returns the component to use (the original, or a fresh full one).
* @param object self
* @param object component - the built portal instance
* @param object opts - {model, tipo, section_tipo, section_id, lang, view, box_id}
* @return promise object - component with all entries loaded
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
* @param object self - The tool_print instance
* @param object box
* @return promise bool
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

				// LITERAL → flat value (list mode), built fresh, cloned inert.
				const component = await get_instance({
					model			: ref.model,
					tipo			: ref.tipo,
					section_tipo	: ref.section_tipo,
					section_id		: preview_id,
					lang			: lang,
					mode			: 'list',
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

			// cross-page flow: split a tall table onto continuation pages
			if (box.overflow && box.overflow.mode==='flow' && typeof self._paginate_flow==='function') {
				// next frame so the table has laid out and can be measured
				requestAnimationFrame(() => self._paginate_flow(box))
			}

		} catch (error) {
			console.error('tool_print render_box_content error for box', box.id, error)
			render_error_placeholder(box, ref_label(box))
		}


	return true
}//end render_box_content



/**
* RENDER_STATIC_TEXT
* Renders a free-text box editable in place. The user types arbitrary text
* (headings, captions like "Report of …") that no component provides.
* @param object self
* @param object box
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
* Template-edit placeholder: just the component label inside a dashed frame.
* @param object box
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
* Graceful degradation when the referenced component cannot be resolved
* (e.g. removed from the ontology). Keeps page geometry, surfaces the failure.
* @param object box
* @param string label
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
* @param object box
* @return string
*/
const ref_label = function(box) {
	return (box.component_ref && box.component_ref.label_snapshot)
		? box.component_ref.label_snapshot
		: (box.type || 'box')
}//end ref_label



// @license-end
