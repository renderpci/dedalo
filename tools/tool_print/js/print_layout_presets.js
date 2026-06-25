// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals, SHOW_DEBUG */
/*eslint no-undef: "error"*/



/**
* PRINT_LAYOUT_PRESETS
*
* Persistence layer for tool_print layout templates. A "template" is an ordinary
* section record in dd25 (LAYOUTS_SECTION_TIPO) that holds a single component_json
* blob (dd625, LAYOUT_COMPONENT_JSON_TIPO) carrying the full v2 document-flow
* layout payload plus its metadata:
*   - name              {string}  human-readable template label
*   - target_section_tipo {string} scopes the template to one section type
*   - owner_user_id     {string}  stringified page_globals.user_id
*   - visibility        {string}  'user' (private) | 'public' (shared)
*   - pages / flow      {Object}  v2 document-flow layout data (rows of cells)
*
* Design choices:
*  - ALL metadata lives INSIDE the dd625 blob. dd25 records contain only dd625,
*    unlike the export-preset shape (dd1781) which uses separate dd624/dd642/
*    dd654/dd640/dd641 child components. This means filtering is done client-side
*    in query_layouts after reading all dd25 blobs in one bulk fetch.
*  - All writes use the generic core data API (action:'create'/'save'/'delete'),
*    which is already permission- and scope-checked server-side. No bespoke
*    tool_print API endpoint is needed.
*  - query_layouts increments query_counter (id_variant) on every call so the
*    instance cache always issues a fresh read — newly saved or deleted templates
*    appear immediately.
*
* Directly adapted from tools/tool_export/js/export_user_presets.js, which uses
* a richer dd1781 multi-component approach. Here the simpler single-blob model
* was chosen because dd25 only reliably persists dd625.
*
* Main exports consumed by render_tool_print.js:
*   query_layouts       – list available templates for the picker
*   load_layout         – retrieve a specific template blob by section_id
*   create_new_layout   – create a new dd25 record from a layout blob
*   save_layout         – overwrite the dd625 blob of an existing record
*   delete_layout       – delete a dd25 record
*   LAYOUTS_SECTION_TIPO – exported constant 'dd25' used by callers
*/

	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance} from '../../../core/common/js/instances.js'

	// monotonic counter → unique id_variant for fresh (uncached) layout-list reads
	let query_counter = 0



// ontology constants (single source of truth) ------------------------------

	// LAYOUTS_SECTION_TIPO. Section that stores the layout-template records.
	// Exported so callers (render_tool_print.js, canvas_tool_print.js) can
	// reference the section tipo without importing a magic string.
	export const LAYOUTS_SECTION_TIPO			= 'dd25'
	// LAYOUT_COMPONENT_JSON_TIPO. Where the layout blob is stored (component_json).
	// Not exported — all blob I/O is encapsulated within this module.
	const LAYOUT_COMPONENT_JSON_TIPO			= 'dd625'



/**
* GET_TARGET_SECTION_TIPO
* Normalizes the tool's target_section_tipo (which can be an array) to the
* scalar string used as the template scope. The scalar is stored inside the
* layout blob (as blob.target_section_tipo) and is matched during the
* client-side filter in query_layouts.
*
* tool_print.target_section_tipo can be either a string (single target) or an
* array (multi-target). When it is an array, only the first element is used as
* the scope key — the same convention as export_user_presets.js.
* @param {Object} self - The tool_print instance
* @returns {string} The scalar section tipo, e.g. 'dd75'
*/
const get_target_section_tipo = function(self) {
	return Array.isArray(self.target_section_tipo)
		? self.target_section_tipo[0]
		: self.target_section_tipo
}//end get_target_section_tipo



