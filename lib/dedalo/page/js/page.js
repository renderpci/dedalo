// import

import {data_loader} from '/dedalo/lib/dedalo/common/js/data_loader.js'

/*import {section} 		from './section.js'
	import * as instances 	from './instances.js'
	import {event_manager} from './utils_events.js'
	import {get_records}	from './records.js'
	//import {render_layout}	from './render_layout.js'
	
	export default new event_manager({});
*/
	//console.log("page_options:",window.page_options);


/**
* PAGE
*/
export const page = function (options) {
	if(SHOW_DEBUG===true) {
		console.log("[page.new] options:",options);
	}

	const self = this

	this.model 			= options.model
	this.section_tipo 	= options.section_tipo
	this.section_id 	= options.section_id
	this.mode 			= options.mode
	this.lang 			= options.lang

	this.context = [
		{ // search query object in section 'test65'
			typo			: "sqo",
			id				: "query_test65_sqo",
			section_tipo	: ["test65"],
			limit			: 10,
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
			mode 			: 'edit',
			lang 			: self.lang,
			parent			: "root"
		},
		{ // section_group oh2
			typo			: "ddo",
			tipo 			: 'test158',
			section_tipo 	: 'test65',
			mode 			: 'edit',
			lang 			: self.lang,
			parent			: 'test65',				
			model			: 'section_group'
		},
	]

}//end page

/**
* INIT
*/
page.prototype.init = function() {

	const self = this
	const load_data_promise = self.load_data()


	switch (this.model){
		case 'section':
			// section . load module and init
			const section_path = DEDALO_LIB_BASE_URL + '/section/js/section.js'
			import (section_path).then(function(result){

				const current_section = new result.section({
					model 			: self.model,
					section_tipo 	: self.section_tipo,
					section_id 		: self.section_id,
					mode 			: self.mode,
					lang 			: self.lang,
					context 		: self.context
				})
				//current_section.render().then(function(response){
	 		 				//current_section.render_layout()
	 		 	//		})
	 		 	console.log("load_data_promise:",load_data_promise);
	 		 	load_data_promise.then(function(datum){
	 		 			console.log("datum:",datum);
	 		 		current_section.datum = datum
	 		 			console.log("current_section:",current_section);
					const render = current_section.render().then(function(response){
		 		 		console.log("build/render finish:",response);
		 		 	})
	 		 	})
				
	 		// 		console.log("current_section:",render);
			})



			break;
		default:

			break;
	}
}//end init



/**
* LOAD_DATA
* @return 
*/
page.prototype.load_data = function() {

	const self = this

	const section_tipo 	= self.section_tipo
	const context 		= self.context
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


			// debug
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
		return current_datum
		
	})
	
	
	return loaded_promise
}//end load_data












// context_section 
	/*
	const context_section = context.reduce( function(acc,element) {
		if(element.type === 'section_info') return element
		return acc
	},null)
	*/
	//const data_section 				= data.filter(element => element.section_tipo === context_section.section_tipo)
	//const context_current_section 	= context.filter(element => element.section_tipo === context_section.section_tipo)

// ar_sections grouped 6
	//const ar_sections = group_by_key(data_section, 'section_id')

// iterate sections 
	//const ar_sections_length = ar_sections.length;
	//for (let i = 0; i < ar_sections_length; i++) {

	/*	const section_id = 1;
		const section_tipo = 'numisdata3';


		// instance
			const options = {
				model 		 : 'section',
				section_tipo : section_tipo,
				datum 	 	 : get_records()
			}			
			instances.get_instance(options).then(function(section_instance){
					// console.log("get_component_instance response:",response);
					// console.log("instances:",instances.instance_components);
					section_instance.load_components()
			})

			*/

		// render layout
		//const current_layout = new render_layout()

		//current_layout.init(options.datum.context)
		//current_layout.render()


			// const lets_go = function (response) {
			// 
	 		// 	console.log("////////////// lets_go response:",response);
	 		//
	 		// 	// instance
	 		// 	const options = {
	 		// 		model 		 : 'section',
	 		// 		section_tipo : 'test65',
	 		// 		datum 	 	 : response.result
	 		// 	}			
	 		// 	instances.get_instance(options).then(function(section_instance){
			// 
	 		// 			section_instance.build().then(function(){
	 		// 				section_instance.render_layout()
	 		// 			})
	 		// 	})
	 		// 
	 		// }
 
		// window.lets_go = lets_go
		// const section_content = document.getElementById('section_content')


		/*module.exports = {
			lets_go: lets_go
		}

		
		// init the filter (search2)	
		const search_options = {
			// standard options
			section_tipo : 'test65',
			temp_filter : null,
			modo : 'json',
			ar_real_section_tipo : null,
			ar_sections_by_type : null,
			// custom options
			parse_mode: 'list',
			search_callback:  'lets_go',
			ar_list_map: {
				test65 : [
					{
						tipo: "test79",
						model: "section_group",
						modo: "list"
					},
					{
						tipo: "test73",
						model: "component_input_text",
						modo: "list"
					},
					{
						tipo: "test55",
						model: "component_select",
						modo: "list"
					},
					{
						tipo: "test139",
						model: "section_group",
						modo: "list"
					},
					{
						tipo: "test140",
						model: "component_input_text",
						modo: "list"
					}
				]
			}
		}
		
		search2.init(search_options, section_content).then(function(e){
			// Promise actions
				console.log("////////////// lets_go response::",e);
		})	
		
*/
		// First search with previous user search options
	//	search2.search(null, search2.get_search_query_object())

		
		// init
			//	section_instance.init(section_tipo);



		// load components. iterate all section context components and 
		// force load data from section
			
/*
		const options = {
			model 			: 'component_input_text',
			component_tipo	: 'numisdata27',
			section_tipo 	: 'numisdata3',
			section_id		: 24,
			modo			: 'edit',
			lang			: 'lg-nolan'
		}




		const component_instance = instances.get_instance(options).then(function(response){
					// console.log("get_component_instance response:",response);
					// console.log("instances:",instances.instance_components);
				})

		const options_select = {
			model 			: 'component_select',
			component_tipo	: 'numisdata77',
			section_tipo 	: 'numisdata3',
			section_id		: 24,
			modo			: 'edit',
			lang			: 'lg-nolan'
		}




		const component_instance_select = instances.get_instance(options_select).then(function(response){
					// console.log("get_component_instance response:",response);
					// console.log("instances:",instances.instance_components);
				})

*/

		
	//}



