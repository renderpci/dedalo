// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_diffusion */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../core/common/js/ui.js'
	import {object_to_url_vars, time_unit_auto, open_window} from '../../../core/common/js/utils/index.js'
	import {render_stream} from '../../../core/common/js/render_common.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {when_in_viewport} from '../../../core/common/js/events.js'



/**
* RENDER_TOOL_DIFFUSION
* Manages the component's logic and appearance in client side
*/
export const render_tool_diffusion = function() {

	return true
}//end render_tool_diffusion



/**
* EDIT
* Render tool DOM nodes
* This function is called by render common attached in 'tool_diffusion.js'
* @param object options
* @return HTMLElement wrapper
*/
render_tool_diffusion.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns a standard built tool wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Render tool body or 'content_data'
* @param instance self
* @return HTMLElement content_data
*/
const get_content_data = async function(self) {

	const fragment = new DocumentFragment()

	// short vars
		const diffusion_info = self.diffusion_info


	// bun_status
		const bun_status = self.bun_status || {}
		const bun_status_class = bun_status.result === true ? 'bun_status ready' : 'bun_status fail'
		const bun_status_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: bun_status_class,
			parent			: fragment
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'label',
			text_content	: get_label.bun_engine || 'Bun engine',
			parent			: bun_status_node
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			text_content	: bun_status.msg || (bun_status.result === true ? 'Ready' : 'Unavailable'),
			parent			: bun_status_node
		})

	// pending_deletions
		// Deletions that could not reach one or more diffusion targets when the
		// record was deleted in the work system (Bun/target down). Loaded async;
		// shows a retry button when pending rows exist.
		const pending_deletions_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'pending_deletions hide',
			parent			: fragment
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'label',
			text_content	: self.get_tool_label('pending_deletions') || 'Pending deletions',
			parent			: pending_deletions_node
		})
		const pending_deletions_value = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			parent			: pending_deletions_node
		})
		const pending_deletions_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'retry_pending_deletions light',
			text_content	: self.get_tool_label('retry') || 'Retry',
			parent			: pending_deletions_node
		})
		const refresh_pending_deletions = function() {
			self.retry_pending_deletions({count_only: true})
			.then(function(response){
				const pending = response.result?.pending ?? 0
				if (pending > 0) {
					pending_deletions_value.textContent = pending
					pending_deletions_node.classList.remove('hide')
				}else{
					pending_deletions_node.classList.add('hide')
				}
			})
		}
		pending_deletions_button.addEventListener('click', function(e) {
			e.preventDefault()
			pending_deletions_button.disabled = true
			self.retry_pending_deletions({})
			.then(function(response){
				pending_deletions_button.disabled = false
				if (response.msg) {
					pending_deletions_value.textContent = response.msg
				}
				refresh_pending_deletions()
			})
		})
		refresh_pending_deletions()

	// section_info
		const section_info = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'section_info',
			parent			: fragment
		})

		// section_name
			ui.create_dom_element({
				element_type	: 'h3',
				class_name		: 'section_name',
				text_content	: self.caller.label,
				parent			: section_info
			})
		// section_tipo
			ui.create_dom_element({
				element_type	: 'h3',
				class_name		: 'section_tipo',
				text_content	: self.caller.tipo,
				parent			: section_info
			})

	// diffusion_info_container
		const diffusion_info_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'diffusion_info_container',
			parent			: fragment
		})

	// resolve_levels
		const resolve_levels_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'resolve_levels_container',
			parent			: diffusion_info_container
		})
		// label
		ui.create_dom_element({
			element_type	: 'label',
			class_name		: '',
			text_content	: get_label.levels || 'Levels',
			parent			: resolve_levels_container
		})
		// note about levels
		const note_about_levels = ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'note_about_levels',
			text_content	: '?',
			title			: 'info',
			parent			: resolve_levels_container
		})
		// click
		const note_about_levels_click_handler = (e) => {
			e.stopPropagation()
			const text = (self.get_tool_label('levels_note') || 'levels_note')
				.replace(/\n/g,'<br>')
			// modal
			ui.attach_to_modal({
				header			: self.get_tool_label('depth_levels') || ' ? ',
				body			: text,
				footer			: null,
				size			: 'small',
				remove_overlay	: true
			})
		}
		note_about_levels.addEventListener('click', note_about_levels_click_handler)

		// resolve_levels_input
		const resolve_levels_input = ui.create_dom_element({
			element_type	: 'input',
			class_name		: 'resolve_levels_input',
			value			: self.resolve_levels,
			parent			: resolve_levels_container
		})
		resolve_levels_input.addEventListener('change', function(e) {
			e.preventDefault()
			// fix self levels value
			self.resolve_levels = parseInt(this.value)
			if (self.resolve_levels<1) {
				self.resolve_levels	= 1
				this.value	= 1
			}
			// store locally
			window.localStorage.setItem('diffusion_levels', this.value);
		})
		// restore local value
		const saved_diffusion_levels = localStorage.getItem('diffusion_levels')
		if (saved_diffusion_levels) {
			const resolve_levels_value	= parseInt(saved_diffusion_levels)
			resolve_levels_input.value	= resolve_levels_value
			self.resolve_levels			= resolve_levels_value
		}
		ui.create_dom_element({
			element_type	: 'label',
			class_name		: '',
			text_content	: self.get_tool_label('depth_levels') || 'Depth levels to solve',
			parent			: resolve_levels_container
		})

	// info
		const button_info = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button info',
			parent			: diffusion_info_container
		})
		const info_div = ui.create_dom_element({
			element_type	: 'pre',
			class_name		: 'info_div hide',
			text_content	: 'info: ' + JSON.stringify(diffusion_info, null, 2),
			parent			: diffusion_info_container
		})
		ui.collapse_toggle_track({
			toggler			: button_info,
			container		: info_div,
			collapsed_id	: 'collapsed_tool_diffusion_info',
			default_state 	: 'closed'
		})

	// skip_publication_state_check
		const skip_publication_state_check_label = ui.create_dom_element({
			element_type	: 'label',
			text_content	: self.get_tool_label('skip_publication_state_check') || 'Ignore temporarily the publication status when publishing',
			parent			: resolve_levels_container
		})
		const skip_publication_state_check_node = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox',
			class_name		: 'skip_publication_state_check_input',
			name			: 'skip_publication_state_check',
			value			: 1
		})
		skip_publication_state_check_label.prepend(skip_publication_state_check_node)
		if (self.diffusion_info.skip_publication_state_check===1) {
			skip_publication_state_check_node.checked = true
		}
		skip_publication_state_check_node.addEventListener('change', function(e) {
			e.preventDefault()
			// fix self levels value
			self.skip_publication_state_check = this.checked ? 1 : 0
			// store locally
			window.localStorage.setItem('diffusion_skip_publication_state', self.skip_publication_state_check);
		})
		// restore local value
		const saved_skip_publication_state = localStorage.getItem('diffusion_skip_publication_state')
		if (saved_skip_publication_state) {
			const skip_publication_state_check_value	= saved_skip_publication_state > 0
			skip_publication_state_check_node.checked	= skip_publication_state_check_value // bool
			self.skip_publication_state_check			= skip_publication_state_check_value // bool
		}

	// publication items
		const publication_items = render_publication_items(self)
		fragment.appendChild(publication_items)

	// info_text
		const total = (self.caller.mode==='edit')
			? 1
			: await self.caller.get_total()
		const locale		= 'es-ES' // (page_globals.locale ?? 'es-CL').replace('_', '-')
		const total_label	= new Intl.NumberFormat(locale, {}).format(total);
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text',
			text_content	: self.get_tool_label('publish_selected_records', total_label),
			parent			: diffusion_info_container
		})

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* RENDER_PUBLICATION_ITEMS
* Every publication item is a diffusion server (multiple configurations could have more than one)
* Sample: 'Publication web', 'Publication web PRE', 'Socrata', etc.
* It consists of a header and a drop-down body.
* @param object self
* @return HTMLElement publication_items
*/
export const render_publication_items = function(self) {

	// short vars
		const section_diffusion_nodes	= self.diffusion_info.section_diffusion_nodes || []
		const lock_items				= []

	// publication_items container
		const publication_items = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'publication_items'
		})

	// group nodes by diffusion_group parent label
		const groups = new Map()
		for (const node of section_diffusion_nodes) {
			// find diffusion_group parent
			const diffusion_group_parent = node.parents.find(p => p.model === 'diffusion_group')
			const group_label = diffusion_group_parent ? diffusion_group_parent.label : 'Other'
			const group_tipo = diffusion_group_parent ? diffusion_group_parent.tipo : 'other'

			if (!groups.has(group_label)) {
				groups.set(group_label, {
					label: group_label,
					tipo: group_tipo,
					nodes: []
				})
			}
			groups.get(group_label).nodes.push(node)
		}

	// render each group
		for (const group of groups.values()) {

			// render each node in this group
				for (const node of group.nodes) {

					// find diffusion_element parent for type and element_tipo
						const diffusion_element_parent = node.parents.find(p => p.model === 'diffusion_element' || p.model === 'diffusion_element_alias')
						const element_tipo = diffusion_element_parent ? diffusion_element_parent.tipo : null
						const type = diffusion_element_parent ? diffusion_element_parent.type : null

					// process_id like 'process_diffusion_8_mht2_rsc170'
						const process_id = 'process_diffusion_' + page_globals.user_id + '_' + element_tipo + '_' + self.caller.section_tipo

					// publication_item_label
						const publication_item_label = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'publication_item_label label icon_arrow up',
							text_content	: diffusion_element_parent.label,
							parent			: publication_items
						})

					// publication_item_body
						const publication_item_body = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'publication_item_body',
							parent			: publication_items
						})

					// collapse body
						ui.collapse_toggle_track({
							toggler				: publication_item_label,
							container			: publication_item_body,
							collapsed_id		: 'collapsed_diffusion_item_' + element_tipo,
							collapse_callback	: collapse,
							expose_callback		: expose,
							default_state		: 'opened'
						})
						function collapse() {
							publication_item_label.classList.remove('up')
						}
						function expose() {
							publication_item_label.classList.add('up')
						}

					// publication_items_grid
						const publication_items_grid = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'publication_items_grid',
							parent			: publication_item_body
						})

					// name
						const name_label = ui.create_dom_element({
							element_type	: 'span',
							text_content	: get_label.name || 'Name',
							class_name		: 'label',
							parent			: publication_items_grid
						})
						const name_value = ui.create_dom_element({
							element_type	: 'div',
							text_content	: node.label,
							class_name		: 'value',
							parent			: publication_items_grid
						})

					// type
						const type_label = ui.create_dom_element({
							element_type	: 'span',
							text_content	: get_label.type || 'Type',
							class_name		: 'label',
							parent			: publication_items_grid
						})
						const type_value = ui.create_dom_element({
							element_type	: 'div',
							text_content	: type || node.model,
							class_name		: 'value',
							parent			: publication_items_grid
						})

					// diffusion_element
						const diffusion_element_label = ui.create_dom_element({
							element_type	: 'span',
							text_content	: 'Diffusion element',
							class_name		: 'label',
							parent			: publication_items_grid
						})
						const diffusion_element_value = ui.create_dom_element({
							element_type	: 'div',
							text_content	: element_tipo,
							class_name		: 'value',
							parent			: publication_items_grid
						})
						const diffusion_element_link_node = ui.create_dom_element({
							element_type	: 'a',
							class_name		: 'button tree',
							title			: get_label.open || 'Open',
							parent			: diffusion_element_value
						})
						const click_handler = async (e) => {
							e.stopPropagation()
							const url = DEDALO_CORE_URL + `/page/?tipo=dd5&menu=false&search_tipos=${element_tipo}`
							window.open(url, 'docu_window')
						}
						diffusion_element_link_node.addEventListener('click', click_handler)

					// diffusion_tipo (main node tipo)
						const diffusion_tipo_label = ui.create_dom_element({
							element_type	: 'span',
							text_content	: 'Diffusion tipo',
							class_name		: 'label',
							parent			: publication_items_grid
						})
						const diffusion_tipo_value = ui.create_dom_element({
							element_type	: 'div',
							text_content	: node.tipo,
							class_name		: 'value',
							parent			: publication_items_grid
						})
						const diffusion_tipo_link_node = ui.create_dom_element({
							element_type	: 'a',
							class_name		: 'button tree',
							title			: get_label.open || 'Open',
							parent			: diffusion_tipo_value
						})
						const diffusion_tipo_click_handler = async (e) => {
							e.stopPropagation()
							const url = DEDALO_CORE_URL + `/page/?tipo=dd5&menu=false&search_tipos=${node.tipo}`
							window.open(url, 'docu_window')
						}
						diffusion_tipo_link_node.addEventListener('click', diffusion_tipo_click_handler)

					// DB connection_status
						if (node.connection_status) {
							ui.create_dom_element({
								element_type	: 'span',
								text_content	: get_label.connection_status || 'Connection status',
								class_name		: 'label',
								parent			: publication_items_grid
							})
							const class_status = node.connection_status.result===true
								? 'success'
								: 'fail'
							ui.create_dom_element({
								element_type	: 'div',
								text_content	: node.connection_status.msg,
								class_name		: 'value ' + class_status,
								parent			: publication_items_grid
							})
						}

					// children (fields) - using node.children as table_fields_info equivalent
						if (node.children?.length > 0) {
							const fields_label = ui.create_dom_element({
								element_type	: 'span',
								text_content	: get_label.fields || 'Fields',
								class_name		: 'label',
								parent			: publication_items_grid
							})
							const fields_value = ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'value link icon_arrow unselectable',
								text_content	: get_label.show || 'Show',
								parent			: publication_items_grid
							})
							fields_value.addEventListener('click', function(e) {
								ar_fields_nodes.map(el => {
									el.classList.toggle('hide')
								})
								this.classList.toggle('up')
							})

							// table_fields_info (children array)
								const ar_fields_nodes = []
								const children_length = node.children.length
								for (let i = 0; i < children_length; i++) {

									const child = node.children[i]

									// field (target)
										const field_node = ui.create_dom_element({
											element_type	: 'span',
											text_content	: child.label,
											class_name		: 'fields_grid_value label hide',
											parent			: publication_items_grid
										})
										ar_fields_nodes.push(field_node)

									// related (Dédalo source)
										const related_item = ui.create_dom_element({
											element_type	: 'div',
											text_content	: child.related_label || '-',
											class_name		: 'fields_grid_value label link hide',
											title			: (child.related_tipo || '') + ' - ' + (child.related_model || ''),
											parent			: publication_items_grid
										})
										ar_fields_nodes.push(related_item)
										related_item.addEventListener('click', function(e) {
											e.stopPropagation()
											const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
												tipo			: 'dd5',
												search_tipos	: child.tipo,
												menu			: false
											})
											const window_width	= 1001
											const screen_width	= window.screen.width
											const screen_height	= window.screen.height
											window.docu_window	= window.open(
												url,
												'docu_window',
												`left=${screen_width-window_width},top=0,width=${window_width},height=${screen_height}`
											)
										})
										const model_node = ui.create_dom_element({
											element_type	: 'span',
											class_name		: 'fields_grid_value_obs label light hide',
											text_content	: child.model + ' | ' + child.tipo,
											parent			: publication_items_grid
										})
										ar_fields_nodes.push(model_node)
										const related_info_node = ui.create_dom_element({
											element_type	: 'div',
											class_name		: 'fields_grid_value_obs label light hide',
											text_content	: (child.related_model || '') + ' | ' + (child.related_tipo || ''),
											parent			: publication_items_grid
										})
										ar_fields_nodes.push(related_info_node)
								}

							// container_bottom
							const container_bottom = render_container_bottom(self, {
								element_tipo	: element_tipo,
								tipo			: node.tipo,
								type			: type,
								label			: node.label,
								children		: node.children
							}, lock_items, process_id)
							publication_items_grid.appendChild(container_bottom)
						}
			}//end for group.nodes
		}//end for groups


	return publication_items
}//end render_publication_items



