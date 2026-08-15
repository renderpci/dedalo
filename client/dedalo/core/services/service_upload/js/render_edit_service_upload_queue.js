// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, console, document, URL, Option */
/*eslint no-undef: "error"*/



/**
* MODULE: render_edit_service_upload_queue
*
* The MULTI-FILE upload renderer. It is the view half of the pair whose model
* half is `upload_queue.js`: the queue owns every byte, every status and every
* transfer; this module owns every node, every listener and every object URL.
* Nothing here decides what happens to a file, and nothing in the queue knows
* that a DOM exists.
*
* It replaces `render_edit_service_dropzone.js` — Dropzone.js plus ~1200 lines of
* glue — and the DOM it emits is a HARD CONTRACT, not an implementation detail:
* `tools/tool_import_files/css/tool_import_files.css` and
* `tools/tool_import_marc21/css/tool_import_marc21.css` select into
* `.file-row`, `.preview_wrapp`, `.details_wrapp > .name|.error|.size` and
* `.component` FROM OUTSIDE this file, and `render_tool_import_files.js` /
* `render_tool_import_marc21.js` / `render_tool_import_zotero.js` read
* `entry.previewElement.querySelector('.file_processor_select' |
* '.option_component_select').value`. Every class name below is therefore load
* bearing. What was NOT reproduced:
*
*   - every `data-dz-*` dataset. That was Dropzone's binding mechanism (it wrote
*     into `[data-dz-name]` etc. by query); nothing styles them and nothing else
*     reads them. Rows are painted by direct node pointers instead.
*   - the `#actions` and `#template` IDs. An id is PAGE-GLOBAL: two upload
*     widgets on one page produced two `#actions`, and `document.querySelector`
*     picked whichever came first. They are classes now (`.row.actions`).
* ONE TEXT-SETTING DISCIPLINE (uniform since 2026-08-03)
* NOTHING derived from data — a file name, an error, a server path, a caller
* model, a size, a temp dir — is ever set through `inner_html`. Row text uses
* `textContent` directly and every `ui.create_dom_element` in
* `render_info_container` uses `text_content`, including its literal `<label>`s:
* the rule is easier to hold (and to gate) as "no inner_html in this module
* except…" than as a per-site judgement about which value happens to be
* server-derived today.
* THE EXCEPTION, stated: the seven `inner_html: get_label[key] || 'literal'` button
* labels. A UI label is program text from the repo-owned catalog, is rendered
* through `inner_html` by every other Dédalo widget, and may legitimately carry
* an entity (`&amp;`) that `textContent` would print raw. They take no user input
* and no record data.
*
*   - the innerHTML template-extraction trick (build a row, serialise it to an
*     HTML string, hand the string to Dropzone, delete the node). Rows are built
*     with `ui.create_dom_element` per entry, so a filename never round-trips
*     through `innerHTML`.
*   - `renameFile`. Collision-free naming moved INTO the queue
*     (`upload_queue.unique_name`), where it can see staged entries too.
*   - `dz-clickable`, `displayExistingFile`, `enqueueFile`, `getFilesWithStatus`,
*     the `totaluploadprogress` hand-compensation and the `Dropzone.SUCCESS`
*     bookkeeping. All of it was library-shaped; the queue's status machine and
*     `get_progress()` cover the same ground without the library.
*
* WHAT THE DOM LOOKS LIKE
*   div.content_data
*   ├── span.button.info
*   ├── div.info_container.hide
*   ├── div.row.actions
*   │   ├── div.buttons_container
*   │   │   ├── button.success.add   (+ a hidden multiple file input it drives)
*   │   │   ├── button.primary.upload.start
*   │   │   ├── button.warning.cancel
*   │   │   ├── button.danger.delete
*   │   │   └── input[checkbox].all_delete_checkbox
*   │   └── div.col-lg-5.column_right > span.fileupload-process > div.progress…
*   └── div.table.table-striped
*       └── div.file-row  × N
*
* (!) LIVE since 2026-08-03: `tool_import_files`, `tool_import_marc21` and
* `tool_import_zotero` all select `service_upload` with `multiple:true`, and
* `service_dropzone` — the module this replaces — has been deleted. Its gate is
* `test/unit/client_upload_queue_render.test.ts`, which drives it against a DOM
* stub; the browser suite exercises the tools that mount it.
*
* Main exports:
* - `get_content_data_queue(self)` — async; the whole widget, ready to append.
* - `render_info_container(self)`  — the collapsible server-limits panel.
*/

// imports
	import {event_manager} from '../../../common/js/event_manager.js'
	import {ui} from '../../../common/js/ui.js'
	import {data_manager} from '../../../common/js/data_manager.js'
	import {create_source} from '../../../common/js/common.js'
	import {upload_queue} from './upload_queue.js'
	import {files_from_drop} from './dropped_files.js'
	import {response_data} from '../../../common/js/api_error.js'



