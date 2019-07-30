


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
			const key = key_instances_builder(options, true)

		// add the id to the options for init the instance with the id
			options.id = key

			//if (model!=='section_record') {
			//	key = key_instances_builder(options) + "_" + Date.now()
			//}

		// search. first we see if the instance is inside the instances cache
			const found_instance = instances.filter(instance => instance.id===key)

		// if the instance is not in the cache, build one new instance of the element
			let instance = null
			if (found_instance.length===0) {
				console.log("---Creating instance of:", model, tipo, " - " + key)

				// element file import path
					const path = '../../' + model + '/js/' + model + '.js'

				// import element mod file once (and wait until finish)
					const current_element = await import(path)

				// check
					if (typeof current_element[model]!=="function") {
						console.log("------- INVALID MODEL!!!: ",model);
					}
				
				// instance the element
					const instance_element = new current_element[model]()
	
				// serialize element id
					instance_element.id = key
					//instance_element.id_base = key_instances_builder(options, false)

				// init the element
					instance_element.init(options)
				
				// add to the cache instances
					instances.push(instance_element)

				// return the new created instance
					instance = instance_element //await import_promise

			}else{
				// resolve the promise with the cache instance found
					//console.log("Recycled instance of :",model,section_tipo,section_id)
					instance = found_instance[0]
			}		
			//console.log("instances:",instances);
		
		return instance
	}// end get_instance



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
	*//*
	export const get_instance_OLD = function(options){

		return new Promise(function(resolve){

			const model 			= options.model
			const tipo 				= options.tipo
			const section_tipo 		= options.section_tipo
			const section_id		= options.section_id // string format
			const mode				= options.mode
			const lang				= options.lang

		// build the key locator of the instance
			const key = key_instances_builder(options)

		// first we see if the instance is inside the instances cache.
			//const found_instance = instances.filter(instance => instance.key===key)
			const found_instance = instances.filter(instance => instance.id===key)

		// if the instance is not in the cache build one new instance of the component.
			if (found_instance.length === 0) {

				// add key as id in options
					//options.id = key

				// create a new instance and init
					const path = '../../'+model+'/js/'+model+'.js'

				const import_promise = import (path).then(function(current_element){				

					// instance the element
						const instance_element = new current_element[model]();
					
					// init the element
						instance_element.init(options);

					// create the instance object for store it
						const to_store_instance = {
							 model 			: options.model,
							 tipo 			: options.tipo,
							 section_tipo 	: options.section_tipo,
							 section_id		: options.section_id,
							 mode			: options.mode,
							 lang			: options.lang,
							 key 			: key,
							 instance 		: instance_element,
							 type 			: instance_element.context.type || null
						}

					// new way
						instance_element.id = key

					
					// add to the cache instances
						//instances.push(to_store_instance)
						instances.push(instance_element)

					// resolve the promise with fresh instance
						resolve(instance_element)
				})
				return import_promise

			}else{
				// resolve the promise with the cache instance found
					//console.log("Recycled instance of :",model,section_tipo,section_id)
					resolve(found_instance[0].instance)		
			}		
		})
	}// end get_instance
	*/



	/**
	* DELETE_INSTANCE
	* Delete the instance of the cache
	*/
	export const delete_instance = async function(options) {

		let root_instance = null

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
				root_instance = instances[index].root_instance
				instances.splice(index, 1)						
				deleted++
				//console.log(" ++++++++ [delete_instance] deleted:", index, options);
			}					
			
			return result
		}		
		const found_instances = instances.filter(check_options)


		// delete section dependences
			if (options.model==="section" && root_instance!==null) {

				// delete multiple items by key (reverse is important)
				instances.reduce(function(list, item, index) {
				if (item.root_instance===root_instance) list.push(index);
					return list;
				}, []).reverse().forEach(function(index) {
					instances.splice(index,1);
					//console.log(" ++++++++ item to delete index:", index);				
					deleted++
				})
			}
			
		// debug
		if (deleted<1) {
			console.error(" ++++++++ [delete_instance] NOT deleted instance not found options:",options);
		}	
		
		//console.log(" ++++++++ deleted:", deleted);
		//console.log(" ++++++++ instances:", JSON.parse(JSON.stringify(instances)) );

		return deleted
	}//end delete_instance



	/**
	* KEY_INSTANCES_BUILDER
	*/
	const key_instances_builder = function(options){

		const order = ['model','tipo','section_tipo','section_id','mode','lang']
		const key_parts = []

		const l = order.length
		for (var i = 0; i < l; i++) {
			if (options.hasOwnProperty(order[i]) && typeof options[order[i]]!=='undefined' && options[order[i]].length>0){
				key_parts.push( options[order[i]] )
			}
		}

		const key = key_parts.join('_')
		
		return key
	}//end key_instances_builder


