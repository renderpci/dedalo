/*global get_label, Promise, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	// import {clone} from '../../common/js/utils/index.js'
	// import {data_manager} from '../../common/js/data_manager.js'
	// import {create_source} from '../../common/js/common.js'
	// import {get_instance, delete_instance} from '../../common/js/instances.js'
	import {ui} from '../../common/js/ui.js'
	// import {set_element_css} from '../../page/js/css.js'
	// import {service_autocomplete} from '../../services/service_autocomplete/js/service_autocomplete.js'
	import {
		render_column_id,
		render_column_component_info,
		render_column_remove,
		get_buttons,
		activate_autocomplete,
		render_references
	} from './render_edit_component_portal.js'
	import {
		on_dragstart_mosaic,
		on_dragover,
		on_dragleave,
		on_dragend,
		on_drop
	} from './drag_and_drop.js'



/**
* VIEW_MOSAIC_EDIT_PORTAL
* Manage the components logic and appearance in client side
*/
export const view_mosaic_edit_portal = function() {

	return true
}//end view_mosaic_edit_portal



/**
* RENDER
* Manages the component's logic and appearance in client side
*/
view_mosaic_edit_portal.render = async function(self, options) {
	// options
		const render_level 	= options.render_level || 'full'

	// alt_list_body. Alternative table view node with all ddo in table mode
		const alt_list_body = await (async ()=>{

			// alt_list_body
				const alt_list_body = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'alt_list_body display_none'
				})

			// inside tool_time_machine case. Do not create the alt_list_body columns
				if (self.caller && self.caller.model==='tool_time_machine') {
					return alt_list_body
				}

			// close_alt_list_body
				const close_alt_list_body = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'button close close_alt_list_body',
					parent 			: alt_list_body
				})
				close_alt_list_body.addEventListener('click', function(){
					alt_list_body.classList.add('display_none')
				})

			// columns
				const alt_columns_map	= rebuild_columns_map(self.columns_map, self, false)

			// header. Build using common ui builder
				const list_header_node = ui.render_list_header(alt_columns_map, self)
				alt_list_body.appendChild(list_header_node)

			// alternative_table_view (body)
				const alt_ar_section_record		= await self.get_ar_instances({mode:'list', columns_map:alt_columns_map, id_variant: 'table'})
				// store to allow destroy later
				self.ar_instances.push(...alt_ar_section_record)
				const alternative_table_view	= await render_alternative_table_view(self, alt_ar_section_record, alt_list_body)
				alt_list_body.appendChild(alternative_table_view)

			// alt_list_body columns
				const alt_items				= ui.flat_column_items(alt_columns_map);
				const alt_template_columns	= alt_items.join(' ')
				Object.assign(
					alt_list_body.style,
					{
						"grid-template-columns": alt_template_columns
					}
				)

			return alt_list_body
		})()

	// hover_body. Alternative section_record with selected ddo to show when user hover the mosaic
		const hover_body = await (async ()=>{

			// hover_body
				const hover_body = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'hover_body display_none'
				})

			// inside tool_time_machine case. Do not create the hover_body columns
				if (self.caller && self.caller.model==='tool_time_machine') {
					return hover_body
				}

			// columns
				const hover_columns	= self.columns_map.filter(el => el.hover===true)
				const hover_columns_map	= rebuild_columns_map(hover_columns, self, false)

			// hover_view (body)
				const hover_ar_section_record		= await self.get_ar_instances({mode:'list', columns_map:hover_columns_map, id_variant: 'hover'})
				// store to allow destroy later
				self.ar_instances.push(...hover_ar_section_record)
				const hover_view	= await render_hover_view(self, hover_ar_section_record, hover_body)
				hover_body.appendChild(hover_view)

			return hover_body
		})()

	// content_data. Create the mosaic with only the marked ddo as "mosaic" with true value
		// columns_map
			const base_columns_map	= self.columns_map.filter(el => el.in_mosaic===true)
			const columns_map		= rebuild_columns_map(base_columns_map, self, true)

		// content_data
			// self.id_variant = self.id_variant
			// 	? self.id_variant + 'alt'
			// 	: 'alt' // temporal change of id_variant to modify section records id
			const ar_section_record	= await self.get_ar_instances({mode:'list', columns_map:columns_map})
			// store to allow destroy later
			self.ar_instances.push(...ar_section_record)

			const content_data		= await get_content_data(self, ar_section_record)

		// (!) No need to add the nodes here. On user mouseover/click, they will be added
		// alt_list_body . Prepend hidden node into content_data to allow refresh on render_level 'content'
			// content_data.prepend( alt_list_body )
		// hover_body. add hover node to the content_data
			// content_data.prepend( hover_body )


		// render_level
			if (render_level==='content') {
				// show header_wrapper_list if is hidden
					// if (ar_section_record.length>0) {
					// 	self.node.map(el => {
					// 		const header_wrapper_list = el.querySelector(":scope >.list_body>.header_wrapper_list")
					// 		if (header_wrapper_list) {
					// 			header_wrapper_list.classList.remove('hide')
					// 		}
					// 	})
					// }
				return content_data
			}

		// list_body
			const list_body = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'list_body ' + self.mode +  ' view_'+self.view,
			})
			// css des
				// const items				= ui.flat_column_items(columns_map);
				// const template_columns	= items.join(' ')
				// Object.assign(
				// 	list_body.style,
				// 	{
				// 		"grid-template-columns" : template_columns
				// 	}
				// )
				// const element_css = {
				// 	".wrapper_component .list_body" : {
				// 		"grid-template-columns" : template_columns,
				// 		"color" : "red"
				// 	}
				// }
				// console.log("element_css:",element_css);
				// set_element_css(self.section_tipo+'_'+self.tipo, element_css)

			list_body.appendChild(content_data)
			// css des
				// set_element_css()
				// css
				// const element_css		= self.context.css || {}
				// const legacy_selector	= '.list_body'
				// if (element_css[legacy_selector]) {
				// 	// style
				// 	if (element_css[legacy_selector].style) {
				// 		Object.assign(
				// 			list_body.style,
				// 			element_css[legacy_selector].style
				// 		)
				// 	}
				// 	console.log("element_css[legacy_selector].style:",element_css[legacy_selector].style);
				// }

	// buttons
		const buttons = get_buttons(self)

	// top
		// const top = get_top(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			// content_data	: content_data,
			buttons			: buttons,
			list_body		: list_body
			// top			: top
		})
		wrapper.classList.add('portal', 'view_'+self.context.view)
		// set pointers
		wrapper.list_body		= list_body
		wrapper.content_data	= content_data

	// autocomplete
		wrapper.addEventListener('click', function(e) {
			e.stopPropagation()
			activate_autocomplete(self, wrapper)
		})



	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Render all received section records and place it into a new div 'content_data'