// constants

	/**
	* RASTERISABLE_EXTENSIONS
	* The formats a browser `<img>` can actually decode.
	*
	* (!) An `<img>` pointed at a TIFF, a MARC record, a zip or an mp4 does not
	* fail visibly — it renders an empty box, or the broken-image glyph, which
	* looked in the old UI exactly like "the upload lost my file". Anything not in
	* this set gets NO `src` at all and falls through to the CSS fallback
	* background (`service_upload.less`, `.preview_wrapp img`), which is a
	* deliberate placeholder rather than an accident.
	*/
	const RASTERISABLE_EXTENSIONS = new Set([
		'jpg', 'jpeg', 'jpe', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg', 'ico'
	])

	/**
	* MAX_PARALLEL_THUMBNAILS
	* How many local previews may be decoding at once.
	*
	* (!) Dropzone queued thumbnail generation for a reason
	* (`dropzone.js` `_processThumbnailQueue`): 500 simultaneous decodes kill the
	* tab. We are far cheaper — `URL.createObjectURL` + CSS `object-fit`, no
	* `FileReader`, no canvas — but a 900-scan drop still asks the compositor for
	* 900 full-resolution decodes at once if nothing bounds it.
	*/
	const MAX_PARALLEL_THUMBNAILS = 4

	/**
	* CONTROL_STATES
	* The per-row control matrix, one row per queue status. Keeping it as DATA
	* (rather than the dropzone renderer's five separate imperative blocks, which
	* drifted out of agreement with each other) is what makes it reviewable.
	*
	* 'enabled'  → visible, clickable.
	* 'disabled' → visible, greyed.
	* 'hidden'   → `hide` class.
	*/
	const CONTROL_STATES = {
		pending		: { start:'enabled',  cancel:'enabled', delete:'hidden',  check:'hidden', progress:false },
		uploading	: { start:'disabled', cancel:'enabled', delete:'hidden',  check:'hidden', progress:true },
		done		: { start:'hidden',   cancel:'hidden',  delete:'enabled', check:'shown',  progress:false },
		staged		: { start:'hidden',   cancel:'hidden',  delete:'enabled', check:'shown',  progress:false },
		// error/canceled show START as the RETRY affordance: the file is still in
		// the browser, and making the user re-pick it after one flaky chunk is the
		// single most expensive thing this UI can do to a curator.
		error		: { start:'enabled',  cancel:'hidden',  delete:'enabled', check:'hidden', progress:false },
		canceled	: { start:'enabled',  cancel:'hidden',  delete:'enabled', check:'hidden', progress:false },
		// invalid never reached the network; there is nothing to retry and nothing
		// staged to delete remotely — delete here only drops the row.
		invalid		: { start:'hidden',   cancel:'hidden',  delete:'enabled', check:'hidden', progress:false }
	}



/**
* EXTENSION_OF
* Lowercase extension of a name, or ''.
* Deliberately NOT the PHP-era alpha-only grammar, which silently lost `.mp4`.
*
* @param {string} name
* @returns {string}
*/
const extension_of = function(name) {

	const safe_name	= typeof name === 'string' ? name : ''
	const last_dot	= safe_name.lastIndexOf('.')
	if (last_dot < 1) {
		return ''
	}

	return safe_name.slice(last_dot + 1).toLowerCase()
}//end extension_of



/**
* FORMAT_SIZE
* Human-readable byte count for the row's `.size` span.
*
* @param {number} bytes
* @returns {string}
*/
const format_size = function(bytes) {

	const value = bytes || 0
	if (value >= 1024 * 1024) {
		return (value / (1024 * 1024)).toFixed(2) + ' MB'
	}
	if (value >= 1024) {
		return Math.round(value / 1024) + ' KB'
	}

	return value + ' bytes'
}//end format_size



/**
* ERROR_TEXT
* Resolves an entry's failure into display text.
*
* (!) The queue is DOM-free and has no `get_label`, so it stores the label KEY in
* `entry.error_code` and stores `code + detail` in `entry.error`. Resolving here
* means the raw key (`filesize_is_too_big`) never reaches the user, which is what
* the row showed while the queue owned no renderer. Only the EXISTING label keys
* are used — a new key needs `src/core/labels/master.json` and the labels
* tripwire refuses one that is not there.
*
* @param {Object} entry
* @returns {string}
*/
const error_text = function(entry) {

	if (!entry.error) {
		return ''
	}
	if (!entry.error_code) {
		return entry.error
	}

	const label		= get_label[entry.error_code] || entry.error_code
	// `entry.error` is literally `code + detail`; strip the key half rather than
	// printing it twice.
	const detail	= entry.error.indexOf(entry.error_code) === 0
		? entry.error.slice(entry.error_code.length)
		: entry.error

	return label + detail
}//end error_text



/**
* CREATE_THUMBNAIL_SCHEDULER
* A tiny FIFO that keeps at most `max_parallel` image decodes in flight.
* Each job is called with a `done` callback and MUST call it exactly once.
*
* @param {number} max_parallel
* @returns {Object} `{push(job), stop()}`.
*/
const create_thumbnail_scheduler = function(max_parallel) {

	const state = {
		jobs	: [],
		active	: 0,
		max		: max_parallel || 1,
		stopped	: false
	}

	const run_next = function() {

		if (state.stopped) {
			return
		}
		while (state.active < state.max && state.jobs.length > 0) {
			const job = state.jobs.shift()
			state.active++
			let settled = false
			job(function(){
				// Guard a double `done`: an <img> that fires both error and load
				// (some engines do, on a revoked URL) would otherwise decrement the
				// counter twice and let the window grow without bound.
				if (settled) {
					return
				}
				settled = true
				state.active--
				run_next()
			})
		}
	}

	return {
		push : function(job) {
			state.jobs.push(job)
			run_next()
		},
		stop : function() {
			state.stopped	= true
			state.jobs		= []
		}
	}
}//end create_thumbnail_scheduler



/**
* TRACK_LISTENER
* Registers a DOM listener AND remembers it, so `destroy()` can remove every one
* of them without guessing.
*
* (!) THIS IS THE FIX FOR THE DROPZONE LEAK. Dropzone attached its drag handlers
* to `document.body`, which is why `service_dropzone.js` needed a bespoke
* `destroy()` (its own comment: "each new service caller stacks another
* body-level Dropzone with all its listeners"). Here every listener is either on
* a node this render OWNS (and dies with it) or is explicitly recorded and
* removed. Nothing is left behind on `document` or `body`.
*
* @param {Object} self - The service_upload instance (holds `dom_listeners`).
* @param {EventTarget} node
* @param {string} type
* @param {Function} handler
* @param {Object|boolean} [options]
* @returns {void}
*/
const track_listener = function(self, node, type, handler, options) {

	node.addEventListener(type, handler, options)
	self.dom_listeners.push({
		node	: node,
		type	: type,
		handler	: handler,
		options	: options
	})
}//end track_listener



