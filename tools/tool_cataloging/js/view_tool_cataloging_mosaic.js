// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global  */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {get_section_records} from '../../../core/section/js/section.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {set_element_css} from '../../../core/page/js/css.js'
	import {
		render_column_id
	} from '../../../core/section/js/render_list_section.js'



/**
* VIEW_TOOL_CATALOGING_MOSAIC
* Section additional view. Is added by the tool to generate a custom render
* of the section.
* Manage the components logic and appearance in client side
*/
export const view_tool_cataloging_mosaic = function() {

	return true
}//end view_tool_cataloging_mosaic



/**
* RENDER
* Custom section view injected by the tool
* Manages the component's logic and appearance in client side
* @param object self
* @para object options
* @return HTMLElement wrapper
*/
view_tool_cataloging_mosaic.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// hover_body. Alternative section_record with selected ddo to show when user hover the mosaic
		const hover_body = await (async ()=>{

			// hover_body
				const hover_body = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'hover_body display_none'
				})

			// columns
				const hover_columns		= self.columns_map.filter(el => el.hover===true)
				const hover_columns_map	= await rebuild_columns_map(hover_columns, self, false)

			// interface configurations
				// button_delete prevent to show
				self.show_interface.button_delete = false
				// button edit click, opens record in a new window instead navigate
				self.show_interface.button_edit_options.action_mousedown = 'open_window'

			// hover_view (body)
				const hover_ar_section_record = await get_section_records({
					caller		: self,
					mode		: 'list',
					columns_map	: hover_columns_map,
					id_variant	: 'hover'
				})
				// store to allow destroy later
				self.ar_instances.push(...hover_ar_section_record)
				const hover_view = await render_hover_view(self, hover_ar_section_record, hover_body)
				hover_body.appendChild(hover_view)

			return hover_body
		})()

	// content_data. Create the mosaic with only the marked ddo as "mosaic" with true value
		// columns_map
			const base_columns_map	= self.columns_map.filter(el => el.in_mosaic===true)
			const columns_map		= await rebuild_columns_map(base_columns_map, self, true)
			self.columns_map		= columns_map

		// ar_section_record. section_record instances (initialized and built)
			const ar_section_record	= await get_section_records({
				caller		: self,
				mode		: 'list',
				columns_map	: columns_map
			})
			// store to allow destroy later
			self.ar_instances.push(...ar_section_record)

		// content_data
			const content_data = await get_content_data(self, ar_section_record)
			if (render_level==='content') {

				// force to refresh paginator
				if (self.paginator) {
					self.paginator.refresh()
				}

				return content_data
			}

	// DocumentFragment
		const fragment = new DocumentFragment()

	// buttons add
		if (self.buttons) {
			const buttons_node = get_buttons(self);
			if(buttons_node){
				fragment.appendChild(buttons_node)
			}
		}

	// search filter node
		if (self.filter) {
			const search_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'search_container',
				parent			: fragment
			})
			// set pointers
			self.search_container = search_container
		}

	// paginator container node
		if (self.paginator) {
			const paginator_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'paginator_container',
				parent			: fragment
			})
			self.paginator.build()
			.then(function(){
				self.paginator.render().then(paginator_wrapper =>{
					paginator_container.appendChild(paginator_wrapper)
				})
			})
		}

	// list_body
		const list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'list_body ' + self.mode +  ' view_'+self.view,
			parent			: fragment
		})
		// fix last list_body (for pagination selection)
		self.node_body = list_body
		// content_data append
		list_body.appendChild(content_data)

		// list_body css
			const selector		= `${self.section_tipo}_${self.tipo}.view_tool_cataloging_mosaic`
			const css_object	= {}
			if (self.context.css) {
				// use defined section css
				for(const property in self.context.css) {
					css_object[property] = self.context.css[property]
				}
			}
			// use calculated css
			set_element_css(selector, css_object)


	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'section',
			class_name		: `wrapper_${self.type} ${self.model} ${self.tipo} ${self.section_tipo+'_'+self.tipo} view_${self.context.view}`
		})
		wrapper.appendChild(fragment)
		// set pointers
		wrapper.content_data	= content_data
		wrapper.list_body		= list_body


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

		// add all section_record rendered nodes
			const ar_section_record_length = ar_section_record.length
			if (ar_section_record_length>0) {

				for (let i = 0; i < ar_section_record_length; i++) {

					// section record
						const section_record		= ar_section_record[i]
						const section_record_node	= await section_record.render()

						set_drag_and_drop({
							section_record_node	: section_record_node,
							total_records		: self.total,
							locator				: section_record.locator,
							caller				: self
						})

					// mouseenter event
						section_record_node.addEventListener('mouseenter',function(e){
							e.stopPropagation()
							const event_id = `mosaic_hover_${section_record.id_base}_${section_record.caller.section_tipo}_${section_record.caller.section_id}`
							event_manager.publish(event_id, this)
							section_record_node.classList.add('mosaic_over')
						})

					// mouseleave event
						section_record_node.addEventListener('mouseleave',function(e){
							e.stopPropagation()
							const event_id = `mosaic_mouseleave_${section_record.id_base}_${section_record.caller.section_tipo}_${section_record.caller.section_id}`
							event_manager.publish(event_id, this)
							section_record_node.classList.remove('mosaic_over')
						})

					// section record append
						fragment.appendChild(section_record_node)
				}
			}//end if (ar_section_record_length===0)

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)

	// css
		const element_css	= self.context.css || {}
		const legacy_selector_content_data = '.content_data'
		if (element_css[legacy_selector_content_data]) {
			// style
				if (element_css[legacy_selector_content_data].style) {
					// height from style
					if (element_css[legacy_selector_content_data].style.height) {
						content_data.style.setProperty('height', element_css[legacy_selector_content_data].style.height);
					}
				}
		}


	return content_data
}//end get_content_data



