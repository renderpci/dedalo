// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, DEDALO_CORE_URL, SHOW_DEBUG, SHOW_DEVELOPER */
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {when_in_viewport} from '../../common/js/events.js'
	import {login} from '../../login/js/login.js'
	import {render_section_label} from './render_menu.js'
	import * as menu_tree from './render_menu_tree.js'
	import * as menu_mobile from './render_menu_mobile.js'



/**
* VIEW_DEFAULT_EDIT_MENU
* Manages the component's logic and appearance in client side
*/
export const view_default_edit_menu = function() {

	return true
}//end view_default_edit_menu



/**
* RENDER
* Render node for use in current view
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_default_edit_menu.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type : 'div'
		})
		const classes = ['menu_wrapper','menu']
		if (page_globals && page_globals.dedalo_entity) {
			classes.push(page_globals.dedalo_entity)
		}
		// menu left band
		switch (true) {
			case page_globals.is_root===true:
				classes.push('is_root')
				break;
			case page_globals.is_global_admin===true:
				classes.push('is_global_admin')
				break;
			default:
				// nothing to add
				break;
		}
		wrapper.classList.add(...classes)
		// append content_data
		wrapper.appendChild(content_data)
		// set pointers
		wrapper.content_data = content_data

	// events
		// adjust_size. Adapt vertical size based on window width resizing
		const resize_observer = new ResizeObserver((entries) => {
			entries.forEach((entry) => {
				const debug_info_bar = content_data.debug_info_bar
				// debug_info_bar
				const debug_info_bar_height = debug_info_bar
					? debug_info_bar.getBoundingClientRect().height
					: 0

				// wrapper height current
				const wrapper_height = entry.contentRect.height

				// subtract debug_info_bar_height from wrapper height
				const limit = Math.floor(wrapper_height - debug_info_bar_height)

				const adjust_size = () => {
					if (limit > 50) {
						wrapper.classList.add('wrapping')
						// fix width edge
						wrapper.width_edge = entry.contentRect.width
					}else{
						if (wrapper.width_edge && entry.contentRect.width > wrapper.width_edge) {
							wrapper.classList.remove('wrapping')
						}
					}
				}
				requestAnimationFrame(adjust_size)
			});
		});
		// adjust inspector_container top position. Set pinned class on menu sticky pin
		const intersection_observer = new IntersectionObserver(
			([e]) => {
				const pinned = e.intersectionRatio < 1

				// toggle menu class 'is_pinned'
				e.target.classList.toggle('is_pinned', pinned)

				// move up inspector on pinned
				const inspector_container = document.getElementById('inspector_container')
				if (inspector_container) {
					const top = wrapper.getBoundingClientRect().bottom;
					if (pinned) {
						inspector_container.style.top = (top + 13) + 'px'
					}else{
						inspector_container.style.removeProperty('top');
					}
				}
			},
			{ threshold: [1] }
		);

		// fire events when_in_viewport
		when_in_viewport(wrapper, () => {
			resize_observer.observe(wrapper);
			intersection_observer.observe(wrapper);
			// update class from version
			wrapper.classList.add('v'+page_globals.dedalo_version.replaceAll('.','_'))
		})


	return wrapper
}//end render



/**
* GET_CONTENT_DATA_EDIT
* Render node for use in edit
* @param object self
*  instance of menu
* @return HTMLElement wrapper
*/
const get_content_data_edit = function(self) {

	// menu_active. set the first state of the menu
		self.menu_active = false

	// username
		const username = self.data.username

	// DocumentFragment
		const fragment = new DocumentFragment()

	// quit_button
		const quit_button = ui.create_dom_element({
			element_type	: 'div',
			id				: 'quit',
			class_name		: 'quit top_item',
			parent			: fragment
		})
		const click_handler = (e) => {
			e.stopPropagation()
			// login quit
			login.quit({
				caller : self
			})
		}
		quit_button.addEventListener('click', click_handler)

	// dedalo_icon
		const dedalo_icon = ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'dedalo_icon_top top_item',
			parent			: fragment
		})
		// click event
		const click_open_handler = (e) => {
			e.stopPropagation()
			window.open('https://dedalo.dev', 'Dédalo Site', []);
		}
		dedalo_icon.addEventListener('click', click_open_handler)

	// menu_hierarchy. areas/sections hierarchy list
		// menu tree (desktop)
			const menu_hierarchy = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'menu_hierarchy top_item',
				parent			: fragment
			})
			// menu_tree render
			menu_tree.render_tree({
				self		: self,
				tipo		: 'dd1',
				container	: menu_hierarchy
			})

		// mobile only
			const menu_mobile_icon = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'menu_mobile_icon top_item',
				parent			: fragment
			})
			// click event
			const menu_mobile_click_handler = (e) => {
				e.stopPropagation()

				if (!menu_mobile_wrapper) {
					menu_mobile_wrapper = menu_mobile.render_menu({
						self	: self,
						tipo	: 'dd1'
					})
					// insert after button_toggle_inspector
					button_toggle_inspector.parentNode.insertBefore(menu_mobile_wrapper, button_toggle_inspector.nextSibling);
					const user_navigation_handler = (e) => {
						if (!menu_mobile_wrapper.classList.contains('hide')) {
							menu_mobile_wrapper.classList.add('hide')
						}
					}
					self.events_tokens.push(
						event_manager.subscribe('user_navigation', user_navigation_handler)
					)
				}else{
					menu_mobile_wrapper.classList.toggle('hide')
				}
			}
			menu_mobile_icon.addEventListener('click', menu_mobile_click_handler)
			let menu_mobile_wrapper = null

	// ontology link
		// if (self.data && self.data.show_ontology===true) {
		// 	const ontology_link = ui.create_dom_element({
		// 		element_type	: 'div',
		// 		class_name		: 'ontology top_item',
		// 		inner_html		: get_label.ontology || 'Ontology',
		// 		parent			: fragment
		// 	})
		// 	// set pointers
		// 	self.ontology_link = ontology_link
		// 	ontology_link.addEventListener('click', self.open_ontology)
		// }

	// user name link (open tool_user_admin)
		const logged_user_name = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'logged_user_name top_item',
			text_content	: username,
			parent			: fragment
		})
		if (username==='root') {
			logged_user_name.classList.add('is_root','noevents')
		}else{
			// click event
			const click_handler = function(e) {
				e.stopPropagation();
				self.open_tool_user_admin_handler()
			}//end fn_open_tool
			logged_user_name.addEventListener('click', click_handler)
		}

	// application lang selector
		const lang_datalist = page_globals.dedalo_application_langs
		const dedalo_aplication_langs_selector = ui.build_select_lang({
			name	: 'dedalo_application_langs',
			langs	: lang_datalist,
			action	: function(e) {
				// executed on change event
				e.preventDefault()
				change_lang({
					lang_type	: 'dedalo_application_lang',
					lang_value	: this.value,
					self		: self
				})
			},
			selected	: page_globals.dedalo_application_lang,
			class_name	: 'reset_input dedalo_aplication_langs_selector top_item'
		})
		dedalo_aplication_langs_selector.title = get_label.interface || 'Interface'
		fragment.appendChild(dedalo_aplication_langs_selector)

	// data lang selector
		const show_data_lang_selector = page_globals.dedalo_data_lang_selector ?? false
		if (show_data_lang_selector) {
			const lang_datalist_data = lang_datalist.map(item =>{
				return {
					label	: (get_label.data || 'data') + ': ' + item.label,
					value	: item.value
				}
			})
			const dedalo_data_langs_selector = ui.build_select_lang({
				name	: 'dedalo_data_lang',
				langs	: lang_datalist_data,
				action	: function(e) {
					// executed on change event
					e.preventDefault()
					change_lang({
						lang_type	: 'dedalo_data_lang',
						lang_value	: this.value,
						self		: self
					})
				},
				selected	: page_globals.dedalo_data_lang,
				class_name	: 'reset_input dedalo_aplication_langs_selector data top_item'
			})
			fragment.appendChild(dedalo_data_langs_selector)
		}

	// menu_spacer
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'menu_spacer top_item',
			parent			: fragment
		})

	// section label button (go to list)
		const section_label = render_section_label(self)
		fragment.appendChild(section_label)

	// inspector button toggle
		const button_toggle_inspector = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'button_toggle_inspector top_item no_visible',
			title			: get_label.inspector || 'Inspector',
			parent			: fragment
		})
		// click event
		const toggle_inspector_handler = (e) => {
			e.stopPropagation()
			ui.toggle_inspector()
		}
		button_toggle_inspector.addEventListener('click', toggle_inspector_handler)

	// debug info bar
		const debug_info_bar = (SHOW_DEVELOPER===true || SHOW_DEBUG===true)
			? render_debug_info_bar(self)
			: null
		if(debug_info_bar) {
			fragment.appendChild( debug_info_bar );
		}

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data'
		})
		content_data.appendChild(fragment)
		// set pointers
		content_data.debug_info_bar				= debug_info_bar
		content_data.section_label				= section_label
		content_data.button_toggle_inspector	= button_toggle_inspector


	return content_data
}//end get_content_data_edit



