// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals, SHOW_DEBUG, get_label, Promise */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from './data_manager.js'



/**
* INSTANCES CACHE STORE
* Create the cache instances const.
* The cache will be the storage for all active instances of the components.
* type: array of objects, every object will be one instance
* Sample:
* [
*  {
*	"model"			: "component_input_text",
*	"tipo"			: "oh15",
*	"section_tipo"	: "oh1",
*	"section_id"	: "2",
*	"mode"			: "edit",
*	"lang"			: "lg-eng",
*	"key"			: "component_input_text_oh15_oh1_2_edit_lg-eng",
*	"instance"		: {instance_object}
*  }
* ]
*/
export const instances = []



/**
* GET_INSTANCE
* Get the instance, first use the storage of the instances cache, if the instance is not init will be create and stored for use.
* for create the instance is necessary access to every init code of every component, do it take time,
* and this method create one promise to wait for the creation instance of every component,
* @param object options
* Sample:
* {
*	"model"			: "component_input_text",
*	"tipo"			: "oh15",
*	"section_tipo"	: "oh1",
*	"section_id"	: "2",
*	"mode"			: "edit",
*	"lang"			: "lg-eng"
* }
* @return promise
*/
export const get_instance = async function(options) {

	// options. main vars
		const tipo			= options.tipo
		const section_tipo	= options.section_tipo
		const section_id	= options.section_id // string format

	// options. optional vars (only mandatory to build the instance)
		const mode	= options.mode  || 'list'
		const lang	= options.lang  || page_globals.dedalo_data_lang || null

	// Resolve the model if not provided
		const model = options.model || await ( async () => {

			if (!tipo) {
				console.error('Error: unable to get element context without tipo. options:', options);
				return null
			}

			const element_context_response = await data_manager.get_element_context({
				tipo			: tipo,
				section_tipo	: section_tipo,
				section_id		: section_id
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

	// Fill missing options with defaults
		if (!options.model) {
			options.model = model
		}
		if (!options.mode) {
			options.mode = mode
		}
		if (!options.lang) {
			options.lang = lang
		}

	// key. build the key locator of the instance
		const key = options.key || key_instances_builder(options)

	// search. Check if the instance is already in the cache
		const instances_length = instances.length
		for (let i = instances_length - 1; i >= 0; i--) {
			if (instances[i].id===key) {
				// if(SHOW_DEBUG===true) {
				// 	console.log('))))) found_instance:', instances[i]);
				// }
				return instances[i]
			}
		}

	// Return a promise that resolves the instance
	return new Promise(async function(resolve) {

		// element file import path. Determine the path for importing the module
		// import element module file once (and wait until finish)
		const module = (()=>{
			switch (true) {

				// tools (/tools: tool_transcriptions, tool_upload, ...)
				case (model.indexOf('tool_')!==-1) : {
					const short_path = model + '/js/' + model
					return import(`../../../tools/${short_path}.js`)
				}

				// service (/core/services: servide_time_machine, service_autocomplete, ..)
				case (model.indexOf('service_')!==-1) : {
					const short_path = model + '/js/' + model
					return import(`../../../core/services/${short_path}.js`)
				}

				// default (/core: page, section, menu, components..)
				default: {
					const short_path = model + '/js/' + model
					return import(`../../../core/${short_path}.js`)
				}
			}
		})()
		.then(async function(module) {

			// check module
				const module_main_function = model
				if (typeof module[module_main_function]!=='function') {
					console.warn(`Invalid module main function. It should be named as the model: ${model}`);
					return resolve(null)
				}

			// instance the element
				const instance_element = new module[module_main_function]()

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
				instances.push(instance_element)

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
* Get all created instances from global 'instances' array list
* where are stored the new instances
* @return array instances
*/
export const get_all_instances = function() {

	return instances
}//end get_all_instances



/**
* DELETE_INSTANCE
* Delete the found instance/s from global 'instances' array list
* @param object options
* @return int deleted
*/
export const delete_instance = async function(options) {

	let deleted = 0;
	function check_options(item, index) {

		// check all received properties to match instance
		let result = false
		for(let key in options) {

			const value = options[key]
			if (value===null) {
				continue; // ignore null options
			}

			if (item[key]===value) {
				result = true
			}else{
				result = false
				break;
			}
		}

		if (result===true) {
			instances.splice(index, 1)
			deleted++
		}

		return result
	}
	const found_instances = instances.filter(check_options)
	if (found_instances.length===0) {
		// No instances found for deletion
		console.warn('Instance not found for deletion. From options:', options);
	}


	return deleted
}//end delete_instance



/**
* FIND_INSTANCES
* Get all created instances from global 'instances' array list
* that matches the given options
* @param object options
* @return array found_instances
*/
export const find_instances = function(options) {

	const tipo			= options.tipo
	const section_tipo	= options.section_tipo
	const section_id	= options.section_id
	const mode			= options.mode
	const lang			= options.lang

	const found_instances = instances.filter(el =>
		el.tipo			=== tipo &&
		el.section_tipo	=== section_tipo &&
		el.section_id	=== section_id &&
		el.mode			=== mode &&
		el.lang			=== lang
	)

	return found_instances
}//end find_instances



/**
* KEY_INSTANCES_BUILDER
* Creates string normalized key from several parameters
* @param object options
* @return string key
*/
export const key_instances_builder = function(options) {

	const order = ['model','tipo','section_tipo','section_id','mode','lang','parent','matrix_id','id_variant','column_id']
	const key_parts = []

	const order_length = order.length
	for (let i = 0; i < order_length; i++) {

		const current_value = options[order[i]] ? options[order[i]].toString() : '';
		if (options.hasOwnProperty(order[i]) && typeof current_value!=='undefined' && current_value!==null && current_value.length>0){
			key_parts.push( options[order[i]] )
		}
	}

	// join all non empty elements in an string used as id for the instance
	const key = key_parts.join('_')


	return key
}//end key_instances_builder



// @license-end
