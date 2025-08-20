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
				inner_html		: self.caller.label,
				parent			: section_info
			})
		// section_tipo
			ui.create_dom_element({
				element_type	: 'h3',
				class_name		: 'section_tipo',
				inner_html		: self.caller.tipo,
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
			inner_html		: get_label.levels || 'Levels',
			parent			: resolve_levels_container
		})
		// note about levels
		const note_about_levels = ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'note_about_levels',
			inner_html		: '?',
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
			inner_html		: self.get_tool_label('depth_levels') || 'Depth levels to solve',
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
			inner_html		: 'info: ' + JSON.stringify(diffusion_info, null, 2),
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
			inner_html		: self.get_tool_label('skip_publication_state_check') || 'Ignore temporarily the publication status when publishing',
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
		const total = self.caller.mode==='edit'
			? 1
			: await self.caller.get_total()
		const locale		= 'es-ES' // (page_globals.locale ?? 'es-CL').replace('_', '-')
		const total_label	= new Intl.NumberFormat(locale, {}).format(total);
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text',
			inner_html		: self.get_tool_label('publish_selected_records', total_label),
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
		const diffusion_map	= self.diffusion_info.diffusion_map
		const ar_data		= self.diffusion_info.ar_data
		const lock_items	= []

	// publication_items container
		const publication_items = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'publication_items'
		})

	let diffusion_group_key = 0;
	for(const diffusion_group_tipo in diffusion_map) {

		const current_diffusion_map = diffusion_map[diffusion_group_tipo] // array

		const current_diffusion_map_length = current_diffusion_map.length
		for (let i = 0; i < current_diffusion_map_length; i++) {

			const item		= current_diffusion_map[i]
			const data_item	= ar_data[diffusion_group_key]

			// skip disable cases
			if (item.class_name==='diffusion_mysql' && !data_item.table) {
				continue;
			}

			// local_db_id like 'process_diffusion_mht2_rsc170'
			const local_db_id = 'process_diffusion_' + item.element_tipo + '_' + self.caller.section_tipo

			const current_diffusion_element_tipo = item.element_tipo

			// publication_item_label
				const publication_item_label = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'publication_item_label label icon_arrow up',
					inner_html		: item.name,
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
					collapsed_id		: 'collapsed_diffusion_item_'+current_diffusion_element_tipo,
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
					inner_html		: get_label.name || 'Name',
					class_name		: 'label',
					parent			: publication_items_grid
				})
				const name_value = ui.create_dom_element({
					element_type	: 'div',
					inner_html		: item.name,
					class_name		: 'value',
					parent			: publication_items_grid
				})

			// type
				const type_label = ui.create_dom_element({
					element_type	: 'span',
					inner_html		: get_label.type || 'Type',
					class_name		: 'label',
					parent			: publication_items_grid
				})
				const type_value = ui.create_dom_element({
					element_type	: 'div',
					inner_html		: item.class_name,
					class_name		: 'value',
					parent			: publication_items_grid
				})

			// diffusion_element
				const diffusion_element_label = ui.create_dom_element({
					element_type	: 'span',
					inner_html		: 'Diffusion element',
					class_name		: 'label',
					parent			: publication_items_grid
				})
				const diffusion_element_value = ui.create_dom_element({
					element_type	: 'div',
					inner_html		: current_diffusion_element_tipo,
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
					const url = DEDALO_CORE_URL + `/page/?tipo=dd5&menu=false&search_tipos=${current_diffusion_element_tipo}`
					window.open(url, 'docu_window')
				}
				diffusion_element_link_node.addEventListener('click', click_handler)

			// database
				if (item.database_name) {
					const database_label = ui.create_dom_element({
						element_type	: 'span',
						inner_html		: get_label.database || 'Database',
						class_name		: 'label',
						parent			: publication_items_grid
					})
					const database_value = ui.create_dom_element({
						element_type	: 'div',
						inner_html		: item.database_name,
						class_name		: 'value',
						parent			: publication_items_grid
					})
					if (data_item.database_tipo) {
						const database_tipo_node = ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'value_info',
							inner_html		: `[${data_item.database_tipo}]`,
							parent			: database_value
						})
						const database_tipo_link_node = ui.create_dom_element({
							element_type	: 'a',
							class_name		: 'button tree',
							title			: get_label.open || 'Open',
							parent			: database_value
						})
						const click_handler = async (e) => {
							e.stopPropagation()
							const url = DEDALO_CORE_URL + `/page/?tipo=dd5&menu=false&search_tipos=${data_item.database_tipo}`
							window.open(url, 'docu_window')
						}
						database_tipo_link_node.addEventListener('click', click_handler)
					}
				}

			// table
				if (data_item.table) {
					const table_label = ui.create_dom_element({
						element_type	: 'span',
						inner_html		: get_label.table || 'Table',
						class_name		: 'label',
						parent			: publication_items_grid
					})
					const table_value = ui.create_dom_element({
						element_type	: 'div',
						inner_html		: data_item.table,
						class_name		: 'value',
						parent			: publication_items_grid
					})
					if (data_item.table_tipo) {
						const table_tipo_node = ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'value_info',
							inner_html		: `[${data_item.table_tipo}]`,
							parent			: table_value
						})
						const table_tipo_link_node = ui.create_dom_element({
							element_type	: 'a',
							class_name		: 'button tree',
							title			: get_label.open || 'Open',
							parent			: table_value
						})
						const click_handler = async (e) => {
							e.stopPropagation()
							const url = DEDALO_CORE_URL + `/page/?tipo=dd5&menu=false&search_tipos=${data_item.table_tipo}`
							window.open(url, 'docu_window')
						}
						table_tipo_link_node.addEventListener('click', click_handler)
					}
				}

			// fields
				if (data_item.table_fields_info?.length>0) {
					const fields_label = ui.create_dom_element({
						element_type	: 'span',
						inner_html		: get_label.fields || 'Fields',
						class_name		: 'label',
						parent			: publication_items_grid
					})
					const fields_value = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'value link icon_arrow unselectable',
						inner_html		: get_label.show || 'Show',
						parent			: publication_items_grid
					})
					fields_value.addEventListener('click', function(e) {
						ar_fields_nodes.map(el => {
							el.classList.toggle('hide')
						})
						this.classList.toggle('up')
					})

					// table_fields_info
					const ar_fields_nodes = []
					const table_fields_info_length = data_item.table_fields_info.length
					for (let i = 0; i < table_fields_info_length; i++) {

						const item = data_item.table_fields_info[i]

						// field (MySQL target)
						const field_node = ui.create_dom_element({
							element_type	: 'span',
							inner_html		: item.label,
							class_name		: 'fields_grid_value label hide',
							parent			: publication_items_grid
						})
						ar_fields_nodes.push(field_node)

						// related (Dédalo source)
						const related_item = ui.create_dom_element({
							element_type	: 'div',
							inner_html		: item.related_label,
							class_name		: 'fields_grid_value label link hide',
							title			: item.related_tipo + ' - ' + item.related_model,
							parent			: publication_items_grid
						})
						ar_fields_nodes.push(related_item)
						related_item.addEventListener('click', function(e) {
							e.stopPropagation()
							const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
								tipo			: 'dd5',
								search_tipos	: item.tipo,
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
							inner_html		: item.model + ' | ' + item.tipo,
							parent			: publication_items_grid
						})
						ar_fields_nodes.push(model_node)
						const related_info_node = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'fields_grid_value_obs label light hide',
							inner_html		: item.related_model + ' | ' + item.related_tipo,
							parent			: publication_items_grid
						})
						ar_fields_nodes.push(related_info_node)
					}
				}

			// DB connection_status
				if (item.connection_status) {
					ui.create_dom_element({
						element_type	: 'span',
						inner_html		: get_label.connection_status || 'Connection status',
						class_name		: 'label',
						parent			: publication_items_grid
					})
					const class_status = item.connection_status.result===true
						? 'success'
						: 'fail'
					ui.create_dom_element({
						element_type	: 'div',
						inner_html		: item.connection_status.msg,
						class_name		: 'value ' + class_status,
						parent			: publication_items_grid
					})
				}

			// properties (section_tables_map)
				const properties = data_item.section_tables_map.properties || null
				if (properties) {
					// label
					ui.create_dom_element({
						element_type	: 'span',
						inner_html		: (get_label.properties || 'Properties'),
						class_name		: 'label',
						parent			: publication_items_grid
					})
					// value
					const fields_value = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'value link icon_arrow unselectable',
						inner_html		: get_label.show || 'Show',
						parent			: publication_items_grid
					})
					fields_value.addEventListener('click', function(e) {
						properties_label.classList.toggle('hide')
						properties_node.classList.toggle('hide')
						this.classList.toggle('up')
					})
					const properties_label = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'label hide',
						inner_html		: `table tipo: ${data_item.section_tables_map.table}`,
						parent			: publication_items_grid
					})
					const properties_node = ui.create_dom_element({
						element_type	: 'pre',
						class_name		: 'pre hide',
						inner_html		: JSON.stringify(properties, null, 2),
						parent			: publication_items_grid
					})
				}

			// config (from config.php definitions)
				const config = data_item.config || null
				if (config) {
					// label
					ui.create_dom_element({
						element_type	: 'span',
						inner_html		: (get_label.config || 'Config'),
						class_name		: 'label',
						parent			: publication_items_grid
					})
					// value
					const fields_value = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'value link icon_arrow unselectable',
						inner_html		: get_label.show || 'Show',
						parent			: publication_items_grid
					})
					fields_value.addEventListener('click', function(e) {
						properties_label.classList.toggle('hide')
						properties_node.classList.toggle('hide')
						this.classList.toggle('up')
					})
					const properties_label = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'label hide',
						inner_html		: '',
						parent			: publication_items_grid
					})
					const properties_node = ui.create_dom_element({
						element_type	: 'pre',
						class_name		: 'pre hide',
						inner_html		: JSON.stringify(config, null, 2),
						parent			: publication_items_grid
					})
				}

			// container_bottom
				const container_bottom = render_container_bottom(self, item, lock_items, local_db_id, current_diffusion_element_tipo, data_item)
				publication_items_grid.appendChild(container_bottom)
		}//end for (let i = 0; i < current_diffusion_map_length; i++)

		diffusion_group_key++
	}


	return publication_items
}//end render_publication_items



