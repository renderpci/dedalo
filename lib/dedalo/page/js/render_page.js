/*global get_label, page_globals, SHOW_DEBUG, DEDALO_LIB_BASE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import '../../common/js/modal.js'



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
		const current_content_data = await content_data(self)
		if (render_level==='content') {
			return current_content_data
		}

	// wrapper
		const wrapper_page = document.createElement('div')
		wrapper_page.classList.add('wrapper_page', self.type)

	// body content_data
		wrapper_page.appendChild(current_content_data)

	// modal box hidden
		const dd_modal = document.createElement('dd-modal')
		wrapper_page.appendChild(dd_modal)


 	return wrapper_page
}//end render_page.prototype.edit



/**
* CONTENT_DATA
* @return DOM node content_data
*/
const content_data = async function(self) {

	const fragment = new DocumentFragment()

	// instances (like section). Instances are returned init and builded
	const ar_instances = await self.get_ar_instances()

	// add all instance rendered nodes
		const length = ar_instances.length;
		for (let i = 0; i < length; i++) {

			const current_instance = ar_instances[i]

			//await current_instance.build() (?)

			const child_item = await current_instance.render({
				render_level : 'full'
			})

			fragment.appendChild(child_item)
		}

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
		content_data.appendChild(fragment)


	return content_data
}//end content_data