/**
* QUERY_LAYOUTS
* Lists all layout templates available for the current user and target section,
* returning a flat array suitable for populating the template picker UI.
*
* Strategy — N+1 → 1 bulk fetch:
*   dd25 has no dedicated name/owner/scope child components (unlike the export
*   preset section dd1781). The only stored component is dd625 (the blob), so
*   all metadata must be read from the blob itself. Rather than load each record
*   individually, this function issues one section list-mode fetch (up to 500
*   records) that includes the dd625 ddo in the show map, then extracts and
*   filters the blobs client-side in two passes:
*     Pass 1 — extract: build blob_by_id {section_id → blob} from datum.data,
*              unwrapping the {id, value} envelope if present.
*     Pass 2 — filter: keep only entries where blob.target_section_tipo matches
*              the tool's target AND (blob.visibility==='public' OR blob.owner_user_id
*              === current user_id).
*
* Fresh reads: id_variant is incremented via query_counter on every call so that
* the instance cache never reuses a stale list. session_save:false ensures no
* pagination state bleeds between calls.
*
* The section instance is destroyed after extraction to release memory; any
* destruction error is silently swallowed (the data is already captured).
*
* @param {Object} self - The tool_print instance (reads target_section_tipo)
* @returns {Promise<Array>} Array of { section_id: string, name: string } objects,
*   one per matching template, in the order returned by the server.
*/
export const query_layouts = async function(self) {

	const target	= get_target_section_tipo(self)
	const user_id	= '' + page_globals.user_id

	// fetch every dd25 record with its dd625 blob in a single section read.
	// limit:500 is a pragmatic cap — layout templates are lightweight records and
	// a single section type is unlikely to exceed this in practice.
		const section = await get_instance({
			model			: 'section',
			tipo			: LAYOUTS_SECTION_TIPO,
			section_tipo	: LAYOUTS_SECTION_TIPO,
			section_id		: null,
			mode			: 'list',
			lang			: page_globals.dedalo_data_nolan,
			request_config	: [{
				sqo			: { section_tipo:[{ tipo: LAYOUTS_SECTION_TIPO }], limit: 500, offset: 0 },
				api_engine	: 'dedalo',
				type		: 'main',
				show		: { ddo_map: [{ tipo: LAYOUT_COMPONENT_JSON_TIPO, section_tipo: LAYOUTS_SECTION_TIPO, parent: LAYOUTS_SECTION_TIPO }] }
			}],
			add_show		: true,
			// unique id_variant + session_save:false → always a FRESH fetch so
			// newly created/deleted templates appear immediately (no stale cache)
			id_variant		: 'print_layouts_' + (++query_counter),
			inspector		: false,
			filter			: false,
			session_save	: false
		})
		await section.build(true)

		const data = (section.datum && Array.isArray(section.datum.data)) ? section.datum.data : []

		try { section.destroy() } catch (e) { /* noop */ }

	// extract blobs from the datum (one item per dd625 record, each carrying
	// entries:[{id, value:<blob>}]). Group by section_id so we can iterate once.
	// The guard `el.tipo===LAYOUT_COMPONENT_JSON_TIPO && el.section_tipo===LAYOUTS_SECTION_TIPO`
	// defends against stray datum items if the ddo_map ever returns extras.
	// "first item wins": component_json is mono-value; if two entries exist for the
	// same section_id, the server shape is unexpected — we take the first and move on.
		const blob_by_id = {}
		for (let i = 0; i < data.length; i++) {
			const el = data[i]
			if (!el || el.tipo!==LAYOUT_COMPONENT_JSON_TIPO || el.section_tipo!==LAYOUTS_SECTION_TIPO) continue
			const sid = '' + el.section_id
			if (blob_by_id[sid]) continue // first item wins
			const entries = el.entries
			let blob = (entries && entries[0]) ? entries[0] : null
			// unwrap {id, value:<payload>} → payload (same logic as load_layout)
			if (blob && typeof blob==='object' && !Array.isArray(blob) && !('pages' in blob) && blob.value && typeof blob.value==='object') {
				blob = blob.value
			}
			if (blob && typeof blob==='object') blob_by_id[sid] = blob
		}

	// filter (target + owner/public) and build the picker list.
	// A blob without target_section_tipo passes the target check (legacy/manual
	// records that predate the metadata convention are treated as unscoped and
	// shown to everyone). The nullish-coalescing cast `?? ''` handles the case
	// where owner_user_id was stored as a number or is absent in old blobs.
		const list = []
		const ids = Object.keys(blob_by_id)
		for (let i = 0; i < ids.length; i++) {
			const id	= ids[i]
			const blob	= blob_by_id[id]
			if (!blob || typeof blob!=='object') continue
			if (blob.target_section_tipo && blob.target_section_tipo!==target) continue
			const is_public	= blob.visibility==='public'
			const is_owner	= ('' + (blob.owner_user_id ?? '')) === user_id
			if (!is_public && !is_owner) continue
			list.push({ section_id: id, name: blob.name || ('Template ' + id) })
		}


	return list
}//end query_layouts



