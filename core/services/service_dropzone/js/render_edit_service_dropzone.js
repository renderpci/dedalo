// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, DEDALO_CORE_URL, Dropzone */
/*eslint no-undef: "error"*/
// (!) DEDALO_API_URL is used in render_template (dropzone init) but is NOT listed in the
//     /*global*/ declaration above. ESLint will flag this as an undeclared global. Do not add
//     it here — fix the /*global*/ declaration when the codebase-wide audit is performed.



/**
* MODULE: render_edit_service_dropzone
*
* Client-side edit renderer for service_dropzone.  Builds the full Dropzone-
* powered upload UI: an info panel (server limits, temp paths, session expiry),
* a file-preview grid, per-file and global progress bars, and a set of action
* buttons.  The Dropzone.js library is loaded on demand by service_dropzone.init
* before this module is ever called.
*
* Exported symbols
*   render_edit_service_dropzone  — constructor / prototype host for the `edit`
*                                   method that is mixed into service_dropzone.
*   get_content_data              — async; assembles the top-level content_data
*                                   container (info panel + upload template).
*   render_info_container         — sync; builds the server-info disclosure panel.
*
* The `self` argument accepted by every function is the service_dropzone instance
* (see service_dropzone.js).  Key properties consumed from `self`:
*   self.caller            — the tool/component that instantiated this service.
*   self.caller.files_data — {Array<{name,previewTemplate,previewElement,size}>}
*                            live registry of files known to the UI; mutated here.
*   self.active_dropzone   — cached Dropzone instance (re-used across re-renders).
*   self.allowed_extensions — {Array<string>} accepted MIME/extension list.
*   self.max_size_bytes    — {number} PHP upload_max_filesize in bytes.
*   self.key_dir           — {string} server-side sub-directory key for uploads.
*   self.file_processor    — {Array|null} optional list of per-file processing
*                            pipelines to offer in a <select>.
*   self.component_option  — {Array|null} optional list of target component ddos.
*   self.sys_get_temp_dir  — {string} PHP sys_get_temp_dir() path.
*   self.upload_tmp_dir    — {string} configured user upload temp directory.
*   self.upload_tmp_perms  — {string} octal permission string of upload_tmp_dir.
*   self.session_cache_expire     — {number} session expiry in minutes.
*   self.upload_service_chunk_files — {number|null} chunk size in MB (or null).
*/

// imports
	import {event_manager} from '../../../common/js/event_manager.js'
	import {ui} from '../../../common/js/ui.js'
	import {data_manager} from '../../../common/js/data_manager.js'
	import {create_source} from '../../../common/js/common.js'



/**
* RENDER_EDIT_SERVICE_DROPZONE
* Constructor function — prototype host for the `edit` method.
* The actual implementation is spread across the exported helper functions below;
* this constructor exists solely so that service_dropzone can inherit `edit` via
* prototype assignment (see service_dropzone.js → prototype assign block).
*/
export const render_edit_service_dropzone = function() {

	return true
}//end render_edit_service_dropzone



/**
* EDIT
* Entry point called by common.prototype.render when mode is 'edit'.
* Builds and returns the outer wrapper div (class 'service_dropzone') that holds
* the complete upload UI.  When render_level is 'content' only the inner
* content_data element is returned (useful for partial refreshes without
* rebuilding the wrapper).
*
* @param {Object} options
* @param {string} [options.render_level='full'] - 'full' returns the wrapper div;
*   'content' returns only the content_data element.
* @returns {Promise<HTMLElement>} wrapper div (render_level 'full') or
*   content_data div (render_level 'content').
*/
render_edit_service_dropzone.prototype.edit = async function (options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		// Build the inner UI tree (info panel + Dropzone template + events).
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper
		// Root element; callers query wrapper.content_data for partial re-renders.
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'service_dropzone'
		})
		wrapper.appendChild(content_data)
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Assembles the top-level content_data div containing:
*   1. An info toggle button + the collapsible info panel (hidden by default).
*   2. The async render_template result which includes the Dropzone widget,
*      file-preview grid, action buttons, and all Dropzone event bindings.
*
* This function is exported so that tool renderers (e.g. tool_import_files) can
* embed the upload UI inside their own template without going through the full
* render_edit_service_dropzone.prototype.edit lifecycle.
*
* @param {Object} self - The service_dropzone instance.
* @returns {Promise<HTMLElement>} The assembled content_data div.
*/
export const get_content_data = async function(self) {

	// content_data
		const content_data = document.createElement('div')
			  content_data.classList.add('content_data')

	// info: About caller, allowed extensions, max file size, upload directory, etc.
		// button_info — clicking this button toggles the disclosure panel visibility.
			const button_info = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button info',
				parent			: content_data
			})
			button_info.addEventListener('click', function(e){
				e.stopPropagation()
				info_node.classList.toggle('hide')
			})
		// info container
			// Starts hidden; the info button above toggles the 'hide' class.
			const info_node = render_info_container(self)
			info_node.classList.add('hide')
			content_data.appendChild(info_node)

	// template_node
		// render_template is async because it fetches the list of already-uploaded
		// files from the server and emits them into the Dropzone as existing files.
		const template_node = await render_template(self)
		content_data.appendChild(template_node)


	return content_data
}//end get_content_data



