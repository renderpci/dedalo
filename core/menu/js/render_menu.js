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
			class_name		: 'section_label top_item unactive',
			parent			: fragment
		})
		let current_instance = null // expected section instance assignation when section render finish
		// click event
			section_label.addEventListener('click', async (e) => {
				e.stopPropagation()
				e.preventDefault()

				if (!current_instance) {
					return
				}

				// navigate browser from edit to list
				// Note that internal navigation (based on injected browser history) uses the stored local database
				// saved_rqo if exists. Page real navigation (reload page for instance) uses server side sessions to
				// preserve offset and order
				if (current_instance.mode==='edit') {

					// saved_sqo from local_db_data. On section paginate, local_db_data is saved. Recover saved sqo here to
					// go to list mode in the same position (offset) that the user saw
						const section_tipo	= current_instance.tipo
						const sqo_id		= ['section', section_tipo].join('_')
						const saved_sqo		= await data_manager.get_local_db_data(
							sqo_id,
							'sqo'
						)

					// sqo. Note that we are changing from edit to list mode and current offset it's not applicable
					// The list offset will be get from server session if exists
						const sqo = saved_sqo
							? saved_sqo.value
							: {
								filter	: current_instance.rqo.sqo.filter,
								order	: current_instance.rqo.sqo.order || null
							 }
						// always use section request_config_object format instead parsed sqo format
						sqo.section_tipo = current_instance.request_config_object.sqo.section_tipo

					// source
						const source = {
							action			: 'search',
							model			: current_instance.model, // section
							tipo			: current_instance.tipo,
							section_tipo	: current_instance.section_tipo,
							mode			: 'list',
							lang			: current_instance.lang
						 }

					// navigation
						const user_navigation_rqo = {
							caller_id	: self.id,
							source		: source,
							sqo			: sqo  // new sqo to use in list mode
						}
						event_manager.publish('user_navigation', user_navigation_rqo)
				}
				self.menu_active = false
			})
		// update value
			// subscription to the changes: if the section or area was changed,
			// observed DOM elements will be changed own value with the observable value
			self.events_tokens.push(
				event_manager.subscribe('render_instance', fn_update_section_label)
			)
			function fn_update_section_label(instance) {
				if((instance.type==='section' || instance.type==='area') && instance.mode!=='tm') {

					// search presets section case
						if (instance.tipo==='dd623') {
							return
						}

					section_label.classList.add('inactive')

					if (current_instance && instance.tipo===current_instance.tipo && current_instance.mode!=='edit') {
						// we are already on a list
						section_label.classList.remove('inactive')
					}else{
						// update section label
						// change the value of the current DOM element
						// section_label.innerHTML = instance.label
						// clean
						while (section_label.firstChild) {
							section_label.removeChild(section_label.firstChild)
						}
						section_label.insertAdjacentHTML('afterbegin', instance.label);
					}

					// update current instance
					current_instance = instance

					// toggle inspector view
					if (instance.mode==='edit') {
						toggle_inspector.classList.remove('hide')
					}else{
						toggle_inspector.classList.add('hide')
					}
				}
			}//end fn_update_section_label

	// inspector button toggle
		const toggle_inspector = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'button_toggle_inspector top_item',
			parent			: fragment
		})
		toggle_inspector.addEventListener("click", function(e) {
			ui.toggle_inspector(e)
		})

	// debug info bar
		if(SHOW_DEVELOPER===true) {
			fragment.appendChild( render_debug_info_bar(self) );
		}

	// menu_wrapper
		const menu_wrapper = document.createElement('div')
			  menu_wrapper.classList.add('menu_wrapper','menu')
			  menu_wrapper.appendChild(fragment)
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