/**
* RELEASE_OBJECT_URL
* Revokes and forgets the local preview URL of one entry, when there is one.
*
* (!) Dropzone LEAKED these: it created a blob URL per file and never revoked it,
* so a session that queued and cleared 300 scans held 300 decoded blobs until the
* tab closed. Revocation happens on all three paths that can end a preview's
* life: row removal, replacement by the server thumbnail, and destroy.
*
* @param {Object} self
* @param {string} entry_id
* @returns {void}
*/
const release_object_url = function(self, entry_id) {

	const url = self.object_urls ? self.object_urls.get(entry_id) : null
	if (!url) {
		return
	}
	try {
		URL.revokeObjectURL(url)
	} catch (error) {
		console.error('render_edit_service_upload_queue could not revoke an object URL:', error)
	}
	self.object_urls.delete(entry_id)
}//end release_object_url



/**
* TEARDOWN_PREVIOUS_RENDER
* Releases everything a PREVIOUS render of this instance still owns.
*
* (!) DEFENSIVE, NOT AN ASSUMPTION. `get_content_data_queue` used to reallocate
* `row_map` / `object_urls` / `dom_listeners` on the strength of a comment saying
* destroy() had already run. When it has not — a caller that re-renders in place,
* a destroy that threw halfway — dropping those references orphans exactly the
* two `document`-level drag guards, which are the only listeners here that do not
* die with the widget's own node: they stack, invisibly and unrecoverably, one
* pair per render. The object URLs leak with them (a blob per queued scan).
* Running the teardown first makes a re-render idempotent and costs nothing when
* there is nothing to release.
*
* @param {Object} self - The service_upload instance.
* @returns {void}
*/
const teardown_previous_render = function(self) {

	// listeners. Removing what we tracked is the ONLY way back: an anonymous
	// handler on `document` cannot be found again once its reference is gone.
		if (Array.isArray(self.dom_listeners)) {
			for (let i = self.dom_listeners.length - 1; i >= 0; i--) {
				const tracked = self.dom_listeners[i]
				try {
					tracked.node.removeEventListener(tracked.type, tracked.handler, tracked.options)
				} catch (error) {
					console.error('render_edit_service_upload_queue could not remove a listener:', error)
				}
			}
		}
		self.dom_listeners = []

	// object urls + the previous render's own teardown (thumbnail scheduler).
		if (typeof self.queue_teardown === 'function') {
			try {
				self.queue_teardown()
			} catch (error) {
				console.error('render_edit_service_upload_queue teardown failed:', error)
			}
		}
		self.queue_teardown = null

		if (self.object_urls) {
			const ids = Array.from(self.object_urls.keys())
			for (let i = 0; i < ids.length; i++) {
				release_object_url(self, ids[i])
			}
		}
		self.object_urls	= new Map()
		self.row_map		= new Map()

	// (!) THE QUEUE IS NOT TOUCHED HERE. Its lifecycle belongs to
	// `service_upload.prototype.destroy` (which aborts the transfers AND is the
	// only place that knows whether the caller's `files_data` may be emptied).
	// Tearing it down from a render would abort an upload that a re-render of the
	// panel around it has no business cancelling.
}//end teardown_previous_render



