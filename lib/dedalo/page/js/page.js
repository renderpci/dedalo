// import
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'	
	import * as instances from '../../common/js/instances.js'
	import {render_page} from './render_page.js'



// page event_manager init and export
	export default new event_manager({})



/**
* PAGE
* @param object options
*/
export const page = function (options) {
	
	const self = this

	// options fix
	self.options = options
	
	this.status

	return true
}//end page



/**
* INIT
*/
page.prototype.init = async function() {

	const self = this

	self.node 			= []
	self.ar_instances 	= []
	self.page_items 	= self.options.page_items // mixed items types like 'sections', 'tools'..
	self.mode 			= self.options.mode 	  // mode like 'section', 'tool', 'thesaurus'...

	// launch preload all components files in parallel
		import('../../common/js/components_list.js')

	self.status = 'inited'

 	return true
}//end init



/**
* RENDER
*/
page.prototype.render = async function(){
	const t0 = performance.now()
		
	const self = this

	self.status = 'rendering'

	const page_items 		= self.page_items
	const rendered_nodes 	= []
	
	// items render		
		const page_items_length = page_items.length
		for (let i = 0; i < page_items_length; i++) {

			const item = page_items[i]			

			// item instance (load file)
				const current_instance = await instances.get_instance({
					model 				: item.model,
					tipo 				: item.tipo,
					section_tipo		: item.section_tipo,
					section_id			: item.section_id,
					mode				: item.mode,
					lang				: item.lang,
					sqo_context			: item.sqo_context
				})
				// build (load data)
					await current_instance.build(true)

			// add		
				self.ar_instances.push(current_instance)
			

			// render using external proptotypes of 'render_component_input_text'
				// const mode = self.mode
					// let node = null
					// switch (mode){
					// 	case 'list':
					// 		// add prototype list function from render_component_input_text
					// 		page.prototype.list	= render_page.prototype.list
					// 		const list_node		= self.list(self.ar_instances)
				// 
					// 		// set
					// 		self.node.push(list_node)
					// 		node = list_node
					// 		break
					// 
					// 	case 'edit':
					// 	default :
					// 		// add prototype edit function from render_page
					// 		page.prototype.edit = render_page.prototype.edit
					// 		const edit_node 	= self.edit(self.ar_instances)
				// 
				// 		// set
				// 		self.node.push(edit_node)
				// 		node = edit_node
				// 		break
				// }					
			
		}//end for (let i = 0; i < page_items_length; i++)


		const get_node = async () => {
			
			switch (self.mode){

				case 'section' :
					page.prototype.section = render_page.prototype.section
					return self.section() 	
					break;

				default:
					console.error("Not defined page mode: ", self.mode);
			}
								
		}					
		const node = await get_node()

		// set
			self.node.push(node)
		
		// add current
			rendered_nodes.push(node)


	// event publish
		// page not event publish yet

	self.status = 'rendered'

	// debug
		if(SHOW_DEBUG===true) {
			console.log("+ Page rendered", rendered_nodes.length ,"sections in time ms: ",performance.now()-t0)
		}

	
	return rendered_nodes
}//end page.prototype.render


