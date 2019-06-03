//import event_manager from './page.js'
import * as instances from '/dedalo/lib/dedalo/common/js/instances.js'
import {data_loader} from '/dedalo/lib/dedalo/common/js/data_loader.js'
import {render_section_layout} from '/dedalo/lib/dedalo/section/js/render_section_layout.js'

/**
* SECTION
*/
export const section = function(options) {

	this.section_id 	= options.section_id
	this.section_tipo	= options.section_tipo
	this.mode 			= options.mode || 'edit'
	this.lang 			= options.lang || 'lg-nolan'

	// optionals
	this.datum 			= options.datum || null
	this.context 		= options.context || null
	this.data 			= options.data || null

		console.log("this:",this);

};//end section


/**
* INIT
* @return 
*/
section.prototype.init = function(options) {

	const self = this

	//this.section_tipo 	= options.section_tipo
	//this.datum 			= options.datum

	self.load_data()

	
	return true
};//end init


/**
* BUILD
* @return 
*/
section.prototype.build = function() {

	const self = this

	const components = self.load_components()
	const groupers = self.load_groupers()

	const loaded = Promise.all([components,groupers])

	return loaded

	
};//end build

/**
* LOAD_DATA
* @return 
*/
section.prototype.load_data = function() {

	const self = this

	const url 	= DEDALO_LIB_BASE_URL + '/section/trigger.section.php'
	const trigger_vars = {		
		section_id 		: this.section_id,
		section_tipo	: this.section_tipo,
		modo 			: this.mode,
		lang 			: this.lang,
		mode 			: 'get_datum'
	}

	const current_data_loader = new data_loader({
		url 	: url,
		body	: trigger_vars
	})

	const loaded = current_data_loader.load().then(function(response){

		const current_datum = response.result
			console.log("current_datum:",current_datum);
		self.context = current_datum.context.filter(element => element.section_tipo === self.section_tipo)
		self.data 	 = current_datum.data.filter(element => element.section_tipo === self.section_tipo)

		//event_manager.publish('stateChange')
	})
	
	
	return loaded
};//end load_data



/**
* LOAD_COMPONENTS
*/
section.prototype.load_components = function() {

	const self = this

	const context 		= self.context
	const data 			= self.data
	const data_lenght 	= data.length

		//console.log("data:",data);

	//const components_context = context.filter(component => component.type==='component_info')
	//const components_length  = components_context.length;


	const loaded = new Promise(function(resolve){
		for (let i = 0; i < data_lenght; i++) {

			const component_data 	= data[i]
			const tipo				= component_data.from_component_tipo
			const section_id 	 	= component_data.section_id


			const component_context = context.filter(item => item.type === 'component' && item.tipo === tipo)[0]
			const model 	 		= component_context.model
				//console.log("model:",model);
			
			// init component
				const component_options = {
					model 		: model,
					data		: component_data,
					context 	: component_context,
					section_tipo: self.section_tipo,
					section_id	: section_id,
					tipo 		: tipo,
					modo		: self.modo,
					lang		: self.lang
				}
				instances.get_instance(component_options).then(function(component_instance){
					if(i === (data_lenght-1)){
						resolve(true)
					}
				})				
		}
	})

	return loaded

}//end load_components


/**
* LOAD_GROUPERS
* @return 
*/
section.prototype.load_groupers = function() {

	const self = this

	const context 			= self.context

	const ar_groupers 		= context.filter( item => item.type ==='grouper')
	const ar_groupers_length 	= ar_groupers.length

	const loaded = new Promise(function(resolve){
	
		for (let i = 0; i < ar_groupers_length; i++) {

			const model 	 		= ar_groupers[i].model

			// init component
				const grouper_options = {
					model 		: model,
					context 	: ar_groupers[i],
					section_tipo: self.section_tipo,
					tipo 		: ar_groupers[i].tipo,
					modo		: self.modo
				}

			instances.get_instance(grouper_options).then(function(component_instance){
				if(i === ar_groupers_length-1){
						resolve(true)
					}
			})			
		}
	})

	return loaded
	
};//end load_groupers



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
};//end get_component_context



/**
* get_component_data
*/
section.prototype.get_component_data = function(compnent_tipo){

	const component_data = 'patata'


	return component_data
}//end get_component_data


/*
* RENDER_LAYOUT
* @return 
*/
section.prototype.render_layout = function(){

	const self = this

	const ar_section_id = self.get_ar_section_id()
	const ar_section_id_length = ar_section_id.length

	const section_main_node = document.getElementById('section_content')

	//create the header of the tool
		const section_dom_node = common.create_dom_element({
							element_type		: 'section',
							id 					: self.section_tipo,
							class_name			: self.model,
							inner_html			: self.model
							})


	for (var i = 0; i < ar_section_id_length; i++) {

		const current_section_id = ar_section_id[i]
		
		
			const current_render_layout = new render_layout()

			const options = {
				context 	: self.context,
				section_tipo: self.section_tipo,
				section_id 	: current_section_id,
				modo 		: self.modo,
				lang 		: self.lang
			}

			current_render_layout.init(options)
			current_render_layout.render().then(function(result){
				section_dom_node.appendChild(result)
			})
			
			section_main_node.appendChild(section_dom_node)

	}

	return 

}//end render_layout


section.prototype.get_ar_section_id = function(){

	const self = this

	const data = self.data
	const data_lenght = data.length

	let ar_section_id = []
	for (var i = 0; i < data_lenght; i++) {
		if (ar_section_id.includes(data[i].section_id)) {
			continue
		}else{
			ar_section_id.push(data[i].section_id)
		}
	}

	return ar_section_id

}



/*
* RENDER
* @return 
*/
section.prototype.render = function(){

	const self = this

	//create the header of the tool
			const dom_node = common.create_dom_element({
							element_type		: 'div',
							id 					: self.section_tipo+'_'+self.section_id,
							class_name			: self.model,
							inner_html			: self.model
							})

		console.log("render :",self.model);


	return dom_node


}//end render







