// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_ROOT_WEB */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {data_manager} from '../../common/js/data_manager.js'



/**
* RENDER_COMPONENTS_LIST
* Create DOM elements to generate list of components and section groups of current section
* @see this.get_section_elements_context
* @param object options
*	string options.section_tipo (section to load components and render)
*	DOM element options.target_div (Target DOM element on new data will be added)
*	array path (Cumulative array of component path objects)
* @return array ar_components
*/
export const render_components_list = function(options) {

	const ar_components = []

	// options
		const caller				= options.self // caller instance 'search' or 'tool_export'
		const section_tipo			= options.section_tipo
		const target_div			= options.target_div
		const path					= options.path
		const section_elements		= options.section_elements
		const ar_components_exclude = options.ar_components_exclude || null

	// clean target_div
		while (target_div.hasChildNodes()) {
			target_div.removeChild(target_div.lastChild);
		}

	// First item check
		if (!section_elements || typeof section_elements[0]==="undefined") {
			console.warn(`[render_components_list] Warning. Empty section_elements on get_section_elements_context ${section_tipo} Nothing to render`, section_elements);
			return []
		}

	// list_container
		const list_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'list_container',
			parent			: target_div
		})

	// target_list_container
		const target_list_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'list_container target_list_container',
			parent			: target_div
		})

	let section_group

	const len = section_elements.length
	for (let i = 0; i < len; i++) {
		const element = section_elements[i]

		switch (true) {

			case element.model==='section': {
				// section title bar
				const section_bar = ui.create_dom_element({
					element_type	: 'li',
					class_name		: 'section_bar_label',
					inner_html		: element.label || element.tipo,
					parent			: list_container
				})
				if (path.length===0) {
					section_bar.classList.add('close_hide')
				}
				// click event
				const handle_click = (e) => {
					e.stopPropagation()
					if (target_div.classList.contains('target_list_container')) {
						target_div.innerHTML = ''
					}
				}
				section_bar.addEventListener('click', handle_click)
				break;
			}

			case element.model==='section_group' || element.model==='section_tab':
				// Section group container (ul)
				section_group = ui.create_dom_element({
					element_type	: 'ul',
					class_name		: 'ul_regular',
					parent			: list_container
				})
				// Section group label (li)
				const section_group_label = ui.create_dom_element({
					element_type	: 'li',
					class_name		: 'section_group_label',
					inner_html		: element.label,
					parent			: section_group,
				})
				section_group_label.addEventListener('click', toggle_section_group_label_siblings)
				break;

			default: {
				// Calculated path (from DOM position)
				const calculated_component_path = caller.calculate_component_path( element, path )

				const class_names	= 'component_label element_draggable'
				const is_draggable	= true
				const section_id	= caller.get_section_id() // defined by the caller, sometimes "tmp_seach_" sometimes "list_" etc

				// component node
					const component	= ui.create_dom_element({
						element_type	: 'li',
						class_name		: class_names,
						inner_html		: element.label,
						draggable		: is_draggable,
						data_set		: {
							path			: JSON.stringify(calculated_component_path),
							tipo			: element.tipo,
							section_tipo	: element.section_tipo,
							section_id		: section_id
						},
						parent			: section_group
					})
					component.ddo	= element
					component.path	= calculated_component_path

				// drag events
					component.addEventListener('dragstart',function(e){caller.on_dragstart(this,e)})

				// add
					ar_components.push(component)

				// Portals and autocomplete only
				// Pointer to open "children" target section (portals and autocompletes)
				// Builds li element
					if (element.target_section_tipo){

						component.classList.add('has_subquery')

						const target_click_handler = async function(e) {
							e.stopPropagation()

							// loading
							target_list_container.classList.add('loading')

							// section_elements_context
								const current_section_elements = await caller.get_section_elements_context({
									section_tipo			: target_section,
									ar_components_exclude	: ar_components_exclude
								})

							// recursion render_components_list
								render_components_list({
									self				: caller,
									section_tipo		: target_section,
									target_div			: target_list_container,
									path				: calculated_component_path,
									section_elements	: current_section_elements
								})
							// Reset active in current wrap
								const ar_active_now	= list_container.querySelectorAll('li.active')
								const len			= ar_active_now.length
								for (let i = len - 1; i >= 0; i--) {
									ar_active_now[i].classList.remove('active');
								}
							// Active current
							this.classList.add('active');

							// loading
							target_list_container.classList.remove('loading')
						}//end target_click_handler

						// Event on click load "children" section inside target_list_container recursively
						const target_section = element.target_section_tipo[0] // Select first only
						component.addEventListener('click', target_click_handler)
					}
				break;
			}
		}//end switch (true)

	}//end for (let i = 0; i < len; i++)

	// Scroll window to top always
		window.scrollTo(0, 0);


	return ar_components
}//end render_components_list