/**
* GET_CONTENT_DATA_QUEUE
* Builds the whole multi-file widget and wires it to a fresh `upload_queue`.
*
* Async because it awaits `dd_utils_api::list_uploaded_files`: files staged
* before a reload must reappear, or the curator re-uploads a box of scans that is
* already on disk.
*
* Side effects on `self`: `queue`, `row_map`, `object_urls`, `dom_listeners`,
* `queue_teardown` (all consumed by `service_upload.prototype.destroy`).
*
* @param {Object} self - The service_upload instance.
* @returns {Promise<HTMLElement>} The assembled `div.content_data`.
*/
export const get_content_data_queue = async function(self) {

	// (!) TEARDOWN FIRST, unconditionally. A render must not ASSUME destroy() ran
	// — see teardown_previous_render. This is what makes a re-render idempotent
	// instead of stacking a second pair of `document`-level drag listeners that
	// nothing can ever reach again.
		teardown_previous_render(self)

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data'
		})

	// instance-scoped render state. Allocated by the teardown above; the local
	// scheduler is the one piece that is per-render by construction.
		const thumbnails = create_thumbnail_scheduler(MAX_PARALLEL_THUMBNAILS)

	// info button + panel
		const button_info = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button info',
			parent			: content_data
		})
		const info_node = render_info_container(self)
		info_node.classList.add('hide')
		content_data.appendChild(info_node)
		track_listener(self, button_info, 'click', function(e){
			e.stopPropagation()
			info_node.classList.toggle('hide')
		})

	// actions row.
		// (!) `.row.actions`, NOT `id="actions"`. See the module header: an id made
		// every handler that reached for it hit the FIRST widget on the page.
		const actions = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'row actions',
			parent			: content_data
		})

	// buttons_container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: actions
		})

	// input_file.
		// Dropzone owned a hidden <input type=file multiple> of its own (its
		// `clickable` option built one outside our DOM). We need the same
		// affordance, so the input is ours and lives beside the button that drives
		// it. It is display:none rather than absolutely positioned because it is
		// not inside a <form> and has no layout to preserve.
		const input_file = ui.create_dom_element({
			element_type	: 'input',
			type			: 'file',
			class_name		: 'queue_file_input',
			parent			: buttons_container
		})
		input_file.multiple	= true
		input_file.style.display = 'none'
		if (Array.isArray(self.allowed_extensions) && self.allowed_extensions.length > 0) {
			input_file.accept = self.allowed_extensions.map(function(extension){
				return '.' + extension
			}).join(', ')
		}

	// button_add_files
		const button_add_files = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'success add',
			inner_html		: get_label.add_file || 'Add files',
			parent			: buttons_container
		})
		track_listener(self, button_add_files, 'click', function(e){
			e.preventDefault()
			input_file.click()
		})
		track_listener(self, input_file, 'change', function(){
			const files = input_file.files
			for (let i = 0; i < files.length; i++) {
				add_local_file(self, files[i], thumbnails)
			}
			// Reset the input, or picking the SAME file twice fires no `change`
			// event at all and the second attempt looks like a dead button.
			input_file.value = ''
		})

	// button_submit_files
		const button_submit_files = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary upload start',
			inner_html		: get_label.start_upload || 'Start upload',
			parent			: buttons_container
		})
		track_listener(self, button_submit_files, 'click', function(e){
			e.preventDefault()
			self.queue.start()
		})

	// button_cancel_upload.
		// (!) CANCEL, not "remove everything". The dropzone version called
		// `removeAllFiles(true)`, which deleted the rows as well — a user who
		// cancelled a transfer lost the whole queue and had to re-pick every file.
		// `queue.cancel()` aborts what is in flight and withdraws the pending
		// intent; the rows stay, in `canceled`, one click from a retry.
		const button_cancel_upload = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'warning cancel',
			inner_html		: get_label.cancel_upload || 'Cancel upload',
			parent			: buttons_container
		})
		track_listener(self, button_cancel_upload, 'click', function(e){
			e.preventDefault()
			self.queue.cancel()
		})

	// button_delete (batch)
		const button_delete = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'danger delete',
			inner_html		: get_label.delete_file || 'Delete file',
			parent			: buttons_container
		})

	// delete_check_box (master)
		const delete_check_box = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox',
			class_name		: 'all_delete_checkbox',
			parent			: buttons_container
		})

	// column_right
		const column_right = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'col-lg-5 column_right',
			parent			: actions
		})
		const fileupload_process = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'fileupload-process',
			parent			: column_right
		})
		// global_progress: opacity 1 only while something is actually moving.
		const global_progress = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'progress progress-striped active',
			parent			: fileupload_process
		})
		global_progress.style.opacity = '0'
		const global_progress_bar = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'progress-bar progress-bar-success',
			parent			: global_progress
		})
		global_progress_bar.style.width = '0%'
		const global_total_bytes = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'progress-global_total_bytes',
			parent			: global_progress
		})
		const global_total_bytes_sent = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'progress-global_total_bytes_sent',
			parent			: global_progress
		})

	// previews_container
		const previews_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'table table-striped',
			parent			: content_data
		})

	// batch controls.
		// (!) SCOPED TO `previews_container`, never `document`. The dropzone
		// renderer used `document.querySelectorAll('.delete_checkbox')` in BOTH the
		// master checkbox (line 460) and the batch delete (line 1011), so a page
		// with two upload widgets ticked and deleted rows in the other one. The
		// container is captured in this closure, which is also strictly safer than
		// `self.node`: `self.node` is null when a tool embeds this content_data
		// directly instead of going through `edit()`.
		track_listener(self, delete_check_box, 'change', function(){
			const nodes = previews_container.querySelectorAll('.delete_checkbox')
			for (let i = nodes.length - 1; i >= 0; i--) {
				nodes[i].checked = delete_check_box.checked
			}
		})
		track_listener(self, button_delete, 'click', async function(e){
			e.preventDefault()
			const nodes = previews_container.querySelectorAll('.delete_checkbox')
			// Collect the ids FIRST: `queue.remove` deletes rows (and therefore the
			// checkboxes) while we iterate the live NodeList.
			const ids = []
			for (let i = 0; i < nodes.length; i++) {
				if (nodes[i].checked && nodes[i].dataset.entry_id) {
					ids.push(nodes[i].dataset.entry_id)
				}
			}
			delete_check_box.checked = false
			for (let i = 0; i < ids.length; i++) {
				// Direct call, not the dropzone's synthetic `.click()` cascade on a
				// row button — a cascade that depended on the row's delete button
				// being present, enabled and not `hide`.
				await self.queue.remove(ids[i], {delete_remote:true})
			}
		})

	// queue.
		// entries: the CALLER'S OWN ARRAY, adopted verbatim. tool_import_files,
		// tool_import_marc21 and tool_import_zotero all do `this.files_data = []`
		// once and hold that reference forever; handing the queue a different array
		// would leave every importer reading an empty one.
		if (self.caller && !Array.isArray(self.caller.files_data)) {
			self.caller.files_data = []
		}
		self.queue = new upload_queue({
			entries				: self.caller ? self.caller.files_data : [],
			key_dir				: self.key_dir,
			allowed_extensions	: self.allowed_extensions,
			max_size_bytes		: self.max_size_bytes,
			chunk_size_mb		: self.upload_service_chunk_files || 0,
			max_concurrent		: self.max_concurrent,
			tipo				: self.caller?.caller?.tipo || null,
			source				: create_source(self, 'delete_uploaded_file'),
			callbacks			: {
				on_add : function(entry) {
					const row = build_row(self, entry)
					previews_container.appendChild(row)
					self.row_map.set(entry.id, row)
					paint_row(self, entry)
					// Legacy topic, kept verbatim so a consumer flipped from
					// service_dropzone keeps working: render_tool_import_files.js
					// and render_tool_import_marc21.js subscribe to it to
					// (re)assign their per-row selects.
					event_manager.publish('drop_zone_addedfile', {
						file : entry
					})
				},
				on_change : function(entry) {
					// ONE row repainted, by id. No full re-render: a 900-row queue
					// rebuilt on every progress tick is a frozen tab.
					paint_row(self, entry)
					if (entry.status === 'done') {
						apply_server_thumbnail(self, entry)
						event_manager.publish('drop_zone_success', {
							file			: entry,
							api_response	: {
								result		: true,
								file_data	: {
									key_dir			: entry.key_dir,
									tmp_name		: entry.tmp_name,
									extension		: entry.extension,
									url				: entry.url,
									thumbnail_url	: entry.thumbnail_url
								}
							}
						})
					}
				},
				on_remove : function(entry) {
					release_object_url(self, entry.id)
					const row = self.row_map.get(entry.id)
					if (row) {
						row.remove()
					}
					self.row_map.delete(entry.id)
				},
				on_progress : function(aggregate) {
					global_progress_bar.style.width	= aggregate.percent + '%'
					global_total_bytes.textContent		= Math.floor(aggregate.bytes_total / 1024 / 1024) + 'MB'
					global_total_bytes_sent.textContent	= Math.floor(aggregate.bytes_sent / 1024 / 1024)
					global_progress.style.opacity = (self.queue && self.queue.uploading_ids.size > 0)
						? '1'
						: '0'
				},
				on_queue_complete : function() {
					global_progress.style.opacity	= '0'
					global_progress_bar.style.width	= '0%'
				}
			}
		})

	// drag & drop.
		// Bound on THIS widget's own node — the one element that exists in both the
		// `edit()` path and the tool-embeds-content_data path (`self.node` is null
		// in the second). Dropzone bound `document.body`, i.e. the whole page,
		// which is what made a drop anywhere land in whichever widget rendered last.
		let drag_depth = 0
		const drag_enter = function(e) {
			e.preventDefault()
			// (!) DEPTH COUNTER, not a boolean. `dragleave` fires every time the
			// pointer crosses INTO a child element, so a naive toggle un-highlights
			// the zone the moment the cursor passes over a row.
			drag_depth++
			content_data.classList.add('hover')
		}
		const drag_over = function(e) {
			// Without preventDefault on dragover the browser refuses the drop
			// outright ("no-drop" cursor) — the single most common cause of a drop
			// target that silently does nothing.
			e.preventDefault()
		}
		const drag_leave = function() {
			drag_depth--
			if (drag_depth <= 0) {
				drag_depth = 0
				content_data.classList.remove('hover')
			}
		}
		const drop_handler = function(e) {
			e.preventDefault()
			e.stopPropagation()
			drag_depth = 0
			content_data.classList.remove('hover')
			// (!) NOT awaited before the call: `files_from_drop` reads the
			// DataTransferItemList synchronously in its first turn, because the list
			// is neutered as soon as this handler returns. Awaiting anything before
			// it means an empty drop.
			files_from_drop(e.dataTransfer).then(function(files){
				for (let i = 0; i < files.length; i++) {
					add_local_file(self, files[i], thumbnails)
				}
				// Never silently narrow scope: a directory the browser refused to
				// read, or a traversal budget hit, is reported — the alternative is
				// a curator who believes a box of 400 scans was queued when 100 were.
				// (!) THE COUNT OF FAILURES IS NOT THE COUNT OF LOST FILES. One
				// `read_error` on a 450-file folder is ONE error object and can cost
				// 250 scans; saying "1 dropped item(s) could not be read" reads as a
				// single missing file and is how a partial ingest goes unnoticed for
				// years. The message states the failure count as what it is and the
				// loss as what it is: unknown.
				if (files.errors && files.errors.length > 0) {
					console.error('render_edit_service_upload_queue: skipped entries on drop:', files.errors)
					const message = files.truncated
						? files.errors.length + ' failure(s) while reading the drop:'
							+ ' the queued list is INCOMPLETE and an unknown number of files was not read.'
							+ ' See the browser console for the affected paths.'
						: files.errors.length + ' dropped item(s) could not be read.'
					ui.show_message(
						content_data,
						message,
						'warning'
					)
				}
			})
		}
		track_listener(self, content_data, 'dragenter', drag_enter)
		track_listener(self, content_data, 'dragover', drag_over)
		track_listener(self, content_data, 'dragleave', drag_leave)
		track_listener(self, content_data, 'drop', drop_handler)

		// document-level guard. preventDefault ONLY: a file dropped outside the
		// widget must not make the browser navigate away from the application to
		// display the file — which discards whatever the user had unsaved.
		const document_prevent = function(e) {
			e.preventDefault()
		}
		track_listener(self, document, 'dragover', document_prevent)
		track_listener(self, document, 'drop', document_prevent)

	// teardown. Everything this render owns that is NOT a listener and NOT a node.
		self.queue_teardown = function() {
			thumbnails.stop()
			if (self.object_urls) {
				const ids = Array.from(self.object_urls.keys())
				for (let i = 0; i < ids.length; i++) {
					release_object_url(self, ids[i])
				}
			}
			if (self.row_map) {
				self.row_map.clear()
			}
		}

	// staged files. Restore what a previous session left on the server.
		await restore_staged_files(self)


	return content_data
}//end get_content_data_queue



