// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, DEDALO_CORE_URL, SHOW_DEBUG, SHOW_DEVELOPER */
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {
		clone
	} from '../../common/js/utils/index.js'



/**
* RENDER_TREE
* @param object options
* @return bool
*/
export const render_tree = (options) => {

	// options
		const self		= options.self
		const container	= options.container
		const tipo		= options.tipo

	// datalist
		const data		= self.data || []
		const datalist	= data.tree_datalist || []

	// render
		render_level_hierarchy({
			self			: self,
			datalist		: datalist,
			root_ul			: container,
			current_tipo	: tipo,
			parent_tipo		: tipo
		})

	// click . Manages global click action on the menu items
		container.addEventListener('click', fn_click)
		function fn_click(e) {
			// e.stopPropagation()
			// e.preventDefault()

			// first menu items only (when the ul is the main menu)

			// close all menu items when the menu change to inactive
			if (self.menu_active===true) {

				close_all_drop_menu(self);
				self.menu_active = false

			}else{
				// close_all_drop_menu(self);
				// get the main li nodes
				const main_li			= e.target.parentNode
				const nodes_li			= self.li_nodes
				const nodes_li_length	= nodes_li.length
				// get the main ul nodes
				const open_id =  main_li.dataset.children
				if (open_id) {
					const open_ul = document.getElementById(open_id)
					// set the css visibility for the ul
					if (open_ul) {
						open_ul.classList.remove('menu_ul_hidden');
						open_ul.classList.add('menu_ul_displayed');
						// moves the ul to the left position of the parent li
						open_ul.style.left = (main_li.getBoundingClientRect().left+'px')
					}
				}

				for (let i = nodes_li_length - 1; i >= 0; i--) {
					// inactive all li nodes
					nodes_li[i].classList.add('menu_li_inactive');
					nodes_li[i].classList.remove('menu_li_active');

					// active only the selected li node
					if(nodes_li[i] == main_li) {
						nodes_li[i].classList.add('menu_li_active');
						nodes_li[i].classList.remove('menu_li_inactive');
					}
				}
				self.menu_active = true
			}// end if (self.menu_active===true)
		}//end container.addEventListener('click'

	// mousedown. document. do global click action on the document body
		document.addEventListener('mousedown', fn_mousedown)
		function fn_mousedown(e) {
			e.stopPropagation()
			// if the menu is inactive nothing to do
			if(self.menu_active===false) {
				return false
			}
			// if the user do click in other node than 'a' node, close all nodes, no other action to do
			if (e.target.tagName.toLowerCase()!=='a') {
				close_all_drop_menu(self)
			}
		}//end fn_mousedown

	// keydown. set the escape key to close al menu nodes
		document.addEventListener('keydown', fn_keydown)
		function fn_keydown(e) {
			if(self.menu_active===false) {
				return false
			}
			if (e.key==='Escape') {
				close_all_drop_menu(self);
			}
		}


	return true
}//end render_tree



/**
* RENDER_LEVEL_HIERARCHY
* @param object options
* @return bool
*/
const render_level_hierarchy = (options) => {

	// options
		const self			= options.self
		const datalist		= options.datalist
		const root_ul		= options.root_ul
		const current_tipo	= options.current_tipo

	// ul container
		const ul = ui.create_dom_element({
			element_type	: 'ul',
			id				: current_tipo,
			parent			: root_ul
		})

	// store in the instance the new ul node
		self.ul_nodes.push(ul)

	// values (li nodes dependents of the ul)
		const root_areas		= datalist.filter(item => item.parent===current_tipo)
		const root_areas_length	= root_areas.length
		for (let i = 0; i < root_areas_length; i++) {
			// create the li and a nodes inside the current ul
			render_item_hierarchy({
				self			: self,
				datalist		: datalist,
				root_ul			: root_ul,
				ul_container	: ul,
				item			: root_areas[i],
				current_tipo	: current_tipo
			})
		}

	return true
}//end render_level_hierarchy



