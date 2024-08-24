// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../../component_info/widgets/widget_common.js'
	import {render_get_archive_weights} from '../../get_archive_weights/js/render_get_archive_weights.js'



export const get_archive_weights = function(){

	this.id

	this.section_tipo
	this.section_id
	this.lang
	this.mode

	this.value

	this.node

	this.status

	return true
}//end get_archive_weights



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	// get_archive_weights.prototype.init 	 	= component_common.prototype.init
	// render
	get_archive_weights.prototype.edit 			= render_get_archive_weights.prototype.edit



/**
* INIT
*/
get_archive_weights.prototype.init = async function(options) {

	// call the generic common init
		const common_init = await widget_common.prototype.init.call(this, options);

	// load dependencies js/css
		// 	const load_promises = []
		//
		// 	// css file load
		// 		const lib_css_file = '../css/get_archive_weights.css'
		// 		load_promises.push( widget_common.prototype.load_style(lib_css_file) )
		//
		// const js_promise = Promise.all(load_promises)
		//
		//
		// return js_promise

	return common_init
}//end init



/**
* RENDER
*/
get_archive_weights.prototype.render = async function(options={render_level:'full'}) {

	const self = this

	const render_level 	= options.render_level || 'full'
	const render_mode 	= self.mode || 'edit'

	const node = await self[render_mode]({
		render_level : render_level
	})

	self.node.push(node)

	return node
}//end render



// @license-end
