// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



/**
* SECTION_RECORD
*
* Represents a single data record within a section (one row in the result set).
* It acts as the bridge between the section's shared `datum` payload
* ({context, data} returned by the API) and the individual component or sub-section
* instances that must be rendered for that row.
*
* A `section_record` instance is always created by `get_section_records` in
* `core/section/js/section.js`, never standalone. The owning section passes a
* slice of the full `datum` together with the row's `section_id` and `section_tipo`
* so the record can locate its own data entries within `datum.data`.
*
* Lifecycle (same as all Dédalo UI elements):
*   get_section_records → get_instance → init → build (common) → render (list|edit)
*
* The rendered output is an HTML node produced by one of the render helpers
* imported from `render_list_section_record` or `render_edit_section_record`.
* The active view (default, mini, text) is selected from `self.context.view`.
*
* Main responsibilities:
*   - `get_ar_instances_edit`        — build child component instances for edit mode
*   - `get_ar_columns_instances_list` — build child instances aligned to grid columns (list/search/tm)
*   - `get_component_data`           — extract a single component's datum entry from the shared payload
*   - `get_component_info`           — retrieve the `ddinfo` synthetic entry for this record
*
* Prototype methods are mixed in from:
*   - `common`                       — build, destroy, render
*   - `render_list_section_record`   — list, search
*   - `render_edit_section_record`   — edit
*/



// imports
	import {common} from '../../common/js/common.js'
	import {clone} from '../../common/js/utils/index.js'
	import {get_instance} from '../../common/js/instances.js'
	import {render_list_section_record} from './render_list_section_record.js'
	import {render_edit_section_record} from './render_edit_section_record.js'



/**
* SECTION_RECORD
* Constructor — declares all instance properties used across the lifecycle.
* Every property is seeded to null/undefined here so that the shape is
* explicit and property-access patterns do not rely on duck typing.
*/
export const section_record = function() {

	/** @var {string|null} id - Stable instance identifier (assigned by get_instance) */
	this.id				= null

	// element properties declare
	/** @var {string|null} model - Class name of this element, always 'section_record' */
	this.model			= null
	/** @var {string|null} tipo - Ontology tipo of the owning component or section (e.g. 'oh1') */
	this.tipo			= null
	/** @var {string|null} section_tipo - Ontology tipo of the section this record belongs to */
	this.section_tipo	= null
	/** @var {string|number|null} section_id - Record identifier within the section (DB row id) */
	this.section_id		= null
	/** @var {string|null} mode - Render mode: 'edit', 'list', 'search', 'tm', etc. */
	this.mode			= null
	/** @var {string|null} lang - Active language tag, e.g. 'lg-eng' */
	this.lang			= null

	/**
	* @var {Object|null} datum - Shared API payload for the whole result page.
	*   Shape: { context: Array<Object>, data: Array<Object> }
	*   `context` holds per-component ontology descriptors (model, tipo, mode, etc.);
	*   `data` holds per-component value entries keyed by tipo+section_tipo+section_id+mode.
	*   This object is shared (not cloned) across all section_record siblings in the same page.
	*/
	this.datum			= null
	/** @var {Object|null} context - Resolved context for this record (from datum.context filtered to self.tipo) */
	this.context		= null
	/** @var {Object|null} data - Resolved data entry for this record (currently unused; data is accessed via get_component_data) */
	this.data			= null

	/** @var {number|null} paginated_key - Position of this record in the current pagination window (from locator.paginated_key) */
	this.paginated_key	= null
	/** @var {number|null} row_key - Index of this record within the current page's entries array (0-based) */
	this.row_key		= null

	/** @var {HTMLElement|null} node - The rendered DOM node; null until render() completes */
	this.node			= null

	/** @var {Array|null} events_tokens - Tokens for subscribed event_manager events; cleared on destroy */
	this.events_tokens	= null
	/** @var {Array|null} ar_instances - Built child component/section instances for this record */
	this.ar_instances	= null
	/** @var {Object|null} caller - The parent section (or portal) instance that owns this record */
	this.caller			= null

	/** @var {string|null} matrix_id - Time-machine matrix row identifier; null in normal (non-TM) mode */
	this.matrix_id		= null
	/** @var {string|null} id_variant - Suffix appended to the instance key for deduplication (propagated from parent) */
	this.id_variant		= null

	/** @var {string|null} column_id - Grid column id this record is associated with (list/search mode) */
	this.column_id		= null

	/** @var {number|null} offset - Pagination offset of the current page in the global result set */
	this.offset			= null
}//end section