/**
* TOGGLE_SECTION_GROUP_LABEL_SIBLINGS
* Toggle HTMLElemnt section_group_label style
* If 'closed', hide all sibling nodes, otherwise show them again.
* @param e event
* @return void
*/
const toggle_section_group_label_siblings = function (e) {
	e.stopPropagation()

	// clicked node
	const section_group_label = e.target

	// toggle style
	section_group_label.classList.toggle('closed')

	// sibling nodes
	const ar_sibling		= section_group_label.parentNode.childNodes
	const ar_sibling_length	= ar_sibling.length

	// toggle siblings
	const is_closed = section_group_label.classList.contains('closed')
	for (let i = 0; i < ar_sibling_length; i++) {
		const item = ar_sibling[i]
		if (item===section_group_label) {
			// ignore self node
			continue
		}
		if (is_closed) {
			item.classList.add('hide')
		}else{
			item.classList.remove('hide')
		}
	}
}//end toggle_section_group_label_siblings



/**
* RENDER_SERVER_RESPONSE_ERROR
* Render generic page error (Raspa background)
* @param array errors
* 	sample:
* 	[
* 		{
*			error : 'not_logged',
* 			msg : 'Invalid result',
* 			trace : 'page build',
* 		}
* 	]
* @return HTMLElement error_container
*/
export const render_server_response_error = function(errors) {

	// error_container
		const error_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'page_error_container'
		})

	// icon_dedalo
		const icon_url = '../themes/default/dedalo_logo.svg'
		ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'icon_dedalo',
			src				: icon_url,
			parent			: error_container
		})

	// short vars
		const home_url	= '../../core/page/'
		let added_header_node = false

	// errors
		const errors_length = errors.length
		for (let i = 0; i < errors_length; i++) {

			const error				= errors[i].error
			const trace				= errors[i].trace || ''
			const msg				= errors[i].msg
				? errors[i].msg   + '<br> (' + trace + ')'
				: 'Unknown error' + '<br> (' + trace + ')'

			const dedalo_last_error	= errors[i].dedalo_last_error || null

			switch (error) {

				case 'not_logged': {
					// server_response_error h1
						ui.create_dom_element({
							element_type	: 'h1',
							class_name		: 'server_response_error',
							inner_html		: msg,
							parent			: error_container
						})
					// link reload
						const link = ui.create_dom_element({
							element_type	: 'a',
							class_name		: 'link reload',
							inner_html		: 'Reload',
							parent			: error_container
						})
						link.addEventListener('click', function(e) {
							e.stopPropagation()
							location.reload()
						})
					// styles not_logged_error add once
						if (!error_container.classList.contains('not_logged_error')) {
							error_container.classList.add('not_logged_error')
						}
					break;
				}

				case 'invalid_page_element': {
					// server_response_error h1
						ui.create_dom_element({
							element_type	: 'h1',
							class_name		: 'server_response_error',
							inner_html		: msg,
							parent			: error_container
						})
					// link_home
						const link_home = ui.create_dom_element({
							element_type	: 'a',
							class_name		: 'link home',
							href			: home_url,
							inner_html		: 'Home',
							parent			: error_container
						})
						link_home.addEventListener('click', function(e) {
							e.stopPropagation()
						})
					// styles raspa_error add once
						if (!error_container.classList.contains('raspa_error')) {
							error_container.classList.add('raspa_error')
						}
					break;
				}

				case 'data_manager':
				default: {
					// server_response_error h1
						if (msg) {
							if (!added_header_node) {
								ui.create_dom_element({
									element_type	: 'h1',
									class_name		: 'server_response_error',
									inner_html		: 'Server response msg: ',
									parent			: error_container
								})
							}
							ui.create_dom_element({
								element_type	: 'h2',
								class_name		: 'server_response_error',
								inner_html		: msg,
								parent			: error_container
							})
						}
					// dedalo_last_error
						if (dedalo_last_error) {
							ui.create_dom_element({
								element_type	: 'h1',
								class_name		: 'server_response_error',
								inner_html		: 'Server error (last): ',
								parent			: error_container
							})
							ui.create_dom_element({
								element_type	: 'h2',
								class_name		: 'server_response_error',
								inner_html		: dedalo_last_error,
								parent			: error_container
							})
						}
					// link home
						if (!added_header_node) {
							const link_home = ui.create_dom_element({
								element_type	: 'a',
								class_name		: 'link home',
								href			: home_url,
								inner_html		: 'Home',
								parent			: error_container
							})
							link_home.addEventListener('click', function(e) {
								e.stopPropagation()
							})
						}
					// more_info
						if (!added_header_node) {
							ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'more_info',
								inner_html		: 'Received data format is not as expected. See your server log for details',
								parent			: error_container
							})
						}
					// styles raspa_error add once
						if (!error_container.classList.contains('raspa_error')) {
							error_container.classList.add('raspa_error')
						}

					added_header_node = true
					break;
				}
			}
		}


	return error_container
}//end render_server_response_error



