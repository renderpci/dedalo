// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global  */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {get_section_records} from '../../../core/section/js/section.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {
		render_column_id,
		get_buttons,
		activate_autocomplete,
		render_references
	} from '../../../core/component_portal/js/render_edit_component_portal.js'
	import {
		on_dragstart_mosaic,
		on_dragover,
		on_dragleave,
		on_drop
	} from '../../../core/component_portal/js/drag_and_drop.js'



/**
* VIEW_COINS_MOSAIC_PORTAL
* Manage the components logic and appearance in client side
*/
export const view_coins_mosaic_portal = function() {

	return true
}//end view_coins_mosaic_portal



/**
* RENDER
* Manages the component's logic and appearance in client side
*/
view_coins_mosaic_portal.render = async function(self, options) {
	// options
		const render_level 	= options.render_level || 'full'


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

		// content_data
			const ar_section_record	= await get_section_records({
				caller		: self,
				mode		: 'list',
				columns_map	: columns_map
			})
			// store to allow destroy later
			self.ar_instances.push(...ar_section_record)

			const content_data = await get_content_data(self, ar_section_record)


		// render_level
			if (render_level==='content') {
				return content_data
			}

		// list_body
			const list_body = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'list_body ' + self.mode +  ' view_'+self.view,
			})

			list_body.appendChild(content_data)


	// buttons
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

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
			setTimeout(function(){
				if (self.active) {
					activate_autocomplete(self, wrapper)
				}
			}, 1)
		})



	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* Render all received section records and place it into a new div 'content_data'
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

						drag_and_drop({
							section_record_node	: section_record_node,
							paginated_key		: i,
							total_records		: self.total,
							locator 			: section_record.locator,
							caller 				: self
						})

						// mouseover event
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

	drag_node.draggable = true
	drag_node.classList.add('draggable')
	drag_node.addEventListener('dragstart',function(e){on_dragstart_mosaic(this, e, options)})
	// drag_node.addEventListener('dragover',function(e){on_dragover(this, e)})
	// drag_node.addEventListener('dragleave',function(e){on_dragleave(this, e)})
	// drag_node.addEventListener('drop',function(e){on_drop(this, e, options)})

	return true
}//end drag_and_drop



/**
* RENDER_ALTERNATIVE_TABLE_VIEW
* Render all received section records and place it into a DocumentFragment
* @param instance self
* @param array ar_section_record
* @param DOM node alt_list_body
*
* @return DocumentFragment
*/
	// const render_alternative_table_view = async function(self, ar_section_record, alt_list_body) {

	// 	// build_values
	// 		const fragment = new DocumentFragment()

	// 	// add all section_record rendered nodes
	// 		const ar_section_record_length = ar_section_record.length
	// 		if (ar_section_record_length>0) {

	// 			for (let i = 0; i < ar_section_record_length; i++) {

	// 				// section_record
	// 					const section_record		= ar_section_record[i]
	// 					const section_record_node	= await section_record.render()
	// 						  section_record_node.classList.add('display_none')

	// 				// event subscribe
	// 				// On user click button 'alt' trigger a event that we subscribe here to show the
	// 				// proper table section record and hide the others
	// 					// const event_id = 'mosaic_show_' + section_record_node.id + '_' + self.section_tipo + '_' + self.section_id
	// 					const event_id = `mosaic_show_${section_record.id_base}_${section_record.caller.section_tipo}_${section_record.caller.section_id}`
	// 					// console.log("// subscribe event_id:",event_id);
	//					const found = event_manager.event_name_exists(event_id)
	// 					if (!found) {
	// 						const token = event_manager.subscribe(event_id, fn_mosaic_show_alt)
	// 						self.events_tokens.push(token)
	// 					}
	// 					function fn_mosaic_show_alt() {

	// 						// hide all except the header
	// 							const ar_child_node	= section_record_node.parentNode.children;
	// 							const len			= ar_child_node.length
	// 							for (let i = len - 1; i >= 0; i--) {
	// 								const node = ar_child_node[i]
	// 								if(node.classList.contains('header_wrapper_list') || node.classList.contains('close_alt_list_body')){
	// 									continue
	// 								}
	// 								node.classList.add('display_none')
	// 							}
	// 						// show list
	// 							alt_list_body.classList.remove('display_none')
	// 							section_record_node.classList.remove('display_none')

	// 						// header
	// 							const header = ui.create_dom_element({
	// 								element_type	: 'div',
	// 								// class_name	: 'header label',
	// 								inner_html		: "Editing inline"
	// 							})

	// 						// modal way
	// 							const modal = ui.attach_to_modal({
	// 								header	: header,
	// 								body	: alt_list_body,
	// 								footer	: null,
	// 								size	: 'normal'
	// 							})
	// 							self.modal = modal
	// 							// modal.on_close = () => {
	// 							// 	self.refresh()
	// 							// }

	// 						// user click edit button action close the modal box
	// 							const token = event_manager.subscribe('button_edit_click', fn_button_edit_click)
	// 							self.events_tokens.push(token)
	// 							function fn_button_edit_click() {
	// 								event_manager.unsubscribe('button_edit_click')
	// 								modal.close()
	// 							}
	// 					}

	// 				// section record append
	// 					fragment.appendChild(section_record_node)
	// 			}
	// 		}//end if (ar_section_record_length===0)

	// 	// build references
	// 		if(self.data.references && self.data.references.length>0){
	// 			const references_node = render_references(self.data.references)
	// 			fragment.appendChild(references_node)
	// 		}

	// 	return fragment
	// }//end render_alternative_table_view



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

				// event subscribe
				// On user hover mosaic a event that we subscribe here to show the
				// proper hover record and hide the others
					const event_id_hover = `mosaic_hover_${section_record.id_base}_${section_record.caller.section_tipo}_${section_record.caller.section_id}`
					const found_hover 	 = event_manager.event_name_exists(event_id_hover)
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
					const event_id_mouseleave = `mosaic_mouseleave_${section_record.id_base}_${section_record.caller.section_tipo}_${section_record.caller.section_id}`
					const found_mouseleave	  = event_manager.event_name_exists(event_id_mouseleave)
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
				id			: 'original',
				label		: 'Info',
				callback	: render_column_original_copy
			})
		}


	return full_columns_map
}//end rebuild_columns_map