/**
* COMMON FUNCTIONS
* Prototype methods mixed in from shared base classes and render helpers.
* `build` and `destroy` are inherited from `common` unchanged; the three render
* entry-points (list, search, edit) delegate to the dedicated render modules which
* further dispatch on `self.context.view` ('default', 'mini', 'text').
*
* Note that `search` is intentionally aliased to the same function as `list` because
* in Dédalo search mode is rendered with the same list layout — only the data
* retrieval and filter behaviour differs at the section level.
*/
// prototypes assign
	section_record.prototype.build		= common.prototype.build
	section_record.prototype.destroy	= common.prototype.destroy
	section_record.prototype.render		= common.prototype.render
	section_record.prototype.list		= render_list_section_record.prototype.list
	section_record.prototype.search		= render_list_section_record.prototype.list
	section_record.prototype.edit		= render_edit_section_record.prototype.edit



/**
* INIT
* Initialises the section_record instance from the options bag provided by
* `get_section_records` in `section.js`.
*
* This method diverges from `common.prototype.init` because `section_record`
* has a simpler property set than a full component: it does not carry its own
* `rqo`, `properties`, or `standalone` flag — all data access goes through
* the shared `datum` passed down from the owning section.
*
* Notable decisions made here:
*   - `fields_separator` defaults to ' + ' when absent from context; used by
*     view helpers to join multi-component concatenated display strings.
*   - `context.view` defaults to 'line' when absent (overridden per-render by
*     render helpers that fall back to 'default').
*   - `permissions` is inherited directly from `self.caller.permissions` so that
*     ACL rules set on the section propagate to every record without re-querying.
*   - `self.type` is set to `self.model` for compatibility with common helpers
*     (e.g. `create_source`) that read `self.type` to classify the instance.
*
* (!) The double-init guard (`this.is_init`) will fire `alert()` in SHOW_DEBUG
* mode — this is intentional for development and is a known pattern in common.js.
*
* @param {Object} options - Options provided by get_section_records / get_instance
* @param {string} options.model - Always 'section_record'
* @param {string} options.tipo - Ontology tipo of the owning section or component
* @param {string} options.section_tipo - Section ontology tipo (e.g. 'oh1')
* @param {string|number} options.section_id - Record row identifier
* @param {string} options.mode - Render mode ('edit', 'list', 'search', 'tm', etc.)
* @param {string} options.lang - Active language tag (e.g. 'lg-eng')
* @param {string|null} [options.id_variant] - Deduplication suffix for instance key
* @param {Object} options.context - Record-level context (view, request_config, fields_separator, etc.)
* @param {Object} options.datum - Shared datum payload { context: Array, data: Array }
* @param {number|null} [options.paginated_key] - Position in the pagination window
* @param {number|null} [options.row_key] - Index in current page entries array
* @param {Array} options.columns_map - Column layout descriptors built by get_columns_map
* @param {Object|null} [options.caller] - Owning section/portal instance
* @param {string|null} [options.matrix_id] - Time-machine matrix id (null in normal mode)
* @param {string|null} [options.column_id] - Grid column id (list mode)
* @param {number|null} [options.offset] - Pagination offset of the current page
* @param {Object} options.locator - Source locator { section_tipo, section_id, paginated_key, ... }
* @returns {Promise<Object|false>} self — the initialised section_record instance,
*   or false if the double-init guard fires (duplicated init detected)
*/
section_record.prototype.init = async function(options) {

	const self = this

	// safe init double control. To detect duplicated events cases
	// (!) alert() is intentional in SHOW_DEBUG mode — same guard exists in common.prototype.init
		if (typeof this.is_init!=='undefined') {
			console.error('Duplicated init for element:', this);
			if(SHOW_DEBUG===true) {
				alert('Duplicated init element');
			}
			return false
		}
		this.is_init = true

	// status update
		self.status = 'initializing'

	// options vars
		self.model						= options.model
		self.tipo						= options.tipo
		self.section_tipo				= options.section_tipo
		self.section_id					= options.section_id
		self.mode						= options.mode
		self.lang						= options.lang
		self.id_variant					= options.id_variant
		self.node						= null
		self.columns_map				= options.columns_map

		self.datum						= options.datum
		self.context					= options.context
		// fields_separator — used by view helpers to join multiple component values into one string display
		self.context.fields_separator	= self.context.fields_separator || ' + '
		// view — 'line' is the section_record default; individual render helpers fall back to 'default'
		self.context.view				= self.context.view || 'line'

		self.paginated_key				= options.paginated_key
		self.row_key					= options.row_key

		self.events_tokens				= []
		self.ar_instances				= []

		// self.type mirrors self.model to satisfy common helpers (e.g. create_source) that read type
		self.type						= self.model
		self.label						= null

		self.caller						= options.caller || null

		self.matrix_id					= options.matrix_id || null
		self.column_id					= options.column_id

		self.offset						= options.offset

		// locator — the raw locator object from datum.data.entries; carries section_tipo, section_id,
		// paginated_key, and optional tag_id for Translation Memory rows
		self.locator					= options.locator

	// permissions — inherited from caller (section/portal) to avoid re-querying ACL for each record
		self.permissions 				= self.caller.permissions

	// status update
		self.status = 'initialized'


	return self
}//end init



