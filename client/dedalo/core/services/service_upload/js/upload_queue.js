// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global console */
/*eslint no-undef: "error"*/

// imports
	import { data_manager } from '../../../common/js/data_manager.js'
	import { create_connection_pool, create_transfer, validate_file } from './upload_transport.js'
	import { request_failed, response_data } from '../../../common/js/api_error.js'
	import { error_text } from '../../../common/js/render_api_error.js'



/**
* UPLOAD_QUEUE
* The multi-file upload STATE MODEL. It owns what the user is uploading; it owns
* nothing of what the user SEES.
*
* This module is deliberately DOM-FREE: no `document`, no `event_manager`, no
* `get_label`, no `alert`, no CSS class. It drives `upload_transport` and reports
* through callbacks; a renderer subscribes and paints. That separation is what
* makes the queue testable at all (biome does not lint `client/`, so a test is
* the ONLY gate this code has) and what stops a 40-file drop from firing 40
* blocking modal dialogs the way the code it replaces did.
*
* THE ENTRY IS A WIRE OBJECT, NOT A VIEW MODEL
* `options.entries` IS the caller's `files_data` array — every import tool holds
* that one reference for the life of its instance. Two consequences are
* load-bearing and both are enforced below:
*   1. (!) The array is ADOPTED, NEVER REASSIGNED. The tools do
*      `this.files_data = []` exactly once and hold that reference for the life
*      of the instance. `clear()` splices in place; nothing here ever writes
*      `self.entries = …`. Reassigning would leave every consumer pointing at a
*      dead array — an import that silently sends zero files.
*   2. (!) THE ENUMERABLE SHAPE OF AN ENTRY IS SCALARS ONLY. The `File`, the
*      transport handle and the upload id live in module-private WeakMaps, and
*      the two HTMLElement pointers the renderer stamps
*      (`previewElement` / `previewTemplate`) are declared NON-ENUMERABLE here,
*      so `JSON.stringify(files_data)` is exact and total: it yields the wire
*      object and nothing else, whether or not a renderer ever touched the
*      entry.
*      HONEST SCOPE (corrected 2026-08-03): the three import tools do NOT send
*      `files_data` verbatim — each one PROJECTS a fixed key set
*      (`tool_import_files.js`, `render_tool_import_marc21.js`,
*      `render_tool_import_zotero.js`). So JSON-safety is no longer what stands
*      between an import and the network. It is kept, and gated, for the two
*      reasons that ARE still true: a serialised DOM subtree in a log/session
*      dump of a 900-row queue is unusable, and the WeakMaps are what let a
*      removed entry's multi-GB `File` be collected at all.
*      The pointers stay ON the entry (not in a renderer-side map) because
*      `entry.previewElement.querySelector('.file_processor_select')` is the
*      published consumer contract of all three tools.
*
* STATUS MACHINE
*   pending    → uploading → done | error | canceled
*   pending    → (never uploaded, removed)
*   invalid    terminal; failed client-side validation, never sent
*   staged     terminal; restored from the server by list_uploaded_files
*   error      → uploading (retry: start() again)
*   canceled   → uploading (start() again)
*
* (!) `staged` is ALWAYS paired with a truthy `url`. A consumer
* (tool_import_files) unlocks its IMPORT button on `url` truthiness, because a
* staged file is already importable while a merely-added one is not. A staged
* entry without a url would unlock nothing and the restored queue would look
* dead after a reload.
*
* Main export:
* - `upload_queue(options)` — constructor; see the prototype methods below.
*/

// module-private side tables
	// (!) NOT entry properties. See "THE ENTRY IS A WIRE OBJECT" above: anything
	// put here would otherwise have to live on the entry, and the entry is
	// serialised onto the wire. WeakMap also means a removed entry's File is
	// collectable the moment the caller drops its reference — a queue of 40 RAW
	// files holds gigabytes otherwise.
	const file_of_entry		= new WeakMap()
	const transfer_of_entry	= new WeakMap()
	// The identity of the LAST transfer started for an entry. Unlike
	// `transfer_of_entry` it is NOT dropped when the transfer settles: the
	// cancel-and-sweep runs AFTER the abort has settled, and without the id
	// `dd_utils_api::delete_uploaded_file` cannot name the `.up_<upload_id>/`
	// part directory — a cancelled multi-GB ingest would park its bytes until
	// the 24 h orphan GC (upload_transport's `abort()` delegates the sweep here
	// precisely because this layer has the id, the key_dir and a UI to report
	// into).
	const upload_id_of_entry = new WeakMap()

// entry id sequence
	// Module-scoped, so ids stay unique even when two queues coexist on a page
	// (a tool panel and a component's own upload service).
	let entry_id_sequence = 0



/**
* EXTENSION_OF
* Lowercase extension of a file name, or ''.
* Deliberately NOT the PHP-era alpha-only grammar, which silently lost `.mp4`,
* `.mp3` and `.jp2`.
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
* COLLISION_KEY
* The identity two names collide on.
*
* NOT the raw name. The receiver sanitises before staging
* (`stagedTmpName`: everything outside `[A-Za-z0-9_.-]` becomes `_`), so
* `DSC 001.jpg` and `DSC_001.jpg` are TWO different rows in the UI that stage to
* ONE file on disk — the second overwrites the first and one scan is gone with
* no error anywhere. Comparing on the sanitised, case-folded form is what makes
* the rename below actually protect the bytes. Case folding additionally covers
* a case-insensitive staging filesystem (macOS installs).
*
* @param {string} name
* @returns {string}
*/
const collision_key = function(name) {

	const safe_name = typeof name === 'string' ? name : ''

	return safe_name.replace(/[^A-Za-z0-9_.-]/g, '_').toLowerCase()
}//end collision_key



