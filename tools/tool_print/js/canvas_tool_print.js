// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals */
/*eslint no-undef: "error"*/



/**
* CANVAS_TOOL_PRINT
*
* Page/canvas model and box editing for tool_print.
* Geometry is canonical in millimetres; on-screen pixels are always derived
* (mm * PX_PER_MM * zoom). The same .print_root / .print_page / .box DOM is
* reused for editing and for printing (see tool_print.less @media print and the
* beforeprint hook in render_tool_print.js).
*
* No core helper does absolute-mm drag/resize, so the move/resize handlers here
* adopt the offset-drag pattern of core/common/js/dd-modal.js (capture a cursor
* offset on mousedown, listen on document, clear on mouseup).
*/

	import {ui} from '../../../core/common/js/ui.js'
	import {render_box_content, is_relation_model, column_key} from './render_box_tool_print.js'



// CSS reference pixels per millimetre (96 dpi / 25.4 mm-per-inch)
	export const PX_PER_MM = 96 / 25.4

// named page formats (portrait mm)
	export const PAGE_FORMATS = {
		A4		: { width_mm: 210, height_mm: 297 },
		A3		: { width_mm: 297, height_mm: 420 },
		A5		: { width_mm: 148, height_mm: 210 },
		Letter	: { width_mm: 215.9, height_mm: 279.4 },
		Legal	: { width_mm: 215.9, height_mm: 355.6 }
	}

	const MIN_BOX_MM = 10  // minimum box width/height in mm

// font family options → CSS stacks (default sans-serif / Helvetica)
	export const FONT_STACKS = {
		sans	: 'Helvetica, Arial, sans-serif',
		serif	: 'Georgia, "Times New Roman", Times, serif',
		mono	: 'Menlo, Consolas, "Courier New", monospace'
	}
	export const font_stack = function(key) {
		return FONT_STACKS[key] || FONT_STACKS.sans
	}//end font_stack



/**
* NEW_LAYOUT
* Builds a fresh, empty layout blob for the given target section.
* @param object self - The tool_print instance
* @param object opts - { name }
* @return object layout blob (schema_version 1)
*/
export const new_layout = function(self, opts={}) {

	const target_section_tipo = Array.isArray(self.target_section_tipo)
		? self.target_section_tipo[0]
		: self.target_section_tipo

	return {
		schema_version		: 1,
		kind				: 'tool_print_layout',
		// NOTE: must NOT be named 'id' — component_json reads a top-level data-item
		// 'id' as the entry counter (int); a string here breaks raise_component_counter
		uid					: gen_id(self, 'tpl'),
		name				: opts.name || 'Untitled',
		target_section_tipo	: target_section_tipo,
		visibility			: 'user',
		owner_user_id		: '' + page_globals.user_id,
		units				: 'mm',
		page_defaults		: {
			size		: 'A4',
			width_mm	: PAGE_FORMATS.A4.width_mm,
			height_mm	: PAGE_FORMATS.A4.height_mm,
			orientation	: 'portrait',
			margins_mm	: { top: 15, right: 15, bottom: 15, left: 15 }
		},
		grid				: { enabled: false, size_mm: 5, snap: true },
		style_defaults		: {
			font_family	: 'sans',
			font_size_pt: 11,
			align		: 'left',
			valign		: 'top',
			text_color	: '#111111',
			border_show	: true,
			border_color: '#cccccc'
		},
		pages				: [ new_page(self, 0) ],
		flows				: []
	}
}//end new_layout



/**
* NEW_PAGE
* @param object self
* @param int index
* @return object page
*/
export const new_page = function(self, index) {
	return {
		id		: gen_id(self, 'page'),
		index	: index,
		boxes	: []
	}
}//end new_page



/**
* GEN_ID
* Deterministic-enough unique id within the session (no Math.random needed).
* @param object self
* @param string prefix
* @return string
*/
const gen_id = function(self, prefix) {
	self.id_counter = (self.id_counter || 0) + 1
	return prefix + '_' + self.id_counter
}//end gen_id



