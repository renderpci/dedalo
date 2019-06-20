// imports
	//import event_manager from './page.js'
	import * as instances from '/dedalo/lib/dedalo/common/js/instances.js'
	import {data_loader} from '/dedalo/lib/dedalo/common/js/data_loader.js'
	import {render_section_layout} from '/dedalo/lib/dedalo/section/js/render_section_layout.js'



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
		self.load_data()
	
	return true
}//end init


/**
* LOAD_DATA
* @return 
*/
section.prototype.load_data = function() {

	const self = this		

	const test_context = [
		{ // search query object in section 'test65'
			typo			: "sqo",
			id				: "query_test_sqo",
			section_tipo	: ["test65"],
			limit			: 1,
			order			: null,
			offset			: 0,
			full_count		: true,
			filter			: null
		},
		{ // section 'test65'
			typo			: "ddo",
			model			: 'section',			
			tipo 			: "test65",
			section_tipo 	: "test65",
			mode 			: self.mode,
			lang 			: self.lang,
			parent			: "root",			
			mode 			: "list"
		},
		{ // input text test73
			typo			: "ddo",
			tipo 			: 'test73',
			section_tipo 	: 'test65',
			mode 			: self.mode,
			lang 			: self.lang,
			parent			: 'test65',				
			model			: 'component_input_text'
		},
		{ // select test55
			typo			: "ddo",
			tipo 			: 'test55',
			section_tipo 	: 'test65',
			mode 			: self.mode,
			lang 			: self.lang,
			parent			: 'test65',				
			model			: 'component_select'
		},
		{ // number test139
			typo			: "ddo",
			tipo 			: 'test139',
			section_tipo 	: 'test65',
			mode 			: self.mode,
			lang 			: self.lang,
			parent			: 'test65',				
			model			: 'component_number'
		},
		{ // email test140
			typo			: "ddo",
			tipo 			: 'test140',
			section_tipo 	: 'test65',
			mode 			: self.mode,
			lang 			: self.lang,
			parent			: 'test65',				
			model			: 'component_email'
		},
		{ // iri test141
			typo			: "ddo",
			tipo 			: 'test141',
			section_tipo 	: 'test65',
			mode 			: self.mode,
			lang 			: self.lang,
			parent			: 'test65',				
			model			: 'component_iri'
		},
		{ // ip test143
			typo			: "ddo",
			tipo 			: 'test143',
			section_tipo 	: 'test65',
			mode 			: self.mode,
			lang 			: self.lang,
			parent			: 'test65',				
			model			: 'component_ip'
		},
		{ // radio button test144
			typo			: "ddo",
			tipo 			: 'test144',
			section_tipo 	: 'test65',
			mode 			: self.mode,
			lang 			: self.lang,
			parent			: 'test65',				
			model			: 'component_radio_button'
		},
		{ // date test145
			typo			: "ddo",
			tipo 			: 'test145',
			section_tipo 	: 'test65',
			mode 			: self.mode,
			lang 			: self.lang,
			parent			: 'test65',
			model			: 'component_radio_button'
		},
		{ // check_box test146
			typo			: "ddo",
			tipo 			: 'test146',
			section_tipo 	: 'test65',
			mode 			: self.mode,
			lang 			: self.lang,
			parent			: 'test65',
			model			: 'component_check_box'
		},
		{ // select_lang test147
			typo			: "ddo",
			tipo 			: 'test147',
			section_tipo 	: 'test65',
			mode 			: self.mode,
			lang 			: self.lang,
			parent			: 'test65',
			model			: 'component_select_lang'
		},
		{ // publication test148
			typo			: "ddo",
			tipo 			: 'test148',
			section_tipo 	: 'test65',
			mode 			: self.mode,
			lang 			: self.lang,
			parent			: 'test65',
			model			: 'component_publication'
		},
		{ // portal test149
			typo			: "ddo",
			tipo 			: 'test149',
			section_tipo 	: 'test65',
			mode 			: self.mode,
			lang 			: self.lang,
			parent			: 'test65',
			model			: 'component_portal'
		}

	]

	const context = test_context

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

		const loaded = current_data_loader.load().then(function(response){

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
			self.context = current_datum.context.filter(element => element.section_tipo===self.section_tipo)
			self.data 	 = current_datum.data.filter(element => element.section_tipo===self.section_tipo)

		//event_manager.publish('stateChange')
	})
	
	
	return loaded
}//end load_data



