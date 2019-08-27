// import
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'	
	import * as instances from '../../common/js/instances.js'
	import {render_page} from './render_page.js'
	


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
	
	const t0 = performance.now()
	
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
						const sqo 					= sqo_context.show.find(element => element.typo === 'sqo')
						const total_records			= current_data_manager.count(sqo)

					// item instance
						const current_instance = await instances.get_instance({
							model 			: item.model,
							tipo 			: item.tipo,
							section_tipo	: item.section_tipo,
							section_id		: item.section_id,
							mode			: item.mode,
							lang			: item.lang,
							sqo_context		: sqo_context,
							total_records	: total_records,
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
										page.prototype.list	= render_page.prototype.list
										const list_node		= self.list(ar_instances)

										// set
										self.node.push(list_node)
										node = list_node
										break
								
									case 'edit':
									default :
										// add prototype edit function from render_page
										page.prototype.edit = render_page.prototype.edit
										const edit_node 	= self.edit(ar_instances)

										// set
										self.node.push(edit_node)
										node = edit_node
										break
								}

							return node
						})
			}

		}//end for (let i = 0; i < page_items_length; i++)

	return true
}//end page.prototype.render




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
	// sqo_show
		const show = [
			{ // source object 
				typo			: "source",
				model 			: 'section',
				tipo 			: item.section_tipo,
				mode 			: item.mode,
				lang 			: item.lang,
			},
			{ // search query object in section 'test65'
				typo			: "sqo",
				id				: "query_"+item.section_tipo+"_sqo",
				section_tipo	: [item.section_tipo],
				limit			: (item.mode==="list") ? 10 : 1,
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
	// sqo_context	
		const sqo_context = {
			show : show,
			search : []
		}

	return sqo_context
}


