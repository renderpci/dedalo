


// import
	import {event_manager} from '../../common/js/event_manager.js'
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
render_menu.prototype.edit = async function() {

	const self = this

	const fragment = new DocumentFragment()

	// menu_wrapper
		self.menu_active = false
		const menu_wrapper = document.createElement("div")
			  menu_wrapper.classList.add("menu_wrapper")
			  // click do global click action on the menu items
				menu_wrapper.addEventListener("click", e => {
					// first menu items only (when the ul is menu)
						if (self.menu_active===true) {
							close_all_drop_menu(self);
							self.menu_active = false

						}else{
							const main_li 	= e.target.parentNode
							const nodes_li 	= self.li_nodes
							const len		= nodes_li.length

							for (let i = len - 1; i >= 0; i--) {
								nodes_li[i].classList.add("menu_li_inactive");
								nodes_li[i].classList.remove("menu_li_active");

								if(nodes_li[i] == main_li){
									nodes_li[i].classList.add("menu_li_active");
									nodes_li[i].classList.remove("menu_li_inactive");
								}
							}
							event.stopPropagation();
							self.menu_active = true
						}
					})


	// Quit
		const quit = ui.create_dom_element({
			element_type	: 'div',
			id 				: 'quit',
			parent 			: fragment
		})
		quit.addEventListener("click", () =>{
			login.quit()
		})


	// Logo
		const dedalo_icon = ui.create_dom_element({
			element_type	: 'div',
			id 				: 'dedalo_icon_top',
			parent 			: fragment
		})


	// Hierarchy
		level_hierarchy({	self			: self,
							datalist 		: self.data.tree_datalist,
							ul_container 	: fragment,
							parent_tipo		: 'dd1',
							id 				: 'menu'
						})

		// document. do global click action on the document body
			document.addEventListener('mousedown', function(event) {
				event.stopPropagation();
				if(self.menu_active===false) {
					return false
				}
			    if (event.target.tagName.toLowerCase()!=='a') {
					close_all_drop_menu(self);
			    }
			});

			document.addEventListener('keydown', (event) => {
				if(self.menu_active===false) {
					return false
				}
			    if (event.key==='Escape') {
					close_all_drop_menu(self);
			    }
			});


	// User name(go to list)
		const logged_user_name = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'logged_user_name',
			parent 			: fragment,
			text_content	: page_globals['username']
		})

			console.log("page_globals:",page_globals);


	// Application_langs_selector
		const lang_datalist = self.data.langs_datalist
		const dedalo_aplication_langs_selector = ui.build_select_lang({
			langs 		: lang_datalist,
			action 		: change_lang(),
			selected	: page_globals['dedalo_application_lang'],
			class_name 	: 'dedalo_aplication_langs_selector'
		})

		fragment.appendChild(dedalo_aplication_langs_selector)


	// menu dedalo_data_langs_selector(go to list)
		const lang_datalist_data = lang_datalist.map(item =>{
			const label =  get_label['data'] || 'data'
			return {label: label+': '+item.label,
								value: item.value}
		})
		const dedalo_data_langs_selector = ui.build_select_lang({
			langs 		: lang_datalist_data,
			action 		: change_lang(),
			selected	: page_globals['dedalo_data_lang'],
			class_name	: 'dedalo_aplication_langs_selector'
		})

		fragment.appendChild(dedalo_data_langs_selector)


	// menu button(go to list)
		const section_label = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'section_label',
			parent 			: fragment,
		})

		// update value, subscription to the changes: if the section or area was changed, observers dom elements will be changed own value with the observable value
			self.events_tokens.push(
				event_manager.subscribe('render_instance', update_section_label)
			)
			function update_section_label (instance) {
				if(instance.model === 'section'|| instance.model === 'area'){
					// change the value of the current dom element
					section_label.innerHTML = instance.label
				}
			}


	// menu button_toggle_inspector
		const toggle_inspector = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'button_toggle_inspector',
			parent 			: fragment
		})


	menu_wrapper.appendChild(fragment)

	return menu_wrapper
}


/**
* LEVEL HIERARCHY
* @return dom element li
*/
const level_hierarchy = async (options) => {

	const self			= options.self
	const datalist 		= options.datalist
	const ul_container 	= options.ul_container
	const parent_tipo	= options.parent_tipo


	const root_areas = datalist.filter(item => item.parent === parent_tipo)

	// inputs container
		const ul = ui.create_dom_element({
			element_type	: 'ul',
			id 				: options.id || '',
			parent 			: ul_container
		})

	// values (inputs)
		const root_areas_length = root_areas.length
		for (let i = 0; i < root_areas_length; i++) {
			item_hierarchy({
							self			: self,
							datalist 		: datalist,
							ul_container 	: ul,
							item 			: root_areas[i],
							})
		}
}


/**
* ITEM_HIERARCHY
* @return dom element li
*/
const item_hierarchy = async (options) => {

	const self			= options.self
	const datalist 		= options.datalist
	const ul_container 	= options.ul_container
	const item 			= options.item
	const children_item = datalist.find(children_item => children_item.parent === item.tipo)

	// li
		const li = ui.create_dom_element({
			element_type 	: 'li',
			class_name 		: 'menu_li_inactive',
			parent 		 	: ul_container,
		})

		self.li_nodes.push(li)

	//events

		li.addEventListener("mouseover", e => {

			if(self.menu_active===false) {
				return false
			}//end if self.menu_active
				const parent_node = e.target.parentNode;
				const nodes_li 	= parent_node.parentNode.getElementsByTagName('li')
				// const nodes_li = self.li_nodes
				const len		= nodes_li.length
				for (let i = len - 1; i >= 0; i--) {
					nodes_li[i].classList.add("menu_li_inactive");
					nodes_li[i].classList.remove("menu_li_active");

					if(nodes_li[i] == parent_node){
						nodes_li[i].classList.add("menu_li_active");
						nodes_li[i].classList.remove("menu_li_inactive");
					}
				}
		})

		li.addEventListener("mouseout", e => {

			if (e.clientY<0 || e.srcElement.id==='menu_wrapper') {
				close_all_drop_menu(self);
			}
			return true
			// if(self.menu_active){
			// 	li.classList.add ('menu_li_inactive')
			// 	li.classList.remove ('menu_li_active')
			// }//end if self.menu_active
		})


	// link
		const link = ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'area_label',
			inner_html 		: item.label,
			parent 			: li
		})

		link.addEventListener("click", e => {

			if(self.menu_active===false) {
				return false
			}//end if self.menu_active
			//event_manager
			event_manager.publish('user_action', {tipo : item.tipo, mode : 'list'})

		})



		if (children_item) {
			li.classList.add ('has-sub')
			level_hierarchy({		self			: self,
									datalist 		: datalist,
									ul_container	: li,
									parent_tipo		: item.tipo
								})

		}// end children_item
}//end item_hierarchy



/**
* CLOSE_ALL_DROP_MENU
*/
const close_all_drop_menu = async function(self) {

	self.menu_active = false

		console.log("close menu:");

	if (typeof self.li_nodes!=="undefined") {

		const len = self.li_nodes.length
		for (let i = len - 1; i >= 0; i--) {
			const li = self.li_nodes[i]
			li.classList.add("menu_li_inactive");
			li.classList.remove("menu_li_active");
		}
	}

	return true
}//end close_all_drop_menu


/**
* CHANGE_LANG
*/
const change_lang = async function(self) {

		console.log("change_lang:");
}