/**
* LOAD_LAYOUT
* Retrieves the full layout blob for a specific saved template by loading the
* dd625 component_json instance directly (single-record read, edit mode).
*
* Blob envelope unwrapping: component_json entries are stored server-side as
* wrapper objects { id, value } where `value` holds the actual payload. This
* function unwraps that envelope when present. An already-unwrapped entry is
* detected by the presence of a 'pages' key at the top level (v2 blobs always
* carry layout.pages or layout.flow) and returned as-is for forward compatibility.
*
* The language-neutral key (page_globals.dedalo_data_nolan) is used because
* the layout blob is not language-specific — it references component tipos, not
* translated labels.
*
* @param {Object} options
* @param {string} options.section_id - The section_id of the dd25 template record to load
* @returns {Promise<Object|null>} The unwrapped layout blob, or null if entries is empty
*/
export const load_layout = async function(options) {

	// options
		const section_id = options.section_id

	// component_json (lg-nolan)
		const instance_options = {
			tipo			: LAYOUT_COMPONENT_JSON_TIPO,
			section_tipo	: LAYOUTS_SECTION_TIPO,
			section_id		: section_id,
			model			: 'component_json',
			mode			: 'edit',
			lang			: page_globals.dedalo_data_nolan
		}
		const component = await get_instance(instance_options)
		await component.build(true)
		const entries = component.data.entries

	// blob. component_json entries are stored as wrapper objects {id, value};
	// the layout payload lives under .value. Unwrap it but tolerate an
	// already-unwrapped entry (one carrying the payload directly).
		let layout = (entries && entries[0])
			? entries[0]
			: null
		if (
			layout && typeof layout==='object' && !Array.isArray(layout)
			&& !('pages' in layout)
			&& layout.value && typeof layout.value==='object'
		) {
			layout = layout.value
		}


	return layout
}//end load_layout



/**
* CREATE_NEW_LAYOUT
* Creates a new layout-template record in dd25 and immediately saves the layout
* blob (with its embedded metadata) to the dd625 child component.
*
* Flow:
*  1. Inject metadata fields into the layout object in place (name,
*     target_section_tipo, owner_user_id, visibility). The blob is the single
*     source of truth for these — no separate child components are used.
*  2. POST action:'create' to obtain a new section_id from the API.
*  3. get_instance dd625 for the new section_id, build it, then call
*     cmp.save([{action:'insert', id:null, value: layout}]) to write the blob.
*  4. Return the new section_id so the caller can immediately set it as the
*     active template (self.current_layout_section_id in render_tool_print.js).
*
* Visibility defaults to 'user' (private) if not already set on the blob.
* The caller passes the full current layout object; this function mutates it
* in place to add the metadata fields before saving.
*
* @param {Object} options
* @param {Object} options.self   - The tool_print instance
* @param {string} options.name   - Human-readable template name
* @param {Object} options.layout - The v2 document-flow layout blob to persist
* @returns {Promise<string|boolean>} The new section_id string, or false on API error
*/
export const create_new_layout = async function(options) {

	// options
		const self		= options.self
		const name		= options.name || 'Untitled'
		const layout	= options.layout || {}

	// all template metadata lives INSIDE the blob (dd25 only persists the
	// component_json dd625): name, target section, owner, visibility. The
	// picker reads + filters these client-side (see query_layouts).
	// owner_user_id is cast to string for consistent comparison in query_layouts
	// (page_globals.user_id can be a number).
		layout.name				= name
		layout.target_section_tipo	= get_target_section_tipo(self)
		layout.owner_user_id		= '' + page_globals.user_id
		layout.visibility			= layout.visibility || 'user'

	// create the section record. The API returns the new section_id as
	// api_response.result (a positive integer on success, 0 or falsy on failure).
		const rqo = {
			action	: 'create',
			source	: {
				section_tipo : LAYOUTS_SECTION_TIPO
			}
		}
		const api_response = await data_manager.request({
			body		: rqo,
			use_worker	: true
		})

		if (!api_response.result || api_response.result <= 0) {
			console.error('Error on create new print layout section. api_response:', api_response);
			return false
		}

		const new_section_id = api_response.result

	// save ONLY the layout blob (dd625) — it carries all metadata.
	// Unlike create_new_export_preset, there are no parallel component saves
	// because dd25 only stores dd625 (single blob, no separate name/owner fields).
		const cmp = await get_instance({
			tipo			: LAYOUT_COMPONENT_JSON_TIPO,
			model			: 'component_json',
			section_tipo	: LAYOUTS_SECTION_TIPO,
			section_id		: new_section_id,
			mode			: 'edit'
		})
		await cmp.build(true)
		await cmp.save([{ action:'insert', id:null, value: layout }])


	return new_section_id
}//end create_new_layout