/**
* RENDER_ITEM_HIERARCHY
* Render li hierarchy node
* @param object options
* @return HTMLElement li
*/
const render_item_hierarchy = (options) => {

	// options
		const self			= options.self
		const datalist		= options.datalist
		const ul_container	= options.ul_container
		const root_ul		= options.root_ul
		const item			= options.item
		const current_tipo	= options.current_tipo

	// li
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'menu_li_inactive',
			parent			: ul_container
		})
		// append to li_nodes
		self.li_nodes.push(li)

	// events
		// mouseenter
			li.addEventListener('mouseenter', fn_mouseenter)
			// li.addEventListener('touchstart', fn_mouseenter)
			function fn_mouseenter(e) {
				// e.stopPropagation();

				// if (e.type==='touchstart' && self.menu_active!==false) {
				// 	e.preventDefault()
				// }

				if(self.menu_active===false) {
					return false
				}

				// get current node mouse is over
				const active_li = e.target.nodeName==='A' ? e.target.parentNode : e.target
				// get all nodes inside ul
				const nodes_li	= ul_container.getElementsByTagName('li')
				const len		= nodes_li.length
				for (let i = len - 1; i >= 0; i--) {

					// inactive all nodes
					nodes_li[i].classList.add('menu_li_inactive')
					nodes_li[i].classList.remove('menu_li_active')

					// close all ul nodes dependent of the current li
					const close_id = nodes_li[i].dataset.children
					if (close_id) {
						close_all_children(close_id)
					}

					// check if the active li is the current loop node.
					if(nodes_li[i]===active_li){

						// active the current li
						nodes_li[i].classList.add('menu_li_active');
						nodes_li[i].classList.remove('menu_li_inactive');
						// if the active li has children
						const open_id = active_li.dataset.children
						if(open_id) {

							//get the ul node and active it
							const open_ul = document.getElementById(open_id)

							open_ul.classList.remove('menu_ul_hidden');
							open_ul.classList.add('menu_ul_displayed');

							//first menu li nodes has parent 'dd1' and the position in the screen is calculated by the end of the parent li node
							if(active_li.parentNode.id === 'dd1'){

								open_ul.style.left = (active_li.getBoundingClientRect().left -1 ) + 'px'

							}else{

								const top_position = Math.ceil(
									active_li.getBoundingClientRect().top
									- root_ul.getBoundingClientRect().top // offset (maintenance messages, etc.)
								)
								// console.log("active_li.getBoundingClientRect().top:",active_li.getBoundingClientRect().top);
								// console.log("root_ul.getBoundingClientRect().top:",root_ul.getBoundingClientRect().top);
								// console.log("top_position:",top_position);

								// the node is totally visible and don't need move to the top
								open_ul.style.top = top_position + 'px'
								// normal calculation for the hierarchy menus
								// get the bottom position of the ul and remove the height of the window
								const ul_bottom_dif = open_ul.getBoundingClientRect().bottom - window.innerHeight//document.documentElement.clientHeight
								// if the position is outside of the window (>0)
								if (ul_bottom_dif>0) {
									// get the top of the current li and remove the oversize outsize of the window
									const total_top		= top_position - ul_bottom_dif
									open_ul.style.top	= total_top + 'px'
								}
								// move the node to the right position of the selected li
								open_ul.style.left = active_li.getBoundingClientRect().right + 'px'
							}//end if(active_li.parentNode.id === 'dd1')
						}//end if(open_id)

					}//end if(nodes_li[i] == active_li)
				}//end for
			}//end fn_mouseenter

		// mouseleave
			li.addEventListener('mouseleave', fn_mouseleave)
			function fn_mouseleave(e) {
				// li.addEventListener('touchleave', (e) => {
				if (e.clientY<0 || e.srcElement.id==='menu_wrapper') {
					close_all_drop_menu(self);
				}

				return true
			}//end mouseleave

		// remove the html <mark> sent by the server
		// when the label is not in the current language
		// and get the label with fallback
		// and replace it for italic style
			const is_fallback	= item.label.indexOf('<mark>')
			const text_fallback	= is_fallback === -1 ? '' : 'mark'
			const label_text	= item.label.replace(/(<([^>]+)>)/ig,"");

		// a element with the link to the area or section to go
			const link = ui.create_dom_element({
				element_type	: 'a',
				class_name		: 'area_label ' + text_fallback,
				inner_html		: label_text,
				parent			: li
			})

		// click
		// when the user do click publish the tipo to go and set the mode in list
		// the action can be executed mainly in page, but it can be used for any instance.
			link.addEventListener('click', fn_click)
			async function fn_click(e) {

				// nonactive menu case
				if (self.menu_active===false) {
					return false
				}

				// safe_item. Clone menu item before use it
					const safe_item = clone(item)

				// swap_tipo
					if (safe_item.config && safe_item.config.swap_tipo) {
						safe_item.tipo = safe_item.config.swap_tipo
					}

				if (e.altKey===true) {
					// open in new tab
					const base_url = window.location.pathname
					const url = base_url + "?tipo=" + item.tipo + "&mode=list"
					const win = window.open(url, '_blank');
						  win.focus();
				}else{

					// navigate
					event_manager.publish('user_navigation', {
						source : {
							tipo	: safe_item.tipo,
							model	: safe_item.model,
							mode	: 'list',
							// this config comes from properties (used by section_tool to define the config of the section that its called)
							config	: safe_item.config || null
						},
						sqo : sqo
					})
				}

				return true
			}//end fn_click

	// children_item. recursive generation of children nodes of the current li node.
		const children_item	= datalist.find(children_item => children_item.parent===item.tipo)
		if (children_item) {

			li.classList.add ('has-sub')
			li.dataset.children	= item.tipo
			render_level_hierarchy({
				self			: self,
				datalist		: datalist,
				root_ul			: root_ul,
				current_tipo	: item.tipo,
				parent_tipo		: current_tipo
			})
		}//end children_item


	return li
}//end render_item_hierarchy



