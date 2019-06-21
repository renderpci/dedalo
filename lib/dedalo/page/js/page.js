// import


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
			id				: "query_oh1_sqo",
			section_tipo	: ["oh1"],
			limit			: 1,
			order			: null,
			offset			: 0,
			full_count		: true,
			filter			: null
		},
		{ // section 'test65'
			typo			: "ddo",
			model			: 'section',			
			tipo 			: "oh1",
			section_tipo 	: "oh1",
			mode 			: 'edit',
			lang 			: self.lang,
			parent			: "root",			
			mode 			: "edit"
		},
		{ // input text test73
			typo			: "ddo",
			tipo 			: 'oh14',
			section_tipo 	: 'oh1',
			mode 			: 'edit',
			lang 			: self.lang,
			parent			: 'oh2',
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
			model			: 'component_date'
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
		},
		{ // json test150
			typo			: "ddo",
			tipo 			: 'test150',
			section_tipo 	: 'test65',
			mode 			: self.mode,
			lang 			: self.lang,
			parent			: 'test65',
			model			: 'component_json'
		},
		{ // filter test151
			typo			: "ddo",
			tipo 			: 'test151',
			section_tipo 	: 'test65',
			mode 			: self.mode,
			lang 			: self.lang,
			parent			: 'test65',
			model			: 'component_filter'
		},
		{ // filter master test152
			typo			: "ddo",
			tipo 			: 'test152',
			section_tipo 	: 'test65',
			mode 			: self.mode,
			lang 			: self.lang,
			parent			: 'test65',
			model			: 'component_filter_master'
		},
		{ // autocomplete test153
			typo			: "ddo",
			tipo 			: 'test153',
			section_tipo 	: 'test65',
			mode 			: self.mode,
			lang 			: self.lang,
			parent			: 'test65',
			model			: 'component_autocomplete'
		},
		{ // autocomplete hi test154
			typo			: "ddo",
			tipo 			: 'test154',
			section_tipo 	: 'test65',
			mode 			: self.mode,
			lang 			: self.lang,
			parent			: 'test65',
			model			: 'component_autocomplete_hi'
		},
		{ // info test155
			typo			: "ddo",
			tipo 			: 'test155',
			section_tipo 	: 'test65',
			mode 			: self.mode,
			lang 			: self.lang,
			parent			: 'test65',
			model			: 'component_info'
		},
		{ // text large test156
			typo			: "ddo",
			tipo 			: 'test156',
			section_tipo 	: 'test65',
			mode 			: self.mode,
			lang 			: self.lang,
			parent			: 'test65',
			model			: 'component_input_text_large'
		},
		{ // calculation test157
			typo			: "ddo",
			tipo 			: 'test157',
			section_tipo 	: 'test65',
			mode 			: self.mode,
			lang 			: self.lang,
			parent			: 'test65',
			model			: 'component_calculation'
		}

	]

}//end page

/**
* INIT
*/
page.prototype.init = function() {

	const self = this

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

				current_section.render().then(function(response){
	 		 		console.log("render finish:",response);
	 		 	})
			})

			break;
		default:

			break;
	}
}//end init














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