/**
* SPLIT_NAME
* Splits a file name into the part a collision suffix goes after and the
* extension it goes before. A dot-less name ('README') is all base.
*
* @param {string} name
* @returns {Object} `{base, extension}` — `extension` includes the dot, or ''.
*/
const split_name = function(name) {

	const last_dot = name.lastIndexOf('.')

	return {
		base		: last_dot > 0 ? name.substring(0, last_dot) : name,
		extension	: last_dot > 0 ? name.substring(last_dot) : ''
	}
}//end split_name



/**
* GENERATED_FROM
* The name a collision-suffixed name was generated from, or null.
* `a (3).jpg` → `a.jpg`.
*
* @param {string} name
* @returns {string|null}
*/
const generated_from = function(name) {

	const parts		= split_name(name)
	const stripped	= /^(.*) \(\d+\)$/.exec(parts.base)
	if (!stripped) {
		return null
	}

	return stripped[1] + parts.extension
}//end generated_from



/**
* DEFINE_PREVIEW_POINTERS
* Declares the two renderer-owned HTMLElement slots on a fresh entry as
* NON-ENUMERABLE.
*
* (!) THIS IS WHAT MAKES "the entry is a wire object" TRUE IN THE PRODUCT rather
* than only in the queue's own unit test. The renderer assigns
* `entry.previewElement = file_row` (its published consumer contract:
* `entry.previewElement.querySelector('.file_processor_select')`), and a plain
* assignment KEEPS the descriptor declared here — so a rendered entry serialises
* to exactly the same scalars an unrendered one does, and no DOM subtree can ever
* ride along in a JSON.stringify of `files_data`.
* Declared with `writable:true, configurable:true`: the renderer assigns, and
* re-renders reassign.
*
* @param {Object} entry
* @returns {void}
*/
const define_preview_pointers = function(entry) {

	Object.defineProperty(entry, 'previewElement', {
		value			: null,
		enumerable		: false,
		configurable	: true,
		writable		: true
	})
	Object.defineProperty(entry, 'previewTemplate', {
		value			: null,
		enumerable		: false,
		configurable	: true,
		writable		: true
	})
}//end define_preview_pointers



/**
* ERROR_TEXT_FROM
* The failure sentence for a queue row: the ONE coded error, resolved by the
* ONE renderer (label in the curator's language → registry English → code).
*
* The upload endpoint is converter-made, so the REAL diagnosis (bad magic
* bytes, path escape, oversize part) is `error.message` under `error.code` —
* the transport already normalised every terminal path into one ApiError
* (upload_transport.js api_error_from), including its own aborts and
* unparseable bodies.
*
* @param {Object|null} api_response
* @returns {string}
*/
const error_text_from = function(api_response) {

	return request_failed(api_response)
		? error_text(api_response.error)
		: 'Upload failed'
}//end error_text_from



/**
* UPLOAD_QUEUE
* Constructor.
*
* @param {Object} options
*   @param {Array} options.entries - The caller's own registry array (its
*     `files_data`). ADOPTED as-is; never replaced. Omitted = a private array.
*   @param {string} options.key_dir - Server-side staging routing key.
*   @param {Array<string>} [options.allowed_extensions] - Advisory whitelist.
*     Empty/absent = allow all (upload_transport D3); the real enforcement is the
*     server's magic-byte sniff.
*   @param {number} [options.max_size_bytes] - Advisory cap. Falsy = none.
*   @param {number} [options.chunk_size_mb] - >0 = chunked transfers.
*   @param {number} [options.max_concurrent] - TOTAL in-flight XHRs, across all
*     files (the shared connection pool's window). Falsy = unbounded.
*   @param {number} [options.max_parallel_files=3] - Entries allowed in
*     `uploading` at once. (!) BOTH caps are needed: `max_parallel_files` alone
*     lets 3 files × 50 chunks open 150 sockets; `max_concurrent` alone lets 20
*     files each open one chunk and starve every one of them into a crawl.
*   @param {Object} [options.pool] - An already-shared pool; one is created from
*     `max_concurrent` when absent.
*   @param {string|null} [options.tipo] - Ontology tipo of the owning component.
*   @param {Object|null} [options.source] - Optional RQO `source` for the remote
*     delete call (the API handler does not read it; it is forwarded when the
*     caller supplies one so the request looks like every other one it makes).
*   @param {Object} [options.callbacks] - All optional:
*     `on_add(entry)`, `on_change(entry)`, `on_remove(entry)`,
*     `on_progress(aggregate)`, `on_queue_complete()`.
* @returns {Object} The instance (`new upload_queue({…})`).
*/
export const upload_queue = function(options) {

	const self = this

	// options
		const config = options || {}

	// entries. ADOPTED — see the module header. The `||` is a default for the
	// standalone case, NOT a replacement of a passed array.
		self.entries			= Array.isArray(config.entries) ? config.entries : []
		self.key_dir			= config.key_dir || null
		self.allowed_extensions	= config.allowed_extensions || []
		self.max_size_bytes		= config.max_size_bytes || 0
		self.chunk_size_mb		= config.chunk_size_mb || 0
		self.tipo				= config.tipo || null
		self.source				= config.source || null
		self.max_parallel_files	= typeof config.max_parallel_files === 'number'
			? config.max_parallel_files
			: 3
		self.callbacks			= config.callbacks || {}
		self.pool				= config.pool || create_connection_pool(config.max_concurrent || 0)

	// name index. (!) O(1) COLLISION LOOKUP. `unique_name` used to rebuild a Set
	// of every entry name on EVERY add: 20 000 adds (exactly `dropped_files`'
	// max_files, i.e. ONE full-size folder drop) cost 13.9 s of blocked main
	// thread and froze the tab. The index is maintained incrementally instead, and
	// `name_cursors` remembers where the probe for one base name got to, so a
	// thousand same-named scans do not each re-probe from 1.
		self.name_keys		= new Set()
		self.name_cursors	= new Map()
		for (let i = 0; i < self.entries.length; i++) {
			// An ADOPTED array can already carry rows (a tool re-rendering onto its
			// own registry). They collide exactly like the ones added here.
			self.name_keys.add(collision_key(self.entries[i].name))
		}

	// runtime state (never serialised, never on an entry)
		// The ids the user has ASKED to upload. An entry stays `pending` until the
		// scheduler admits it, so the intent cannot live in `status` — and a queue
		// UI that showed every waiting row as "uploading" is exactly the confusion
		// upload_transport's own 'queued' status was introduced to avoid.
		self.wanted_ids		= new Set()
		self.uploading_ids	= new Set()
		// Guards `on_queue_complete` against firing for a queue that never ran:
		// removing a single pending row would otherwise announce a completed
		// upload batch that never started.
		self.was_active		= false
		self.destroyed		= false

	return true
}//end upload_queue