/**
* RESTORE_STAGED_FILES
* Asks the server which files are already staged under `key_dir` and pushes each
* one into the queue as a `staged` entry.
*
* @param {Object} self
* @returns {Promise<void>}
*/
const restore_staged_files = async function(self) {

	// rqo. prevent_lock: a read-only listing must not take a write lock on the
	// record the calling tool is sitting on.
		const rqo = {
			dd_api			: 'dd_utils_api',
			action			: 'list_uploaded_files',
			source			: create_source(self, 'list_uploaded_files'),
			prevent_lock	: true,
			options			: {
				key_dir : self.key_dir
			}
		}

	// call to the API, fetch data and get response
		const response = await data_manager.request({
			body : rqo
		})

	// (!) GUARD THE DEREF. On an expired session (or any error response) the
	// payload is absent, and reading `.length` off it THREW — which aborted the
	// whole render and left the entire tool panel blank instead of degrading to
	// an empty file list.
		const staged = response_data(response)
		const files = Array.isArray(staged)
			? staged
			: []

		for (let i = 0; i < files.length; i++) {
			self.queue.add_staged(files[i])
		}
}//end restore_staged_files



/**
* BUILD_ROW
* Creates ONE `.file-row` element and every node inside it, with direct pointers
* stashed on the row so `paint_row` never has to query.
*
* @param {Object} self
* @param {Object} entry - The queue entry this row shows.
* @returns {HTMLElement} The row (not yet appended).
*/
const build_row = function(self, entry) {

	// file_row
		const file_row = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'file-row'
		})

	// preview_wrapp
		const preview_wrapp = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'preview_wrapp',
			parent			: file_row
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'preview',
			parent			: preview_wrapp
		})
		const preview_image = ui.create_dom_element({
			element_type	: 'img',
			class_name		: '_preview_image',
			parent			: preview_wrapp
		})

	// details_wrapp
		const details_wrapp = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'details_wrapp',
			parent			: file_row
		})
		// (!) textContent, NEVER innerHTML, on all three. A filename is
		// user-supplied AND round-trips through the server listing, so innerHTML
		// here is stored XSS with a persistence layer.
		const name_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'name',
			parent			: details_wrapp
		})
		const error_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'error text-danger',
			parent			: details_wrapp
		})
		const size_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'size',
			parent			: details_wrapp
		})

	// component options. Omitted entirely when neither list is configured — an
	// empty `.component.options` div still eats a grid column.
		const ar_file_processor		= self.file_processor
		const ddo_option_components	= self.component_option
		if (ar_file_processor || ddo_option_components) {

			const row_options_wrapper = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'component options',
				parent			: file_row
			})

			if (ar_file_processor) {
				const select_process = ui.create_dom_element({
					element_type	: 'select',
					class_name		: 'file_processor_select',
					parent			: row_options_wrapper
				})
				// (!) The blank sentinel's value is the STRING 'null' (that is what
				// `new Option('', null)` produces), and
				// render_tool_import_files.js:264 tests exactly `=== 'null'`.
				// Building it any other way silently changes that comparison.
				select_process.appendChild(new Option('', null, true, false))
				for (let i = 0; i < ar_file_processor.length; i++) {
					const element = ar_file_processor[i]
					select_process.appendChild(
						new Option(element.function_name_label, element.function_name, element.default || false, false)
					)
				}
				track_listener(self, select_process, 'change', function(){
					// Mirror onto the entry: the entry is what goes on the wire, and
					// a consumer that reads it instead of the DOM must see the same
					// choice the user made.
					entry.file_processor = select_process.value === 'null'
						? null
						: select_process.value
				})
			}

			if (ddo_option_components) {
				const row_select_options = ui.create_dom_element({
					element_type	: 'select',
					class_name		: 'option_component_select',
					parent			: row_options_wrapper
				})
				for (let i = 0; i < ddo_option_components.length; i++) {
					const option = ddo_option_components[i]
					row_select_options.appendChild(
						new Option(option.label, option.tipo, option.default || false, false)
					)
				}
				track_listener(self, row_select_options, 'change', function(){
					entry.component_option = row_select_options.value
				})
			}
		}

	// row_progress_bar
		const row_progress_bar = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'row_progress_bar',
			parent			: file_row
		})
		const row_progress = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'progress progress-striped active',
			parent			: row_progress_bar
		})
		row_progress.style.opacity = '0'
		const row_progress_bar_success = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'progress-bar progress-bar-success',
			parent			: row_progress
		})
		row_progress_bar_success.style.width = '0%'

	// row_buttons
		const row_buttons = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'row_buttons',
			parent			: file_row
		})
		const button_start = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary start',
			inner_html		: get_label.start_upload || 'Start upload',
			parent			: row_buttons
		})
		const button_cancel = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'warning cancel',
			inner_html		: get_label.cancel_upload || 'Cancel upload',
			parent			: row_buttons
		})
		const button_delete = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'danger delete row_button_delete',
			inner_html		: get_label.delete_file || 'Delete file',
			parent			: row_buttons
		})
		const button_delete_check_box = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox',
			class_name		: 'delete_checkbox row_delete_check_box',
			parent			: row_buttons
		})
		// The batch handler resolves rows by ENTRY ID, not by name: two rows can
		// legitimately display similar names, and the id is what `queue.remove`
		// takes.
		button_delete_check_box.dataset.entry_id	= entry.id
		button_delete_check_box.value				= entry.name

		track_listener(self, button_start, 'click', function(e){
			e.preventDefault()
			self.queue.start(entry.id)
		})
		track_listener(self, button_cancel, 'click', function(e){
			e.preventDefault()
			self.queue.cancel(entry.id)
		})
		track_listener(self, button_delete, 'click', function(e){
			e.preventDefault()
			// delete_remote: a done/staged row owns bytes on the server; the queue
			// decides (by status) whether the call is actually made.
			self.queue.remove(entry.id, {delete_remote:true})
		})

	// pointers. Painting by pointer instead of by querySelector is what keeps a
	// progress tick O(1) on a 900-row queue.
		file_row.name_node			= name_node
		file_row.error_node			= error_node
		file_row.size_node			= size_node
		file_row.preview_image		= preview_image
		file_row.row_progress		= row_progress
		file_row.row_progress_bar	= row_progress_bar_success
		file_row.button_start		= button_start
		file_row.button_cancel		= button_cancel
		file_row.button_delete		= button_delete
		file_row.delete_check_box	= button_delete_check_box

	// (!) CONSUMER CONTRACT. tool_import_files/marc21/zotero read
	// `entry.previewElement.querySelector('.file_processor_select' |
	// '.option_component_select')`. Both names are stamped because Dropzone set
	// both and consumers use each.
		entry.previewElement	= file_row
		entry.previewTemplate	= file_row

	// staged preview. A restored row has no local File; the server told us where
	// to look. `thumbnail_url || url` — an <img> CAN show a jpeg directly, but
	// never a TIFF or a video, so the rendered thumbnail is preferred.
		if (entry.status === 'staged') {
			const remote = entry.thumbnail_url || entry.url
			if (remote) {
				preview_image.src = remote
			}
		}
		// A LOCAL preview is attached by add_local_file() after `queue.add()`
		// returns — the File deliberately never reaches the entry, so it cannot be
		// read from here.


	return file_row
}//end build_row



