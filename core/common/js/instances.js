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
	* for create the instance is necessary acces to every init code of every component, do it take time,
	* and this method crete one promise to wait for the creation instance of every component,
	*
	*	options = {
	*				"model"			: "component_input_text",
	*				"tipo"			: "oh15",
	*				"section_tipo"	: "oh1",
	*				"section_id"	: "2",
	*				"mode"			: "edit",
	*				"lang"			: "lg-eng"
	*			  }
	*/
	export const get_instance = async function(options){

		// key values ['model','tipo','section_tipo','section_id','mode','lang']

		// mandatory vars
			const tipo 				= options.tipo
			const section_tipo 		= options.section_tipo
			const section_id		= options.section_id // string format

		// optional vars (only mandatory for build the instance)
			const mode				= options.mode  || 'list'
			const lang				= options.lang  || page_globals.dedalo_data_lang
			const model 			= options.model || await ( async () => {
			    const current_data_manager 	= new data_manager()
				const element_context = await current_data_manager.get_element_context({
					tipo 			: tipo,
					section_tipo 	: section_tipo,
					section_id		: section_id
				})
				const current_model = element_context.result[0].model
				if(typeof options.context==='undefined'){
					options.context = element_context.result[0]
				}

			    return current_model
			})();
			// reasign the optional vars to the options
				options.model 	= model
				options.mode 	= mode
				options.lang 	= lang


		// key. build the key locator of the instance
			const key = options.key || key_instances_builder(options, true)

			//if (model!=='section_record') {
			//	key = key_instances_builder(options) + "_" + Date.now()
			//}


		// if the instance is not in the cache, build one new instance of the element
			const load_instance = async () => {

				// search. first we see if the instance is inside the instances cache
				const found_instance = instances.filter(instance => instance.id===key)

				if (found_instance.length===0) {
					//console.log("---Creating instance of:", model, tipo, " - " + key)

					// element file import path
						const base_path = model.indexOf('tool_') !== -1 ? '../../tools/' : '../../'
						const path = base_path + model + '/js/' + model + '.js' // + '?v=' + page_globals.dedalo_version

					// import element mod file once (and wait until finish)
						const current_element = await import(path)

					// check
						if (typeof current_element[model]!=="function") {
							console.warn(`------- INVALID MODEL!!! [${model}] path:`, path);
							return null
						}

					// instance the element
						const instance_element = new current_element[model]()

					// serialize element id
					// add the id for init the instance with the id
						instance_element.id = key
						//instance_element.id_base = key_instances_builder(options, false)

					// init the element
						await instance_element.init(options)

					// add to the instances cache
						instances.push(instance_element)

					// return the new created instance
						return instance_element

				}else{
					// resolve the promise with the cache instance found
						//console.log("Recycled instance of :",model,section_tipo,section_id)
						return found_instance[0]
				}
			}

		const instance = load_instance()


		return instance
	}// end get_instance



	/**
	* GET_ALL_INSTANCES
	* Get all the instances from memory
	*/
	export const get_all_instances = function() {

		return instances
	}// end get_all_instances



	/**
	* DELETE_INSTANCE
	* Delete the found instance/s from memory
	*/
	export const delete_instance = async function(options) {

		/*
			const delete_id = options.id
			const found_instance_index = instances.findIndex(item => item.id === delete_id)

			// let deleted = 0;
			// if(found_instance_index){
			// 	instances.splice(found_instance_index, 1)
			// 	deleted++
			// }

			const deleted = async (found_instance_index) => {
				if(found_instance_index!==-1){
					instances.splice(found_instance_index, 1)
					return true
				}
				return false
			}
			const delete_value = await deleted(found_instance_index)

			// debug
			if (delete_value!==true) {
				console.warn("+ [delete_instance] NOT deleted instance. Not found instance with options:", options);
			}

			//console.log("+ [instances.delete_instance] deleted n:", deleted, options.model, options.tipo);
			//console.log(" ++++++++ instances:",instances)

			return delete_value
			*/

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
				//root_instance = instances[index].root_instance
				//console.log("deleted instance:", JSON.parse(JSON.stringify(instances[index])));
				instances.splice(index, 1)
				deleted++
				//console.log(" ++++++++ [delete_instance] deleted:", index, options);
			}

			return result
		}
		const found_instances = instances.filter(check_options)


		// debug
		if (deleted<1) {
			console.warn("+ [delete_instance] NOT deleted instance. Not found instance with options:", options);
		}

		//console.log("+ [instances.delete_instance] deleted n:", deleted, options.model, options.tipo);
		//console.log(" ++++++++ instances:",instances, deleted)

		return deleted
	}//end delete_instance



	/**
	* KEY_INSTANCES_BUILDER
	*/
	export const key_instances_builder = function(options){

		const order = ['model','tipo','section_tipo','section_id','mode','lang','matrix_id']
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