/**
* SET_DRAG_AND_DROP
* Set section_record_node ready to drag and drop
* @param object options
* {
* 	section_record_node: HTMLELement
* 	total_records		: int self.total,
* 	locator				: object section_record.locator,
* 	caller				: object self
* }
* @return bool
*/
const set_drag_and_drop = function(options) {

	// options
		const drag_node = options.section_record_node

	// drag_node
		drag_node.draggable = true
		drag_node.classList.add('draggable')
		drag_node.addEventListener('dragstart', function(e){
			on_dragstart_mosaic(this, e, options)
		})


	return true
}//end set_drag_and_drop



/**
* ON_DRAGSTART
* Get element dataset path as event.dataTransfer from selected component
* @param DOM node
*	Its a section record (only in mosaic mode)
* @param event
* @param object options
* {
* 	caller: object,
* 	locator: object,
* 	section_record_node: HTMLElment,
* 	total_records: int|null
* }
* @return bool true
*/
const on_dragstart_mosaic = function(node, event, options) {
	event.stopPropagation();

	// options
		const locator		= options.locator
		const paginated_key	= options.paginated_key

	// will be necessary the original locator of the section_record and the paginated_key (the position in the array of data)
		const transfer_data = {
			locator			: locator,
			paginated_key	: paginated_key,
			caller			: 'tool_cataloging'
		}

		// the data will be transfer to drop in text format
		const data = JSON.stringify(transfer_data)

	event.dataTransfer.effectAllowed = 'move';
	event.dataTransfer.setData('text/plain', data);

	// style the drag element to be showed in drag mode
	// node.classList.add('dragging')

	return true
}//end ondrag_start



/**
* RENDER_HOVER_VIEW
* Render all received section records and place it into a DocumentFragment
* @param object self
* @param array ar_section_record
* @param HTMLElement hover_body
* @return DocumentFragment
*/
const render_hover_view = async function(self, ar_section_record, hover_body) {

	// build_values
		const fragment = new DocumentFragment()

	// add all section_record rendered nodes
		const ar_section_record_length = ar_section_record.length
		if (ar_section_record_length>0) {

			for (let i = 0; i < ar_section_record_length; i++) {

				// section_record
					const section_record		= ar_section_record[i]
					const section_record_node	= await section_record.render()
						  section_record_node.classList.add('sr_mosaic_hover')

				// event subscribe
				// On user hover mosaic a event that we subscribe here to show the
				// proper hover record and hide the others
					const event_id_hover = `mosaic_hover_${section_record.id_base}_${section_record.caller.section_tipo}_${section_record.caller.section_id}`
					const found_hover = event_manager.events.find(el => el.event_name===event_id_hover)
					if (!found_hover) {
						const token = event_manager.subscribe(event_id_hover, fn_mosaic_hover)
						self.events_tokens.push(token)
					}
					function fn_mosaic_hover(caller_node) {
						// hide all
							const ar_children_nodes	= hover_body.children;
							const len			= ar_children_nodes.length
							for (let i = len - 1; i >= 0; i--) {
								const node = ar_children_nodes[i]
								node.classList.add('display_none')
							}

						// move to the section record
							caller_node.prepend(section_record_node)
							section_record_node.classList.remove('display_none')
					}
					const event_id_mouseleave	= `mosaic_mouseleave_${section_record.id_base}_${section_record.caller.section_tipo}_${section_record.caller.section_id}`
					const found_mouseleave		= event_manager.events.find(el => el.event_name===event_id_mouseleave)
					if (!found_mouseleave) {
						const token = event_manager.subscribe(event_id_mouseleave, fn_mosaic_mouseleave)
						self.events_tokens.push(token)
					}
					function fn_mosaic_mouseleave() {
						// return
						hover_body.appendChild(section_record_node)
						// hide all
							const ar_children_nodes	= hover_body.children;
							const len				= ar_children_nodes.length
							for (let i = len - 1; i >= 0; i--) {
								const node = ar_children_nodes[i]
								node.classList.add('display_none')
							}
					}

				// section record append
					fragment.appendChild(section_record_node)
			}
		}//end if (ar_section_record_length===0)


	return fragment
}//end render_hover_view