/**
* ADD_LOCAL_FILE
* Queues one browser `File` and gives its row a local preview.
*
* (!) THE FILE NEVER TOUCHES THE ENTRY, and the queue keeps it in a
* module-private WeakMap on purpose: the entry is serialised verbatim onto the
* wire by the import tools, and a `File` on it makes `JSON.stringify` throw
* inside data_manager — the import would die before reaching the network. So the
* renderer holds the File in its OWN closure for exactly as long as it takes to
* mint an object URL, right here, after `add()` has returned the entry with its
* `previewElement` already stamped.
*
* @param {Object} self
* @param {File} file
* @param {Object} scheduler - The thumbnail decode scheduler.
* @returns {Object|null} The created entry.
*/
const add_local_file = function(self, file, scheduler) {

	const entry = self.queue.add(file)
	if (!entry || !entry.previewElement) {
		return entry
	}

	attach_local_thumbnail(self, entry, file, entry.previewElement.preview_image, scheduler)


	return entry
}//end add_local_file



/**
* ATTACH_LOCAL_THUMBNAIL
* Shows the LOCAL file as the row's preview, through the decode scheduler.
*
* Only for formats an `<img>` can decode: a TIFF, a zip, an mp4 or a MARC record
* gets NO `src` at all and falls through to the CSS placeholder background
* (`service_upload.less`). An `<img>` pointed at a TIFF does not fail visibly —
* it renders the broken-image glyph, which reads as "the upload ate my file".
*
* @param {Object} self
* @param {Object} entry
* @param {File} file
* @param {HTMLElement} image_node
* @param {Object} scheduler
* @returns {void}
*/
const attach_local_thumbnail = function(self, entry, file, image_node, scheduler) {

	if (!file || !image_node) {
		return
	}
	if (!RASTERISABLE_EXTENSIONS.has(extension_of(entry.name))) {
		return
	}

	scheduler.push(function(done){
		// The row may have been removed while this job waited its turn (a user who
		// drops 400 files and immediately deletes half of them). Minting an object
		// URL now would register a blob against an id nothing will ever revoke
		// except destroy().
		if (!self.row_map || !self.row_map.has(entry.id)) {
			done()
			return
		}
		let object_url = null
		try {
			object_url = URL.createObjectURL(file)
		} catch (error) {
			console.error('render_edit_service_upload_queue could not create an object URL:', error)
			done()
			return
		}
		self.object_urls.set(entry.id, object_url)
		// `done` on BOTH outcomes: a decode failure that never released its slot
		// would stall every remaining preview in the queue.
		image_node.addEventListener('load', function(){
			done()
		}, {once:true})
		image_node.addEventListener('error', function(){
			done()
		}, {once:true})
		image_node.src = object_url
	})
}//end attach_local_thumbnail



