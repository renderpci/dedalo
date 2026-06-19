// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, prompt, confirm, page_globals, SHOW_DEBUG */
/*eslint no-undef: "error"*/



/**
* RENDER_TOOL_PRINT
*
* Builds the print-layout editor: a top toolbar (template picker + actions),
* a draggable component palette (left), the page canvas (centre, the printable
* surface), and a selected-box inspector (right). The canvas surface
* (.print_root) is the ONLY non-chrome subtree — everything else carries
* .no_print so it disappears at print time.
*/

	import {ui} from '../../../core/common/js/ui.js'
	import {get_instance} from '../../../core/common/js/instances.js'
	import {render_components_list} from '../../../core/common/js/render_common.js'
	import {
		new_layout,
		render_canvas,
		set_zoom,
		apply_box_style,
		serialize_layout,
		page_dims,
		PAGE_FORMATS,
		PX_PER_MM,
		remove_table_column,
		add_default_column,
		reorder_table_column,
		set_column_width,
		set_column_header,
		add_row,
		add_spacer,
		add_cell,
		remove_cell,
		remove_row,
		select_cell,
		find_row,
		find_cell
	} from './canvas_tool_print.js'
	import {make_print_ctx, layout_flow} from './flow_engine.js'
	import {render_box_content, render_component_value, is_relation_model, full_value_mode, column_key, load_all_entries} from './render_box_tool_print.js'
	import {
		query_layouts,
		load_layout,
		create_new_layout,
		save_layout,
		delete_layout
	} from './print_layout_presets.js'



/**
* RENDER_TOOL_PRINT
* Render constructor (prototype host for edit()).
*/
export const render_tool_print = function() {
}//end render_tool_print



/**
* EDIT
* Builds and returns the tool wrapper.
* @param object options - { render_level }
* @return promise HTMLElement wrapper
*/
render_tool_print.prototype.edit = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, { content_data })
		wrapper.content_data = content_data

	// print hooks (mm fidelity on paper)
		setup_print(self)


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* Assembles the toolbar + palette + canvas + inspector grid and initialises the
* working layout (default template, or the default-flagged one when available).
* @param object self
* @return promise HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	// initialise the working layout
		self.layout				= new_layout(self)
		self.current_template_id= null
		self.dirty				= false
		self.zoom				= self.zoom || 1
		// show real record data by default (placeholder only when no preview record)
		self.fill_mode			= !!self.preview_section_id

	// expose the inspector sync hook to the canvas module
		self.sync_inspector = (box) => sync_inspector(self, box)

	// content_data (grid container)
		const content_data = ui.tool.build_content_data(self)
		content_data.classList.add('print_layout_editor')

	// toolbar (top, chrome)
		const toolbar = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'print_toolbar no_print',
			parent			: content_data
		})
		await render_toolbar(self, toolbar)

	// palette (left, chrome). Single-column drill-down: clicking a relation
	// REPLACES the list with that related section's components and pushes a
	// breadcrumb (with back), instead of the core side-by-side Miller columns.
		const palette_panel = ui.create_dom_element({
			element_type	: 'aside',
			class_name		: 'palette_panel no_print',
			parent			: content_data
		})
		ui.create_dom_element({
			element_type	: 'h2',
			class_name		: 'panel_title',
			inner_html		: (get_label.components || 'Components'),
			parent			: palette_panel
		})
		self.palette_breadcrumb = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'palette_breadcrumb hide',
			parent			: palette_panel
		})
		self.palette_scroll = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'palette_scroll',
			parent			: palette_panel
		})
		self.palette_stack = []
		// intercept relation (has_subquery) clicks in CAPTURE so the core
		// side-by-side handler never runs; drill down by replacing the list.
		self.palette_scroll.addEventListener('click', (e) => {
			const item = e.target.closest('.component_label.has_subquery')
			if (!item || !self.palette_scroll.contains(item)) return
			e.stopPropagation()
			e.preventDefault()
			const ddo = item.ddo
			if (!ddo || !ddo.target_section_tipo) return
			self.palette_stack.push({
				section_tipo	: Array.isArray(ddo.target_section_tipo) ? ddo.target_section_tipo[0] : ddo.target_section_tipo,
				path			: item.path,
				label			: ddo.label || ddo.tipo
			})
			render_palette(self)
		}, true)
		render_palette(self)

	// canvas (centre, PRINTABLE — not .no_print)
		const pages_viewport = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'pages_viewport',
			parent			: content_data
		})
		self.canvas_container = pages_viewport
		render_canvas(self, pages_viewport)

	// inspector (right, chrome)
		const inspector_panel = ui.create_dom_element({
			element_type	: 'aside',
			class_name		: 'inspector_panel no_print',
			parent			: content_data
		})
		render_inspector(self, inspector_panel)

	// try to auto-load the default / first template for this section
		refresh_template_picker(self).then(() => {
			if (self.default_template_id) {
				load_template(self, self.default_template_id)
			}
		})


	return content_data
}//end get_content_data_edit



/**
* RENDER_PALETTE
* Renders the current drill-down level into the palette scroll area, replacing
* whatever was there. Level 0 = the target section; deeper levels = related
* sections pushed onto self.palette_stack by clicking a relation component.
* @param object self
*/
const render_palette = async function(self) {

	const scroll = self.palette_scroll
	if (!scroll) return

	render_palette_breadcrumb(self)

	const stack	= self.palette_stack
	const level	= stack.length
		? stack[stack.length-1]
		: { section_tipo: self.target_section_tipo, path: [], label: null }

	const container = ui.create_dom_element({ element_type:'div', class_name:'components_list_container' })

	// section elements for this level (root reuses the prebuilt set)
	let section_elements
	if (stack.length===0) {
		section_elements = self.section_elements
	} else {
		try {
			section_elements = await self.get_section_elements_context({
				section_tipo			: level.section_tipo,
				ar_components_exclude	: self.section_elements_components_exclude
			})
		} catch (e) {
			console.error('render_palette: get_section_elements_context failed', e)
			section_elements = []
		}
	}

	render_components_list({
		self					: self,
		section_tipo			: level.section_tipo,
		target_div				: container,
		path					: level.path,
		section_elements		: section_elements,
		ar_components_exclude	: self.section_elements_components_exclude
	})

	// swap in only after the (async) build so the panel never flashes empty mid-load
	scroll.replaceChildren(container)
}//end render_palette