const render_column_original_copy = function(options){

	// DocumentFragment
	const fragment = new DocumentFragment()

	const tool_caller = options.caller.caller

	const locator = options.locator

	const discard_data		= options.caller.datum.data.find(item => item.section_id === locator.section_id && item.tipo === 'numisdata157')
	const discard_context	= options.caller.datum.context.find(item => item.tipo === 'numisdata157')

	const discard_value 	= 	discard_data.value && discard_data.value.length > 0
		? discard_data.value[0].section_id
		: null

	const orderer_data		= options.caller.caller.ordered_coins.datum.data
	const used_coin 		= orderer_data.find(el => el.section_tipo===locator.section_tipo && el.section_id === locator.section_id)

	// options
		const options_left_contaniner  = ui.create_dom_element({
			element_type	: 'div',
			class_name		: "options_left_contaniner",
			parent			: fragment
		})

	// discard buttons
		const radio_button_contaniner  = ui.create_dom_element({
			element_type	: 'div',
			class_name		: "radio_button_contaniner",
			parent			: options_left_contaniner
		})
			const input_original  = ui.create_dom_element({
				element_type	: 'input',
				type			: 'radio',
				id				: 'original_' + locator.section_id,
				class_name		: "input_original",
				name			: 'set_discart' + locator.section_id,
				value			: locator.section_id,
				parent			: radio_button_contaniner
			})
			input_original.section_id = locator.section_id
			input_original.addEventListener('mouseup',(event)=>{
				input_original.checked = (event.altKey===true)
					? false
					: true
			})
			const original_class_name = (discard_value==='1')
				? 'label_original'
				: ''
				const original_label = ui.create_dom_element({
					element_type	: 'label',
					for 			: 'original_' + locator.section_id,
					class_name		: original_class_name,
					text_content	: tool_caller.get_tool_label('original') || 'Original',
					parent			: radio_button_contaniner
				})
				original_label.addEventListener('mouseup',()=>{
					input_original.checked = input_original.checked
						? false
						: true
				})
				input_original.label = original_label
			// copy button
			const input_copy  = ui.create_dom_element({
				element_type	: 'input',
				type 			: 'radio',
				id				: 'copy_' + locator.section_id,
				class_name		: "input_copy",
				name 			: 'set_discart' + locator.section_id,
				value 			: locator.section_id,
				parent			: radio_button_contaniner
			})
			input_copy.section_id = locator.section_id
			input_copy.addEventListener('mouseup',(event)=>{
				input_copy.checked = (event.altKey===true)
					? false
					: true
			})
				const copy_class_name = (discard_value==='2')
					? 'label_copy'
					: ''
				const copy_label = ui.create_dom_element({
					element_type	: 'label',
					for 			: 'copy_'+ locator.section_id,
					class_name		: copy_class_name,
					text_content	: tool_caller.get_tool_label('copy') || 'Copy',
					parent			: radio_button_contaniner
				})
				copy_label.addEventListener('mouseup',()=>{
					input_copy.checked = input_copy.checked
						? false
						: true
				})
				input_copy.label = copy_label

	// columns snap_item
		const snap_item  = ui.create_dom_element({
			element_type	: 'div',
			class_name		: "row_snap",
			parent			: options_left_contaniner
		})
			const checkbox_snap  = ui.create_dom_element({
					element_type	: 'input',
					type 			: 'checkbox',
					id 				: 'checkbox_snap_' + locator.section_id,
					class_name		: "checkbox_snap",
					value 			: locator.section_id,
					parent			: snap_item
				})
				const checkbox_snap_label  = ui.create_dom_element({
					element_type	: 'label',
					text_content 	: tool_caller.get_tool_label('snap') || 'Snap',
					parent			: snap_item
				})
				checkbox_snap_label.setAttribute('for','checkbox_snap_' + locator.section_id)
				checkbox_snap.addEventListener("change", function(){

					const row_container = snap_item.parentNode.parentNode.parentNode

					if (checkbox_snap.checked) {
						row_container.classList.add("snap")
					}else{
						row_container.classList.remove("snap")
					}
				},false)

	// columns drag indication
		const used_coin_class = used_coin
			? ' used'
			: ''
		const drag_item  = ui.create_dom_element({
			element_type	: 'div',
			class_name		: "drag"+used_coin_class,
			parent			: fragment
		})

	return fragment
}//end render_column_original_copy



// @license-end
