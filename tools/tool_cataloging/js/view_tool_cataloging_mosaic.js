/*global  */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {get_section_records} from '../../../core/section/js/section.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {
		render_column_id,
		activate_autocomplete
	} from '../../../core/component_portal/js/render_edit_component_portal.js'



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

	// running_with_errors case
		if (self.running_with_errors) {
			return render_server_response_error(
				self.running_with_errors
			);
		}

	// hover_body. Alternative section_record with selected ddo to show when user hover the mosaic
		const hover_body = await (async ()=>{

			// hover_body
				const hover_body = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'hover_body display_none'
				})

			// columns
				const hover_columns		= self.columns_map.filter(el => el.hover===true)
				const hover_columns_map	= rebuild_columns_map(hover_columns, self, false)

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


		// ar_section_record. section_record instances (initiated and built)
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

	// search filter node
		if (self.filter && self.mode!=='tm') {
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

	// wrapper. ui build_edit returns component wrapper
		// const wrapper = ui.component.build_wrapper_edit(self, {
		// 	// content_data	: content_data,
		// 	list_body		: list_body
		// 	// top			: top
		// })
		// wrapper.classList.add('portal', 'view_'+self.context.view)
		// // set pointers
		// wrapper.list_body		= list_body
		// wrapper.content_data	= content_data

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'section',
			class_name		: `wrapper_${self.type} ${self.model} ${self.tipo} ${self.section_tipo+'_'+self.tipo} view_${self.context.view}`
		})
		wrapper.appendChild(fragment)
		// set pointers
		wrapper.content_data	= content_data
		wrapper.list_body		= list_body



	// autocomplete
		// wrapper.addEventListener('click', function(e) {
		// 	e.stopPropagation()
		// 	activate_autocomplete(self, wrapper)
		// })


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
							total_records		: self.total,
							locator 			: section_record.locator,
							caller 				: self
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

	return true
}//end drag_and_drop



/**
* ON_DRAGSTART
* Get element dataset path as event.dataTransfer from selected component
* @param DOM node
*	Its a section record (only in mosaic mode)
* @param event
* @param object options
* @return bool true
*/
const on_dragstart_mosaic = function(node, event, options) {
	// event.preventDefault();
	event.stopPropagation();

	// will be necessary the original locator of the section_record and the paginated_key (the position in the array of data)
	const transfer_data = {
		locator			: options.locator,
		paginated_key	: options.paginated_key,
		caller			: "tool_cataloging",
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
		if(view_mosaic) {
			full_columns_map.push({
				id			: 'original',
				label		: 'Info',
				callback	: render_column_original_copy
			})
		}


	return full_columns_map
}//end rebuild_columns_map



/**
* RENDER_COLUMN_ORIGINAL_COPY
* @param options
* @return DocumentFragment
*/
const render_column_original_copy = function(options){

	// options
		// const tool_caller	= options.caller.caller
		// const locator		= options.locator

	// DocumentFragment
		const fragment = new DocumentFragment()

	// const orderer_data	= options.caller.caller.ordered_coins.datum.data
	// const used_coin		= orderer_data.find(el => el.section_tipo===locator.section_tipo && el.section_id === locator.section_id)

	 const used_coin = false

	// columns drag indication
		const used_coin_class = used_coin
			? ' used'
			: ''

	// drag_item
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'drag' + used_coin_class,
			parent			: fragment
		})


	return fragment
}//end render_column_original_copy
