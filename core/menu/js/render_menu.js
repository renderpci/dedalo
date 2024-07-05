// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, DEDALO_CORE_URL, SHOW_DEBUG, SHOW_DEVELOPER */
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	import * as menu_tree from './render_menu_tree.js'
	import * as menu_mobile from './render_menu_mobile.js'



/**
* RENDER_MENU
* Manages the component's logic and appearance in client side
*/
export const render_menu = function() {

	return true
}//end render_menu



/**
* EDIT
* Render node for use in edit
* @return HTMLElement wrapper
*/
render_menu.prototype.edit = async function() {

	const self = this

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
		quit_button.addEventListener('click', self.quit_handler.bind(self))

	// dedalo_icon
		const dedalo_icon = ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'dedalo_icon_top top_item',
			parent			: fragment
		})
		dedalo_icon.addEventListener('click', fn_click_open)
		function fn_click_open(e) {
			e.stopPropagation()
			window.open('https://dedalo.dev', 'Dédalo Site', []);
		}

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
			menu_mobile_icon.addEventListener('click', fn_menu_mobile_click)
			function fn_menu_mobile_click(e) {
				e.stopPropagation()

				if (!menu_mobile_wrapper) {
					menu_mobile_wrapper = menu_mobile.render_menu({
						self	: self,
						tipo	: 'dd1'
					})
					// insert after button_toggle_inspector
					button_toggle_inspector.parentNode.insertBefore(menu_mobile_wrapper, button_toggle_inspector.nextSibling);
					const fn_user_navigation = function(e) {
						if (!menu_mobile_wrapper.classList.contains('hide')) {
							menu_mobile_wrapper.classList.add('hide')
						}
					}
					event_manager.subscribe('user_navigation', fn_user_navigation)
				}else{
					menu_mobile_wrapper.classList.toggle('hide')
				}
			}//end fn_menu_mobile_click
			let menu_mobile_wrapper = null

	// ontology link
		if (self.data && self.data.show_ontology===true) {
			const ontology_link = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'ontology top_item',
				inner_html		: get_label.ontology || 'Ontology',
				parent			: fragment
			})
			// set pointers
			self.ontology_link = ontology_link
			ontology_link.addEventListener('click', self.open_ontology)
		}

	// user name link (open tool_user_admin)
		const logged_user_name = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'logged_user_name top_item',
			text_content	: username,
			parent			: fragment
		})
		if (username!=='root') {
			const fn_open_tool = function(e) {
				e.stopPropagation();

				// tool_user_admin Get the user_admin tool to be fired
				const tool_user_admin = self.context.tools.find(el => el.model==='tool_user_admin')
				if (!tool_user_admin) {
					console.log('Tool user admin is not available in tools:', self.context.tools);
				}

				// open_tool (tool_common)
					open_tool({
						tool_context	: tool_user_admin || 'tool_user_admin',
						caller			: self
					})
			}//end fn_open_tool
			logged_user_name.addEventListener('click', self.open_tool_user_admin_handler.bind(self))
		}

	// application lang selector
		const lang_datalist = page_globals.dedalo_application_langs
		const dedalo_aplication_langs_selector = ui.build_select_lang({
			langs		: lang_datalist,
			action		: function(e) {
				// executed on change event
				e.preventDefault()
				change_lang({
					lang_type	: 'dedalo_application_lang',
					lang_value	: this.value
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
				langs		: lang_datalist_data,
				action		: function(e) {
					// executed on change event
					e.preventDefault()
					change_lang({
						lang_type	: 'dedalo_data_lang',
						lang_value	: this.value
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
		button_toggle_inspector.addEventListener('click', ui.toggle_inspector)

	// debug info bar
		const debug_info_bar = (SHOW_DEVELOPER===true || SHOW_DEBUG===true)
			? render_debug_info_bar(self)
			: null
		if(debug_info_bar) {
			fragment.appendChild( debug_info_bar );
		}

	// menu_wrapper
		const menu_wrapper = document.createElement('div')
			  menu_wrapper.appendChild(fragment)
			  menu_wrapper.section_label = section_label
			  menu_wrapper.button_toggle_inspector = button_toggle_inspector
		// menu classes
			const classes = ['menu_wrapper','menu']
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
			menu_wrapper.classList.add(...classes)
		// events
			const observer = new ResizeObserver((entries) => {
				entries.forEach((entry) => {

					// debug_info_bar
					const debug_info_bar_height = debug_info_bar
						? debug_info_bar.getBoundingClientRect().height
						: 0

					// wrapper height current
					const wrapper_height = entry.contentRect.height

					// subtract debug_info_bar_height from wrapper height
					const limit = Math.floor(wrapper_height - debug_info_bar_height)

					if (limit > 50) {
						menu_wrapper.classList.add('wrapping')
						// fix width edge
						menu_wrapper.width_edge = entry.contentRect.width
					}else{
						if (menu_wrapper.width_edge && entry.contentRect.width > menu_wrapper.width_edge) {
							menu_wrapper.classList.remove('wrapping')
						}
					}
				});
			});
			observer.observe(menu_wrapper);


	return menu_wrapper
}//end edit



/**
* RENDER_DEBUG_INFO_BAR
* @param object self
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
* 		lang_type	: 'dedalo_data_lang',
*		lang_value	: 'lg-spa'
* 	}
* @return promise
* 	API request response
*/
const change_lang = async function(options) {

	// options
		const lang_type		= options.lang_type
		const lang_value	= options.lang_value

	// set page style as loading
		const main = document.getElementById('main')
		if (main) {
			main.classList.add('loading')
		}

	// api call
		const api_response = await data_manager.request({
			use_worker	: true,
			body		: {
				action	: 'change_lang',
				dd_api	: 'dd_utils_api',
				options	: {
					[lang_type] : lang_value
				}
			}
		})

	// reload window
		window.location.reload(false);


	return api_response
}//end change_lang



/**
* RENDER_SECTION_LABEL
* @param object self
* @return HTMLElement section_label
*/
const render_section_label = function(self) {

	const section_label = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'section_label top_item inactive',
		title			: get_label.seccion || 'Section'
	})

	return section_label
}//end render_section_label



/**
* UPDATE_SECTION_LABEL
* Change the menu section label value
* Is called from section when rendering is finished
* @param object options
* {
*  value : string as 'Oral History',
*  mode : string as 'edit',
*  section_label_on_click : callback function
* }
* @return bool
*/
render_menu.prototype.update_section_label = function(options) {

	const self = this

	// options
		const value						= options.value || ''
		const mode						= options.mode
		const section_label_on_click	= options.section_label_on_click

	// check availability
		const update_section_label_n_try = self.update_section_label_n_try ?? 0
		if (!self.node) {
			if (update_section_label_n_try>=3) {
				console.warn('Error: menu node is not available.', self);
				return
			}
			self.update_section_label_n_try++
			console.warn('Warning: menu node is not available yet. Trying again ', update_section_label_n_try);
			setTimeout(function(){
				self.update_section_label(options)
			}, 1000)
			return false
		}
		if (!self.node.section_label) {
			console.warn('Warning: Invalid menu node section_label.', self.node.section_label);
			return false
		}

	// reset self.update_section_label_n_try
		self.update_section_label_n_try = 0

	// pointers get
		const section_label		= self.node.section_label
		const button_toggle_inspector	= self.node.button_toggle_inspector

	// new_section_label
		const new_section_label = render_section_label(self)
		new_section_label.insertAdjacentHTML('afterbegin', value);
		section_label.replaceWith(new_section_label);
		// re-set pointers
		self.node.section_label = new_section_label

	// toggle inspector view
		if (mode==='edit') {
			if (typeof section_label_on_click==='function') {
				new_section_label.addEventListener('mousedown', section_label_on_click)
			}
			// hide button inspector
			button_toggle_inspector.classList.remove('no_visible')
			// enable section_label user click
			new_section_label.classList.remove('inactive')
		}else{
			// show button inspector
			button_toggle_inspector.classList.add('no_visible')
			// disable section_label user click
			new_section_label.classList.add('inactive')
		}


	return true
}//end update_section_label



// @license-end