/**
* APPLY_SERVER_THUMBNAIL
* Swaps the local preview for the server-generated one after a successful upload.
*
* (!) ONLY WHEN NON-NULL. The server OMITS `thumbnail_url` for formats it cannot
* rasterise; assigning `undefined` to `img.src` blanked the preview — the exact
* regression `render_edit_service_dropzone.js:1096` had to guard against.
*
* @param {Object} self
* @param {Object} entry
* @returns {void}
*/
const apply_server_thumbnail = function(self, entry) {

	const row = self.row_map.get(entry.id)
	if (!row) {
		return
	}

	const remote = entry.thumbnail_url || null
	if (!remote) {
		return
	}

	row.preview_image.src = remote
	// The local blob is now unreferenced by anything on screen.
	release_object_url(self, entry.id)
}//end apply_server_thumbnail



/**
* SET_CONTROL
* Applies one cell of CONTROL_STATES to one control node.
*
* @param {HTMLElement} node
* @param {string} state - 'enabled' | 'shown' | 'disabled' | 'hidden'.
* @returns {void}
*/
const set_control = function(node, state) {

	if (state === 'hidden') {
		node.classList.add('hide')
		node.disabled = true
		return
	}

	node.classList.remove('hide')
	node.disabled = (state === 'disabled')
}//end set_control



