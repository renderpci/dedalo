// imports
	//import event_manager from './page.js'
	import * as instances from '/dedalo/lib/dedalo/common/js/instances.js'
	import {data_loader} from '/dedalo/lib/dedalo/common/js/data_loader.js'
	import {context_parser} from '/dedalo/lib/dedalo/common/js/context_parser.js'



/**
* SECTION
*/
export const section = function(options) {
	if(SHOW_DEBUG===true) {
		console.log("[section.new] options:",options);
	}

	this.section_id 	= options.section_id
	this.section_tipo	= options.section_tipo
	this.mode 			= options.mode || 'edit'
	this.lang 			= options.lang || 'lg-nolan'

	// optionals
	this.datum 			= options.datum || null
	this.context 		= options.context || null
	this.data 			= options.data || null

	//control
	this.builded 		= false
}//end section



/**
* INIT
* @return 
*/
section.prototype.init = function(options) {
	const self = this

	//this.section_tipo 	= options.section_tipo
	//this.datum 			= options.datum

	// load data from db
		
	
	return loaded
}//end init


/**
* LOAD_DATA
* @return 
*/
section.prototype.load_data = function() {

	const self = this

	const context = self.context
	console.log("----> request context:",context);


	// triger vars
		const url 			= DEDALO_LIB_BASE_URL + '/api/v1/json/'
		const trigger_vars 	= {
			context 		: context,
			action 			: 'read'
		}

	// data_loader
		const current_data_loader = new data_loader({
			url 	: url,
			body	: trigger_vars
		})

		const loaded_promise = current_data_loader.load().then(function(response){

			console.log(response)

			if(SHOW_DEBUG===true) {
				if (response.result===false) {
					console.error("API EXCEPTION:",response.msg);
				}
				console.log("[section.load_data] response:",response, " TIME: "+response.debug.exec_time)
				console.log("[section.load_data] context:",response.result.context)
				console.log("[section.load_data] data:",response.result.data)

				const page_wrapper = document.getElementById("page_wrapper")
				page_wrapper.style = "display:grid;grid-template-columns: 40% 1fr auto;background-color:#f1f2f3;padding: 1em;"
				page_wrapper.innerHTML = "<pre>context: " + JSON.stringify(response.result.context, null, "   ") + "</pre>" 
				page_wrapper.innerHTML += "<pre>data: " + JSON.stringify(response.result.data, null, "   ") + "</pre>" 


				var time_info = ""
				time_info += "<pre style=\"position: fixed;right:2em;top:1em;\">"
				time_info += "Total time: " + response.debug.exec_time 
				time_info += "<br>Context exec_time: " + response.result.debug.context_exec_time
				time_info += "<br>Data exec_time: " + response.result.debug.data_exec_time 
				time_info += "</pre>" 

				page_wrapper.innerHTML += time_info

			}

		const current_datum = response.result
			
		// set data to current instance
			self.context	= current_datum.context.filter(element => element.section_tipo===self.section_tipo)
			self.data 		= current_datum.data.filter(element => element.section_tipo===self.section_tipo)

		//event_manager.publish('stateChange')
	})
	
	
	return loaded_promise
}//end load_data



/**
* BUILD
* @return 
*/
section.prototype.build = function() {

	const self = this
	const build_promise = self.load_data().then(function(){
	
		const components = self.load_components()
		const groupers 	 = self.load_groupers()

		return Promise.all([components,groupers]).then(function(){
			self.builded 	= true
		})
	})

	return build_promise
}//end build



/**
* LOAD_COMPONENTS
* @return promise loaded
*/
section.prototype.load_components = function() {

	const self = this

	const context 		= self.context
	const data 			= self.data
	const data_lenght 	= data.length

	console.log("context:",context);
	//const components_context = context.filter(component => component.type==='component_info')
	//const components_length  = components_context.length;


	const loaded = new Promise(function(resolve){
		
		const instances_promises =[]
		for (let i = 0; i < data_lenght; i++) {

			const component_data 	= data[i]
			const tipo				= component_data.from_parent
			const section_id		= component_data.section_id

			const component_context = context.filter(item => item.type==='component' && item.tipo===tipo)[0]
						
			// init component
				const component_options = {
					model 		: component_context.model,
					data		: component_data,
					context 	: component_context,
					section_tipo: component_context.section_tipo,
					section_id	: section_id,
					tipo 		: tipo,
					mode		: component_context.mode,
					lang		: component_context.lang
				}
				const current_instance = instances.get_instance(component_options)

				// add
					instances_promises.push(current_instance)		
		}
		return Promise.all(instances_promises).then(function(){
			resolve(true)
		})
	})

	return loaded
}//end load_components




