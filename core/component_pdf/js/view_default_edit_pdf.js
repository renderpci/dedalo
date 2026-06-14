// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_ROOT_WEB */
/*eslint no-undef: "error"*/
// (!) FLAG: DEDALO_MEDIA_URL and DEDALO_CORE_URL are used in this file but are
//     not listed in the /*global*/ declaration above. ESLint will raise no-undef
//     errors for them. They should be added to the /*global*/ comment.
//     SHOW_DEBUG is declared but never referenced in this file.



// imports
	import {ui} from '../../common/js/ui.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	import {lazy_load_media} from '../../component_media_common/js/component_media_common.js'



/**
* VIEW_DEFAULT_EDIT_PDF
* Full edit-mode view for the PDF component.
*
* Responsibilities:
* - Build the edit wrapper (label + content area + buttons) for a PDF component
*   instance in 'default', 'line', or 'print' modes.
* - Render each PDF document entry as a lazy-loaded PDF.js iframe viewer,
*   or a fallback placeholder image that opens the upload tool when clicked.
* - Expose a numeric 'offset' input that lets editors record the difference
*   between the PDF's internal page numbering and the document's logical numbering
*   (stored in entry.lib_data.offset; propagated via self.change_handler).
* - Inject per-permission CSS into the embedded viewer so read-only users (permissions===1)
*   cannot interact with the PDF toolbar.
*
* Data contract (self.data):
* {
*   entries: Array<{
*     id            : number,               // database row id
*     files_info    : Array<{               // one entry per quality/extension variant
*       quality     : string,              // e.g. 'original', 'web', 'thumb'
*       extension   : string,              // e.g. 'pdf'
*       file_path   : string,              // server-relative path prepended with DEDALO_MEDIA_URL
*       file_exist  : boolean
*     }>,
*     lib_data      : { offset: number },  // viewer metadata; defaults to 1 when absent
*     original_file_name   : string,
*     original_upload_date : Object        // Dédalo date object {year,month,day,hour,minute,second,time}
*   }>,
*   external_source : *                    // present when content originates outside Dédalo (unused here)
* }
*
* Main exports: view_default_edit_pdf, get_content_data_edit.
*/
export const view_default_edit_pdf = function() {

	return true
}//end view_default_edit_pdf



/**
* RENDER
* Build and return the full edit-mode DOM tree for the PDF component.
*
* Supports two render levels:
* - 'content' (render_level==='content'): returns only the content_data node,
*   skipping wrapper and buttons. Used by view_viewer_pdf and partial refreshes.
* - 'full' (default): returns the complete wrapper including label, content,
*   and (when permissions > 1) the buttons toolbar.
*
* The label is suppressed in 'line' view to keep the row compact.
* Buttons are only rendered for editors (self.permissions > 1).
*
* Side effects: sets wrapper.content_data pointer to the content_data node
* for later direct access by callers (e.g. refresh cycles).
*
* @param {Object} self - component_pdf instance
* @param {Object} options - render options
* @param {string} [options.render_level='full'] - 'full' or 'content'
* @returns {Promise<HTMLElement>} wrapper (full) or content_data node (content level)
*/
view_default_edit_pdf.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper_options = {
			content_data	: content_data,
			buttons			: buttons,
			add_styles		: ['media_wrapper'] // common media classes
		}
		if (self.view==='line') {
			wrapper_options.label = null // prevent to create label node
		}
		const wrapper = ui.component.build_wrapper_edit(self, wrapper_options)
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA_EDIT
* Build the content_data container holding one content_value node per PDF entry.
*
* Exported so that view_viewer_pdf can reuse the same content area without
* duplicating its construction logic.
*
* When the component has no entries yet (newly created or empty), a single
* content_value is rendered with index 0 and value null. This guarantees the
* upload-trigger placeholder is always visible, even for empty records.
*
* Numeric indexes are set directly on the content_data node (content_data[i])
* as live pointers to each content_value child — callers can address them as
* an array-like without a querySelectorAll scan.
*
* @param {Object} self - component_pdf instance
* @returns {HTMLElement} content_data container with child content_value nodes
*/
export const get_content_data_edit = function(self) {

	// short vars
		const data		= self.data || {}
		const entries	= data.entries || []

	// content_data
		const content_data = ui.component.build_content_data(self)
		// common media classes
		content_data.classList.add('media_content_data')

	// values (documents)
		const inputs_value		= (entries.length<1) ? [null] : entries // force one empty element at least
		const entries_length	= inputs_value.length
		for (let i = 0; i < entries_length; i++) {
			// get the content_value
			const content_value = get_content_value(i, inputs_value[i], self)
			// add node to content_data
			content_data.appendChild(content_value)
			// set the pointer
			content_data[i] = content_value
		}


	return content_data
}//end get_content_data_edit



