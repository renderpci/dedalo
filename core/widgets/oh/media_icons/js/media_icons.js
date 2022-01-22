/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../widget_common/widget_common.js'
	import {render_media_icons} from '../js/render_media_icons.js'




/**
* MEDIA_ICONS
*
*/
export const media_icons = function(){

	this.id

	this.section_tipo
	this.section_id
	this.lang
	this.mode

	this.value

	this.node = []

	this.events_tokens = []

	this.status

	return true
}//end media_icons



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	media_icons.prototype.init 	 		= widget_common.prototype.init
	media_icons.prototype.build 	 	= widget_common.prototype.build
	// render
	media_icons.prototype.edit 			= render_media_icons.prototype.edit
	media_icons.prototype.list 			= render_media_icons.prototype.list



// /**
// * INIT
// */
// media_icons.prototype.init = async function(options) {

// 	const self = this

// 	// call the generic commom init
// 		const common_init = widget_common.prototype.init.call(this, options);

// }//end init



/**
* RENDER
*/
media_icons.prototype.render = async function(options={render_level:'full'}) {

	const self = this

	const render_level 	= options.render_level || 'full'
	const render_mode 	= self.mode || 'edit'

	const node = await self[render_mode]({
		render_level : render_level
	})

	self.node.push(node)

	return node
}//end render