/**
* RENDER_STREAM
* Render div with spinner and info about the given process status
* Note that some functions (update_stream, done) are returned to
* be fired by the stream reader in the corresponding events
* @param object options
* {
* 	container: HTMLElement (parent of current generated nodes)
* 	id: string (used to store DB local data status like 'process_make_backup')
* 	pid: int (process id number)
* 	pfile: string (name of process generated file)
* 	display_json: bool false (on true, add raw JSON view of data)
* 	delete_local_db_data: bool (on true, delete local DB process by id)
* }
* @return object response
* {
* 	process_status_node: HTMLElement (main node)
* 	update_info_node: function (render sse_response chunk nodes)
* 	done: function (remove spinner)
* }
*/
export const render_stream = function(options) {

	// options
		const container				= options.container
		const id					= options.id
		const pid					= options.pid
		const pfile					= options.pfile
		const display_json			= options.display_json ?? (SHOW_DEBUG===true)
		const delete_local_db_data	= options.delete_local_db_data ?? true

	// response. Object to fill and return
		const response = {
			process_status_node	: undefined,
			update_info_node	: undefined,
			done				: undefined
		}

	// clean container node
		while (container.firstChild) {
			container.removeChild(container.firstChild);
		}

	// process_status_node
		const process_status_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'process_status_node',
			parent			: container
		})
		// set specific node to response
		response.process_status_node = process_status_node

	// spinner
		const spinner = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'spinner',
			parent			: process_status_node
		})

	// info node
		const info_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_node',
			parent			: process_status_node
		})

	// button_stop_process
		const button_stop_process = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'gear button_stop_process',
			inner_html		: 'Stop',
			parent			: process_status_node
		})
		button_stop_process.addEventListener('click', function(e) {
			e.stopPropagation()
			data_manager.request({
				body : {
					dd_api		: 'dd_utils_api',
					action		: 'stop_process',
					options		: {
						pid	: pid
					}
				}
			})
			.then(function(response){
				if(SHOW_DEBUG===true) {
					console.log('stop_process API response:', response);
				}
				if (response.errors && response.errors.length) {
					alert("Errors: " + response.errors.join('<br>') );
				}
			})
		})

	// store local info about this process
		data_manager.set_local_db_data(
			{
				id		: id, // like 'process_make_backup',
				value	: {
					pid		: pid,
					pfile	: pfile
				}
			}, // mixed data
			'status' // string table
		)

	// update_info_node function. loop from data_manager.read_stream
		const update_info_node = (sse_response, callback) => {
			if(SHOW_DEBUG===true) {
				console.log('update_info_node sse_response:', typeof sse_response, sse_response);
			}

			// sample sse_response
				// {
				// 		pid			: int pid,
				// 		pfile		: string pfile,
				// 		is_running	: bool is_running,
				// 		data		: JSON data,
				// 		errors		: array []
				// }

			// process running status
				const is_running = sse_response?.is_running ?? true

			// data
				const data = sse_response?.data || {}

			// info node render
				if(typeof callback === 'function'){

					// callback option
					// Note that info_node is passed as a node
					// container where to place the new custom nodes
					callback(info_node)

				}else{

					// msg_node. Create once
					if (!info_node.msg_node) {
						info_node.msg_node = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'msg_node',
							parent			: info_node
						})
					}

					// msg
					if(is_running===true) {

						const msg = data.msg && data.msg.length>3
							? data.msg
							: 'Process running... please wait'

						ui.update_node_content(info_node.msg_node, msg)

						button_stop_process.classList.remove('hide')

					}else{

						// avoid freezing the last message in cases where
						// the process does not return anything at end

						const has_errors = Array.isArray(data.errors) && data.errors.length > 0;

						const msg_end = [
						  has_errors
							? `${get_label?.proceso || 'Process'} ${sse_response.total_time}`
							: `${get_label?.proceso_completado || 'Process completed'} ${sse_response.total_time}`
						];

						if (has_errors) {
						  const msg_error = data.errors.length === 1
							? `${get_label?.error || 'Error'}: ${data.errors[0] || ''}`
							: `${get_label?.errors || 'Errors'}:<br>${data.errors.join('<br>')}`;

						  msg_end.push(msg_error);
						  info_node.msg_node.classList.add('error');
						}

						ui.update_node_content(info_node.msg_node, msg_end.join('<br>'))

						button_stop_process.classList.add('hide')
					}
				}

			// debug display_json_box
				if(display_json) {
					// display_json_box. Create once
					if (!info_node.display_json_box) {
						info_node.display_json_box = ui.create_dom_element({
							element_type	: 'pre',
							class_name		: 'display_json_box',
							parent			: info_node
						})
					}
					ui.update_node_content(info_node.display_json_box, JSON.stringify(sse_response, null, 2))
				}

			// running state check. If false, delete local DB reference
				if(is_running===false) {
					spinner.remove()

					if(delete_local_db_data === true){
						data_manager.delete_local_db_data(
							id, // like 'make_backup_process'
							'status' // string table
						)
					}

					if (info_node.msg_node) {
						info_node.msg_node.classList.add('done')
					}
				}

		}
		// set specific function
		response.update_info_node = update_info_node

	// done function
		const done = () => {
			spinner.remove()
		}
		// set specific function
		response.done = done


	return response
}//end render_stream



