// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, DEDALO_CORE_URL, SHOW_DEBUG, SHOW_DEVELOPER */
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {quit} from '../../login/js/login.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	import * as menu_tree from './render_menu_tree.js'
	// import * as menu_tree_mobile from './render_menu_tree_mobile.js'
	// import {clone} from '../../common/js/utils/index.js'
	// import {instances} from '../../common/js/instances.js'



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
		quit_button.addEventListener('click', async () => {
			// local_db_data remove in all langs
				const langs			= page_globals.dedalo_application_langs
				const langs_length	= langs.length
				for (let i = 0; i < langs_length; i++) {
					const lang	= langs[i].value
					const regex	= /lg-[a-z]{2,5}$/
					const id	= self.id.replace(regex, lang)
					await data_manager.delete_local_db_data(id, 'data')
				}
			// exec login quit sequence
				quit({
					caller : self
				})
		})

	// dedalo_icon
		const dedalo_icon = ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'dedalo_icon_top top_item',
			parent			: fragment
		})
		dedalo_icon.addEventListener('click', function(){
			window.open('https://dedalo.dev', 'Dédalo Site', []);
		})

	// menu_hierarchy. areas/sections hierarchy list
		const menu_hierarchy = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'menu_hierarchy top_item',
			parent			: fragment
		})
		// menu_tree render
		menu_tree.render_tree({
			self		: self,
			container	: menu_hierarchy,
			tipo		: 'dd1'
		})

	// ontology link
		if (self.data && self.data.show_ontology===true) {
			const ontology_link = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'ontology top_item',
				parent			: fragment,
				text_content	: 'Ontology'
			})
			ontology_link.addEventListener('click', () => {
				const url = DEDALO_CORE_URL + '/ontology'
				const win = window.open(url, '_blank');
					  win.focus();
			})
		}

	// user name link (open tool_user_admin)
		const logged_user_name = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'logged_user_name top_item',
			text_content	: username,
			parent			: fragment
		})
		if (username!=='root') {
			logged_user_name.addEventListener('click', (e) => {
				e.stopPropagation();

				// tool_user_admin Get the user_admin tool to be fired
				const tool_user_admin = self.context.tools.find(el => el.model==='tool_user_admin')
				if (!tool_user_admin) {
					console.error('Tool user admin is not available in tools:', self.context.tools);
					return
				}

				// open_tool (tool_common)
					open_tool({
						tool_context	: tool_user_admin,
						caller			: self
					})
			})
		}

	// application lang selector
		const lang_datalist = page_globals.dedalo_application_langs
		const dedalo_aplication_langs_selector = ui.build_select_lang({
			// id		: 'dd_app_lang',
			langs		: lang_datalist,
			action		: change_lang,
			selected	: page_globals.dedalo_application_lang,
			class_name	: 'reset_input dedalo_aplication_langs_selector top_item'
		})
		dedalo_aplication_langs_selector.title = get_label.interface || 'Interface'
		fragment.appendChild(dedalo_aplication_langs_selector)

	// data lang selector
		const lang_datalist_data = lang_datalist.map(item =>{
			return {
				label	: (get_label.data || 'data') + ': ' + item.label,
				value	: item.value
			}
		})
		const dedalo_data_langs_selector = ui.build_select_lang({
			// id		: 'dd_data_lang',
			langs		: lang_datalist_data,
			action		: change_lang,
			selected	: page_globals.dedalo_data_lang,
			class_name	: 'reset_input dedalo_aplication_langs_selector top_item'
		})
		fragment.appendChild(dedalo_data_langs_selector)

	// menu_spacer
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'menu_spacer top_item',
			parent			: fragment
		})

	// section label button (go to list)
		const section_label = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'section_label top_item inactive',
			parent			: fragment
		})
		section_label.addEventListener('click', fn_onclick)
		function fn_onclick(e) {
			e.stopPropagation()
			e.preventDefault();

			if (typeof section_label.on_click!=='function') {
				return
			}
			return section_label.on_click(e)
		}

	// inspector button toggle
		const toggle_inspector = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'button_toggle_inspector top_item hide',
			parent			: fragment
		})
		toggle_inspector.addEventListener('click', ui.toggle_inspector)

	// debug info bar
		if(SHOW_DEVELOPER===true) {
			fragment.appendChild( render_debug_info_bar(self) );
		}

	// menu_wrapper
		const menu_wrapper = document.createElement('div')
			  menu_wrapper.classList.add('menu_wrapper','menu')
			  menu_wrapper.appendChild(fragment)
			  menu_wrapper.section_label	= section_label
			  menu_wrapper.toggle_inspector	= toggle_inspector
		// menu left band
			switch (true) {
				case page_globals.is_root===true:
					menu_wrapper.classList.add('is_root')
					break;
				case page_globals.is_global_admin===true:
					menu_wrapper.classList.add('is_global_admin')
					break;
				default:
					// nothing to add
					break;
			}


	return menu_wrapper
}//end edit



