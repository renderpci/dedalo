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
render_page.prototype.default = async function() {

	const self = this

	// page container
		const page_container = document.createElement('div')
		page_container.classList.add('page_container')

	// add all instance rendered nodes
		const length = self.ar_instances.length;
		for (let i = 0; i < length; i++) {
			const child_item = await self.ar_instances[i].render()
			page_container.appendChild(child_item)
		}


 	return page_container
}//end render_page.prototype.default


