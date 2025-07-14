// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {data_manager} from '../../../../common/js/data_manager.js'



/**
* RENDER_DATABASE_INFO
* Manages the component's logic and appearance in client side
*/
export const render_database_info = function() {

	return true
}//end render_database_info



/**
* LIST
* Creates the nodes of current widget.
* The created wrapper will be append to the widget body in area_maintenance
* @param object options
* 	Sample:
* 	{
*		render_level : "full"
		render_mode : "list"
*   }
* @return HTMLElement wrapper
* 	To append to the widget body node (area_maintenance)
*/
render_database_info.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end list



/**
* GET_CONTENT_DATA_EDIT
* @param object self
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	// short vars
		const value		= self.value || {}
		const info		= value.info || {}
		const database	= info.IntervalStyle || ''
		const server	= info.server || ''
		const host		= info.host || ''

	// content_data
	const content_data = ui.create_dom_element({
		element_type : 'div'
	})

	// Database info
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: '',
		inner_html		: `Database ${database} ${server} ${host}`,
		parent			: content_data
	})

	// version_info
	ui.create_dom_element({
		element_type	: 'pre',
		class_name		: 'version_info',
		inner_html		: JSON.stringify(info, null, 2),
		parent			: content_data
	})

	// form init
	if (self.caller?.init_form) {

		// rebuild indexes
		const rebuild_indexes_container = render_rebuild_indexes(self)
		content_data.appendChild(rebuild_indexes_container)

		// render_optimize_tables
		const optimize_tables_container = render_optimize_tables(self)
		content_data.appendChild(optimize_tables_container)

		// consolidate table sequences
		const consolidate_table_sequences_container = render_consolidate_table_sequences(self)
		content_data.appendChild(consolidate_table_sequences_container)

		// re-build user stats
		const rebuild_user_stats_container = render_rebuild_user_stats(self)
		content_data.appendChild(rebuild_user_stats_container)
	}


	return content_data
}//end get_content_data_edit



/**
* RENDER_REBUILD_INDEXES
* @param object self widget instance
* @return HTMLElement rebuild_indexes_container
*/
const render_rebuild_indexes = (self) => {

	const rebuild_indexes_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'group_container rebuild_indexes_container'
	})

	// label
	ui.create_dom_element({
		element_type	: 'h3',
		class_name		: 'group_label',
		inner_html		: get_label.rebuild_indexes || 'Rebuild indexes',
		parent			: rebuild_indexes_container
	})

	// info_text
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'info_text',
		inner_html		: 'Forces rebuilding of PostgreSQL main indexes, extensions and functions.',
		parent			: rebuild_indexes_container
	})

	const body_response = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'body_response'
	})
	// dblclick event
	const dblclick_handler = (e) => {
		// clean body_response nodes
		while (body_response.firstChild) {
			body_response.removeChild(body_response.firstChild);
		}
	}
	body_response.addEventListener('dblclick', dblclick_handler)

	self.caller.init_form({
		submit_label	: 'Re-build indexes',
		confirm_text	: get_label.seguro || 'Sure?',
		body_info		: rebuild_indexes_container,
		body_response	: body_response,
		on_submit	: async (e) => {

			// clean body_response nodes
			while (body_response.firstChild) {
				body_response.removeChild(body_response.firstChild);
			}

			// loading add
			e.target.classList.add('lock')
			const spinner = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'spinner'
			})
			body_response.prepend(spinner)

			// API worker call
			const api_response = await data_manager.request({
				use_worker	: true,
				body		: {
					dd_api			: 'dd_area_maintenance_api',
					action			: 'class_request',
					prevent_lock	: true,
					source	: {
						action : 'rebuild_db_indexes'
					},
					options	: {}
				},
				retries : 1, // one try only
				timeout : 3600 * 1000 // 1 hour waiting response
			})

			// loading remove
			spinner.remove()
			e.target.classList.remove('lock')

			// remove annoying rqo_string from object
			if (api_response?.debug?.rqo_string) {
				delete api_response.debug.rqo_string
			}

			// response_node pre JSON response
			if (api_response) {
				ui.create_dom_element({
					element_type	: 'pre',
					class_name		: 'response_node',
					inner_html		: JSON.stringify(api_response, null, 2),
					parent			: body_response
				})
			}else{
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'response_node error',
					inner_html		: 'Unknown error calling API',
					parent			: body_response
				})
			}
		}
	})

	// add body_response at end
	rebuild_indexes_container.appendChild(body_response)


	return rebuild_indexes_container
}//end render_rebuild_indexes