/**
* CLOSE_ALL_DROP_MENU
* Select all nodes in the menu instance and set the css to remove the visualization
* @para object self
* @return void
*/
const close_all_drop_menu = function(self) {

	self.menu_active = false

	// close all ul nodes stored in the menu instance
	if (typeof self.ul_nodes!=='undefined') {

		const len = self.ul_nodes.length
		for (let i = len - 1; i >= 0; i--) {
			const ul = self.ul_nodes[i]
				  ul.classList.add('menu_ul_hidden');
				  ul.classList.remove('menu_ul_displayed');
		}
	}
	// close all li nodes stored in the menu instance
	if (typeof self.li_nodes!=='undefined') {

		const len = self.li_nodes.length
		for (let i = len - 1; i >= 0; i--) {
			const li = self.li_nodes[i]
				  li.classList.add('menu_li_inactive');
				  li.classList.remove('menu_li_active');
		}
	}
}//end close_all_drop_menu



/**
* CLOSE_ALL_CHILDREN
* Get all nodes children of the tipo set to them the css to remove the visualization
* @param string tipo
* @return void
*/
const close_all_children = function(tipo) {

	// get the children nodes of the sent tipo and add/remove the css
	const close_ul = document.getElementById(tipo)
		  close_ul.classList.remove('menu_ul_displayed');
		  close_ul.classList.add('menu_ul_hidden');

	// get the child nodes of the current ul
	const ar_children_nodes	= close_ul.childNodes
	const child_len			= ar_children_nodes.length
	for (let i = child_len - 1; i >= 0; i--) {
		// get the children link node of the current li
		const new_tipo = ar_children_nodes[i].dataset.children
		// recursive action of the current children ul tipo
		if (new_tipo) {
			close_all_children(new_tipo)
		}
	}
}//end close_all_children



// @license-end
