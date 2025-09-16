// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/



// imports
	import {view_default_list_js_object} from './view_default_list_js_object.js'



/**
* RENDER_LIST_TS_OBJECT
* Manages the element's logic and appearance in client side
*/
export const render_list_ts_object = function() {

	return true
}//end render_list_ts_object



/**
* LIST
* Render element node to use in list
* @param object options
* @return HTMLElement wrapper
*/
render_list_ts_object.prototype.list = async function(options) {

	const self = this

	// view
	const view	= self.context.view || 'default'

	switch(view) {

		case 'default':
		default:
			return view_default_list_ts_object.render(self, options)
	}
}//end list



// @license-end