/**
* LOAD_GROUPERS
* @return promise loaded
*/
section.prototype.load_groupers = function() {

	const self = this

	const context 		= self.context	

	const loaded = new Promise(function(resolve){		

		const ar_groupers_context 		 = context.filter(item => item.type==='grouper')
		const ar_groupers_context_length = ar_groupers_context.length
		const instances_promises 		 = []
		for (let i = 0; i < ar_groupers_context_length; i++) {

			const groupper_context = ar_groupers_context[i]
			// get the childrens of the group for build the context
			// the groupers has the own dd_object and the childrens for render it.
			const group_childrens 		 = context.filter(item => item.parent===groupper_context.tipo) //item.tipo===groupper_context.tipo ||
		
			// instance element
				const grouper_options = {
					model 		: groupper_context.model,
					context 	: groupper_context,
					childrens 	: group_childrens,
					section_tipo: groupper_context.section_tipo,
					tipo 		: groupper_context.tipo,
					section_id	: section_id,
					mode		: groupper_context.mode,
					lang		: groupper_context.lang
				}
				const current_instance = instances.get_instance(grouper_options)
			// add
				instances_promises.push(current_instance)
					console.log("current_instance:",current_instance);
		}
		return Promise.all(instances_promises).then(function(){
			resolve(true)
		})
	})

	return loaded
}//end load_groupers



/**
* GET_COMPONENT_CONTEXT
* @return 
*/
section.prototype.get_component_context = function(compnent_tipo) {

	const section_tipo = this.section_tipo

	const context = this.context.reduce( function(acc,element) {
		if(element.type === 'component' && element.tipo === compnent_tipo && element.section_tipo=== section_tipo) return element
		return acc
	},null)

	return context		
}//end get_component_context



/**
* GET_COMPONENT_DATA
*/
section.prototype.get_component_data = function(compnent_tipo){

	const component_data = 'patata'


	return component_data
}//end get_component_data



/*
* RENDER
* @return promise render_promise
*/
section.prototype.render = function(){

	const self = this

	const render_promise = new Promise(function(){

		const section_main_node = document.getElementById('section_content')

		const build_promise = (self.builded===false) ? self.build() : new Promise(function(resolve) { resolve(true); })

		build_promise.then(function(response){

			const ar_section_id 		= self.get_ar_section_id()
			const ar_section_id_length 	= ar_section_id.length			

			// create the header of the tool
				const section_dom_node = common.create_dom_element({
						element_type	: 'section',
						id 				: self.section_tipo,
						class_name		: self.model,
						inner_html		: self.model
					})

			const childrens	= self.context.filter(element => element.parent===self.section_tipo)

			// iterate records
			for (var i = 0; i < ar_section_id_length; i++) {

				const current_section_id = ar_section_id[i]

				const options = {
						childrens 	: childrens,
						section_id 	: current_section_id,
						root_tipo 	: self.section_tipo,
						root_node 	: section_dom_node
					}
			
				const current_context_parser = new context_parser(options)

				current_context_parser.render()
					
			}

			return section_main_node
		})	
	})

	return render_promise 
}//end render



/**
* GET_AR_SECTION_ID
*/
section.prototype.get_ar_section_id = function(){

	const self = this

	const data = self.data
	const data_lenght = data.length

	let ar_section_id = []
	for (var i = 0; i < data_lenght; i++) {
		if (ar_section_id.includes(data[i].section_id)) {
			continue
		}else{
			ar_section_id.push(data[i].section_id)
		}
	}

	return ar_section_id
}