/**
* FIRE
* Invokes one caller callback defensively. A throw in the renderer must never
* wedge the queue mid-upload.
*
* @param {string} name
* @param {*} [payload]
* @returns {void}
*/
upload_queue.prototype.fire = function(name, payload) {

	const self = this

	const callback = self.callbacks ? self.callbacks[name] : null
	if (typeof callback !== 'function') {
		return
	}
	try {
		callback(payload)
	} catch (error) {
		console.error('upload_queue callback error in ' + name + ':', error)
	}
}//end fire



/**
* UNIQUE_NAME
* Returns a name that no entry in the queue is using.
*
* (!) DEFECT FIXED HERE — the code this replaces
* (`render_edit_service_dropzone.js:757`, Dropzone's `renameFile`) did:
*     if (files.some(el => el.name === name)) return base + ' (' + files.length + ').' + ext
* Two independent bugs, both silent:
*   a) the suffix is the CURRENT ARRAY LENGTH, not a free index. Queue
*      `a.jpg` ×3 → `[a.jpg, a (1).jpg, a (2).jpg]`; remove `a (1).jpg`
*      (length is now 2); add `a.jpg` → renamed to `a (2).jpg`, WHICH ALREADY
*      EXISTS. Both rows stage to one path and one scan is overwritten with no
*      error at all.
*   b) the collision test only ever looked at the ORIGINAL name, so the
*      generated name was never itself checked.
* This increments until the name is genuinely free, and compares against EVERY
* entry — including `staged` ones, because a restored `a.jpg` is already on disk
* and a new `a.jpg` uploaded over it destroys the restored file.
* Comparison is on `collision_key`, not the raw name (see there).
*
* The membership test reads `self.name_keys` (maintained by `register_name` /
* `forget_name`) rather than rescanning `entries`: see the constructor.
*
* @param {string} name
* @returns {string}
*/
upload_queue.prototype.unique_name = function(name) {

	const self = this

	const safe_name	= (typeof name === 'string' && name !== '') ? name : 'upload.bin'
	const key		= collision_key(safe_name)

	if (!self.name_keys.has(key)) {
		return safe_name
	}

	// split. A dot-less name ('README') keeps its whole self as the base.
		const parts = split_name(safe_name)

	// increment until FREE. The cursor is a HINT ONLY — every candidate is still
	// verified against the index, so a stale cursor can cost probes but can never
	// hand out a name that is in use.
		let index = self.name_cursors.get(key) || 1
		for (;;) {
			const candidate = parts.base + ' (' + index + ')' + parts.extension
			index++
			if (!self.name_keys.has(collision_key(candidate))) {
				self.name_cursors.set(key, index)
				return candidate
			}
		}
}//end unique_name



/**
* REGISTER_NAME
* Adds one name to the collision index. Internal; called for every entry that
* enters the queue, whatever its status.
*
* @param {string} name
* @returns {void}
*/
upload_queue.prototype.register_name = function(name) {

	const self = this

	self.name_keys.add(collision_key(name))
}//end register_name



/**
* FORGET_NAME
* Releases one name from the collision index. Internal.
*
* (!) It also DROPS THE CURSOR of the name this one was generated from. Without
* that, removing `a (1).jpg` and re-adding `a.jpg` would answer `a (3).jpg`
* forever: the freed slot must become probeable again, exactly as it was when the
* lookup rescanned the whole array.
*
* @param {string} name
* @returns {void}
*/
upload_queue.prototype.forget_name = function(name) {

	const self = this

	self.name_keys.delete(collision_key(name))

	const origin = generated_from(typeof name === 'string' ? name : '')
	if (origin) {
		self.name_cursors.delete(collision_key(origin))
	}
	self.name_cursors.delete(collision_key(name))
}//end forget_name