/**
* RENDER_CONTAINER_BOTTOM
* Render container_bottom nodes
* @param object self
* @param object item - contains element_tipo, tipo, type, label, children
* @param array lock_items
* @param string process_id
* @return HTMLElement container_bottom
*/
export const render_container_bottom = function (self, item, lock_items, process_id) {

	const container_bottom = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'container_bottom'
	})

	// buttons_container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: container_bottom
		})

	// response_message
		const response_message = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'response_message',
			parent			: container_bottom
		})

	// publication_button
		const publication_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'warning publication_button',
			text_content	: get_label.publish || 'Publish',
			parent			: buttons_container
		})
		lock_items.push(publication_button)
		// click event
		const click_handler = (e) => {
			e.stopPropagation()

			// user confirmation
			if (!confirm(get_label.sure || 'Sure?')) {
				return
			}

			// publish content exec
			publish_content(self, {
				response_message		: response_message,
				publication_button		: publication_button,
				item					: item,
				diffusion_tipo			: item.tipo,
				process_id				: process_id
			})
		}
		publication_button.addEventListener('click', click_handler)

	// disable cases removed - connection_status and table check will be handled by Bun API in future
		when_in_viewport(publication_button, ()=>{
			publication_button.focus()
		})

	// check process status always (reconnection after page reload)
		const check_process_data = () => {
			const processes = self.active_processes || []
			// Sort descending so the most recent is checked first
			const sorted_processes = [...processes].sort((a,b) => b.started_at - a.started_at)
			const my_process = sorted_processes.find(p => p.process_id === process_id)

			if (my_process) {
				update_process_status({
					self,
					process_id	: process_id,
					container	: response_message,
					lock_items	: lock_items
				})
			}
		}
		check_process_data()

	// bottom_additions
		const bottom_additions = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'bottom_additions',
			parent			: buttons_container
		})
		switch (item.type) {
			case 'xml':
				const combine_files_label = ui.create_dom_element({
					element_type	: 'label',
					class_name		: 'unselectable',
					text_content	: self.get_tool_label('combine_xml_files') || 'Combine XML files',
					parent			: bottom_additions
				})
				const combine_files_check_node = ui.create_dom_element({
					element_type	: 'input',
					type			: 'checkbox',
					class_name		: '',
					name			: 'combine_files_check',
					value			: 1
				})
				combine_files_label.prepend(combine_files_check_node)
				// change event
				const change_handler = (e) => {
					// post_actions
					// e.g combine_rendered_files. This is used to merge all rendered XML files nodes
					// into one single file containing all nodes.
					self.additions_options.post_actions = e.target.checked
						? 'diffusion_xml::combine_rendered_files'
						: null;
				}
				combine_files_check_node.addEventListener('change', change_handler)
				break;

			default:

				break;
		}


	return container_bottom;
}//end render_container_bottom