// geometry helpers ----------------------------------------------------------

	/**
	* PAGE_DIMS
	* Resolves a page's width/height in mm honouring orientation and any
	* per-page override, falling back to layout.page_defaults.
	* @param object self
	* @param object page
	* @return object { width_mm, height_mm }
	*/
	export const page_dims = function(self, page) {

		const defaults	= self.layout.page_defaults
		const ov		= (page && page.page_overrides) ? page.page_overrides : {}
		const size		= ov.size || defaults.size
		const format	= PAGE_FORMATS[size] || { width_mm: defaults.width_mm, height_mm: defaults.height_mm }
		const orient	= ov.orientation || defaults.orientation

		const w = (size==='custom') ? (ov.width_mm || defaults.width_mm) : format.width_mm
		const h = (size==='custom') ? (ov.height_mm || defaults.height_mm) : format.height_mm

		return (orient==='landscape')
			? { width_mm: h, height_mm: w }
			: { width_mm: w, height_mm: h }
	}//end page_dims

	export const mm_to_px = (self, mm) => Math.round(mm * PX_PER_MM * (self.zoom || 1))
	export const px_to_mm = (self, px) => px / (PX_PER_MM * (self.zoom || 1))

	/**
	* SNAP_MM
	* Snaps a mm value to the grid when snapping is enabled.
	* @param object self
	* @param number mm
	* @return number
	*/
	export const snap_mm = function(self, mm) {
		const grid = self.layout.grid
		if (!grid || !grid.snap || !grid.size_mm) {
			return Math.round(mm * 10) / 10 // 0.1mm resolution
		}
		return Math.round(mm / grid.size_mm) * grid.size_mm
	}//end snap_mm



// rendering -----------------------------------------------------------------

/**
* RENDER_CANVAS
* (Re)builds the whole print surface (.print_root) inside the given container.
* @param object self
* @param HTMLElement container
* @return HTMLElement print_root
*/
export const render_canvas = function(self, container) {

	// reset
		container.replaceChildren()

	// hook used by render_box_content to paginate a flow-table after it renders
		self._paginate_flow = (box) => paginate_flow_box(self, box)

	const print_root = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'print_root',
		parent			: container
	})
	self.print_root = print_root

	const pages = self.layout.pages
	for (let i = 0; i < pages.length; i++) {
		pages[i].index = i
		render_page(self, pages[i], print_root)
	}


	return print_root
}//end render_canvas



/**
* RENDER_PAGE
* Builds a .print_page node (with grid overlay + header) and all its boxes.
* @param object self
* @param object page
* @param HTMLElement print_root
* @return HTMLElement page_node
*/
export const render_page = function(self, page, print_root) {

	const dims = page_dims(self, page)

	const page_node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'print_page',
		data_set		: { page: page.id, page_index: page.index },
		parent			: print_root
	})
	page_node.style.width	= mm_to_px(self, dims.width_mm) + 'px'
	page_node.style.height	= mm_to_px(self, dims.height_mm) + 'px'
	page.node = page_node

	// grid overlay (editor only; never printed)
		apply_grid_overlay(self, page_node)

	// page header strip (editor chrome)
		const header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'print_page_header no_print',
			inner_html		: `<span class="page_n">${page.index + 1}</span>`,
			parent			: page_node
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button remove_page_btn',
			title			: (self.get_tool_label?.('remove_page')) || 'Remove page',
			inner_html		: '✕',
			parent			: header
		}).addEventListener('click', (e) => {
			e.stopPropagation()
			remove_page(self, page.id)
		})

	// drop target: add a component box where the user drops.
	// dropEffect MUST match the palette's effectAllowed ('move', set by the
	// reused tool_export on_dragstart); a 'copy'/'move' mismatch makes the
	// browser reject the drop and the drop event never fires.
		page_node.addEventListener('dragenter', (e) => { e.preventDefault() })
		page_node.addEventListener('dragover', (e) => {
			e.preventDefault()
			e.stopPropagation()
			e.dataTransfer.dropEffect = 'move'
		})
		page_node.addEventListener('drop', (e) => on_drop_component(self, page, page_node, e))

	// click empty page deselects
		page_node.addEventListener('mousedown', (e) => {
			if (e.target===page_node) {
				select_box(self, null)
			}
		})

	// boxes
		for (let i = 0; i < page.boxes.length; i++) {
			make_box_node(self, page.boxes[i], page)
		}


	return page_node
}//end render_page



/**
* APPLY_GRID_OVERLAY
* Sets a CSS background grid on the page sized to the grid pitch.
* @param object self
* @param HTMLElement page_node
*/
const apply_grid_overlay = function(self, page_node) {

	const grid = self.layout.grid
	if (!grid || !grid.enabled || !grid.size_mm) {
		page_node.style.backgroundImage = 'none'
		return
	}
	const px = mm_to_px(self, grid.size_mm)
	page_node.style.backgroundImage =
		`linear-gradient(to right, var(--print_grid_color, rgba(0,0,0,.06)) 1px, transparent 1px),` +
		`linear-gradient(to bottom, var(--print_grid_color, rgba(0,0,0,.06)) 1px, transparent 1px)`
	page_node.style.backgroundSize = `${px}px ${px}px`
}//end apply_grid_overlay



