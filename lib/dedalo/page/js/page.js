// import
	import {global_event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'	
	import * as instances from '../../common/js/instances.js'
		


// page event_manager init and export
const event_manager = new global_event_manager({})
	export default event_manager



/**
* PAGE
*/
export const page = function (options) {
	//if(SHOW_DEBUG===true) {
	//	console.log("[page.new] options:",options)
	//}

	const self = this

	self.model 			= options.model
	self.section_tipo 	= options.section_tipo
	self.section_id 	= options.section_id
	self.mode 			= options.mode //'list'//options.mode
	self.lang 			= options.lang
	
	// filter
		let filter = null
		if (self.section_id) {
			filter = {
				"$and": [
			      {
			        q: self.section_id,
			        path: [
						{
			        		section_tipo : self.section_tipo,
			        		modelo 		 : "component_section_id"
						}
			        ]
			      }
			    ]
			}
		}

	// context
	self.sqo_context = [
		{ // search query object in section 'test65'
			typo			: "sqo",
			id				: "query_"+self.section_tipo+"_sqo",
			section_tipo	: [self.section_tipo],
			limit			: (self.mode==="list" ? 10 : 1),
			order			: null,
			offset			: 0,
			full_count		: true,
			filter			: filter
		},
		{ // section 'test65'
			typo			: "ddo",
			model			: 'section',			
			tipo 			: self.section_tipo,
			section_tipo 	: self.section_tipo,
			mode 			: this.mode,
			lang 			: self.lang,
			parent			: "root"
		},

		//{ // section_group test158
		//	typo			: "ddo",
		//	tipo 			: 'test175', // 'test158'
		//	section_tipo 	: 'test65',
		//	mode 			: this.mode ,
		//	lang 			: self.lang,
		//	parent			: 'test65',				
		//	model			: 'section_group'
		//},

		//{ // section_group test169 (nested)
		//	typo			: "ddo",
		//	tipo 			: 'test149',
		//	section_tipo 	: 'test65',
		//	mode 			: this.mode ,
		//	lang 			: self.lang,
		//	parent			: 'test65',
		//	model			: 'section_group'
		//},

		//{ // component_input_text test159
		//	typo			: "ddo",
		//	tipo 			: 'test153',
		//	section_tipo 	: 'test65',
		//	mode 			: this.mode ,
		//	lang 			: self.lang,
		//	parent			: 'test65',				
		//	model			: 'component_input_text'
		//},

		//{ // component_input_text test159
		//	typo			: "ddo",
		//	tipo 			: 'test175', // potal test149,  autocomplete: test153
		//	section_tipo 	: 'test65',
		//	mode 			: this.mode ,
		//	lang 			: self.lang,
		//	parent			: 'test65',				
		//	model			: 'component_input_text'
		//},

		//{ // component_number test139
		//	typo			: "ddo",
		//	tipo 			: 'test139',
		//	section_tipo 	: 'test65',
		//	mode 			: this.mode ,
		//	lang 			: self.lang,
		//	parent			: 'test65',				
		//	model			: 'component_number'
		//},

		{ // free test selector
			typo			: "ddo",
			tipo 			: 'test176',
			section_tipo 	: self.section_tipo,
			mode 			: self.mode ,
			lang 			: self.lang,
			parent			: self.section_tipo
		}	
	]

	//console.log("self.sqo_context:",self.context);
	// events subscription
		// event active (when user focus in dom)
		//event_manager.subscribe('section_rendered', (active_section) => {
			//if (active_section_record.id===self.id) {
		//		console.log("-- event section_rendered: active_section:",active_section.section_tipo);
			//}			
		//})
		
}//end page



/**
* INIT
*/
page.prototype.init = async function() {	

	const self = this	

	switch (this.model){
		case 'section':	

			// launch preload all components files in parallel
				import('../../common/js/components_list.js')

			//get the array of the sections in the sqo (multiple for thesaurus)
				const sqo = self.sqo_context.filter(element => element.typo === 'sqo')[0]
				const ar_sections = sqo.section_tipo

			// data_manager. load_section_data. start load in parallel
				const current_data_manager 		= new data_manager()
				const load_section_data_promise = current_data_manager.section_load_data(self.sqo_context)
				
				if(SHOW_DEBUG===true) {
					self.load_section_data_debug(load_section_data_promise)
				}

				// render section on load data
			 		const api_response 	= await load_section_data_promise
			 		self.datum 		= api_response.result

			// iterate sections 
			const ar_sections_length = ar_sections.length;
			for (let i = 0; i < ar_sections_length; i++) {

				load_section(self)
			}

			/*
				// load_section_data. start load in parallel
				const current_data_manager 		= new data_manager()
				const load_section_data_promise = current_data_manager.section_load_data(self.context)
				
				if(SHOW_DEBUG===true) {				
				//	self.load_section_data_debug(load_section_data_promise)
				}

				// launch preload all components files in parallel
				import('../../common/js/components_list.js')			

				// render section on load data
	 		 		const api_response 	= await load_section_data_promise
	 		 		const datum 		= api_response.result

	 		 	// section instance
					const current_section = await instances.get_instance({
						model 			: 'section',
						tipo 			: self.section_tipo,
						section_tipo	: self.section_tipo,
						section_id		: self.section_id,
						mode			: self.mode,
						lang			: self.lang,
						context 		: self.context,
						datum 			: datum,
						root_instance	: self.section_tipo + "_" + self.lang
					})
				
				// render section
					current_section.render().then( section => {
						// append to page dom node 'main'
		 		 		const main = document.getElementById("main")

		 		 		// clean
							while (main.firstChild) {
								main.removeChild(main.firstChild)
							}					
		 		 		main.appendChild(section)
		 		 		main.classList.remove("hide")
		 		 		
		 		 		console.log("[page.init] section build/render finish! " + (performance.now() - t0) + " milliseconds.")
		 		 		//console.log("instances:",instances.instances);
		 		 		console.groupCollapsed("INSTANCES LIST");
		 		 		for (let i = 0; i < instances.instances.length; i++) {
		 		 			const current = instances.instances[i]
		 		 			console.log("current instance id:",current.id);
		 		 		}
		 		 		console.groupEnd()
						
		 		 		
		 		 		if (self.context[0].offset<2) {

			 		 		setTimeout(function(){

			 		 				main.classList.add("hide")

			 		 			self.context[0].offset = parseInt(self.context[0].offset) + 2

								instances.delete_instance({
									model 			: 'section',
									tipo 			: self.section_tipo,
									section_tipo	: self.section_tipo,
									section_id		: self.section_id,
									mode			: self.mode,
									lang			: self.lang
								})

			 		 			self.init()
			 		 		},3000)
		 		 		}
		 		 	})
				*/
			break;

		default:
			break;
	}

	return true
}//end init



/**
* LOAD_SECTION
* @param object self
* @return DOM node section
*/
const load_section = async function(self) {
	const t0 = performance.now();


	// main container
	const main = document.getElementById("main")
		  main.classList.add("loading")

	 	// section instance
		const current_section = await instances.get_instance({
			model 			: 'section',
			tipo 			: self.section_tipo,
			section_tipo	: self.section_tipo,
			section_id		: self.section_id,
			mode			: self.mode,
			lang			: self.lang,
			sqo_context		: self.sqo_context,
			datum 			: self.datum
			//root_instance	: self.section_tipo + "_" + self.lang
		})
	
	// render section
		const section = await current_section.render()
	
	// main container. Append to page dom node 'main' 
		while (main.firstChild) {
			main.removeChild(main.firstChild)
		}						
 		main.appendChild(section)
 		main.classList.remove("loading")
 		main.classList.remove("hide")
 		
 	// debug
 		console.log("[page.init] section build/render finish! " + (performance.now() - t0) + " milliseconds.")
 		const total_time = document.getElementById("total_time")
 		const total_time_info = common.create_dom_element({
			element_type : 'div',
			text_content : "finish! " + Math.round(performance.now() - t0) + " milliseconds.",
			parent 		 : total_time
		})
 		//console.log("instances:",instances.instances);
 		//console.groupCollapsed("INSTANCES LIST");
 		for (let i = 0; i < instances.instances.length; i++) {
 			const current = instances.instances[i]
 			//console.log("current instance id:",current.id);
 		}
 		console.groupEnd()
		

	return section
}//end load_section



/**
* LOAD_SECTION_DATA_DEBUG
* @return 
*/
page.prototype.load_section_data_debug = async function(load_section_data_promise) {

	const self = this

	const response = await load_section_data_promise

	const section_tipo 	= self.section_tipo
	const context 		= self.sqo_context
	console.log("----> request context:",context);

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
//
//	const previous = common.create_dom_element({
//		element_type 	: "button",		
//		text_content   	: "Prev",
//		parent 		 	: time_info_pre
//	})
//	.addEventListener("click", (e) => {
//		self.sqo_context[0].offset = (self.sqo_context[0].offset>0) ? parseInt(self.sqo_context[0].offset) - 2 : 0
//		console.log("self.sqo_context[0].offset:",self.sqo_context[0].offset);
//		load_section(self, true)
//	})
//
//	const next = common.create_dom_element({
//		element_type 	: "button",
//		text_content   	: "Next",
//		parent 		 	: time_info_pre
//	})
//	.addEventListener("click", (e) => {
//		self.sqo_context[0].offset = parseInt(self.sqo_context[0].offset) + 2
//		console.log("self.sqo_context[0].offset:",self.sqo_context[0].offset);
//		load_section(self, true)
//	})

	debug.classList.remove("hide")
	main.classList.remove("hide")


	return true
}//end load_section_data_debug







// des
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



