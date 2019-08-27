// imports
	import {data_manager} from '../../common/js/data_manager.js'
	import event_manager from '../../page/js/page.js'
	import * as instances from '../../common/js/instances.js'
	import {render_section} from './render_section.js'

import {common} from '../../common/js/common.js'


/**
* SECTION
*/
export const section = function() {

	// element properties declare
		this.model
		this.tipo
		this.section_tipo
		this.section_id
		this.mode
		this.lang

		this.datum
		this.context
		this.data

		this.ar_section_id

		this.node

	return true
}//end section


/**
* INIT
* @return bool
*/
section.prototype.init = async function(options) {
	
	const self = this

	self.model 			= options.model
	self.tipo 			= options.tipo
	self.section_tipo 	= options.section_tipo
	self.section_id 	= options.section_id
	self.mode 			= options.mode
	self.lang 			= options.lang
	self.node 			= []
	
	self.datum 	 		= options.datum   		|| null
	self.sqo_context	= options.sqo_context 	|| null
	self.total_records	= options.total_records	|| null
	self.context 		= options.context 		|| null
	self.data 	 		= options.data 	  		|| null
	self.events_tokens	= []
	self.ar_instances	= []

	self.paginator_id 	= ""

		console.log("self.sqo_context.show:",self.sqo_context.show);

	// load data if is not already received as option
		if (!self.datum) {
			const current_data_manager 	= new data_manager()
			const api_response 			= await current_data_manager.section_load_data(self.sqo_context.show)
				console.log("api_response++++:",api_response);
			// set
			self.datum = api_response.result

			// debug
			//	load_section_data_debug(self.tipo, self.sqo_context, api_response)
		}
			
	// set context and data to current instance
		self.context	= self.datum.context.filter(element => element.section_tipo===self.section_tipo)
		self.data 		= self.datum.data.find(element => element.tipo===element.section_tipo && element.section_tipo===self.section_tipo)


	// Update section mode with context declaration
		const section_context = self.context.find(element => element.tipo===self.section_tipo)
		self.mode = section_context.mode

	// set ar_section_id
		const sqo = self.sqo_context.show.find(element => element.typo === 'sqo')
		self.limit 			= sqo.limit		
		self.offset 		= sqo.offset
		self.limit 			= sqo.limit
		self.total 			= sqo.total

	// get the paginator_id
		self.paginator_id = self.section_tipo+"_"+self.offset
	
	// events subscription
		// event active (when user focus in dom)
		self.events_tokens.push(
			event_manager.subscribe('section_rendered', (active_section) => {			
				const debug = document.getElementById("debug")
					  debug.classList.remove("hide")
			})
		)

	//	setTimeout(()=>{
	//		const debug = document.getElementById("debug")
	//			  debug.classList.remove("hide")
	//	},2000)


	return true
}//end init



/*
* RENDER
* @return promise render_promise
*/
section.prototype.render = async function(){

	const self = this
			
	// iterate records
		const value = self.data.value || []
		const value_length 	= value.length

		//const ar_instances 			= []
			
		for (let i = 0; i < value_length; i++) {
			//console.groupCollapsed("section: section_record " + self.tipo +'-'+ ar_section_id[i]);

			const current_section_id 	= value[i].section_id
			const current_section_tipo 	= value[i].section_tipo
			const data				 	= self.datum.data.filter(element => element.section_tipo===current_section_tipo && element.section_id===current_section_id)

			// section_record
			const current_section_record = await instances.get_instance({
				model 			: 'section_record',
				tipo 			: current_section_tipo,
				section_tipo	: current_section_tipo,
				section_id		: current_section_id,
				mode			: self.mode,
				lang			: self.lang,
				context 		: self.context,
				data			: data,
				datum 			: self.datum,
				paginator_id 	: self.paginator_id
			})
			// add		
			self.ar_instances.push(current_section_record)

			console.groupEnd();
		}//end for
	
	// promise all 
		return Promise.all(self.ar_instances).then( async function(ar_section_record){

			// render using external proptotypes of 'render_component_input_text'
				const mode = self.mode
				//self.ar_instances.push(ar_section_record)
				let node = null
				switch (mode){
					case 'list':
						// add prototype list function from render_component_input_text
						section.prototype.list 			= render_section.prototype.list
						section.prototype.list_header 	= render_section.prototype.list_header
						const list_node = await self.list(ar_section_record)

						// set
						self.node.push(list_node)
						node = list_node
						break
				
					case 'edit':
					default :
						// add prototype edit function from render_section
						section.prototype.edit =  render_section.prototype.edit
						const edit_node = await self.edit(ar_section_record)

						// set
						self.node.push(edit_node)
						node = edit_node
						break
				}
			
			// event publish
				event_manager.publish('render_'+self.id, self)

			return node
		})
}//end render



/*
* DESTROY
* Delete all instances dependents of the section and all events that was created by the instances.
* but it not delete the own section instance.
* @return 
*/
section.prototype.destroy = async function (delete_own = true, delete_dependences = false){

	const self = this

	//destroy all instances asociated
	if(delete_dependences){
		//event_manager.publish('paginator_destroy'+self.paginator_id, self)
		for (var i = self.ar_instances.length - 1; i >= 0; i--) {
				console.log("self.ar_instances:",self.ar_instances[i]);
			self.ar_instances[i].destroy(true,true)
			self.ar_instances.splice(i, 1)	

		}
	}

	// delete the own instance
	if(delete_own){

	// get the events that the instance was created
		const events_tokens = self.events_tokens

	// delete the registred events
		const delete_events = events_tokens.map(current_token => event_manager.unsubscribe(current_token))


		const current_instance = instances.delete_instance({
			model 			: self.model,
			tipo 			: self.tipo,
			section_tipo 	: self.section_tipo,
			section_id 		: self.section_id,
			mode 			: self.mode,
			lang 			: self.lang,
		})

	}
	
	return true
}