/**
* ADD
* Registers one local File in the queue. NEVER uploads anything by itself
* (`start()` does) and NEVER blocks.
*
* (!) VALIDATION NEVER BLOCKS AND NEVER ALERTS. A rejected file becomes an entry
* with `status:'invalid'` and a populated `error`, and the renderer shows it in
* its own row. The single-file service could afford an `alert()`; a 40-file drop
* containing 3 unsupported files would fire 3 modal dialogs the user has to
* dismiss one by one before the other 37 even start.
*
* @param {File} file
* @returns {Object|null} The created entry, or null when the queue is destroyed.
*/
upload_queue.prototype.add = function(file) {

	const self = this

	if (self.destroyed || !file) {
		return null
	}

	// name. Collision-free against everything already queued or staged.
		const source_name	= typeof file.name === 'string' ? file.name : 'upload.bin'
		const name			= self.unique_name(source_name)

	// validation. Advisory only: an empty whitelist ALLOWS (upload_transport D3),
	// and the server's magic-byte sniff is the real gate.
		const verdict = validate_file({
			file				: file,
			allowed_extensions	: self.allowed_extensions,
			max_size_bytes		: self.max_size_bytes
		})

	// entry. Scalars + the two renderer-owned element pointers, nothing else:
	// this object goes on the wire verbatim.
		entry_id_sequence++
		const entry = {
			id					: 'entry_' + entry_id_sequence,
			name				: name,
			source_name			: source_name,
			size				: file.size || 0,
			status				: verdict.valid ? 'pending' : 'invalid',
			progress			: 0,
			// `code` is a get_label KEY plus the detail text; the queue does not
			// resolve labels (it has no DOM and no get_label), so it hands the
			// renderer both halves joined — a renderer that wants the label can
			// still read `error_code`.
			error				: verdict.valid ? null : (verdict.code + (verdict.detail || '')),
			error_code			: verdict.valid ? null : verdict.code,
			url					: null,
			thumbnail_url		: null,
			tmp_name			: null,
			key_dir				: self.key_dir,
			extension			: extension_of(name),
			file_processor		: null,
			component_option	: null
		}
		define_preview_pointers(entry)

	// side table. The File never touches the entry (JSON safety).
		file_of_entry.set(entry, file)

		self.register_name(name)
		self.entries.push(entry)
		self.fire('on_add', entry)
		self.publish_progress()


	return entry
}//end add



/**
* ADD_STAGED
* Registers a file that is ALREADY on the server, from the
* `dd_utils_api::list_uploaded_files` listing — the mechanism by which a pending
* queue survives a page reload.
*
* @param {Object} descriptor - `{name, url, size, thumbnail_url}` (WC-078).
* @returns {Object|null} The created entry, or null when the queue is destroyed
*   or the descriptor has no name.
*/
upload_queue.prototype.add_staged = function(descriptor) {

	const self = this

	if (self.destroyed || !descriptor || !descriptor.name) {
		return null
	}

	// name. TWO NAMES, deliberately.
	// (!) `tmp_name` is what is ON DISK and is never rewritten — renaming it would
	// address a file that does not exist. The DISPLAY name, like every other
	// entry's, goes through `unique_name`: the drop handler is bound BEFORE
	// `restore_staged_files` awaits its listing, so a local `a.jpg` can already be
	// queued when the restored `a.jpg` arrives. Adding it verbatim produced TWO
	// rows called `a.jpg`, and an importer resolving by name then imported
	// whichever one it met first — the wrong file, silently.
		const staged_name	= descriptor.name
		const name			= self.unique_name(staged_name)
		const url			= descriptor.url || null

	entry_id_sequence++
	const entry = {
		id					: 'entry_' + entry_id_sequence,
		name				: name,
		source_name			: staged_name,
		size				: descriptor.size || 0,
		// (!) `staged` REQUIRES a truthy url: a consumer unlocks IMPORT on url
		// truthiness. A listing row without one cannot be addressed at all, so it
		// is surfaced as an error rather than presented as importable — an
		// IMPORT that unlocks on an unreachable file fails deep in the server.
		status				: url ? 'staged' : 'error',
		progress			: url ? 100 : 0,
		error				: url ? null : 'Staged file has no url',
		error_code			: null,
		url					: url,
		thumbnail_url		: descriptor.thumbnail_url || null,
		// A restored row is already staged, so its staged identity IS its LISTED
		// name (the listing reports what is on disk) — never the collision-free
		// display name, which may have been pushed aside above. Stamping it here
		// is what lets an import launched straight after a reload resolve the same
		// file the upload wrote.
		tmp_name			: staged_name,
		key_dir				: self.key_dir,
		extension			: extension_of(staged_name),
		file_processor		: null,
		component_option	: null
	}
	define_preview_pointers(entry)

	self.register_name(name)
	self.entries.push(entry)
	self.fire('on_add', entry)
	self.publish_progress()


	return entry
}//end add_staged



