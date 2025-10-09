// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, DEDALO_CORE_URL, Promise */
/*eslint no-undef: "error"*/



// imports
	import {get_section_id_from_tipo} from '../../common/js/utils/index.js'
	import {ui} from '../../common/js/ui.js'
	import {render_error} from '../../common/js/render_common.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'
	import {get_section_records} from '../../section/js/section.js'
	import {
		render_column_component_info,
		activate_autocomplete,
		get_buttons,
		render_references,
	} from './render_edit_component_portal.js'

	import {
		on_dragstart_mosaic,
		on_dragover,
		on_dragleave,
		// on_dragend,
		on_drop, // used to reorder inside the same portal
	} from './drag_and_drop.js'



/**
* VIEW_LINE_EDIT_PORTAL
* Manage the components logic and appearance in client side
*/
export const view_line_edit_portal = function() {

	return true
}//end view_line_edit_portal




/**
* RENDER
* Manages the component's logic and appearance in client side
* @param object self
* @param object options
* @return HTMLElement wrapper
* 	DOM node wrapper
*/
view_line_edit_portal.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// columns_map
		self.columns_map = await rebuild_columns_map(self)

	// view
		const children_view	= self.context.children_view || self.context.view || 'default'

	// ar_section_record
		const ar_section_record	= await get_section_records({
			caller		: self,
			mode		: 'list',
			view		: children_view,
			id_variant	: self.id + '_' + (new Date()).getTime()
		})
		// store to allow destroy later
		self.ar_instances.push(...ar_section_record)

	// content_data
		const content_data = await get_content_data(self, ar_section_record)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
			// label		: null
		})
		wrapper.classList.add('portal')
		// set pointers
		wrapper.content_data = content_data

	// service autocomplete
		const click_handler = (e) => {
			e.stopPropagation()
			dd_request_idle_callback(
				() => {
					if (self.active) {
						activate_autocomplete(self, wrapper)
					}
				}
			)
		}
		wrapper.addEventListener('click', click_handler)

	// change_mode
		const dblclick_handler = (e) => {
			e.stopPropagation()
			e.preventDefault()

			// get the section loaded in page as main section
			const loaded_section = window.dd_page.ar_instances.find(el => el.model === 'section')

			// check if the component is loaded by main section
			// if yes, the component is editable by itself
			// if not, the component is behind a portal and need to be changed to be editable
			const need_change_mode = (loaded_section
				&& loaded_section.mode === self.mode
				&& loaded_section.section_tipo === self.section_tipo)
				? false // is in the main section and the edit is available
				: true // in inside a portal and the edit is not available

			const change_mode = 'list'
			const change_view = 'line'

			// if the test get the component inside the main section do not perform the change mode
			if(need_change_mode === true){
				self.change_mode({
					mode	: change_mode,
					view	: change_view
				})
			}
		}
		wrapper.addEventListener('dblclick', dblclick_handler)


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* Render all received section records and place it into a new div 'content_data'
* @param object self
* @param array ar_section_record
* @return HTMLElement content_data
*/
const get_content_data = async function(self, ar_section_record) {

	// build_values
		const fragment = new DocumentFragment()

	// button_exit_edit
		// const button_exit_edit = ui.component.build_button_exit_edit(self)
		// fragment.appendChild(button_exit_edit)

	// add all section_record rendered nodes
		const ar_section_record_length = ar_section_record.length
		if (ar_section_record_length===0) {

			// no records found case
			// const row_item = no_records_node()
			// fragment.appendChild(row_item)
			if (self.caller?.model==='component_iri') {
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'component_placeholder',
					inner_html		: self.label,
					parent			: fragment
				})
			}
		}else{
			// The portal has data. We render the section_record instances
			for (let i = 0; i < ar_section_record_length; i++) {

				const section_record = ar_section_record[i]

				// render section_record and await to preserve the order
				const section_record_node = await ar_section_record[i].render()

				// drag and drop
					// permissions control
					// with read only permissions, remove drag and drop
					if(self.permissions >= 2){
						drag_and_drop({
							section_record_node	: section_record_node,
							paginated_key		: i,
							total_records		: self.total,
							locator 			: section_record.locator,
							caller 				: self
						})

						// mouseenter event
						const mouseenter_handler = (e) => {
							e.stopPropagation()
							// const event_id = `mosaic_hover_${section_record.id_base}_${section_record.caller.section_tipo}_${section_record.caller.section_id}`
							// event_manager.publish(event_id, this)
							section_record_node.classList.add('mosaic_over')
						}
						section_record_node.addEventListener('mouseenter', mouseenter_handler)

						// mouseleave event
						const mouseleave_handler = (e) => {
							e.stopPropagation()
							// const event_id = `mosaic_mouseleave_${section_record.id_base}_${section_record.caller.section_tipo}_${section_record.caller.section_id}`
							// event_manager.publish(event_id, this)
							section_record_node.classList.remove('mosaic_over')
						}
						section_record_node.addEventListener('mouseleave', mouseleave_handler)
					}

				// add in synchronous sequential order
				fragment.appendChild(section_record_node)
			}//end for (let i = 0; i < ar_section_record_length; i++)
		}//end if (ar_section_record_length===0)

	// build references
		if(self.data.references && self.data.references.length > 0){
			const references_node = render_references(self.data.references)
			fragment.appendChild(references_node)
		}

	// errors (server side detected errors like infinite loops, etc.)
		if (self.data.errors?.length ) {
			const error_node = render_error(self.data.errors)
			fragment.appendChild(error_node)
		}

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* REBUILD_COLUMNS_MAP
* Adding control columns to the columns_map that will processed by section_record
* @param object self
* @return array columns_map
*/
const rebuild_columns_map = async function(self) {

	// columns_map already rebuilt case
		if (self.fixed_columns_map===true) {
			return self.columns_map
		}

	const columns_map = []

	// column section_id
		columns_map.push({
			id			: 'section_id',
			label		: 'Id',
			width		: 'auto',
			callback	: view_line_edit_portal.render_column_id
		})

	// base_columns_map
		const base_columns_map = await self.columns_map

	// if the component has compnent_info its parents
	// add its own render column, the `ddinfo`,
	// columns exists because is added into common.js get_columns_map()
	// here only added the rendered callback
		if (self.add_component_info===true) {
			base_columns_map.map(el => {
				if(el.id==='ddinfo'){
					el.callback	= render_column_component_info
				}
			})
		}
		columns_map.push(...base_columns_map)

	// column remove
		if ( self.context.properties.source?.mode !== 'external' && self.permissions > 1) {
			columns_map.push({
				id			: 'remove',
				label		: '', // get_label.delete || 'Delete',
				width		: 'auto',
				callback	: view_line_edit_portal.render_column_remove
			})
		}

	// fixed as calculated
		self.fixed_columns_map = true


	return columns_map
}//end rebuild_columns_map