/**
* PAINT_ROW
* Repaints EXACTLY ONE row from its entry. The single write path for everything
* a row shows.
*
* @param {Object} self
* @param {Object} entry
* @returns {void}
*/
export const paint_row = function(self, entry) {

	const row = self.row_map ? self.row_map.get(entry.id) : null
	if (!row) {
		return
	}

	// text
		row.name_node.textContent	= entry.name
		row.size_node.textContent	= format_size(entry.size)
		row.error_node.textContent	= error_text(entry)

	// status class. ONE class, swapped — a styling hook that cannot accumulate.
		row.className = 'file-row row_status_' + entry.status

	// controls
		const state = CONTROL_STATES[entry.status] || CONTROL_STATES.pending
		set_control(row.button_start, state.start)
		set_control(row.button_cancel, state.cancel)
		set_control(row.button_delete, state.delete)
		set_control(row.delete_check_box, state.check)

	// row progress
		if (state.progress) {
			row.row_progress.style.opacity		= '1'
			row.row_progress_bar.style.width	= (entry.progress || 0) + '%'
		} else {
			row.row_progress.style.opacity		= '0'
			row.row_progress_bar.style.width	= (entry.status === 'done' || entry.status === 'staged')
				? '100%'
				: '0%'
		}
}//end paint_row



/**
* RENDER_INFO_CONTAINER
* The collapsible diagnostic panel: caller model, target quality, allowed
* extensions, max size (with the `warning` class under 100 MB), chunk size, the
* two temp dirs, their permissions and the session expiry.
*
* Ported from `render_edit_service_dropzone.render_info_container` unchanged in
* content — it is the panel a sysadmin reads when an upload is refused, and its
* rows map one-to-one onto `dd_utils_api::get_system_info`.
*
* @param {Object} self - The service_upload instance.
* @returns {HTMLElement} The `div.info_container` (NOT yet appended).
*/
export const render_info_container = function(self) {

	// info_container
		const info_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_container'
		})

	// caller component
		ui.create_dom_element({
			element_type	: 'label',
			text_content	: 'Caller',
			parent			: info_container
		})
		ui.create_dom_element({
			element_type	: 'div',
			text_content	: self.caller?.model || 'Unknown',
			parent			: info_container
		})

	// target quality. `context.features` is absent when the caller is a plain
	// tool rather than a component.
		const target_quality = self.caller?.context?.features
			? self.caller.context.features.target_quality || self.caller.context.features.default_target_quality
			: null
		if (target_quality) {
			ui.create_dom_element({
				element_type	: 'label',
				text_content	: 'Target quality',
				parent			: info_container
			})
			ui.create_dom_element({
				element_type	: 'div',
				text_content	: target_quality,
				parent			: info_container
			})
		}

	// allowed extensions
		ui.create_dom_element({
			element_type	: 'label',
			text_content	: 'Allowed extensions',
			parent			: info_container
		})
		ui.create_dom_element({
			element_type	: 'div',
			text_content	: (self.allowed_extensions || []).join(", "),
			parent			: info_container
		})

	// max file size. 'warning' under 100 MB tells the administrator the server
	// limit — not the widget — is what will refuse a large scan.
		const max_mb = Math.floor((self.max_size_bytes || 0) / (1024*1024))
		ui.create_dom_element({
			element_type	: 'label',
			text_content	: 'Max file size',
			parent			: info_container
		})
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: (max_mb < 100) ? 'warning' : '',
			text_content	: max_mb.toLocaleString() + ' MB',
			parent			: info_container
		})

	// chunk files size. Falsy = chunking disabled; the JSON form makes the
	// disabled state unambiguous instead of showing an empty cell.
		ui.create_dom_element({
			element_type	: 'label',
			text_content	: 'Chunk files size',
			parent			: info_container
		})
		const chunk_text = self.upload_service_chunk_files
			? self.upload_service_chunk_files + ' MB'
			: JSON.stringify(self.upload_service_chunk_files)
		ui.create_dom_element({
			element_type	: 'div',
			text_content	: chunk_text,
			parent			: info_container
		})

	// sys_get_temp_dir
		ui.create_dom_element({
			element_type	: 'label',
			text_content	: 'System temp dir',
			parent			: info_container
		})
		ui.create_dom_element({
			element_type	: 'div',
			text_content	: self.sys_get_temp_dir || '',
			parent			: info_container
		})

	// upload_tmp_dir
		ui.create_dom_element({
			element_type	: 'label',
			text_content	: 'User upload tmp dir',
			parent			: info_container
		})
		ui.create_dom_element({
			element_type	: 'div',
			text_content	: self.upload_tmp_dir || '',
			parent			: info_container
		})

	// upload_tmp_perms
		ui.create_dom_element({
			element_type	: 'label',
			text_content	: 'User upload tmp perms',
			parent			: info_container
		})
		ui.create_dom_element({
			element_type	: 'div',
			text_content	: String(self.upload_tmp_perms ?? ''),
			parent			: info_container
		})

	// session_cache_expire. Minutes on the wire; shown in Days above 24 h, with
	// the raw minutes in brackets so the number stays exact.
		const minutes = self.session_cache_expire || 0
		const session_cache_expire = (minutes / 60) > 24
			? (minutes / (60 * 24)).toLocaleString() + ' Days'
			: (minutes / 60).toLocaleString() + ' Hours'
		ui.create_dom_element({
			element_type	: 'label',
			text_content	: 'Session cache expire',
			parent			: info_container
		})
		ui.create_dom_element({
			element_type	: 'div',
			text_content	: session_cache_expire + ' [' + minutes.toLocaleString() + ' minutes]',
			parent			: info_container
		})


	return info_container
}//end render_info_container



// @license-end