/**
* START
* Marks entries as wanted and lets the scheduler admit them.
*
* @param {string} [entry_id] - Omit to start every `pending` entry. A `error` or
*   `canceled` entry is restarted when named explicitly (the retry path).
* @returns {void}
*/
upload_queue.prototype.start = function(entry_id) {

	const self = this

	if (self.destroyed) {
		return
	}

	if (typeof entry_id !== 'undefined' && entry_id !== null) {
		const entry = self.get(entry_id)
		// A retry of a failed/cancelled row returns it to `pending` first, so the
		// scheduler sees one uniform admission state.
		if (entry && (entry.status === 'error' || entry.status === 'canceled')) {
			entry.status	= 'pending'
			entry.error		= null
			entry.progress	= 0
			self.fire('on_change', entry)
		}
		if (entry && entry.status === 'pending') {
			self.wanted_ids.add(entry.id)
		}
	} else {
		for (let i = 0; i < self.entries.length; i++) {
			const current = self.entries[i]
			if (current.status === 'pending') {
				self.wanted_ids.add(current.id)
			}
		}
	}

	self.pump()
}//end start



/**
* PUMP
* Admits wanted entries until `max_parallel_files` is reached.
* Idempotent and cheap; called on every start and on every terminal transition.
*
* @returns {void}
*/
upload_queue.prototype.pump = function() {

	const self = this

	if (self.destroyed) {
		return
	}

	for (let i = 0; i < self.entries.length; i++) {
		if (self.max_parallel_files && self.uploading_ids.size >= self.max_parallel_files) {
			return
		}
		const entry = self.entries[i]
		if (entry.status !== 'pending' || !self.wanted_ids.has(entry.id)) {
			continue
		}
		self.begin(entry)
	}
}//end pump



/**
* BEGIN
* Starts the actual transfer of one entry. Internal — `start()` is the API.
*
* @param {Object} entry
* @returns {void}
*/
upload_queue.prototype.begin = function(entry) {

	const self = this

	const file = file_of_entry.get(entry)
	if (!file) {
		// A staged/invalid entry has no File; it must never reach here.
		// (!) The batch must still be settled. This branch releases the intent
		// without ever holding a slot, so nothing else will announce the drain: a
		// queue whose LAST wanted entry lands here would sit "in progress" for
		// ever, and its consumer would never be told the batch ended.
		// (No pump() from here: `begin` is only ever called from `pump`'s own loop,
		// which continues on its own — calling it back would recurse per entry.)
		entry.status	= 'error'
		entry.error		= 'No file to upload'
		self.wanted_ids.delete(entry.id)
		self.fire('on_change', entry)
		self.publish_progress()
		self.check_queue_complete()
		return
	}

	self.wanted_ids.delete(entry.id)
	self.uploading_ids.add(entry.id)
	self.was_active	= true
	entry.status	= 'uploading'
	entry.progress	= 0
	entry.error		= null
	self.fire('on_change', entry)

	const transfer = create_transfer({
		file			: file,
		name			: entry.name, // the collision-free name, which is what gets staged
		key_dir			: self.key_dir,
		tipo			: self.tipo,
		chunk_size_mb	: self.chunk_size_mb,
		pool			: self.pool, // SHARED: bounds the TOTAL sockets, not the per-file ones
		callbacks		: {
			on_progress : function(progress) {
				// Guard against a late event from a transfer whose entry was
				// already removed: repainting a dropped row is harmless, but
				// counting its bytes into the aggregate is not.
				if (self.uploading_ids.has(entry.id)) {
					entry.progress = progress.percent
					self.fire('on_change', entry)
					self.publish_progress()
				}
			}
		}
	})
	transfer_of_entry.set(entry, transfer)
	// Kept past settlement — see the WeakMap's own note: the cancel-and-sweep of
	// `.up_<upload_id>/` runs after the abort has already settled.
	if (typeof transfer.upload_id === 'function') {
		upload_id_of_entry.set(entry, transfer.upload_id())
	}

	// The PROMISE is the single terminal handler, not on_done/on_error: it is the
	// one thing upload_transport guarantees settles EXACTLY ONCE on every path
	// (its settlement law), so the queue cannot double-count a completion.
	transfer.start().then(function(api_response){
		self.finish(entry, transfer, api_response)
	})
}//end begin



/**
* FINISH
* Applies a transfer's terminal outcome to its entry and re-pumps. Internal.
*
* @param {Object} entry
* @param {Object} transfer
* @param {Object} api_response
* @returns {void}
*/
upload_queue.prototype.finish = function(entry, transfer, api_response) {

	const self = this

	self.uploading_ids.delete(entry.id)
	transfer_of_entry.delete(entry)

	// A removed entry's outcome is nobody's business any more — but its SLOT is.
	// (!) `pump()` IS MANDATORY HERE. This branch releases `max_parallel_files`
	// capacity; skipping the re-pump left every remaining `pending` row waiting on
	// a slot that had already been freed, for ever, while the UI showed them
	// queued. Removing the uploading rows of a batch (the curator drops one bad
	// scan out of forty) is exactly how a user reaches it, and the abort settles
	// on a microtask so this branch ALWAYS wins the race with `remove`.
	if (self.entries.indexOf(entry) === -1) {
		self.pump()
		self.check_queue_complete()
		return
	}

	if (api_response && !request_failed(api_response) && response_data(api_response) === true) {
		entry.status	= 'done'
		entry.progress	= 100
		entry.error		= null
		// Merge the server's file_data. The STAGED IDENTITY is decided
		// server-side (`stagedTmpName` replaces anything outside [A-Za-z0-9_.-]
		// with '_'), so an importer that looked the file up under the client name
		// missed every file with a space, an accent or a parenthesis. Without
		// this merge the upload succeeds and the import then fails.
		const file_data = api_response.file_data
		if (file_data) {
			entry.tmp_name		= file_data.tmp_name || entry.tmp_name
			entry.key_dir		= file_data.key_dir || entry.key_dir
			entry.extension		= file_data.extension || entry.extension
			// `url` is the "already on the server" marker a consumer unlocks
			// IMPORT on. The upload response does not currently carry one, so it
			// is taken only when present — fabricating a URL here would be a wire
			// guess, and a wrong one 404s in an <img>.
			if (file_data.url) {
				entry.url = file_data.url
			}
			if (file_data.thumbnail_url) {
				entry.thumbnail_url = file_data.thumbnail_url
			}
		}
	} else if (transfer.status() === 'aborted') {
		// The user cancelled. Not an error: an error row invites a retry the user
		// explicitly declined.
		entry.status	= 'canceled'
		entry.error		= null
	} else {
		entry.status	= 'error'
		entry.error		= error_text_from(api_response)
	}

	self.fire('on_change', entry)
	self.publish_progress()
	self.pump()
	self.check_queue_complete()
}//end finish