/**
* BUILD
* @return 
*/
section.prototype.build = function() {

	const self = this

	const components = self.load_components()
	const groupers 	 = self.load_groupers()

	const loaded = Promise.all([components,groupers])

	return loaded
}//end build



/**
* LOAD_COMPONENTS
*/
section.prototype.load_components = function() {

	const self = this

	const context 		= self.context
	const data 			= self.data
	const data_lenght 	= data.length

		//console.log("data:",data);

	//const components_context = context.filter(component => component.type==='component_info')
	//const components_length  = components_context.length;


	const loaded = new Promise(function(resolve){
		for (let i = 0; i < data_lenght; i++) {

			const component_data 	= data[i]
			const tipo				= component_data.from_component_tipo
			const section_id 	 	= component_data.section_id


			const component_context = context.filter(item => item.type === 'component' && item.tipo === tipo)[0]
			const model 	 		= component_context.model
				//console.log("model:",model);
			
			// init component
				const component_options = {
					model 		: model,
					data		: component_data,
					context 	: component_context,
					section_tipo: self.section_tipo,
					section_id	: section_id,
					tipo 		: tipo,
					modo		: self.modo,
					lang		: self.lang
				}
				instances.get_instance(component_options).then(function(component_instance){
					if(i === (data_lenght-1)){
						resolve(true)
					}
				})				
		}
	})

	return loaded

}//end load_components



/**
* LOAD_GROUPERS
* @return 
*/
section.prototype.load_groupers = function() {

	const self = this

	const context 			= self.context

	const ar_groupers 		= context.filter( item => item.type ==='grouper')
	const ar_groupers_length 	= ar_groupers.length

	const loaded = new Promise(function(resolve){
	
		for (let i = 0; i < ar_groupers_length; i++) {

			const model 	 		= ar_groupers[i].model

			// init component
				const grouper_options = {
					model 		: model,
					context 	: ar_groupers[i],
					section_tipo: self.section_tipo,
					tipo 		: ar_groupers[i].tipo,
					modo		: self.modo
				}

			instances.get_instance(grouper_options).then(function(component_instance){
				if(i === ar_groupers_length-1){
						resolve(true)
					}
			})			
		}
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
* RENDER_LAYOUT
* @return 
*/
section.prototype.render_layout = function(){

	const self = this

	const ar_section_id = self.get_ar_section_id()
	const ar_section_id_length = ar_section_id.length

	const section_main_node = document.getElementById('section_content')

	//create the header of the tool
		const section_dom_node = common.create_dom_element({
							element_type		: 'section',
							id 					: self.section_tipo,
							class_name			: self.model,
							inner_html			: self.model
							})


	for (var i = 0; i < ar_section_id_length; i++) {

		const current_section_id = ar_section_id[i]
		
		
			const current_render_layout = new render_layout()

			const options = {
				context 	: self.context,
				section_tipo: self.section_tipo,
				section_id 	: current_section_id,
				modo 		: self.modo,
				lang 		: self.lang
			}

			current_render_layout.init(options)
			current_render_layout.render().then(function(result){
				section_dom_node.appendChild(result)
			})
			
			section_main_node.appendChild(section_dom_node)

	}

	return 
}//end render_layout



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



/*
* RENDER
* @return 
*/
section.prototype.render = function(){

	const self = this

	//create the header of the tool
			const dom_node = common.create_dom_element({
							element_type		: 'div',
							id 					: self.section_tipo+'_'+self.section_id,
							class_name			: self.model,
							inner_html			: self.model
							})

		console.log("render :",self.model);


	return dom_node
}//end render