/**
* RENDER_OPTIMIZE_TABLES
* @param object self widget instance
* @return HTMLElement rebuild_indexes_container
*/
const render_optimize_tables = (self) => {

	// tables
	const source_tables = self.value?.tables || []

	const optimize_tables_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'group_container optimize_tables_container'
	})

	// label
	ui.create_dom_element({
		element_type	: 'h3',
		class_name		: 'group_label',
		inner_html		: get_label.optimize_tables || 'Optimize tables',
		parent			: optimize_tables_container
	})

	// info_text
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'info_text',
		inner_html		: 'Re-index and vacuum analyze the selected tables.',
		parent			: optimize_tables_container
	})

	const body_response = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'body_response'
	})
	// dblclick event
	const dblclick_handler = (e) => {
		// clean body_response nodes
		while (body_response.firstChild) {
			body_response.removeChild(body_response.firstChild);
		}
	}
	body_response.addEventListener('dblclick', dblclick_handler)

	self.caller.init_form({
		submit_label	: 'Optimize tables',
		confirm_text	: get_label.seguro || 'Sure?',
		body_info		: optimize_tables_container,
		body_response	: body_response,
		inputs			: [{
			type		: 'text',
			name		: 'tables',
			label		: 'Tables list as jer_dd,matrix_ontology,matrix',
			value		: source_tables.join(','),
			mandatory	: true
		}],
		on_submit	: async (e, values) => {

			// clean body_response nodes
			while (body_response.firstChild) {
				body_response.removeChild(body_response.firstChild);
			}

			// loading add
			e.target.classList.add('lock')
			const spinner = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'spinner'
			})
			body_response.prepend(spinner)

			// value
			const tables = values.filter(el => el.name==='tables')
				.map(el => el.value)[0]
				.split(',')
				.map(el => el.trim())

			if (!tables || tables.length < 1) {
				// loading  remove
				spinner.remove()
				e.target.classList.remove('lock')
				return
			}

			if (tables.length === source_tables.length) {
				const label = (get_label.all || 'All') + ' ?';
				if (!confirm(label)) {
					return
				}
			}

			// API worker call
			const api_response = await data_manager.request({
				use_worker	: true,
				body		: {
					dd_api	: 'dd_area_maintenance_api',
					action	: 'widget_request',
					source	: {
						type	: 'widget',
						model	: 'database_info',
						action	: 'optimize_tables'
					},
					options	: {
						tables : tables
					}
				},
				retries : 1, // one try only
				timeout : 3600 * 1000 // 1 hour waiting response
			})

			// loading remove
			spinner.remove()
			e.target.classList.remove('lock')

			// remove annoying rqo_string from object
			if (api_response?.debug?.rqo_string) {
				delete api_response.debug.rqo_string
			}

			// response_node pre JSON response
			if (api_response) {
				ui.create_dom_element({
					element_type	: 'pre',
					class_name		: 'response_node',
					inner_html		: JSON.stringify(api_response, null, 2),
					parent			: body_response
				})
			}else{
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'response_node error',
					inner_html		: 'Unknown error calling API',
					parent			: body_response
				})
			}
		}
	})

	// add body_response at end
	optimize_tables_container.appendChild(body_response)


	return optimize_tables_container
}//end render_optimize_tables



/**
* RENDER_CONSOLIDATE_TABLE_SEQUENCES
* @param object self widget instance
* @return HTMLElement consolidate_table_sequences_container
*/
const render_consolidate_table_sequences = (self) => {

	const consolidate_table_sequences_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'group_container consolidate_table_sequences_container'
	})

	// label
	ui.create_dom_element({
		element_type	: 'h3',
		class_name		: 'group_label',
		inner_html		: get_label.consolidate_table_sequences || 'Consolidate table sequences',
		parent			: consolidate_table_sequences_container
	})

	// info_text
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'info_text',
		inner_html		: 'Remunerates table id column to consolidate id sequence from 1,2,... <br>[jer_dd, matrix_ontology, matrix_ontology_main, matrix_dd]',
		parent			: consolidate_table_sequences_container
	})

	const body_response = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'body_response'
	})
	// dblclick event
	const dblclick_handler = (e) => {
		// clean body_response nodes
		while (body_response.firstChild) {
			body_response.removeChild(body_response.firstChild);
		}
	}
	body_response.addEventListener('dblclick', dblclick_handler)

	self.caller.init_form({
		submit_label	: 'Consolidate tables',
		confirm_text	: get_label.seguro || 'Sure?',
		body_info		: consolidate_table_sequences_container,
		body_response	: body_response,
		on_submit		: async (e) => {

			// clean body_response nodes
			while (body_response.firstChild) {
				body_response.removeChild(body_response.firstChild);
			}

			// loading add
			e.target.classList.add('lock')
			const spinner = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'spinner'
			})
			body_response.prepend(spinner)

			// API worker call
			const api_response = await data_manager.request({
				use_worker	: true,
				body		: {
					dd_api			: 'dd_area_maintenance_api',
					action			: 'class_request',
					prevent_lock	: true,
					source	: {
						action : 'consolidate_tables'
					},
					options	: {}
				},
				retries : 1, // one try only
				timeout : 3600 * 1000 // 1 hour waiting response
			})

			// loading  remove
			spinner.remove()
			e.target.classList.remove('lock')

			// remove annoying rqo_string from object
			if (api_response && api_response.debug && api_response.debug.rqo_string) {
				delete api_response.debug.rqo_string
			}

			// response_node pre JSON response
			if (api_response) {
				ui.create_dom_element({
					element_type	: 'pre',
					class_name		: 'response_node',
					inner_html		: JSON.stringify(api_response, null, 2),
					parent			: body_response
				})
			}else{
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'response_node error',
					inner_html		: 'Unknown error calling API',
					parent			: body_response
				})
			}
		}
	})

	// add body_response at end
	consolidate_table_sequences_container.appendChild(body_response)


	return consolidate_table_sequences_container
}//end render_consolidate_table_sequences