/**
* SAVE_LAYOUT
* Overwrites the layout blob of an existing dd25 template record. Uses the
* 'set_data' changed_data action, which replaces the entire component_json
* entries array atomically. This prevents duplicate entries that would
* accumulate if 'insert' were used repeatedly on a single-value component.
*
* The value is wrapped in [ { value: layout } ] matching the component_json
* storage envelope that load_layout knows how to unwrap. The lang key is
* dedalo_data_nolan because layout blobs are language-neutral.
*
* (!) This function does NOT update the metadata fields (name, visibility, etc.)
* inside the blob — the caller is responsible for embedding the desired metadata
* before passing the layout object. See create_new_layout for how metadata is set.
*
* @param {Object} options
* @param {string} options.section_id - The section_id of the dd25 record to update
* @param {Object} options.layout     - The full layout blob to persist (with metadata)
* @returns {Promise<Object|boolean>} The raw API response object, or false on error
*/
export const save_layout = async function(options) {

	// options
		const section_id	= options.section_id
		const layout		= options.layout

	// verify
		if (!section_id) {
			console.error('save_layout: invalid section_id:', section_id);
			return false
		}

	// rqo. save (set_data replaces the entire entries array)
		const rqo = {
			action	: 'save',
			source	: {
				tipo			: LAYOUT_COMPONENT_JSON_TIPO,
				section_tipo	: LAYOUTS_SECTION_TIPO,
				section_id		: section_id,
				lang			: page_globals.dedalo_data_nolan,
				type			: 'component'
			},
			data	: {
				changed_data : [
					{
						action	: 'set_data',
						id		: null,
						value	: [ { value : layout } ]
					}
				]
			}
		}

	// API request
		const api_response = await data_manager.request({
			body		: rqo,
			use_worker	: true
		})

		if (!api_response.result) {
			console.error(`Error on save print layout (${section_id}). api_response:`, api_response);
			return false
		}

		if(SHOW_DEBUG===true) {
			console.log('Print layout saved!', api_response);
		}


	return api_response
}//end save_layout



/**
* DELETE_LAYOUT
* Deletes a dd25 layout-template record and its dd625 child data via the
* section model's delete_section method.
*
* Implementation: rather than a raw action:'delete' RQO (as in
* delete_user_export_preset), this function uses section.delete_section() with
* a filter_by_locators sqo and delete_mode:'delete_record'. This is the proven
* path that correctly invokes create_source and the delete_record sqo, matching
* the convention used across other section deletions in the codebase.
*
* delete_diffusion_records:false — layout templates are internal tool data and
* are never published to the diffusion layer, so no diffusion cleanup is needed.
*
* The section instance is destroyed after the delete call to free memory; any
* destruction error is silently swallowed since the record is already gone.
*
* @param {string} section_id - The section_id of the dd25 template record to delete
* @returns {Promise<Object|boolean>} The result from delete_section, or false when
*   section_id is falsy
*/
export const delete_layout = async function(section_id) {

	if (!section_id) {
		console.error('delete_layout: invalid section_id:', section_id);
		return false
	}

	// use the proven section.delete_section() (same path the export tool uses):
	// it builds the correct source via create_source and the delete_record sqo.
	// (!) lang uses dedalo_data_lang (current UI language) rather than
	// dedalo_data_nolan (language-neutral). For a delete operation the lang
	// argument has no effect on the outcome, but the inconsistency with the
	// other functions in this file is noted here for review.
	const section = await get_instance({
		model			: 'section',
		tipo			: LAYOUTS_SECTION_TIPO,
		section_tipo	: LAYOUTS_SECTION_TIPO,
		section_id		: section_id,
		mode			: 'list',
		lang			: page_globals.dedalo_data_lang,
		id_variant		: 'print_layout_delete_' + section_id,
		session_save	: false
	})
	await section.build(true)

	const ok = await section.delete_section({
		sqo	: {
			section_tipo		: [ LAYOUTS_SECTION_TIPO ],
			filter_by_locators	: [{ section_tipo: LAYOUTS_SECTION_TIPO, section_id: section_id }],
			limit				: 1
		},
		delete_mode					: 'delete_record',
		delete_diffusion_records	: false
	})

	try { section.destroy() } catch (e) { /* noop */ }


	return ok
}//end delete_layout



// @license-end