/**
* REBUILD_COLUMNS_MAP
* Adding control columns to the columns_map that will processed by section_recods
* @param array base_columns_map
* @param object self
* @param bool view_mosaic
* @return obj full_columns_map
*/
const rebuild_columns_map = async function(base_columns_map, self, view_mosaic) {

	const full_columns_map = []

	// column section_id
		if(!view_mosaic) {
			full_columns_map.push({
				id			: 'section_id',
				label		: 'Id',
				width		: 'auto',
				callback	: render_column_id
			})
		}

	// base_columns_map
		full_columns_map.push(...base_columns_map)

	// column info and remove
		if(view_mosaic) {
			full_columns_map.push({
				id			: 'drag',
				label		: 'Info',
				callback	: render_column_drag
			})
		}


	return full_columns_map
}//end rebuild_columns_map



/**
* RENDER_COLUMN_DRAG
* @param object options
* @return DocumentFragment
*/
const render_column_drag = function(options) {

	// options
		const tool_caller		= options.caller.caller
		const section_record	= options.caller
		const locator			= options.locator

	// area_thesaurus
		const area_thesaurus = tool_caller.area_thesaurus

	// get hierarchy sections
	const data			= area_thesaurus.data.find(item => item.tipo==='dd100')
	const hierarchies	= data.value.filter(node => node.type==='hierarchy')

	// get inverser_realatins data
		const inverse_relations_tipo = DD_TIPOS.DEDALO_SECTION_INFO_INVERSE_RELATIONS
		const relation_data = section_record.datum.data.find(el => el.tipo === inverse_relations_tipo
			&& el.section_tipo === locator.section_tipo
			&& el.section_id === locator.section_id)

	// check if the hierarchies of catalog loaded in area_thesarurs has relation with current locator.
	function get_related_hierarchy(relation_value) {
		// get every target_section_tipo loaded as possible catalog hierarchy
		for (let i = hierarchies.length - 1; i >= 0; i--) {
			const current_tipo = hierarchies[i].target_section_tipo
			const found = relation_value.find(el => el.from_section_tipo === current_tipo)
			if(found){
				return true
			}
		}
		return false
	}
	// if current section_record has relations, it has value, check with hierarchies
	// else it doesn't has value and set use as false
		const used = relation_data && relation_data.value
			? get_related_hierarchy(relation_data.value)
			: false

	// DocumentFragment
		const fragment = new DocumentFragment()

	// already used columns drag indication
		const used_class = used
			? ' used'
			: ''

	// drag_item
		const draged_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dragger' + used_class,
			parent			: fragment
		})

	// ts_add_child_tool_cataloging event subscription
		// when the user drop a node in thesaurus, it send an event
		// use it to change the class of the dragged
		event_manager.subscribe('ts_add_child_tool_cataloging', add_data_to_ts_component)
		async function add_data_to_ts_component(options) {
			// the locator drag by the user (the section as the term of the ts)
			const added_locator = options.locator

			if(added_locator.section_id === locator.section_id && added_locator.section_tipo === locator.section_tipo){
				draged_node.classList.add('used')
			}
		}


	return fragment
}//end render_column_drag



/**
* GET_BUTTONS
* @param object self
* @return HTMLElement fragment
*/
const get_buttons = function(self) {

	// DocumentFragment
		const fragment = new DocumentFragment()

	// buttons_container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: fragment
		})

	// filter button (search) . Show and hide all search elements
		const filter_button	= ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'warning search',
			inner_html		: get_label.find || 'Search',
			parent			: buttons_container
		})
		filter_button.addEventListener('mousedown', function(e) {
			e.stopPropagation()
			event_manager.publish('toggle_search_panel_'+self.id)
		})


	return fragment
}//end get_buttons



// @license-end
