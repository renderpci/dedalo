
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
			const model 			= options.model
			const tipo 				= options.tipo
			const section_tipo 		= options.section_tipo
			const section_id		= options.section_id // string format
			const mode				= options.mode
			const lang				= options.lang

		// key. build the key locator of the instance
			const key				= options.key || key_instances_builder(options, true)

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
						const path = base_path + model + '/js/' + model + '.js'

					// import element mod file once (and wait until finish)
						const current_element = await import(path)

					// check
						if (typeof current_element[model]!=="function") {
							console.log("------- INVALID MODEL!!!: ",model);
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

			const instance = await load_instance()


		return instance
	}// end get_instance



	/**
	* DELETE_INSTANCE
	* Delete the instance of the cache
	*/
	export const delete_instance = async function(options) {

		//let root_instance = null

		let deleted = 0;
		function check_options(item, index) {

			let result = false
			for(let key in options) {

				const value = options[key]
				if (item[key]===value) {
					result = true
				}else{
					result = false
					break;
				}
			}

			if (result===true) {
				//root_instance = instances[index].root_instance
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
		//console.log(" ++++++++ instances:",instances)

		return deleted
	}//end delete_instance



	/**
	* KEY_INSTANCES_BUILDER
	*/
	const key_instances_builder = function(options){

		const order = ['model','tipo','section_tipo','section_id','mode','lang']
		const key_parts = []

		const l = order.length
		for (let i = 0; i < l; i++) {
			if (options.hasOwnProperty(order[i]) && typeof options[order[i]]!=='undefined' && options[order[i]]!==null && options[order[i]].length>0){
				key_parts.push( options[order[i]] )
			}
		}

		const key = key_parts.join('_')

		return key
	}//end key_instances_builder