/**
* BUILD_INSTANCE
* Module-private factory that creates, initialises, and builds a single child
* component or sub-section instance from a context descriptor.
*
* This function is called in parallel by both `get_ar_instances_edit` and
* `get_ar_columns_instances_list`. It must not write to any shared state; each
* invocation is completely independent.
*
* Key decisions:
*   - The cloned context (`current_context`) has its `parent` forced to
*     `self.tipo` because the API can only include a component once in context,
*     so the server-supplied `parent` value may not be reliable.
*   - Mode: when `fixed_mode` is set on the context the mode is locked to what
*     the ontology definition specifies; otherwise the section_record's current
*     mode is used (the normal case).
*   - `id_variant` is derived from a stable string combining tipo, section_id,
*     and caller coords — this allows the DOM "move" optimisation in get_instance
*     to relocate rather than re-build already-rendered nodes.
*   - For `component_dataframe` instances, an additional uniqueness suffix is
*     appended that encodes the virtual sub-section row identity
*     (`section_tipo_key`, `id_key`/`section_id_key`, `main_component_tipo`).
*   - For `section` children, `session_save` is forced to `false` to prevent
*     a nested section from overwriting the top-level session position
*     (critical for thesaurus panels that embed their own section).
*   - `autoload` is passed through to `current_instance.build(autoload)` to let
*     the caller control whether the instance fires its own async data fetch.
*
* @param {Object} self - The owning section_record instance
* @param {Object} context - A single context descriptor from datum.context
* @param {string|number} section_id - Record row identifier for the new instance
* @param {Object|Array|null} current_data - Pre-resolved data for the new instance
* @param {string|null} column_id - Grid column id (null in edit mode)
* @param {boolean} autoload - Whether the new instance should trigger its own data load
* @returns {Promise<Object|undefined>} The built instance, or undefined if get_instance
*   fails or the instance has no `build` method (logged as a warning, not thrown)
*/
const build_instance = async (self, context, section_id, current_data, column_id, autoload) => {

	// current_context — clone so mutations below do not affect the shared datum.context entry
		const current_context = clone(context)

		// Fix context issues with parent value
		// (!) Note that the API prevents more than one same component in context.
		// For this, only the first one is added and therefore parent value it is not reliable. Use always self.caller.tipo as parent
			current_context.parent = self.tipo

	// mode
		// original fallback
		// When fixed_mode is true the ontology definition wins; otherwise the active section_record mode is used
			const mode = (current_context.fixed_mode===true)
				? current_context.mode
				: self.mode

	// component / section group instance_options
		const instance_options = {
			model			: current_context.model,
			tipo			: current_context.tipo,
			section_tipo	: current_context.section_tipo,
			section_id		: section_id,
			mode			: mode,
			lang			: current_context.lang,
			section_lang	: self.lang,        // lang of the owning section_record row
			parent			: current_context.parent,
			type			: current_context.type,
			standalone 		: false,            // always embedded; lifecycle driven by caller
			context			: current_context,
			data			: current_data,
			datum			: self.datum, // full datum from caller section or portal
			request_config	: current_context.request_config,
			columns_map		: current_context.columns_map,
			caller			: self
		}

		// section case. (!) Force session_save = false to prevent
		// overwrite the main section (thesaurus cases calling to self section as children, etc.)
			if (current_context.model==='section') {
				instance_options.session_save = false
			}

		// id_variant — Propagate a custom instance id to children
		// Stable string (no Math.random()) to allow get_instance to reuse/move already-rendered nodes
		// Format: <section_record.tipo>_<section_id>_<caller.section_tipo>_<caller.section_id>
			const section_record_id_variant = `${self.tipo}_${section_id}_${self.caller.section_tipo}_${self.caller.section_id}`
			instance_options.id_variant = self.id_variant
				? self.id_variant + '_' + section_record_id_variant
				: section_record_id_variant

		// matrix_id — time machine matrix_id; forwarded so TM children can address the correct matrix row
			if (self.matrix_id) {
				instance_options.matrix_id = self.matrix_id
			}

		// column_id — forwarded to child so the grid cell renderer knows which column it belongs to
			if(column_id) {
				instance_options.column_id = column_id
			}

		// dataframe — override id_variant to encode the virtual sub-section row identity
		// Format: <base_id_variant>_<section_tipo_key>_<id_key|section_id_key>_<main_component_tipo>
		// The dual-read (id_key ?? section_id_key) preserves backwards compatibility with the legacy field name
			instance_options.id_variant = (instance_options.model==='component_dataframe')
				? `${section_record_id_variant}_${current_data.section_tipo_key}_${current_data.id_key ?? current_data.section_id_key}_${current_data.main_component_tipo}`
				: instance_options.id_variant

	// component / section group — get_instance either creates a fresh instance or reuses/moves an existing one
		const current_instance = await get_instance(instance_options)
		if(!current_instance || typeof current_instance.build!=='function'){
			console.warn(`ERROR on build instance (ignored ${current_context.model}):`, current_instance);
			return
		}

	// build — await so callers using Promise.all can correctly serialise on the completed build
		await current_instance.build(autoload)


	return current_instance
}//end build_instance



