// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* DATABASE_INFO
* Maintenance widget that exposes live PostgreSQL database diagnostics and
* provides administrator-controlled operations for database optimisation and
* structural repair.
*
* Overview:
*  The widget follows the standard Dédalo widget lifecycle:
*    init() → build() → render() → [refresh cycles] → destroy()
*
*  `build` delegates to widget_common for the generic autoload path, which
*  fires a `get_widget_value` request via `dd_area_maintenance_api` and stores
*  the resulting payload in `this.value`.  The payload shape is:
*    {
*      info    : Object,  // PostgreSQL pg_settings rows keyed by name
*      tables  : string[] // list of user-accessible table names
*      indexes : Object   // map of table_name → index-descriptor[] (see below)
*    }
*  Individual index descriptors carry: indexname, index_size, indexdef.
*
*  Render delegates to render_database_info.prototype.list (assigned as both
*  `edit` and `list` so the widget works in either mode).  All interactive
*  operations (analyze, recreate assets, rebuild indexes/functions/constraints,
*  optimize tables, consolidate sequences, rebuild user stats) are rendered and
*  wired by render_database_info.js, while the actual API calls are implemented
*  as prototype methods on this constructor.
*
* Exported: `database_info` (constructor).
*
* Server peer:  core/area_maintenance/widgets/database_info/class.database_info.php
* API handler:  core/api/v1/common/class.dd_area_maintenance_api.php
*               (actions: get_widget_value, widget_request)
* Render peer:  core/area_maintenance/widgets/database_info/js/render_database_info.js
*
* All API actions in this module use `prevent_lock: true` — maintenance
* operations must not trigger the standard Dédalo record-lock mechanism.
* Timeouts are deliberately large (1 hour, or 5 hours for full index rebuilds)
* because some operations touch every row in every table.
*/



// imports
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {render_database_info} from './render_database_info.js'



/**
* DATABASE_INFO
* Constructor for the database_info maintenance widget.
*
* Instance properties are declared here (undefined unless a default is shown)
* and populated during init/build by the inherited widget_common lifecycle.
*
* @property {string}        id            - Unique instance identifier, set by widget_common.init.
* @property {string}        section_tipo  - Ontology tipo of the owning section.
* @property {string}        section_id    - Record id of the owning section.
* @property {string}        lang          - Active UI language code.
* @property {string}        mode          - Render mode: 'edit' or 'list'.
* @property {Object}        value         - Widget value payload from the API (info, tables, indexes).
* @property {HTMLElement}   node          - Root DOM node, set after render.
* @property {Array}         events_tokens - Event-manager subscriptions for teardown in destroy().
* @property {Array}         ar_instances  - Child widget/component instances managed by this widget.
* @property {string}        status        - Lifecycle state ('building' | 'built').
*/
export const database_info = function() {

	this.id

	this.section_tipo
	this.section_id
	this.lang
	this.mode

	this.value

	this.node

	this.events_tokens	= []
	this.ar_instances	= []

	this.status
}//end database_info



/**
* COMMON FUNCTIONS
* Prototype assignments that wire the standard Dédalo widget lifecycle and
* render methods into database_info without duplicating code.
*
* Lifecycle (from widget_common):
*   init    — sets identity properties (id, tipo, mode, lang, caller…) and
*             subscribes to global event channels.
*   render  — dispatches to this.edit() or this.list() based on this.mode.
*   destroy — unsubscribes all events_tokens and removes the DOM node.
*   refresh — tears down per-render state, re-runs build() then render().
*
* Data (from area_maintenance):
*   get_value — fires a long-lived worker request to retrieve this widget's
*               value payload from dd_area_maintenance_api::get_widget_value.
*
* Render (from render_database_info):
*   edit / list — both delegate to render_database_info.prototype.list, which
*                 builds the full diagnostic panel (DB info, indexes table, and
*                 all maintenance action forms) and returns a wrapper HTMLElement.
*
* Note: the commented-out `build` assignment below is intentional — this widget
* provides its own build() override (see below); do not uncomment it.
*/
// prototypes assign
	// lifecycle
	database_info.prototype.init		= widget_common.prototype.init
	// database_info.prototype.build	= widget_common.prototype.build
	database_info.prototype.render		= widget_common.prototype.render
	database_info.prototype.destroy		= widget_common.prototype.destroy
	database_info.prototype.refresh		= widget_common.prototype.refresh
	database_info.prototype.get_value	= area_maintenance.prototype.get_value
	// // render
	database_info.prototype.edit		= render_database_info.prototype.list
	database_info.prototype.list		= render_database_info.prototype.list



