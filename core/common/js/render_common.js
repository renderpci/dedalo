// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_ROOT_WEB */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {data_manager} from '../../common/js/data_manager.js'



/**
* RENDER_COMPONENTS_LIST
* Create dom elements to generate list of components and section groups of current section
* @see this.get_section_elements_context
* @param object options
*	string options.section_tipo (section to load components and render)
*	DOM element options.target_div (Target dom element on new data will be added)
*	array path (Cumulative array of component path objects)
* @return array ar_components
*/
export const render_components_list = function(options) {
	// console.log("render_components_list options:", options);

	const ar_components = []

	// options
		const self					= options.self
		const section_tipo			= options.section_tipo
		const target_div			= options.target_div
		const path					= options.path
		const section_elements		= options.section_elements

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
			// class_name	: "search_section_container",
			class_name		: "list_container",
			parent			: target_div
		})

	// target_list_container
		const target_list_container = ui.create_dom_element({
			element_type	: 'ul',
			// class_name	: "search_section_container target_container",
			class_name		: "list_container target_list_container",
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
					class_name		: "section_bar_label",
					inner_html		: element.label || element.tipo,
					parent			: list_container
				})
				if (path.length===0) {
					section_bar.classList.add('close_hide')
				}
				section_bar.addEventListener('click', function(){
					if (target_div.classList.contains('target_list_container')) {
						target_div.innerHTML = ''
					}
				})
				break;
			}

			case element.model==='section_group' || element.model==='section_tab':
				// Section group container (ul)
				section_group = ui.create_dom_element({
					element_type : 'ul',
					parent 		 : list_container
				})
				// Section group label (li)
				ui.create_dom_element({
					element_type	: 'li',
					parent			: section_group,
					class_name		: 'section_group_label',
					inner_html		: element.label
				})
				break;

			default: {
				// Calculated path (from DOM position)
				const calculated_component_path = self.calculate_component_path( element, path )

				// const class_names	= 'search_component_label element_draggable'
				const class_names		= 'component_label element_draggable'
				const is_draggable		= true
				// if (element.model==="component_portal") {
				// 	// Autocompletes only
				// 	// Pointer to open "children" section (portals and autocompletes)
				// 	// Builds li element
				// 	class_names = "search_component_label element_draggable"
				// }else if (element.model==="component_portal"){
				// 	class_names = "search_component_label"
				// 	is_draggable 		= false
				// }

				const section_id = self.get_section_id() // defined by the caller, sometimes "tmp_seach_" sometimes "list_" etc

				// component node
					const component		= ui.create_dom_element({
						element_type	: 'li',
						parent			: section_group,
						class_name		: class_names,
						inner_html		: element.label,
						draggable		: is_draggable,
						data_set		: {
							path			: JSON.stringify(calculated_component_path),
							tipo			: element.tipo,
							section_tipo	: element.section_tipo,
							section_id		: section_id
						}
					})
					component.ddo	= element
					component.path	= calculated_component_path

				// drag events
					component.addEventListener('dragstart',function(e){self.on_dragstart(this,e)})
					//component.addEventListener('dragend',function(e){self.on_drag_end(this,e)})
					// component.addEventListener('drop',function(e){self.on_drop(this,e)})

				// add
					ar_components.push(component)

				// Portals and autocomplete only
				// Pointer to open "children" target section (portals and autocompletes)
				// Builds li element
					if (element.target_section_tipo){

						component.classList.add('has_subquery')

						const fn_click = async function(e) {
							// section_elements_context
								const current_section_elements = await self.get_section_elements_context({
									section_tipo			: target_section,
									ar_components_exclude	: null // use defaults from server
								})
							// recursion render_components_list
								render_components_list({
									self				: self,
									section_tipo		: target_section,
									target_div			: target_list_container,
									path				: calculated_component_path,
									section_elements	: current_section_elements
								})
							// Reset active in current wrap
								const ar_active_now	= await list_container.querySelectorAll('li.active')
								const len			= ar_active_now.length
								for (let i = len - 1; i >= 0; i--) {
									ar_active_now[i].classList.remove('active');
								}
							// Active current
							this.classList.add('active');
						}//end fn_click

						// Event on click load "children" section inside target_list_container recursively
						const target_section = element.target_section_tipo[0] // Select first only
						component.addEventListener('click', fn_click)
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
* RENDER_SERVER_RESPONSE_ERROR
* Render generic page error (Raspa background)
* @param array errors
* 	sample:
* 	[
* 		{
* 			msg : 'Invalid result',
* 			error : 'not_logged'
* 		}
* 	]
* @param add_wrapper = false
* @return HTMLElement wrapper|error_container
*/
export const render_server_response_error = function(errors, add_wrapper=false) {

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'wrapper page'
		})

	// error_container
		const error_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'page_error_container',
			parent			: wrapper
		})

	// icon_dedalo
		ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'icon_dedalo',
			src				: DEDALO_CORE_URL + '/themes/default/dedalo_logo.svg',
			parent			: error_container
		})

	// errors
		const errors_length = errors.length
		for (let i = 0; i < errors_length; i++) {

			const msg				= errors[i].msg
			const error				= errors[i].error
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
					// not_logged_error add once
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
							href			: DEDALO_ROOT_WEB,
							inner_html		: 'Home',
							parent			: error_container
						})
						link_home.addEventListener('click', function(e) {
							e.stopPropagation()
							// location.href = DEDALO_ROOT_WEB
						})
					break;
				}

				default: {
					// server_response_error h1
						if (msg) {
							ui.create_dom_element({
								element_type	: 'h1',
								class_name		: 'server_response_error',
								inner_html		: 'Server response msg: ',
								parent			: error_container
							})
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
						const link_home = ui.create_dom_element({
							element_type	: 'a',
							class_name		: 'link home',
							href			: DEDALO_ROOT_WEB,
							inner_html		: 'Home',
							parent			: error_container
						})
						link_home.addEventListener('click', function(e) {
							e.stopPropagation()
							// location.href = DEDALO_ROOT_WEB
						})
					// more_info
						ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'more_info',
							inner_html		: 'Received data format is not as expected. See your server log for details',
							parent			: error_container
						})

					// raspa_error add once
						if (!error_container.classList.contains('raspa_error')) {
							error_container.classList.add('raspa_error')
						}
					break;
				}
			}
		}


	// add_wrapper false  case
		if (add_wrapper===false) {
			return error_container
		}


	return wrapper
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
* }
* @return object response
* {
* 	process_status_node: HTMLElement (main node)
* 	update_stream: function (render sse_response chunk nodes)
* 	done: function (remove spinner)
* }
*/
export const render_stream = function(options) {

	// options
		const container		= options.container
		const id			= options.id
		const pid			= options.pid
		const pfile			= options.pfile
		const display_json	= options.display_json ?? (SHOW_DEBUG===true)

	// response
		const response = {}

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

	// update_stream function. loop from data_manager.read_stream
		const update_stream = (sse_response) => {
			console.log('sse_response:', typeof sse_response, sse_response);

			// sample sse_response
				// {
				// 		pid			: int pid,
				// 		pfile		: string pfile,
				// 		is_running	: bool is_running,
				// 		data		: JSON data,
				// 		errors		: array []
				// }

			while (info_node.firstChild) {
				info_node.removeChild(info_node.firstChild);
			}

			const is_running = sse_response?.is_running ?? true

			const msg = sse_response && sse_response.data && sse_response.data.msg
				? sse_response.data.msg
				// ? JSON.stringify(sse_response.data, null, 2)
				: is_running
					? 'Running process.. ' + pid
					: 'Process finished. ' + pid

			// const msg = JSON.stringify(sse_response, null, 2)

			const msg_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'msg',
				inner_html		: msg,
				parent			: info_node
			})

			if(display_json) {
				ui.create_dom_element({
					element_type	: 'pre',
					class_name		: 'display_json_box',
					inner_html		: JSON.stringify(sse_response, null, 2),
					parent			: info_node
				})
			}

			// running state check. If false, delete local DB reference
			if(is_running===false) {
				data_manager.delete_local_db_data(
					id, // like 'make_backup_process'
					'status' // string table
				)
				msg_node.classList.add('done')
				spinner.remove()
			}
		}
		// set node specific function
		response.update_stream = update_stream

	// done function
		const done = () => {
			spinner.remove()
		}
		response.done = done


	return response
}//end render_stream



// @license-end
