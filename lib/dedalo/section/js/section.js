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

		//test context data
		const search_query_object = {
			typo			: "sqo",
			id				: "oh1_list",
			section_tipo	: "oh1",
			limit			: 1,
			order			: null,
			offset			: 0,
			full_count		: false,
			filter			: null
		}
		const search_query_object2 = {
			id				: "mdcat597_list",
			section_tipo	: "mdcat597",
			limit			: 10,
			order			: null,
			offset			: 0,
			full_count		: true,
			filter			: null,
			typo			: "sqo"
		}
		const search_query_object3 = {
			id				: "mdcat181_list",
			section_tipo	: "mdcat181",
			limit			: 10,
			order			: null,
			offset			: 0,
			full_count		: true,
			filter			: null,
			typo			: "sqo"
		}
		const search_query_object4 = {
			id				: "dd542_list",
			section_tipo	: "dd542",
			limit			: 10,
			order			: null,
			offset			: 0,
			full_count		: true,
			filter			: null,
			typo			: "sqo"
		}
		const search_query_object5 = {
			id				: "mdcat757_list",
			section_tipo	: "mdcat757",
			limit			: 10,
			order			: null,
			offset			: 0,
			full_count		: true,
			filter			: null,
			typo			: "sqo"
		}
		const search_query_object6 = {
			id				: "mdcat1929_list",
			section_tipo	: "mdcat1929",
			limit			: 10,
			order			: null,
			offset			: 0,
			full_count		: true,
			filter			: null,
			typo			: "sqo"
		}		
		const search_query_object7 = {
			id				: "mupreva500_list",
			section_tipo	: "mupreva500",
			limit			: 10,
			order			: null,
			offset			: 0,
			full_count		: true,
			filter			: null,
			typo			: "sqo"
		}
		const search_query_object8 = {
			id				: "emakumeak2_list",
			section_tipo	: "emakumeak2",
			limit			: 10,
			order			: null,
			offset			: 0,
			full_count		: true,
			filter			: null,
			typo			: "sqo"
		}
		const search_query_object9 = {
			id				: "dd128_list",
			section_tipo	: "dd128",
			limit			: 1,
			order			: null,
			offset			: 0,
			full_count		: true,
			filter			: null,
			typo			: "sqo"
		}
		const dd_object_section = {
			typo				: "ddo",
			model				: 'section',			
			tipo 				: self.section_tipo,
			section_tipo 		: self.section_tipo,
			mode 				: self.mode,
			lang 				: self.lang,
			parent			: "root",			
			mode 				: "edit"
		}
		const dd_object_section_id = {
			tipo 				: 'oh62',
			section_tipo 		: self.section_tipo,
			mode 				: self.mode,
			lang 				: self.lang,
			parent			: self.section_tipo,
			mode 				: "list",
			model				: 'component_section_id',
			typo				: "ddo"
		}

		const oh16 = { // oh1 - titulo
			typo				: "ddo",
			tipo 				: 'oh16',
			section_tipo 		: 'oh1',
			mode 				: 'list',
			lang 				: self.lang,
			parent			: 'oh1',			
			model				: 'component_input_text',
			label 				: "Título entrevista"
		}
		const oh24 = {		
			typo				: "ddo",
			tipo 				: 'oh24',
			section_tipo 		: self.section_tipo,
			mode 				: self.mode,
			lang 				: self.lang,
			parent			: self.section_tipo,
			mode 				: "list",
			model				: 'component_portal'
		}		
		const rsc85 = {
			tipo 				: 'rsc85',
			section_tipo 		: "rsc197",
			parent			: 'oh24',
			mode 				: self.mode,
			lang 				: self.lang,
			mode 				: "edit",
			model				: 'component_input_text',
			typo				: "ddo"				
		}
		const rsc86 = {
			tipo 				: 'rsc86',
			section_tipo 		: "rsc197",
			parent			: 'oh24',
			mode 				: self.mode,
			lang 				: self.lang,
			mode 				: "edit",
			model				: 'component_input_text',
			typo				: "ddo"	
		}
		const dd_object6 = {
			tipo 				: 'oh3',
			section_tipo 		: self.section_tipo,
			parent			: self.section_tipo,
			mode 				: "edit",
			model				: 'section_group',
			typo				: "ddo"
		}
		const dd_object7 = {
			tipo 				: 'oh10',
			section_tipo 		: self.section_tipo,
			mode 				: self.mode,
			lang 				: self.lang,
			parent			: self.section_tipo,
			model				: 'button_new',
			typo				: "ddo"
		}
		const dd_object8 = {
			tipo 				: 'mdcat601',
			section_tipo 		: self.section_tipo,
			mode 				: self.mode,
			parent			: self.section_tipo,
			model				: 'component_number',
			typo				: "ddo"
		}
		const dd_object_number = {
			tipo 				: 'mdcat605',
			section_tipo 		: self.section_tipo,
			mode 				: self.mode,
			parent			: self.section_tipo,
			model				: 'component_number',
			typo				: "ddo"
		}
		const dd_object_number2 = {
			tipo 				: 'mdcat632',
			section_tipo 		: self.section_tipo,
			mode 				: self.mode,
			parent			: self.section_tipo,
			model				: 'component_number',
			typo				: "ddo"
		}
		const dd_object_email = {
			tipo 				: 'mdcat767',
			section_tipo 		: self.section_tipo,
			mode 				: self.mode,
			parent			: self.section_tipo,
			model				: 'component_email',
			typo				: "ddo"
		}
		const dd_object_ip = {
			tipo 				: 'dd544',
			section_tipo 		: self.section_tipo,
			mode 				: self.mode,
			parent			: self.section_tipo,
			model				: 'component_ip',
			typo				: "ddo"
		}
		const dd_object_iri = {
			tipo 				: 'mdcat765',
			section_tipo 		: self.section_tipo,
			mode 				: self.mode,
			parent			: self.section_tipo,
			model				: 'component_iri',
			typo				: "ddo"
		}
		const dd_object_radio_button = {
			tipo 				: 'mdcat2572',
			section_tipo 		: self.section_tipo,
			mode 				: self.mode,			
			lang 				: self.lang,
			parent			: self.section_tipo,
			model				: 'component_radio_button',
			typo				: "ddo"
		}
		const dd_object_radio_button2 = {
			tipo 				: 'mdcat1934',
			section_tipo 		: self.section_tipo,
			mode 				: self.mode,
			lang 				: self.lang,
			parent			: self.section_tipo,
			model				: 'component_radio_button',
			typo				: "ddo"
		}
		const dd_object_autocomplete = {
			tipo 				: 'mupreva2338',
			section_tipo 		: self.section_tipo,
			mode 				: self.mode,
			lang 				: self.lang,
			parent			: self.section_tipo,
			model				: 'component_autocomplete',
			typo				: "ddo"

		}		
		//mdcat630
	
		const dd_object9 = { // codigo oh14 en oh1
			typo				: "ddo",
			tipo 				: 'oh14',
			section_tipo 		: self.section_tipo,
			mode 				: self.mode,
			lang 				: self.lang,
			parent 				: self.section_tipo,
			model				: 'component_input_text'			
		}
		const dd_object10 = { // resumen oh23 en oh1
			typo				: "ddo",
			tipo 				: 'oh23',
			section_tipo 		: self.section_tipo,
			mode 				: self.mode,
			lang 				: self.lang,
			parent 				: self.section_tipo,
			model				: 'component_text_area'			
		}
		const dd_object_select = {
			tipo 				: 'mdcat1933',
			section_tipo 		: self.section_tipo,
			mode 				: self.mode,			
			lang 				: self.lang,
			parent 				: self.section_tipo,
			model				: 'component_select',
			typo				: "ddo"
		}
		const dd_object_select2 = {
			tipo 				: 'mdcat1936',
			section_tipo 		: self.section_tipo,
			mode 				: self.mode,
			lang 				: self.lang,
			parent 				: self.section_tipo,
			model				: 'component_select',
			typo				: "ddo"
		}
		const dd_object_check_box = {
			tipo 				: 'mdcat630',
			section_tipo 		: self.section_tipo,
			mode 				: self.mode,			
			lang 				: self.lang,
			parent 				: self.section_tipo,
			model				: 'component_check_box',
			typo				: "ddo"
		}
		const dd_object_check_box2 = {
			tipo 				: 'mdcat627',
			section_tipo 		: self.section_tipo,
			mode 				: self.mode,
			lang 				: self.lang,
			parent 				: self.section_tipo,
			model				: 'component_check_box',
			typo				: "ddo"
		}		
		const dd_object_select_lang = {
			tipo 				: 'emakumeak7',
			section_tipo 		: self.section_tipo,
			mode 				: self.mode,
			lang 				: self.lang,
			parent 				: self.section_tipo,
			model				: 'component_select_lang',
			typo				: "ddo"
		}
		const dd_object_publication = {
			tipo 				: 'oh32',
			section_tipo 		: self.section_tipo,
			mode 				: self.mode,
			lang 				: self.lang,
			parent 				: self.section_tipo,
			model				: 'component_publication',
			typo				: "ddo"
		}

		const dd_object_profile = {
			tipo 				: 'dd1725',
			section_tipo 		: self.section_tipo,
			mode 				: self.mode,
			lang 				: self.lang,
			parent 				: self.section_tipo,
			model				: 'component_profile',

		const dd_object_informantes = {
			tipo 				: 'rsc197',
			section_tipo 		: 'rsc197',
			mode 				: 'list',
			lang 				: self.lang,
			parent 				: 'oh24',
			model				: 'section',
			typo				: "ddo"
		}

		//portal
		//const context = [search_query_object,dd_object_section_id,dd_object,dd_object2,dd_object3,dd_object5]
		//number
		//const context = [search_query_object2,dd_object,dd_object8,dd_object_number,dd_object_number2]
		//email
		//const context = [search_query_object3,dd_object,dd_object_email]
		//ip
		//const context = [search_query_object4,dd_object,dd_object_ip]
		//iri
		//const context = [search_query_object5,dd_object,dd_object_iri]
		//radio button
		//const context = [search_query_object6,dd_object,dd_object_radio_button,dd_object_radio_button2]

		//autocomplete
		//const context = [search_query_object7,dd_object,dd_object_autocomplete]
		const context = [
			search_query_object,
			dd_object_section, // section
			oh24, // portal
			dd_object_informantes,
			rsc85, // nombre informante
			//rsc86, // apellildo informante
			//oh16, // titulo entrevista
			//dd_object10, // resumen			
		]

		//select
		//const context = [search_query_object6,dd_object,dd_object_select,dd_object_select2]
		//autocomplete
		//const context = [search_query_object7,dd_object,dd_object_autocomplete]
		//check box
		//const context = [search_query_object2,dd_object,dd_object_check_box,dd_object_check_box2]
		//select lang
		//const context = [search_query_object8,dd_object,dd_object_select_lang]
		//publication
		//const context = [search_query_object,dd_object,dd_object_publication]
		//profile
		const context = [search_query_object9,dd_object,dd_object_profile]

		//const context = [
		//	search_query_object,
		//	dd_object_section, // section
		//	// dd_object2 // portal
		//	//dd_object9, // codigo
		//	//dd_object10, // resumen
		//]

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
			if(SHOW_DEBUG===true) {
				if (response.result===false) {
					console.error("API EXCEPTION:",response.msg);
				}
				console.log("[section.load_data] response:",response, " TIME: "+response.debug.exec_time)
				console.log("[section.load_data] context:",response.result.context)
				console.log("[section.load_data] data:",response.result.data)

				const page_wrapper = document.getElementById("page_wrapper")
				page_wrapper.style = "display:grid;grid-template-columns: 30% 1fr;background-color:#f1f2f3;padding: 1em;"
				page_wrapper.innerHTML = "<pre>context: " + JSON.stringify(response.result.context, null, "   ") + "</pre>" 
				page_wrapper.innerHTML += "<pre>data: " + JSON.stringify(response.result.data, null, "   ") + "</pre>" 
				
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