/**
* MAKE_BOX_NODE
* Builds a .box node for a box model: header (move handle), content (component
* value) and 8 resize handles. Wires move/resize/select interactions.
* @param object self
* @param object box
* @param object page
* @return HTMLElement box_node
*/
export const make_box_node = function(self, box, page) {

	const page_node = page.node

	const box_node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'box',
		data_set		: { box: box.id },
		parent			: page_node
	})
	box.node = box_node
	apply_box_geometry(self, box)

	// header (move handle + label)
		const header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'box_header no_print',
			inner_html		: `<span class="box_title">${box.component_ref?.label_snapshot || (box.type==='static_text' ? 'Text' : box.type)}</span>`,
			parent			: box_node
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button box_remove',
			inner_html		: '✕',
			parent			: header
		}).addEventListener('mousedown', (e) => {
			e.stopPropagation()
			remove_box(self, box)
		})
		header.addEventListener('mousedown', (e) => start_move(self, box, page, e))

	// content (filled by render_box_content)
		const content = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'box_content',
			parent			: box_node
		})
		box.content_node = content
		apply_box_style(self, box)
		render_box_content(self, box) // async, fire-and-forget

	// resize handles
		const handles = ['nw','n','ne','e','se','s','sw','w']
		for (let i = 0; i < handles.length; i++) {
			const h = handles[i]
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'box_handle no_print h_' + h,
				data_set		: { handle: h },
				parent			: box_node
			}).addEventListener('mousedown', (e) => start_resize(self, box, page, h, e))
		}

	// select on mousedown (not on a handle/button)
		box_node.addEventListener('mousedown', (e) => {
			if (e.target.classList.contains('box_handle')) return
			select_box(self, box.id)
		})

	// drag a related component onto a portal/table box to add it as a column.
	// Only relation boxes intercept the drop (preventDefault); on other boxes the
	// drop bubbles to the page and creates a new box.
		const is_table_box = () => box.type==='component' && box.component_ref && is_relation_model(box.component_ref.model)
		box_node.addEventListener('dragover', (e) => {
			if (!is_table_box()) return
			e.preventDefault()
			e.stopPropagation()
			// must match the palette on_dragstart effectAllowed='move' or the
			// browser rejects the drop and the drop event never fires
			e.dataTransfer.dropEffect = 'move'
			box_node.classList.add('column_drop_target')
		})
		box_node.addEventListener('dragleave', () => box_node.classList.remove('column_drop_target'))
		box_node.addEventListener('drop', (e) => {
			if (!is_table_box()) return
			box_node.classList.remove('column_drop_target')
			let parsed
			try { parsed = JSON.parse(e.dataTransfer.getData('text/plain')) } catch (err) { return }
			if (!parsed || parsed.drag_type!=='add' || !parsed.ddo) return
			e.preventDefault()
			e.stopPropagation()
			add_table_column(self, box, parsed.ddo)
		})


	return box_node
}//end make_box_node



/**
* APPLY_BOX_GEOMETRY
* Writes the derived px position/size onto a box node from its mm rect.
* @param object self
* @param object box
*/
export const apply_box_geometry = function(self, box) {
	const n = box.node
	if (!n) return
	n.style.left	= mm_to_px(self, box.rect.x) + 'px'
	n.style.top		= mm_to_px(self, box.rect.y) + 'px'
	n.style.width	= mm_to_px(self, box.rect.w) + 'px'
	n.style.zIndex	= box.z || 1
	// 'grow'/'flow' boxes auto-height to fit their content (tall tables); rect.h
	// is only a minimum. Others keep a fixed height.
	const auto_h = box.overflow && (box.overflow.mode==='grow' || box.overflow.mode==='flow')
	if (auto_h) {
		n.style.height		= 'auto'
		n.style.minHeight	= mm_to_px(self, box.rect.h) + 'px'
	} else {
		n.style.height		= mm_to_px(self, box.rect.h) + 'px'
		n.style.minHeight	= ''
	}
}//end apply_box_geometry



/**
* APPLY_BOX_STYLE
* Applies the box content styling (font, alignment, overflow) to its content node.
* @param object self
* @param object box
*/
export const apply_box_style = function(self, box) {
	const c = box.content_node
	if (!c) return
	const st	= box.style || {}
	const defs	= self.layout.style_defaults || {}
	c.style.fontSize	= (st.font_size_pt || defs.font_size_pt || 11) + 'pt'
	c.style.textAlign	= st.align || defs.align || 'left'
	c.style.fontFamily	= font_stack(st.font_family || defs.font_family)
	// text color (fixes the muted light-grey list rendering; per-box override)
	c.style.color		= st.text_color || defs.text_color || '#111111'
	// border: show/hide + color for the box frame and any table grid lines
	const border_show	= (st.border_show!==undefined) ? st.border_show : (defs.border_show!==false)
	const border_color	= st.border_color || defs.border_color || '#cccccc'
	c.style.setProperty('--tp_border_color', border_show ? border_color : 'transparent')
	c.classList.toggle('no_border', !border_show)
	// vertical align via flex
	const valign = st.valign || defs.valign || 'top'
	c.style.justifyContent = valign==='middle' ? 'center' : (valign==='bottom' ? 'flex-end' : 'flex-start')
	// overflow
	const mode = box.overflow?.mode || 'clip'
	c.style.overflow = (mode==='clip') ? 'hidden' : 'visible'
	// grow/flow: content sizes to itself so the box (min-height = rect.h) expands
	c.style.height = (mode==='grow' || mode==='flow') ? 'auto' : '100%'
	// component field label optional (default shown so the component is identifiable)
	c.classList.toggle('hide_label', box.show_label===false)
}//end apply_box_style