/**
* GET_CONTENT_VALUE
* Build the DOM subtree for a single PDF entry within the content_data container.
*
* Two rendering branches:
*
* 1. No PDF file available (pdf_url is null):
*    Renders page_globals.fallback_image as a clickable placeholder that opens
*    the tool_upload tool, allowing the user to upload a PDF file.
*
* 2. PDF file available:
*    Creates a viewer_container div with a 'loading' class, then defers the
*    full iframe initialisation until the container enters the viewport
*    (via when_in_viewport — avoids loading PDF.js for off-screen components).
*    The iframe loads the bundled PDF.js viewer at /lib/pdfjs/web/viewer.html.
*
*    Viewer initialisation sequence inside init_viewer():
*      a) iframe is created and appended.
*      b) 'load' event fires → injects Dédalo's custom CSS override into the
*         iframe document (read-only CSS when permissions===1, edit CSS otherwise).
*      c) 'webviewerloaded' event fires (dispatched by PDF.js on top.document when
*         its own app is ready) → configures PDFViewerApplicationOptions (locale,
*         defaultUrl cleared, enablePermissions) → calls PDFViewerApplication.open()
*         with the pdf_url including a cache-busting timestamp query string.
*
*    (!) The 'webviewerloaded' listener is registered on top.document, not on
*        iframe.contentDocument — PDF.js dispatches the event to the top frame.
*        The listener must be added BEFORE setting iframe.src to avoid a race
*        condition where the viewer loads faster than the listener is attached.
*
*    Also renders a numeric 'offset' input below the viewer. The offset value
*    records the logical page-number shift between the PDF's internal numbering and
*    the document's real numbering (e.g. front matter pages). Changes are propagated
*    immediately through self.change_handler (component_pdf.prototype.change_handler)
*    which writes to entry.lib_data.offset and triggers a save cycle.
*
* @param {number} i - zero-based index of this entry within data.entries
* @param {Object|null} current_value - entry object from data.entries, or null when empty
*   Shape when present:
*   {
*     id                   : number,
*     files_info           : Array<{quality:string, extension:string, file_path:string, file_exist:boolean}>,
*     lib_data             : { offset: number },
*     original_file_name   : string,
*     original_upload_date : Object
*   }
* @param {Object} self - component_pdf instance
* @returns {HTMLElement} content_value container node
*/
const get_content_value = function(i, current_value, self) {

	// short vars
		const quality		= self.quality || self.context.features.quality
		// (!) Offset guard: lib_data.offset!=='undefined' is a string comparison that
		//     always evaluates to true because typeof returns a string, not undefined itself.
		//     The intent is to check for a defined, non-null offset; the condition works as
		//     expected only because lib_data itself is also checked first. Do not "fix" this —
		//     document only.
		const offset_value	= current_value && current_value.lib_data && current_value.lib_data.offset!=='undefined' && current_value.lib_data.offset!==null
			? current_value.lib_data.offset
			: 1
		const data			= self.data || {}
		const entries		= data.entries || []
		// (!) files_info is always taken from entries[0], regardless of index i.
		//     For components that may hold more than one entry this means all content_value
		//     nodes share the same file list. Current usage only has a single entry per
		//     component, so this is not a bug in practice.
		const files_info	= entries[0]
			? (entries[0].files_info || [])
			: []
		const external_source	= data.external_source
		const extension			= self.context.features.extension

	// content_value node
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value media_content_value'
		})

	// pdf_url
		// Select the file_info entry that matches the configured quality and extension
		// and is confirmed to exist on disk (file_exist===true).
		const file_info	= files_info.find(el => el.quality===quality && el.file_exist===true && el.extension===extension)
		// Append a cache-busting timestamp so the browser always fetches the latest
		// version after an upload replaces the file at the same path.
		const pdf_url	= file_info
			? DEDALO_MEDIA_URL + file_info.file_path + '?t=' + (new Date()).getTime()
			: null
		// no PDF file url available case
		if (!pdf_url) {

			const url = page_globals.fallback_image // page_globals.fallback_image

			const image = ui.create_dom_element({
				element_type	: 'img',
				class_name		: '',
				src				: url,
				parent			: content_value
			})
			// open viewer
			image.addEventListener('mousedown', function (e) {
				e.stopPropagation();

				// get the upload tool to be fired
					const tool_upload = self.tools.find(el => el.model === 'tool_upload')

				// open_tool (tool_common)
					open_tool({
						tool_context	: tool_upload,
						caller			: self
					})
			})

			return content_value
		}

	// pdf viewer container with loading placeholder
		// The 'loading' class is removed once the iframe fires its 'load' event.
		const viewer_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'pdf_viewer_container loading',
			parent			: content_value
		})

	// lazy load: create iframe and setup viewer only when in viewport
		const init_viewer = () => {

			// iframe. PDF viewer (pdfjs) is loaded inside a iframe
				const iframe = ui.create_dom_element({
					element_type	: 'iframe',
					class_name		: 'pdf_viewer_frame',
					parent			: viewer_container
				})

			// iframe load event: inject custom CSS and remove loading state
			// The CSS link overrides PDF.js's own UI to match Dédalo's design
			// and to hide toolbar buttons that should not be available in read-only mode.
				iframe.addEventListener('load', function() {

					const doc = iframe.contentDocument
					if (doc) {
						const href_css = (self.permissions===1)
							? DEDALO_CORE_URL + '/component_pdf/css/pdfjs_default_read_only.css'
							: DEDALO_CORE_URL + '/component_pdf/css/pdfjs_default_edit.css'

						const css_link = document.createElement('link')
						css_link.href	= href_css
						css_link.rel	= 'stylesheet'
						css_link.type	= 'text/css'
						doc.head.appendChild(css_link)
					}

					viewer_container.classList.remove('loading')
				})

			// webviewerloaded event: configure pdfjs and open the PDF
			// PDF.js dispatches 'webviewerloaded' on the top-level document when its own
			// application object is fully constructed and ready to receive configuration.
				const fn_webviewerloaded = async function() {

					const locale_code = page_globals.locale || 'es-ES'

					// NOTE: Libraries are loaded via <script> tag, create shortcut to access PDF.js exports.
					// the pdf_js is not necessary load here, we will use only the viewer
					// self.pdf_js = iframe.contentWindow['pdfjs-dist/build/pdf'];

					if (!iframe.contentWindow) {
						console.warn('! Ignored not found iframe contentWindow:', 'fn_webviewerloaded');
						return
					}

					// options
					// PDFViewerApplicationOptions must be configured before open() is called.
					// 'defaultUrl' is cleared to prevent PDF.js from auto-loading its bundled
					// default document. 'enablePermissions' honours DRM flags embedded in the PDF.
						const pdf_viewer_options = await iframe.contentWindow['PDFViewerApplicationOptions'];
						if (pdf_viewer_options) {
							pdf_viewer_options.set('defaultUrl', '');
							pdf_viewer_options.set('locale', locale_code);
							pdf_viewer_options.set("enablePermissions", true); // allows PDF documents to disable copying in the viewer
						}

					// pdf_viewer
					// PDFViewerApplication is the PDF.js singleton; it is stored on self so
					// that component_pdf.prototype.go_to_page and get_data_tag can access it.
						self.pdf_viewer = await iframe.contentWindow['PDFViewerApplication'];
						if (!self.pdf_viewer) {
							return
						}

					// load the pdf in the viewer
						self.pdf_viewer.open({
							url : pdf_url
						})

					// listener cleanup
					// Remove the listener immediately after use to avoid a stale reference
					// if another PDF component is rendered later in the same page session.
						top.document.removeEventListener('webviewerloaded', fn_webviewerloaded, false)
				}//end fn_webviewerloaded

			// register webviewerloaded listener before setting src to prevent race conditions.
			// (!) Must be registered before iframe.src is assigned. If src is set first,
			//     fast connections may fire 'webviewerloaded' before this listener is active.
				top.document.addEventListener('webviewerloaded', fn_webviewerloaded, { once: true })

			// set iframe src to start loading the pdfjs viewer
				const viewer_url = DEDALO_ROOT_WEB + '/lib/pdfjs/web/viewer.html'
				iframe.src = viewer_url
		}//end init_viewer

	// observe viewport entry to lazy init the viewer (shared media helper, 200px preload)
		lazy_load_media(
			viewer_container,
			init_viewer
		)

	// fields. Bottom line with input offset options
	// The offset field maps logical page numbers to PDF internal page numbers.
	// For example, an offset of 3 means PDF page 1 corresponds to document page 3.
		const fields = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'fields',
			parent			: viewer_container
		})
		// offset label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'offset',
			text_node		: 'offset',
			parent			: fields
		})
		// offset_input field
		const offset_input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'number',
			class_name		: '',
			value			: offset_value,
			parent			: fields
		})
		// Persist the new offset value through the component change pipeline.
		// Only fires when the input is non-empty; prevents saving NaN on clear.
		// (!) Always writes to index 0 regardless of the entry index i, which
		//     mirrors the files_info access pattern above. Safe for single-entry
		//     components but would need to use i for multi-entry support.
		offset_input.addEventListener('change', function() {

			if (this.value.length>0) {

				self.change_handler({
					key		: 'offset',
					value	: parseInt(this.value),
					index	: 0
				})
			}
		})


	return content_value
}//end get_content_value