/**
* RENDER_DEBUG_INFO_BAR
* Must to be rendered only for developers (SHOW_DEVELOPER===true || SHOW_DEBUG===true)
* @param object self
* 	menu instance
* @return HTMLElement debug_info_bar
*/
const render_debug_info_bar = (self) => {

	// short vars
		const info_data			= self.data.info_data || {}
		const dedalo_version	= info_data.dedalo_version || page_globals.dedalo_version
		const dedalo_build		= info_data.dedalo_build || page_globals.dedalo_build
		const dedalo_db_name	= info_data.dedalo_db_name || page_globals.dedalo_db_name
		const pg_version		= info_data.pg_version || page_globals.pg_version
		const php_version		= info_data.php_version || page_globals.php_version
		const php_memory		= info_data.php_memory || page_globals.php_memory
		const php_sapi_name		= info_data.php_sapi_name || page_globals.php_sapi_name
		const ip_server			= info_data.ip_server

	// debug_info_bar
		const debug_info_bar = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'debug_info_bar'
		})

	// dedalo_version
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dedalo_version',
			text_content	: 'Code v. ' + dedalo_version + ' ' + dedalo_build,
			parent			: debug_info_bar
		})

	// dedalo_db_name
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dedalo_db_name',
			text_content	: 'DB: ' + dedalo_db_name,
			parent			: debug_info_bar
		})

	// pg_version
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'pg_version',
			text_content	: 'PG v. ' + pg_version,
			parent			: debug_info_bar
		})

	// php_version
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'php_version',
			text_content	: 'PHP v. ' + php_version,
			parent			: debug_info_bar
		})

	// php_memory
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'php_memory',
			text_content	: 'memory: ' + php_memory,
			parent			: debug_info_bar
		})

	// php_sapi_name
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'php_sapi_name',
			text_content	: 'sapi. ' + php_sapi_name,
			parent			: debug_info_bar
		})

	// dedalo_entity
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dedalo_entity',
			text_content	: page_globals.dedalo_entity,
			parent			: debug_info_bar
		})

	// dedalo_entity_id
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dedalo_entity_id',
			text_content	: page_globals.dedalo_entity_id + '',
			parent			: debug_info_bar
		})

	// service_worker_active
		if ('serviceWorker' in navigator) {
			const service_worker_active = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'service_worker_active hide',
				parent			: debug_info_bar
			})
			try {
				navigator.serviceWorker.getRegistrations().then(registrations => {
					const script_url = registrations[0]?.active?.scriptURL
					if (script_url) {
						service_worker_active.classList.remove('hide')
						service_worker_active.title = 'Service worker is active at ' + script_url
					}else{
						service_worker_active.remove()
					}
				});
			} catch (error) {
				console.error(error)
			}
		}

	// environment
		const environment_link = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'environment',
			title			: 'Environment',
			parent			: debug_info_bar
		})
		// click event
		const environment_click_handler = (e) => {
			e.stopPropagation()
			window.open(
				DEDALO_ROOT_WEB + '/core/common/js/environment.js.php',
				'Environment',
				null
			)
		}
		environment_link.addEventListener('click', environment_click_handler)

	// ip_server
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'ip_server',
			text_content	: ip_server,
			parent			: debug_info_bar
		})


	return debug_info_bar
}//end render_debug_info_bar



/**
* CHANGE_LANG
* Exec API request of selected lang (e.target.value)
* @param object options
* 	{
* 		lang_type : 'dedalo_data_lang',
*		lang_value : 'lg-spa',
* 		self : object (menu instance)
* 	}
* @return bool
*/
const change_lang = async function(options) {

	// options
		const lang_type		= options.lang_type
		const lang_value	= options.lang_value
		const self			= options.self

	// set page style as loading
		const main = document.getElementById('main')
		if (main) {
			main.classList.add('loading')
		}

	// api call
		await self.change_lang({
			lang_type,
			lang_value
		})

	// reload window after the change
		window.location.reload(false);


	return true
}//end change_lang



// @license-end