/**
* CHECK_QUEUE_COMPLETE
* Fires `on_queue_complete` when the queue holds nothing that can still run.
*
* THREE conditions, all necessary:
*   - `was_active`: a queue that never ran cannot complete (removing a single
*     pending row would otherwise announce a batch that never started);
*   - nothing `uploading` and nothing `wanted`: no slot is held and no intent is
*     outstanding;
*   - (!) NO `pending` ENTRY REMAINS. Without this the event fired with rows
*     still showing "queued": a file added WHILE the batch ran is pending but not
*     yet wanted, so the last completion announced a drained queue over a row
*     that had not been sent. A consumer that acts on completion (unlock IMPORT,
*     close the panel) acted on an incomplete set.
*     The corollary is deliberate: after a `cancel()` that leaves rows in
*     `pending`, nothing completed and nothing is announced. The progress bar is
*     driven by `on_progress`, not by this event.
*
* @returns {void}
*/
upload_queue.prototype.check_queue_complete = function() {

	const self = this

	if (!self.was_active || self.uploading_ids.size > 0 || self.wanted_ids.size > 0) {
		return
	}
	for (let i = 0; i < self.entries.length; i++) {
		if (self.entries[i].status === 'pending') {
			return
		}
	}

	self.was_active = false
	self.fire('on_queue_complete')
}//end check_queue_complete



/**
* CANCEL
* Aborts in-flight uploads and withdraws the intent to start.
*
* @param {string} [entry_id] - Omit to cancel every `uploading` entry AND drop
*   every pending intent. (Cancelling only the in-flight ones would let the
*   scheduler immediately admit the next pending file — the opposite of what a
*   user pressing "cancel" asked for.)
* @returns {void}
*/
upload_queue.prototype.cancel = function(entry_id) {

	const self = this

	// sweep:true — a cancel is a USER GESTURE, and the parts it strands are not
	// resumable (a retry mints a fresh upload_id). See abort_transfers.
	self.abort_transfers(entry_id, true)
}//end cancel



/**
* ABORT_TRANSFERS
* The one abort path. Internal — `cancel()` and `destroy()` are the API.
*
* @param {string|null} [entry_id] - Omit/null for every uploading entry.
* @param {boolean} sweep - Ask the server to drop the staged parts of every
*   transfer aborted here.
*   (!) TRUE FOR A USER CANCEL, FALSE FOR TEARDOWN. `upload_transport.abort()`
*   deliberately does NOT sweep (it would have to know a second API action and
*   own a retention policy); this layer does, because it has `upload_id()`,
*   the key_dir and a UI to report into. Without it a cancelled multi-GB ingest
*   left its chunks on disk until the 24 h orphan GC. `destroy()` passes false:
*   teardown runs on navigation/unload, where a burst of fire-and-forget requests
*   would not be delivered anyway and the age sweep is the right collector.
* @returns {void}
*/
upload_queue.prototype.abort_transfers = function(entry_id, sweep) {

	const self = this

	if (typeof entry_id !== 'undefined' && entry_id !== null) {
		self.wanted_ids.delete(entry_id)
		const entry = self.get(entry_id)
		if (!entry) {
			return
		}
		const transfer = transfer_of_entry.get(entry)
		if (transfer) {
			transfer.abort() // → finish() via the settled promise
			if (sweep) {
				self.sweep_parts(entry)
			}
			return
		}
		// (!) A `pending` row has no transfer to abort. Withdrawing the intent
		// silently left it showing "queued" for ever with no way back except a
		// remove — the cancel button read as a dead control. Cancelling a row the
		// user can see is a terminal, retryable outcome, exactly like cancelling an
		// in-flight one.
		if (entry.status === 'pending') {
			entry.status	= 'canceled'
			entry.progress	= 0
			entry.error		= null
			self.fire('on_change', entry)
			self.publish_progress()
			self.pump()
			self.check_queue_complete()
		}
		return
	}

	self.wanted_ids.clear()
	// Copy first: abort() settles synchronously, and finish() mutates entries.
	const uploading = self.entries.filter(function(entry){
		return entry.status === 'uploading'
	})
	for (let i = 0; i < uploading.length; i++) {
		const transfer = transfer_of_entry.get(uploading[i])
		if (transfer) {
			transfer.abort()
			if (sweep) {
				self.sweep_parts(uploading[i])
			}
		}
	}
	self.check_queue_complete()
}//end abort_transfers