/**
* RENDER_ERROR
* Creates the DOM nodes to display Dédalo standard errors
* @see component_relation_parent recursive errors
* @param array|object error
* @return HTMLElemenrt wrapper
*/
export const render_error = function (error) {

	const errors = (Array.isArray(error))
		? error
		: [error]

	const wrapper = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'wrapper_error error'
	})

	// title
	const title = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'wrapper_error_title',
		inner_html		: (get_label.erors_found || 'Errors found'),
		parent			: wrapper
	})
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'button icon exclamation',
		parent			: title
	})

	const errors_length = errors.length
	for (let i = 0; i < errors_length; i++) {

		const item = errors[i]

		const type	= item.type || 'Unknown type'
		const msg	= item.msg || 'Unknown msg'
		const info	= item.info || null

		const error_wrap = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'error_wrap',
			parent			: wrapper
		})

		// type
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'error_type',
			inner_html		: 'Type: ' + type,
			parent			: error_wrap
		})

		// msg
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'error_msg',
			inner_html		: msg,
			parent			: error_wrap
		})

		// error info
		if (info) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'error_info',
				inner_html		: JSON.stringify(info, null, 2),
				parent			: error_wrap
			})
		}
	}


	return wrapper
}//end render_error



/**
* RENDER_LANG_BEHAVIOR_CHECK
* Set the lang option checkbox when the component is translatable.
* It can change the language search behavior.
* lang option allow to set if the component will search in all langs or in current data lang.
* the default is search is set with all langs, checkbox in true.
* if the `q_lang has set with a language (instead 'all' or null),
* the search will be selective, only with the current data lang.
* 'all' and null values meaning the the search will be in all languages. see: class.search.php->get_sql_where()
* @param object self Component instance
* @return HTMLElement lang_behavior_check
* @see render_search_component_text_area, render_search_component_input_text
*/
export const render_lang_behavior_check = function (self) {

	// sqo saves the q_lang as all or not set
	// 'all' and null set the checkbox as true
	const q_lang_state = self.data.q_lang===null || self.data.q_lang==='all'
		? true // searching in all langs
		: false // searching in current data lang

	const title_on	= get_label.search_in_current_lang || 'Search in current lang'
	const title_off	= get_label.search_in_all_langs || 'Search in all langs'

	// div_switcher
	// by default the checkbox is set as true (without the class name off)
	const div_switcher = ui.create_dom_element({
		element_type	: 'label',
		class_name		: 'switcher_translatable text_unselectable',
		title			: title_off
	})
	// translatable option
	const lang_behavior_check = ui.create_dom_element({
		element_type	: 'input',
		type			: 'checkbox',
		class_name		: 'lang_behavior_check',
		parent			: div_switcher
	})
	// set the checkbox state
	lang_behavior_check.checked = q_lang_state
	if(!q_lang_state){
		div_switcher.classList.add('off')
		div_switcher.title = title_on
		self.data.q_lang = self.data.lang // searching in current data lang
	}
	// change event
	const change_handler = function(){
		if(lang_behavior_check.checked){
			div_switcher.classList.remove('off')

			// q_lang. Fix the data in the instance previous to save
			self.data.q_lang = null //all languages
			// publish search. Event to update the DOM elements of the instance
			event_manager.publish('change_search_element', self)

			div_switcher.title = title_off

		}else{
			div_switcher.classList.add('off')

			// q_lang. Fix the data in the instance previous to save
			self.data.q_lang = self.data.lang // search only in the current data lang
			// publish search. Event to update the DOM elements of the instance
			event_manager.publish('change_search_element', self)

			div_switcher.title = title_on
		}

		// reset tool tip
		ui.activate_tooltips(div_switcher, null, true)
	}
	lang_behavior_check.addEventListener('change', change_handler)

	// activate tool tip
	ui.activate_tooltips(div_switcher, null)


	return div_switcher
}//end render_lang_behavior_check



// @license-end
