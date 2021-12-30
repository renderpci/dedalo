/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	//import {event_manager} from '../../common/js/event_manager.js'
	import {clone, dd_console} from '../../common/js/utils/index.js'
	import {common} from '../../common/js/common.js'
	import {render_list_section_record} from '../../section_record/js/render_list_section_record.js'
	import {render_edit_section_record} from '../../section_record/js/render_edit_section_record.js'
	import {render_mini_section_record} from '../../section_record/js/render_mini_section_record.js'
	import * as instances from '../../common/js/instances.js'
	import {data_manager} from '../../common/js/data_manager.js'
	//import {context_parser} from '../../common/js/context_parser.js'



/**
* SECTION_RECORD
*/
export const section_record = function() {

	this.id				= null

	// element properties declare
	this.model			= null
	this.tipo			= null
	this.section_tipo	= null
	this.section_id		= null
	this.mode			= null
	this.lang			= null

	this.datum			= null
	this.context		= null
	this.data			= null

	this.paginated_key	= null
	this.row_key 		= null
	// control
	//this.builded		= false

	this.node			= null

	this.events_tokens	= null
	this.ar_instances	= null
	this.caller			= null

	this.matrix_id		= null
	this.id_variant		= null

	this.column_id		= null

	this.offset			= null


	return true
};//end section



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	section_record.prototype.build		= common.prototype.build
	section_record.prototype.destroy	= common.prototype.destroy
	section_record.prototype.render		= common.prototype.render
	section_record.prototype.list		= render_list_section_record.prototype.list
	section_record.prototype.tm			= render_list_section_record.prototype.list
	section_record.prototype.search		= render_list_section_record.prototype.list
	section_record.prototype.edit		= render_edit_section_record.prototype.edit
	section_record.prototype.mini		= render_mini_section_record.prototype.mini



/**
* INIT
* @params object options
* @return bool true
*/
section_record.prototype.init = async function(options) {

	const self = this

	// options vars
	self.model				= options.model
	self.tipo				= options.tipo
	self.section_tipo		= options.section_tipo
	self.section_id			= options.section_id
	self.mode				= options.mode
	self.lang				= options.lang
	self.node				= []
	self.columns_map		= options.columns_map

	self.datum				= options.datum
	self.context			= options.context
	// self.data			= options.data
	self.paginated_key		= options.paginated_key
	self.row_key			= options.row_key

	self.events_tokens		= []
	self.ar_instances		= []

	self.type				= self.model
	self.label				= null

	self.caller				= options.caller || null

	self.matrix_id			= options.matrix_id || null
	self.column_id 			= options.column_id

	self.modification_date	= options.modification_date || null

	self.offset				= options.offset

	// events subscription
		// event active (when user focus in dom)
		//event_manager.subscribe('section_record_rendered', (active_section_record) => {
			//if (active_section_record.id===self.id) {
			//	console.log("-- event section_record_rendered: active_section_record:",active_section_record.tipo, active_section_record.section_id);
			//}
		//})

	// status update
		self.status = 'initied'


		if(self.caller.tipo==='numisdata30') {
				console.log("///////////////////////////// self:",self);
		}


	return self
};//end init



/**
* ADD_INSTANCE
* Get and build a instance with the context given
* Note that the returned promise await the build of the instance
* @return promise current_instance
*/
const add_instance = async (self, current_context, section_id, current_data, column_id) => {
	// const t0 = performance.now()

	const instance_options = {
		model			: current_context.model,
		tipo			: current_context.tipo,
		section_tipo	: current_context.section_tipo,
		section_id		: section_id,
		mode			: (current_context.fixed_mode)
			? current_context.mode
			: self.mode,
		lang			: current_context.lang,
		section_lang	: self.lang,
		parent			: current_context.parent,
		type			: current_context.type,
		context			: current_context,
		data			: current_data,
		datum			: self.datum,
		request_config	: current_context.request_config,
		columns_map		: current_context.columns_map
	}

	// id_variant . Propagate a custom instance id to children
		if (self.id_variant) {
			instance_options.id_variant = self.id_variant
		}
	// time machine matrix_id
		if (self.matrix_id) {
			instance_options.matrix_id = self.matrix_id
		}
	//column id
		if(column_id){
			instance_options.column_id = column_id
		}

	// component / section group. create the instance options for build it, the instance is reflect of the context and section_id
		const current_instance = await instances.get_instance(instance_options)

		if(!current_instance || typeof current_instance.build!=='function'){
			console.warn(`ERROR on build instance (ignored ${current_context.model}):`, current_instance);
			return
		}
	// add self as caller
		current_instance.caller = self

	// instance build await
		await current_instance.build()

	// add
		// ar_instances.push(current_instance)
		// dd_console(`__Time to add_instance section_record: ${(performance.now()-t0).toFixed(3)} ms`,'DEBUG', [current_context.tipo,current_context.model])

	return current_instance
}; //end add_instance