/**
* PUBLISH_CONTENT
* Trigger the publish records action against the API.
* The export() call now returns a ReadableStream with per-record progress.
* @param object self
* @param object options
*/
const publish_content = async (self, options) => {

	// options
		const response_message			= options.response_message
		const publication_button		= options.publication_button
		const item						= options.item
		const diffusion_element_tipo	= options.diffusion_element_tipo ?? item?.element_tipo
		const diffusion_tipo			= options.diffusion_tipo ?? item?.diffusion_tipo
		const process_id				= options.process_id

	// clean previous messages
		response_message.classList.remove('error')
		publication_button.classList.add('loading')

	// lock items
		const lock_items = [publication_button]

	// blur button
		document.activeElement.blur()

	// export API call — now returns a ReadableStream
		const stream = await self.export({
			item					: item,
			diffusion_element_tipo	: diffusion_element_tipo,
			diffusion_tipo			: diffusion_tipo,
			process_id				: process_id
		})
		if (!stream) {
			ui.update_node_content(response_message, 'Error: no stream received from server')
			response_message.classList.add('error')
			publication_button.classList.remove('loading')
			console.error('Error: data_manager.request_stream did not return a valid stream.');
			return
		}

	// clean container
		while (response_message.firstChild) {
			response_message.removeChild(response_message.firstChild);
		}

	// render base nodes for stream display
		const render_response = render_stream({
			container	: response_message,
			id			: process_id,
			on_stop		: () => {
				data_manager.request({
					url : typeof DEDALO_DIFFUSION_API_URL !== 'undefined' ? DEDALO_DIFFUSION_API_URL : data_manager.url,
					body : {
						dd_api		: 'dd_diffusion_api',
						action		: 'cancel_process',
						process_id	: process_id
					}
				})
				.then(function(response){
					if(SHOW_DEBUG===true) {
						console.log('cancel_process API response:', response);
					}
					if (response.errors && response.errors.length) {
						alert("Errors: " + response.errors.join('<br>') );
					}
				})
			}
		})

	// average process time for record
		const ar_samples = []
		const get_average = (arr) => {
			let sum = 0;
			const arr_length = arr.length;
			for (let i = 0; i < arr_length; i++) {
				sum += arr[i];
			}
			return Math.ceil( sum / arr_length );
		}

	// last_sse_response
		let last_sse_response

		const on_read = (sse_response) => {

			// fire update_info_node on every reader read chunk
			render_response.update_info_node(
				sse_response,
				(info_node) => { // callback

					const is_running = sse_response?.is_running ?? true

					const compound_msg = (sse_response) => {
						const data = sse_response.data
						const parts = []
						parts.push(data.msg)
						if (data.counter) {
							parts.push(data.counter +' '+ (get_label.of || 'of') +' '+ data.total)
						}
						if (data.section_label) {
							parts.push(data.section_label)
						}
						if (data.current) {
							if (data.current.section_id) {
								parts.push('id: ' + data.current.section_id)
							}
						}
						if (data.total_ms) {
							parts.push( time_unit_auto(data.total_ms) )
						}else if(sse_response.total_time) {
							parts.push(sse_response.total_time)
						}
						if (data.current && data.current.time) {
							// save in samples array to make average
							if (ar_samples.length>50) {
								ar_samples.shift() // remove older element
							}
							ar_samples.push(data.current.time)

							const average			= get_average(ar_samples)
							const remaining_ms		= ((data.total - data.counter) * average)
							const remaining_time	= time_unit_auto(remaining_ms)
							parts.push('Time remaining: ' + remaining_time)
						}

						return parts.join(' | ')
					}

					const msg = sse_response
								&& sse_response.data
								&& sse_response.data.msg
								&& sse_response.data.msg.length>5
						? compound_msg(sse_response)
						: is_running
							? 'Process running... please wait'
							: 'Process completed in ' + sse_response.total_time

					if(!info_node.msg_node) {
						info_node.msg_node = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'msg_node' + (is_running===false ? ' done' : ''),
							parent			: info_node
						})
					}
					ui.update_node_content(info_node.msg_node, msg)
				}
			)

			last_sse_response = sse_response
		}

	// on_done event (called once at finish or cancel the stream read)
		const on_done = () => {
			// is triggered at the reader's closing
			render_response.done()
			// unlock lock_items
			lock_items.forEach(el =>{
				el.classList.remove('loading')
			})
			// render_process_report
			render_process_report({
				self,
				last_sse_response,
				container: response_message
			})
		}

	// read stream
		data_manager.read_stream(stream, on_read, on_done)
}//end publish_content