/**
* GET_BUTTONS
* Build the buttons toolbar for the edit-mode PDF component.
*
* Only called when self.permissions > 1 (editor or above). Assembles buttons
* conditionally based on self.show_interface flags:
* - show_interface.tools: adds the component's registered tool buttons (e.g. upload,
*   delete) via ui.add_tools into a DocumentFragment for batched DOM insertion.
* - show_interface.button_fullscreen: adds a fullscreen toggle button that calls
*   ui.enter_fullscreen on self.node (the component's root element).
*
* The buttons_fold wrapper inside buttons_container enables sticky positioning
* when the component is taller than the viewport, keeping the toolbar visible
* while the user scrolls through a long PDF.
*
* @param {Object} self - component_pdf instance
* @returns {HTMLElement} buttons_container holding all button elements
*/
const get_buttons = (self) => {

	// short vars
		const show_interface = self.show_interface

	// fragment
		const fragment = new DocumentFragment()

	// buttons tools
		if(show_interface.tools === true){
			ui.add_tools(self, fragment)
		}

	// button_fullscreen
		if(show_interface.button_fullscreen === true){

			const button_fullscreen = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button full_screen',
				title			: get_label.full_screen || 'Full screen',
				parent			: fragment
			})
			button_fullscreen.addEventListener('click', function(e) {
				e.stopPropagation()
				ui.enter_fullscreen(self.node)
			})
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})
		buttons_fold.appendChild(fragment)


	return buttons_container
}//end get_buttons



// @license-end
