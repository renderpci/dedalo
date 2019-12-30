/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {ui} from '../../common/js/ui.js'



/**
* render_menu
* Manages the component's logic and apperance in client side
*/
export const render_menu = function() {

	return true
}//end render_menu



/**
* EDIT
* Render node for use in edit
* @return DOM node wrapper
*/
render_menu.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	const fragment = new DocumentFragment()

	level_hierarchy({
						datalist 		: self.data,
						ul_container 	: fragment,
						parent_tipo		: 'dd1'
					})

	// menu_wrapper
	const menu_wrapper = document.createElement("div")
		  menu_wrapper.classList.add("menu_wrapper")
	menu_wrapper.appendChild(fragment)


	return menu_wrapper
}


/**
* LEVEL HIERARCHY
* @return dom element li
*/
const level_hierarchy = async (options) => {

	const datalist 		= options.datalist
	const ul_container 	= options.ul_container
	const parent_tipo	= options.parent_tipo


	const root_areas = datalist.filter(item => item.parent === parent_tipo)

	// inputs container
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: ul_container
		})

	// values (inputs)
		const root_areas_length = root_areas.length
		for (let i = 0; i < root_areas_length; i++) {
			item_hierarchy({
							datalist 		: datalist,
							ul_container 	: inputs_container, 
							item 			: root_areas[i]
							})
		}	
}


/**
* ITEM_HIERARCHY
* @return dom element li
*/
const item_hierarchy = async (options) => {

	const datalist 		= options.datalist
	const ul_container 	= options.ul_container
	const item 			= options.item
	const children_item = datalist.find(children_item => children_item.parent === item.tipo)

	// li
		const li = ui.create_dom_element({
			element_type : 'li',
			parent 		 : ul_container
		})

	// label
		const label = ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'area_label',
			inner_html 		: item.label,
			parent 			: li
		})

		if (children_item) {

			li.classList.add ('open')

			label.addEventListener("mousedown", e => {
				e.stopPropagation()
				
				if(li.classList.contains('open')){

					li.classList.remove ('open')
					li.removeChild(li.querySelector('ul'))

				}else{
					button_add_input.classList.add ('open')
					level_hierarchy({
									datalist 		: datalist,
									ul_container	: li,
									parent_tipo		: item.tipo
								})
				}
			})

		}
}//end item_hierarchy