// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global  */
/*eslint no-undef: "error"*/



// imports
	import {get_section_records} from '../../section/js/section.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
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
		// on_dragend,
		on_drop, // used to reorder inside the same portal
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
* Manages the component's appearance in client side
* @param object self
* @param object options
*/
view_mosaic_edit_portal.render = async function(self, options) {

	// options
		const render_level 	= options.render_level || 'full'

	// alt_list_body. Alternative table view node with all ddo in table mode
		await (async ()=>{

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
				close_alt_list_body.addEventListener('click', function(e){
					e.stopPropagation()
					alt_list_body.classList.add('display_none')
				})

			// columns
				const alt_columns_map	= await rebuild_columns_map(self.columns_map, self, false)

			// header. Build using common ui builder
				const list_header_node = ui.render_list_header(alt_columns_map, self)
				alt_list_body.appendChild(list_header_node)

			// alternative_table_view (body)
				const alt_ar_section_record		= await get_section_records({
					caller		: self,
					mode		: 'list',
					columns_map	: alt_columns_map,
					id_variant	: 'table'
				})
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

		// hover columns
			const hover_columns		= self.columns_map.filter(el => el.hover===true)
			const hover_columns_map	= await rebuild_columns_map(hover_columns, self, false)

		// hover section_records
			const hover_ar_section_record = await get_section_records({
				caller		: self,
				mode		: 'list',
				columns_map	: hover_columns_map,
				id_variant	: 'hover'
			})
			// store to allow destroy later
			self.ar_instances.push(...hover_ar_section_record)


	// content_data. Create the mosaic with only the marked ddo as "mosaic" with true value
		// columns_map
			const base_columns_map	= self.columns_map.filter(el => el.in_mosaic===true)
			const columns_map		= await rebuild_columns_map(base_columns_map, self, true)

		// content_data
			// self.id_variant = self.id_variant
			// 	? self.id_variant + 'alt'
			// 	: 'alt' // temporal change of id_variant to modify section records id
			const ar_section_record	= await get_section_records({
				caller		: self,
				mode		: 'list',
				columns_map	: columns_map
			})
			// store to allow destroy later
			self.ar_instances.push(...ar_section_record)

			const content_data = await get_content_data(self, ar_section_record, hover_ar_section_record)

		// (!) No need to add the nodes here. On user mouseover/click, they will be added
		// alt_list_body . Prepend hidden node into content_data to allow refresh on render_level 'content'
			// content_data.prepend( alt_list_body )
		// hover_body. add hover node to the content_data
			// content_data.prepend( hover_body )


		// render_level
			if (render_level==='content') {
				return content_data
			}

		// list_body
			const list_body = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'list_body ' + self.mode +  ' view_'+self.view
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

		wrapper.addEventListener('dragover',function(e){
			on_dragover(this, e, {
				caller	: self
			})
		})
		wrapper.addEventListener('dragleave',function(e){
			on_dragleave(this, e)
		})
		wrapper.addEventListener('drop',function(e){
			on_drop( this, e, {
				caller	: self
			})
		})

	// permissions control
	// set on read only permissions, remove the context menu
		if(self.permissions < 2){
			wrapper.addEventListener("contextmenu", (e) => {
				e.preventDefault();
				return false
			});
		}

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
* @param object self
* @param array ar_section_record
* @return HTMLElement content_data
*/
const get_content_data = async function(self, ar_section_record, hover_ar_section_record) {

	// build_values
		const fragment = new DocumentFragment()

		// add all section_record rendered nodes
			const ar_section_record_length = ar_section_record.length
			if (ar_section_record_length>0) {

				for (let i = 0; i < ar_section_record_length; i++) {

					// section record
						const section_record		= ar_section_record[i]
						const section_record_node	= await section_record.render()


					// hover
						const hover_section_record	= hover_ar_section_record[i]
						const hover_view			= await render_hover_view(self, hover_section_record)
						section_record_node.prepend(hover_view)

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
						}

					// mouseenter event
						section_record_node.addEventListener('mouseenter',function(e){
							e.stopPropagation()
							// const event_id = `mosaic_hover_${section_record.id_base}_${section_record.caller.section_tipo}_${section_record.caller.section_id}`
							// event_manager.publish(event_id, this)
							hover_view.classList.remove('display_none')
							section_record_node.classList.add('mosaic_over')
						})

					// mouseleave event
						section_record_node.addEventListener('mouseleave',function(e){
							e.stopPropagation()
							// const event_id = `mosaic_mouseleave_${section_record.id_base}_${section_record.caller.section_tipo}_${section_record.caller.section_id}`
							// event_manager.publish(event_id, this)
							hover_view.classList.add('display_none')
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
* Mosaic use his own node to be dragable and dropable
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
						const fn_mosaic_show_alt = function() {

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
									inner_html		: 'Editing mosaic inline'
								})

							// body
								const body = ui.create_dom_element({
									element_type	: 'div',
									class_name		: 'body content'
								})
								body.appendChild(alt_list_body)

							// modal way
								const modal = ui.attach_to_modal({
									header	: header,
									body	: body,
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
						const token = event_manager.subscribe(event_id, fn_mosaic_show_alt)
						self.events_tokens.push(token)
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
* @return HTMLElement section_record_node
*/
const render_hover_view = async function(self, hover_section_record) {

	// add section_record rendered nodes
	// section_record
		const section_record_node = await hover_section_record.render()
			  section_record_node.classList.add('sr_mosaic_hover', 'display_none')

	// button alt view (table)
		const button_alt_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'button_alt_container',
			parent			: section_record_node
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button info with_bg',
			parent			: button_alt_container
		})
		// event publish
		// When user clicks 'alt' button, send a event 'mosaic_show_' + section_record_node.id
		button_alt_container.addEventListener('mouseup', function(e){
			e.stopPropagation()
			const event_id = `mosaic_show_${hover_section_record.id_base}_${hover_section_record.caller.section_tipo}_${hover_section_record.caller.section_id}`
			event_manager.publish(event_id, this)
		})


	return section_record_node
}//end render_hover_view



/**
* REBUILD_COLUMNS_MAP
* Adding control columns to the columns_map that will processed by section_records
* @param array base_columns_map
* @param object self
* @param bool view_mosaic
* @return array full_columns_map
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
				if(self.context.properties.source?.mode !=='external' && self.permissions>1) {
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



// @license-end