/**
* RENDER_PALETTE_BREADCRUMB
* Back button + clickable crumb trail for the relation drill-down. Hidden at the
* root level. Clicking a crumb truncates the stack to that depth.
* @param object self
*/
const render_palette_breadcrumb = function(self) {

	const bc = self.palette_breadcrumb
	if (!bc) return
	bc.replaceChildren()

	const stack = self.palette_stack
	if (!stack.length) { bc.classList.add('hide'); return }
	bc.classList.remove('hide')

	// back one level
	const back = ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'palette_back',
		inner_html		: '‹ ' + (get_label.back || 'Back'),
		parent			: bc
	})
	back.addEventListener('click', () => { self.palette_stack.pop(); render_palette(self) })

	// crumb trail (root + each pushed level)
	const trail = ui.create_dom_element({ element_type:'span', class_name:'palette_crumbs', parent:bc })
	const root_label = (Array.isArray(self.section_elements)
		? (self.section_elements.find(e => e && e.model==='section')?.label)
		: null) || (get_label.components || 'Components')

	const make_crumb = (label, depth) => {
		const c = ui.create_dom_element({ element_type:'span', class_name:'crumb', inner_html:(label || '…'), parent:trail })
		if (depth < stack.length) {
			c.classList.add('clickable')
			c.addEventListener('click', () => { self.palette_stack.length = depth; render_palette(self) })
		}
	}
	make_crumb(root_label, 0)
	for (let i = 0; i < stack.length; i++) {
		ui.create_dom_element({ element_type:'span', class_name:'crumb_sep', inner_html:'›', parent:trail })
		make_crumb(stack[i].label, i+1)
	}
}//end render_palette_breadcrumb



/**
* RENDER_TOOLBAR
* Template picker + New/Save/Save as/Delete + page/zoom/snap/fill/print controls.
* @param object self
* @param HTMLElement container
* @return promise void
*/
const render_toolbar = async function(self, container) {

	const L = (name, fallback) => (self.get_tool_label?.(name)) || fallback

	// template picker
		const picker_wrap = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'toolbar_group template_picker_group',
			parent			: container
		})
		const picker = ui.create_dom_element({
			element_type	: 'select',
			class_name		: 'template_picker',
			parent			: picker_wrap
		})
		self.template_picker = picker
		picker.addEventListener('change', () => {
			const id = picker.value
			if (id) load_template(self, id)
		})
		// inline template-name field (replaces the native prompt on save)
		const name_input = ui.create_dom_element({
			element_type	: 'input',
			class_name		: 'template_name_input',
			parent			: picker_wrap
		})
		name_input.type = 'text'
		name_input.placeholder = L('template_name','Template name')
		name_input.value = self.layout.name && self.layout.name!=='Untitled' ? self.layout.name : ''
		name_input.addEventListener('change', () => {
			self.layout.name = name_input.value.trim() || 'Untitled'
			self.mark_dirty?.()
		})
		self.name_input = name_input

	// actions group
		const actions = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'toolbar_group actions_group',
			parent			: container
		})
		make_button(actions, L('new_template','New'), 'btn_new', () => do_new(self))
		self.button_save = make_button(actions, L('save_template','Save'), 'btn_save', () => do_save(self))
		make_button(actions, L('save_as_template','Save as…'), 'btn_save_as', () => do_save_as(self))
		make_button(actions, L('delete_template','Delete'), 'btn_delete delete_light', () => do_delete(self))

	// page / view group
		const view_group = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'toolbar_group view_group',
			parent			: container
		})
		make_button(view_group, L('add_row','Add row'), 'btn_add_row', () => add_row(self))
		make_button(view_group, L('add_text','Add text'), 'btn_add_text', () => add_row(self, { type:'static_text', static:{ text:'Text…' }, style:{} }))
		make_button(view_group, L('add_spacer','Add spacer'), 'btn_add_spacer', () => add_spacer(self))

		// snap toggle
		const snap_label = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'toolbar_check',
			inner_html		: '<span>' + L('snap_to_grid','Snap to grid') + '</span>',
			parent			: view_group
		})
		const snap_check = ui.create_dom_element({
			element_type	: 'input',
			parent			: snap_label
		})
		snap_check.type		= 'checkbox'
		snap_check.checked	= !!(self.layout.grid && self.layout.grid.snap)
		snap_check.addEventListener('change', () => {
			self.layout.grid.snap = snap_check.checked
		})

		// fill / preview toggle
		const fill_label = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'toolbar_check',
			inner_html		: '<span>' + L('fill_with_record','Preview with record data') + '</span>',
			parent			: view_group
		})
		const fill_check = ui.create_dom_element({
			element_type	: 'input',
			parent			: fill_label
		})
		fill_check.type = 'checkbox'
		fill_check.disabled = !self.preview_section_id
		fill_check.checked = !!self.fill_mode
		fill_check.addEventListener('change', () => toggle_fill_mode(self, fill_check.checked))

		// zoom
		const zoom_select = ui.create_dom_element({
			element_type	: 'select',
			class_name		: 'zoom_select',
			parent			: view_group
		})
		;[['0.5','50%'],['0.75','75%'],['1','100%'],['1.25','125%'],['1.5','150%']].forEach(([v,label]) => {
			ui.create_dom_element({ element_type:'option', value:v, inner_html:label, parent:zoom_select })
		})
		zoom_select.value = '' + (self.zoom || 1)
		zoom_select.addEventListener('change', () => set_zoom(self, parseFloat(zoom_select.value)))

	// print group
		const print_group = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'toolbar_group print_group',
			parent			: container
		})
		make_button(print_group, L('print','Print'), 'btn_print', () => do_print(self))
}//end render_toolbar



/**
* MAKE_BUTTON
* @param HTMLElement parent
* @param string label
* @param string extra_class
* @param function on_click
* @return HTMLElement
*/
const make_button = function(parent, label, extra_class, on_click) {
	const btn = ui.create_dom_element({
		element_type	: 'button',
		class_name		: 'tool_button ' + (extra_class || ''),
		inner_html		: label,
		parent			: parent
	})
	btn.addEventListener('click', (e) => { e.preventDefault(); on_click() })
	return btn
}//end make_button