/**
* RENDER_CONTAINER_BOTTOM
* Render container_bottom nodes
* @param object item
* @param array lock_items
* @param string local_db_id
* @return HTMLElement container_bottom
*/
export const render_container_bottom = function (self, item, lock_items, local_db_id, current_diffusion_element_tipo, data_item) {

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

	// publication_button
		const publication_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'warning publication_button',
			inner_html		: get_label.publish || 'Publish',
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
				diffusion_element_tipo	: current_diffusion_element_tipo,
				local_db_id				: local_db_id
			})
		}
		publication_button.addEventListener('click', click_handler)

	// disable cases :
		if (
			(item.connection_status && item.connection_status.result===false) ||
			(item.class_name==='diffusion_mysql' && !data_item.table)
			) {
				publication_button.classList.add('loading')
		}else{
			when_in_viewport(publication_button, ()=>{
				publication_button.focus()
			})
		}

	// check process status always
		const check_process_data = () => {
			data_manager.get_local_db_data(
				local_db_id,
				'status'
			)
			.then(function(local_data){
				if (local_data && local_data.value) {
					update_process_status({
						pid			: local_data.value.pid,
						pfile		: local_data.value.pfile,
						local_db_id	: local_db_id,
						container	: response_message,
						lock_items	: lock_items
					})
				}
			})
		}
		check_process_data()

	// bottom_additions
		const bottom_additions = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'bottom_additions',
			parent			: buttons_container
		})
		switch (item.class_name) {
			case 'diffusion_xml':
				const combine_files_label = ui.create_dom_element({
					element_type	: 'label',
					class_name		: 'unselectable',
					inner_html		: self.get_tool_label('combine_xml_files') || 'Combine XML files',
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

	// response_message
		const response_message = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'response_message',
			parent			: container_bottom
		})


	return container_bottom;
}//end render_container_bottom



