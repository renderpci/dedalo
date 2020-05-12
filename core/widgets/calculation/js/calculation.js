/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../widget_common/widget_common.js'
	import {render_calculation} from '../js/render_calculation.js'


export const calculation = function(){

	this.id

	this.section_tipo
	this.section_id
	this.lang
	this.mode

	this.value

	this.node = []

	this.status

	return true
}//end calculation



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	// calculation.prototype.init 	 	= component_common.prototype.init
	// render
	calculation.prototype.edit 			= render_calculation.prototype.edit



/**
* INIT
*/
calculation.prototype.init = async function(options) {

	const self = this

	// call the generic commom init
		const common_init = widget_common.prototype.init.call(this, options);


	// // load dependences js/css
	// 	const load_promises = []
	//
	// 	// css file load
	// 		const lib_css_file = '../css/calculation.css'
	// 		load_promises.push( widget_common.prototype.load_style(lib_css_file) )
	//
	// const js_promise = Promise.all(load_promises)
	//
	//
	// return js_promise
}//end init



/**
* RENDER
*/
calculation.prototype.render = async function(options={render_level:'full'}) {

	const self = this

	const render_level 	= options.render_level || 'full'
	const render_mode 	= self.mode || 'edit'

	const node = await self[render_mode]({
		render_level : render_level
	})

	self.node.push(node)

	return node
}//end render
