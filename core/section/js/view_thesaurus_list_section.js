// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, Promise */
/*eslint no-undef: "error"*/



// imports
	import {get_section_records} from '../../section/js/section.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {
		clone,
		get_font_fit_size,
		object_to_url_vars,
		// open_window
	} from '../../common/js/utils/index.js'
	import {ui} from '../../common/js/ui.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	import {set_element_css} from '../../page/js/css.js'
	import {no_records_node} from './render_common_section.js'
	// // import {
	// 	render_column_id
	// } from './render_list_section.js'



/**
* view_thesaurus_list_section
* Manages the component's logic and appearance in client side
*/
export const view_thesaurus_list_section = function() {

	return true
}//end view_thesaurus_list_section



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
view_thesaurus_list_section.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// columns_map
		const columns_map	= await rebuild_columns_map(self)
		self.columns_map	= columns_map

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
			.then(function(){
				self.paginator.render()
				.then(paginator_wrapper =>{
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
			if (self.context?.css) {
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
* @param array ar_section_record
* @para object self
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

			// once rendered, append it preserving the order
				await Promise.all(ar_promises)
				.then(function(values) {
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
* REBUILD_COLUMNS_MAP
* Adding control columns to the columns_map that will processed by section_recods
* @param object self
* @return obj columns_map
*/
const rebuild_columns_map = async function(self) {

	// columns_map already rebuilt case
		if (self.fixed_columns_map===true) {
			return self.columns_map
		}

	const columns_map = []

	// column section_id check
		columns_map.push({
			id			: 'section_id',
			label		: 'Id',
			tipo		: 'section_id', // used to sort only
			sortable	: true,
			width		: 'minmax(auto, 6rem)',
			path		: [{
				// note that component_tipo=section_id is valid here
				// because section_id is a direct column in search
				component_tipo	: 'section_id',
				// optional. Just added for aesthetics
				model			: 'component_section_id',
				name			: 'ID',
				section_tipo	: self.section_tipo
			}],
			callback	: render_column_id
		})

	// columns base
		const base_columns_map = await self.columns_map
		columns_map.push(...base_columns_map)

	// fixed as calculated
		self.fixed_columns_map = true


	return columns_map
}//end rebuild_columns_map



/**
* GET_BUTTONS
* @param object self
* @return HTMLElement fragment
*/
const get_buttons = function(self) {

	// ar_buttons list from context
		const ar_buttons = self.context?.buttons
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





/**
* RENDER_COLUMN_ID
* Custom render to generate the section list column id.
* Is called as callback from section_record
* @param object options
* @return DOM DocumentFragment
*/
const render_column_id = function(options) {

	// options
		const self			= options.caller // object instance, usually section or portal
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo
		const paginated_key	= options.paginated_key // int . Current item paginated_key in all result

	// permissions
		const permissions = self.permissions

	// show_interface
		const show_interface = self.show_interface || {}

	// DocumentFragment
		const fragment = new DocumentFragment()

	// linker
		const linker = self.caller.area_thesaurus.linker
	// section_id
		const section_id_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'section_id',
			text_content	: section_id
		})
		if(SHOW_DEBUG===true) {
			section_id_node.title = 'paginated_key: ' + paginated_key
		}
		// adjust the font size to fit it into the column
		// @see https://www.freecodecamp.org/news/learn-css-units-em-rem-vh-vw-with-code-examples/#what-are-vw-units
		const base_size	= 1.25 // defined as --font_size: 1.25rem; into CSS (list.less)
		const font_size	= get_font_fit_size(section_id, base_size, 4)
		if (font_size!==base_size) {
			section_id_node.style.setProperty('--font_size', `${font_size}rem`);
		}

	// buttons
		switch(true){

			// initiator. is a url var used in iframe containing section list to link to opener portal
			case (self.initiator && self.initiator.indexOf('tool_indexation_')!==-1): {

				// link_button. component portal caller (link)
					const link_button = ui.create_dom_element({
						element_type	: 'button',
						class_name		: 'link_button',
						parent			: fragment
					})
					link_button.addEventListener('click', function(e) {
						e.stopPropagation()

						// publish event link_term
						if (!linker) {
							console.warn(`Error. self.linker is not defined.
								Please set ts_object linker property with desired target component portal:`, self);
							return false
						}
						// linker id. A component_portal instance is expected as linker
						const linker_id = linker.id
						// source_window.event_manager.publish('link_term_' + linker_id,
						const window_base = !linker.caller
							? window.opener // case DS opening new window
							: window // default case (indexation)
						window_base.event_manager.publish('link_term_' + linker_id, {
							section_tipo	: section_tipo,
							section_id		: section_id,
							label			: self.label ? self.label : ''
						})

					})
					link_button.appendChild(section_id_node)
					// link_icon
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'button arrow_link icon',
						parent			: link_button
					})
				break;
			}
		}


	return fragment
}//end render_column_id




// @license-end