/**
* UPDATE_PROCESS_STATUS
* Polling reconnection handler.
* Called from check_process_data when the page loads and finds
* a process_id in IndexedDB from a previous session.
* Connects to the Bun diffusion API's get_process_status endpoint.
* @param object options
* @return void
*/
const update_process_status = (options) => {

	const self			= options.self
	const process_id	= options.process_id
	const container		= options.container
	const lock_items	= options.lock_items

	// locks lock_items
	lock_items.forEach(el =>{
		el.classList.add('loading')
	})

	// blur button
	document.activeElement.blur()

	// clean container
	while (container.firstChild) {
		container.removeChild(container.firstChild);
	}

	// get_process_status from diffusion API — polling reconnection
	data_manager.request_stream({
		url : typeof DEDALO_DIFFUSION_API_URL !== 'undefined'
			? DEDALO_DIFFUSION_API_URL
			: data_manager.url,
		body : {
			dd_api		: 'dd_diffusion_api',
			action		: 'get_process_status',
			update_rate	: 1000, // int milliseconds
			process_id	: process_id
		}
	})
	.then(function(stream){

		if (!stream) {
			console.error('Error: request_stream did not return a valid stream for process:', process_id);
			lock_items.forEach(el => el.classList.remove('loading'))
			return
		}

		// render base nodes and set functions to manage
		// the stream reader events
		const render_response = render_stream({
			container	: container,
			id			: process_id,
			on_stop		: () => {
				data_manager.request({
					url : typeof DEDALO_DIFFUSION_API_URL !== 'undefined' ? DEDALO_DIFFUSION_API_URL : data_manager.url,
					body : {
						dd_api		: 'dd_diffusion_api',
						action		: 'cancel_process',
						process_id	: process_id
					}
				})
				.then(function(response){
					if(SHOW_DEBUG===true) {
						console.log('cancel_process API response:', response);
					}
					if (response.errors && response.errors.length) {
						alert("Errors: " + response.errors.join('<br>') );
					}
				})
			}
		})

		// average process time for record
			const ar_samples = []
			const get_average = (arr) => {
				let sum = 0;
				const arr_length = arr.length;
				for (let i = 0; i < arr_length; i++) {
					sum += arr[i];
				}
				return Math.ceil( sum / arr_length );
			}

		// last_sse_response
		let last_sse_response

		// on_read event (called on every chunk from stream reader)
		const on_read = (sse_response) => {

			// fire update_info_node on every reader read chunk
			render_response.update_info_node(
				sse_response,
				(info_node) => { // callback

					const is_running = sse_response?.is_running ?? true

					const compound_msg = (sse_response) => {
						const data = sse_response.data
						const parts = []
						parts.push(data.msg)
						if (data.counter) {
							parts.push(data.counter +' '+ (get_label.of || 'of') +' '+ data.total)
						}
						if (data.section_label) {
							parts.push(data.section_label)
						}
						if (data.current) {
							if (data.current.section_id) {
								parts.push('id: ' + data.current.section_id)
							}
						}
						if (data.total_ms) {
							parts.push( time_unit_auto(data.total_ms) )
						}else if(sse_response.total_time) {
							parts.push(sse_response.total_time)
						}
						if (data.current && data.current.time) {
							// save in samples array to make average
							if (ar_samples.length>50) {
								ar_samples.shift() // remove older element
							}
							ar_samples.push(data.current.time)

							const average			= get_average(ar_samples)
							const remaining_ms		= ((data.total - data.counter) * average)
							const remaining_time	= time_unit_auto(remaining_ms)
							parts.push('Time remaining: ' + remaining_time)
						}

						return parts.join(' | ')
					}

					const msg = sse_response
								&& sse_response.data
								&& sse_response.data.msg
								&& sse_response.data.msg.length>5
						? compound_msg(sse_response)
						: is_running
							? 'Process running... please wait'
							: 'Process completed in ' + sse_response.total_time

					if(!info_node.msg_node) {
						info_node.msg_node = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'msg_node' + (is_running===false ? ' done' : ''),
							parent			: info_node
						})
					}
					ui.update_node_content(info_node.msg_node, msg)
				}
			)

			last_sse_response = sse_response
		}

		// on_done event (called once at finish or cancel the stream read)
		const on_done = () => {
			// is triggered at the reader's closing
			render_response.done()
			// unlock lock_items
			lock_items.forEach(el =>{
				el.classList.remove('loading')
			})
			// render_process_report
			render_process_report({
				self,
				last_sse_response,
				container
			})
		}

		// read stream
		data_manager.read_stream(stream, on_read, on_done)
	})
}//end update_process_status



