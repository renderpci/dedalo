// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals, SHOW_DEBUG, get_label, Promise */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from './data_manager.js'



/**
* INSTANCES_MAP
* Create the cache instances const.
* The cache will be the storage for all active instances of the components, sections, areas, widgets, services, menu, etc.
* type: Map, every value will be one instance
* Sample:
* [Entries] [{
*	"key": "component_input_text_test52_test3_tm_lg-eng",
*	"value": {
*		"id": "component_input_text_test52_test3_tm_lg-eng",
*		"model": "component_input_text",
*		"tipo": "test52",
*		"section_tipo": "test3",
*		"mode": "tm",
*		"lang": "lg-eng",
*		"context": null,
*		"data": null,
*		"node": null,
*		"tools": null,
*		"duplicates": false,
*		"minimum_width_px": 90,
*		"q_split": true,
*		"id_base": "test3__test52",
*		"is_init": true,
*		"status": "initialized",
*		"matrix_id": null,
*		"type": "component",
*		"datum": null,
*		"events_tokens": [],
*		"ar_instances": [],
*		"standalone": true,
*		"active": false,
*		"change_value_pool": [],
*		"is_data_changed": false,
*		"init_events_subscribed": false,
*		"saving": false
*	}
* }]
*/
const instances_map = new Map();



/**
 * KEY_ORDER
 * Defines de vars and the order to create the instances key
 */
const key_order = ['model','tipo','section_tipo','section_id','mode','lang','parent','matrix_id','id_variant','column_id'];



/**
* GET_INSTANCE
*
* Returns an instance of a component by either retrieving it from a cache or dynamically importing and initializing it.
*
* - If the instance is cached, it is returned immediately.
* - If not cached, the appropriate module is dynamically imported based on the model name, instantiated, initialized, cached, and returned.
* - If `model` is not provided in the options, it is resolved via an API call to `data_manager.get_element_context`.
*
* This method is asynchronous and returns a `Promise` that resolves to the component instance.
*
* @param object options - Configuration options for creating or retrieving an instance.
* Sample:
* {
*	"model"			: "component_input_text",
*	"tipo"			: "oh15",
*	"section_tipo"	: "oh1",
*	"section_id"	: "2",
*	"mode"			: "edit",
*	"lang"			: "lg-eng"
* }
* @return promise - A promise resolving to the instance or `null` on failure.
*/
export const get_instance = async function(options) {
	const start = performance.now()

	// options. main vars
		const tipo			= options.tipo
		const section_tipo	= options.section_tipo
		const section_id	= options.section_id // string format

	// options. optional vars (only mandatory to build the instance)
		const mode	= options.mode  || 'list'
		const lang	= options.lang  || page_globals.dedalo_data_lang || null

	// Resolve the model if not provided
		const model = options.model || await ( async () => {
			// fetch context and model from backend

			if (!tipo) {
				console.error('Error: unable to get element context without tipo. options:', options);
				return null
			}

			const element_context_response = await data_manager.get_element_context({
				tipo			: tipo,
				section_tipo	: section_tipo,
				section_id		: section_id,
				mode			: mode
			})

			if(SHOW_DEBUG===true || !element_context_response.result) {
				console.warn('// [get_instance] element_context API response:', element_context_response);
			}

			// resolved model
			const resolved_model = element_context_response.result?.[0]?.model;
			if (!resolved_model) {
				console.error('Error: unable to resolve element context. options:', options);
				return null;
			}

			// set context if is not already set
			if(typeof options.context==='undefined'){
				// inject context to options
				options.context	= element_context_response.result[0]
			}

			// lang. Set again from more reliable calculated context
			// Note that some components may change their lang depending on whether they are with_lang_versions or allow transliteration.
			options.lang = element_context_response.result[0].lang

			return resolved_model
		})();

		if (!model) {
			console.error('Error: unable to resolve instance model. options:', options);
			return null
		}

		// Ensure required options are set.
		// Fill missing options with defaults. Note that whole options will be passed to the new instance
		if (!options.model) {
			options.model = model
		}
		if (!options.mode) {
			options.mode = mode
		}
		if (!options.lang) {
			options.lang = lang
		}

	// key. Build instance key of the instance.
		const key = options.key || key_instances_builder(options)

	// search. Check if the instance is already in the cache
		const found_instance = instances_map.get(key)
		if (found_instance) {
			return found_instance;
		}

	// Return a promise that resolves the instance
	return new Promise(function(resolve) {

		// Determine module path
		const module_path = model.startsWith('tool_')
		  ? `../../../tools/${model}/js/${model}.js` // tools
		  : model.startsWith('service_')
		  ? `../../../core/services/${model}/js/${model}.js` // services
		  : `../../../core/${model}/js/${model}.js`; // default

		// import element module file once (and wait until finish)
		import(module_path)
		.then(async function(module) {

			// check module
				const module_main_function = model
				if (typeof module[module_main_function]!=='function') {
					console.warn(`Invalid module main function. It should be named as the model: ${model}`);
					return resolve(null)
				}

			// instance the element
				const instance_element = new module[module_main_function]()

				if (typeof instance_element !== 'object') {
					console.warn(`Module "${model}" is not an valid object.`);
					return null;
				}

			// serialize element id
			// add the id for init the instance with the id
				instance_element.id			= key
				instance_element.id_base	= [section_tipo, section_id, tipo].join('_')
			// id_variant. Propagate a custom instance id to children
				if (options.id_variant) {
					instance_element.id_variant = options.id_variant
				}

			// init the element
				await instance_element.init(options)

			// add to the instances cache
				instances_map.set(key, instance_element)

			// return the new created instance
				resolve(instance_element)
		})
		.catch((error) => {
			console.error(`Error importing ES6 module [model:${model}]`, error);
			resolve(null)
		});
	})
	.catch(err => { console.error(err) });
}//end get_instance



