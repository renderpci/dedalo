// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, Promise, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {view_default_list_portal} from './view_default_list_portal.js'
	import {view_mini_portal} from './view_mini_portal.js'
	import {view_text_list_portal} from './view_text_list_portal.js'
	import {view_line_list_portal} from './view_line_list_portal.js'
	//indexation
	import {view_indexation_list_portal} from './view_indexation_list_portal.js'
	// dataframe
	import {view_default_list_dataframe} from '../../component_dataframe/js/view_default_list_dataframe.js'
	import {view_mini_list_dataframe} from '../../component_dataframe/js/view_mini_list_dataframe.js'



/**
* RENDER_LIST_COMPONENT_PORTAL
* Manages the component's logic and appearance in client side
*/
export const render_list_component_portal = function() {

	return true
}//end render_list_component_portal



/**
* LIST
* Render node for use in list
* @param object options
* @return HTMLElement|null
*/
render_list_component_portal.prototype.list = async function(options) {

	const self = this

	// view
		// used the prefix dataframe for component_dataframes view
		const dataframe	= (self.model === 'component_dataframe')
			? 'dataframe_'
			: ''

		// get the view define in context if is not set use default
		const view = self.context.view
			? `${dataframe}${self.context.view}`
			: 'default'

	switch(view) {

		case 'line':
			return view_line_list_portal.render(self, options)

		case 'mini':
			return view_mini_portal.render(self, options)

		case 'text':
			return view_text_list_portal.render(self, options)

		case 'indexation':
			return view_indexation_list_portal.render(self, options)

		case 'dataframe_default':
			return view_default_list_dataframe.render(self, options)

		case 'dataframe_text':
		case 'dataframe_mini':
			return view_mini_list_dataframe.render(self, options)

		case 'mosaic':
		case 'default':
		default:
			return view_default_list_portal.render(self, options)
	}
}//end list



// @license-end
