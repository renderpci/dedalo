// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {data_manager} from '../../../../common/js/data_manager.js'



/**
* RENDER_DATABASE_INFO
* Client-side render module for the database_info maintenance widget.
*
* Builds the full widget UI: a PostgreSQL connection summary block, a collapsible
* index viewer, and a set of administrative action panels (analyze, recreate assets,
* optimize tables, consolidate sequences, rebuild user stats). Each action panel
* calls the corresponding method on the `database_info` widget instance via the
* shared `handle_submit` helper, which manages the lock/spinner/response lifecycle.
*
* This file only produces DOM — all API calls live in database_info.js.
* Consumed by: database_info.prototype.edit / database_info.prototype.list
*   (both aliased to render_database_info.prototype.list in database_info.js).
*
* Main exports:
*   render_database_info  — empty constructor (prototype carrier)
*   render_database_info.prototype.list — async entry point called by the widget
*/



/**
* RENDER_DATABASE_INFO
* Empty constructor used solely as a prototype carrier for the list() render method.
* The real widget instance (database_info) is always passed in as `self` so this
* constructor is never called directly with `new`.
*/
export const render_database_info = function() {

	return true
}//end render_database_info



/**
* LIST
* Creates the nodes of current widget.
* The created wrapper will be append to the widget body in area_maintenance
* @param {Object} options
* 	Sample:
* 	{
*		render_level : "full"
		render_mode : "list"
*   }
* @returns {HTMLElement} wrapper
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
* Assembles the full widget body from the value loaded by the PHP get_value() method.
* The value object shape is:
*   {
*     info    : Object  — pg_version() output plus a 'host' key (PostgreSQL connection info)
*     tables  : Array   — list of table names in the Dédalo schema
*     indexes : Object  — table name → array of index descriptor objects
*   }
*
* The action panels (analyze, recreate assets, etc.) are only rendered when
* self.caller?.init_form is available, i.e. when the widget is running in a context
* that can display a submit form (the normal area_maintenance edit view). In read-only
* or partial-render contexts the panels are omitted.
*
* @param {Object} self - The database_info widget instance
* @returns {HTMLElement} content_data - Root div containing the complete widget body
*/
const get_content_data_edit = async function(self) {

	// short vars
		const value		= self.value || {}
		const info		= value.info || {}
		const database	= info.IntervalStyle || ''
		const server	= info.server || ''
		const host		= info.host || ''
		const indexes 	= value.indexes || []

	// content_data
	const content_data = ui.create_dom_element({
		element_type : 'div'
	})

	// Database info
	// (!) info.IntervalStyle is used as the database identifier — it reflects the PG session
	// interval formatting style (e.g. "postgres"), which doubles as a connection check value.
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: '',
		inner_html		: `Database ${database} ${server} ${host}`,
		parent			: content_data
	})

	// version_info
	// Full pg_version() object pretty-printed so operators can see all PG build details.
	ui.create_dom_element({
		element_type	: 'pre',
		class_name		: 'version_info',
		inner_html		: JSON.stringify(info, null, 2),
		parent			: content_data
	})

	// indexes table
	const indexes_container = render_indexes_table(indexes)
	content_data.appendChild(indexes_container)

	// form init
	if (self.caller?.init_form) {

		// analyze
		const analyze_container = render_analyze(self)
		content_data.appendChild(analyze_container)

		// recreate db assets
		const recreate_db_assets_container = render_recreate_db_assets(self)
		content_data.appendChild(recreate_db_assets_container)

		// backfill search stores
		const backfill_search_stores_container = render_backfill_search_stores(self)
		content_data.appendChild(backfill_search_stores_container)

		// optimize tables
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
* RENDER_INDEXES_TABLE
* Builds a collapsible section that lists all database indexes grouped by table.
* The section header acts as a toggle; clicking it shows or hides the table list.
*
* Each table produces an <h4> heading followed by a <table> with three columns:
*   - Index Name  (index.indexname)
*   - Size        (index.index_size — human-readable string from PostgreSQL)
*   - Definition  (index.indexdef  — the full CREATE INDEX DDL statement)
*
* Tables with no indexes are skipped silently.
*
* @param {Object} indexes - Map of table_name → Array<{indexname, index_size, indexdef}>
*   Produced by class.database_info.php::get_value() via db_tasks::get_table_indexes().
* @returns {HTMLElement} indexes_container - Collapsible div ready to append to content_data
*/
const render_indexes_table = (indexes) => {

	// indexes_container
	const indexes_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'indexes_container'
	})

	// indexes toggle label
	const indexes_label = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'indexes_label icon_arrow',
		inner_html		: get_label.indexes || 'Indexes',
		parent			: indexes_container
	})

	// indexes content container
	// Starts hidden; revealed by the toggle handler below.
	const indexes_content = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'indexes_content hide',
		parent			: indexes_container
	})

	// mouse up event - toggle visibility
	// The 'up' CSS class flips the arrow icon direction to indicate the open state.
	const toggle_handler = (e) => {
		indexes_content.classList.toggle('hide')
		if (indexes_content.classList.contains('hide')) {
			indexes_label.classList.remove('up')
		} else {
			indexes_label.classList.add('up')
		}
	}
	indexes_label.addEventListener('mouseup', toggle_handler)

	// iterate each table group
	for (const table_name in indexes) {
		const table_indexes = indexes[table_name]
		if (!Array.isArray(table_indexes) || table_indexes.length === 0) continue

		// table group header
		ui.create_dom_element({
			element_type	: 'h4',
			class_name		: 'indexes_table_name',
			inner_html		: table_name,
			parent			: indexes_content
		})

		// create table element
		const table = ui.create_dom_element({
			element_type	: 'table',
			class_name		: 'indexes_table',
			parent			: indexes_content
		})

		// table header
		const thead = ui.create_dom_element({
			element_type	: 'thead',
			parent			: table
		})
		const header_row = ui.create_dom_element({
			element_type	: 'tr',
			parent			: thead
		})
		ui.create_dom_element({
			element_type	: 'th',
			inner_html		: get_label.index_name || 'Index Name',
			parent			: header_row
		})
		ui.create_dom_element({
			element_type	: 'th',
			inner_html		: get_label.size || 'Size',
			parent			: header_row
		})
		ui.create_dom_element({
			element_type	: 'th',
			inner_html		: get_label.definition || 'Definition',
			parent			: header_row
		})

		// table body
		const tbody = ui.create_dom_element({
			element_type	: 'tbody',
			parent			: table
		})

		// add rows for each index
		for (const index of table_indexes) {
			const row = ui.create_dom_element({
				element_type	: 'tr',
				parent			: tbody
			})
			ui.create_dom_element({
				element_type	: 'td',
				class_name		: 'index_name',
				inner_html		: index.indexname || '',
				parent			: row
			})
			ui.create_dom_element({
				element_type	: 'td',
				class_name		: 'index_size',
				inner_html		: index.index_size || '',
				parent			: row
			})
			ui.create_dom_element({
				element_type	: 'td',
				class_name		: 'indexdef',
				inner_html		: index.indexdef || '',
				parent			: row
			})
		}
	}

	return indexes_container
}//end render_indexes_table