/**
* GET_AR_INSTANCES_EDIT (USED IN EDIT MODE)
* Builds all child component instances needed to render this record in edit mode.
*
* For each context entry in `self.datum.context` that belongs to this section_record
* (matched by section_tipo, parent tipo, type 'component'|'grouper', and mode),
* a `build_instance` call is made. All calls are launched in parallel via
* Promise.all so the wall-clock time is bounded by the slowest single child.
*
* Differences from `get_ar_columns_instances_list`:
*   - Does NOT use `columns_map`; all components under `self.tipo` are included
*     regardless of column alignment.
*   - When the caller is a 'section' (not a portal), `component_dataframe` entries
*     are excluded from the context filter because their data and layout are managed
*     separately by the caller.
*   - Instances are stored in `self.ar_instances` (array, order matches context
*     filter output, not necessarily the DOM declaration order).
*   - Results are cached: a second call returns the existing array without rebuilding.
*
* Each child gets `autoload=false` because the data is already present in the shared
* `datum` payload — no additional API round-trip is needed.
*
* @see render_section.get_content_data — caller context from the section render flow
* @returns {Promise<Array<Object>>} self.ar_instances — array of built child instances
*/
section_record.prototype.get_ar_instances_edit = async function() {

	const self = this

	// already calculated case — idempotent: render can call this multiple times safely
		if (self.ar_instances && self.ar_instances.length>0) {
			return self.ar_instances
		}

	// sort vars
		const mode			= self.mode
		const section_tipo	= self.section_tipo
		const section_id	= self.section_id
		const tipo			= self.tipo

	// items — filter datum.context to those children that belong to this record
	// When caller is a plain 'section': exclude component_dataframe (handled by the section itself)
	// When caller is a portal or other model: include component_dataframe so it can render inline
		const items = (self.caller.model === 'section')
			? self.datum.context.filter(el =>
				el.section_tipo===section_tipo
				&& el.parent===tipo
				&& (el.type==='component' || el.type==='grouper')
				&& el.model!=='component_dataframe'
				&& el.mode===mode)
			: self.datum.context.filter(el =>
				el.section_tipo===section_tipo
				&& el.parent===tipo
				&& (el.type==='component' || el.type==='grouper')
				&& el.mode===mode)

	// instances — launch all build_instance calls concurrently
		const ar_promises	= []
		const items_length	= items.length
		for (let i = 0; i < items_length; i++) {

			// parallel mode — wrap in Promise so Promise.all can collect all results
			const current_promise = new Promise(function(resolve){

				const current_context = items[i]

				// For component_dataframe the section_id comes from the caller (the section that owns
				// the dataframe row), not from this record's own section_id
				const current_data = self.get_component_data({
					ddo				: current_context,
					section_tipo	: current_context.section_tipo,
					section_id		: (current_context.model==='component_dataframe')
						? self.caller.section_id
						: self.section_id
				})

				// build_instance
				build_instance(
					self,
					current_context,
					section_id,
					current_data,
					null, // column_id — null in edit mode; column alignment is not needed
					false // autoload — data already in datum, no additional fetch needed
				)
				.then(function(current_instance){
					resolve(current_instance)
				})
				.catch((errorMsg) => {
					console.error('build_instance error: ', errorMsg);
				})
			})
			ar_promises.push(current_promise)
		}//end for (let i = 0; i < items_length; i++)

	// instances — await all parallel builds, then store results
		await Promise.all(ar_promises)
		.then(function(ar_instances){
			// set self.ar_instances
			self.ar_instances = ar_instances
		})


	return self.ar_instances
}//end get_ar_instances_edit



