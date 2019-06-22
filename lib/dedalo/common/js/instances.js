


/* INSTANCES CACHE STORE
*
* Create the cache instances const. 
* The cache will be the storage for all active instances of the components.
* type: array of objects, every object will be one instance
* Instance format: [{
					"model"			: "component_input_text",
					"tipo"			: "oh15",
					"section_tipo"	: "oh1",
					"section_id"	: "2",
					"modo"			: "edit",
					"lang"			: "lg-eng",
					"key"			: "component_input_text_oh15_oh1_2_edit_lg-eng",
					"instance"		: {instance_object}
					}]
*/
	export const instances = []



/* GET_INSTANCE
*
* Get the instance, first use the storage of the instances cache, if the instance is not init will be create and stored for use.
* for create the instance is necessary acces to every init code of every component, do it take time, 
* and this method crete one promise to wait for the creation instance of every component, 

	options ={
				"model"			: "component_input_text",
				"tipo"			: "oh15",
				"section_tipo"	: "oh1",
				"section_id"	: "2",
				"modo"			: "edit",
				"lang"			: "lg-eng"
				}
*/
	export const get_instance = function(options){

		return new Promise(function(resolve){

			const model 		= options.model
			const tipo 			= options.tipo
			const section_tipo 	= options.section_tipo
			const section_id	= options.section_id
			const mode			= options.mode
			const lang			= options.lang

		// build the key locator of the instance
			const key = key_instances_builder(options)

		// first we see if the instance is inside the instances cache.
			const found_instance = instances.filter(instance => instance.key === key)

		// if the instance is not in the cache build one new instance of the component.
			if (found_instance.length === 0) {

				// create a new instance and init, call to the component js file to init.
				const path = '../../'+model+'/js/'+model+'.js'

				const import_promise = import (path).then(function(current_element){				

					// instance the component
						const current_instance = new current_element[model]();
							//console.log("current_instance:",current_instance);
					// init the component
						current_instance.init(options);

					// create the instance object for store it
						const stored_instance = {
							 model 			: options.model,
							 tipo 			: options.tipo,
							 section_tipo 	: options.section_tipo,
							 section_id		: options.section_id,
							 mode			: options.mode,
							 lang			: options.lang,
							 key 			: key,
							 instance 		: current_instance
						}
				
					// add to the cache instances
						instances.push(stored_instance)

					// resolve the promise					
						resolve(current_instance)
				})
				
					return import_promise

			}else{

				// resolve the promise with the cache instance
				//console.log("Recycled instance of :",model,section_tipo,section_id);
					resolve(found_instance[0].instance)
			}		
		})
	}// end get_instance


/* DELETE_INSTANCE
*
*	Delete the instance of the cache
*/

	export const delete_instance = function(options) {

		var deleted = 0;
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
				instances.splice(index, 1)
				deleted++	
			}					
			
			return result
		}		
		
		return new Promise(function(resolve){			
		
			const found_instances = instances.filter(check_options)
				
				//console.log("deleted:",deleted);

			resolve(deleted)	
		})
	};//end delete_instance



// key_instances_builder
	export const key_instances_builder = function(options){

		const order = ['model','tipo','section_tipo','section_id','mode','lang']
		const key_parts = []

		for (var i = 0; i < order.length; i++) {
			if (options.hasOwnProperty(order[i]) && typeof options[order[i]] !== 'undefined' && options[order[i]].length > 0 ){
				key_parts.push(options[order[i]])
			}
		}

		const key = key_parts.join('_')
		//console.log("key:",key);
		
		return key		
	}