/**
* HANDLE_SUBMIT
* Shared submit lifecycle handler used by all action panels in this widget.
* Manages the lock/spinner/response pattern:
*   1. Validates arguments (all three are mandatory).
*   2. Clears any previous response content from body_response.
*   3. Adds a CSS 'lock' class to target_lock and prepends a spinner to body_response
*      to give visual feedback during long-running PostgreSQL operations.
*   4. Calls api_call() and waits for the promise.
*   5. Renders the JSON response (or an error node) into body_response.
*   6. Removes the spinner and the lock.
*
* Double-clicking body_response clears its content (wired by each panel's own dblclick handler).
*
* (!) Some operations (e.g. rebuild_db_indexes) can take several hours. The spinner
* remains visible for the full duration of the API call.
*
* @param {HTMLElement} body_response - Target div where the JSON API response is displayed
* @param {HTMLElement} target_lock   - Element that receives the 'lock' CSS class during execution;
*                                      typically the submit button (e.target from on_submit)
* @param {Function}    api_call      - Zero-argument async function that returns the API response
*                                      object; must be an async function or return a Promise
* @returns {Promise<void>}
*/
const handle_submit = async (body_response, target_lock, api_call) => {

	if (!body_response) {
		console.error('Body response div is mandatory.');
		return
	}

	if (!target_lock) {
		console.error('Target lock div is mandatory.');
		return
	}

	if (typeof api_call !== 'function') {
		console.error('Invalid api_call. Expected valid function.');
		return
	}

	// clean body_response nodes
	while (body_response.firstChild) {
		body_response.removeChild(body_response.firstChild);
	}

	// API worker call
	// (!) No form `lock` and no body_response spinner here: build_form already puts a
	// button_spinner on the submit button for the whole request, so both were redundant.
	// `target_lock` is kept in the signature for call-site compatibility but unused.
	const api_response = await api_call();

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
}//end handle_submit