/**
* BUILD
* Custom build overwrites common widget method.
* Delegates to widget_common.prototype.build, then allows for future
* per-widget initialisation inside the try block.
*
* @param {boolean} [autoload=false] - When true, triggers automatic data loading.
* @returns {Promise<boolean>} Resolves with the result of widget_common.prototype.build.
*/
database_info.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await widget_common.prototype.build.call(this, autoload);

	try {

		// data now loads on open via the unified widget load() (see render_area_maintenance)

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* ANALYZE_DB
* Sends a PostgreSQL ANALYZE command to the database server via the maintenance API.
*
* ANALYZE updates the planner statistics for all user tables, helping the query
* planner choose optimal execution plans.  The operation is lightweight compared
* to VACUUM ANALYZE but is still routed through a worker with a 1-hour timeout
* because large databases may take several minutes.
*
* The rqo_string is stripped from the debug payload after the request to avoid
* logging large query objects to the browser console or network inspector.
*
* @returns {Promise<Object>} api_response — standard dd_area_maintenance_api response.
*   api_response.result is truthy on success; api_response.errors is populated on
*   failure.  The caller (render_database_info) is responsible for displaying the
*   result in the body_response node.
*/
database_info.prototype.analyze_db = async function() {

	// API worker call
	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'database_info',
				action	: 'analyze_db'
			},
			options	: {}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})

	// remove annoying rqo_string from object
	if (api_response && api_response.debug && api_response.debug.rqo_string) {
		delete api_response.debug.rqo_string
	}

	return api_response
}//end analyze_db



/**
* RECREATE_DB_ASSETS
* Forces recreate all PostgreSQL main indexes, constraints, extensions and functions.
*
* This is a composite maintenance action: the server-side handler drops and
* recreates all Dédalo-managed PostgreSQL objects in a single transaction.
* Use this when structural repairs are needed after a failed migration, schema
* corruption, or a partial update.  Prefer the individual rebuild_* methods
* (rebuild_db_indexes, rebuild_db_functions, rebuild_db_constraints) when only
* one asset category needs attention.
*
* The operation is routed through a dedicated web worker and carries a 1-hour
* timeout; it must never be called on the main thread.
*
* @returns {Promise<Object>} api_response — standard dd_area_maintenance_api response.
*   api_response.result is truthy on success.
*/
database_info.prototype.recreate_db_assets = async function() {

	// API worker call
	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'database_info',
				action	: 'recreate_db_assets'
			},
			options	: {}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})

	// remove annoying rqo_string from object
	if (api_response && api_response.debug && api_response.debug.rqo_string) {
		delete api_response.debug.rqo_string
	}

	return api_response
}//end recreate_db_assets



/**
* REBUILD_DB_INDEXES
* Forces rebuild PostgreSQL main indexes for a given table or all tables.
*
* When `tables` is omitted, null, undefined, or an empty string the safe_tables
* array is set to [] and the server drops and recreates all Dédalo-managed indexes.
* Passing a table name (string) or an array of names scopes the rebuild to those
* tables only, which is much faster and carries lower risk for production databases.
*
* A 5-hour timeout is used because full index rebuilds on datasets with millions
* of rows can take hours; the operation is routed through a web worker.
*
* @param {string|Array} [tables] - Table name or array of table names to scope
*   the rebuild.  Pass an empty string, null, or undefined to rebuild all indexes.
*   E.g. 'matrix_ontology' or ['matrix_ontology', 'matrix_dd'].
* @returns {Promise<Object>} api_response — standard dd_area_maintenance_api response.
*/
database_info.prototype.rebuild_db_indexes = async function( tables ) {

	// validate tables: if empty, undefined, or empty string, use empty array
	const safe_tables = (!tables || tables === '') ? [] : (Array.isArray(tables) ? tables : [tables]);

	const options = {
		tables : safe_tables
	}

	if(SHOW_DEBUG===true){
		console.log('----> rebuild_db_indexes options', options);
	}

	// API worker call
	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'database_info',
				action	: 'rebuild_db_indexes'
			},
			options	: options
		},
		retries : 1, // one try only
		timeout : 18000 * 1000 // 5 hours waiting response
	})

	// remove annoying rqo_string from object
	if (api_response && api_response.debug && api_response.debug.rqo_string) {
		delete api_response.debug.rqo_string
	}

	return api_response
}//end rebuild_db_indexes



/**
* REBUILD_DB_FUNCTIONS
* Forces rebuilding PostgreSQL main functions.
*
* The server-side handler re-creates all stored procedures and functions
* managed by Dédalo (e.g. full-text search helpers, ontology traversal
* functions, data normalisation triggers).  Call this after deploying a
* server-side update that modifies function signatures or bodies without
* a full schema migration.
*
* @returns {Promise<Object>} api_response — standard dd_area_maintenance_api response.
*/
database_info.prototype.rebuild_db_functions = async function() {

	// API worker call
	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'database_info',
				action	: 'rebuild_db_functions'
			},
			options	: {}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})

	// remove annoying rqo_string from object
	if (api_response && api_response.debug && api_response.debug.rqo_string) {
		delete api_response.debug.rqo_string
	}

	return api_response
}//end rebuild_db_functions