// interaction ---------------------------------------------------------------

/**
* SELECT_BOX
* Marks a box selected (or clears selection) and notifies the inspector.
* @param object self
* @param string|null box_id
*/
export const select_box = function(self, box_id) {

	self.selected_box_id = box_id

	// clear previous selection visuals
		if (self.print_root) {
			const prev = self.print_root.querySelectorAll('.box.selected')
			for (let i = 0; i < prev.length; i++) prev[i].classList.remove('selected')
		}

	// mark current
		const box = find_box(self, box_id)
		if (box && box.node) {
			box.node.classList.add('selected')
		}

	// notify inspector (render_tool_print provides this)
		if (typeof self.sync_inspector==='function') {
			self.sync_inspector(box || null)
		}
}//end select_box



/**
* START_MOVE
* Drag-to-move a box. Offset-drag pattern (see dd-modal.js): capture the cursor
* offset within the box, listen on document, clear on mouseup.
* @param object self
* @param object box
* @param object page
* @param event event
*/
const start_move = function(self, box, page, event) {

	if (event.button!==0) return
	event.preventDefault()
	event.stopPropagation()
	select_box(self, box.id)

	const page_rect	= page.node.getBoundingClientRect()
	const box_rect	= box.node.getBoundingClientRect()
	const dims		= page_dims(self, page)
	// cursor offset inside the box (px)
	const off_x = event.clientX - box_rect.left
	const off_y = event.clientY - box_rect.top

	const on_move = (e) => {
		// new top-left in page-local px, then to mm
		let x_mm = px_to_mm(self, (e.clientX - page_rect.left - off_x))
		let y_mm = px_to_mm(self, (e.clientY - page_rect.top  - off_y))
		x_mm = snap_mm(self, x_mm)
		y_mm = snap_mm(self, y_mm)
		// clamp inside page
		x_mm = Math.max(0, Math.min(x_mm, dims.width_mm  - box.rect.w))
		y_mm = Math.max(0, Math.min(y_mm, dims.height_mm - box.rect.h))
		box.rect.x = x_mm
		box.rect.y = y_mm
		apply_box_geometry(self, box)
		if (typeof self.sync_inspector==='function') self.sync_inspector(box)
	}
	const on_up = () => {
		document.removeEventListener('mousemove', on_move)
		document.removeEventListener('mouseup', on_up)
		self.mark_dirty?.()
	}
	document.addEventListener('mousemove', on_move)
	document.addEventListener('mouseup', on_up)
}//end start_move



/**
* START_RESIZE
* Drag a resize handle. Adjusts w/h (and x/y for n/w handles) from the cursor
* delta, snapped to grid, clamped to a minimum size and the page bounds.
* @param object self
* @param object box
* @param object page
* @param string handle - one of nw n ne e se s sw w
* @param event event
*/
const start_resize = function(self, box, page, handle, event) {

	if (event.button!==0) return
	event.preventDefault()
	event.stopPropagation()
	select_box(self, box.id)

	const dims		= page_dims(self, page)
	const start_x	= event.clientX
	const start_y	= event.clientY
	const orig		= { x: box.rect.x, y: box.rect.y, w: box.rect.w, h: box.rect.h }
	const west		= handle.includes('w')
	const east		= handle.includes('e')
	const north		= handle.includes('n')
	const south		= handle.includes('s')

	const on_move = (e) => {
		const dx_mm = px_to_mm(self, e.clientX - start_x)
		const dy_mm = px_to_mm(self, e.clientY - start_y)
		let { x, y, w, h } = orig

		if (east)  { w = snap_mm(self, orig.w + dx_mm) }
		if (south) { h = snap_mm(self, orig.h + dy_mm) }
		if (west)  {
			const nx = snap_mm(self, orig.x + dx_mm)
			w = orig.w + (orig.x - nx)
			x = nx
		}
		if (north) {
			const ny = snap_mm(self, orig.y + dy_mm)
			h = orig.h + (orig.y - ny)
			y = ny
		}

		// enforce minimums (keep the anchored edge fixed)
		if (w < MIN_BOX_MM) { if (west) x = orig.x + orig.w - MIN_BOX_MM; w = MIN_BOX_MM }
		if (h < MIN_BOX_MM) { if (north) y = orig.y + orig.h - MIN_BOX_MM; h = MIN_BOX_MM }

		// clamp to page
		x = Math.max(0, x); y = Math.max(0, y)
		w = Math.min(w, dims.width_mm  - x)
		h = Math.min(h, dims.height_mm - y)

		box.rect = { x, y, w, h }
		apply_box_geometry(self, box)
		if (typeof self.sync_inspector==='function') self.sync_inspector(box)
	}
	const on_up = () => {
		document.removeEventListener('mousemove', on_move)
		document.removeEventListener('mouseup', on_up)
		self.mark_dirty?.()
	}
	document.addEventListener('mousemove', on_move)
	document.addEventListener('mouseup', on_up)
}//end start_resize



