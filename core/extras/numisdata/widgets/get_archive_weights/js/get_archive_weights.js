/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {data_manager} from '../../common/js/data_manager.js'
	import {widget_common} from '../../component_info/widgets/widget_common.js'
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

	const self = this

	// call the generic commom init
		const common_init = widget_common.prototype.init.call(this, options);

	
	// load dependences js/css
		const load_promises = []

		// css file load
			const lib_css_file = '../css/get_archive_weights.css'
			load_promises.push( common.prototype.load_style(lib_css_file) )

	const js_promise = Promise.all(load_promises)


	return js_promise
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






