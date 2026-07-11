// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {open_tool} from '../../../core/tools_common/js/tool_common.js'
	import {object_to_url_vars, open_window} from '../../common/js/utils/index.js'



/**
* VIEW_DEFAULT_LIST_SVG
* List-mode view for component_svg.
*
* Renders a compact, read-only thumbnail of an SVG asset suitable for use inside
* grid/table list layouts (e.g. search results, relation lists). Clicking the
* thumbnail either opens the dedicated viewer window (when an SVG file exists)
* or launches the upload tool so the user can supply the missing file.
*
* Exported symbols:
*   view_default_list_svg        - namespace constructor (no-op; carries static `.render`)
*   view_default_list_svg.render - entry point called by render_list_component_svg
*   get_content_data             - exported helper; also used by other list-view files
*
* Data shape expected on `self` (component_svg instance):
*   self.data         {Object}  - server data layer; has `entries` (Array of file_info objects)
*                                 and optional `external_source` (string URL override)
*   self.context      {Object}  - server context layer; has `features.quality` (string)
*   self.quality      {string}  - quality override (takes precedence over context.features.quality)
*   self.tipo         {string}  - ontology tipo key, e.g. 'rsc855'
*   self.section_tipo {string}  - parent section tipo, e.g. 'rsc302'
*   self.section_id   {string|number} - record id of the parent section
*   self.tools        {Array}   - tool descriptor objects; used to locate 'tool_upload'
*
* `data.entries` is a flat array of file_info objects (same structure as `data.json`
* sample). Each file_info has at minimum:
*   { quality: string, file_path: string, file_exist: boolean }
*
* (!) DEDALO_MEDIA_URL is used in get_content_data but is NOT declared in the
*     global pragma at the top of this file. The eslint no-undef rule will
*     flag it. Add DEDALO_MEDIA_URL to the pragma when the pragma is next revised.
*/
export const view_default_list_svg = function() {

	return true
}//end view_default_list_svg



/**
* RENDER
* Build and return the list-mode DOM wrapper for a component_svg instance.
*
* The wrapper uses the shared `ui.component.build_wrapper_list` builder so it
* receives all standard list CSS classes and data attributes. An additional
* `media` / `media_wrapper` class pair is appended to mark this node as a media
* component for CSS targeting.
*
* A pointer `wrapper.content_data` is stored directly on the node so callers can
* reach the inner content element without re-querying the DOM.
*
* (!) `render_level` is read from options but is never used in this function.
*     The full render is always produced regardless of its value. This mirrors
*     the pattern in view_default_edit_svg where render_level='content' causes
*     an early return, but that branch was not implemented here.
*
* @param {Object} self    - fully initialised component_svg instance
* @param {Object} options - render options; `render_level` ('full'|'content') is
*                           read but currently has no effect in this view
* @returns {HTMLElement} wrapper - the mounted list-mode wrapper node
*/
view_default_list_svg.render = function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {})
		wrapper.classList.add('media','media_wrapper')
		wrapper.appendChild(content_data)
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* Build the inner content node that displays the SVG thumbnail and wires the
* click-to-view / click-to-upload interaction.
*
* Quality resolution:
*   The active quality string (e.g. 'web', 'original') is read first from
*   `self.quality` and falls back to `self.context.features.quality`. This value
*   determines which file_info entry from the entries array is treated as the
*   primary SVG file.
*
* Image URL selection (priority order):
*   1. Thumb quality JPG (`quality === 'thumb'`, `file_exist === true`) — used as
*      the displayed preview image; no cache-busting param is appended because
*      thumbnails are static renditions that rarely change.
*   2. SVG file matching the active quality — appends `?t=<timestamp>` to bypass
*      browser caching after an upload or re-process cycle.
*   3. `page_globals.fallback_image` — shown when no file exists at all.
*
*   If `data.external_source` is set, it overrides the locally resolved URL
*   entirely; the file_info lookup is still performed to determine whether any
*   file exists (for the mousedown branch decision).
*
* Mousedown behaviour:
*   - No file exists → open tool_upload so the user can supply an SVG file.
*     The tool context is looked up by model name from `self.tools`; if not found
*     the string literal 'tool_upload' is passed as a fallback.
*   - File exists → open the dedicated viewer page in a new named window (target
*     'viewer', 1024 × 720 px) by constructing a DEDALO_CORE_URL page URL with
*     mode='edit' and view='viewer'.
*
* @param {Object} self - fully initialised component_svg instance
* @returns {HTMLElement} content_data - the content node, ready to be appended to a wrapper
*/
export const get_content_data = function(self) {

	// short vars
		const data				= self.data || {}
		const entries			= data.entries || [] // value is a files_info list
		const files_info		= entries
		const quality			= self.quality || self.context.features.quality
		const external_source	= data.external_source

	// content_data
		const content_data = ui.component.build_content_data(self)

	// svg element
		const svg_file	= files_info.find(el => el.quality===quality && el.file_exist===true)
	// thumb
		const thumb	= files_info.find(el => el.quality==='thumb' && el.file_exist===true)

		// Prefer the thumb (JPG rendition) for display — smaller payload, no re-encode
		// artifacts. Fall back to the full SVG at the active quality with a cache-busting
		// timestamp, then to the global fallback image when no file is present.
		const file = thumb?.file_path
			? DEDALO_MEDIA_URL + thumb.file_path
			: svg_file
				? DEDALO_MEDIA_URL + svg_file.file_path + '?t=' + (new Date()).getTime()
				: page_globals.fallback_image

		// file_url
			// When an external_source URL is provided it replaces the locally
			// resolved file URL. The file_exist check below is still performed
			// against the local entries array so the upload branch can fire
			// correctly even when an external source is configured.
			const file_url = external_source
				? external_source
				: file

		// image
			const image = ui.create_dom_element({
				element_type	: 'img',
				src				: file_url,
				parent			: content_data
			})

	// open viewer
		const fn_mousedown = function (e) {
			e.stopPropagation();

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
					// Constructs a page URL pointing to the viewer sub-page of
					// this record. session_save and menu are both false so the
					// viewer opens as a minimal, standalone lightbox window.
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
						width	: 1024,
						height	: 720
					})
			}
		}
		image.addEventListener('mousedown', fn_mousedown)


	return content_data
}//end get_content_data



// @license-end
