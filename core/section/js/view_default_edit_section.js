// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, Promise, SHOW_DEVELOPER, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {get_section_records} from '../../section/js/section.js'
	import {set_element_css} from '../../page/js/css.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_EDIT_SECTION
* Manages the component's logic and appearance in client side
*/
export const view_default_edit_section = function() {

	return true
}//end view_default_edit_section



/**
* RENDER
* Render node for use in edit
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_default_edit_section.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// ar_section_record. section_record instances (initialized and built)
		self.ar_instances = self.ar_instances && self.ar_instances.length>0
			? self.ar_instances
			: await get_section_records({caller: self})

	// content_data
		const content_data = await get_content_data(self, self.ar_instances)
		// fix last content_data (for pagination selection)
		self.node_body = content_data
		if (render_level==='content') {
			return content_data
		}

	const fragment = new DocumentFragment()

	// buttons
		// const current_buttons = get_buttons(self);

	// inspector
		if (self.inspector) {
			const inspector_container = ui.create_dom_element({
				element_type	: 'div',
				id				: 'inspector_container',
				class_name		: 'inspector_container',
				parent			: fragment
			})
			self.inspector.build().then(()=>{
				self.inspector.render().then(inspector_wrapper =>{

					// inspector_wrapper append
						inspector_container.appendChild(inspector_wrapper)

					// paginator inside
						if (self.paginator) {
							self.paginator.build().then(()=>{
								self.paginator.render().then(paginator_wrapper =>{
									self.inspector.paginator_container.appendChild(paginator_wrapper)
								})
							})
						}
				})
			})
		}

	// search filter
		if (self.filter) {
			const search_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'search_container',
				parent			: fragment
			})
			self.search_container = search_container
		}

	// content_data add to fragment
		fragment.appendChild(content_data)

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'section',
			id				: self.id,
			class_name		: `wrapper_${self.type} ${self.model} ${self.section_tipo}_${self.tipo} ${self.tipo} ${self.mode} view_${self.view}`
		})
		if (self.inspector===false) {
			wrapper.classList.add('no_inspector')
		}
		// append fragment
		wrapper.appendChild(fragment)
		// set pointers
		wrapper.content_data = content_data

	// css v6
		if (self.context && self.context.css) {
			const selector = `${self.section_tipo}_${self.tipo}.edit`
			set_element_css(selector, self.context.css)
			// add_class
				// sample
				// "add_class": {
				// "wrapper": [
				// 	"bg_warning"
				// ]
				// }
				if (self.context.css.add_class) {

					for(const selector in self.context.css.add_class) {
						const values = self.context.css.add_class[selector]
						const element = selector==='wrapper'
							? wrapper
							: selector==='content_data'
								? content_data
								: null

						if (element) {
							element.classList.add(values)
						}else{
							console.warn("Invalid css class selector was ignored:", selector);
						}
					}
				}
		}


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* @return HTMLElement content_data
*/
const get_content_data = async function(self, ar_section_record) {
	// const t0 = performance.now()

	const fragment = new DocumentFragment()

	// add all section_record rendered nodes
		const ar_section_record_length = ar_section_record.length
		if (ar_section_record_length===0) {
			// no records found case
			const row_item = no_records_node()
			fragment.appendChild(row_item)
		}else{
			// rows

			// sequential mode
				// for (let i = 0; i < ar_section_record_length; i++) {
				// 	const row_item = await ar_section_record[i].render()
				// 	fragment.appendChild(row_item)
				// }

			// parallel mode
				const ar_promises = []
				for (let i = 0; i < ar_section_record_length; i++) {
					const render_promise = ar_section_record[i].render()
					ar_promises.push(render_promise)
				}
				await Promise.all(ar_promises).then(function(values) {
				  for (let i = 0; i < ar_section_record_length; i++) {
				  	fragment.appendChild(values[i])
				  }
				});
		}

	// content_data
		const content_data = document.createElement('div')
			  content_data.classList.add('content_data', self.mode) // ,'nowrap','full_width'
			  content_data.appendChild(fragment)

	// debug
		if(SHOW_DEVELOPER===true) {
			// const total = (performance.now()-t0).toFixed(3)
			// dd_console(`__Time [view_default_edit_section.get_content_data]: ${total} ms`,'DEBUG', [ar_section_record, total/ar_section_record_length])
		}


	return content_data
}//end get_content_data



/**
* GET_BUTTONS
* @return HTMLElement buttons
*/
const get_buttons = function(self) {

	const buttons = []


	return buttons
}//end get_buttons



/**
* NO_RECORDS_NODE
* @return HTMLElement node
*/
const no_records_node = () => {

	const node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'no_records',
		inner_html		: get_label.no_records || 'No records found'
	})

	return node
}//end no_records_node



// @license-end