/**
* SWEEP_PARTS
* Asks the server to drop the staged parts of a transfer that will never
* complete. Internal, FIRE AND FORGET: the row's fate does not depend on it.
*
* Does nothing for an entry that never started a transfer — there is nothing on
* the server to sweep, and a delete for a file that was never uploaded is noise.
*
* @param {Object} entry
* @returns {void}
*/
upload_queue.prototype.sweep_parts = function(entry) {

	const self = this

	if (!upload_id_of_entry.has(entry)) {
		return
	}

	// Not awaited (cancel is synchronous by contract) and never rethrown:
	// delete_remote_file already swallows and logs every failure.
	self.delete_remote_file(entry)
}//end sweep_parts



/**
* REMOVE
* Drops one entry from the queue, optionally deleting its staged bytes.
*
* @param {string} entry_id
* @param {Object} [options]
*   @param {boolean} [options.delete_remote=false] - Also call
*     `dd_utils_api::delete_uploaded_file` — for a `done`/`staged` entry (whose
*     bytes are a complete staged file) AND for any entry that started a transfer
*     (whose bytes are chunk parts under `.up_<upload_id>/`).
* @returns {Promise<boolean>} true when the entry was removed (the remote delete
*   is awaited but never turns a removal into a failure).
*/
upload_queue.prototype.remove = async function(entry_id, options) {

	const self = this

	const config		= options || {}
	const delete_remote	= config.delete_remote === true

	const index = self.entries.findIndex(function(entry){
		return entry.id === entry_id
	})
	if (index === -1) {
		return false
	}
	const entry = self.entries[index]

	// Stop anything in flight FIRST: a chunk that lands after the row is gone
	// writes a staging blob that only the join deletes, and the join will never
	// run for a removed entry.
		const transfer = transfer_of_entry.get(entry)
		if (transfer) {
			transfer.abort()
		}
		// (!) READ BEFORE THE SPLICE. An in-flight row owns chunk parts and no
		// staged file, so its status alone ('uploading') would decide "nothing to
		// delete" — which is how a cancelled multi-GB ingest used to park its bytes
		// for 24 h with the server's explicit-cancel path wired but unreachable.
		const had_transfer = upload_id_of_entry.has(entry)
		transfer_of_entry.delete(entry)
		self.uploading_ids.delete(entry.id)
		self.wanted_ids.delete(entry.id)

	// splice IN PLACE — the array identity belongs to the caller.
		self.entries.splice(index, 1)
		self.forget_name(entry.name)
		self.fire('on_remove', entry)
		self.publish_progress()
		// The removal freed a slot AND may have been the last thing outstanding.
		self.pump()
		self.check_queue_complete()

	if (delete_remote && (entry.status === 'done' || entry.status === 'staged' || had_transfer)) {
		await self.delete_remote_file(entry)
	}
	upload_id_of_entry.delete(entry)


	return true
}//end remove



/**
* DELETE_REMOTE_FILE
* Removes the staged bytes of an entry from the server. Internal.
*
* (!) Deleting an ABSENT file is a SUCCESSFUL NO-OP by contract (WC-078): the row
* is already gone from the UI and a retry or a double-fire must not surface an
* error the user cannot act on. Only a genuine refusal is logged, and even that
* never propagates — the entry is out of the queue either way.
*
* @param {Object} entry
* @returns {Promise<void>}
*/
upload_queue.prototype.delete_remote_file = async function(entry) {

	const self = this

	// The name ON DISK, which is the sanitised one the server reported — not the
	// client-side display name.
	const file_name = entry.tmp_name || entry.name

	// rqo
		const rqo = {
			dd_api	: 'dd_utils_api',
			action	: 'delete_uploaded_file',
			options	: {
				key_dir		: entry.key_dir || self.key_dir,
				file_name	: file_name
			}
		}
		// (!) `upload_id` — the EXPLICIT CANCEL. An entry that never finished has no
		// staged file at all; its bytes are parts under `.up_<upload_id>/`, and the
		// handler drops them only when the client names the id (it is optional on
		// the wire: absent, the 24 h age sweep collects them instead). This is the
		// client half of a server path that was wired and unreachable.
		const upload_id = upload_id_of_entry.get(entry)
		if (upload_id) {
			rqo.options.upload_id = upload_id
		}
		if (self.source) {
			rqo.source = self.source
		}

	try {
		const response = await data_manager.request({
			body : rqo
		})
		if (request_failed(response)) {
			console.error('upload_queue delete_uploaded_file refused:', response.error)
		}
	} catch (error) {
		console.error('upload_queue delete_uploaded_file failed:', error)
	}
}//end delete_remote_file



/**
* CLEAR
* Empties the queue.
*
* (!) `splice(0, length)` — NOT `self.entries = []`. The array IS the caller's
* `files_data`, created once and held forever; replacing it leaves every consumer
* holding a detached array and an import silently sends nothing.
*
* @returns {void}
*/
upload_queue.prototype.clear = function() {

	const self = this

	self.cancel()

	const removed = self.entries.splice(0, self.entries.length)
	for (let i = 0; i < removed.length; i++) {
		transfer_of_entry.delete(removed[i])
		upload_id_of_entry.delete(removed[i])
		self.fire('on_remove', removed[i])
	}
	self.name_keys.clear()
	self.name_cursors.clear()

	self.publish_progress()
	self.check_queue_complete()
}//end clear