/**
* ON_DROP_COMPONENT
* Handles dropping a palette component onto a page: creates a box at the drop
* point with a sensible default size.
* @param object self
* @param object page
* @param HTMLElement page_node
* @param event event
*/
const on_drop_component = function(self, page, page_node, event) {

	event.preventDefault()
	event.stopPropagation()

	let parsed
	try {
		parsed = JSON.parse(event.dataTransfer.getData('text/plain'))
	} catch (e) {
		console.error('tool_print on_drop: invalid drag data', e)
		return
	}
	if (!parsed || parsed.drag_type!=='add' || !parsed.ddo) return

	const ddo	= parsed.ddo
	const path	= parsed.path || null
	const dims	= page_dims(self, page)

	// drop point in page-local mm
	const page_rect = page_node.getBoundingClientRect()
	let x_mm = snap_mm(self, px_to_mm(self, event.clientX - page_rect.left))
	let y_mm = snap_mm(self, px_to_mm(self, event.clientY - page_rect.top))

	// default size, clamped to page
	const def_w = Math.min(80, dims.width_mm  - self.layout.page_defaults.margins_mm.left)
	const def_h = 20
	x_mm = Math.max(0, Math.min(x_mm, dims.width_mm  - def_w))
	y_mm = Math.max(0, Math.min(y_mm, dims.height_mm - def_h))

	const max_z = page.boxes.reduce((m, b) => Math.max(m, b.z || 1), 0)

	const box = {
		id				: gen_id(self, 'box'),
		type			: 'component',
		component_ref	: {
			tipo			: ddo.tipo,
			section_tipo	: ddo.section_tipo,
			model			: ddo.model,
			view			: ddo.view || 'default',
			label_snapshot	: ddo.label || ddo.tipo
		},
		path			: path,
		show_label		: true, // show the field label by default (identifies the component)
		render			: {
			value_view	: 'default',
			lang		: 'inherit',
			multivalue	: { mode: 'list' }
		},
		rect			: { x: x_mm, y: y_mm, w: def_w, h: def_h },
		z				: max_z + 1,
		// relation/portal boxes render a table that can have many rows → grow to fit
		overflow		: { mode: is_relation_model(ddo.model) ? 'grow' : 'clip' },
		style			: {}
	}

	page.boxes.push(box)
	make_box_node(self, box, page)
	select_box(self, box.id)
	self.mark_dirty?.()
}//end on_drop_component



/**
* ADD_TEXT_BOX
* Adds a free-text box (type 'static_text') the user edits in place — for
* headings/captions that no component provides (e.g. "Report of …").
* @param object self
* @param object page - optional target page (defaults to the first page)
* @return object box
*/
export const add_text_box = function(self, page) {

	const target	= page || self.layout.pages[0]
	const dims		= page_dims(self, target)
	const max_z		= target.boxes.reduce((m, b) => Math.max(m, b.z || 1), 0)

	const box = {
		id			: gen_id(self, 'box'),
		type		: 'static_text',
		static		: { text: 'Report of …' },
		rect		: { x: target.page_overrides ? 15 : self.layout.page_defaults.margins_mm.left, y: 12, w: Math.min(120, dims.width_mm - 30), h: 12 },
		z			: max_z + 1,
		overflow	: { mode: 'clip' },
		style		: { font_size_pt: 16 }
	}

	target.boxes.push(box)
	make_box_node(self, box, target)
	select_box(self, box.id)
	self.mark_dirty?.()


	return box
}//end add_text_box



// page / box mutations ------------------------------------------------------

/**
* ADD_PAGE
* Appends a new empty page and renders it.
* @param object self
* @return object page
*/
export const add_page = function(self) {
	const page = new_page(self, self.layout.pages.length)
	self.layout.pages.push(page)
	if (self.print_root) {
		render_page(self, page, self.print_root)
	}
	self.mark_dirty?.()
	return page
}//end add_page



/**
* REMOVE_PAGE
* Removes a page (keeps at least one) and re-renders the canvas.
* @param object self
* @param string page_id
*/
export const remove_page = function(self, page_id) {
	if (self.layout.pages.length<=1) return
	const idx = self.layout.pages.findIndex(p => p.id===page_id)
	if (idx===-1) return
	self.layout.pages.splice(idx, 1)
	if (self.selected_box_id) select_box(self, null)
	if (self.canvas_container) render_canvas(self, self.canvas_container)
	self.mark_dirty?.()
}//end remove_page