/**
* RENDER_REBUILD_USER_STATS
* @param object self widget instance
* @return HTMLElement rebuild_user_stats_container
*/
const render_rebuild_user_stats = (self) => {

	const rebuild_user_stats_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'group_container rebuild_user_stats_container'
	})

	// label
	ui.create_dom_element({
		element_type	: 'h3',
		class_name		: 'group_label',
		inner_html		: get_label.rebuild_user_stats || 'Rebuild user stats',
		parent			: rebuild_user_stats_container
	})

	// info_text
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'info_text',
		inner_html		: 'Re-create the user activity stats, calculated from table matix_activity and saved in section dd1521 as daily summaries.',
		parent			: rebuild_user_stats_container
	})

	const body_response = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'body_response'
	})
	// dblclick event
	const dblclick_handler = (e) => {
		// clean body_response nodes
		while (body_response.firstChild) {
			body_response.removeChild(body_response.firstChild);
		}
	}
	body_response.addEventListener('dblclick', dblclick_handler)

	self.caller.init_form({
		submit_label	: 'Re-build user stats',
		confirm_text	: 'Sure? \nThis action deletes all user dd1521 (User activity) records and recreate the stats records from matrix_activity data.',
		body_info		: rebuild_user_stats_container,
		body_response	: body_response,
		inputs			: [{
			type		: 'text',
			name		: 'users',
			label		: 'User section_id or a sequence as 1,2,3',
			mandatory	: true
		}],
		on_submit	: async (e, values) => {

			// clean body_response nodes
			while (body_response.firstChild) {
				body_response.removeChild(body_response.firstChild);
			}

			// loading add
			e.target.classList.add('lock')
			const spinner = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'spinner'
			})
			body_response.prepend(spinner)

			// value
			const users = values.filter(el => el.name==='users')
				.map(el => el.value)[0]
				.split(',')
				.map(el => el.trim())

			if (!users || users.length < 1) {
				// loading  remove
				spinner.remove()
				e.target.classList.remove('lock')
				return
			}

			// API worker call
			const api_response = await data_manager.request({
				use_worker	: true,
				body		: {
					dd_api			: 'dd_area_maintenance_api',
					action			: 'class_request',
					prevent_lock	: true,
					source	: {
						action : 'rebuild_user_stats'
					},
					options	: {
						users : users // array
					}
				},
				retries : 1, // one try only
				timeout : 3600 * 1000 // 1 hour waiting response
			})

			// loading  remove
			spinner.remove()
			e.target.classList.remove('lock')

			// remove annoying rqo_string from object
			if (api_response && api_response.debug && api_response.debug.rqo_string) {
				delete api_response.debug.rqo_string
			}

			// errors
			if (api_response.errors && api_response.errors.length) {
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'error',
					inner_html		: api_response.errors.join('<br>'),
					parent			: body_response
				})
			}

			// response_node pre JSON response
			if (api_response) {
				ui.create_dom_element({
					element_type	: 'pre',
					class_name		: 'response_node',
					inner_html		: JSON.stringify(api_response, null, 2),
					parent			: body_response
				})
			}else{
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'response_node error',
					inner_html		: 'Unknown error calling API',
					parent			: body_response
				})
			}
		}
	})

	// add body_response at end
	rebuild_user_stats_container.appendChild(body_response)


	return rebuild_user_stats_container
}//end render_rebuild_user_stats



// @license-end
