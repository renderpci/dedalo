// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, Promise */
/*eslint no-undef: "error"*/



// imports
	import {get_section_records} from '../../section/js/section.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {set_element_css} from '../../page/js/css.js'
	import {no_records_node} from './render_common_section.js'



/**
* VIEW_BASE_LIST_SECTION
* Manages the component's logic and appearance in client side
*/
export const view_base_list_section = function() {

	return true
}//end view_base_list_section



/**
* RENDER
* Render node for use current view
* @param object self
* @para object options
* sample:
* {
*    "render_level": "full",
*    "render_mode": "list"
* }
* @return HTMLElement wrapper
*/
view_base_list_section.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// columns_map
	// the method could be injected by caller in this case use it
	// or it can build his own columns and inject the final columns_map
	const columns_map = (self.rebuild_columns_map)
		? await self.rebuild_columns_map(self)
		: self.columns_map

	// assign the result of rebuild columns_map to the instance
	self.columns_map = columns_map

	// ar_section_record. section_record instances (initialized and built)
		self.ar_instances = self.ar_instances && self.ar_instances.length>0
			? self.ar_instances
			: await get_section_records({caller: self})

	// content_data
		const content_data = await get_content_data(self, self.ar_instances)
		if (render_level==='content') {

			// list_header_node. Remove possible style 'hide' if not empty
				if (self.ar_instances.length>0) {
					const wrapper = self.node
					if (wrapper.list_header_node && wrapper.list_header_node.classList.contains('hide')) {
						wrapper.list_header_node.classList.remove('hide')
					}
				}

			return content_data
		}

	// DocumentFragment
		const fragment = new DocumentFragment()


	// buttons add
		if (self.buttons && self.mode!=='tm') {
			const buttons_node = get_buttons(self);
			if(buttons_node){
				fragment.appendChild(buttons_node)
			}
		}

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
			.then(async function(){
				await self.paginator.render().then(paginator_wrapper =>{
					paginator_container.appendChild(paginator_wrapper)
				})
			})

		}

	// list body
		const list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'list_body',
			parent			: fragment
		})
		// fix last list_body (for pagination selection)
		self.node_body = list_body

		// list_body css
			const selector = `${self.section_tipo}_${self.tipo}.list`

		// custom properties defined css
			// flat columns create a sequence of grid widths taking care of sub-column space
			// like 1fr 1fr 1fr 3fr 1fr
			const items				= ui.flat_column_items(columns_map)
			const template_columns	= items.join(' ')

			const css_object = {
				'.list_body' : {
					'grid-template-columns' : template_columns
				}
			}
			if (self.context.css) {
				// use defined section css
				for(const property in self.context.css) {
					css_object[property] = self.context.css[property]
				}
			}
			// use calculated css
			set_element_css(selector, css_object)

	// list_header_node. Create and append if ar_instances is not empty
		const list_header_node = ui.render_list_header(columns_map, self)
		list_body.appendChild(list_header_node)
		if (self.ar_instances.length<1) {
			list_header_node.classList.add('hide')
		}

	// content_data append
		list_body.appendChild(content_data)

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'section',
			id				: self.id,
			class_name		: `wrapper_${self.type} ${self.model} ${self.section_tipo}_${self.tipo} ${self.tipo} ${self.mode} view_${self.view}`
		})
		wrapper.appendChild(fragment)
		// set pointers
		wrapper.content_data		= content_data
		wrapper.list_body			= list_body
		wrapper.list_header_node	= list_header_node


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* @param object self
* @param array ar_section_record
* @return HTMLElement content_data
*/
const get_content_data = async function(self, ar_section_record) {

	const fragment = new DocumentFragment()

	// add all section_record rendered nodes
		const ar_section_record_length = ar_section_record.length
		if (ar_section_record_length===0) {

			// no records found case
			const row_item = no_records_node()
			fragment.appendChild(row_item)

		}else{
			// rows
			// parallel mode
				const ar_promises = []
				for (let i = 0; i < ar_section_record_length; i++) {
					const render_promise_node = ar_section_record[i].render({
						add_hilite_row : true
					})
					ar_promises.push(render_promise_node)
				}
				await Promise.all(ar_promises).then(function(values) {
				  for (let i = 0; i < ar_section_record_length; i++) {
				  	const section_record_node = values[i]
					fragment.appendChild(section_record_node)
				  }
				});
		}

	// content_data
		const content_data = document.createElement('div')
			  content_data.classList.add('content_data', self.mode, self.type)
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* GET_BUTTONS
* @param object self
* @return HTMLElement fragment
*/
const get_buttons = function(self) {

	// ar_buttons list from context
		const ar_buttons = self.context.buttons
		if(!ar_buttons) {
			return null;
		}

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
			// Note that self section is who is observing this event (init)
			event_manager.publish('toggle_search_panel_'+self.id)
		})


	return fragment
}//end get_buttons



// @license-end
