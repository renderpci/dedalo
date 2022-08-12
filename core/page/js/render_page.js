/*global get_label, page_globals, SHOW_DEBUG, DEDALO_ROOT_WEB, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {instantiate_page_element} from './page.js'
	import {clone} from '../../common/js/utils/index.js'



/**
* RENDER_PAGE
* Manages the component's logic and apperance in client side
*/
export const render_page = function() {

	return true
}//end render_page



/**
* EDIT
* Render node for use in section
* @return DOM node
*/
render_page.prototype.edit = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content data
		const content_data = get_content_data(self) // result is a promise
		if (render_level==='content') {
			return await content_data
		}

	// wrapper
		const wrapper_page = document.createElement('div')
		wrapper_page.classList.add('wrapper_page', self.type)

	// menu
		// const element_menu = self.context.find(el => el.model==='menu')
		// if (typeof element_menu!=='undefined') {
		// 	const menu_node = render_menu(self)
		// 	wrapper_page.appendChild(await menu_node)
		// }

	// body content_data
		wrapper_page.appendChild(await content_data)

	// modal box hidden
		// const dd_modal = document.createElement('dd-modal')
		// wrapper_page.appendChild(dd_modal)

	// events
		// page click
			wrapper_page.addEventListener("click", fn_deactivate_components)
			function fn_deactivate_components() {
				const active_component = document.querySelector(".wrapper_component.active")
				if (active_component) {
					active_component.classList.remove("active")
					// deactivate_component
					event_manager.publish('deactivate_component')
				}
			}


 	return wrapper_page
}//end render_page.prototype.edit



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = async function(self) {

	// const fragment = new DocumentFragment()

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)

	// add all instance rendered nodes
		// const ar_instances_length = self.ar_instances.length;

		// sequential mode
			// for (let i = 0; i < ar_instances_length; i++) {

			// 	const current_instance = self.ar_instances[i]

			// 	// exclude menu already added
			// 	if(current_instance.model==='menu') continue;

			// 	const child_item = current_instance.render({
			// 		render_level : 'full'
			// 	})

			// 	content_data.appendChild(await child_item)
			// }

		// parallel mode
			// const ar_promises = []
			// for (let i = 0; i < ar_instances_length; i++) {

			// 	const current_instance = self.ar_instances[i]

			// 	// exclude menu already added to wrapper_page
			// 	if(current_instance.model==='menu') continue;

			// 	const render_promise = current_instance.render()
			// 	ar_promises.push(render_promise)
			// }
			// await Promise.all(ar_promises).then(function(child_items) {
			//   for (let i = 0; i < child_items.length; i++) {
			//   	content_data.appendChild(child_items[i])
			//   }
			// });

		// async mode
			const context_length = self.context.length
			for (let i = 0; i < context_length; i++) {

				const current_context = self.context[i]

				// menu case. Prevent to render again on refresh page
					// const non_destroyable_instance = self.ar_instances.find(el => el.model===current_context.model)
					const non_destroyable_instance = self.ar_instances.find(el => el.model===current_context.model && el.destroyable===false)
					if (non_destroyable_instance) {
						content_data.appendChild(non_destroyable_instance.node)
						continue;
					}

				// container placeholder until page element is builded and rendered
					const label = current_context.label || current_context.model
					const container_placeholder = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'container container_placeholder ' + current_context.model,
						inner_html		: 'Loading '+ label +' ['+ current_context.tipo+']',
						parent			: content_data
					})
					// spinner
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'spinner',
						parent			: container_placeholder
					})

				// instance
					const current_instance = await instantiate_page_element(self, current_context)

					self.ar_instances.push(current_instance)

					// build (load data)
					const autoload = true // current_instance.status==="initiated" // avoid reload menu data
					current_instance.build(autoload)
					.then(function(){
						// render instance
						current_instance.render()
						.then(function(node){
							container_placeholder.replaceWith(node);
						})
					})
			}//end for (let i = 0; i < elements_length; i++)

	// event page rendered (used by menu..)
		event_manager.publish('render_page', self)

	// // content_data
	// 	const content_data = document.createElement("div")
	// 		  content_data.classList.add("content_data", self.type)
	// 	content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* RENDER_MENU
* @return DOM node render_menu
*/
	// const render_menu = async function(self) {

	// 	const menu_instance = self.ar_instances.find( instance => instance.model==='menu' )
	// 	if(menu_instance){

	// 		const menu_item = menu_instance.render({
	// 			render_level : 'full'
	// 		})
	// 		return menu_item
	// 	}

	// 	return null
	// }//end render_menu



/**
* RENDER_SERVER_RESPONSE_ERROR
* @return DOM node
*/
export const render_server_response_error = function(msg) {

	// wrapper
		const wrapper_page = document.createElement('div')
		wrapper_page.classList.add('wrapper_page', 'page')

	// error_container
		const error_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'page_error_container',
			parent			: wrapper_page
		})

	// icon_dedalo
		ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'icon_dedalo',
			src				: DEDALO_CORE_URL + '/themes/default/dedalo_logo.svg',
			parent			: error_container
		})

	// server_response_error h1
		ui.create_dom_element({
			element_type	: 'h1',
			class_name		: 'server_response_error',
			inner_html		: 'Server response error: ' + msg,
			parent			: error_container
		})

	// more_info
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'more_info',
			inner_html		: 'Received data is not JSON valid. See your server log for details',
			parent			: error_container
		})


	return wrapper_page
}//end render_server_response_error