/**
* GET_AR_INSTANCES (USED IN EDIT MODE)
* @see render_section get_content_data
* @return array ar_instances
*/
section_record.prototype.get_ar_instances = async function(){

	const self = this

	// already calculated case
		if (self.ar_instances && self.ar_instances.length>0) {
			// console.warn("Returning already calculated instances:",self.ar_instances, self.id)
			return self.ar_instances
		}

	// sort vars
		const mode			= self.mode
		const section_tipo	= self.section_tipo
		const section_id	= self.section_id
		const caller_tipo	= self.caller.tipo

	// items. Get the items inside the section/component of the record to render it
		// const items = (mode==="list")
		// 	? self.datum.context.filter(el => el.section_tipo===section_tipo && (el.type==='component') && el.parent===caller_tipo && el.mode===mode)
		// 	: self.datum.context.filter(el => el.section_tipo===section_tipo && (el.type==='component' || el.type==='grouper') && el.parent===caller_tipo && el.mode===mode)
		const items = self.datum.context.filter(el => el.section_tipo===section_tipo
											&& el.parent===caller_tipo
											&& (el.type==='component' || el.type==='grouper')
											&& el.mode===mode)

	// instances
		const ar_promises	= []
		const items_length	= items.length
		for (let i = 0; i < items_length; i++) {
			//console.groupCollapsed("section: section_record " + self.tipo +'-'+ ar_section_id[i]);
			// const current_context = items[i]
			// const current_data		= self.get_component_data(current_context.tipo, current_context.section_tipo, section_id)

			// sequential mode
				// const current_instance = await add_instance(self, current_context, section_id, current_data)
				// ar_instances.push(current_instance)

			// parallel mode
				const current_promise = new Promise(function(resolve){
					const current_context	= items[i]
					const current_data		= self.get_component_data(current_context, current_context.section_tipo, section_id)
					add_instance(self, current_context, section_id, current_data)
					.then(function(current_instance){
						// current_instance.instance_order_key = i
						resolve(current_instance)
					}).catch((errorMsg) => {
						console.error(errorMsg);
					})
				})
				ar_promises.push(current_promise)

		}//end for loop

	// instances. Await all instances are parallel builded and fix
		await Promise.all(ar_promises).then(function(ar_instances){
			// sort by instance_order_key asc to guarantee original order
			// ar_instances.sort((a,b) => (a.instance_order_key > b.instance_order_key) ? 1 : ((b.instance_order_key > a.instance_order_key) ? -1 : 0))
			// fix
			self.ar_instances = ar_instances
		})


	return self.ar_instances
};//end get_ar_instances