/**
* RENDER_INFO_CONTAINER
* Builds the collapsible diagnostic panel shown when the user clicks the info
* button.  The panel renders as a label/value grid via CSS and surfaces the
* server-side upload constraints that were fetched during service_dropzone.build:
*   - Caller component model name.
*   - Target media quality (from caller context.features, if present).
*   - Allowed file extensions.
*   - Maximum upload size in MB (highlighted with CSS 'warning' when < 100 MB).
*   - Chunk file size in MB (or JSON-serialised falsy value when chunking is off).
*   - PHP sys_get_temp_dir path.
*   - Configured upload_tmp_dir path.
*   - Upload temp directory octal permissions string.
*   - Session cache expiry expressed in Days (> 24 h) or Hours, with the raw
*     minute count shown in brackets for precision.
*
* @param {Object} self - The service_dropzone instance.
* @returns {HTMLElement} The info_container div (NOT yet appended to the DOM).
*/
export const render_info_container = function(self) {

	// info_container
		const info_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_container '
		})

	// caller component
		ui.create_dom_element({
			element_type	: 'label',
			inner_html		: 'Caller',
			parent			: info_container
		})
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: self.caller?.model || 'Unknown',
			parent			: info_container
		})

	// target quality
		// context.features may be absent when the caller is a plain tool rather than
		// a component with a context object that exposes features.
		const target_quality = self.caller.context.features
			? self.caller.context.features.target_quality || self.caller.context.features.default_target_quality
			: null
		if (target_quality) {
			ui.create_dom_element({
				element_type	: 'label',
				inner_html		: 'Target quality',
				parent			: info_container
			})
			ui.create_dom_element({
				element_type	: 'div',
				inner_html		: target_quality,
				parent			: info_container
			})
		}

	// allowed extensions
		ui.create_dom_element({
			element_type	: 'label',
			inner_html		: 'Allowed extensions',
			parent			: info_container
		})
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: self.allowed_extensions.join(", "),
			parent			: info_container
		})

	// max file size upload file size
		// Converts bytes to MB; adds CSS class 'warning' when < 100 MB to alert
		// administrators that the PHP upload limit may prevent large file uploads.
		const max_mb = Math.floor(self.max_size_bytes / (1024*1024))
		ui.create_dom_element({
			element_type	: 'label',
			inner_html		: 'Max file size',
			parent			: info_container
		})
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: (max_mb < 100) ? 'warning' : '',
			inner_html		: max_mb.toLocaleString() + ' MB',
			parent			: info_container
		})

	// DEDALO_UPLOAD_SERVICE_CHUNK_FILES
		// When chunking is enabled, self.upload_service_chunk_files is a positive
		// number (MB per chunk).  When disabled it is falsy (null/0/false) and is
		// rendered as the JSON representation so the state is unambiguous.
		ui.create_dom_element({
			element_type	: 'label',
			inner_html		: 'Chunk files size',
			parent			: info_container
		})
		const chunk_text = self.upload_service_chunk_files
			? self.upload_service_chunk_files + ' MB'
			: JSON.stringify(self.upload_service_chunk_files)
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: chunk_text,
			parent			: info_container
		})

	// sys_get_temp_dir
		ui.create_dom_element({
			element_type	: 'label',
			inner_html		: 'System temp dir',
			parent			: info_container
		})
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: self.sys_get_temp_dir,
			parent			: info_container
		})

	// upload_tmp_dir
		ui.create_dom_element({
			element_type	: 'label',
			inner_html		: 'User upload tmp dir',
			parent			: info_container
		})
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: self.upload_tmp_dir,
			parent			: info_container
		})

	// upload_tmp_perms
		ui.create_dom_element({
			element_type	: 'label',
			inner_html		: 'User upload tmp perms',
			parent			: info_container
		})
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: self.upload_tmp_perms,
			parent			: info_container
		})

	// session_cache_expire
		// self.session_cache_expire is in minutes.  Display in Days when the value
		// exceeds 24 h (i.e. > 24 * 60 = 1440 minutes), otherwise in Hours.
		// The raw minute count is always shown in brackets for exact reference.
		const session_cache_expire = (self.session_cache_expire / 60) > 24
			? (self.session_cache_expire / (60 * 24)).toLocaleString() + ' Days'
			: (self.session_cache_expire / 60).toLocaleString() + ' Hours'
		ui.create_dom_element({
			element_type	: 'label',
			inner_html		: 'Session cache expire',
			parent			: info_container
		})
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: session_cache_expire + ' [' + self.session_cache_expire.toLocaleString() + ' minutes]',
			parent			: info_container
		})


	return info_container
}//end render_info_container