/**
* GET_AR_COLUMNS_INSTANCES_LIST
* Builds the ordered set of child instances that fill the grid columns for
* this record in list, search, and time-machine modes.
*
* Unlike `get_ar_instances_edit`, this method must align each component instance
* to a specific grid column (`column_id`) so that the rendered cells appear in the
* correct visual column even when different request_configs (e.g. Dédalo + Zenon)
* contribute overlapping ddo_map entries.
*
* Algorithm (triple nested loop):
*   1. Outer loop — iterates `columns_map` (the ordered column descriptors built by
*      `common.get_columns_map`).
*   2. Middle loop — iterates `request_config` items (one per data source: Dédalo,
*      Zenon, etc.). Selects the appropriate `ddo_map` based on mode ('search' uses
*      the search ddo_map when available, falling back to show).
*   3. Inner loop — walks the first-level ddo children of `self.tipo` to find the
*      ddo whose `column_id` matches the current column. A deduplication guard
*      (`ar_column_ddo`) prevents the same ddo tipo appearing twice.
*
* When a matching ddo is found the method:
*   a. Resolves `section_tipo` and `section_id` — for component_dataframe the
*      section coordinates come from the ddo, not from self.section_tipo/section_id.
*   b. Calls `get_component_data` to extract the pre-loaded value from datum.data.
*   c. Normalises the ddo context entry (`new_context`) by propagating override
*      properties from the ddo itself (fixed_mode, mode, view, children_view,
*      fields_separator, records_separator, hover, with_value).
*   d. Calls `build_instance` sequentially (await inside loop, not parallel) to
*      preserve `columns_map` order in `self.ar_instances`.
*
* Context-not-found is a non-fatal condition: it occurs when a column is defined
* in the ontology but the server did not include its sub-context because there is no
* data for it (e.g. a Zenon column in a bibliography record that has no Zenon entry).
* These cases are silently skipped; commented debug logging is left in place for
* development use (see SHOW_DEBUG block).
*
* Concurrency guard — `_instances_waiter`:
*   If two callers invoke this method before the first has resolved (e.g. a rapid
*   re-render), the second caller receives the same Promise that the first is
*   already awaiting. After the inner async IIFE completes it resets
*   `_instances_waiter` to null so subsequent calls that arrive after completion
*   fall through to the already-populated `self.ar_instances` early-exit.
*
* Special case — `dd_grid`:
*   When the ddo model is 'dd_grid' the component expects its data as a single-item
*   array `[current_data.entries]` rather than the raw data object. This wrapping
*   is applied just before the `build_instance` call.
*
* @see common.get_columns_map — where columns_map is built from ddo_map + ontology
* @returns {Promise<Array<Object>>} self.ar_instances — ordered built child instances
*   Example:
*   [
*     {model: "component_input_text", tipo: "dd374", ...},   // column 0
*     {model: "component_select", tipo: "dd375", ...}        // column 1
*   ]
*/
section_record.prototype.get_ar_columns_instances_list = async function() {

	const self = this

	// waiter — prevent concurrent calls from populating ar_instances twice
	// (!) If a second caller arrives while the first Promise is still pending,
	// it will receive the same Promise, ensuring only one build pass runs
		if (self._instances_waiter) {
			return self._instances_waiter
		}

	// already calculated case — idempotent once ar_instances is populated
		if (self.ar_instances && self.ar_instances.length>0) {
			return self.ar_instances
		}

	self._instances_waiter = (async () => {
		// nested check to prevent race after waiter release
		// (a concurrent caller may have finished just before this IIFE starts)
		if (self.ar_instances && self.ar_instances.length>0) {
			self._instances_waiter = null
			return self.ar_instances
		}

		// matrix_id — time machine case only; passed down to get_component_data for TM row matching
			const matrix_id	= self.matrix_id

		// columns_map — ordered column descriptors, built by common.get_columns_map during section build
		// @see common.get_columns_map for a full overview of how columns are derived from ddo_map
			const columns_map = self.columns_map || []

		// request_config — array of data-source configurations; typically one item for Dédalo data
		// but may contain additional items for external sources (e.g. Zenon bibliographic data)
			const request_config		= self.context.request_config || []
			const request_config_length	= request_config.length

		// instances — triple-nested loop: column → request_config → ddo
		// This sequential structure preserves the exact column order in self.ar_instances
			const columns_map_length = columns_map.length
			for (let i = 0; i < columns_map_length; i++) {

				const current_column = columns_map[i]

				// ar_column_ddo — deduplication tracker so the same tipo is not instantiated twice
				// across multiple request_config items (e.g. Dédalo + Zenon sharing a tipo)
				const ar_column_ddo = []
				for (let j = 0; j < request_config_length; j++) {

					const request_config_item = request_config[j]

					// ddo_map — in search mode, prefer the search-specific ddo_map when defined;
					// fall back to show.ddo_map when the search map is missing or empty
					const ddo_map = (self.mode === 'search')
						? (
							request_config_item.search && request_config_item.search.ddo_map && request_config_item.search.ddo_map.length > 0
								? request_config_item.search.ddo_map
								: request_config_item.show.ddo_map
						)
						: request_config_item.show.ddo_map

					// ar_first_level_ddo — only the direct children of self.tipo in this ddo_map
					// (avoids descending into grandchildren which are handled by the child instances)
					const ar_first_level_ddo = ddo_map.filter(item => item.parent === self.tipo)

					// with every child, match it with the column and assign to it
					const ar_first_level_ddo_len = ar_first_level_ddo.length
					for (let k = 0; k < ar_first_level_ddo_len; k++) {

						const current_ddo = ar_first_level_ddo[k]

						// column_id match — every component ddo carries a column_id assigned by get_columns_map
						// @see common.js get_columns() method for where column_id is set
						if(current_ddo.column_id && current_ddo.column_id===current_column.id){

							// deduplication guard — skip if this tipo was already added via another request_config item
								const found = ar_column_ddo.find(item => item.tipo === current_ddo.tipo)
								if(found) {
									continue
								}

							// mark this ddo as handled for this column pass
								ar_column_ddo.push(current_ddo)

								// NOTE: about component_dataframe section coordinates:
								// By default section_tipo will be the section_tipo of the locator
								// but when ddo is a component_dataframe (subsection used as data_frame)
								// the section_tipo needs to be the section_tipo of the ddo itself
								// (it has no real record in the DB; it is entirely dependent on the caller locator section_id)
								// This is NOT the multi-section_tipo scenario (fr1, es1, etc.) where section_record
								// depends on the locator that conforms the section_record
								const section_tipo		= (current_ddo.model==='component_dataframe')
									? current_ddo.section_tipo
									: self.section_tipo
								const section_id		= (current_ddo.model==='component_dataframe')
									? self.caller.section_id
									: self.section_id

							// current_data — pre-loaded datum entry for this component; never triggers an API call
								const current_data = self.get_component_data({
									ddo				: current_ddo,
									section_tipo	: section_tipo,
									section_id		: section_id,
									matrix_id		: matrix_id
								})

							// Normalise section_tipo as array to handle "virtual section" components
							// that are shared across multiple section types (toponymy: es1, fr1, etc.).
							// Single-section components are wrapped in a one-element array for uniform logic.
								const current_ddo_section_tipo = Array.isArray(current_ddo.section_tipo)
									? current_ddo.section_tipo
									: [current_ddo.section_tipo]

							// current_context — locate the datum.context entry for this ddo
							// When section_tipo is multi-valued, match only on tipo+mode (omit section_tipo)
							// because the same context descriptor covers all section_tipo values
								const current_context = current_ddo_section_tipo.length > 1
									? self.datum.context.find(el => el.tipo===current_ddo.tipo && el.mode===current_ddo.mode)
									: self.datum.context.find(el => el.tipo===current_ddo.tipo && el.mode===current_ddo.mode && el.section_tipo===current_ddo_section_tipo[0])

								// check is valid context
								// Missing context is non-fatal: it happens when a column is defined in the ontology
								// but the server did not populate sub-context because there is no data for it
								// (e.g. Zenon columns in a bibliography record with no Zenon entries).
								// Uncomment the debug block below (SHOW_DEBUG) to trace these cases during development.
									if (!current_context) {

										if(SHOW_DEBUG===true) {
											// Note that this message is not an error, but a warning when some columns
											// are defined and not used (like Zenon columns in Bibliography if no Zenon data is added)
											// Remember that subcontext is only calculated when subdata exists !
												// console.groupCollapsed(`+ [get_ar_columns_instances_list] Ignored context not found for model: ${current_ddo.model}, section_tipo: ${current_ddo.section_tipo}, tipo: ${current_ddo.tipo}`);
												// console.warn('Check your hierarchy definitions to make sure it is defined (Remember that subcontext is only calculated when subdata exists)', current_ddo.tipo);
												// console.log('ddo:', current_ddo);
												// console.log("self.datum.context:", self.datum.context);
												// console.log('current_data:', current_data);
												// console.log("self:", self);
												// console.groupEnd()
										}

										// ignore unused context
										continue;
									}

							// new_context — clone to prevent mutations from polluting the shared datum.context
								const new_context = clone(current_context)
								new_context.properties = new_context.properties || {}
								// Propagate nested columns_map from the column descriptor (sub-grid layouts)
								new_context.columns_map = (current_column.columns_map)
									? current_column.columns_map
									: false
								// fixed_mode — when set by preferences, properties, or tools, lock the mode to the
								// ontology definition; prevents the section_record's active mode from overriding it
								if(current_ddo.fixed_mode){
									new_context.fixed_mode		= current_ddo.fixed_mode
									new_context.properties.mode	= current_ddo.fixed_mode
								}
								if(current_ddo.mode){
									new_context.mode			= current_ddo.mode
									new_context.properties.mode	= current_ddo.mode
								}
								// view — allow ddo to override the context view (e.g. mosaic for image portals
								// in a list column that otherwise would render as 'default')
								if(current_ddo.view){
									new_context.view			= current_ddo.view
									new_context.properties.view	= current_ddo.view
								}
								// children_view — forwarded to portal instances so their children
								// use the view specified in the ddo rather than their own default
								if(current_ddo.children_view){
									new_context.children_view = current_ddo.children_view
								}
								// fields_separator — string used to join multiple component values within a portal cell
								if(current_ddo.fields_separator){
									new_context.fields_separator = current_ddo.fields_separator
								}
								// records_separator — string used to join multiple rows within a portal cell
								if(current_ddo.records_separator){
									new_context.records_separator = current_ddo.records_separator
								}
								// hover — marks the instance to render only on mouse hover (information overlay
								// in mosaic views); the rendered node is hidden until the pointer enters
								if(current_ddo.hover){
									new_context.hover = current_ddo.hover
								}
								// with_value — conditional mode/view override: if the component has data
								// (`entries.length > 0`) use the with_value definition; otherwise keep defaults.
								// Enables "show an edit field only when data exists" patterns in list mode.
								if(current_ddo.with_value){
									new_context.properties.with_value = current_ddo.with_value

									if(current_data.entries && current_data.entries.length > 0){
										new_context.view = current_ddo.with_value.view
										new_context.mode = current_ddo.with_value.mode
									}
								}

							// instance_data — dd_grid expects its data wrapped as [entries] (single-element
							// array wrapping the entries array) rather than the plain data object
								const instance_data = current_ddo.model==='dd_grid'
									? [current_data.entries]
									: current_data;

								const current_instance = await build_instance(
									self, // current section_record instance
									new_context, // cloned and patched context for the child
									section_id, // current section_id
									instance_data, // pre-resolved data (no API fetch needed)
									current_column.id, // column id for grid alignment
									false // autoload — data already in datum, no additional fetch
								)

								// add built instance; null/undefined means build failed — skip silently
								if (current_instance) {
									self.ar_instances.push(current_instance)
								}
						}//end if(current_ddo.column_id..
					}//end for (let k = 0; k < ar_first_level_ddo_len; k++)
				}//end for (let j = 0; j < request_config_length; j++)
			}//end for (let i = 0; i < columns_map_length; i++)

		// waiter — reset so post-completion calls fall through to the ar_instances early-exit
		self._instances_waiter = null
		return self.ar_instances
	})()


	return self._instances_waiter
}//end get_ar_columns_instances_list