/**
* RENDER_ANALYZE
* Builds the "Analyze database" action panel.
* Running PostgreSQL ANALYZE updates the query planner's statistics, which is useful
* after bulk imports or when query performance degrades. The operation is fast and
* non-destructive.
*
* The panel uses self.caller.init_form() to inject a confirm-before-submit form.
* On submit, self.analyze_db() is called via handle_submit.
* Double-clicking the response area clears the response content.
*
* @param {Object} self - The database_info widget instance (must expose analyze_db())
* @returns {HTMLElement} analyze_container - Section div ready to append to content_data
*/
const render_analyze = (self) => {

	const analyze_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'group_container analyze_container'
	})

	// label
	ui.create_dom_element({
		element_type	: 'h3',
		class_name		: 'group_label',
		inner_html		: get_label.analyze_database || 'Analyze database',
		parent			: analyze_container
	})

	// info_text
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'info_text',
		inner_html		: 'Exec "ANALYZE" command on database for optimal performance.',
		parent			: analyze_container
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

	self.caller?.init_form({
		submit_label	: 'Analyze DB',
		confirm_text	: get_label.sure || 'Sure?',
		body_info		: analyze_container,
		body_response	: body_response,
		on_submit		: async (e) => {

			await handle_submit(
				body_response,
				e.target,
				self.analyze_db
			)
		}
	})

	// add body_response at end
	analyze_container.appendChild(body_response)


	return analyze_container
}//end render_analyze



/**
* RENDER_RECREATE_DB_ASSETS
* Builds the "Recreate database assets" action panel.
* Calling recreate_db_assets triggers a full PostgreSQL maintenance pass:
* extensions → constraints → functions → indexes → maintenance tasks.
* This is a long-running, high-impact operation (up to 1 hour timeout).
*
* The panel exposes a collapsible "Options" sub-section containing three
* individual sub-panels that target narrower scopes of the same operation:
*   - render_rebuild_indexes   — re-index only
*   - render_rebuild_functions — PL/pgSQL functions only
*   - render_rebuild_constraints — constraints only
* All three sub-panels share the same body_response element so their output
* appears in the same response area as the top-level action.
*
* @param {Object} self - The database_info widget instance
* @returns {HTMLElement} recreate_db_assets_container - Section div ready to append
*/
const render_recreate_db_assets = (self) => {

	const recreate_db_assets_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'group_container recreate_db_assets_container'
	})

	// label
	ui.create_dom_element({
		element_type	: 'h3',
		class_name		: 'group_label',
		inner_html		: get_label.recreate_db_assets || 'Recreate database assets',
		parent			: recreate_db_assets_container
	})

	// info_text
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'info_text',
		inner_html		: 'Forces recreate all PostgreSQL main indexes, constraints, extensions and functions.',
		parent			: recreate_db_assets_container
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

	self.caller?.init_form({
		submit_label	: 'Re-create db assets',
		confirm_text	: get_label.sure || 'Sure?',
		body_info		: recreate_db_assets_container,
		body_response	: body_response,
		on_submit		: async (e) => {

			await handle_submit(
				body_response,
				e.target,
				self.recreate_db_assets
			)
		}
	})

	// specific options
	// The options label is a collapsible toggle for the sub-operation panels.
	const recreate_db_options_label = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'recreate_db_options_label icon_arrow ',
		inner_html		: get_label.options || 'Options',
		parent			: recreate_db_assets_container
	})
	// mouse up event
	// Mirrors the indexes toggle pattern: 'up' class flips the arrow icon.
	const options_mouse_up = (e) => {
		recreate_db_options_container.classList.toggle('hide');
		if( recreate_db_options_container.classList.contains('hide') ){
			recreate_db_options_label.classList.remove('up')
		}else{
			recreate_db_options_label.classList.add('up')
		}
	}
	recreate_db_options_label.addEventListener('mouseup', options_mouse_up)

	// db options container
	const recreate_db_options_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'recreate_db_options_container hide',
		parent			: recreate_db_assets_container
	})

	// render rebuild indexes
	const rebuild_indexes_container = render_rebuild_indexes(self, body_response)
	recreate_db_options_container.appendChild(rebuild_indexes_container)

	// render rebuild functions
	const rebuild_functions_container = render_rebuild_functions(self, body_response)
	recreate_db_options_container.appendChild(rebuild_functions_container)


	// render rebuild constraints
	const rebuild_constraints_container = render_rebuild_constraints(self, body_response)
	recreate_db_options_container.appendChild(rebuild_constraints_container)

	// add body_response at end
	recreate_db_assets_container.appendChild(body_response)


	return recreate_db_assets_container
}//end render_recreate_db_assets