/**
* REMOVE_BOX
* Removes a box from its page and the DOM, destroying any component instance.
* @param object self
* @param object box
*/
export const remove_box = function(self, box) {

	// destroy any rendered component instance bound to this box
		if (box.component_instance && typeof box.component_instance.destroy==='function') {
			box.component_instance.destroy()
			const i = self.ar_instances.indexOf(box.component_instance)
			if (i!==-1) self.ar_instances.splice(i, 1)
			box.component_instance = null
		}

	// remove from model
		for (let p = 0; p < self.layout.pages.length; p++) {
			const boxes = self.layout.pages[p].boxes
			const bi = boxes.indexOf(box)
			if (bi!==-1) { boxes.splice(bi, 1); break }
		}

	// remove from DOM
		if (box.node && box.node.parentNode) box.node.parentNode.removeChild(box.node)

	if (self.selected_box_id===box.id) select_box(self, null)
	self.mark_dirty?.()
}//end remove_box



/**
* FIND_BOX
* @param object self
* @param string box_id
* @return object|null
*/
export const find_box = function(self, box_id) {
	if (!box_id) return null
	for (let p = 0; p < self.layout.pages.length; p++) {
		const found = self.layout.pages[p].boxes.find(b => b.id===box_id)
		if (found) return found
	}
	return null
}//end find_box



/**
* SET_ZOOM
* Updates the zoom factor and recomputes every page/box px from mm.
* @param object self
* @param number zoom
*/
export const set_zoom = function(self, zoom) {
	self.zoom = zoom
	if (self.canvas_container) render_canvas(self, self.canvas_container)
}//end set_zoom



// cross-page table flow -----------------------------------------------------

/**
* PAGINATE_FLOW_BOX
* For a box with overflow 'flow', splits its table across pages: the rows that
* fit below the box on its page stay; the rest move onto auto-generated
* continuation pages (the header is repeated). Continuation pages are transient
* DOM (.print_page.flow_continuation), regenerated on every render and excluded
* from the saved layout.
* @param object self
* @param object box
*/
export const paginate_flow_box = function(self, box) {

	if (!box.overflow || box.overflow.mode!=='flow') return
	remove_flow_continuations(self, box.id)

	const box_node = box.node
	if (!box_node) return
	const page_node = box_node.parentNode
	if (!page_node || !page_node.classList || !page_node.classList.contains('print_page')) return

	const table = box.content_node && box.content_node.querySelector('table.portal_table')
	if (!table) return
	const tbody = table.querySelector('tbody')
	const rows = tbody ? [...tbody.children] : []
	if (rows.length < 2) return

	// measure (while attached)
	const row_h	= rows.map(r => r.getBoundingClientRect().height)
	const thead	= table.querySelector('thead')
	const thead_h	= thead ? thead.getBoundingClientRect().height : 0
	const label	= box.content_node.querySelector('.print_label')
	const label_h	= label ? label.getBoundingClientRect().height : 0

	const page		= find_page_of_box(self, box)
	const dims		= page_dims(self, page)
	const margin	= self.layout.page_defaults.margins_mm
	const avail_master	= mm_to_px(self, (dims.height_mm - margin.bottom) - box.rect.y) - label_h - thead_h
	const avail_cont	= mm_to_px(self, dims.height_mm - margin.top - margin.bottom) - thead_h

	if (avail_master <= row_h[0]) return // not even one row fits; leave as is

	// rows that fit on the master page
	let used = 0, k = 0
	for (; k < rows.length; k++) {
		if (used + row_h[k] > avail_master && k > 0) break
		used += row_h[k]
	}
	if (k >= rows.length) return // everything fits

	const overflow	= rows.slice(k)
	const overflow_h= row_h.slice(k)
	overflow.forEach(r => r.remove()) // detach from the master table

	// distribute overflow rows across continuation pages
	let idx = 0, after_node = page_node, guard = 0
	while (idx < overflow.length && guard++ < 500) {
		let u = 0, m = idx
		for (; m < overflow.length; m++) {
			if (u + overflow_h[m] > avail_cont && m > idx) break
			u += overflow_h[m]
		}
		const seg		= overflow.slice(idx, m)
		idx = m
		const cont_page	= build_continuation_page(self, page, box, table, seg)
		after_node.after(cont_page)
		after_node = cont_page
	}
}//end paginate_flow_box



/**
* REMOVE_FLOW_CONTINUATIONS
* Removes the transient continuation pages belonging to a box.
* @param object self
* @param string box_id
*/
const remove_flow_continuations = function(self, box_id) {
	if (!self.print_root) return
	const nodes = self.print_root.querySelectorAll('.print_page.flow_continuation[data-flow_box="' + box_id + '"]')
	for (let i = nodes.length - 1; i >= 0; i--) nodes[i].remove()
}//end remove_flow_continuations