/**
* RENDER_COLUMN_ID
* It is called by section_record to create the column id with custom options
* @param object options
* @return DocumentFragment
*/
view_line_edit_portal.render_column_id = function(options) {

	// options
		const self			= options.caller
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo

	const fragment = new DocumentFragment()

	// button_edit
		const button_edit = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button_edit button_view_' + self.context.view,
			parent			: fragment
		})
		// click event
		const click_handler = (e) => {
			e.stopPropagation()
			// edit_record_handler
			self.edit_record_handler({
				section_tipo	: section_tipo,
				section_id		: section_id
			})
		}
		button_edit.addEventListener('mousedown', click_handler)
		// focus event
		const focus_handler = (e) => {
			// force activate on input focus (tabulating case)
			if (!self.active) {
				ui.component.activate(self)
			}
		}
		button_edit.addEventListener('focus', focus_handler)

	// edit icon
		const pen_title = SHOW_DEBUG
			? (get_label.open || 'Open') + ` ${section_tipo}-${section_id}`
			: (get_label.open || 'Open')
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button pen icon grey',
			title			: pen_title,
			parent			: button_edit
		})

	// button_tree ontology only
		const is_ontology = get_section_id_from_tipo(self.section_tipo) === '0'
		if (is_ontology) {
			// button_tree
			const button_tree = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button tree',
				title			: pen_title,
				parent			: fragment
			})
			// mousedown event
			const mousedown_handler = (e) => {
				e.stopPropagation()
				// open new area_ontology window and search the current term
				const search_tipos = section_tipo + section_id
				self.open_ontology_window('default', search_tipos)
			}
			button_tree.addEventListener('mousedown', mousedown_handler)
		}


	return fragment
}//end render_column_id



/**
* RENDER_COLUMN_REMOVE
* It is called by section_record to create the column remove with custom options
* Render column_remove node
* Shared across views
* @param object options
* @return HTMLElement button_remove
*/
view_line_edit_portal.render_column_remove = function(options) {

	// options
		const self				= options.caller
		const row_key			= options.row_key
		const paginated_key		= options.paginated_key
		const section_id		= options.section_id
		// const section_tipo	= options.section_tipo
		// const locator		= options.locator

	// button_remove
		const button_remove = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button_remove'
		})
		// click event
		const click_handler = async (e) => {
			e.stopPropagation()

			// stop if the user does not confirm
				if (!confirm(get_label.sure)) {
					return
				}

			// data pagination offset. Check and update self data to allow save API request return the proper paginated data
				const key = parseInt(row_key)
				if (key===0 && self.data.pagination.offset>0) {
					const next_offset = (self.data.pagination.offset - self.data.pagination.limit)
					// set before exec API request on Save
					self.data.pagination.offset = next_offset>0
						? next_offset
						: 0
				}

			// fire the unlink_record method
			// Note that this function refresh current instance
				await self.unlink_record({
					paginated_key	: paginated_key,
					row_key			: row_key,
					section_id		: section_id
				})

			// remove the tooltip
				dd_request_idle_callback(
					() => {
						const tooltip = document.querySelector('.ct.ct--shown')
						if (tooltip) {
							tooltip.classList.remove('ct--shown')
						}
					}
				);
		}
		button_remove.addEventListener('click', click_handler)
		// focus event
		const focus_handler = (e) => {
			// force activate on input focus (tabulating case)
			if (!self.active) {
				ui.component.activate(self)
			}
		}
		button_remove.addEventListener('focus', focus_handler)

	// remove_icon
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button delete_light icon grey',
			title			: (get_label.delete_only_the_link || 'Delete only link'),
			parent			: button_remove
		})


	return button_remove
}//end render_column_remove



/**
* DRAG_AND_DROP
* Set section_record_node ready to drag and drop
* Mosaic use his own node to be draggable and droppable
* also it uses the drag node of default behavior (dependent of section_id node)
* but doesn't use the drop node (dependent of section_id node)
* @param object options
* @return bool
*/
const drag_and_drop = function(options) {

	// options
		const node	= options.section_record_node

	// set properties/events
		node.draggable = true
		node.classList.add('draggable')
		node.addEventListener('dragstart',function(e){on_dragstart_mosaic(this, e, options)})
		node.addEventListener('dragover',function(e){on_dragover(this, e, options)})
		node.addEventListener('dragleave',function(e){on_dragleave(this, e)})
		node.addEventListener('drop',function(e){on_drop(this, e, options)})

	return true
}//end drag_and_drop



// @license-end