/**
* GET_AR_COLUMNS_INSTANCES (USED IN LIST MODE. TIME MACHINE TOO)
* @return array ar_instances
*/
section_record.prototype.get_ar_columns_instances = async function(){

	const self = this

	// already calculated case
		if (self.ar_instances && self.ar_instances.length>0) {
			// console.warn("Returning already calculated instances:",self.ar_instances, self.id)
			return self.ar_instances
		}

	// short vars
		const mode			= self.mode
		const tipo			= self.tipo
		const section_tipo	= self.section_tipo
		const section_id	= self.section_id
		const matrix_id		= self.matrix_id // time machine 'tm' mode only
		const columns_map	= await self.columns_map || []


	// request config
	// get the request_config with all ddo, it will be use to create the instances
		const request_config		= self.caller.context.request_config
		const request_config_length	= request_config.length

	// instances
	// get the columns of the component and match it with the ddo
		const ar_promises		= []
		const columns_map_length	= columns_map.length
		for (let i = 0; i < columns_map_length; i++) {

			const current_colum	= columns_map[i]

			// request_config could be multiple (Dédalo, Zenon, etc)
				const ar_column_ddo = []
				for (let j = 0; j < request_config_length; j++) {
					const request_config_item = request_config[j]

					// get the direct components of the caller (component or section)
					const ar_first_level_ddo = request_config_item.show.ddo_map.filter(item => item.parent === self.tipo)

					// with every child, match it with the column and assign to it.
					const ar_first_level_ddo_len = ar_first_level_ddo.length
					for (let k = 0; k < ar_first_level_ddo_len; k++) {

						const current_ddo = ar_first_level_ddo[k]

						// if the ddo has column_id (normally all component has it, you can see it in common.js get_columns() method)
						if(current_ddo.column_id && current_ddo.column_id===current_colum.id){

							// check if the column of the component is already loaded, if exists don't load it.
							const exists = ar_column_ddo.find(item => item.tipo === current_ddo.tipo)
							if(exists) continue

							// add to the ddo to the column
							ar_column_ddo.push(current_ddo)

							// get the component data to assign to it and create the instance
							const current_data = self.get_component_data(current_ddo, section_tipo, section_id, matrix_id)

							// current_context. check if the section_tipo of the component
								const current_context	= Array.isArray(current_ddo.section_tipo)
									? self.datum.context.find(el => el.tipo===current_ddo.tipo && el.mode===current_ddo.mode)
									: self.datum.context.find(el => el.tipo===current_ddo.tipo && el.mode===current_ddo.mode && el.section_tipo===current_ddo.section_tipo)
									// check is valid context
									if (!current_context) {
										console.error(`[get_ar_columns_instances] Ignored context not found for model: ${current_ddo.model}, section_tipo: ${current_ddo.section_tipo}, tipo: ${current_ddo.tipo}, ddo:`, current_ddo);
										console.warn("self.datum.context:", self.datum.context);
										continue;
									}

							// new_context. clone the current_context to prevent changes in the original.
								const new_context = JSON.parse(JSON.stringify(current_context)) //Object.freeze(current_context);
								new_context.columns_map = (current_colum.columns_map)
									? current_colum.columns_map
									: false
								// set the fixed_mode when is set by preferences, properties or tools, to maintain the mode defined
								// if not the ddo will get the mode of the section_record
								if(current_ddo.fixed_mode){
									new_context.fixed_mode = current_ddo.fixed_mode
								}


							// instance create and set
								const current_instance = await add_instance(self, new_context, section_id, current_data, current_colum.id)
								self.ar_instances.push(current_instance)
						}// end if(current_ddo.column_id..
					}// end for (let k = 0; k < ar_first_level_ddo_len; k++)
				}//end for (let j = 0; j < request_config_length; j++)
		}// end for (let i = 0; i < columns_map_length; i++)


	return self.ar_instances
};//end get_ar_columns_instances