/**
* FIND_PAGE_OF_BOX
* @param object self
* @param object box
* @return object page
*/
const find_page_of_box = function(self, box) {
	return self.layout.pages.find(p => Array.isArray(p.boxes) && p.boxes.includes(box)) || self.layout.pages[0]
}//end find_page_of_box



/**
* BUILD_CONTINUATION_PAGE
* Builds a transient continuation .print_page holding one box (same x/width as
* the master) with a table segment (colgroup + repeated header + the given rows).
* @param object self
* @param object page - the master page (for dimensions)
* @param object box
* @param HTMLElement table - the master table (header/colgroup source)
* @param HTMLElement[] seg_rows - row nodes to place
* @return HTMLElement continuation page node
*/
const build_continuation_page = function(self, page, box, table, seg_rows) {

	const dims		= page_dims(self, page)
	const margin	= self.layout.page_defaults.margins_mm

	const cont_page = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'print_page flow_continuation',
		data_set		: { flow_box: box.id }
	})
	cont_page.style.width	= mm_to_px(self, dims.width_mm) + 'px'
	cont_page.style.height	= mm_to_px(self, dims.height_mm) + 'px'
	cont_page.dataset.wmm	= dims.width_mm
	cont_page.dataset.hmm	= dims.height_mm

	const cbox = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'box flow_continuation_box',
		parent			: cont_page
	})
	cbox.style.position	= 'absolute'
	cbox.style.left		= mm_to_px(self, box.rect.x) + 'px'
	cbox.style.top		= mm_to_px(self, margin.top) + 'px'
	cbox.style.width	= mm_to_px(self, box.rect.w) + 'px'
	cbox.dataset.xmm	= box.rect.x
	cbox.dataset.ymm	= margin.top
	cbox.dataset.wmm	= box.rect.w

	const content = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'box_content',
		parent			: cbox
	})
	content.style.fontSize = ((box.style && box.style.font_size_pt) || 11) + 'pt'

	// rebuild a table with the same colgroup + header + the segment rows
	const t2 = document.createElement('table')
	t2.className = 'portal_table'
	if (table.style.tableLayout) t2.style.tableLayout = table.style.tableLayout
	const cg = table.querySelector('colgroup')
	if (cg) t2.appendChild(cg.cloneNode(true))
	const th = table.querySelector('thead')
	if (th) t2.appendChild(th.cloneNode(true))
	const tb = document.createElement('tbody')
	for (let i = 0; i < seg_rows.length; i++) tb.appendChild(seg_rows[i]) // move nodes
	t2.appendChild(tb)
	content.appendChild(t2)


	return cont_page
}//end build_continuation_page



// table column management (portal/relation boxes) ---------------------------

/**
* CURRENT_COLUMNS
* The box's current column descriptors (its table_columns, or the resolved
* defaults when not yet customized).
* @param object box
* @return object[]
*/
const current_columns = function(box) {
	return Array.isArray(box.table_columns)
		? box.table_columns
		: (Array.isArray(box.available_columns) ? box.available_columns.slice() : [])
}//end current_columns



/**
* APPLY_COLUMNS
* Sets the box columns, re-renders the table and refreshes the inspector.
* @param object self
* @param object box
* @param object[] cols
*/
const apply_columns = function(self, box, cols) {
	box.table_columns = cols
	self.mark_dirty?.()
	render_box_content(self, box)
	if (self.selected_box_id===box.id && typeof self.sync_inspector==='function') {
		self.sync_inspector(box)
	}
}//end apply_columns



/**
* ADD_TABLE_COLUMN
* Adds a dragged related component as a new table column (when it belongs to the
* portal's related section). Ignores duplicates and non-matching sections.
* @param object self
* @param object box
* @param object ddo - dragged component ddo {tipo, section_tipo, model, label}
* @return bool added
*/
export const add_table_column = function(self, box, ddo) {

	if (!box.component_ref || !is_relation_model(box.component_ref.model)) return false
	if (box.related_section_tipo && ddo.section_tipo && ddo.section_tipo!==box.related_section_tipo) return false

	const col = {
		type			: 'component',
		label			: ddo.label || ddo.tipo,
		tipo			: ddo.tipo,
		section_tipo	: ddo.section_tipo,
		model			: ddo.model
	}
	const current = current_columns(box)
	if (current.some(c => column_key(c)===column_key(col))) return true // already present

	apply_columns(self, box, [...current, col])
	return true
}//end add_table_column



/**
* REMOVE_TABLE_COLUMN
* Removes a column (by key) from the box table.
* @param object self
* @param object box
* @param string key - column_key
*/
export const remove_table_column = function(self, box, key) {
	apply_columns(self, box, current_columns(box).filter(c => column_key(c)!==key))
}//end remove_table_column