/**
* GET
* @param {string} entry_id
* @returns {Object|null}
*/
upload_queue.prototype.get = function(entry_id) {

	const self = this

	for (let i = 0; i < self.entries.length; i++) {
		if (self.entries[i].id === entry_id) {
			return self.entries[i]
		}
	}

	return null
}//end get



/**
* IMPORTABLE_ENTRIES
* The subset of the queue an importer may act on.
*
* (!) THE ONE ANSWER TO "which rows can be imported". A row is importable when it
* is `done` or `staged` AND carries a `tmp_name` — the SERVER-ASSIGNED staged
* identity. Nothing else qualifies: `pending`/`uploading` bytes are not (all)
* there, `invalid`/`error`/`canceled` never landed, and a `done` row without a
* `tmp_name` cannot be located on disk at all (the server rewrites anything
* outside [A-Za-z0-9_.-] and disambiguates collisions, so the display name is NOT
* the name on disk and re-deriving it imports whichever file sorts first).
* Consumers that project `files_data` by hand must project THIS, or a row the
* user can see but the server cannot resolve reaches the importer.
*
* @returns {Array<Object>} A new array; the queue's own is never handed out.
*/
upload_queue.prototype.importable_entries = function() {

	const self = this

	return self.entries.filter(function(entry){
		return (entry.status === 'done' || entry.status === 'staged')
			&& typeof entry.tmp_name === 'string'
			&& entry.tmp_name !== ''
	})
}//end importable_entries



/**
* GET_PROGRESS
* Aggregate progress across the queue.
*
* THE DENOMINATOR IS EVERY BYTE THIS SESSION UNDERTOOK TO SEND:
* `pending | uploading | done | error | canceled`.
*
* (!) A `done` entry contributes its full size to BOTH sides. That is what stops
* the bar from jumping BACKWARDS when a second batch starts: Dropzone excluded
* finished files from `totalBytes` (which is why
* `render_edit_service_dropzone.js:895` had to add them back by hand in every
* `totaluploadprogress` tick).
*
* (!) An `error` or `canceled` entry contributes its full size to the DENOMINATOR
* and ZERO to the numerator. Dropping it from both sides — what this did until
* 2026-08-03 — made the bar read 100% while a scan had failed, which is the one
* thing a progress indicator must never do. Zero, not its partial `progress`,
* because those bytes are not deliverable: a retry mints a new upload_id and
* re-sends from the start, and the stranded parts are swept. The cost is stated:
* `bytes_sent` is monotonic across a run that does not fail, and DROPS at the
* moment a running transfer is cancelled — an honest fall, not a regression.
*
* `staged` and `invalid` are excluded from both sides entirely — staged bytes
* were never sent by this session, and an invalid file will never be sent at all;
* counting either one puts a permanent ceiling under 100%.
*
* @returns {Object} `{bytes_total, bytes_sent, percent}`.
*/
upload_queue.prototype.get_progress = function() {

	const self = this

	let bytes_total	= 0
	let bytes_sent	= 0

	for (let i = 0; i < self.entries.length; i++) {
		const entry = self.entries[i]
		const size	= entry.size || 0
		if (entry.status === 'done') {
			bytes_total	+= size
			bytes_sent	+= size
			continue
		}
		if (entry.status === 'uploading') {
			bytes_total	+= size
			bytes_sent	+= size * ((entry.progress || 0) / 100)
			continue
		}
		if (entry.status === 'pending' || entry.status === 'error' || entry.status === 'canceled') {
			bytes_total += size
			continue
		}
		// staged / invalid: excluded from both sides.
	}

	const percent = bytes_total > 0
		? Math.min(100, Math.round(bytes_sent / bytes_total * 100))
		: 0

	return {
		bytes_total	: bytes_total,
		bytes_sent	: Math.round(bytes_sent),
		percent		: percent
	}
}//end get_progress



/**
* PUBLISH_PROGRESS
* Pushes the aggregate to the caller. Internal.
*
* @returns {void}
*/
upload_queue.prototype.publish_progress = function() {

	const self = this

	self.fire('on_progress', self.get_progress())
}//end publish_progress



/**
* DESTROY
* Deterministic teardown: abort every transfer, drop every intent, release the
* side tables and stop answering. The entries array is left ALONE — it belongs to
* the caller, which may still be reading it while its own destroy runs.
*
* @returns {void}
*/
upload_queue.prototype.destroy = function() {

	const self = this

	// sweep:false — teardown, not a user gesture. See abort_transfers.
	self.abort_transfers(null, false)

	for (let i = 0; i < self.entries.length; i++) {
		const entry = self.entries[i]
		const transfer = transfer_of_entry.get(entry)
		if (transfer) {
			transfer.abort()
		}
		transfer_of_entry.delete(entry)
		upload_id_of_entry.delete(entry)
		// Release the File reference explicitly: a destroyed queue holding 40 RAW
		// scans keeps gigabytes alive for as long as the caller keeps files_data.
		file_of_entry.delete(entry)
	}

	self.wanted_ids.clear()
	self.uploading_ids.clear()
	self.name_keys.clear()
	self.name_cursors.clear()
	self.callbacks	= {}
	self.destroyed	= true
}//end destroy



// @license-end
