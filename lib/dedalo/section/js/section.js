// imports
	//import event_manager from './page.js'
	import * as instances from '/dedalo/lib/dedalo/common/js/instances.js'
	import {data_loader} from '/dedalo/lib/dedalo/common/js/data_loader.js'
	import {context_parser} from '/dedalo/lib/dedalo/common/js/context_parser.js'
	import {section_record} from '/dedalo/lib/dedalo/section_record/js/section_record.js'


/**
* SECTION
*/
export const section = function(options) {
	if(SHOW_DEBUG===true) {
		//console.log("[section.new] options:",options);
	}

	this.section_tipo	= options.section_tipo
	this.section_id 	= options.section_id  || null
	this.ar_section_id 	= options.ar_section_id || null

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
	
		const section_records = self.load_section_records()

		return Promise.all([section_records]).then(function(){
			self.builded 	= true
		})
	})

	return build_promise
}//end build



/**
* LOAD_SECTION_RECORDS
* @return promise loaded
*/
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

	const section_record_promises =[]
	const loaded = new Promise(function(resolve){
		
		// for every section_id
		for (let i = 0; i < data_lenght; i++) {

			const record_options = {
				section_id		: ar_section_id[i],
				section_tipo	: section_tipo,
				context			: context,
				data			: data
			}
			
			const current_section_record = new section_record(record_options)

			const section_records = current_section_record.build()

			section_record_promises.push(section_records)		

		}// end for

		return Promise.all(section_record_promises).then(function(){
			resolve(true)
		})
	})//end loaded
		
	return loaded
}//end load_section_records





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

		const build_promise = (self.builded===false) ? self.build() : new Promise(function(resolve) { resolve(true); })

		build_promise.then(function(response){

			const ar_section_id 		= self.ar_section_id
			const ar_section_id_length 	= ar_section_id.length

			const childrens	= self.context.filter(element => element.parent===self.section_tipo)

			// iterate records
			for (var i = 0; i < ar_section_id_length; i++) {

				const current_section_id = ar_section_id[i]	

				// create the header of the tool
				const section_dom_node = common.create_dom_element({
						element_type	: 'section',
						id 				: self.section_tipo+'_'+current_section_id,
						class_name		: self.model,
						inner_html		: self.model
					})

				const options = {
						childrens 	: childrens,
						section_id 	: current_section_id,
						root_tipo 	: self.section_tipo,
						root_node 	: section_dom_node
					}
			
				const current_context_parser = new context_parser(options)

				current_context_parser.render()

					console.log("section_dom_node:",section_dom_node);

				if(SHOW_DEBUG===true) {
					const test_container = document.getElementById("test_container");
					test_container.appendChild(section_dom_node)
				}
					
			}

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



