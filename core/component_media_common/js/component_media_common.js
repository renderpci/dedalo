// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	import {object_to_url_vars, open_window} from '../../common/js/utils/index.js'



/**
* HANDLER_OPEN_VIEWER
* Used in components list mode to open viewer or fallback to upload tool
*/
export const handler_open_viewer = function(e) {
	e.stopPropagation();

	const self = this

	// short vars
		const data			= self.data || {}
		const value			= data.value || [] // value is a files_info list
		const files_info	= value
		// open_window_features. Optional property of the caller image node
		const width			= e.srcElement.open_window_features.width || 1024
		const height		= e.srcElement.open_window_features.height || 720

	// if the files_info doesn't has any quality with file, fire the tool_upload, enable it, so
	// it could be used, else open the player to show the image
	const file_exist = files_info.find(item => item.file_exist===true)
	if(!file_exist){

		// get the upload tool to be fired
			const tool_upload_context = self.tools.find(el => el.model === 'tool_upload')

		// open_tool (tool_common)
			open_tool({
				tool_context	: tool_upload_context || 'tool_upload',
				caller			: self
			})
	}else{

		// open a new window
			const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
				tipo			: self.tipo,
				section_tipo	: self.section_tipo,
				id				: self.section_id,
				mode			: 'edit',
				view			: 'viewer',
				session_save	: false,
				menu			: false
			})
			open_window({
				url		: url,
				target	: 'viewer',
				width	: width,
				height	: height
			})
	}
	return true
}//end handler_open_viewer



// @license-end