/**
* REBUILD_DB_CONSTRAINTS
* Forces rebuilding PostgreSQL main constraints.
*
* Drops and re-creates all Dédalo-managed CHECK, UNIQUE, FOREIGN KEY, and
* PRIMARY KEY constraints.  Useful when a partial or failed migration left
* constraints in an inconsistent state (e.g. duplicate keys, orphaned references).
* The operation validates referential integrity as part of the rebuild, so it
* will fail — and report an error in api_response.errors — if the data itself
* violates the constraint being added.
*
* @returns {Promise<Object>} api_response — standard dd_area_maintenance_api response.
*/
database_info.prototype.rebuild_db_constraints = async function() {

	// API worker call
	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'database_info',
				action	: 'rebuild_db_constraints'
			},
			options	: {}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})

	// remove annoying rqo_string from object
	if (api_response && api_response.debug && api_response.debug.rqo_string) {
		delete api_response.debug.rqo_string
	}

	return api_response
}//end rebuild_db_constraints



/**
* OPTIMIZE_TABLES
* Re-indexes and vacuum-analyzes the specified PostgreSQL tables.
*
* Combines REINDEX and VACUUM ANALYZE for each requested table so that
* bloated or corrupt indexes are rebuilt and the planner statistics are
* refreshed in a single pass.  Useful after bulk imports, large deletes,
* or significant UPDATE storms that leave pages in a partially-full state.
*
* `tables` is passed through to the server without client-side normalisation;
* the server is responsible for validating the list against an allowed set.
* (!) Passing an arbitrary table name may expose system tables on older server
* versions — always validate on the server side.
*
* @param {string|Array} tables - Comma-separated string or array of table
*   names to optimize.  E.g. ['dd_ontology','matrix_ontology'].
* @returns {Promise<Object>} api_response — standard dd_area_maintenance_api response.
*/
database_info.prototype.optimize_tables = async function(tables) {

	// API worker call
	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
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

	// remove annoying rqo_string from object
	if (api_response && api_response.debug && api_response.debug.rqo_string) {
		delete api_response.debug.rqo_string
	}

	return api_response
}//end optimize_tables



/**
* CONSOLIDATE_TABLES
* Process given tables to consolidate the id numbers.
* Only 'dd_ontology','matrix_ontology','matrix_ontology_main','matrix_dd' are allowed.
*
* Renumbers the id column of each specified table so that id values form a
* contiguous sequence starting from 1.  This operation is needed after mass
* deletions that leave gaps in the sequence, which can exhaust the auto-increment
* counter prematurely on large installations.
*
* (!) DESTRUCTIVE: the renumbering updates all rows and their foreign-key
* references in a single transaction on the server side.  Run only during a
* maintenance window and back up the database first.
*
* Only the four tables listed below are permitted by the server; requests for
* other tables are rejected by the server-side handler.
*
* @param {Array} tables - Array of allowed table names to consolidate.
*   E.g. ['dd_ontology','matrix_ontology','matrix_ontology_main','matrix_dd']
* @returns {Promise<Object>} api_response — standard dd_area_maintenance_api response.
*/
database_info.prototype.consolidate_tables = async function(tables) {

	// API worker call
	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'database_info',
				action	: 'consolidate_tables'
			},
			options	: {
				tables : tables
			}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})


	// remove annoying rqo_string from object
	if (api_response && api_response.debug && api_response.debug.rqo_string) {
		delete api_response.debug.rqo_string
	}

	return api_response
}//end consolidate_tables



/**
* REBUILD_USER_STATS
* Re-creates the user statistics about access and actions based on the activity log.
*
* The server reads raw event rows from the matrix_activity table for each
* supplied user, aggregates them into daily summaries, and writes the results
* into section dd1521 (User activity).  All existing dd1521 records for the
* targeted users are deleted before the new summaries are written.
*
* This method is typically called after importing historical activity data or
* after a data migration that populated matrix_activity without running the
* normal stats pipeline.
*
* @param {Array} users - Array of user section_id values (as strings or numbers)
*   for which stats should be rebuilt.  E.g. ['1','2','3'] or [1,2,3].
* @returns {Promise<Object>} api_response — standard dd_area_maintenance_api response.
*/
database_info.prototype.rebuild_user_stats = async function(users) {

	// API worker call
	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'database_info',
				action	: 'rebuild_user_stats'
			},
			options	: {
				users : users // array
			}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})

	// remove annoying rqo_string from object
	if (api_response && api_response.debug && api_response.debug.rqo_string) {
		delete api_response.debug.rqo_string
	}

	return api_response
}//end rebuild_user_stats



// @license-end