/**
* RENDER_INSPECTOR
* Numeric position/size fields + style controls for the selected box, plus page
* settings. Two-way bound: editing a field updates the box; dragging updates the
* fields (via sync_inspector).
* @param object self
* @param HTMLElement container
*/
const render_inspector = function(self, container) {

	ui.create_dom_element({
		element_type	: 'h2',
		class_name		: 'panel_title',
		inner_html		: (get_label.properties || 'Properties'),
		parent			: container
	})

	const body = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'inspector_body',
		parent			: container
	})
	self.inspector_body = body

	// box fields (hidden until a box is selected)
		const box_fields = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'inspector_box_fields hide',
			parent			: body
		})
		self.inspector_box_fields = box_fields

		self.inspector_inputs = {}
		const num = (key, label) => {
			const row = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'inspector_row',
				inner_html		: '<span>' + label + '</span>',
				parent			: box_fields
			})
			const input = ui.create_dom_element({ element_type:'input', parent:row })
			input.type = 'number'
			input.step = '0.5'
			input.addEventListener('change', () => on_inspector_change(self))
			self.inspector_inputs[key] = input
			return input
		}
		// cell width (% of the row) + row gap below
		num('cell_width', 'Cell width (%)')
		num('space_after', 'Row gap (mm)')

		// row / cell structure actions
		const row_actions = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'inspector_row row_actions',
			parent			: box_fields
		})
		ui.create_dom_element({ element_type:'button', class_name:'tool_button', inner_html:'+ cell', parent: row_actions })
			.addEventListener('click', () => { if (self.sel) add_cell(self, self.sel.row_id) })
		ui.create_dom_element({ element_type:'button', class_name:'tool_button', inner_html:'− cell', parent: row_actions })
			.addEventListener('click', () => { if (self.sel && self.sel.cell_id) remove_cell(self, self.sel.row_id, self.sel.cell_id) })
		ui.create_dom_element({ element_type:'button', class_name:'tool_button btn_delete', inner_html:'Remove row', parent: row_actions })
			.addEventListener('click', () => { if (self.sel) remove_row(self, self.sel.row_id) })

		// font size
		const fs_row = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'inspector_row',
			inner_html		: '<span>Font (pt)</span>',
			parent			: box_fields
		})
		const fs_input = ui.create_dom_element({ element_type:'input', parent:fs_row })
		fs_input.type = 'number'; fs_input.min = '4'
		fs_input.addEventListener('change', () => on_inspector_change(self))
		self.inspector_inputs.font_size_pt = fs_input

		// align
		const align_row = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'inspector_row',
			inner_html		: '<span>Align</span>',
			parent			: box_fields
		})
		const align_sel = ui.create_dom_element({ element_type:'select', parent:align_row })
		;['left','center','right','justify'].forEach(v => ui.create_dom_element({ element_type:'option', value:v, inner_html:v, parent:align_sel }))
		align_sel.addEventListener('change', () => on_inspector_change(self))
		self.inspector_inputs.align = align_sel

		// font family (default sans-serif / Helvetica)
		const ff_row = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'inspector_row',
			inner_html		: '<span>Font</span>',
			parent			: box_fields
		})
		const ff_sel = ui.create_dom_element({ element_type:'select', parent:ff_row })
		;[['sans','Sans-serif'],['serif','Serif'],['mono','Monospace']].forEach(([v,t]) =>
			ui.create_dom_element({ element_type:'option', value:v, inner_html:t, parent:ff_sel }))
		ff_sel.addEventListener('change', () => on_inspector_change(self))
		self.inspector_inputs.font_family = ff_sel

		// text color
		const tc_row = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'inspector_row',
			inner_html		: '<span>Text color</span>',
			parent			: box_fields
		})
		const tc_input = ui.create_dom_element({ element_type:'input', class_name:'inspector_color', parent:tc_row })
		tc_input.type = 'color'
		tc_input.addEventListener('change', () => on_inspector_change(self))
		self.inspector_inputs.text_color = tc_input

		// border: show/hide lines
		const bd_row = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'inspector_row inspector_check_row',
			inner_html		: '<span>Border</span>',
			parent			: box_fields
		})
		const bd_check = ui.create_dom_element({ element_type:'input', parent:bd_row })
		bd_check.type = 'checkbox'
		bd_check.addEventListener('change', () => on_inspector_change(self))
		self.inspector_inputs.border_show = bd_check

		// border color
		const bc_row = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'inspector_row',
			inner_html		: '<span>Border color</span>',
			parent			: box_fields
		})
		const bc_input = ui.create_dom_element({ element_type:'input', class_name:'inspector_color', parent:bc_row })
		bc_input.type = 'color'
		bc_input.addEventListener('change', () => on_inspector_change(self))
		self.inspector_inputs.border_color = bc_input

		// show label (component boxes only)
		const lbl_row = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'inspector_row inspector_check_row show_label_row',
			inner_html		: '<span>Show label</span>',
			parent			: box_fields
		})
		const lbl_check = ui.create_dom_element({ element_type:'input', parent:lbl_row })
		lbl_check.type = 'checkbox'
		lbl_check.addEventListener('change', () => on_inspector_change(self))
		self.inspector_inputs.show_label = lbl_check

		// show table header row (relation/portal boxes only)
		const th_row = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'inspector_row inspector_check_row table_header_row hide',
			inner_html		: '<span>Show table header</span>',
			parent			: box_fields
		})
		const th_check = ui.create_dom_element({ element_type:'input', parent:th_row })
		th_check.type = 'checkbox'
		th_check.addEventListener('change', () => on_inspector_change(self))
		self.inspector_inputs.show_table_header = th_check

		// table columns picker (relation/portal boxes only)
		self.inspector_columns = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'inspector_columns hide',
			parent			: box_fields
		})

	// empty hint
		self.inspector_hint = ui.create_dom_element({
			element_type	: 'p',
			class_name		: 'inspector_hint',
			inner_html		: (get_label.select_an_element || 'Select an element to edit its properties, or drag a component onto a page.'),
			parent			: body
		})

	// page settings
		ui.create_dom_element({
			element_type	: 'h3',
			class_name		: 'panel_subtitle',
			inner_html		: (get_label.page || 'Page'),
			parent			: body
		})
		const page_settings = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'inspector_page_settings',
			parent			: body
		})
		// format
		const fmt_row = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'inspector_row',
			inner_html		: '<span>Format</span>',
			parent			: page_settings
		})
		const fmt_sel = ui.create_dom_element({ element_type:'select', parent:fmt_row })
		Object.keys(PAGE_FORMATS).forEach(k => ui.create_dom_element({ element_type:'option', value:k, inner_html:k, parent:fmt_sel }))
		fmt_sel.value = self.layout.page_defaults.size
		fmt_sel.addEventListener('change', () => {
			self.layout.page_defaults.size = fmt_sel.value
			self.layout.page_defaults.width_mm = PAGE_FORMATS[fmt_sel.value].width_mm
			self.layout.page_defaults.height_mm = PAGE_FORMATS[fmt_sel.value].height_mm
			render_canvas(self, self.canvas_container)
			self.mark_dirty()
		})
		// orientation
		const or_row = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'inspector_row',
			inner_html		: '<span>Orientation</span>',
			parent			: page_settings
		})
		const or_sel = ui.create_dom_element({ element_type:'select', parent:or_row })
		;['portrait','landscape'].forEach(v => ui.create_dom_element({ element_type:'option', value:v, inner_html:v, parent:or_sel }))
		or_sel.value = self.layout.page_defaults.orientation
		or_sel.addEventListener('change', () => {
			self.layout.page_defaults.orientation = or_sel.value
			render_canvas(self, self.canvas_container)
			self.mark_dirty()
		})
}//end render_inspector