// /**
// * GET_AR_COLUMNS_INSTANCES (USED IN LIST MODE. TIME MACHINE TOO)
// * @return array ar_instances
// */
	// section_record.prototype.get_ar_columns_instances_DES = async function(){

	// 	const self = this

	// 	// already calculated case
	// 		if (self.ar_instances && self.ar_instances.length>0) {
	// 			// console.warn("Returning already calculated instances:",self.ar_instances, self.id)
	// 			return self.ar_instances
	// 		}

	// 	// short vars
	// 		const mode				= self.mode
	// 		const tipo				= self.tipo
	// 		const section_tipo		= self.section_tipo
	// 		const section_id		= self.section_id
	// 		const matrix_id			= self.matrix_id // time machine 'tm' mode only
	// 		const caller_column_id	= self.column_id
	// 		const ar_columns		= await self.columns || []

	// 		// console.log("section_tipo:",section_tipo);
	// 		// console.log("matrix_id:",matrix_id, self.caller.mode, self.caller.tipo);
	// 		// console.log("_________________________________________________ ar_columns:",JSON.parse(JSON.stringify(ar_columns)));

	// 	// // valid_columns
	// 	// 	// Get the columns that can be used with the current locator
	// 	// 	// check the section_tipo of the last column and match with the current locator section_tipo
	// 	// 	// the columns has reverse order, the last columns match with the component locator, (and the first columns is the most deep component in the path)
	// 	// 	const get_valid_columns = function(section_tipo, ar_columns){

	// 	// 		const ar_column = []

	// 	// 		const ar_columns_length = ar_columns.length
	// 	// 		for (let i = 0; i < ar_columns_length; i++) {

	// 	// 			const current_column	= ar_columns[i];
	// 	// 			const last_column		= current_column[current_column.length - 1];
	// 	// 			// if the column has multiple section_tipo like [es1, fr1, ...], check if someone is the section_tipo of the locator
	// 	// 			if(last_column && Array.isArray(last_column.section_tipo)){
	// 	// 				const ddo_check = last_column.section_tipo.find(item => item===section_tipo)
	// 	// 				if(ddo_check) {
	// 	// 					ar_column.push(current_column)
	// 	// 				}
	// 	// 			}else if(last_column && last_column.section_tipo===section_tipo){
	// 	// 				ar_column.push(current_column)
	// 	// 			}
	// 	// 		}
	// 	// 		return ar_column
	// 	// 	}
	// 	// 	const valid_columns = get_valid_columns(section_tipo, ar_columns)

	// 	// request config
	// 	// get the request_config with all ddo
	// 		const request_config		= self.caller.context.request_config
	// 		const request_config_length	= request_config.length


	// 	// instances
	// 		const ar_promises		= []
	// 		const ar_columns_length	= ar_columns.length
	// 		for (let i = 0; i < ar_columns_length; i++) {
	// 				const current_ddo_path	= ar_columns[i]
	// 				const current_ddo		= current_ddo_path[current_ddo_path.length - 1];
	// 				if (!current_ddo) {
	// 					console.warn("ignored empty current_ddo: [i, tipo, section_tipo, section_id, matrix_id]", i, tipo, section_tipo, section_id, matrix_id);
	// 					continue;
	// 				}

	// 			// new_path
	// 				const new_path = [...current_ddo_path]
	// 				new_path.pop()

	// 			// the component has direct data into the section
	// 			// if(current_context.parent===tipo){
	// 				const current_data		= self.get_component_data(current_ddo, section_tipo, section_id, matrix_id)

	// 				const current_context	= Array.isArray(current_ddo.section_tipo)
	// 					? self.datum.context.find(el => el.tipo===current_ddo.tipo && el.mode===current_ddo.mode)
	// 					: self.datum.context.find(el => el.tipo===current_ddo.tipo && el.mode===current_ddo.mode && el.section_tipo===current_ddo.section_tipo)

	// 				// check is valid context
	// 					if (!current_context) {
	// 						console.error(`[get_ar_columns_instances] Ignored context not found for model: ${current_ddo.model}, section_tipo: ${current_ddo.section_tipo}, tipo: ${current_ddo.tipo}, ddo:`, current_ddo);
	// 						console.warn("self.datum.context:", self.datum.context);
	// 						continue;
	// 					}

	// 				current_context.columns = [new_path] //[new_path.splice(-1)] // the format is : [[{column_item1},{column_item2}]]

	// 			// context section tipo
	// 				// if the component has multiple section_tipo like hierarchy25, get the current section_tipo and inject to the context
	// 				// multiple sections [on1, ts1, es1,...] has the same component and server only send 1 version of it.
	// 				// it's necessary to create different instances for the same component, to maintain the coherence with the data.
	// 				if(current_context.section_tipo!==section_tipo){
	// 					current_context.section_tipo = section_tipo
	// 				}

	// 			// new_context. clone the current_context to prevent changes in it.
	// 				const new_context = JSON.parse(JSON.stringify(current_context)) //Object.freeze(current_context);

	// 				const column_id = caller_column_id
	// 					? caller_column_id
	// 					: i+1

	// 				// get built instance
	// 					// sequential mode
	// 						// const current_instance = await add_instance(self, new_context, section_id, current_data, column_id)
	// 						// self.ar_instances.push(current_instance)

	// 					// parallel mode
	// 						const current_promise = new Promise(function(resolve){
	// 							add_instance(self, new_context, section_id, current_data, column_id)
	// 							.then(function(current_instance){
	// 								// current_instance.instance_order_key = i
	// 								resolve(current_instance)
	// 							}).catch((errorMsg) => {
	// 								console.error(errorMsg);
	// 							})
	// 						})
	// 						ar_promises.push(current_promise)

	// 			// }else{
	// 			// 	// the component don't has direct data into the section, it has a locator that will use for located the data of the column
	// 			// 	const current_data		= self.get_component_relation_data(current_context, section_id)

	// 			// 	// sometimes the section_tipo can be different (es1, fr1, ...)
	// 			// 	//the context get the first component, but the instance can be with the section_tipo data
	// 			// 	current_context.section_tipo = current_data.section_tipo
	// 			// 	const current_instance	= await add_instance(self, current_context, current_data.section_id, current_data)
	// 			// 	//add
	// 			// 	ar_instances.push(current_instance)
	// 			// }

	// 		}//end for loop

	// 		// instances. Await all instances are parallel builded and fix
	// 			await Promise.all(ar_promises).then(function(ar_instances){
	// 				// sort by instance_order_key asc to guarantee original order
	// 				// ar_instances.sort((a,b) => (a.instance_order_key > b.instance_order_key) ? 1 : ((b.instance_order_key > a.instance_order_key) ? -1 : 0))
	// 				// fix
	// 				self.ar_instances = ar_instances
	// 			})


	// 	return self.ar_instances
	// };//end get_ar_columns_instances