/**
* RENDER_TEMPLATE
* Core builder for the Dropzone upload widget.  Constructs the complete DOM
* tree, initialises (or reuses) the Dropzone.js instance, registers all event
* listeners, and finally fetches the list of previously uploaded files from the
* server so they appear in the preview grid on first render.
*
* Structure of the returned DocumentFragment:
*   fragment
*   ├── #actions.row
*   │   ├── .buttons_container
*   │   │   ├── button.add         — triggers the Dropzone file picker
*   │   │   ├── button.start       — enqueues all ADDED-state files for upload
*   │   │   ├── button.cancel      — removes all files from the queue
*   │   │   ├── button.delete      — batch-deletes checked files
*   │   │   └── input[checkbox]    — master checkbox for bulk selection
*   │   └── .col-lg-5.column_right
*   │       └── .fileupload-process
*   │           └── .progress      — global upload progress bar
*   └── .table.table-striped       — previews container (Dropzone renders into here)
*       └── .file-row (template)   — per-file preview template extracted by Dropzone
*           ├── .preview_wrapp     — thumbnail span + img
*           ├── .details_wrapp     — name / error / size spans (Dropzone data-dz-* binds)
*           ├── .component.options — optional file-processor and target-component selects
*           ├── .row_progress_bar  — per-file progress bar
*           └── .row_buttons       — per-file start / cancel / delete / checkbox buttons
*
* Dropzone configuration notes:
*   - autoQueue: false — files are NOT uploaded immediately on drop; the user must
*     explicitly press Start (global or per-file) to enqueue them.
*   - clickable: button_add_files — only that element opens the file picker;
*     the rest of the dropzone area is drag-only.
*   - url: DEDALO_API_URL — the PHP JSON API endpoint; the same URL used by all
*     data_manager.request() calls.
*   - (!) DEDALO_API_URL is not in the global declaration header of this file; ESLint
*     will report a no-undef error. The variable is declared globally by the PHP
*     template. Add DEDALO_API_URL to the global header block to suppress the warning.
*   - self.active_dropzone is stored back on the instance so that subsequent
*     renders (e.g. after a refresh) reuse the same Dropzone rather than creating
*     a duplicate.
*
* Event handlers wired in this function:
*   addedfile       — configures per-file button states; updates self.caller.files_data;
*                     publishes 'drop_zone_addedfile'.
*   removedfile     — removes the entry from self.caller.files_data; issues a
*                     dd_utils_api::delete_uploaded_file API call if the file was
*                     already on the server (file.url truthy or status 'success').
*   totaluploadprogress — updates global_progress_bar width; compensates for files
*                     already in SUCCESS state (Dropzone does not include them in its
*                     totalBytes calculation).
*   sending         — reveals the global progress bar; displays total bytes to upload.
*   queuecomplete   — hides and resets the global progress bar.
*   success         — displays the server-generated thumbnail; publishes
*                     'drop_zone_success'; flips per-file button states.
*
* @param {Object} self - The service_dropzone instance.
* @returns {Promise<DocumentFragment>} Fragment ready to be appended to content_data.
*/
const render_template = async function(self) {

	const fragment = new DocumentFragment();

	// actions row
		const actions = ui.create_dom_element({
			element_type	: 'div',
			id				: 'actions',
			class_name		: 'row',
			parent			: fragment
		})

	// buttons_container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: actions
		})

		// button_add_files
			// This element is passed as `clickable` in the Dropzone config below, so
			// Dropzone attaches its own click handler.  The dz-clickable class keeps
			// CSS cursor hints in sync with Dropzone's internal class management.
			const button_add_files = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'success add dz-clickable',
				inner_html		: get_label.add_file || 'Add files',
				parent			: buttons_container
			})

		// button_start_upload
			// Global 'Start upload' button — enqueues ALL queued (ADDED-state) files.
			// Its onclick is attached later (after current_dropzone is defined).
			const button_submit_files = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'primary upload start',
				inner_html		: get_label.start_upload || 'Start upload',
				parent			: buttons_container
			})

		// button_cancel_upload
			// Global cancel — removes ALL files from the queue (passes true to also
			// abort any in-progress uploads).
			const button_cancel_upload = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'warning cancel',
				inner_html		: get_label.cancel_upload || 'Cancel upload',
				parent			: buttons_container
			})
			button_cancel_upload.addEventListener('click', function() {
				current_dropzone.removeAllFiles(true);
			});

		// button_delete
			// Global batch-delete button.  Its onclick iterates over checked
			// per-file checkboxes and programmatically clicks each row's delete
			// button so that the removedfile event fires per file (which triggers
			// the server-side delete API call).
			const button_delete = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'danger delete',
				inner_html		: get_label.delete_file || 'Delete file',
				dataset			: {dzRemove : ""},
				parent			: buttons_container
			})

		// delete_check_box
			// Master 'select all' checkbox.  When toggled it sets every individual
			// per-file .delete_checkbox to the same checked state.
			// (!) Uses document.querySelectorAll — affects ALL dropzone instances on
			//     the page if more than one is active simultaneously.
			const delete_check_box = ui.create_dom_element({
				element_type	: 'input',
				type			: 'checkbox',
				class_name		: 'all_delete_checkbox',
				parent			: buttons_container
			})
			delete_check_box.addEventListener('change', function(){
				const delete_check_nodes	= document.querySelectorAll('.delete_checkbox')
				const len					= delete_check_nodes.length
				for (let i = len - 1; i >= 0; i--) {
					delete_check_nodes[i].checked = delete_check_box.checked
				}
			})

	// column_right
		const column_right = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'col-lg-5 column_right',
			parent			: actions
		})
		// The global file processing state
			const fileupload_process = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'fileupload-process',
				parent			: column_right
			})
			// global_progress: shown (opacity 1) while any upload is in progress;
			// hidden (opacity 0) at rest and after queuecomplete fires.
				const global_progress = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'progress progress-striped active',
					parent			: fileupload_process
				})
				global_progress.style.opacity = "0";
			// global_progress_bar
				// Width is driven by the totaluploadprogress event handler below.
				const global_progress_bar = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'progress-bar progress-bar-success',
					dataset			: {dzUploadprogress : ''},
					parent			: global_progress
				})
				//initial state
				global_progress_bar.style.width = '0%';

			// total bytes
				// global_total_bytes     — set once per 'sending' event (total MB to upload).
				// global_total_bytes_sent — updated on every 'totaluploadprogress' tick (MB sent so far).
				const global_total_bytes = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'progress-global_total_bytes',
					value			: '',
					parent			: global_progress
				})
				const global_total_bytes_sent = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'progress-global_total_bytes_sent',
					value			: '',
					parent			: global_progress
				})

	// grid template used for rows
		// previews_container is passed as Dropzone's `previewsContainer` option.
		// Dropzone appends a rendered copy of previewTemplate here for each file.
		const previews_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'table table-striped',
			parent			: fragment
		})
		// template used for rows
			// This element's innerHTML is extracted below as previewTemplate and then
			// the element itself is removed from the DOM before Dropzone initialises.
			const template = ui.create_dom_element({
				id 				: 'template',
				element_type	: 'div',
				class_name		: 'file-row',
				parent			: previews_container
			})

		// preview_wrapp
			const preview_wrapp = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'preview_wrapp',
				parent			: template
			})
			// preview
				const preview = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'preview',
					parent			: preview_wrapp
				})
			// image
				// data-dz-thumbnail — Dropzone sets the src of this img to the file
				// thumbnail; on upload success, it is replaced by the server-generated URL.
				const preview_image = ui.create_dom_element({
					element_type	: 'img',
					dataset			: {dzThumbnail : ''},
					class_name		: '_preview_image',
					parent			: preview_wrapp
				})
				// preview_image.dataset.dzThumbnail = ''

		// details_wrapp
			const details_wrapp = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'details_wrapp',
				parent			: template
			})
			// name
				const name = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'name',
					dataset			: {dzName : ''},
					parent			: details_wrapp
				})
			// error
				const error = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'error text-danger',
					dataset			: {dzErrormessage : ''},
					parent			: details_wrapp
				})
			// size
				const size = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'size',
					dataset			: {dzSize : ''},
					parent			: details_wrapp
				})

		// options_fragment
			// Per-file options are built into a DocumentFragment so they can be
			// conditionally omitted and appended as a single DOM operation.
			const options_fragment = new DocumentFragment();

			// row_options_wrapper
				const row_options_wrapper = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'component options',
					parent 			: options_fragment
				})
				// filter processor options of the files, it could be defined in the preferences or could be the caller
				// ar_file_processor items have shape: {function_name, function_name_label, default?:boolean}.
				// The blank first option acts as a 'no processing' sentinel.
				const ar_file_processor = self.file_processor
				if(ar_file_processor) {
					// options process
						const select_process = ui.create_dom_element({
							element_type	: 'select',
							class_name		: 'file_processor_select',
							parent			: row_options_wrapper
						})
					// blank option
					const row_option_node = new Option('', null, true, false);
					select_process.appendChild(row_option_node)
					// values options
					for (let i = 0; i < ar_file_processor.length; i++) {
						const element			= ar_file_processor[i]
						const row_option_node	= new Option(element.function_name_label, element.function_name, element.default || false, false);
						select_process.appendChild(row_option_node)
					}
				}//end if(ar_file_processor)

			// component options to store the file, normally the component_portal, it could be defined in the preferences or could be the caller
				// ddo_option_components items have shape: {tipo, label, default?:boolean}.
				// The option value (option.tipo) is the ontology tipo of the target component;
				// it is sent along with the upload so the server knows which component to
				// store the file in.
				// (!) The ternary `(ddo_option_components) ? ddo_option_components : [...]`
				//     is dead — the outer `if(ddo_option_components)` already guards the block,
				//     so the fallback branch inside is never reached.
				const ddo_option_components	= self.component_option
				if(ddo_option_components){
					const option_components = (ddo_option_components)
						? ddo_option_components
						: [
							{
								tipo	: self.caller.tipo,
								label	: self.label,
								default	: true
							}
						]

					// row_select_options
						const row_select_options = ui.create_dom_element({
							element_type	: 'select',
							class_name		: 'option_component_select',
							parent			: row_options_wrapper
						})
						for (let i = 0; i < option_components.length; i++) {
							const option			= option_components[i]
							const row_option_node	= new Option(option.label, option.tipo, option.default || false, false);
							row_select_options.appendChild(row_option_node)
						}
				}
			// append full options_fragment
			template.appendChild(options_fragment)

		// row_progress_bar
			const row_progress_bar = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'row_progress_bar',
				parent			: template
			})
			// row_progress_bar
				const row_progress_bar_active = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'progress progress-striped active',
					parent			: row_progress_bar
				})
			// row_progress_bar_success
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'progress-bar progress-bar-success',
					dataset			: {dzUploadprogress : ''},
					parent			: row_progress_bar_active
				})

		// row_buttons
			const row_buttons = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'row_buttons',
				parent			: template
			})

			// row_button_submit_files
				const row_button_submit_files = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'primary start',
					inner_html		: get_label.submit || 'Start upload',
					parent			: row_buttons
				})

			// row_button_cancel_upload
				const row_button_cancel_upload = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'warning cancel',
					inner_html		: get_label.cancel_upload || 'Cancel upload',
					dataset			: {dzRemove : ""},
					parent			: row_buttons
				})

			// row_button_delete
				ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'danger delete row_button_delete hide',
					inner_html		: get_label.delete_file || 'Delete file',
					dataset			: {dzRemove : ""},
					parent			: row_buttons
				})

			// row_delete_check_box
				ui.create_dom_element({
					element_type	: 'input',
					type			: 'checkbox',
					class_name		: 'delete_checkbox row_delete_check_box hide',
					parent			: row_buttons
				})

	// Get the template HTML and remove it from the document
		// Dropzone expects an HTML string for previewTemplate, not a live DOM node.
		// We clear the id first to avoid duplicate IDs if the widget is re-rendered,
		// then extract the innerHTML of the parent, then remove the template node so
		// it does not appear as an empty row in the grid.
		const previewNode		= template;
		previewNode.id			= '';
		const previewTemplate	= previewNode.parentNode.innerHTML;
		previewNode.parentNode.removeChild(previewNode);

	// dropzone init
		// (!) DEDALO_API_URL is used here but is absent from the /*global*/ header.
		//     It is injected by the PHP page template.  Add it to /*global*/ to
		//     silence the ESLint no-undef warning.
		const api_url	= DEDALO_API_URL
		// Reuse an existing Dropzone instance if the service was already built once
		// (service_dropzone.build stores it in self.active_dropzone).  Creating a
		// second Dropzone on document.body would register duplicate event listeners.
		const current_dropzone = self.active_dropzone || new Dropzone(document.body, { // Make the whole body a dropzone
			url					: api_url,
			// thumbnailWidth	: 192,
			thumbnailHeight		: 96,
			thumbnailMethod		: 'contain',
			parallelUploads		: 20,
			previewTemplate		: previewTemplate,
			autoQueue			: false, // Make sure the files aren't queued until manually added
			previewsContainer	: previews_container, // Define the container to display the previews
			clickable			: button_add_files, // Define the element that should be used as click trigger to select files.
			addRemoveLinks		: false,
			acceptedFiles		: self.allowed_extensions.join(','),
			params				: {
				// key_dir is appended to every multipart upload POST so the server
				// can route the file to the correct temporary sub-directory.
				key_dir : self.key_dir
			},
			renameFile			: function (file) {
				// Collision-avoidance: if a file with the same name already exists in
				// files_data (uploaded during this session), append '(N)' before the
				// extension, where N is the current length of the files_data array.
				// Note: the count is not necessarily unique if files have been removed.
				const files		= self.caller.files_data;
				const { name }	= file; // equivalent to const name = file.name;

				if (files.some(el => el.name === name)) {

					const last_dot			= name.lastIndexOf('.');
					// const base_name		= name.slice((name.lastIndexOf('.') - 1 >>> 0) + 2);
					const file_name			= name.substring(0, last_dot);
					const file_extension	= name.substring(last_dot + 1);
					const renamed			= file_name + ' ('+ files.length +').' + file_extension;

					return renamed
				}

				return name;
			}
		});
		// Cache the instance so subsequent renders can reuse it.
		self.active_dropzone = current_dropzone

	// event addedfile
		// Fires for both newly dropped/selected files (file.url is falsy) and for
		// existing server files injected via displayExistingFile() (file.url is truthy).
		// Button visibility differs: new files show Start/Cancel; existing files show Delete.
		current_dropzone.on('addedfile', function(file) {

			const button_start				= file.previewElement.querySelector('.start')
			const button_cancel				= file.previewElement.querySelector('.cancel')
			const button_delete				= file.previewElement.querySelector('.delete')
			const button_delete_check_box	= file.previewElement.querySelector('.delete_checkbox')

			if(file.url){
				// File already on the server — hide upload controls, show delete.
				button_start.disabled	= true;
				button_cancel.disabled	= true;
				button_delete.disabled	= false;

				button_start.classList.add('hide')
				button_cancel.classList.add('hide')
				button_delete.classList.remove('hide')
				button_delete_check_box.classList.remove('hide')
			}else{
				// New local file — show upload controls, hide delete.
				button_start.disabled	= false;
				button_cancel.disabled	= false;
				button_delete.disabled	= true;

				button_start.classList.remove('hide')
				button_cancel.classList.remove('hide')
				button_delete.classList.add('hide')
				button_delete_check_box.classList.add('hide')
			}

			// check if the file comes from the server or from dropzone
			// file.upload.filename is set only for files with a Dropzone upload object
			// (i.e. files that have been through renameFile); fall back to file.name.
			const current_name = (file.upload && file.upload.filename) ? file.upload.filename : file.name

			// Hookup the start button
			// Per-file Start button: enqueues only this file rather than the whole queue.
			button_start.onclick = function() {
				current_dropzone.enqueueFile(file);
			};
			file.previewElement.querySelector(".name").innerHTML = current_name
			// Store the resolved file name as the checkbox value so the batch-delete
			// handler can identify which server file to delete.
			button_delete_check_box.value = current_name

			// Register the file in the caller's in-memory registry so callers (tools)
			// can iterate self.caller.files_data to act on uploaded files.
			self.caller.files_data.push({
				name			: current_name,
				previewTemplate	: file.previewTemplate,
				previewElement	: file.previewElement,
				size			: file.size
			})

			// Notify subscribers (e.g. tool_import_files) that a file was added.
			event_manager.publish('drop_zone_addedfile', {
				file			: file
			})
			// reset the global progress bar to 0
			global_progress_bar.style.width = '0%';

		});

	// event removedfile
		// Fires when Dropzone removes a file (via removeFile / removeAllFiles or
		// when the user clicks a dz-remove element).
		// Two actions happen unconditionally: the entry is spliced from files_data.
		// A server-side delete API call is issued only when the file was already on
		// the server (file.url is truthy) or the upload completed (status 'success').
		current_dropzone.on('removedfile', async function(file) {

			const current_name = (file.upload && file.upload.filename) ? file.upload.filename : file.name;

			// Reverse-iterate to safely splice while looping.
			const data_length = self.caller.files_data.length
			for (let i = data_length - 1; i >= 0; i--) {
				const current_data = self.caller.files_data[i]
				if(current_data.name === current_name){
					self.caller.files_data.splice(i,1);
				}
			}

			if(file.url || file.status==='success'){

				// source
					const source = create_source(self)

				// rqo
					// dd_utils_api::delete_uploaded_file removes the file from the
					// server-side upload temp directory identified by key_dir.
					const rqo = {
						dd_api	: 'dd_utils_api',
						action	: 'delete_uploaded_file',
						source	: source,
						options	: {
							key_dir		: self.key_dir,
							file_name	: current_name
						}
					}

				// call to the API, fetch data and get response
					const response = await data_manager.request({
						body : rqo
					})
			}
		});


	// event totaluploadprogress. Update the total progress bar
		// Dropzone's built-in totaluploadprogress calculation excludes already-finished
		// (SUCCESS) files from totalBytes, so the bar would jump backwards when a
		// new upload batch starts after earlier files completed.  We compensate by
		// manually adding finished file sizes to both totals and recalculating progress.
		current_dropzone.on('totaluploadprogress', function(progress, totalBytes, totalBytesSend) {
			const finished_files = current_dropzone.getFilesWithStatus(Dropzone.SUCCESS);

			finished_files.forEach(file => {
				totalBytes		+= file.size;
				totalBytesSend	+= file.size;
				progress = totalBytesSend / totalBytes * 100.0;
			});

			global_progress_bar.style.width = progress + '%';
			global_total_bytes_sent.textContent = Math.floor(totalBytesSend / 1024 / 1024 );
		});

	// event sending
		current_dropzone.on('sending', function(file) {
			// Show the total progress bar when upload starts
			// document.querySelector('#total-progress').style.opacity = '1';
			global_progress.style.opacity = '1';
			// And disable the start button
			file.previewElement.querySelector('.start').setAttribute('disabled', 'disabled');

			let total = 0
			self.caller.files_data.forEach(file => {
				total += file.size
			});
			const total_bytes = Math.floor(total / 1024 / 1024 );
			global_total_bytes.textContent = total_bytes + 'MB'
		});

	// event queuecomplete. Hide the total progress bar when nothing's uploading anymore
		current_dropzone.on('queuecomplete', function(progress) {
			// document.querySelector("#total-progress").style.opacity = "0";
			global_progress.style.opacity = '0';
			global_progress_bar.style.width = '0%';
		});

	// Setup the buttons for all transfers
	// The 'add files' button doesn't need to be setup because the config
	// `clickable` has already been specified.
	// document.querySelector('#actions .start').onclick = function() {

	// button_submit_files
		// button_submit_files.onclick = function() {
		// 	current_dropzone.enqueueFiles(current_dropzone.getFilesWithStatus(Dropzone.ADDED))
		// }

	// button_submit_files
		// document.querySelector('#actions .cancel').onclick = function() {
		// Global Start button behaviour:
		//   1. Enqueue all ADDED-state files (i.e. files the user selected but has not
		//      yet started uploading).
		//   2. Cancel any currently UPLOADING files and reset their status to ADDED so
		//      they will be re-uploaded in the next batch (this effectively implements
		//      a 'restart' for in-progress uploads when the button is pressed again).
		button_submit_files.onclick = function() {

			current_dropzone.enqueueFiles(current_dropzone.getFilesWithStatus(Dropzone.ADDED))

			// current_dropzone.removeAllFiles(true);
			const files = current_dropzone.getFilesWithStatus(Dropzone.UPLOADING)
			for (let i = files.length - 1; i >= 0; i--) {
				const current_file = files[i]
				current_dropzone.cancelUpload(current_file)
				current_file.status = Dropzone.ADDED
			}
		}

	// button_delete
		// Global batch-delete handler.
		// (!) Uses document.querySelectorAll('.delete_checkbox') — scoped to the
		//     entire document, not just this Dropzone instance.  If multiple
		//     service_dropzone widgets are active simultaneously, this handler will
		//     affect checked checkboxes in ALL of them.
		button_delete.onclick= async function() {

			const delete_checkbox_nodes	= document.querySelectorAll('.delete_checkbox')
			const len					= delete_checkbox_nodes.length
			for (let i = len - 1; i >= 0; i--) {
				if(delete_checkbox_nodes[i].checked){
					// Trigger the row-level delete button so the Dropzone 'removedfile'
					// event fires for each file, which cascades to the server-side delete.
					const row_delete_node	= delete_checkbox_nodes[i].parentNode.querySelector('button.delete')
					if(row_delete_node){
						row_delete_node.click()
					}
				}
			}
		}

	// event success
		// Fires after the server returns a 2xx response.
		// api_response is the parsed JSON body returned by dd_utils_api.
		// Expected shape: { msg: string, file_data: { thumbnail_url: string } }.
		current_dropzone.on('success', function(file, api_response) {

			// Replace the client-side thumbnail with the server-generated one so the
			// preview reflects the actual stored representation (e.g. a TIFF→JPEG proxy).
			//showing an image created by the server after upload
			this.emit('thumbnail', file, api_response.file_data.thumbnail_url);

			// Handle the api_responseText here. For example, add the text to the preview element:
			file.previewTemplate.appendChild(
				document.createTextNode(api_response.msg)
			);

			const button_start	= file.previewElement.querySelector('.start')
			const button_cancel	= file.previewElement.querySelector('.cancel')
			const button_delete	= file.previewElement.querySelector('.delete')
			const button_delete_check_box = file.previewElement.querySelector('.delete_checkbox')

			// Upload done — disable Start/Cancel, enable Delete (same state as existing files).
			button_start.disabled = true;
			button_cancel.disabled = true;
			button_delete.disabled = false;

			button_start.classList.add('hide')
			button_cancel.classList.add('hide')
			button_delete.classList.remove('hide')
			button_delete_check_box.classList.remove('hide')

			// Hide the per-file progress bar now that the upload is complete.
			const row_progress_bar = file.previewElement.querySelector('.progress')
			row_progress_bar.style.opacity = '0';

			// Notify subscribers (e.g. tool_import_files) that a file was successfully
			// uploaded.  Subscribers receive both the Dropzone file object and the raw
			// API response so they can act on the stored file immediately.
			event_manager.publish('drop_zone_success', {
				file			: file,
				api_response	: api_response
			})
		});

	// get the images in the server (uploaded previously), and display into the dropzone
		// This is the async part that makes render_template an async function.
		// It fetches all files already in the server-side upload temp dir for key_dir
		// and injects them into the Dropzone preview grid as existing (non-uploadable)
		// entries.  Each injected file triggers 'addedfile' with file.url set, which
		// is how the handler above knows to show Delete rather than Start/Cancel.

		// source. Note that second argument is the name of the function to manage the API request like 'delete'
			// this generates a call as my_tool_name::my_function_name(options)
			const source = create_source(self, 'list_uploaded_files')

		// rqo
			// prevent_lock: true — this is a read-only list request; do not acquire
			// any write lock on the calling record.
			const rqo = {
				dd_api			: 'dd_utils_api',
				action			: 'list_uploaded_files',
				source			: source,
				prevent_lock	: true,
				options			: {
					key_dir : self.key_dir
				}
			}

		// call to the API, fetch data and get response
			const response = await data_manager.request({
				body : rqo
			})
			// response.result is an Array of file descriptor objects with at minimum
			// { name, url, size } — the same shape as a Dropzone mock file object.
			const files = response.result

		// Access to the original image sizes on your server,
		// to resize them in the browser:
		const files_length = files.length

		const callback			= null; // Optional callback when it's done
		const crossOrigin		= null; // Added to the `img` tag for crossOrigin handling
		const resizeThumbnail	= false; // Tells Dropzone whether it should resize the image first
		// resizeThumbnail=false: we pass the server-provided URL directly; Dropzone
		// should not re-download and resize it locally.

		for (let i = 0; i < files_length; i++) {
			const current_file = files[i]
			current_dropzone.displayExistingFile(current_file, current_file.url, callback, crossOrigin, resizeThumbnail);
		}


	return fragment
}//end render_template



// @license-end