/**
* GET_ALL_INSTANCES
* Retrieves all created instances stored in the `instances_map` as an array.
* @return array instances - Array of objects (instances)
*/
export const get_all_instances = function() {

	return [...instances_map.values()]
}//end get_all_instances



/**
* FIND_INSTANCES
* Get all created instances from global instances_map
* that matches the given options
* @param object options
* @return array found_instances
*/
export const find_instances = function(options) {

	if (!options || typeof options !== 'object') return [];

	// options
	const {
		tipo,
		section_tipo,
		section_id,
		mode,
		lang
	} = options;

	const found_instances = []
	for (const instance of instances_map.values()) {

		if (instance.tipo === tipo &&
			instance.section_tipo === section_tipo &&
			instance.section_id === section_id &&
			instance.mode === mode &&
			instance.lang === lang
			) {

			found_instances.push( instance );
		}
	}

	return found_instances
}//end find_instances



/**
* DELETE_INSTANCE
* Delete one instance based in given key if exists.
* The key is the 'instances_map' key, which is equal to the instance ID.
* @param string key
* 	An string used to match the map element by key.
* 	E.g. 'component_input_text_rsc21_rsc170_1_edit_lg-nolan_12711607_tool_time_machine'
* @returns bool
* 	This is true if the instance exists and has been deleted successfully; otherwise, it is false.
*/
export const delete_instance = function(key) {

	// check the options
	if (!key || key.length === 0) {
		console.warn('Ignored delete_instance. Empty key', key);
		return false
	}

	const result = instances_map.delete( key )


	return result;
}//end delete_instance



/**
* DELETE_INSTANCES
* Delete the found multiple instance/s from the 'instances_map' based on options.
* @param object options
* 	An object containing key-value pairs to match against instances.
* @returns int deleted_count
* 	The number of instances deleted.
*/
export const delete_instances = function(options) {

	// check the options
	if (!options || Object.keys(options).length === 0) {
		console.warn('Ignored delete_instances. Empty options', options);
		return 0
	}

	let deleted_count = 0;

	for (const [map_key, item] of instances_map.entries()) {

		let match = true;

		// check all properties defined in options.
		for (const key in options) {
			if (Object.prototype.hasOwnProperty.call(options, key)) {

				const expected	= options[key];
				const actual	= item[key];

				if (expected != null && expected !== actual) {
					match = false;
					break; // There is no need to check the other keys if one of them does not match.
				}
			}
		}

		// If all options properties match, delete it
		if (match) {
			instances_map.delete(map_key)
			deleted_count++;
		}
	}


	return deleted_count;
}//end delete_instances



/**
* KEY_INSTANCES_BUILDER
* Builds a normalized string key from selected properties of the given `options` object.
* The key is used to uniquely identify an instance based on a defined order of parameters.
* @param object options
* @return string key - A concatenated, underscore-delimited string key composed of non-empty values.
*/
export const key_instances_builder = function(options) {

	const key_parts = []

	for (const prop of key_order) {
		const value = options[prop];
		if (value !== undefined && value !== null && value !== '') {
			const string_value = String(value);
			key_parts.push(string_value);
		}
	}

	// join all non empty elements in an string used as ID for the instance
	const key = key_parts.join('_')


	return key
}//end key_instances_builder



// @license-end