/**
* RENDER_DEBUG_INFO_BAR
* @param object self
* @return HTMLElement debug_info_bar
*/
const render_debug_info_bar = (self) => {

	const debug_info_bar = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'debug_info_bar'
	})

	// dedalo_version
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dedalo_version',
			text_content	: 'Code v. ' + page_globals.dedalo_version,
			parent			: debug_info_bar
		})

	// dedalo_db_name
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dedalo_db_name',
			text_content	: 'DB: ' + page_globals.dedalo_db_name,
			parent			: debug_info_bar
		})

	// pg_version
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'pg_version',
			text_content	: 'PG v. ' + page_globals.pg_version,
			parent			: debug_info_bar
		})

	// php_version
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'php_version',
			text_content	: 'PHP v. ' + page_globals.php_version,
			parent			: debug_info_bar
		})

	// php_memory
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'php_memory',
			text_content	: 'memory: ' + page_globals.php_memory,
			parent			: debug_info_bar
		})
	// php_sapi_name
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'php_sapi_name',
			text_content	: 'sapi. ' + self.data.info_data.php_sapi_name,
			parent			: debug_info_bar
		})


	return debug_info_bar
}//end render_debug_info_bar



/**
* CHANGE_LANG
* Exec API request of selected lang (e.target.value)
* @param event e
* @return promise
* 	API request response
*/
const change_lang = async function(e) {
	e.stopPropagation()
	e.preventDefault()

	const current_lang = e.target.value

	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			action	: 'change_lang',
			dd_api	: 'dd_utils_api',
			options	: {
				dedalo_data_lang		: current_lang,
				dedalo_application_lang	: e.target.id==='dd_data_lang' ? null : current_lang
			}
		}
	})
	window.location.reload(false);

	//event_manager.publish('user_navigation', {lang: current_lang})

	return api_response
}//end change_lang



/**
* UPDATE_SECTION_LABEL
* Change the menu section label value
* Is called from section after rendering ends
* @param object options
* {
*  value : string as 'Oral History',
*  mode : string as 'edit',
*  on_click : callback function
* }
* @return bool
*/
render_menu.prototype.update_section_label = function(options) {

	const self = this

	// options
		const value		= options.value
		const mode		= options.mode
		const on_click	= options.on_click


	// check
		if (!self.node) {
			console.warn('Error: Invalid menu node.', self);
			return false
		}
		if (!self.node.section_label) {
			console.warn('Error: Invalid menu node section_label.', self.node.section_label);
			return false
		}

	// pointers get
		const section_label		= self.node.section_label
		const toggle_inspector	= self.node.toggle_inspector

	// set click event callback
		section_label.on_click = on_click

	// clean
		while (section_label.firstChild) {
			section_label.removeChild(section_label.firstChild)
		}

	// set value
		section_label.insertAdjacentHTML('afterbegin', value);

	// toggle inspector view
		if (mode==='edit') {
			// hide button inspector
			toggle_inspector.classList.remove('hide')
			// enable user click
			section_label.classList.remove('inactive')
		}else{
			// show button inspector
			toggle_inspector.classList.add('hide')
			// disable user click
			section_label.classList.add('inactive')
		}


	return true
}//end update_section_label



// @license-end