/**
* GET_COMPONENT_DATA
* Locates a single component's data entry inside the shared `datum.data` array by
* matching on tipo, section_tipo, section_id, and mode.
*
* When no matching entry is found an empty stub is synthesised and returned instead
* of null/undefined. This guarantees that `build_instance` always receives a
* well-formed data object and never has to guard against missing data — components
* simply render with empty values.
*
* Dataframe pairing logic:
*   For `component_dataframe` (virtual sub-section rows) a standard tipo+section match
*   is insufficient because the same component_dataframe tipo can appear multiple times
*   in datum.data — once per virtual row. The additional discriminators are:
*     - `id_key` / `section_id_key` (dual-read for unified-contract / legacy compatibility)
*       paired against `options.ddo.caller_dataframe.id_key|section_id_key`
*     - `section_tipo_key` — optional; omitted when undefined to stay backward-compatible
*     - `main_component_tipo` — the tipo of the parent component that hosts the dataframe
*   These keys are sourced from `ddo.caller_dataframe` when the ddo carries one (built
*   by `common.create_source`), otherwise they fall back to `self.section_id`,
*   `self.section_tipo`, and `self.tipo`.
*
* The `matrix_id` (time machine) match path is commented out in the current code;
* the TM case is handled differently at a higher level.
*
* Empty stub shape (when no data found):
* ```json
* {
*   "tipo": "dd374",
*   "section_tipo": "oh1",
*   "section_id": 5,
*   "info": "No data found for this component",
*   "entries": [],
*   "fallback_value": [""]
* }
* ```
* For component_dataframe the stub additionally carries `id_key`, `section_id_key`,
* `section_tipo_key`, and `main_component_tipo` to satisfy dataframe pairing code
* downstream.
*
* @param {Object} options - Lookup options
* @param {Object} options.ddo - The DDO descriptor for the component being looked up
* @param {string} options.section_tipo - Section ontology tipo for the lookup
* @param {string|number} options.section_id - Record identifier for the lookup
* @param {string|null} [options.matrix_id] - Time-machine matrix id (currently unused in matching)
* @returns {Object} component_data — the matched datum.data entry, or an empty stub
*   if no match is found
*/
section_record.prototype.get_component_data = function(options) {

	const self = this

	// options
		const ddo			= options.ddo
		const section_tipo	= options.section_tipo
		const section_id	= options.section_id
		const matrix_id		= options.matrix_id || null

	// section_id_key — the row identifier used to pair a component_dataframe with its virtual row
	// Dual-read: id_key is the unified contract (see dedalo-data memory); section_id_key is legacy
		const section_id_key = (ddo.caller_dataframe)
			? ddo.caller_dataframe.id_key ?? ddo.caller_dataframe.section_id_key
			: self.section_id

	// section_tipo_key — the section_tipo of the virtual row's parent (discriminates dataframe rows across sections)
		const section_tipo_key = (ddo.caller_dataframe)
			? ddo.caller_dataframe.section_tipo_key
			: self.section_tipo

	// main_component_tipo — the tipo of the component that owns the dataframe; used as a row discriminator
		const main_component_tipo = (ddo.caller_dataframe)
			? ddo.caller_dataframe.main_component_tipo
			: self.tipo


	// no data elements case — section_group is a layout-only grouper with no data entry in datum.data
		if (ddo.model==='section_group') {
			return null;
		}

	// component_data — scan datum.data for the entry matching this component's identity tuple
		const component_data = self.datum.data.find(function(el) {

			if( el.tipo 					=== ddo.tipo // match tipo
				&& parseInt(el.section_id)	=== parseInt(section_id)  // match section_id
				&& el.section_tipo			=== section_tipo // match section_tipo
				&& el.mode					=== ddo.mode // match mode
				){

				// time machine case
				// (!) This block is deliberately commented out; TM matching is handled at a higher level.
				// Kept here for reference when revisiting TM + component_dataframe combination.
				// if (el.matrix_id && matrix_id) {

				// 	if (ddo.model==='component_dataframe') {

				// 		return (
				// 			parseInt(el.matrix_id)		=== parseInt(matrix_id)	&&
				// 			el.section_tipo_key			=== section_tipo_key &&
				// 			parseInt(el.section_id_key)	=== parseInt(section_id_key) &&
				// 			el.main_component_tipo		=== main_component_tipo
				// 		)
				// 	}

				// 	return parseInt(el.matrix_id)===parseInt(matrix_id)
				// }

				// dataframe case — additional discriminators are needed because the same component_dataframe
				// tipo can appear multiple times in datum.data (one per virtual row).
				// Example: portal numisdata3/1 has dataframe section numisdata_1016; its child components
				// are keyed by (row_section_id === caller section_id, row_section_tipo === caller section_tipo)
				// so each virtual row can be independently addressed.

				if (ddo.model==='component_dataframe') {

					// pairing key dual-read: id_key (unified contract) or section_id_key (legacy)
					const el_key = el.id_key ?? el.section_id_key
					return parseInt(el_key)===parseInt(section_id_key)
						&& (typeof el.section_tipo_key==='undefined' || el.section_tipo_key === section_tipo_key)
						&& el.main_component_tipo === main_component_tipo
				}

				return true
			}

			return false
		})

	// undefined case — synthesise an empty stub so build_instance always receives a valid data object
		if(!component_data) {

			// empty component data build — components render with empty values when no datum entry exists
			const empty_data = {
				tipo			: ddo.tipo,
				section_tipo	: section_tipo,
				section_id		: section_id,
				info			: 'No data found for this component',
				entries			: [],
				fallback_value	: ['']
			}

			if (ddo.model==='component_dataframe') {
				// Dataframe stubs must carry the pairing keys so downstream dataframe
				// render code can still determine which virtual row this stub represents
				empty_data.id_key				= section_id_key
				empty_data.section_id_key		= section_id_key
				empty_data.section_tipo_key		= section_tipo_key
				empty_data.main_component_tipo	= main_component_tipo

			}
			return empty_data
		}


	return component_data
}//end get_component_data



/**
* GET_COMPONENT_INFO
* Retrieves the synthetic `ddinfo` entry for this record from `datum.data`.
*
* `ddinfo` is a server-injected pseudo-component entry that carries supplementary
* metadata about the record (e.g. display label, parent path, section ancestors).
* It is used by list views that include a "value_with_parents" column defined in
* `get_columns_map`, and by grid cell renderers that need additional identifiers
* beyond the raw component value.
*
* The lookup matches on the fixed tipo string 'ddinfo' plus this record's
* `section_id` and `section_tipo` to address the exact record within the page.
*
* @returns {Object|undefined} component_info — the `ddinfo` datum entry for this
*   record, or undefined if the server did not include one
*/
section_record.prototype.get_component_info = function() {

	const self = this

	// find the ddinfo pseudo-component for this exact record (section_tipo + section_id)
	const component_info = self.datum.data.find(item => item.tipo==='ddinfo'
		&& item.section_id===self.section_id
		&& item.section_tipo===self.section_tipo
	)

	return component_info
}//end get_component_info



// @license-end