/**
* RENDER_REBUILD_INDEXES
* Builds the "Rebuild indexes" sub-panel inside the "Recreate database assets" options section.
* Issues a REINDEX command for all PostgreSQL indexes in the Dédalo schema, or for a
* single table when the user selects one from the dropdown.
*
* The available table list comes from self.value.tables (populated by get_value on the PHP side).
* An empty selection rebuilds indexes on all tables (the PHP side interprets an empty tables
* array as "all").
*
* This sub-panel shares body_response with its parent render_recreate_db_assets panel so
* output is always visible even if the options section is collapsed.
*
* @param {Object}      self          - The database_info widget instance (exposes rebuild_db_indexes())
* @param {HTMLElement} body_response - Shared response area from the parent panel
* @returns {HTMLElement} rebuild_indexes_container
*/
const render_rebuild_indexes = (self, body_response) => {

	const tables = self.value?.tables || [];

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
		inner_html		: 'Forces rebuild PostgreSQL main indexes.',
		parent			: rebuild_indexes_container
	})

	self.caller?.init_form({
		submit_label	: 'Re-build indexes',
		confirm_text	: get_label.sure || 'Sure?',
		body_info		: rebuild_indexes_container,
		body_response	: body_response,
		inputs			: [{
			type		: 'select',
			name		: 'table',
			label		: 'Table',
			options		: tables,
			mandatory	: false
		}],
		on_submit		: async (e, values) => {

			// get table value
			// values is an array of {name, value} descriptors from init_form inputs.
			const table = values.find(el => el.name === 'table')?.value;

			await handle_submit(
				body_response,
				e.target,
				async () => {
					return await self.rebuild_db_indexes(table)
				}
			)
		}
	})


	return rebuild_indexes_container
}//end render_rebuild_indexes



/**
* RENDER_REBUILD_FUNCTIONS
* Builds the "Rebuild functions" sub-panel inside the "Recreate database assets" options section.
* Issues a CREATE OR REPLACE for all Dédalo PL/pgSQL stored functions.
* Useful after a schema migration or when a function upgrade was interrupted.
*
* Shares body_response with the parent panel (see render_recreate_db_assets).
*
* @param {Object}      self          - The database_info widget instance (exposes rebuild_db_functions())
* @param {HTMLElement} body_response - Shared response area from the parent panel
* @returns {HTMLElement} rebuild_functions_container
*/
const render_rebuild_functions = (self, body_response) => {

	const rebuild_functions_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'group_container rebuild_functions_container'
	})

	// label
	ui.create_dom_element({
		element_type	: 'h3',
		class_name		: 'group_label',
		inner_html		: get_label.rebuild_functions || 'Rebuild functions',
		parent			: rebuild_functions_container
	})

	// info_text
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'info_text',
		inner_html		: 'Forces rebuilding PostgreSQL main functions.',
		parent			: rebuild_functions_container
	})

	self.caller?.init_form({
		submit_label	: 'Re-build functions',
		confirm_text	: get_label.sure || 'Sure?',
		body_info		: rebuild_functions_container,
		body_response	: body_response,
		on_submit		: async (e) => {

			await handle_submit(
				body_response,
				e.target,
				self.rebuild_db_functions
			)
		}
	})


	return rebuild_functions_container
}//end render_rebuild_functions



