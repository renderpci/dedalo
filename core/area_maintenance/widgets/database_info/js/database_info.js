// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {render_database_info} from './render_database_info.js'



/**
* DATABASE_INFO
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
* extend functions from common
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
* Custom build overwrites common widget method
* @param bool autoload = false
* @return bool
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
* Exec "ANALYZE" command on database for optimal performance.
* @return promise - api_response
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
* @return promise - api_response
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
* Forces rebuild PostgreSQL main indexes.
* @param {string} table - Table name to rebuild indexes for
* @return promise - api_response
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
* @return promise - api_response
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
* @return promise - api_response
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
* Forces rebuilding PostgreSQL main constraints.
* @return promise - api_response
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
* @param array tables
* 	E.g. ['dd_ontology','matrix_ontology','matrix_ontology_main','matrix_dd']
* @return promise - api_response
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
* @param array users
* @return promise - api_response
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
