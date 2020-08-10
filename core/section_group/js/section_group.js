/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_section_group} from './render_section_group.js'



/**
* SECTION_GROUP
*/
export const section_group = function(){
	
	this.id

	// element properties declare
	this.model
	this.tipo
	this.section_tipo
	this.section_id
	this.mode
	this.lang

	this.context
	this.parent
	this.type
	this.label

	this.node

	this.id_variant

	return true
};//end section_group



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	section_group.prototype.build		= common.prototype.build
	section_group.prototype.render		= common.prototype.render
	section_group.prototype.destroy		= common.prototype.destroy
	section_group.prototype.list 		= render_section_group.prototype.list
	section_group.prototype.edit 		= render_section_group.prototype.edit



/**
* INIT
* @return
*/
section_group.prototype.init = function(options) {

	const self = this

	self.model 			= options.model
	self.tipo 			= options.tipo
	self.section_tipo 	= options.section_tipo
	self.section_id 	= options.section_id
	self.mode 			= options.mode
	self.lang 			= options.lang

	self.context 		= options.context || null
	self.parent 		= options.parent
	self.type 			= options.type
	self.events_tokens	= []
	self.ar_instances	= []

	self.node  = []

	self.label = self.context.label


	return true
};//end init



/**
* RENDER
* @return
*//*
section_group.prototype.render = async function(assign=true){

	const self = this

	// render using external proptotypes of 'render_component_input_text'
		const mode = self.mode
		let node   = null
		switch (mode){
			case 'list':
				// add prototype list function from render_component_input_text
				section_group.prototype.list = render_section_group.prototype.list
				const list_node = await self.list()
				// set
				if (assign===true) {
					self.node.push(list_node)
				}
				node = list_node
				break

			case 'edit':
			default :
				// add prototype edit function from render_section
				section_group.prototype.edit = render_section_group.prototype.edit
				const edit_node = await self.edit()
				// set
				if (assign===true) {
					self.node.push(edit_node)
				}
				node = edit_node
				break
		}


	return node
};//end render
*/



/**
* LOAD_CONTEXT
* @return
*//*
section_group.prototype.load_context = function() {

	const self = this

	if (self.context) {

		return new Promise(function(resolve) {
		  resolve(self.context)
		});
	}

	const options = {
		model 			: 'section_record',
		tipo 			: self.section_tipo,
		section_tipo 	: self.section_tipo,
		section_id		: self.section_id,
		mode			: self.mode,
		lang			: self.section_lang
	}

	const tipo = self.tipo

	// section instance
		const js_promise = instances.get_instance(options).then(function(current_section_record){

			const context = current_section_record.get_component_context(tipo);

			//event_manager.publish('stateChange')

			// set
				self.context = context

			return context
		})

	//event_manager.subscribe('stateChange', () => self.render())

	return js_promise
};//end load_context
*/



/**
* GET_CONTEXT_CHILDRENS
* @return
*//*
section_group.prototype.get_context_childrens = function(){

	const self = this

	const options = {
		model 			: 'section_record',
		tipo 			: self.section_tipo,
		section_tipo 	: self.section_tipo,
		section_id		: self.section_id,
		mode			: self.mode,
		lang			: self.section_lang
	}

	const tipo = self.tipo

	// section instance
		const js_promise = instances.get_instance(options).then(function(current_section){

			self.childrens = current_section.get_context_childrens(tipo);
		})

	return js_promise
};//end get_context_childrens
*/
