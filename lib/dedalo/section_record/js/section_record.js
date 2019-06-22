// imports
	//import event_manager from './page.js'
	import * as instances from '/dedalo/lib/dedalo/common/js/instances.js'
	import {context_parser} from '/dedalo/lib/dedalo/common/js/context_parser.js'



/**
* SECTION
*/
export const section_record = function(options) {
	if(SHOW_DEBUG===true) {
		//console.log("[section_record.new] options:",options);
	}

	this.section_id 	= options.section_id
	this.section_tipo	= options.section_tipo
	this.mode 			= options.mode || 'edit'
	this.lang 			= options.lang || 'lg-nolan'

	// optionals
	this.context 		= options.context || null
	this.data 			= options.data || null

	//control
	this.builded 		= false
}//end section



/**
* INIT
* @return 
*/
section_record.prototype.init = function(options) {
	const self = this

	//this.section_tipo 	= options.section_tipo
	//this.datum 			= options.datum

	// load data from db
		
	
	return loaded
}//end init



/**
* BUILD
* @return 
*/
section_record.prototype.build = function() {

	const self = this
	
	const components = self.load_items()
	//const groupers 	 = self.load_groupers()

	return Promise.all([components]).then(function(){
		self.builded 	= true
	})

}//end build



/**
* LOAD_items
* @return promise loaded
*/
section_record.prototype.load_items = function() {

	const self = this

	const context 			= self.context
	const context_lenght 	= context.length
	const data 				= self.data
	const section_tipo 		= self.section_tipo
	const section_id 		= self.section_id
	
	const loaded = new Promise(function(resolve){
		
		const instances_promises =[]

		// for every item in the context
		for (let j = 0; j < context_lenght; j++) {

			const current_item 			= context[j]

			// remove the section of the create item instances (the section is instanciated, it's the current_section)
			if(current_item.tipo === section_tipo) continue;

			let item_options = {}

			// check if current item is a grouper, it don't has data and will need the childrens for instance it.
			if(current_item.type === 'grouper'){
			
				// get the childrens of the group for build the context
				// the groupers has the own dd_object and the childrens for render it.
				const group_childrens 		 = context.filter(item => item.parent===current_item.tipo)

				// init grouper
				item_options = {
					model 		: current_item.model,
					context 	: current_item,
					childrens	: group_childrens,
					section_tipo: current_item.section_tipo,
					section_id	: section_id,
					tipo 		: current_item.tipo,
					mode		: current_item.mode,
					lang		: current_item.lang
				}

			}else{
				// select the data for the current item
				let item_data = data.filter(item => item.tipo === current_item.tipo && item.section_id === section_id)[0]
				
				// if the current item don't has data will be instanciated with the current section_id
				if ( typeof(item_data) === 'undefined') {
					item_data = {
						section_id: section_id,
						value: []
					}
				}
				// init component
				item_options = {
					model 		: current_item.model,
					data		: item_data,
					context 	: current_item,
					section_tipo: current_item.section_tipo,
					section_id	: section_id,
					tipo 		: current_item.tipo,
					mode		: current_item.mode,
					lang		: current_item.lang
				}
			}

			const current_instance = instances.get_instance(item_options)
			// add the instances to the cache
				//console.log("current_instance:",current_instance);
				instances_promises.push(current_instance)			
		}
		
		return Promise.all(instances_promises).then(function(){
			resolve(true)
		})
	})

	return loaded
}//end load_items



/**
* GET_COMPONENT_CONTEXT
* @return 
*/
section_record.prototype.get_component_context = function(compnent_tipo) {

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
section_record.prototype.get_component_data = function(compnent_tipo){

	const component_data = 'patata'


	return component_data
}//end get_component_data



/*
* RENDER
* @return promise render_promise
*/
section_record.prototype.render = function(){

	const self = this

	const render_promise = new Promise(function(){

		const section_main_node = document.getElementById('section')

		const build_promise = (self.builded===false) ? self.build() : new Promise(function(resolve) { resolve(true); })

		build_promise.then(function(response){

			const section_id 		= self.section_id

			// create the header of the tool
				const section_dom_node = common.create_dom_element({
						element_type	: 'section_record',
						id 				: self.section_tipo +'_'+ section_id,
						class_name		: self.model
					})

			// get the direct childrens of the record to render it
			const childrens	= self.context.filter(element => element.parent===self.section_tipo)

			const options = {
					childrens 	: childrens,
					section_id 	: section_id,
					root_tipo 	: self.section_tipo,
					root_node 	: section_dom_node
				}
		
			//render the section_record
			const current_context_parser = new context_parser(options)

			current_context_parser.render()					
		})	
	})

	return render_promise 
}//end render


