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
* Instances format: [{
*					"model"			: "component_input_text",
*					"tipo"			: "oh15",
*					"section_tipo"	: "oh1",
*					"section_id"	: "2",
*					"mode"			: "edit",
*					"lang"			: "lg-eng",
*					"key"			: "component_input_text_oh15_oh1_2_edit_lg-eng",
*					"instance"		: {instance_object}
*					}]
*/
export const instances = []



/**
* GET_INSTANCE
* Get the instance, first use the storage of the instances cache, if the instance is not init will be create and stored for use.
* for create the instance is necessary access to every init code of every component, do it take time,
* and this method create one promise to wait for the creation instance of every component,
* @param object options
* Sample:
*	{
*		"model"			: "component_input_text",
*		"tipo"			: "oh15",
*		"section_tipo"	: "oh1",
*		"section_id"	: "2",
*		"mode"			: "edit",
*		"lang"			: "lg-eng"
*	}
* @return promise
*/
export const get_instance = async function(options){

	// if(options.model==='section') console.log("=========================================== get_instance options:",options);
	// key values ['model','tipo','section_tipo','section_id','mode','lang']

	// options. mandatory vars
		const tipo				= options.tipo
		const section_tipo		= options.section_tipo
		const section_id		= options.section_id // string format

	// options. optional vars (only mandatory for build the instance)
		const direct_path		= options.direct_path
		const mode				= options.mode  || 'list'
		const lang				= options.lang  || page_globals.dedalo_data_lang || null
		const model				= options.model || await ( async () => {

			const element_context_response = await data_manager.get_element_context({
				tipo			: tipo,
				section_tipo	: section_tipo,
				section_id		: section_id
			})
			if(SHOW_DEBUG===true) {
				console.log("// [get_instance] element_context API response:", element_context_response);
				console.trace();
			}

			// resolved model
			const resolved_model = element_context_response.result[0].model

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

		// options fill empty
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
		//if (model!=='section_record') {
		//	key = key_instances_builder(options) + "_" + Date.now()
		//}
		// console.log("key:",key, options);

	// if the instance is not in the cache, build one new instance of the element
		// DES
			// const load_instance = async () => {

			// 	// search. first we see if the instance is inside the instances cache
			// 	const found_instance = instances.filter(instance => instance.id===key)

			// 	if (found_instance.length===0) {
			// 		//console.log("---Creating instance of:", model, tipo, " - " + key)

			// 		// element file import path
			// 			const base_path = model.indexOf('tool_') !== -1 ? '../../../tools/' : '../../'
			// 			const path = base_path + model + '/js/' + model + '.js' // + '?v=' + page_globals.dedalo_version

			// 		// import element mod file once (and wait until finish)
			// 			const current_element = await import(path)

			// 		// check
			// 			if (typeof current_element[model]!=="function") {
			// 				console.warn(`------- INVALID MODEL!!! [${model}] path:`, path);
			// 				return null
			// 			}

			// 		// instance the element
			// 			const instance_element = new current_element[model]()

			// 		// serialize element id
			// 		// add the id for init the instance with the id
			// 			instance_element.id = key
			// 			//instance_element.id_base = key_instances_builder(options, false)
			// 			instance_element.id_base = section_tipo+'_'+section_id+'_'+tipo
			// 		// id_variant . Propagate a custom instance id to children
			// 			if (options.id_variant) {
			// 				instance_element.id_variant = options.id_variant
			// 			}

			// 		// init the element
			// 			await instance_element.init(options)

			// 		// add to the instances cache
			// 			instances.push(instance_element)

			// 			// console.log("Created fresh instance of :", model, section_tipo, section_id, key, instance_element.label)

			// 		// return the new created instance
			// 			return instance_element

			// 	}else{
			// 		// resolve the promise with the cache instance found
			// 			// console.log("Recycled instance of :",model, section_tipo, section_id)
			// 			return found_instance[0]
			// 	}
			// }

	return new Promise(async function(resolve){

		// search. first we see if the instance is inside the instances cache
			const found_instance = instances.find(instance => instance.id===key)
			// resolve the promise with the cache instance found
			if (found_instance) {
				// console.warn("returned already resolved instance from cache:", found_instance[0]);
				resolve(found_instance)
			}

		// element file import path
			const base_path	= model.indexOf('tool_')!==-1
				? '../../../tools/'
				: model.indexOf('service_')!==-1
					? '../../services/'
					: '../../'

			const name = model.indexOf('tool_')!==-1
				? 'index'
				: model

			const path = direct_path
				? direct_path
				: base_path + model + '/js/' + name + '.js' // + '?v=' + page_globals.dedalo_version

		// import element mod file once (and wait until finish)
			// let current_element
			// try {
			// 	current_element = await import(path)
			// }catch(error){
			// 	console.error(`------- ERROR ON IMPORT ELEMENT!!! [model:${model}] [path:${path}] \n Error: \n`, error);

			// 	resolve(false)
			// 	return
			// }

		import(path)
		.then(async function(module){

			// check module
				if (typeof module[model]!=="function") {
					console.warn(`------- INVALID MODEL!!! [model:${model}] path: `, path);
					resolve(false)
					return
				}

			// instance the element
				const instance_element = new module[model]()

			// serialize element id
			// add the id for init the instance with the id
				instance_element.id = key
				//instance_element.id_base = key_instances_builder(options, false)
				instance_element.id_base = section_tipo+'_'+section_id+'_'+tipo
			// id_variant . Propagate a custom instance id to children
				if (options.id_variant) {
					instance_element.id_variant = options.id_variant
				}

			// init the element
				await instance_element.init(options)

			// add to the instances cache
				instances.push(instance_element)
				// console.log("Created fresh instance of :", model, section_tipo, section_id, key, instance_element)

			// return the new created instance
				resolve(instance_element)
		})
		.catch((error) => {
			console.error(`------- ERROR ON IMPORT ELEMENT!!! [model:${model}] [path:${path}] \n Error: \n`, error);
			resolve(false)
			return
		});
	})
	.catch(err => { console.error(err) });
}//end get_instance



/**
* GET_ALL_INSTANCES
* Get all created instances from memory
* @return array instances
*/
export const get_all_instances = function() {

	return instances
}//end get_all_instances



/**
* DELETE_INSTANCE
* Delete the found instance/s from memory
* @param object options
* @return int deleted
*/
export const delete_instance = async function(options) {

	// DES
		// const delete_id = options.id
		// const found_instance_index = instances.findIndex(item => item.id === delete_id)

		// // let deleted = 0;
		// // if(found_instance_index){
		// // 	instances.splice(found_instance_index, 1)
		// // 	deleted++
		// // }

		// const deleted = async (found_instance_index) => {
		// 	if(found_instance_index!==-1){
		// 		instances.splice(found_instance_index, 1)
		// 		return true
		// 	}
		// 	return false
		// }
		// const delete_value = await deleted(found_instance_index)

		// // debug
		// if (delete_value!==true) {
		// 	console.warn("+ [delete_instance] NOT deleted instance. Not found instance with options:", options);
		// }

		// //console.log("+ [instances.delete_instance] deleted n:", deleted, options.model, options.tipo);
		// //console.log(" ++++++++ instances:",instances)

		// return delete_value

	// debug
		// console.log('found_instances A:', structuredClone(instances));

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
				// console.log('Break loop on property:', key, item[key], value, options);
				break;
			}
		}

		if (result===true) {
			//root_instance = instances[index].root_instance
			//console.log("deleted instance:", clone(instances[index]));
			instances.splice(index, 1)
			deleted++
			// console.log(" ++++++++ [delete_instance] deleted:", index, options);
		}

		return result
	}
	const found_instances = instances.filter(check_options)
	if (found_instances.length===0) {
		// console.log('Instance not found from options:', options);
	}

	// debug
		// if (deleted<1) {
		// 	console.warn("+ [delete_instance] NOT deleted instance. Not found instance with options:", options);
		// }
		// console.log("+ [instances.delete_instance] deleted n:", deleted, options.model, options.tipo);
		// console.log(" ++++++++ instances:",instances, deleted)
		// console.log(' ++++++++ [delete_instance] instances B:', structuredClone(instances));


	return deleted
}//end delete_instance



/**
* KEY_INSTANCES_BUILDER
* Creates string normalized key from several parameters
* @param object options
* @return string key
*/
export const key_instances_builder = function(options) {

	const order = ['model','tipo','section_tipo','section_id','mode','lang','parent','matrix_id','id_variant','column_id']
	const key_parts = []

	const l = order.length
	for (let i = 0; i < l; i++) {

		const current_value = options[order[i]] ? options[order[i]].toString() : '';
		if (options.hasOwnProperty(order[i]) && typeof current_value!=='undefined' && current_value!==null && current_value.length>0){
			key_parts.push( options[order[i]] )
		}
	}

	const key = key_parts.join('_')

	return key
}//end key_instances_builder


// @license-end
