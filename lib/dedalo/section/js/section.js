// imports
	//import event_manager from './page.js'
	import * as instances from '/dedalo/lib/dedalo/common/js/instances.js'
	//import {context_parser} from '/dedalo/lib/dedalo/common/js/context_parser.js'
	import {render_section} from './render_section.js'


/**
* SECTION
*/
export const section = function(options) {
	if(SHOW_DEBUG===true) {
		console.log("[section.new] options:",options);
	}


	this.section_tipo	= options.section_tipo
	this.section_id 	= options.section_id  || null
	this.ar_section_id 	= options.ar_section_id || null

	this.mode 			= options.mode || 'edit'
	this.lang 			= options.lang || 'lg-nolan'

	// optionals
	this.datum 			= options.datum || null
	this.context 		= options.context || null
	this.data 			= options.data || null
	
	//control
	this.builded 		= false

	this.node
}//end section



/**
* INIT
* @return 
*/
section.prototype.init = function(options) {
	const self = this

	const current_datum = self.datum
			
	// set data to current instance
		self.context	= current_datum.context.filter(element => element.section_tipo===self.section_tipo)
		self.data 		= current_datum.data.filter(element => element.section_tipo===self.section_tipo)

		// Update section mode with context declaration
			const section_context = self.context.filter(element => element.tipo===self.section_tipo)[0]
			self.mode = section_context.mode

		const section_data		= current_datum.data.filter(item => item.tipo===section_tipo && item.section_tipo===section_tipo)
		const ar_section_id		= section_data[0].value
		self.ar_section_id 		= ar_section_id

	//return loaded
}//end init


/**
* LOAD_DATA
* @return 
*/
section.prototype.load_data = function() {

	const self = this

	const current_datum = self.datum
	const section_tipo = self.section_tipo

			
	// set data to current instance
		self.context	= current_datum.context.filter(element => element.section_tipo===self.section_tipo)
		self.data 		= current_datum.data.filter(element => element.section_tipo===self.section_tipo)

		// Update section mode with context declaration
			const section_context = self.context.filter(element => element.tipo===self.section_tipo)[0]
			self.mode = section_context.mode

		const section_data		= current_datum.data.filter(item => item.tipo===section_tipo && item.section_tipo===section_tipo)
		const ar_section_id		= section_data[0].value
		self.ar_section_id 		= ar_section_id

}//end load_data



/**
* BUILD
* @return 
*/
section.prototype.build = function() {

	const self = this
	const build_promise = self.load_data().then(function(){
	
		const section_records = self.load_section_records()

		return Promise.all([section_records]).then(function(){
			self.builded 	= true
			console.log("instances:",instances);
		})
	})

	return build_promise
}//end build



/**
* LOAD_SECTION_RECORDS
* @return promise loaded
*/
section.prototype.load_section_records = function() {

	const self = this

	const context 		= self.context
	const data 			= self.data
	const section_tipo 	= self.section_tipo
	
	const section_data		= data.filter(item => item.tipo===section_tipo && item.section_tipo===section_tipo)
	const ar_section_id		= section_data[0].value
	self.ar_section_id 		= ar_section_id
	const data_lenght 		= ar_section_id.length
	const context_lenght 	= context.length

	
	const loaded = new Promise(function(resolve){
	
		const section_record_promises =[]	
		// for every section_id
		for (let i = 0; i < data_lenght; i++) {
			
			// init component
				const item_options = {
					model 			: 'section_record',
					data			: data,
					context 		: context,
					section_tipo	: section_tipo,
					section_id		: ar_section_id[i],
					tipo 			: section_tipo,
					mode			: self.mode,
					lang			: self.lang,
					global_context 	: self.context,
					global_data 	: self.context,
				}	

			const current_instance = instances.get_instance(item_options).then(function(section_record){			
				return section_record.build()
			})

			// add the instances to the cache
				section_record_promises.push(current_instance)			
		
		}// end for
			
		return Promise.all(section_record_promises).then(function(){
			resolve(true)
		})
	})//end loaded
		
	return loaded
}//end load_section_records



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
* Parser
* @return promise render_promise
*/
section.prototype.render = function(){

	const self = this

	return new Promise(function(resolve){


		//const build_promise = (self.builded===false) ? self.load_data() : new Promise(function(resolve) { resolve(true); })

		//build_promise.then(function(){

			self.load_data()
			const ar_section_id 		= self.ar_section_id
			const ar_section_id_length 	= ar_section_id.length

			// create the header of the tool
				const section_dom_node = common.create_dom_element({
						element_type	: 'section',
						id 				: self.section_tipo,
						class_name		: self.model,
						inner_html		: self.model
				})
			const render_promises =[]
			// iterate records
			for (var i = 0; i < ar_section_id_length; i++) {

				const current_section_id = ar_section_id[i]
			
				const data	= self.data.filter(element => element.section_tipo===self.section_tipo && element.section_id===current_section_id)

				// build the section_records
				const current_section_record_options = {
					model 			: 'section_record',
					data			: data,
					context 		: self.context,
					section_tipo	: self.section_tipo,
					section_id		: current_section_id,
					tipo 			: self.section_tipo,
					mode			: self.mode,
					lang			: self.lang,
					global_context 	: self.context,
					global_data 	: self.context,
				}	
					console.log("current_section_record_options:",current_section_record_options);
				const current_instance = instances.get_instance(current_section_record_options).then(function(section_record){
						
					const render_promise = section_record.render()

							//render_promise.then(function(record_node){
							//	section_dom_node.appendChild(record_node)
							//							
							//})

					return render_promise

				})
				render_promises.push(current_instance)
		

			}//end for
			return Promise.all(render_promises).then(function(ar_section_record){
					

					const test_container = document.getElementById("test_container");
					for (var i = 0; i < ar_section_record.length; i++) {
						const section_record_node = ar_section_record[i].node
						test_container.appendChild(section_record_node)
						//console.log("**************************:",section_record_node);
					}
				//resolve(section_dom_node)
			})

		})
	//})


}//end render