/**
* RENDER_PROCESS_REPORT
* Manages last_update_record_response from process when
* read_stream finishes (on done)
* In some cases, like RDF export, a file is created and we need to get
* user access to the file download
* @param object options
* {
* 	last_sse_response: {data:last_update_record_response,..},
* 	container: HTMLElement
* }
* @return bool
*/
const render_process_report = function(options) {

	// options
		const self							= options.self
		const last_sse_response				= options.last_sse_response || {}
		const last_update_record_response	= last_sse_response.data?.last_update_record_response
		const diffusion_data				= last_sse_response.data?.diffusion_data || []
		const container						= options.container

	// Bun SQL diffusion engine result (set at SSE top-level, not in last_update_record_response)
		const engine_result = last_sse_response.result
		if (engine_result?.tables) {

			// wrapper
			const report_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'diffusion_report',
				parent			: container
			})

			// helper: get label or fallback to English
			const label_en = {
				success          : 'Success',
				partial_success  : 'Partial success',
				fail             : 'Fail',
				table_name       : 'Table',
				rows_total       : 'Rows',
				records_affected : 'Records'
			}
			const tl = (name) => self?.get_tool_label(name) || label_en[name] || name

			// summary status
			const ok				= engine_result.result === true
			const has_errors		= !!(engine_result.errors?.length)
			const summary_class		= ok
				? 'success'
				: has_errors
					? 'partial'
					: 'fail'
			const summary_label		= ok
				? tl('success')
				: has_errors
					? tl('partial_success')
					: tl('fail')
			const total_time		= last_sse_response.total_time || ''
			const summary_msg		= [summary_label, engine_result.msg || ''].filter(Boolean).join(' - ')
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'report_summary ' + summary_class,
				text_content	: summary_msg + (total_time ? ' (' + total_time + ')' : ''),
				parent			: report_node
			})

			// tables grid
			const grid = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'tables_report',
				parent			: report_node
			})
			// headers
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'header table_name',
				text_content	: tl('table_name'),
				parent			: grid
			})
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'header rows_total',
				text_content	: tl('rows_total'),
				parent			: grid
			})
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'header records_count',
				text_content	: tl('records_affected'),
				parent			: grid
			})
			// table rows
			engine_result.tables.forEach((table) => {
				const total_rows	= table.records_affected || 0
				const unique_recs	= table.records_count ?? total_rows
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'cell table_name',
					text_content	: table.table_name || '',
					parent			: grid
				})
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'cell rows_total' + (total_rows === 0 ? ' zero' : ''),
					text_content	: String(total_rows),
					parent			: grid
				})
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'cell records_count' + (unique_recs === 0 ? ' zero' : ''),
					text_content	: String(unique_recs),
					parent			: grid
				})
			})

			// errors
			const ar_errors = engine_result.errors || last_sse_response.errors || []
			if (ar_errors.length) {
				const error_list = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'error_list',
					parent			: report_node
				})
				ar_errors.forEach((err) => {
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'error_item',
						text_content	: err,
						parent			: error_list
					})
				})
			}
			return true;
		}

	// last_update_record_response (RDF/XML only)
		if (!last_update_record_response) {
			return false
		}

	// class_name based actions
		const type = last_update_record_response.class
		// cases
		switch (type) {

			case 'diffusion_rdf':
			case 'diffusion_xml': {
				// RDF/XML export case.
				// Bulk: show merged file + ZIP download buttons (consolidated_files present).
				// Single record: show individual file download button (legacy behaviour).
				const consolidated_files = last_sse_response.data?.consolidated_files

				if (consolidated_files) {
					// Bulk — consolidated output
					const add_button = (file_url, label_key, fallback_label) => {
						const name = file_url.split('/').pop()
						const button = ui.create_dom_element({
							element_type	: 'button',
							class_name		: 'download warning',
							text_content	: (get_label[label_key] || fallback_label) + ' ' + name,
							parent			: container
						})
						button.addEventListener('click', function(e) {
							e.stopPropagation()
							open_window({ url : window.location.origin + file_url })
						})
					}
					add_button(consolidated_files.merged_url, 'download_merged', 'Download merged')
					add_button(consolidated_files.zip_url,    'download_zip',    'Download ZIP')

				} else if (diffusion_data.length) {
					// Single record — individual file(s)
					diffusion_data.forEach((el) => {
						const name = el.file_url.split('\\').pop().split('/').pop()
						const button_download = ui.create_dom_element({
							element_type	: 'button',
							class_name		: 'download warning',
							text_content	: (get_label.download || 'Download') + ' ' + name,
							parent			: container
						})
						button_download.addEventListener('click', function(e) {
							e.stopPropagation()
							open_window({ url : window.location.origin + el.file_url })
						})
					})
				}
				break;
			}

			default:
				// Nothing specific to do
				break;
		}

	// errors manager
		const errors = last_update_record_response.errors || []
		if (errors.length>0) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'error',
				text_content	: errors.join(' | '),
				parent			: container
			})
		}


	return true
}//end render_process_report



// @license-end