/**
* RENDER_BACKFILL_SEARCH_STORES
* Builds the "Backfill search stores" action panel.
* Truncates and refills the two derived search stores (matrix_string_search,
* matrix_relation_index) from the source matrix tables — the same data the
* sync triggers maintain on every write. Run it after "Recreate database
* assets" whenever the stores are missing rows: an instance upgraded from a
* previous v7 beta, or a restore that skipped them. While a store refills,
* searches on it wait; with a store empty-but-required the server refuses
* relation searches loudly, and this action is the remediation it names.
*
* @param {Object} self - The database_info widget instance
* @returns {HTMLElement} backfill_search_stores_container - Section div ready to append
*/
const render_backfill_search_stores = (self) => {

	const backfill_search_stores_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'group_container backfill_search_stores_container'
	})

	// label
	ui.create_dom_element({
		element_type	: 'h3',
		class_name		: 'group_label',
		inner_html		: get_label.backfill_search_stores || 'Backfill search stores',
		parent			: backfill_search_stores_container
	})

	// info_text
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'info_text',
		inner_html		: 'Rebuilds the derived search stores (matrix_string_search, matrix_relation_index) from the record data. Use after "Recreate database assets" on databases created by a previous beta. Takes minutes on large databases.',
		parent			: backfill_search_stores_container
	})

	const body_response = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'body_response'
	})
	// dblclick event. clean body_response nodes
	body_response.addEventListener('dblclick', () => {
		while (body_response.firstChild) {
			body_response.removeChild(body_response.firstChild);
		}
	})

	self.caller?.init_form({
		submit_label	: 'Backfill search stores',
		confirm_text	: get_label.sure || 'Sure?',
		body_info		: backfill_search_stores_container,
		body_response	: body_response,
		on_submit		: async (e) => {

			await handle_submit(
				body_response,
				e.target,
				self.backfill_search_stores
			)
		}
	})

	// add body_response at end
	backfill_search_stores_container.appendChild(body_response)

	return backfill_search_stores_container
}//end render_backfill_search_stores



/**
* RENDER_REBUILD_CONSTRAINTS
* Builds the "Rebuild constraints" sub-panel inside the "Recreate database assets" options section.
* Re-applies all PostgreSQL CHECK / FOREIGN KEY / UNIQUE / PRIMARY KEY constraints to the
* Dédalo schema. Useful after bulk data loads that temporarily dropped constraints for speed.
*
* Shares body_response with the parent panel (see render_recreate_db_assets).
*
* @param {Object}      self          - The database_info widget instance (exposes rebuild_db_constraints())
* @param {HTMLElement} body_response - Shared response area from the parent panel
* @returns {HTMLElement} rebuild_constraits_container
*/
const render_rebuild_constraints = (self, body_response) => {

	const rebuild_constraits_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'group_container rebuild_constraits_container'
	})

	// label
	ui.create_dom_element({
		element_type	: 'h3',
		class_name		: 'group_label',
		inner_html		: get_label.rebuild_constraints || 'Rebuild constraints',
		parent			: rebuild_constraits_container
	})

	// info_text
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'info_text',
		inner_html		: 'Forces rebuilding PostgreSQL main constraints.',
		parent			: rebuild_constraits_container
	})

	self.caller?.init_form({
		submit_label	: 'Re-build constraints',
		confirm_text	: get_label.sure || 'Sure?',
		body_info		: rebuild_constraits_container,
		body_response	: body_response,
		on_submit		: async (e) => {

			await handle_submit(
				body_response,
				e.target,
				self.rebuild_db_constraints
			)
		}
	})


	return rebuild_constraits_container
}//end render_rebuild_constraints



