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
	import {data_manager} from '../../common/js/data_manager.js'
	import {toggle_theme} from '../../page/js/theme.js'

// sync standalone assistant top/height with actual menu wrapper size (accounts for debug_info_bar)
	const sync_standalone_position = (ac) => {
		const menu_wrapper = document.querySelector('.menu_wrapper')
		const menu_h = menu_wrapper ? menu_wrapper.offsetHeight : 0
		if (menu_h > 0) {
			ac.style.top = menu_h + 'px'
			ac.style.height = 'calc(100vh - ' + menu_h + 'px)'
			ac.style.maxHeight = 'calc(100vh - ' + menu_h + 'px)'
		}
	}

// module-level assistant re-parenting on navigation (persists across menu re-renders)
	let _assistant_nav_subscribed = false
	if (!_assistant_nav_subscribed) {
		_assistant_nav_subscribed = true
		event_manager.subscribe('user_navigation', () => {
			const ac = document.querySelector('.assistant_container.show')
			if (!ac) return
			const try_reparent = (attempts = 0) => {
				if (attempts > 30) return // max ~3s
				const ic = document.getElementById('inspector_container')
				const is_standalone = !ic
				const desired_parent = ic || document.body
				ac.classList.toggle('standalone', is_standalone)
				if (is_standalone) {
					sync_standalone_position(ac)
				} else {
					ac.style.top = ''
					ac.style.height = ''
					ac.style.maxHeight = ''
					ic.classList.add('has_assistant')
				}
				if (!ac.parentNode || !ac.parentNode.isConnected || ac.parentNode !== desired_parent) {
					desired_parent.appendChild(ac)
				}
				// always retry a few times — DOM may not be ready yet on first attempts
				if (attempts < 10) {
					setTimeout(() => try_reparent(attempts + 1), 150)
				}
			}
			setTimeout(() => try_reparent(), 50)
		})
	}



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

	// debug info bar
		const debug_info_bar = ((typeof SHOW_DEVELOPER !== 'undefined' && SHOW_DEVELOPER===true) || (typeof SHOW_DEBUG !== 'undefined' && SHOW_DEBUG===true))
			? render_debug_info_bar(self)
			: null
		if(debug_info_bar) {
			wrapper.appendChild( debug_info_bar );
		}

	// events
		// compact toggle. Detect content_data overflow to switch between
		// desktop menu_hierarchy and mobile menu_mobile_icon
		const resize_observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const height = entry.contentRect.height;
				const win_width = window.innerWidth;
				if (height > 50) {
					content_data.classList.add('compact');
					content_data._compact_edge = win_width;
				} else if (content_data._compact_edge && win_width > content_data._compact_edge) {
					content_data.classList.remove('compact');
				}
			}
		});

		// fire events when_in_viewport
		when_in_viewport(wrapper, () => {
			resize_observer.observe(content_data);
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
		self.events_tokens ??= []

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
		quit_button.tabIndex = 0
		quit_button.setAttribute('role', 'button')
		const quit_click_handler = (e) => {
			e.stopPropagation()
			// login quit
			login.quit({
				caller : self
			})
		}
		quit_button.addEventListener('click', quit_click_handler)
		quit_button.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') quit_click_handler(e) })

	// dedalo_icon
		const dedalo_icon = ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'dedalo_icon_top top_item',
			parent			: fragment
		})
		dedalo_icon.tabIndex = 0
		dedalo_icon.setAttribute('role', 'button')
		// click event
		const dedalo_icon_click_handler = (e) => {
			e.stopPropagation()
			window.open('https://dedalo.dev', 'Dédalo Site', []);
		}
		dedalo_icon.addEventListener('click', dedalo_icon_click_handler)
		dedalo_icon.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') dedalo_icon_click_handler(e) })

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
			menu_mobile_icon.tabIndex = 0
			menu_mobile_icon.setAttribute('role', 'button')

			let menu_mobile_wrapper = null
			// click event
			const menu_mobile_click_handler = (e) => {
				e.stopPropagation()

				if (!menu_mobile_wrapper) {
					menu_mobile_wrapper = menu_mobile.render_menu({
						self	: self,
						tipo	: 'dd1'
					})
					// insert after section_label_container
					if (section_label_container && section_label_container.parentNode) {
						section_label_container.parentNode.insertBefore(menu_mobile_wrapper, section_label_container.nextSibling);
					}
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
			menu_mobile_icon.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') menu_mobile_click_handler(e) })

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
			logged_user_name.tabIndex = 0
			logged_user_name.setAttribute('role', 'button')
			// click event
			const tool_user_admin_click_handler = function(e) {
				e.stopPropagation();
				self.open_tool_user_admin_handler()
			}//end fn_open_tool
			logged_user_name.addEventListener('click', tool_user_admin_click_handler)
			logged_user_name.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') tool_user_admin_click_handler(e) })
		}

	// application lang selector
		const lang_datalist = page_globals.dedalo_application_langs || []
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

	// theme toggle
		const theme_toggle = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'theme_toggle top_item',
			title			: get_label.theme_toggle || 'Toggle dark mode',
			parent			: fragment
		})
		theme_toggle.tabIndex = 0
		theme_toggle.setAttribute('role', 'button')
		theme_toggle.addEventListener('click', () => { toggle_theme() })
		theme_toggle.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') toggle_theme() })

	// ai_assistant button
		const ai_assistant_button = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'ai_assistant_button top_item',
			title			: get_label.ai_assistant || 'AI Assistant',
			parent			: fragment
		})
		ai_assistant_button.tabIndex = 0
		ai_assistant_button.setAttribute('role', 'button')
		// prevent mousedown from propagating to document so the active component is not deactivated
		ai_assistant_button.addEventListener('mousedown', (e) => {
			e.stopPropagation()
		})
		// assistant panel state (persists across section navigations)
			let assistant_instance	= null
			let assistant_container	= null
			let assistant_visible	= false
		const ai_assistant_click_handler = async (e) => {
			e.stopPropagation()
			try {
				// find the current inspector_container in the page (edit mode)
					const inspector_container = document.getElementById('inspector_container')
					const is_standalone = !inspector_container
				// toggle off: hide the panel
					if (assistant_visible) {
						if (assistant_container) assistant_container.classList.remove('show')
						if (inspector_container) inspector_container.classList.remove('has_assistant')
						ai_assistant_button.classList.remove('active')
						assistant_visible = false
						return
					}
				// first time: create the panel and init the assistant
					if (!assistant_container) {
						// check user has permission to use the tool
							const api_response = await data_manager.request({
								body : {
									action	: 'user_tools',
									dd_api	: 'dd_tools_api',
									options	: {
										ar_requested_tools : ['tool_assistant']
									}
								}
							})
							if (!api_response.result || !Array.isArray(api_response.result)) return
							const tool_context = api_response.result.find(t => t.name === 'tool_assistant')
							if (!tool_context) return

						// build the tool instance to get assistant_config
							const { get_instance } = await import('../../common/js/instances.js')
							const instance_options = Object.assign({ caller : self }, tool_context)
							const tool_instance = await get_instance(instance_options)
							await tool_instance.build(true)

						// create assistant_container
						// in edit mode: inside inspector_container; in list mode: standalone fixed panel
							const container_parent = inspector_container || document.body
							const container_class = is_standalone
								? 'assistant_container standalone'
								: 'assistant_container'
							assistant_container = ui.create_dom_element({
								element_type	: 'div',
								class_name		: container_class,
								parent			: container_parent
							})
						// prevent mousedown from propagating to document so the active component is not deactivated
							assistant_container.addEventListener('mousedown', (e) => {
								e.stopPropagation()
							})

						// init ai_assistant and build chat UI
							const { ai_assistant } = await import('../../../tools/tool_assistant/js/ai_assistant.js')
							assistant_instance = new ai_assistant({
								tool_config	: tool_instance.assistant_config || {},
								tool_self	: tool_instance
							})
							const chat_ui = await assistant_instance.build_chat_ui()
							assistant_container.appendChild(chat_ui)
					}
				// re-attach / re-parent the container if needed
				// (section navigation recreates inspector_container, or mode changed list↔edit)
					const desired_parent = inspector_container || document.body
					const needs_move = !assistant_container.parentNode
						|| !assistant_container.parentNode.isConnected
						|| assistant_container.parentNode !== desired_parent
					if (needs_move) {
						desired_parent.appendChild(assistant_container)
					}
					// update standalone class to match current mode
					assistant_container.classList.toggle('standalone', is_standalone)
				// sync top/height with actual menu height (debug_info_bar makes it taller)
					if (is_standalone) {
						sync_standalone_position(assistant_container)
					} else {
						assistant_container.style.top = ''
						assistant_container.style.height = ''
						assistant_container.style.maxHeight = ''
					}
				// show the panel
					assistant_container.classList.add('show')
					if (inspector_container) inspector_container.classList.add('has_assistant')
					ai_assistant_button.classList.add('active')
					assistant_visible = true
			} catch (err) {
				console.error('[ai_assistant_click_handler]', err)
			}
		}
		ai_assistant_button.addEventListener('click', ai_assistant_click_handler)
		ai_assistant_button.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') ai_assistant_click_handler(e) })

	// section label container
		const section_label_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'section_label_container top_item',
			parent			: fragment
		})

	// section label button (go to list)
		const section_label = render_section_label(self)
		section_label_container.appendChild(section_label)

	// inspector button toggle
		const button_toggle_inspector = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'button_toggle_inspector top_item no_visible',
			title			: get_label.inspector || 'Inspector',
			parent			: section_label_container
		})
		button_toggle_inspector.tabIndex = 0
		button_toggle_inspector.setAttribute('role', 'button')
		// click event
		const toggle_inspector_click_handler = (e) => {
			e.stopPropagation()
			ui.toggle_inspector()
		}
		button_toggle_inspector.addEventListener('click', toggle_inspector_click_handler)
		button_toggle_inspector.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') toggle_inspector_click_handler(e) })

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data'
		})
		content_data.appendChild(fragment)
		// set pointers
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
		const version_style = dedalo_version.indexOf('7.0')!==-1
			? ' beta'
			: ''
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dedalo_version' + version_style,
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

	// Worker
		if(typeof DEDALO_RR_WORKER !== 'undefined' && DEDALO_RR_WORKER===true) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'rr_worker',
				title			: 'RR Worker',
				text_content	: 'RR',
				parent			: debug_info_bar
			})
		}

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
