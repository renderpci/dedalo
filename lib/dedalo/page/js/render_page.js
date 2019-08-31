	import {ui} from '../../common/js/ui.js'


/**
* Render_page
* Manages the component's logic and apperance in client side
*/
export const render_page = function() {

	return true	
}//end render_page



/**
* SECTION
* Render node for use in section
* @return DOM node
*/
render_page.prototype.section = async function() {
	
	const self = this

	// main container
		const main = document.getElementById("main")
			  main.classList.add("loading")

	// main container. Append to page dom node 'main' 
		//while (main.firstChild) {
		//	main.removeChild(main.firstChild)
		//}

	// section dom container
		const page_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'page_container'
		})

	// add all section_record rendered nodes
		const length = self.ar_instances.length;
		for (let i = 0; i < length; i++) {
			const child_item = await self.ar_instances[i].render()
			page_container.appendChild(child_item)
		}

		main.appendChild(page_container)

	// restore class
 		main.classList.remove("loading","hide")
 	

 	return page_container
}//end render_page.prototype.section