/**
* SET_COLUMN_WIDTH
* Sets (or clears) a column's fixed width in mm.
* @param object self
* @param object box
* @param string key - column_key
* @param number|null width - mm, or null/0 for auto
*/
export const set_column_width = function(self, box, key, width) {
	const w		= (width && width>0) ? width : null
	const cols	= current_columns(box).map(c => column_key(c)===key ? { ...c, width: w } : c)
	apply_columns(self, box, cols)
}//end set_column_width



/**
* SET_COLUMN_HEADER
* Overrides (or clears) a column's header text. Empty/blank → revert to the
* component's own label.
* @param object self
* @param object box
* @param string key - column_key
* @param string|null header - custom header text, or null to use the default label
*/
export const set_column_header = function(self, box, key, header) {
	const h		= (header!=null && header.trim()!=='') ? header : undefined
	const cols	= current_columns(box).map(c => {
		if (column_key(c)!==key) return c
		const next = { ...c }
		if (h===undefined) { delete next.header } else { next.header = h }
		return next
	})
	apply_columns(self, box, cols)
}//end set_column_header



/**
* MOVE_TABLE_COLUMN
* Reorders a table column one step left (dir -1) or right (dir +1).
* @param object self
* @param object box
* @param string key - column_key
* @param number dir - -1 | +1
*/
export const move_table_column = function(self, box, key, dir) {
	const cols	= current_columns(box).slice()
	const idx	= cols.findIndex(c => column_key(c)===key)
	if (idx===-1) return
	const ni = idx + dir
	if (ni < 0 || ni >= cols.length) return
	const moved = cols.splice(idx, 1)[0]
	cols.splice(ni, 0, moved)
	apply_columns(self, box, cols)
}//end move_table_column



/**
* REORDER_TABLE_COLUMN
* Moves the dragged column (from_key) to the position of the drop target column
* (to_key). Used by the inspector drag-and-drop reorder.
* @param object self
* @param object box
* @param string from_key - column_key of the dragged column
* @param string to_key - column_key of the drop target column
*/
export const reorder_table_column = function(self, box, from_key, to_key) {
	if (from_key===to_key) return
	const cols		= current_columns(box).slice()
	const from_idx	= cols.findIndex(c => column_key(c)===from_key)
	const to_idx	= cols.findIndex(c => column_key(c)===to_key)
	if (from_idx===-1 || to_idx===-1) return
	const moved = cols.splice(from_idx, 1)[0]
	cols.splice(to_idx, 0, moved)
	apply_columns(self, box, cols)
}//end reorder_table_column



/**
* ADD_DEFAULT_COLUMN
* Re-adds a default column (by key) that was previously removed.
* @param object self
* @param object box
* @param string key - column_key
*/
export const add_default_column = function(self, box, key) {
	const avail = Array.isArray(box.available_columns) ? box.available_columns : []
	const col = avail.find(c => column_key(c)===key)
	if (!col) return
	const current = current_columns(box)
	if (current.some(c => column_key(c)===key)) return
	apply_columns(self, box, [...current, col])
}//end add_default_column



/**
* SERIALIZE_LAYOUT
* Produces a clean, DOM-free copy of the layout blob for persistence.
* Strips transient node/instance pointers attached during rendering.
* @param object self
* @return object blob
*/
export const serialize_layout = function(self) {

	const l = self.layout

	return {
		schema_version		: l.schema_version || 1,
		kind				: 'tool_print_layout',
		uid					: l.uid || l.id || null,
		name				: l.name,
		target_section_tipo	: l.target_section_tipo,
		visibility			: l.visibility || 'user',
		owner_user_id		: l.owner_user_id || ('' + page_globals.user_id),
		units				: 'mm',
		page_defaults		: l.page_defaults,
		grid				: l.grid,
		style_defaults		: l.style_defaults,
		pages				: l.pages.map((p, i) => ({
			id				: p.id,
			index			: i,
			page_overrides	: p.page_overrides || null,
			boxes			: p.boxes.map(serialize_box)
		})),
		flows				: l.flows || []
	}
}//end serialize_layout



/**
* SERIALIZE_BOX
* @param object box
* @return object plain box
*/
const serialize_box = function(box) {
	return {
		id				: box.id,
		type			: box.type,
		component_ref	: box.component_ref || null,
		path			: box.path || null,
		show_label			: box.show_label!==false,
		repeat_header		: box.repeat_header!==false,
		show_table_header	: box.show_table_header!==false,
		table_columns		: Array.isArray(box.table_columns) ? box.table_columns : null,
		static			: box.static || null,
		render			: box.render || null,
		rect			: { x: box.rect.x, y: box.rect.y, w: box.rect.w, h: box.rect.h },
		z				: box.z || 1,
		overflow		: box.overflow || { mode: 'clip' },
		style			: box.style || {}
	}
}//end serialize_box



// @license-end