/**
* RENDER_OPTIMIZE_TABLES
* Builds the "Optimize tables" action panel.
* Runs REINDEX + VACUUM ANALYZE on the selected tables. The user provides a
* comma-separated list of table names; the field is pre-populated with all known
* tables from self.value.tables.
*
* Guard: when the user submits the full list of tables (all tables selected), a
* native confirm() dialog is shown as an extra safety check because the operation
* locks each table exclusively during REINDEX.
*
* (!) Uses `spinner` inside the async callback closure but `spinner` is defined in
* handle_submit's local scope, not accessible here. The `spinner.remove()` and
* `e.target.classList.remove('lock')` calls inside the on_submit callback will throw
* a ReferenceError if the early-exit branches are reached (tables empty). This is a
* pre-existing code issue; do not change it.
*
* @param {Object} self - The database_info widget instance (exposes optimize_tables())
* @returns {HTMLElement} optimize_tables_container
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

	self.caller?.init_form({
		submit_label	: 'Optimize tables',
		confirm_text	: get_label.sure || 'Sure?',
		body_info		: optimize_tables_container,
		body_response	: body_response,
		inputs			: [{
			type		: 'text',
			name		: 'tables',
			label		: 'Tables list as dd_ontology, matrix_ontology, matrix',
			value		: source_tables.join(','),
			mandatory	: true
		}],
		on_submit	: async (e, values) => {

			await handle_submit(
				body_response,
				e.target,
				async () => {
					// value
					// Parse the comma-separated input string into a trimmed array of table names.
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
						// Extra safety confirm when every known table is included —
						// the operation will take a long time and lock all tables.
						const label = (get_label.all || 'All') + ' ?';
						if (!confirm(label)) {
							return
						}
					}

					// API worker call
					return await self.optimize_tables(tables)
				}
			);
		}
	})

	// add body_response at end
	optimize_tables_container.appendChild(body_response)


	return optimize_tables_container
}//end render_optimize_tables



/**
* RENDER_CONSOLIDATE_TABLE_SEQUENCES
* Builds the "Consolidate table sequences" action panel.
* Renumbers the `id` column of the selected tables to close gaps introduced by
* deletions, resetting the PostgreSQL sequence so that the next auto-increment id
* follows immediately after the highest existing id.
*
* Allowed tables (enforced on the PHP side as well):
*   dd_ontology, matrix_ontology, matrix_ontology_main, matrix_dd
*
* The user input is pre-populated with all four tables. A full-list confirm() is
* shown when all four are submitted, because renumbering changes existing ids and
* any stale cached references will become invalid.
*
* (!) Same `spinner` ReferenceError caveat as render_optimize_tables applies here
* for the early-exit branches. Pre-existing issue; do not change.
*
* @param {Object} self - The database_info widget instance (exposes consolidate_tables())
* @returns {HTMLElement} consolidate_table_sequences_container
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
		inner_html		: 'Remunerates table id column to consolidate id sequence from 1,2,... <br>[dd_ontology, matrix_ontology, matrix_ontology_main, matrix_dd]',
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

	// tables
	// Hard-coded allowlist matching the PHP-side enforcement in class.database_info.php::consolidate_tables().
	const source_tables = ['dd_ontology','matrix_ontology','matrix_ontology_main','matrix_dd']

	self.caller?.init_form({
		submit_label	: 'Consolidate tables',
		confirm_text	: get_label.sure || 'Sure?',
		body_info		: consolidate_table_sequences_container,
		body_response	: body_response,
		inputs			: [{
			type		: 'text',
			name		: 'tables',
			label		: 'Tables list as dd_ontology,matrix_ontology,matrix',
			value		: source_tables.join(','),
			mandatory	: true
		}],
		on_submit		: async (e, values) => {

			await handle_submit(
				body_response,
				e.target,
				async () => {
					// value
					// Parse the comma-separated input string into a trimmed array of table names.
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
						// Extra safety confirm when all four allowed tables are included —
						// renumbering ids invalidates any cached references to those records.
						const label = (get_label.all || 'All') + ' ?';
						if (!confirm(label)) {
							return
						}
					}

					// API worker call
					return await self.consolidate_tables( tables )
				}
			);
		}
	})

	// add body_response at end
	consolidate_table_sequences_container.appendChild(body_response)


	return consolidate_table_sequences_container
}//end render_consolidate_table_sequences



/**
* RENDER_REBUILD_USER_STATS
* Builds the "Rebuild user stats" action panel.
* Deletes all dd1521 (User activity) records for the specified users and regenerates
* them by aggregating data from the matrix_activity table into daily summaries.
* This is needed after activity data corrections or when stats become inconsistent.
*
* The user provides a comma-separated list of section_id values identifying which
* users to process. At least one id is required (mandatory input).
*
* (!) Same `spinner` ReferenceError caveat as render_optimize_tables applies here
* for the early-exit branches. Pre-existing issue; do not change.
*
* @param {Object} self - The database_info widget instance (exposes rebuild_user_stats())
* @returns {HTMLElement} rebuild_user_stats_container
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

	self.caller?.init_form({
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
		on_submit		: async (e, values) => {

			await handle_submit(
				body_response,
				e.target,
				async () => {
					// value
					// Parse the comma-separated section_id input into a trimmed string array.
					// Integer casting is performed on the PHP side inside rebuild_user_stats().
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
					return await self.rebuild_user_stats(users)
				}
			);
		}
	})

	// add body_response at end
	rebuild_user_stats_container.appendChild(body_response)


	return rebuild_user_stats_container
}//end render_rebuild_user_stats



// @license-end
