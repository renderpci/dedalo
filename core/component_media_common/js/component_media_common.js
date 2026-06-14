// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* COMPONENT_MEDIA_COMMON
* Shared browser-side entry point for all Dédalo media components
* (component_image, component_av, component_pdf, component_3d, component_svg).
*
* Exports a single event-handler utility, `handler_open_viewer`, that is bound
* to the thumbnail/preview element rendered in list-mode views. All five media
* component list-view modules import and reuse this handler rather than
* duplicating the fork logic themselves.
*
* The handler implements two mutually exclusive paths:
*   1. No file exists yet AND no external source → open tool_upload so the user
*      can supply the media file (write-permission-gated).
*   2. A file exists OR an external source is configured → open the Dédalo
*      viewer page in a sized popup window.
*
* The popup dimensions are read from `e.srcElement.open_window_features`
* (set by the individual list-view renderer) and default to 1024 × 720.
*
* Globals used:
*   DEDALO_CORE_URL  - base URL for the Dédalo application (PHP-injected constant)
*
* @module component_media_common
*/

// imports
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	import {object_to_url_vars, open_window} from '../../common/js/utils/index.js'



// Media-named aliases of the generic lazy-load / fade-in primitives (events.js).
// The contract is shared with non-media components (json, geolocation, text_area);
// these aliases keep the media edit views' imports stable.
	export {
		lazy_in_viewport as lazy_load_media,
		fade_in_on_reveal as media_fade_in
	} from '../../common/js/events.js'



/**
* HANDLER_OPEN_VIEWER
* Click-event handler bound to the thumbnail element in media component list views.
*
* Decides whether to open the full Dédalo viewer page or to launch the upload
* tool, depending on whether usable media already exists for the current record:
*
*   - If NO quality entry with `file_exist === true` is found AND no external
*     source URL is set: opens tool_upload (only when self.permissions >= 2,
*     i.e. the current user has edit access). The upload tool context is
*     resolved from `self.tools`; if not found, the model string 'tool_upload'
*     is passed as a fallback so open_tool can fetch the context via the API.
*
*   - Otherwise (at least one file exists OR external_source is truthy): opens
*     a named popup window ({'viewer'}) containing the record's viewer page.
*     Query-string parameters include tipo, section_tipo, section_id, mode,
*     view, and flags to suppress session-save and the navigation menu, keeping
*     the viewer page clean and focused.
*
* The function is designed to be called with `this` bound to the component
* instance (self). Callers must set the function as a DOM event handler via
* `.addEventListener('click', handler_open_viewer.bind(self))` or equivalent.
*
* Popup dimensions are read from `e.srcElement.open_window_features` — an
* object literal `{ width: number, height: number }` that individual list-view
* renderers attach directly to the DOM image element before binding this
* handler. Falls back to 1024 × 720 when the property is absent.
*
* Expected shape of `self.data`:
*   {
*     entries         : Array<{quality: string, file_exist: boolean, ...}>,
*     external_source : string|null|undefined
*   }
*
* @param {MouseEvent} e - The DOM click event fired on the thumbnail element.
*   `e.srcElement` (or `e.target`) is expected to carry the optional
*   `open_window_features` property set by the rendering view.
* @returns {boolean} Always returns `true`. Event bubbling is halted via
*   `stopPropagation`; this return value does not affect default action.
*/
export const handler_open_viewer = function(e) {
	// Prevent the click from bubbling to the record-list row, which would
	// otherwise trigger row-selection or other list-level handlers.
	e.stopPropagation();

	// `this` is the component instance, bound by the caller with .bind(self).
	const self = this

	// short vars
		const data				= self.data || {}
		// entries is the files_info list serialised by the server into data.entries.
		// Each entry describes one quality variant of the media file.
		const entries			= data.entries || [] // entries is a files_info list
		const files_info		= entries
		// external_source: truthy string URL when the media lives outside Dédalo's
		// own media tree (e.g. a remote image referenced via component_iri).
		const external_source	= data.external_source
		// open_window_features. Optional property of the caller image node
		// Dimensions are injected by the list-view renderer onto the <img> element
		// before the event listener is attached (e.g. image.open_window_features = {width:720, height:540}).
		// Falls back to 1024×720 (standard viewer size) when not set.
		const width			= e.srcElement.open_window_features?.width || 1024
		const height		= e.srcElement.open_window_features?.height || 720

	// if the files_info doesn't has any quality with file, fire the tool_upload, enable it, so
	// it could be used, else open the player to show the image
	// Scan all quality entries; as long as at least one has file_exist===true the
	// viewer path is taken. external_source also bypasses the upload fork because
	// the media is hosted remotely and uploading locally makes no sense.
	const file_exist = files_info.find(item => item.file_exist===true)
	if(!file_exist && !external_source){

		// Read-only users (permissions < 2) cannot upload; silently exit.
		if( self.permissions < 2 ){
			return true
		}

		// get the upload tool to be fired
		// Prefer the already-loaded tool_upload context from self.tools (avoids
		// an extra API round-trip). Falls back to the string 'tool_upload' so
		// open_tool can resolve and hydrate the context lazily.
			const tool_upload_context = self.tools.find(el => el.model === 'tool_upload')

		// open_tool (tool_common)
			open_tool({
				tool_context	: tool_upload_context || 'tool_upload',
				caller			: self
			})
	}else{

		// open a new window
		// Build the viewer URL on the fly. mode='edit' is passed so the viewer
		// page can show controls (zoom, quality switcher, etc.); the actual
		// viewer view is selected by view='viewer'. session_save and menu are
		// suppressed so the popup remains a clean, focused media viewer.
			const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
				tipo			: self.tipo,
				section_tipo	: self.section_tipo,
				id				: self.section_id,
				mode			: 'edit',
				view			: 'viewer',
				session_save	: false,
				menu			: false
			})
			// target:'viewer' reuses the same named popup across multiple clicks
			// so the user is not flooded with windows.
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
