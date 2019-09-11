// import
	import {common} from '../../common/js/common.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	//import * as instances from '../../common/js/instances.js'
	import {get_instance, delete_instance} from '../../common/js/instances.js'
	import '../../common/js/components_list.js' // launch preload all components files in parallel
	import {render_page} from './render_page.js'



// page event_manager init and export
	export default new event_manager({})



/**
* PAGE
*/
export const page = function () {

	this.id

	this.model
	this.node
	this.ar_instances
	this.elements
	this.mode
	this.status
	this.events_tokens

	return true
}//end page



/**
* INIT
* @param object options
*/
page.prototype.init = async function(options) {

	const self = this

	self.model 			= 'page'
	self.node 			= []
	self.ar_instances 	= []
	self.elements 		= options.elements // mixed items types like 'sections', 'tools'..
	self.mode 			= options.mode 	  // mode like 'section', 'tool', 'thesaurus'...
	self.status			= 'initializing'
	self.events_tokens	= []

	// launch preload all components files in parallel
		//import('../../common/js/components_list.js')

	self.status = 'inited'

	// autobuild
		self.build()

 	return true
}//end init



/**
* BUILD
*/
page.prototype.build = async function() {

	const self = this


	self.status = 'builded'

 	return true
}//end build



/**
* RENDER
*/
page.prototype.render = async function(){
	const t0 = performance.now()

	const self = this

	self.status = 'rendering'

	const elements 	= self.elements
	const rendered_nodes 	= []

	// items render

		// instances
			const elements_length = elements.length
			for (let i = 0; i < elements_length; i++) {

				const item = elements[i]

				// item instance (load file)
					const current_instance = await get_instance({
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

			}//end for (let i = 0; i < elements_length; i++)

		// nodes
			const get_node = async () => {

				switch (self.mode){

					case 'custom' :
						console.error("Not defined page mode: ", self.mode);
						break;

					default:
						page.prototype.default = render_page.prototype.default
						return self.default()
				}

			}
			const node = await get_node()

			// set
				self.node.push(node)


	// event publish
		// page not event publish yet

	self.status = 'rendered'

	// debug
		if(SHOW_DEBUG===true) {
			console.log("+ Page rendered", elements_length ," elements in time ms: ",performance.now()-t0)
		}


	return node
}//end page.prototype.render



/**
* DESTROY
* prototype assign
*/
page.prototype.destroy = common.prototype.destroy



/**
* REFRESH
* prototype assign
*/
page.prototype.refresh 	= common.prototype.refresh