/**
* SYNC_INSPECTOR
* Pushes a box's current values into the inspector inputs (or hides them when
* no box is selected).
* @param object self
* @param object|null box
*/
const sync_inspector = function(self, sel) {

	const fields = self.inspector_box_fields
	const hint	= self.inspector_hint
	if (!fields) return

	// sel = { row, cell } | null
	const row	= sel && sel.row
	const cell	= sel && sel.cell
	if (!row) {
		fields.classList.add('hide')
		if (hint) hint.classList.remove('hide')
		return
	}

	fields.classList.remove('hide')
	if (hint) hint.classList.add('hide')

	const I		= self.inspector_inputs
	const defs	= self.layout.style_defaults || {}
	const block	= (cell && cell.block) ? cell.block : null
	const is_component	= !!(block && block.type==='component')
	const is_table		= !!(is_component && block.component_ref && is_relation_model(block.component_ref.model))

	// cell width (%) + row gap (or spacer height for a spacer row)
	const is_spacer = row.kind==='spacer'
	I.cell_width.value		= cell ? Math.round((cell.width || 1) * 100) : ''
	I.cell_width.disabled	= !cell
	I.space_after.value		= round1(is_spacer ? (row.height_mm || 8) : (row.space_after_mm || 0))
	I.space_after.closest('.inspector_row')?.querySelector('span')?.replaceChildren(document.createTextNode(is_spacer ? 'Spacer height (mm)' : 'Row gap (mm)'))

	// component typography/border (target the selected cell's block)
	const st = (block && block.style) ? block.style : {}
	I.font_size_pt.value	= st.font_size_pt || defs.font_size_pt || 11
	I.align.value			= st.align || defs.align || 'left'
	I.font_family.value		= st.font_family || defs.font_family || 'sans'
	I.text_color.value		= st.text_color || defs.text_color || '#111111'
	I.border_show.checked	= (st.border_show!==undefined) ? st.border_show : (defs.border_show!==false)
	I.border_color.value	= st.border_color || defs.border_color || '#cccccc'

	// show label / show table header — only for component cells
	I.show_label.checked = block ? block.show_label!==false : true
	self.inspector_box_fields.querySelector('.show_label_row')?.classList.toggle('hide', !is_component)
	I.show_table_header.checked = block ? block.show_table_header!==false : true
	self.inspector_box_fields.querySelector('.table_header_row')?.classList.toggle('hide', !is_table)

	// table column manager (relation cells only); the block acts as the "box"
	if (is_table) {
		render_table_columns_ui(self, block)
	} else if (self.inspector_columns) {
		self.inspector_columns.classList.add('hide')
		self.inspector_columns.replaceChildren()
	}
}//end sync_inspector



/**
* RENDER_TABLE_COLUMNS_UI
* Per-box column manager for portal/relation boxes: lists the active table
* columns (each removable), the default columns not currently shown (re-addable),
* and a hint to drag a related component onto the table to add a column. Hidden
* until the columns are resolved (after the first render).
* @param object self
* @param object box
*/
const render_table_columns_ui = function(self, box) {

	const container = self.inspector_columns
	if (!container) return

	const available = Array.isArray(box.available_columns) ? box.available_columns : null
	if (box.type!=='component' || !available) {
		container.classList.add('hide')
		container.replaceChildren()
		return
	}

	container.classList.remove('hide')
	container.replaceChildren()

	const current = Array.isArray(box.table_columns) ? box.table_columns : available.slice()

	ui.create_dom_element({
		element_type	: 'h3',
		class_name		: 'panel_subtitle',
		inner_html		: (get_label.columns || 'Table columns'),
		parent			: container
	})

	// active columns: drag-handle (reorder) + width + remove
	for (let i = 0; i < current.length; i++) {
		const key	= column_key(current[i])
		const row	= ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'inspector_row column_row',
			parent			: container
		})
		row.dataset.key = key
		row.draggable = true

		// drag handle (visual affordance)
		ui.create_dom_element({ element_type:'span', class_name:'button column_grip', title:'Drag to reorder', parent:row })
		// editable header: type to rename, clear to revert to the component label
		const hdr_input = ui.create_dom_element({ element_type:'input', class_name:'column_header_input', parent:row })
		hdr_input.type = 'text'
		hdr_input.value = (current[i].header !== undefined && current[i].header !== null) ? current[i].header : ''
		hdr_input.placeholder = current[i].label || ''
		hdr_input.title = 'Header label (blank = default name)'
		hdr_input.draggable = false
		hdr_input.addEventListener('mousedown', (e) => e.stopPropagation())
		hdr_input.addEventListener('change', () => set_column_header(self, box, key, hdr_input.value))

		const ctrls = ui.create_dom_element({ element_type:'span', class_name:'column_ctrls', parent:row })
		// width (mm, blank = auto)
		const w_input = ui.create_dom_element({ element_type:'input', class_name:'column_width', parent:ctrls })
		w_input.type = 'number'; w_input.min = '0'; w_input.placeholder = 'mm'; w_input.draggable = false
		w_input.value = current[i].width != null ? current[i].width : ''
		w_input.title = 'Column width (mm)'
		w_input.addEventListener('mousedown', (e) => e.stopPropagation())
		w_input.addEventListener('change', () => {
			const v = parseFloat(w_input.value)
			set_column_width(self, box, key, Number.isFinite(v) ? v : null)
		})
		ui.create_dom_element({ element_type:'span', class_name:'button column_remove', title:'Remove column', parent:ctrls })
			.addEventListener('click', () => remove_table_column(self, box, key))

		// drag-and-drop reorder
		row.addEventListener('dragstart', (e) => {
			e.dataTransfer.effectAllowed = 'move'
			e.dataTransfer.setData('text/plain', 'col:' + key)
			row.classList.add('dragging')
		})
		row.addEventListener('dragend', () => {
			row.classList.remove('dragging')
			container.querySelectorAll('.column_row.drop_target').forEach(el => el.classList.remove('drop_target'))
		})
		row.addEventListener('dragover', (e) => {
			const data = e.dataTransfer.getData('text/plain')
			// allow during drag even when getData is empty (some browsers)
			e.preventDefault()
			e.dataTransfer.dropEffect = 'move'
			row.classList.add('drop_target')
		})
		row.addEventListener('dragleave', () => row.classList.remove('drop_target'))
		row.addEventListener('drop', (e) => {
			e.preventDefault()
			e.stopPropagation()
			row.classList.remove('drop_target')
			const raw = e.dataTransfer.getData('text/plain') || ''
			if (!raw.startsWith('col:')) return
			const from_key = raw.slice(4)
			reorder_table_column(self, box, from_key, key)
		})
	}

	// default columns not currently shown (re-addable)
	const present	= new Set(current.map(column_key))
	const addable	= available.filter(c => !present.has(column_key(c)))
	for (let i = 0; i < addable.length; i++) {
		const key	= column_key(addable[i])
		const row	= ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'inspector_row column_row column_addable',
			inner_html		: '<span class="column_name">' + (addable[i].label || '') + '</span>',
			parent			: container
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button column_add',
			title			: 'Add column',
			parent			: row
		}).addEventListener('click', () => add_default_column(self, box, key))
	}

	// drag hint
	ui.create_dom_element({
		element_type	: 'p',
		class_name		: 'inspector_hint column_drag_hint',
		inner_html		: (get_label.drag_component_column || 'Drag a related component onto the table to add a column.'),
		parent			: container
	})
}//end render_table_columns_ui



