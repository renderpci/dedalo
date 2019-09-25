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
* DEFAULT
* Render node for use in section
* @return DOM node
*/
render_page.prototype.default = async function(options={
		render_level : 'full'
	}) {

	const self = this

	const render_level = options.render_level

	// content data
		const current_content_data = await content_data(self)
		if (render_level==='content') {
			return current_content_data
		}

	// page container wrapper
		const page_wrapper = document.createElement('div')
		page_wrapper.classList.add('page_wrapper')

	// body content_data
		page_wrapper.appendChild(current_content_data)


 	return page_wrapper
}//end render_page.prototype.default



/**
* CONTENT_DATA
* @return DOM node content_data
*/
const content_data = async function(self) {

	const ar_instances = await self.get_ar_instances()

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data")

	// add all instance rendered nodes
		const length = ar_instances.length;
		for (let i = 0; i < length; i++) {

			const current_instance = ar_instances[i]

			const child_item = await current_instance.render({
				render_level : 'full'
			})

			content_data.appendChild(child_item)
		}


	return content_data
}//end content_data