/**
* GET_COMPONENT_DATA
* Compares received section_tipo, section_id, matrix_id with elements inside datum.data for try to match.
* If no elements matches, a empty object is created to prevent gaps
* @return object component_data
*/
section_record.prototype.get_component_data = function(ddo, section_tipo, section_id, matrix_id=null){

	const self = this
		// console.log("section record self.mode:",self.mode, self.tipo);
		// console.log("self.caller.mode:", self.caller.mode, self.caller.model, self.caller.tipo);

	// const component_data = self.caller.mode==='tm' // self.mode==='tm'
	// 	? self.datum.data.find(el => el.tipo===ddo.tipo && el.section_id===section_id && el.section_tipo===section_tipo && el.matrix_id===matrix_id)
	// 	: self.datum.data.find(el => el.tipo===ddo.tipo && el.section_id===section_id && el.section_tipo===section_tipo)

	// component_data
		const component_data = 	self.datum.data.find(function(el){
			if (el.tipo===ddo.tipo && el.section_id===section_id && el.section_tipo===section_tipo) {

				if (el.matrix_id) {
					// console.error("match matrix_id:", el.matrix_id);
					return el.matrix_id===matrix_id
				}
				return true
			}
			return false
		})


	// debug
		// if (self.mode==='tm' || self.caller.mode==='tm') {
			// if (!component_data) {
			// 	console.warn("not found component_data ddo, section_tipo, section_id, matrix_id:", ddo, section_tipo, section_id, matrix_id);
			// }else{
			// 	if (component_data.debug_model==='component_portal') {
			// 		// console.log("component_data.debug_model:", component_data.debug_model);
			// 		console.log("--- get_component_data section_tipo, section_id, matrix_id, component_data:", component_data, section_tipo, section_id, matrix_id);
			// 	}
			// }
		// }
	
		
	// undefined case. If the current item don't has data will be instantiated with the current section_id
		if(!component_data) {
			// empty component data build
			return {
				tipo			: ddo.tipo,
				section_tipo	: section_tipo,
				section_id		: section_id,
				value			: [],
				fallback_value	: ['']
			}
		}

	return component_data
};//end get_component_data