* @return DOM node content_data
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

						drag_and_drop({
							section_record_node	: section_record_node,
							paginated_key		: i,
							total_records		: self.total,
							locator 			: section_record.locator,
							caller 				: self
						})

						// mouseover event
							// section_record_node.addEventListener('mouseover',function(e){
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
* DRAG_AND_DROP
* Set section_record_node ready to drag and drop
* @param object options
* @return bool
*/
const drag_and_drop = function(options) {

	// options
		const drag_node			= options.section_record_node
		// const source_key		= options.i
		// const locator		= options.locator
		// const section_id		= locator.section_id
		// const section_tipo	= locator.section_tipo
		// const total_records	= options.total_records

	drag_node.draggable = true
	drag_node.classList.add('draggable')
	drag_node.addEventListener('dragstart',function(e){on_dragstart_mosaic(this, e, options)})
	drag_node.addEventListener('dragover',function(e){on_dragover(this, e)})
	drag_node.addEventListener('dragleave',function(e){on_dragleave(this, e)})
	drag_node.addEventListener('drop',function(e){on_drop(this, e, options)})

	return true
};//end drag_and_drop



/**
* RENDER_ALTERNATIVE_TABLE_VIEW
* Render all received section records and place it into a DocumentFragment
* @param instance self
* @param array ar_section_record
* @param DOM node alt_list_body
*
* @return DocumentFragment
*/
const render_alternative_table_view = async function(self, ar_section_record, alt_list_body) {

	// build_values
		const fragment = new DocumentFragment()

	// add all section_record rendered nodes
		const ar_section_record_length = ar_section_record.length
		if (ar_section_record_length>0) {

			for (let i = 0; i < ar_section_record_length; i++) {

				// section_record
					const section_record		= ar_section_record[i]
					const section_record_node	= await section_record.render()
						  section_record_node.classList.add('display_none')

				// event subscribe
				// On user click button 'alt' trigger a event that we subscribe here to show the
				// proper table section record and hide the others
					// const event_id = 'mosaic_show_' + section_record_node.id + '_' + self.section_tipo + '_' + self.section_id
					const event_id = `mosaic_show_${section_record.id_base}_${section_record.caller.section_tipo}_${section_record.caller.section_id}`
					// console.log("// subscribe event_id:",event_id);
					const found = event_manager.events.find(el => el.event_name===event_id)
					if (!found) {
						const token = event_manager.subscribe(event_id, fn_mosaic_show_alt)
						self.events_tokens.push(token)
					}
					function fn_mosaic_show_alt() {

						// hide all except the header
							const ar_child_node	= section_record_node.parentNode.children;
							const len			= ar_child_node.length
							for (let i = len - 1; i >= 0; i--) {
								const node = ar_child_node[i]
								if(node.classList.contains('header_wrapper_list') || node.classList.contains('close_alt_list_body')){
									continue
								}
								node.classList.add('display_none')
							}
						// show list
							alt_list_body.classList.remove('display_none')
							section_record_node.classList.remove('display_none')

						// header
							const header = ui.create_dom_element({
								element_type	: 'div',
								// class_name	: 'header label',
								inner_html		: "Editing inline"
							})

						// modal way
							const modal = ui.attach_to_modal({
								header	: header,
								body	: alt_list_body,
								footer	: null,
								size	: 'normal'
							})
							self.modal = modal
							// modal.on_close = () => {
							// 	self.refresh()
							// }

						// user click edit button action close the modal box
							const token = event_manager.subscribe('button_edit_click', fn_button_edit_click)
							self.events_tokens.push(token)
							function fn_button_edit_click() {
								event_manager.unsubscribe('button_edit_click')
								modal.close()
							}
					}

				// section record append
					fragment.appendChild(section_record_node)
			}
		}//end if (ar_section_record_length===0)

	// build references
		if(self.data.references && self.data.references.length>0){
			const references_node = render_references(self.data.references)
			fragment.appendChild(references_node)
		}

	return fragment
}//end render_alternative_table_view



