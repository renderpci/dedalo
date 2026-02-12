// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, DEDALO_CORE_URL, SHOW_DEBUG, SHOW_DEVELOPER */
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {
		clone
	} from '../../common/js/utils/index.js'



/**
 * RENDER_TREE
 * Main entry point for rendering the menu tree.
 * Initializes the data structures and sets up global event listeners.
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.self - The menu instance object
 * @param {Array} options.self.data.tree_datalist - The list of menu items from the server
 * @param {Array} options.self.li_nodes - Registry for all created LI elements
 * @param {Array} options.self.ul_nodes - Registry for all created UL elements
 * @param {HTMLElement} options.container - The root DOM element where the menu will be rendered
 * @param {string} options.tipo - The ID/tipo of the menu root
 * @return {boolean} Returns true on success
 */
export const render_tree = (options) => {

	// options
		const self		= options.self
		const container	= options.container
		const tipo		= options.tipo

	// datalist
		const data		= self.data || []
		const datalist	= data.tree_datalist || []

	// pre-process datalist for O(1) lookup
		const items_by_parent = new Map()
		datalist.forEach(item => {
			if (!items_by_parent.has(item.parent)) {
				items_by_parent.set(item.parent, [])
			}
			items_by_parent.get(item.parent).push(item)
		})
		self.items_by_parent = items_by_parent

	// render
		render_level_hierarchy({
			self			: self,
			datalist		: datalist,
			root_ul			: container,
			current_tipo	: tipo,
			parent_tipo		: tipo
		})

	// click . Manages global click action on the menu items
		const click_handler = (e) => {

			// first menu items only (when the UL is the main menu)

			// close all menu items when the menu change to inactive
			if (self.menu_active===true) {

				close_all_drop_menu(self);
				self.menu_active = false

			}else{
				// close_all_drop_menu(self);
				// get the main li nodes
				const main_li	= e.target.parentNode
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

				const nodes_li	= self.li_nodes
				const nodes_li_length	= nodes_li.length
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
		}
		container.addEventListener('click', click_handler)

	// mousedown. document. do global click action on the document body
		const mousedown_handler = (e) => {
			e.stopPropagation()
			// if the menu is inactive nothing to do
			if(self.menu_active===false) {
				return false
			}
			// if the user do click in other node than 'a' node, close all nodes, no other action to do
			if (e.target.tagName.toLowerCase()!=='a') {
				close_all_drop_menu(self)
			}
		}
		document.addEventListener('mousedown', mousedown_handler)

	// keydown. set the escape key to close al menu nodes
		const keydown_event = (e) => {
			if(self.menu_active===false) {
				return false
			}
			if (e.key==='Escape') {
				close_all_drop_menu(self);
			}
		}
		document.addEventListener('keydown', keydown_event)


	return true
}//end render_tree



/**
 * RENDER_LEVEL_HIERARCHY
 * Recursively renders a single level of the horizontal/vertical menu hierarchy.
 * Creates a UL container and populates it with LI items.
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.self - The menu instance object
 * @param {Array} options.datalist - The full list of menu items
 * @param {HTMLElement} options.root_ul - The root container (used for offset calculations)
 * @param {string} options.current_tipo - The ID/tipo of the parent item to render children for
 * @return {boolean} Returns true on success
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
		const root_areas		= self.items_by_parent.get(current_tipo) || []
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
 * Renders a single menu item (LI) and its associated link (A).
 * Sets up interaction events (hover, click) for navigation and submenu display.
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.self - The menu instance object
 * @param {Array} options.datalist - The full list of menu items
 * @param {HTMLElement} options.ul_container - The immediate UL parent for this item
 * @param {HTMLElement} options.root_ul - The menu root container of the level
 * @param {Object} options.item - The data object for this specific menu item
 * @param {string} options.current_tipo - The ID/tipo of the parent container
 * @return {HTMLElement} The created LI element
 */
const render_item_hierarchy = (options) => {

	// options
		const self			= options.self
		const datalist		= options.datalist
		const ul_container	= options.ul_container
		const root_ul		= options.root_ul
		const item			= options.item
		const current_tipo	= options.current_tipo

	// item label check
		if (!item.label) {
			console.error('item without label:', item);
			item.label = item.tipo || 'Unknown'
		}

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
			const mouseenter_handler = (e) => {

				if(self.menu_active===false) {
					return false
				}

				// get current node mouse is over (the li itself)
				const active_li = e.currentTarget
				// get immediate siblings inside ul
				const siblings	= Array.from(ul_container.children)

				siblings.forEach(node_li => {

					if (node_li === active_li) {
						// active the current li
						node_li.classList.add('menu_li_active')
						node_li.classList.remove('menu_li_inactive')

						// if the active li has children
						const open_id = node_li.dataset.children
						if(open_id) {

							//get the ul node and active it
							const open_ul = document.getElementById(open_id)
							if (open_ul) {
								open_ul.classList.remove('menu_ul_hidden')
								open_ul.classList.add('menu_ul_displayed')

								const active_rect = node_li.getBoundingClientRect()

								//first menu li nodes has parent 'dd1' and the position in the screen is calculated by the end of the parent li node
								if(node_li.parentNode.id === 'dd1'){

									open_ul.style.left = (active_rect.left - 1) + 'px'

								}else{
									const root_rect = root_ul.getBoundingClientRect()
									const top_position = Math.ceil(active_rect.top - root_rect.top)

									// the node is totally visible and don't need move to the top
									open_ul.style.top = top_position + 'px'

									// normal calculation for the hierarchy menus
									const ul_rect = open_ul.getBoundingClientRect()
									// get the bottom position of the ul and remove the height of the window
									const ul_bottom_dif = ul_rect.bottom - window.innerHeight
									// if the position is outside of the window (>0)
									if (ul_bottom_dif>0) {
										// get the top of the current li and remove the oversize outsize of the window
										const total_top		= top_position - ul_bottom_dif
										open_ul.style.top	= total_top + 'px'
									}
									// move the node to the right position of the selected li
									open_ul.style.left = active_rect.right + 'px'
								}
							}
						}
					} else {
						// inactive sibling nodes
						node_li.classList.add('menu_li_inactive')
						node_li.classList.remove('menu_li_active')

						// close all ul nodes dependent of this sibling li
						const close_id = node_li.dataset.children
						if (close_id) {
							close_all_children(close_id)
						}
					}
				})
			}
			li.addEventListener('mouseenter', mouseenter_handler)

		// mouseleave
			const mouseleave_handler = (e) => {
				if (e.clientY<0 || e.srcElement.id==='menu_wrapper') {
					close_all_drop_menu(self);
				}
			}
			li.addEventListener('mouseleave', mouseleave_handler)

		// remove the html <mark> sent by the server
		// when the label is not in the current language
		// and get the label with fallback
		// and replace it for italic style
			const is_fallback	= item.label.indexOf('<mark>')
			const text_fallback	= is_fallback === -1 ? '' : 'mark'
			const label_text	= item.label.replace(/(<([^>]+)>)/ig,"");

		// url
			const base_url	= window.location.pathname
			const url		= base_url + '?tipo=' + item.tipo + '&mode=list'

		// a element with the link to the area or section to go
			const link = ui.create_dom_element({
				element_type	: 'a',
				href			: url,
				class_name		: 'area_label ' + text_fallback,
				inner_html		: label_text,
				parent			: li
			})

		// click
		// when the user do click publish the tipo to go and set the mode in list
		// the action can be executed mainly in page, but it can be used for any instance.
			const click_handler = async (e) => {
				e.preventDefault()

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

				// api_errors case. On existing api_errors, force  to reload the page to refresh the page instance
					if (page_globals.api_errors?.length) {
						window.location.href = url
						return
					}

				if (e.altKey===true) {
					// open in new tab
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
						}
					})
				}
			}
			link.addEventListener('click', click_handler)

	// children_item. recursive generation of children nodes of the current li node.
		const has_children = self.items_by_parent.has(item.tipo)
		if (has_children) {

			li.classList.add ('has-sub')
			li.dataset.children	= item.tipo
			render_level_hierarchy({
				self			: self,
				datalist		: datalist,
				root_ul			: root_ul,
				current_tipo	: item.tipo,
				parent_tipo		: current_tipo
			})
		}//end has_children


	return li
}//end render_item_hierarchy



/**
 * CLOSE_ALL_DROP_MENU
 * Resets the entire menu tree to its inactive state.
 * Hides all UL containers and removes active classes from all LI nodes.
 *
 * @param {Object} self - The menu instance object
 * @param {Array} self.ul_nodes - Registry of all UL nodes to hide
 * @param {Array} self.li_nodes - Registry of all LI nodes to deactivate
 * @return {void}
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
 * Recursively hides all descendant submenus of a given menu item.
 *
 * @param {string} tipo - The ID/tipo of the parent whose children should be closed
 * @return {void}
 */
const close_all_children = function(tipo) {

	// get the children nodes of the sent tipo and add/remove the css
	const close_ul = document.getElementById(tipo)
		  close_ul.classList.remove('menu_ul_displayed');
		  close_ul.classList.add('menu_ul_hidden');

	// get the child nodes of the current ul
	const ar_children_nodes	= Array.from(close_ul.children)
	ar_children_nodes.forEach(child => {
		// get the children link node of the current li
		const new_tipo = child.dataset.children
		// recursive action of the current children ul tipo
		if (new_tipo) {
			close_all_children(new_tipo)
		}
	})
}//end close_all_children



// @license-end