/**
* GET_COMPONENT_RELATION_DATA
* Don't used now (!)
* @return object component_data
*/
	// section_record.prototype.get_component_relation_data = function(component, section_id){

	// 	const self = this

	// 		console.log("self.mode:",self.mode);

	// 	const parent			= component.parent
	// 	const section_tipo		= component.section_tipo
	// 	const component_tipo	= component.tipo
	// 	const component_data	= self.datum.data.find(item => item.tipo===component_tipo && item.row_section_id===section_id)	
	// 	// console.log("component_data:",component_data);

	// 	// // get the f_path it has full path from the main section to last component in the chain, (sectui b¡)
	// 	// const f_path 			= component.parent_f_path
	// 	// // get the first compoment, position 2, this component has the locator into the data of the main section.
	// 	// const component_tipo 	= f_path[1]
	// 	// const first_locator 	= self.data.find(item => item.tipo===component_tipo && item.section_id===section_id)

	// 	// Get the data of the component selected in the show, normally the last compoment of the chain.
	// 	// It's the column in the list
	// 	// const parent_data = (first_locator)
	// 	// 	? self.datum.data.find(item =>
	// 	// 		item.tipo===component.tipo
	// 	// 		&& item.parent_section_id 	=== section_id
	// 	// 		&& item.parent_tipo 		=== first_locator.tipo)
	// 	// 	: null
	// 	// if the component has data set it, if not create a null data
	// 	// component_data.value = (parent_data)
	// 	// 	? parent_data
	// 	// 	: null

	// 	// undefined case. If the current item don't has data will be instanciated with the current section_id
	// 	if (component_data.value===null) {
	// 		// empy component data build
	// 		component_data.value = {
	// 			section_id				: section_id,
	// 			section_tipo			: section_tipo,
	// 			tipo					: component.tipo,
	// 			from_component_tipo		: parent,
	// 			parent					: parent,
	// 			value					: [],
	// 			fallback_value			: [""]
	// 		}
	// 	}
	// 	// self.data.push(component_data.value)

	// 	return component_data
	// };//end get_component_relation_data



/**
* GET_COMPONENT_INFO
* @return object component_data
*/
section_record.prototype.get_component_info = function(){

	const self = this

	const component_info = self.datum.data.find(item => item.tipo==='ddinfo'
										&& item.section_id===self.section_id
										&& item.section_tipo===self.section_tipo)

	return component_info
};//end get_component_info



/**
* GET_COMPONENT_CONTEXT
* @return object context
*//*
section_record.prototype.get_component_context = function(component_tipo) {

	const self = this

	const context = self.context.filter(item => item.tipo===component_tipo && item.section_tipo===self.section_tipo)[0]

	return context
};//end get_component_context
*/



/**
* BUILD
* @return promise
*//*
section_record.prototype.build = function() {

	const self = this

	const components = self.load_items()
	//const groupers 	 = self.load_groupers()

	return Promise.all([components]).then(function(){
		self.builded = true
	})
};//end build
*/



/**
* LOAD_items
* @return promise load_items_promise
*//*
section_record.prototype.load_items = function() {

	const self = this

	const context 			= self.context
	const context_lenght 	= context.length
	const data 				= self.data
	const section_tipo 		= self.section_tipo
	const section_id 		= self.section_id

	const load_items_promise = new Promise(function(resolve){

		const instances_promises = []

		// for every item in the context
		for (let j = 0; j < context_lenght; j++) {

			const current_item = context[j]

			// remove the section of the create item instances (the section is instanciated, it's the current_section)
				if(current_item.tipo===section_tipo) continue;

			// item_data . Select the data for the current item. if current item is a grouper, it don't has data and will need the childrens for instance it.
				let item_data = (current_item.type==='grouper') ? {} : data.filter(item => item.tipo===current_item.tipo && item.section_id===section_id)[0]

				// undefined case. If the current item don't has data will be instanciated with the current section_id
				if (typeof(item_data)==='undefined') {
					item_data = {
						section_id: section_id,
						value: []
					}
				}

			// build instance with the options
				const item_options = {
					model 			: current_item.model,
					data			: item_data,
					context 		: current_item,
					section_tipo	: current_item.section_tipo,
					section_id		: section_id,
					tipo 			: current_item.tipo,
					parent			: current_item.parent,
					mode			: current_item.mode,
					lang			: current_item.lang,
					section_lang 	: self.lang,
				}
				const current_instance = instances.get_instance(item_options)

			// add the instance to the array of instances
				instances_promises.push(current_instance)
		}

		return Promise.all(instances_promises).then(function(){
			resolve(true)
		})
	})


	return load_items_promise
};//end load_items
*/