/**
* ON_INSPECTOR_CHANGE
* Reads the inspector inputs back into the selected box and re-applies geometry
* and style.
* @param object self
*/
const on_inspector_change = function(self) {

	const sel = self.sel
	if (!sel) return
	const row	= find_row(self, sel.row_id)
	if (!row) return
	const cell	= sel.cell_id ? find_cell(self, sel.row_id, sel.cell_id) : null
	const block	= (cell && cell.block) ? cell.block : null

	const I = self.inspector_inputs

	// cell width (% → fraction); the mm field = spacer height for a spacer, else row gap
	if (cell) {
		const pct = to_num(I.cell_width.value, (cell.width || 1) * 100)
		cell.width = Math.max(0.05, Math.min(1, pct / 100))
	}
	if (row.kind==='spacer') {
		row.height_mm = Math.max(1, to_num(I.space_after.value, row.height_mm || 8))
	} else {
		row.space_after_mm = Math.max(0, to_num(I.space_after.value, row.space_after_mm || 0))
	}

	// component style/flags (target the selected cell's block)
	if (block) {
		block.style = block.style || {}
		block.style.font_size_pt	= to_num(I.font_size_pt.value, block.style.font_size_pt)
		block.style.align			= I.align.value
		block.style.font_family		= I.font_family.value
		block.style.text_color		= I.text_color.value
		block.style.border_show		= I.border_show.checked
		block.style.border_color	= I.border_color.value
		block.show_label			= I.show_label.checked
		block.show_table_header		= I.show_table_header.checked
	}

	self.mark_dirty?.()
	render_canvas(self, self.canvas_container)
	requestAnimationFrame(() => select_cell(self, sel.row_id, sel.cell_id))
}//end on_inspector_change



// template actions ----------------------------------------------------------

/**
* DO_NEW
* Starts a fresh unsaved layout (warns on unsaved changes).
* @param object self
*/
const do_new = function(self) {
	if (self.dirty && !confirm(get_label.sure || 'Discard unsaved changes?')) return
	self.layout = new_layout(self)
	self.current_template_id = null
	self.sel = null
	self.dirty = false
	if (self.template_picker) self.template_picker.value = ''
	if (self.name_input) self.name_input.value = ''
	render_canvas(self, self.canvas_container)
	sync_inspector(self, null)
}//end do_new



/**
* DO_SAVE
* Saves to the loaded template, or falls back to Save as… when unsaved.
* @param object self
*/
const do_save = async function(self) {

	// name comes from the inline field (no blocking native prompt)
	self.layout.name = (self.name_input && self.name_input.value.trim()) || self.layout.name || 'Untitled'

	let ok = false
	if (self.current_template_id) {
		const res = await save_layout({ section_id: self.current_template_id, layout: serialize_layout(self) })
		ok = !!(res && (res.result || res.errors===undefined || (res.errors && !res.errors.length)))
	} else {
		const new_id = await create_new_layout({ self, name: self.layout.name, layout: serialize_layout(self) })
		if (new_id) {
			self.current_template_id = new_id
			await refresh_template_picker(self)
			if (self.template_picker) self.template_picker.value = '' + new_id
			ok = true
		}
	}

	if (ok) {
		self.dirty = false
		flash_saved(self)
	} else {
		flash_saved(self, true)
	}
}//end do_save



/**
* DO_SAVE_AS
* Forks the current layout into a NEW template record (new name, no prompt).
* @param object self
*/
const do_save_as = async function(self) {
	const base = (self.name_input && self.name_input.value.trim()) || self.layout.name || 'Untitled'
	self.layout.name = base + ' copy'
	if (self.name_input) self.name_input.value = self.layout.name
	const new_id = await create_new_layout({ self, name: self.layout.name, layout: serialize_layout(self) })
	if (new_id) {
		self.current_template_id = new_id
		self.dirty = false
		await refresh_template_picker(self)
		if (self.template_picker) self.template_picker.value = '' + new_id
		flash_saved(self)
	} else {
		flash_saved(self, true)
	}
}//end do_save_as