/**
* RENDER_HOVER_VIEW
* Render all received section records and place it into a DocumentFragment
* @param instance self
* @param array ar_section_record
* @param DOM node alt_list_body
*
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

				// button alt view (table)
					const button_alt_container = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'button_alt_container',
						parent			: section_record_node
					})
					const button_alt = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'button info with_bg',
						parent			: button_alt_container
					})
					// event publish
					// When user clicks 'alt' button, send a event 'mosaic_show_' + section_record_node.id
					button_alt_container.addEventListener('mouseup', function(e){
						e.stopPropagation()
						const event_id = `mosaic_show_${section_record.id_base}_${section_record.caller.section_tipo}_${section_record.caller.section_id}`
						event_manager.publish(event_id, this)
					})

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
* @return obj full_columns_map
*/
const rebuild_columns_map = function(base_columns_map, self, view_mosaic) {

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
		if(!view_mosaic) {
			// column component_info check
				if (self.add_component_info===true) {
					full_columns_map.push({
						id			: 'ddinfo',
						label		: 'Info',
						callback	: render_column_component_info
					})
				}

			// button_remove
				if( self.context.properties.source?.mode !=='external' && self.permissions>1) {
					full_columns_map.push({
						id			: 'remove',
						label		: '', // get_label.delete || 'Delete',
						width		: 'auto',
						callback	: render_column_remove
					})
				}
		}


	return full_columns_map
}//end rebuild_columns_map



/**
* RENDER_COLUMN_ID
* @return DocumentFragment
*/
	// view_mosaic_edit_portal.render_column_id = function(options){

	// 	// options
	// 		const self			= options.caller
	// 		const section_id	= options.section_id
	// 		const section_tipo	= options.section_tipo

	// 	const fragment = new DocumentFragment()

	// 	// section_id
	// 		ui.create_dom_element({
	// 			element_type	: 'span',
	// 			class_name		: 'section_id',
	// 			text_content	: section_id,
	// 			parent			: fragment
	// 		})
