/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* Render_page
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
render_page.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	const render_level = options.render_level

	// content data
		const current_content_data = content_data(self)
		if (render_level==='content') {
			return current_content_data
		}

	// wrapper
		const wrapper_page = document.createElement('div')
		wrapper_page.classList.add('wrapper_page', self.type)

	// menu
		const element_menu 	= self.elements.find(item => item.model==='menu')
		if (typeof element_menu!=='undefined') {
			const menu_node = get_menu(self)
			wrapper_page.appendChild(await menu_node)
		}

	// body content_data
		wrapper_page.appendChild(await current_content_data)

	// modal box hidden
		// const dd_modal = document.createElement('dd-modal')
		// wrapper_page.appendChild(dd_modal)

	// events
		// page click
		wrapper_page.addEventListener("click", unactive_components)
		function unactive_components() {
			const active_component = document.querySelector(".wrapper_component.active")
			if (active_component) {
				active_component.classList.remove("active")
			}				
		}


 	return wrapper_page
}//end render_page.prototype.edit



/**
* CONTENT_DATA
* @return DOM node content_data
*/
const content_data = async function(self) {

	// const fragment = new DocumentFragment()

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)


	// add all instance rendered nodes
		const length = self.ar_instances.length;
		for (let i = 0; i < length; i++) {

			const current_instance = self.ar_instances[i]

			// exclude menu already added
			if(current_instance.model!=='menu') {

				const child_item = await current_instance.render({
					render_level : 'full'
				})

				content_data.appendChild(child_item)
			}
		}

	// // content_data
	// 	const content_data = document.createElement("div")
	// 		  content_data.classList.add("content_data", self.type)
	// 	content_data.appendChild(fragment)


	return content_data
}//end content_data



/**
* GET_MENU
* @return DOM node get_menu
*/
const get_menu = async function(self) {

	const menu_instance = self.ar_instances.find( instance => instance.model === 'menu')
	if(menu_instance){

		const menu_item = menu_instance.render({
				render_level : 'full'
			})
		return menu_item
	}

	return null
}//end get_menu