/**
* FLASH_SAVED
* Brief visible feedback on the Save button (ui.notify is unavailable).
* @param object self
* @param bool failed
*/
const flash_saved = function(self, failed) {
	const btn = self.button_save
	if (!btn) return
	const prev = btn.textContent
	btn.textContent = failed ? '✕ Error' : '✓ Saved'
	btn.classList.toggle('flash_error', !!failed)
	btn.classList.toggle('flash_ok', !failed)
	setTimeout(() => {
		btn.textContent = prev
		btn.classList.remove('flash_ok', 'flash_error')
	}, 1400)
}//end flash_saved



/**
* DO_DELETE
* Deletes the loaded template (owner only), then resets to a new layout.
* @param object self
*/
const do_delete = async function(self) {
	if (!self.current_template_id) return
	if (!confirm(get_label.sure || 'Delete this template?')) return
	const res = await delete_layout(self.current_template_id)
	if (res) {
		self.current_template_id = null
		self.layout = new_layout(self)
		self.dirty = false
		await refresh_template_picker(self)
		render_canvas(self, self.canvas_container)
		sync_inspector(self, null)
	}
}//end do_delete



/**
* LOAD_TEMPLATE
* Loads a saved template blob into the canvas.
* @param object self
* @param string section_id
*/
const load_template = async function(self, section_id) {

	if (self.dirty && !confirm(get_label.sure || 'Discard unsaved changes?')) {
		// restore picker selection
		if (self.template_picker) self.template_picker.value = self.current_template_id || ''
		return
	}

	const blob = await load_layout({ section_id })
	if (!blob) {
		console.warn('tool_print: empty/invalid layout blob for', section_id, blob)
		return
	}

	// normalize to v2 (v1 blobs become an empty flow — not migrated)
		self.layout = normalize_blob(self, blob)
		self.current_template_id = section_id
		self.sel = null
		self.dirty = false
		if (self.name_input) self.name_input.value = (self.layout.name && self.layout.name!=='Untitled') ? self.layout.name : ''

	render_canvas(self, self.canvas_container)
	sync_inspector(self, null)

	// refresh box contents in the current fill mode
		refresh_all_box_content(self)

	if (self.template_picker) self.template_picker.value = '' + section_id
}//end load_template



/**
* NORMALIZE_BLOB
* Fills missing top-level fields of a loaded blob with sane defaults so the
* editor/renderer never hit undefined.
* @param object self
* @param object blob
* @return object
*/
const normalize_blob = function(self, blob) {
	const def = new_layout(self)
	// v2 document-flow only. v1 blobs (absolute pages/boxes — test data) are not
	// migrated: start from an empty flow so the editor never sees the old shape.
	const is_v2 = blob && blob.schema_version===2 && blob.flow && Array.isArray(blob.flow.rows)
	return {
		...def,
		...blob,
		schema_version	: 2,
		page_defaults	: { ...def.page_defaults, ...(blob.page_defaults || {}) },
		grid			: { ...def.grid, ...(blob.grid || {}) },
		style_defaults	: { ...def.style_defaults, ...(blob.style_defaults || {}) },
		flow			: is_v2 ? { rows: blob.flow.rows } : def.flow
	}
}//end normalize_blob



/**
* REFRESH_TEMPLATE_PICKER
* Re-queries the available templates and rebuilds the picker options. Records
* the default template id (first one) for auto-load.
* @param object self
* @return promise void
*/
const refresh_template_picker = async function(self) {

	const picker = self.template_picker
	if (!picker) return

	let list = []
	try {
		list = await query_layouts(self)
	} catch (error) {
		console.error('tool_print refresh_template_picker error:', error)
	}

	picker.replaceChildren()
	ui.create_dom_element({
		element_type	: 'option',
		value			: '',
		inner_html		: '— ' + (get_label.select || 'Select template') + ' —',
		parent			: picker
	})
	for (let i = 0; i < list.length; i++) {
		ui.create_dom_element({
			element_type	: 'option',
			value			: '' + list[i].section_id,
			inner_html		: list[i].name,
			parent			: picker
		})
	}

	self.default_template_id = list.length ? list[0].section_id : null
	if (self.current_template_id) picker.value = '' + self.current_template_id
}//end refresh_template_picker



// fill / print --------------------------------------------------------------

/**
* TOGGLE_FILL_MODE
* Switches between placeholder and record-filled rendering and repaints boxes.
* @param object self
* @param bool checked
*/
const toggle_fill_mode = function(self, checked) {
	self.fill_mode = checked
	refresh_all_box_content(self)
}//end toggle_fill_mode



/**
* REFRESH_ALL_BOX_CONTENT
* Re-renders every box's content (placeholder or filled).
* @param object self
*/
const refresh_all_box_content = function(self) {
	for (let p = 0; p < self.layout.pages.length; p++) {
		const boxes = self.layout.pages[p].boxes
		for (let b = 0; b < boxes.length; b++) {
			if (boxes[b].content_node) {
				render_box_content(self, boxes[b])
			}
		}
	}
}//end refresh_all_box_content



/**
* SETUP_PRINT
* Registers beforeprint/afterprint hooks so the printed output is driven by the
* canonical millimetre model (not the zoom-dependent px), and injects the
* @page size for the current page format.
* @param object self
*/
const setup_print = function(self) {

	if (self._print_hooked) return
	self._print_hooked = true

	self._before_print = () => apply_print_units(self)
	self._after_print  = () => restore_screen_units(self)

	window.addEventListener('beforeprint', self._before_print)
	window.addEventListener('afterprint', self._after_print)
}//end setup_print



/**
* DO_PRINT
* The solid print path: always builds a fresh print document laid out in
* millimetres (zoom-independent), one page-sequence per record (edit = 1 record,
* list = every record of the filter), then paginates flow tables in physical
* units so the page breaks match paper exactly. Prints the document and restores
* the editor.
* @param object self
*/
const do_print = async function(self) {

	let ids = []
	try {
		ids = await self.get_record_ids()
	} catch (error) {
		console.error('tool_print do_print get_record_ids error:', error)
	}
	if (!ids || !ids.length) {
		ids = self.preview_section_id ? [ self.preview_section_id ] : []
	}
	if (!ids.length) { window.print(); return } // nothing to fill; print as-is

	const temp_instances = []
	const doc = await render_print_document(self, ids, temp_instances)

	// @page size from the first page
		set_page_style(self)

	// attach the document (already paginated by the flow engine, in mm) + hide editor
		if (self.print_root) self.print_root.style.display = 'none'
		self.canvas_container.appendChild(doc)

	window.print()

	// restore
		const cleanup = () => {
			if (doc.parentNode) doc.remove()
			if (self.print_root) self.print_root.style.display = ''
			for (let i = temp_instances.length - 1; i >= 0; i--) {
				const inst = temp_instances[i]
				if (inst && typeof inst.destroy==='function') {
					try { inst.destroy() } catch (e) { /* noop */ }
					const idx = self.ar_instances.indexOf(inst)
					if (idx!==-1) self.ar_instances.splice(idx, 1)
				}
			}
		}
		const on_after = () => { window.removeEventListener('afterprint', on_after); cleanup() }
		window.addEventListener('afterprint', on_after)
		setTimeout(() => { window.removeEventListener('afterprint', on_after); cleanup() }, 2500)
}//end do_print