/**
* PUBLISH_CONTENT
* Trigger the publish records action against the API
* @param object self
* @param object options
*/
const publish_content = async (self, options) => {

	// options
		const response_message			= options.response_message
		const publication_button		= options.publication_button
		const diffusion_element_tipo	= options.diffusion_element_tipo
		const local_db_id				= options.local_db_id

	// clean previous messages
		response_message.classList.remove('error')
		publication_button.classList.add('loading')

	// export API call
		const api_response = await self.export({
			diffusion_element_tipo	: diffusion_element_tipo
		})

	// debug
		if(SHOW_DEBUG===true) {
			console.log('export api_response:', api_response);
		}

	// main response msg print
		ui.update_node_content(response_message, (api_response.msg || 'Unknown error') )
		if (api_response.result===false) {
			response_message.classList.add('error')
			publication_button.classList.remove('loading')
			return
		}

	// fire update_process_status
		update_process_status({
			pid			: api_response.pid,
			pfile		: api_response.pfile,
			local_db_id	: local_db_id,
			container	: response_message,
			lock_items	: [publication_button]
		})
}//end publish_content



/**
* UPDATE_PROCESS_STATUS
* Call API get_process_status and render the info nodes
* @param object options
* @return void
*/
const update_process_status = (options) => {

	const pid			= options.pid
	const pfile			= options.pfile
	const local_db_id	= options.local_db_id
	const container		= options.container
	const lock_items	= options.lock_items

	// locks lock_items
	lock_items.map(el =>{
		el.classList.add('loading')
	})

	// blur button
	document.activeElement.blur()

	// clean container
	while (container.firstChild) {
		container.removeChild(container.firstChild);
	}

	// get_process_status from API and returns a SEE stream
	data_manager.request_stream({
		body : {
			dd_api		: 'dd_utils_api',
			action		: 'get_process_status',
			update_rate	: 1000, // int milliseconds
			options		: {
				pid		: pid,
				pfile	: pfile
			}
		}
	})
	.then(function(stream){

		// render base nodes and set functions to manage
		// the stream reader events
		const render_response = render_stream({
			container	: container,
			id			: local_db_id,
			pid			: pid,
			pfile		: pfile
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
			lock_items.map(el =>{
				el.classList.remove('loading')
			})
			// render_process_report
			render_process_report({
				last_sse_response,
				container
			})
		}

		// read stream. Creates ReadableStream that fire
		// 'on_read' function on each stream chunk at update_rate
		// (1 second default) until stream is done (PID is no longer running)
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
		const last_sse_response				= options.last_sse_response || {}
		const last_update_record_response	= last_sse_response.data?.last_update_record_response
		const diffusion_data				= last_sse_response.data?.diffusion_data || []
		const container						= options.container

	// last_update_record_response
		// {
		//   "result": true,
		//   "msg": [
		// 		"Record updated section_id: 1. Number of references: 8 in levels: 2"
		//   ],
		//   "errors": [],
		//   "class": "diffusion_mysql"
		// }
		if (!last_update_record_response) {
			return false
		}

	// class_name based actions
		const class_name = last_update_record_response.class
		// cases
		switch (class_name) {

			case 'diffusion_mysql':
				// Nothing specific to do
				break;

			case 'diffusion_rdf':
				// RDF export case (returns diffusion_data a list of URL from created RDF files)
				if (diffusion_data.length) {

					diffusion_data.forEach((el) => {
						const name = el.file_url.split('\\').pop().split('/').pop();
						// download button
						const button_download = ui.create_dom_element({
							element_type	: 'button',
							class_name		: 'download warning',
							inner_html		: (get_label.download || 'Download') + ' ' + name,
							parent			: container
						})
						button_download.addEventListener('click', function(e) {
							e.stopPropagation()
							const url = window.location.origin + el.file_url
							open_window({
								url : url
							})
						})
					})
				}
				break;

			case 'diffusion_xml':
				// XML export case (returns diffusion_data a list of URL from created RDF files)
				if (diffusion_data.length) {

					diffusion_data.forEach((el) => {
						const name = el.file_url.split('\\').pop().split('/').pop();
						// download button
						const button_download = ui.create_dom_element({
							element_type	: 'button',
							class_name		: 'download warning',
							inner_html		: (get_label.download || 'Download') + ' ' + name,
							parent			: container
						})
						button_download.addEventListener('click', function(e) {
							e.stopPropagation()
							const url = window.location.origin + el.file_url
							open_window({
								url : url
							})
						})
					})
				}
				break;

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
				inner_html		: errors.join(' | '),
				parent			: container
			})
		}


	return true
}//end render_process_report



// @license-end