/**
* RENDER_PAGINATOR
* @return 
*/
section.prototype.render_paginator = async function() {

	const self = this

	// main container
	//const main = document.getElementById("main")
	//	  main.classList.add("loading")
	const ar_node = self.node
	
	const options = {
		model 			: self.model,
		tipo 			: self.tipo,
		section_tipo 	: self.section_tipo,
		section_id 		: self.section_id,
		mode 			: self.mode,
		lang 			: self.lang,
		sqo_context 	: self.sqo_context,
		total_records	: self.total_records,
	}
	
	// destroy the own instance for build the new one	
		self.destroy(false,true);

	//change the instance with the new data
		const instance_init	= await self.init(options)

	// render
		const node 			= await self.render()
	
	for (let i = 0; i < ar_node.length; i++) {

		const current_node = ar_node[i]

		const parent_node = current_node.parentNode
	
		// remove the all child nodes of the node
			while (current_node.firstChild) {
				current_node.removeChild(current_node.firstChild)
			}
		// replace the node with the new render
			parent_node.replaceChild(node, current_node)
	 		parent_node.classList.remove("loading", "hide")	 		
 	}


 	return true
}// end render_paginator



/**
* LOAD_SECTION_DATA_DEBUG
* @return 
*/
const load_section_data_debug = async function(section_tipo, sqo_context, load_section_data_promise) {

	const response = await load_section_data_promise

	console.log("----> request sqo_context:",sqo_context);

	load_section_data_promise
	if (response.result===false) {
		console.error("API EXCEPTION:",response.msg);
	}
	console.log("[section.load_section_data_debug] response:",response, " TIME: "+response.debug.exec_time)
	console.log("[section.load_section_data_debug] context:",response.result.context)
	console.log("[section.load_section_data_debug] data:",response.result.data)
	
	const debug = document.getElementById("debug")
	debug.classList.add("hide")

	// clean
	while (debug.firstChild) {
		debug.removeChild(debug.firstChild)
	}	

	const context_pre = common.create_dom_element({
		element_type : 'pre',
		text_content : "context: " + JSON.stringify(response.result.context, null, "   "),
		parent 		 : debug
	})

	const data_pre = common.create_dom_element({
		element_type : 'pre',
		text_content : "data: " + JSON.stringify(response.result.data, null, "   "),
		parent 		 : debug
	})

	let time_info = ""
		time_info += "Total time: " + response.debug.exec_time 
		time_info += "<br>Context exec_time: " + response.result.debug.context_exec_time
		time_info += "<br>Data exec_time: " + response.result.debug.data_exec_time  +"<br>"
		
	const time_info_pre = common.create_dom_element({
		element_type : "pre",
		class_name   : "total_time",
		id   		 : "total_time",
		inner_html   : time_info,
		parent 		 : debug
	})

	debug.classList.remove("hide")

	return true
}//end load_section_data_debug


/**
* LOAD_DATA
* @return 
*//*
section.prototype.load_data = async function() {

	const self = this

	const current_datum = self.datum
			
	// set data to current instance
		self.context	= current_datum.context.filter(element => element.section_tipo===self.section_tipo)
		self.data 		= current_datum.data.filter(element => element.section_tipo===self.section_tipo)

		// Update section mode with context declaration
			const section_context = self.context.filter(element => element.tipo===self.section_tipo)[0]
			self.mode = section_context.mode

		const section_data		= current_datum.data.filter(item => item.tipo===self.section_tipo && item.section_tipo===self.section_tipo)
		const ar_section_id		= section_data[0].value
		self.ar_section_id 		= ar_section_id

	return true
}//end load_data
*/



/**
* BUILD
* @return 
*//*
section.prototype.build = function() {

	const self = this
	const build_promise = self.load_data().then(function(){
	
		const section_records = self.load_section_records()

		return Promise.all([section_records]).then(function(){
			self.builded 	= true
			console.log("instances:",instances);
		})
	})

	return build_promise
}//end build
*/



/**
* LOAD_SECTION_RECORDS
* @return promise loaded
*//*
section.prototype.load_section_records = function() {

	const self = this

	const context 		= self.context
	const data 			= self.data
	const section_tipo 	= self.section_tipo
	
	const section_data		= data.filter(item => item.tipo===section_tipo && item.section_tipo===section_tipo)
	const ar_section_id		= section_data[0].value
	self.ar_section_id 		= ar_section_id
	const data_lenght 		= ar_section_id.length
	const context_lenght 	= context.length

	
	const loaded = new Promise(function(resolve){
	
		const section_record_promises =[]	
		// for every section_id
		for (let i = 0; i < data_lenght; i++) {
			
			// init component
				const item_options = {
					model 			: 'section_record',
					data			: data,
					context 		: context,
					section_tipo	: section_tipo,
					section_id		: ar_section_id[i],
					tipo 			: section_tipo,
					mode			: self.mode,
					lang			: self.lang,
					global_context 	: self.context,
					global_data 	: self.context,
				}	

			const current_instance = instances.get_instance(item_options).then(function(section_record){			
				return section_record.build()
			})

			// add the instances to the cache
				section_record_promises.push(current_instance)			
		
		}// end for
			
		return Promise.all(section_record_promises).then(function(){
			resolve(true)
		})
	})//end loaded
		
	return loaded
}//end load_section_records
*/