/**
* SET_PAGE_STYLE
* Injects the @page size for the current page format.
* @param object self
*/
const set_page_style = function(self) {
	const dims = page_dims(self, null)
	let style_el = document.getElementById('tool_print_page_style')
	if (!style_el) {
		style_el = document.createElement('style')
		style_el.id = 'tool_print_page_style'
		document.head.appendChild(style_el)
	}
	style_el.textContent = `@media print { @page { size: ${dims.width_mm}mm ${dims.height_mm}mm; margin: 0; } }`
}//end set_page_style



/**
* PAGINATE_PRINT_DOCUMENT_FLOW
* Splits each flow-table across pages within the print document. Measures in the
* mm-laid-out document (96dpi), so the result is independent of the editor zoom
* and matches paper. Overflow rows move onto continuation pages (header optionally
* repeated) inserted after the master page.
* @param object self
* @param HTMLElement doc - the print document (.print_root, attached to the DOM)
* @param object margins - {top,right,bottom,left} mm
*/
export const paginate_print_document_flow = function(self, doc, margins) {
	const masters = [...doc.querySelectorAll('.box.flow_master')]
	for (let i = 0; i < masters.length; i++) {
		paginate_doc_flow_box(self, masters[i], margins)
	}
}//end paginate_print_document_flow



/**
* PAGINATE_DOC_FLOW_BOX
* @param object self
* @param HTMLElement box_node - a .flow_master box in the print document
* @param object margins
*/
const paginate_doc_flow_box = function(self, box_node, margins) {

	const page_node = box_node.parentNode
	if (!page_node) return
	const table = box_node.querySelector('.box_content table.portal_table')
	if (!table) return
	const tbody = table.querySelector('tbody')
	const rows = tbody ? [...tbody.children] : []
	if (rows.length < 2) return

	const row_h	= rows.map(r => r.offsetHeight)
	const thead	= table.querySelector('thead')
	const thead_h	= thead ? thead.offsetHeight : 0
	const label	= box_node.querySelector('.print_label')
	const label_h	= label ? label.offsetHeight : 0

	const page_h	= parseFloat(page_node.dataset.hmm)
	const page_w	= parseFloat(page_node.dataset.wmm)
	const x			= parseFloat(box_node.dataset.xmm)
	const y			= parseFloat(box_node.dataset.ymm)
	const w			= parseFloat(box_node.dataset.wmm)
	const font_pt	= box_node.dataset.font_pt
	const repeat	= box_node.dataset.repeat_header !== '0'

	const avail_master	= (page_h - margins.bottom - y) * PX_PER_MM - label_h - thead_h
	const avail_cont	= (page_h - margins.top - margins.bottom) * PX_PER_MM - (repeat ? thead_h : 0)
	if (avail_master <= row_h[0]) return

	let used = 0, k = 0
	for (; k < rows.length; k++) {
		if (used + row_h[k] > avail_master && k > 0) break
		used += row_h[k]
	}
	if (k >= rows.length) return

	const overflow		= rows.slice(k)
	const overflow_h	= row_h.slice(k)
	overflow.forEach(r => r.remove())

	let idx = 0, after_node = page_node, guard = 0
	while (idx < overflow.length && guard++ < 1000) {
		let u = 0, m = idx
		for (; m < overflow.length; m++) {
			if (u + overflow_h[m] > avail_cont && m > idx) break
			u += overflow_h[m]
		}
		const seg = overflow.slice(idx, m)
		idx = m
		const cp = build_doc_continuation_page(table, seg, { x, w, mt: margins.top, font_pt, repeat, wmm: page_w, hmm: page_h })
		after_node.after(cp)
		after_node = cp
	}
}//end paginate_doc_flow_box



/**
* BUILD_DOC_CONTINUATION_PAGE
* @param HTMLElement table - master table (header/colgroup source)
* @param HTMLElement[] seg_rows
* @param object o - {x, w, mt, font_pt, repeat, wmm, hmm}
* @return HTMLElement continuation page node
*/
const build_doc_continuation_page = function(table, seg_rows, o) {

	const cp = ui.create_dom_element({ element_type:'div', class_name:'print_page flow_continuation' })
	cp.style.position	= 'relative'
	cp.style.width		= o.wmm + 'mm'
	cp.style.height		= o.hmm + 'mm'

	const cbox = ui.create_dom_element({ element_type:'div', class_name:'box flow_continuation_box', parent: cp })
	cbox.style.position	= 'absolute'
	cbox.style.left		= o.x + 'mm'
	cbox.style.top		= o.mt + 'mm'
	cbox.style.width	= o.w + 'mm'

	const content = ui.create_dom_element({ element_type:'div', class_name:'box_content', parent: cbox })
	content.style.fontSize = o.font_pt + 'pt'

	const t2 = document.createElement('table')
	t2.className = 'portal_table'
	if (table.style.tableLayout) t2.style.tableLayout = table.style.tableLayout
	const cg = table.querySelector('colgroup')
	if (cg) t2.appendChild(cg.cloneNode(true))
	if (o.repeat) {
		const th = table.querySelector('thead')
		if (th) t2.appendChild(th.cloneNode(true))
	}
	const tb = document.createElement('tbody')
	for (let i = 0; i < seg_rows.length; i++) tb.appendChild(seg_rows[i])
	t2.appendChild(tb)
	content.appendChild(t2)


	return cp
}//end build_doc_continuation_page



