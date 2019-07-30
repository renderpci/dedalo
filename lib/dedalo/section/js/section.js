// imports
	import {data_manager} from '../../common/js/data_manager.js'
	import event_manager from '../../page/js/page.js'
	import * as instances from '../../common/js/instances.js'
	import {render_section} from './render_section.js'
	//import {context_parser} from '../../common/js/context_parser.js'



/**
* SECTION
*/
export const section = function() {

	// element properties declare
		this.model
		this.tipo
		this.section_tipo
		this.section_id
		this.mode
		this.lang

		this.datum
		this.context
		this.data

		this.ar_section_id

		this.node

		this.root_instance


	return true
}//end section



/**
* INIT
* @return bool
*/
section.prototype.init = async function(options) {
	
	const self = this

	self.model 			= options.model
	self.tipo 			= options.tipo
	self.section_tipo 	= options.section_tipo
	self.section_id 	= options.section_id
	self.mode 			= options.mode
	self.lang 			= options.lang
	self.node 			= []
	
	self.datum 	 		= options.datum   || null
	self.context 		= options.context || null
	self.data 	 		= options.data 	  || null

	self.root_instance	= options.root_instance || null
	

	// load data if is not already received as option
		if (!self.datum) {
			const current_data_manager 	= new data_manager()
			const api_response 			= await current_data_manager.section_load_data(self.context)
			// set
			self.datum = api_response.result
		}
			
	// set context and data to current instance
		self.context	= self.datum.context.filter(element => element.section_tipo===self.section_tipo)
		self.data 		= self.datum.data.filter(element => element.section_tipo===self.section_tipo)

		// Update section mode with context declaration
			const section_context = self.context.filter(element => element.tipo===self.section_tipo)[0]
			self.mode = section_context.mode

		// set ar_section_id
			const section_data	= self.datum.data.filter(item => item.tipo===self.section_tipo && item.section_tipo===self.section_tipo)[0]		
			self.ar_section_id	= section_data.value
	
	// events subscription
		// event active (when user focus in dom)
		event_manager.subscribe('section_rendered', (active_section) => {			
			const debug = document.getElementById("debug")
				  debug.classList.remove("hide")
		})

		setTimeout(()=>{
			const debug = document.getElementById("debug")
				  debug.classList.remove("hide")
		},2000)


	return true
}//end init



/*
* RENDER
* @return promise render_promise
*/
section.prototype.render = async function(){

	const self = this
			
	// iterate records
		const ar_section_id 		= self.ar_section_id
		const ar_section_id_length 	= ar_section_id.length
		const ar_instances 			= []
		for (let i = 0; i < ar_section_id_length; i++) {
			console.groupCollapsed("section: section_record " + self.tipo +'-'+ ar_section_id[i]);

			const current_section_id = ar_section_id[i]
			const data				 = self.data.filter(element => element.section_tipo===self.section_tipo && element.section_id===current_section_id)

			// section_record
			const current_section_record = await instances.get_instance({
				model 			: 'section_record',
				tipo 			: self.section_tipo,
				section_tipo	: self.section_tipo,
				section_id		: current_section_id,
				mode			: self.mode,
				lang			: self.lang,
				context 		: self.context,
				data			: data,
				datum 			: self.datum,
				root_instance	: self.root_instance
			})
			// add		
			ar_instances.push(current_section_record)

			console.groupEnd();
		}//end for
	
	// promise all 
		return Promise.all(ar_instances).then( async function(ar_section_record){

			// render using external proptotypes of 'render_component_input_text'
				const mode = self.mode
				let node = null
				switch (mode){
					case 'list':
						// add prototype list function from render_component_input_text
						section.prototype.list 			= render_section.prototype.list
						section.prototype.list_header 	= render_section.prototype.list_header
						const list_node = await self.list(ar_section_record)

						// set
						self.node.push(list_node)
						node = list_node
						break
				
					case 'edit':
					default :
						// add prototype edit function from render_section
						section.prototype.edit = render_section.prototype.edit
						const edit_node = await self.edit(ar_section_record)

						// set
						self.node.push(edit_node)
						node = edit_node
						break
				}
			
			// event publish
				event_manager.publish('section_rendered', self)

			return node
		})
}//end render



/**
* LOAD_DATA
* @return 
*//*
section.prototype.load_data = async function() {

	const self = this

	const current_datum = self.datum
			
	// set data to current instance
		self.context	= current_datum.context.filter(element => element.section_tipo===self.section_tipo)
		self.data 		= current_datum.data.filter(element => element.section_tipo===self.section_tipo)

		// Update section mode with context declaration
			const section_context = self.context.filter(element => element.tipo===self.section_tipo)[0]
			self.mode = section_context.mode

		const section_data		= current_datum.data.filter(item => item.tipo===self.section_tipo && item.section_tipo===self.section_tipo)
		const ar_section_id		= section_data[0].value
		self.ar_section_id 		= ar_section_id

	return true
}//end load_data
*/



/**
* BUILD
* @return 
*//*
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
*/



/**
* LOAD_SECTION_RECORDS
* @return promise loaded
*//*
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
*/



