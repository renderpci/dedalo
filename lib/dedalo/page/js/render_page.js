
/**
* Render_page
* Manages the component's logic and apperance in client side
*/
export const render_page = function() {

	return true	
}//end render_page



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_page.prototype.edit = async function(ar_instances) {
	
	const self = this

	// main container
		const main = document.getElementById("main")
			  main.classList.add("loading")

	// main container. Append to page dom node 'main' 
		//while (main.firstChild) {
		//	main.removeChild(main.firstChild)
		//}

	// section dom container
		const page_container = common.create_dom_element({
			element_type	: 'div',
			class_name		: 'page_container'
		})

	// add all section_record rendered nodes
		const length = ar_instances.length
		for (let i = 0; i < length; i++) {
			const child_item =  await ar_instances[i].render()
			page_container.appendChild(child_item)
		}

		main.appendChild(page_container)

	// restore class
 		main.classList.remove("loading","hide")
 	

 	return page_container
}//end render_page.prototype.edit


