// import
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'	
	import * as instances from '../../common/js/instances.js'
	import {render_page} from './render_page.js'
	import {paginator} from '../../search/js/paginator.js'
	import {search} from '../../search/js/search.js'
		


// page event_manager init and export
//const event_manager 
	export default new event_manager({})



/**
* PAGE
*/
export const page = function (options) {
	if(SHOW_DEBUG===true) {
		//console.log("[page.new] options:",options)
	}

	const self = this

	self.options = options

	return
}//end page



/**
* INIT
*/
page.prototype.init = async function() {
	const t0 = performance.now();	

	const self = this

	self.node = []
	self.page_items = self.options.page_items

	// launch preload all components files in parallel
		import('../../common/js/components_list.js')

 	return
}//end init




page.prototype.render = async function(){

	const self = this

	const page_items = self.page_items

	// items render
		const page_items_length = page_items.length

		for (let i = 0; i < page_items_length; i++) {

			const item = page_items[i]

			switch(item.model) {

				case 'section':
						const ar_instances = []
						const sqo_context = self.create_sqo_context(item)

					// count rows
						const current_data_manager 	= new data_manager()
						const sqo 					= sqo_context.find(element => element.typo === 'sqo')
						const count_rows			= current_data_manager.count(sqo)


					// item instance
						const current_instance = await instances.get_instance({
							model 			: item.model,
							tipo 			: item.tipo,
							section_tipo	: item.section_tipo,
							section_id		: item.section_id,
							mode			: item.mode,
							lang			: item.lang,
							sqo_context		: sqo_context,
							count 			: count_rows,
						})

					// add		
						ar_instances.push(current_instance)
					

					// promise all 
						Promise.all(ar_instances).then( async function(ar_instances){

							// render using external proptotypes of 'render_component_input_text'
								const mode = self.mode
								let node = null
								switch (mode){
									case 'list':
										// add prototype list function from render_component_input_text
										page.prototype.list 			= render_page.prototype.list
										const list_node = self.list(ar_instances)

										// set
										self.node.push(list_node)
										node = list_node
										break
								
									case 'edit':
									default :
										// add prototype edit function from render_page
										page.prototype.edit = render_page.prototype.edit
										const edit_node 	= self.edit(ar_instances)

										// search filter
											const current_search = new search()

											current_search.init({
												sqo_context 	: sqo_context,
												caller 			: current_instance,
												parent_node		: edit_node,
											})

										// paginator js
											const current_paginator = new paginator()

											current_paginator.init({
												sqo_context 	: sqo_context,
												caller 			: current_instance,
												count_rows		: count_rows,
												parent_node		: edit_node,
											})

										

										// set
										self.node.push(edit_node)
										node = edit_node
										break
								}

							return node
						})
			}

		}//end for (let i = 0; i < page_items_length; i++)



	/*
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
	*/
}






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


	debug.classList.remove("hide")
	main.classList.remove("hide")


	return true
}//end load_section_data_debug



/**
* CREATE_SQO_CONTEXT
* @return 
*/
page.prototype.create_sqo_context = function(item){

	// filter
		let filter = null
		if (item.section_id) {
			filter = {
				"$and": [{
					q: item.section_id,
					path: [{
						section_tipo : item.section_tipo,
						modelo 		 : "component_section_id"
					}]
				}]
			}
		}
	// sqo
		const sqo_context = [
			{ // search query object in section 'test65'
				typo			: "sqo",
				id				: "query_"+item.section_tipo+"_sqo",
				section_tipo	: [item.section_tipo],
				limit			: (item.mode==="list") ? 10 : 2,
				order			: null,
				offset			: 0,
				full_count		: false,
				filter			: filter
			},
			{ // section 'test65'
				typo			: "ddo",
				model			: item.model,		
				tipo 			: item.section_tipo,
				section_tipo 	: item.section_tipo,
				mode 			: item.mode,
				lang 			: item.lang,
				parent			: "root"
			}
		]

	return sqo_context
}