/**
* RENDER_PRINT_DOCUMENT
* Builds a detached .print_root with the chosen template rendered once per
* record id, in millimetres (zoom-independent, print-ready). Read-only: no
* editor chrome, no handles. Component instances are collected so the caller
* can destroy them after printing.
* @param object self
* @param array record_ids
* @param array out_instances - collector for created component instances
* @return promise HTMLElement print_root
*/
export const render_print_document = async function(self, record_ids, out_instances) {

	const root = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'print_root print_document'
	})

	// v2: run the SAME flow engine as the editor, but in physical mm (zoom-
	// independent). One pass per record; cells render that record's data
	// (render_box_content reads self.preview_section_id; the per-block table
	// cache auto-invalidates because its key includes the record id). A page
	// break between records is handled by the .print_page CSS.
	const saved_preview	= self.preview_section_id
	const saved_fill	= self.fill_mode
	self.fill_mode = true

	for (let r = 0; r < record_ids.length; r++) {
		self.preview_section_id = record_ids[r]
		const ctx = make_print_ctx(self, root)
		await layout_flow(self, ctx)
	}

	self.preview_section_id	= saved_preview
	self.fill_mode			= saved_fill


	return root
}//end render_print_document



/**
* FILL_PRINT_BOX
* Renders the read-only value of a box's component for a given record into the
* target content node.
* @param object self
* @param HTMLElement content
* @param object box
* @param string|int record_id
* @param array out_instances
* @return promise void
*/
const fill_print_box = async function(self, content, box, record_id, out_instances) {

	// static free-text box
		if (box.type==='static_text') {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'static_text_print',
				inner_html		: (box.static && box.static.text) || '',
				parent			: content
			})
			return
		}

	if (box.type!=='component' || !box.component_ref) return

	// optional field label
		if (box.show_label===false) content.classList.add('hide_label')

	try {
		const ref	= box.component_ref
		const lang	= (box.render && box.render.lang && box.render.lang!=='inherit')
			? box.render.lang
			: page_globals.dedalo_data_lang

		let component = await get_instance({
			model			: ref.model,
			tipo			: ref.tipo,
			section_tipo	: ref.section_tipo,
			section_id		: record_id,
			lang			: lang,
			mode			: is_relation_model(ref.model) ? 'edit' : full_value_mode(ref.model),
			permissions		: 1,
			view			: ref.view || 'default',
			id_variant		: 'tp_doc_' + box.id + '_' + record_id, // unique per box+record
			caller			: self
		})
		await component.build(true)
		if (is_relation_model(ref.model)) {
			component = await load_all_entries(self, component, {
				model: ref.model, tipo: ref.tipo, section_tipo: ref.section_tipo,
				section_id: record_id, lang, view: ref.view, box_id: box.id + '_' + record_id
			})
		}
		const node = await render_component_value(component, ref.model, { columns: box.table_columns, self, lang, show_header: box.show_table_header !== false })

		// totally inert static clone; destroy the live instance (and its children)
		const static_node = node ? node.cloneNode(true) : null
		try { component.destroy(true, true, true) } catch (e) { /* noop */ }

		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'print_label',
			inner_html		: ref.label_snapshot || '',
			parent			: content
		})
		if (static_node) content.appendChild(static_node)

	} catch (error) {
		console.error('tool_print fill_print_box error for box', box.id, error)
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'box_unavailable',
			inner_html		: '⚠ ' + (box.component_ref?.label_snapshot || ''),
			parent			: content
		})
	}
}//end fill_print_box



/**
* APPLY_PRINT_UNITS
* Writes every page/box inline style in millimetres and injects @page size, so
* paper output ignores the editor zoom entirely.
* @param object self
*/
const apply_print_units = function(self) {

	if (!self.layout) return

	// @page size from the first page format
		const dims0 = page_dims(self, self.layout.pages[0])
		let style_el = document.getElementById('tool_print_page_style')
		if (!style_el) {
			style_el = document.createElement('style')
			style_el.id = 'tool_print_page_style'
			document.head.appendChild(style_el)
		}
		style_el.textContent = `@media print { @page { size: ${dims0.width_mm}mm ${dims0.height_mm}mm; margin: 0; } }`

	// pages + boxes in mm
		for (let p = 0; p < self.layout.pages.length; p++) {
			const page = self.layout.pages[p]
			const dims = page_dims(self, page)
			if (page.node) {
				page.node.style.width  = dims.width_mm + 'mm'
				page.node.style.height = dims.height_mm + 'mm'
			}
			for (let b = 0; b < page.boxes.length; b++) {
				const box = page.boxes[b]
				if (!box.node) continue
				box.node.style.left	= box.rect.x + 'mm'
				box.node.style.top		= box.rect.y + 'mm'
				box.node.style.width	= box.rect.w + 'mm'
				// grow/flow boxes keep auto height (tall tables); others fix to rect.h
				if (box.overflow && (box.overflow.mode==='grow' || box.overflow.mode==='flow')) {
					box.node.style.height		= 'auto'
					box.node.style.minHeight	= box.rect.h + 'mm'
				} else {
					box.node.style.height		= box.rect.h + 'mm'
				}
			}
		}

	// transient flow continuation pages/boxes → millimetres (from their dataset)
		if (self.print_root) {
			const cont_pages = self.print_root.querySelectorAll('.print_page.flow_continuation')
			for (let i = 0; i < cont_pages.length; i++) {
				const pn = cont_pages[i]
				pn.style.width  = pn.dataset.wmm + 'mm'
				pn.style.height = pn.dataset.hmm + 'mm'
				const cbs = pn.querySelectorAll('.flow_continuation_box')
				for (let j = 0; j < cbs.length; j++) {
					const bn = cbs[j]
					bn.style.left	= bn.dataset.xmm + 'mm'
					bn.style.top	= bn.dataset.ymm + 'mm'
					bn.style.width	= bn.dataset.wmm + 'mm'
				}
			}
		}
}//end apply_print_units



/**
* RESTORE_SCREEN_UNITS
* Re-derives px geometry from mm after printing.
* @param object self
*/
const restore_screen_units = function(self) {
	if (!self.layout || !self.canvas_container) return
	render_canvas(self, self.canvas_container)
	refresh_all_box_content(self)
}//end restore_screen_units



// helpers -------------------------------------------------------------------

	const round1 = (n) => Math.round(n * 10) / 10
	const to_num = (v, fallback) => {
		const n = parseFloat(v)
		return Number.isFinite(n) ? n : fallback
	}



// @license-end
