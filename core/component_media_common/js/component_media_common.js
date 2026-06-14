// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	import {object_to_url_vars, open_window} from '../../common/js/utils/index.js'
	import {when_in_viewport} from '../../common/js/events.js'



/**
* LAZY_LOAD_MEDIA
* Standard lazy-load trigger shared by all media edit views (image, svg, pdf, ...).
* Defers `on_enter` until the node nears the viewport, using a uniform 200px
* preload margin so heavy media (svg objects, pdf iframes, large images) start
* loading slightly before they become visible and feel instant on scroll.
* Thin wrapper over when_in_viewport to keep the preload margin consistent in
* one place instead of being copy-pasted as raw IntersectionObserver blocks.
* @param {HTMLElement} node
* @param {Function} on_enter - Invoked once when the node nears the viewport.
* @return {IntersectionObserver|undefined}
*/
export const lazy_load_media = function(node, on_enter) {
	return when_in_viewport(node, on_enter, true, { rootMargin: '200px' })
}//end lazy_load_media



/**
* MEDIA_FADE_IN
* Shared smooth fade-in for lazy-loaded media containers. Adds the `.media_fade`
* class (defined in layout.less) so the container starts invisible, and returns
* a `reveal` function the caller invokes once the media is ready (on load and on
* error) to fade it in. Centralizes what used to be duplicated inline
* `style.opacity` / `style.transition` assignments across image and svg.
* @param {HTMLElement} container
* @return {Function} reveal - Call to fade the container in.
*/
export const media_fade_in = function(container) {
	container.classList.add('media_fade')
	return () => container.classList.add('is_loaded')
}//end media_fade_in



/**
* HANDLER_OPEN_VIEWER
* Used in components list mode to open viewer or fallback to upload tool
*/
export const handler_open_viewer = function(e) {
	e.stopPropagation();

	const self = this

	// short vars
		const data				= self.data || {}
		const entries			= data.entries || [] // entries is a files_info list
		const files_info		= entries
		const external_source	= data.external_source
		// open_window_features. Optional property of the caller image node
		const width			= e.srcElement.open_window_features?.width || 1024
		const height		= e.srcElement.open_window_features?.height || 720

	// if the files_info doesn't has any quality with file, fire the tool_upload, enable it, so
	// it could be used, else open the player to show the image
	const file_exist = files_info.find(item => item.file_exist===true)
	if(!file_exist && !external_source){

		if( self.permissions < 2 ){
			return true
		}

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
