// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DD_TIPOS */
/*eslint no-undef: "error"*/
// (!) Flag: SHOW_DEVELOPER is used at line 150 but is not declared in the /*global*/ directive above.
// It is a valid global (defined in core/common/js/environment.js.php and declared in common.js),
// but the missing declaration will trigger an eslint no-undef warning for this file.



/**
* TOOL_INDEXATION (module)
* Implements the indexation tool — a specialised Dédalo tool that lets editors mark
* arbitrary text fragments inside a transcript (component_text_area) with thesaurus
* tags and record fine-grained metadata about each tag.
*
* Architecture overview
* ---------------------
* The tool hosts three conceptually separate panels rendered side-by-side:
*
*   Left panel  — A viewer switcher (thesaurus area / people section / media component)
*                 that provides the term/person/media picker used to create new tags.
*
*   Right panel — The transcript text (component_text_area, `transcription_component`)
*                 where the editor selects text ranges. The text component emits two
*                 event_manager events that this tool subscribes to:
*                   • `click_no_tag_<id_base>` — user clicked outside any tag.
*                   • `click_tag_index_<id_base>` — user clicked an existing tag.
*                 Events are keyed by `id_base` (section_tipo_section_id_tipo) rather
*                 than `self.id` so that the subscription survives a lang-switch, which
*                 replaces the component instance but keeps the same id_base.
*
*   Info panel  — Displays the indexation locator list (component_relation_index /
*                 `indexing_component`) and an optional free-text note record
*                 (`tag_note`) when the editor selects a tag.
*
* Component roles (resolved from `tool_config.ddo_map`)
* ------------------------------------------------------
*   `transcription_component` — component_text_area holding the primary text.
*   `indexing_component`      — component_relation_index (component_portal) storing
*                               all index locators for the section.
*   `media_component`         — audio/video player (optional left-panel viewer).
*   `people_section`          — section instance for person lookup (optional left viewer).
*   `area_thesaurus`          — thesaurus navigator (default left-panel viewer).
*   `status_user_component`   — workflow-state control for regular users.
*   `status_admin_component`  — workflow-state control for administrators.
*   `references_component`    — optional component listing inverse references.
*
* Active-value reactive system
* ----------------------------
* `active_value(name, callback)` / `update_active_values(values)` form a lightweight
* pub-sub for UI widgets that must reflect the currently selected tag without
* coupling tightly to event_manager.  When the user clicks a tag the `fn_click_tag_index`
* handler calls `update_active_values([{name:'tag_id', value:...}, {name:'state', value:...}])`
* which fans out to every registered callback for those names (e.g. the tag-info panel).
*
* Prototype extension
* -------------------
* This constructor receives its `render`, `destroy`, and `refresh` implementations
* from `tool_common` / `common` and its `edit` render from `render_tool_indexation`.
* Tag-note methods are mixed in from `tag_note`.
*
* Exported symbols:
*   tool_indexation — constructor (use via tool_common.prototype.init lifecycle)
*/



// import
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common} from '../../../core/common/js/common.js'
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {tool_common, load_component} from '../../../core/tools_common/js/tool_common.js'
	import {render_tool_indexation} from './render_tool_indexation.js'
	import {tag_note} from './tag_note.js'



/**
* TOOL_INDEXATION
* Constructor for the indexation tool.
*
* Initialises every instance property to its default (usually null) so that
* downstream code (build, render, event handlers) can test them safely.
* Concrete values are populated during `init` and `build`.
*
* Instance properties
* -------------------
* @var {string|null}   id                     — Unique tool instance identifier (set by tool_common.init).
* @var {string|null}   model                  — Always 'tool_indexation'; mirrors tool registration name.
* @var {string|null}   mode                   — Render mode, typically 'edit'.
* @var {HTMLElement|null} node                — Root DOM node once the tool is rendered.
* @var {Array|null}    ar_instances           — Live component/section instances resolved from ddo_map.
* @var {string|null}   status                 — Tool lifecycle status (idle / loading / ready / error).
* @var {Array}         events_tokens          — Accumulates event_manager subscription tokens for
*                                              cleanup in destroy().
* @var {string|null}   type                   — Tool subtype hint (unused in this tool).
* @var {string|null}   source_lang            — Source language code when translating text.
* @var {string|null}   target_lang            — Target language code when translating text.
* @var {Array|null}    langs                  — All project default languages; populated from
*                                              `page_globals.dedalo_projects_default_langs` in init.
* @var {Object|null}   caller                 — The component/section instance that opened the tool
*                                              (component_text_area, optional).
* @var {Object|null}   transcription_component — Resolved component_text_area in which the editor
*                                              creates and selects index tags.
* @var {Object|null}   indexing_component     — Resolved component_relation_index (component_portal)
*                                              that persists the index locators for the current section.
* @var {Object|null}   related_sections_list  — API datum from `load_related_sections_list`; carries
*                                              the list of top_section_tipo / top_section_id pairs
*                                              used to populate the "approach" selector.
*
* Constants (ontology tipos for indexation note records)
* -------------------------------------------------------
* @var {string} DEDALO_INDEXATION_SECTION_TIPO    — Section tipo that hosts a tag note (rsc377).
* @var {string} DEDALO_INDEXATION_TITLE_TIPO      — component_input_text for the note title (rsc379).
* @var {string} DEDALO_INDEXATION_DESCRIPTION_TIPO — component_text_area for the note body (rsc380).
*
* @var {Object|undefined} title_instance — Last rendered title component instance for a tag note;
*                                          updated by render_note / render_empty_note in tag_note.js.
*
* @returns {boolean} true — constructor sentinel following Dédalo convention.
*/
export const tool_indexation = function () {

	this.id							= null
	this.model						= null
	this.mode						= null
	this.node						= null
	this.ar_instances				= null
	this.status						= null
	this.events_tokens				= []
	this.type						= null
	this.source_lang				= null
	this.target_lang				= null
	this.langs						= null
	this.caller						= null // component text area base optional
	this.transcription_component	= null // component text area where we are working into the tool
	this.indexing_component			= null // component_relation_index used to store indexation locators
	this.related_sections_list		= null // datum of related_sections_list (to obtain list of top_section_tipo/id)

	// indexation info notes
	this.DEDALO_INDEXATION_SECTION_TIPO		= 'rsc377'
	this.DEDALO_INDEXATION_TITLE_TIPO		= 'rsc379'
	this.DEDALO_INDEXATION_DESCRIPTION_TIPO	= 'rsc380'

	// tag notes vars
	this.title_instance

	return true
}//end tool_indexation



/**
* COMMON FUNCTIONS
* Prototype assignments that mix in shared behaviour from base classes and
* companion modules. No logic lives here — this block wires the delegation chain.
*
* Inherited from tool_common / common:
*   render  — generic tool wrapper renderer (delegates to this.edit).
*   destroy — unsubscribes events_tokens and removes the DOM node.
*   refresh — tears down and re-renders the tool in place.
*
* Inherited from render_tool_indexation:
*   edit    — full async render of the two-panel (thesaurus + transcript) layout.
*
* Inherited from tag_note (mixin):
*   render_indexation_note — parses a tag's stored locator and renders the note.
*   render_empty_note      — renders a "create note" button when a tag has no note.
*   render_note            — builds the title + description component nodes for a note.
*/
// prototypes assign
	tool_indexation.prototype.render					= tool_common.prototype.render
	tool_indexation.prototype.destroy					= common.prototype.destroy
	tool_indexation.prototype.refresh					= common.prototype.refresh
	tool_indexation.prototype.edit						= render_tool_indexation.prototype.edit
	// tag notes extend
	tool_indexation.prototype.render_indexation_note	= tag_note.prototype.render_indexation_note
	tool_indexation.prototype.render_empty_note			= tag_note.prototype.render_empty_note
	tool_indexation.prototype.render_note				= tag_note.prototype.render_note



/**
* INIT
* Custom tool initialiser.
*
* Calls `tool_common.prototype.init` first to seed all standard tool properties
* (`self.id`, `self.tool_config`, `self.ar_instances`, etc.), then performs
* indexation-specific setup:
*
*   1. Validates `self.tool_config` — aborts with false if missing.
*   2. Populates `self.langs` from `page_globals.dedalo_projects_default_langs`.
*   3. Builds `self.label_states` — the ordered array of tag state descriptors
*      ('n' = normal, 'd' = deleted, 'r' = to review) used to populate the state
*      selector and to manage CSS class names on the tag-info panel.
*   4. Derives `id_base` from the `transcription_component` ddo entry
*      (`section_tipo + '_' + section_id + '_' + tipo`).  This identifier is stable
*      across lang-switches so it is used as the event-subscription key rather than
*      `self.id` (see note below).
*   5. Subscribes to two event_manager channels:
*        • `click_no_tag_<id_base>` — resets `self.active_tag_id`, hides the
*          tag-info panel, and clears the indexation-note container.
*        • `click_tag_index_<id_base>` — receives `{tag: {tag_id, state, data}}`
*          from the text-area component when the editor clicks a tagged span.
*          Updates `self.active_tag_id`, fans out to `update_active_values` so the
*          tag-info panel refreshes, and renders (or re-renders) the indexation note.
*
* (!) The event channel key uses `id_base` (not `self.id`) on purpose.  When the
*     user switches the transcript language, a new component_text_area instance is
*     created with the same tipo/section_tipo/section_id but a different `self.id`.
*     Using id_base ensures the tool's subscriptions remain valid across that swap.
*
* @param {Object} options - Tool launch options.
*   Sample shape:
*   {
*     lang        : "lg-eng",
*     mode        : "edit",
*     model       : "tool_indexation",
*     section_id  : "1",
*     section_tipo: "rsc167",
*     tipo        : "rsc36",
*     tool_config : { section_id: "2", section_tipo: "dd1324", name: "tool_indexation",
*                     label: "Tool Indexation", icon: "…/icon.svg", ddo_map: […] }
*   }
* @returns {Promise<boolean>} Resolves to the return value of `tool_common.prototype.init`
*   (true on success, false on fatal configuration error).
*/
tool_indexation.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// self.tool_config check
		if (!self.tool_config) {
			self.error = "Invalid self.tool_config"
			console.warn(self.error, 'options:', options);
			return false
		}

	// set the self specific vars not defined by the generic init (in tool_common)
		self.langs = page_globals.dedalo_projects_default_langs

	// label_states
		self.label_states = [
			{
				label	: get_label.label_normal || 'Normal',
				value	: 'n'
			},
			{
				label	: get_label.label_deleted || 'Deleted',
				value	: 'd'
			},
			{
				label	: get_label.label_to_review || 'To review',
				value	: 'r'
			}
		]

	// id_base from transcription_component. Needed to set event subscriptions on init
		const transcription_component_ddo = self.tool_config.ddo_map.find(el => el.role==='transcription_component')
		if (!transcription_component_ddo) {
			self.error = "Invalid transcription_component_ddo:"
			console.warn(self.error, 'options:', options);
			return false
		}
		// id_base: stable identifier that survives a component lang-switch (section_tipo_section_id_tipo)
		const id_base = transcription_component_ddo.section_tipo +'_'+ transcription_component_ddo.section_id +'_'+ transcription_component_ddo.tipo

	// events
		// click_no_tag_
		// Fired by component_text_area when the editor clicks anywhere that is NOT inside a tag span.
		// Resets the tool's active-tag state and collapses the tag-info/note panel.
			const fn_click_no_tag = () => {
				// reset selection
					self.active_tag_id = null

				// tag_info_container . Hide
					if (!self.tag_info_container.classList.contains('hide')) {
						self.tag_info_container.classList.add('hide')
					}

				// indexation_note_container . Clean
					self.indexation_note.replaceChildren()
			}
			self.events_tokens.push(
				event_manager.subscribe('click_no_tag_' + id_base, fn_click_no_tag)
			)

		// click_tag_index_. Observe user tag selection in text area.
			// (!) Note subscribe uses 'id_base' instead 'self.id' to allow switch main component lang
			const fn_click_tag_index = (options) => {
				// debug
					if(SHOW_DEVELOPER===true) {
						dd_console(`+++++++ [tool_indexation] click_tag_index ${id_base}`, 'DEBUG', options)
					}

				// options
					const tag = options.tag || {} // object

				// short vars
					const tag_id	= tag.tag_id
					const state		= tag.state
					const data		= tag.data

				// fix selected tag
					self.active_tag_id = tag_id

				// force to update registered active values
				// Fans out tag_id and state to every registered active_value callback so
				// the tag-info panel widgets (state selector, delete button, label) all
				// update atomically to reflect the newly-selected tag.
					self.update_active_values([
						{
							name	: 'tag_id',
							value	: tag_id
						},
						{
							name	: 'state',
							value	: state
						}
					])

				// indexation_note
				// Render (or re-render) the note for the selected tag.  The tag carries a
				// `data` field that is a single-quoted JSON string encoding a locator
				// ({section_tipo, section_id}) for the associated note section record; if
				// absent, render_indexation_note returns a "create note" button instead.
					self.render_indexation_note(tag)
					.then(function(tag_note_node){
						if (tag_note_node) {
							// container. Get and clean
							const container	= self.indexation_note
							container.replaceChildren()
							container.appendChild(tag_note_node)
						}
					})
			}
			self.events_tokens.push(
				event_manager.subscribe('click_tag_index_'+ id_base, fn_click_tag_index)
			)


	return common_init
}//end init



/**
* BUILD
* Custom tool build step.
*
* Delegates to `tool_common.prototype.build` first (which loads the tool CSS and
* resolves all ddo_map entries into live instances stored in `self.ar_instances`),
* then performs indexation-specific wiring:
*
*   1. **transcription_component** — Locates the component_text_area instance by
*      matching the `transcription_component` ddo role.  If the ontology declares a
*      `related_component_lang` on `context.options` (indicating that the recording's
*      original language differs from the project default), the component is rebuilt in
*      that language so the editor always works on the original-language text.
*
*   2. **indexing_component** — Locates the component_relation_index (component_portal)
*      that will store index locators.  Its `show_interface.tools` is set to false to
*      suppress the embedded toolbar (the indexation tool controls indexing directly).
*
*   3. **media_component** — Locates the audio/video player component (optional left
*      viewer).  `show_interface.tools` suppressed for the same reason.
*
*   4. **people_section** — Locates the people-lookup section; wires
*      `people_section.linker = self.indexing_component` so that clicking a person in
*      the left viewer creates an index relation via the indexing_component.
*
*   5. **area_thesaurus** — Locates the thesaurus area; sets
*      `context.thesaurus_mode = 'relation'`, `caller = self`, and
*      `linker = self.indexing_component` so term selections create index locators.
*
*   6. **status_user_component / status_admin_component** — Located by role; rendered
*      later as mini workflow-state controls in the toolbar.
*
*   7. **references_component** — Optional; null-safe lookup (may not be in ddo_map).
*
*   8. **related_sections_list** — Async API call that fetches the list of top-section
*      locators associated with the current transcript (see `load_related_sections_list`).
*
* Any exception thrown during wiring is caught, stored in `self.error`, logged, and
* surfaced as a notification bubble (in SHOW_DEBUG mode) so the tool degrades
* gracefully instead of crashing the whole page.
*
* (!) The catch block uses `console.error` + `event_manager.publish('notification')` rather
*     than re-throwing.  The tool returns `common_build` regardless of the error so that
*     the generic render path can still display an error node.
*
* @param {boolean} [autoload=false] - When true, forces a data re-fetch inside
*   `tool_common.prototype.build` (passed through unchanged).
* @returns {Promise<boolean>} Resolves to the return value of `tool_common.prototype.build`.
*/
tool_indexation.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(self, autoload)

	try {

		// transcription_component. fix transcription_component for convenience
			const transcription_component_ddo = self.tool_config.ddo_map.find(el => el.role==='transcription_component')
			if (!transcription_component_ddo) {
				self.error = "Invalid transcription_component_ddo"
				console.error('error:', self.error);
				return true
			}
			self.transcription_component = self.ar_instances.find(el => el.tipo===transcription_component_ddo.tipo)
			if (!self.transcription_component) {
				self.error = "transcription_component not found"
				console.error('error:', self.error);
				return true
			}
			// force change lang if related_component_lang is defined (original lang)
			// Some recordings are transcribed in a different language than the project default;
			// the ontology encodes the correct lang in context.options.related_component_lang.
			if (self.transcription_component.context.options && self.transcription_component.context.options.related_component_lang) {
				if (self.transcription_component.lang !== self.transcription_component.context.options.related_component_lang) {
					self.transcription_component.lang = self.transcription_component.context.options.related_component_lang
					// build again to force download data
					await self.transcription_component.build(true)
					if(SHOW_DEBUG===true) {
						console.log('Changed transcription_component lang to related_component_lang:', self.transcription_component.lang);
					}
				}
			}

		// indexing_component. fix indexing_component for convenience
			const indexing_component_ddo = self.tool_config.ddo_map.find(el => el.role==='indexing_component')
			if (!indexing_component_ddo) {
				self.error = "Invalid indexing_component_ddo"
				console.error('error:', self.error);
				return true
			}
			self.indexing_component = self.ar_instances.find(el => el.tipo===indexing_component_ddo.tipo)
			if (!self.indexing_component) {
				self.error = "indexing_component not found"
				console.error('error:', self.error);
				return true
			}
			// show_interface
			self.indexing_component.show_interface.tools = false

		// media_component. fix media_component for convenience
			const media_component_ddo = self.tool_config.ddo_map.find(el => el.role==='media_component')
			if (!media_component_ddo) {
				self.error = "Invalid media_component_ddo"
				console.error('error:', self.error);
				return true
			}
			self.media_component = self.ar_instances.find(el => el.tipo===media_component_ddo.tipo)
			if (!self.media_component) {
				self.error = "media_component not found"
				console.error('error:', self.error);
				return true
			}
			// show_interface
			self.media_component.show_interface.tools = false

		// people_section. fix people_section for convenience
			const people_section_ddo = self.tool_config.ddo_map.find(el => el.role==='people_section')
			if (!people_section_ddo) {
				self.error = "Invalid people_section_ddo from tool_config.ddo_map"
				console.error('error:', self.error);
				console.log('self.tool_config.ddo_map', self.tool_config.ddo_map)
				return true
			}
			self.people_section = self.ar_instances.find(el => el.tipo===people_section_ddo.tipo)
			if (!self.people_section) {
				self.error = "people_section not found"
				console.error('error:', self.error);
				return true
			}
			// set instance in thesaurus mode 'relation'
			// linker tells the people section to add relations via indexing_component
			self.people_section.linker = self.indexing_component

		// area_thesaurus. fix area_thesaurus for convenience
			const area_thesaurus_ddo	= self.tool_config.ddo_map.find(el => el.role==='area_thesaurus');
			if (!area_thesaurus_ddo) {
				self.error = "Invalid area_thesaurus_ddo"
				console.error('error:', self.error);
				return true
			}
			self.area_thesaurus = self.ar_instances.find(el => el.tipo===area_thesaurus_ddo.tipo);
			if (!self.area_thesaurus) {
				self.error = "area_thesaurus not found"
				console.error('error:', self.error);
				return true
			}
			// set instance in thesaurus mode 'relation'
			// 'relation' mode causes term clicks to create locators rather than navigate the tree.
			self.area_thesaurus.context.thesaurus_mode	= 'relation';
			self.area_thesaurus.caller					= self;
			self.area_thesaurus.linker					= self.indexing_component;

		// status_user. control the tool status process for users
			const status_user_ddo		= self.tool_config.ddo_map.find(el => el.role==="status_user_component");
			self.status_user_component	= self.ar_instances.find(el => el.tipo===status_user_ddo.tipo);

		// status_admin. control the tool status process for administrators
			const status_admin_ddo		= self.tool_config.ddo_map.find(el => el.role==="status_admin_component");
			self.status_admin_component	= self.ar_instances.find(el => el.tipo===status_admin_ddo.tipo);

		// references_component. Add references into the text
		// Optional: not all ontology configurations include a references role; guard with null.
			const references_component	= self.tool_config.ddo_map.find(el => el.role==="references_component");
			self.references_component	= references_component
				? self.ar_instances.find(el => el.tipo===references_component.tipo)
				: null;

		// related_sections_list. load_related_sections_list. Get the relation list.
		// This is used to build a select element to allow
		// user select the top_section_tipo and top_section_id of current indexation
			self.related_sections_list = await self.load_related_sections_list();

	} catch (error) {
		self.error = error;
		console.error(error);
		// show bubble error
		if(SHOW_DEBUG===true) {
			event_manager.publish('notification', {
				msg			: error,
				type		: 'error',
				remove_time	: 10000
			})
		}
	}


	return common_build
}//end build



/**
* GET_COMPONENT
* Creates (or recovers) a component_text_area instance for the given language,
* replacing the current `self.transcription_component`.
*
* Called by the lang-selector dropdown in `render_tool_indexation.edit` when the
* editor wants to view the transcript in a different language.  The old instance is
* queued for destruction via `to_delete_instances` so that `load_component` can clean
* it up from `self.ar_instances` after the new one is ready (avoiding stale instances
* accumulating across multiple lang switches).
*
* The new options object is built by cloning the existing component's `context`
* (which carries tipo, section_tipo, model, etc.) and overriding `lang`, `mode`,
* and `section_id` to match the requested language and current section.
*
* After `load_component` resolves, `self.transcription_component` is updated to point
* at the new instance.  Callers are expected to then set `auto_init_editor = true` and
* call `component_instance.render()` to display it.
*
* @param {string} lang - Target language code (e.g. 'lg-eng', 'lg-spa').
* @returns {Promise<Object>} Resolves with the new component instance.
*/
tool_indexation.prototype.get_component = async function(lang) {

	const self = this

	// to_delete_instances. Select current self.transcription_component
		const to_delete_instances = self.ar_instances.filter(el => el===self.transcription_component)

	// options (clone and edit)
		const options = Object.assign(clone(self.transcription_component.context),{
			self				: self,
			lang				: lang,
			mode				: 'edit',
			section_id			: self.transcription_component.section_id,
			to_delete_instances	: to_delete_instances // array of instances to delete after create the new one
		})

	// call generic common tool build
		const component_instance = await load_component(options);

	// fix instance (overwrite)
		self.transcription_component = component_instance


	return component_instance
}//end get_component



/**
* LOAD_RELATED_SECTIONS_LIST
* Fetches the list of "top sections" (e.g. interview records, documentary units)
* that reference the current transcript section via the transcription component.
*
* The result drives the "Approach" selector in the tool toolbar, letting the editor
* choose which top-section context to associate with the current indexation session.
* `self.top_locator` is initialised to the first result in `build` via
* `render_related_list` in render_tool_indexation.js.
*
* Request shape
* -------------
*   source.action = 'related_search' — instructs the component_text_area server handler
*     to run a reverse-relation lookup rather than a normal data read.
*   source.mode   = 'related_list'   — returns locators of parent sections.
*   sqo.filter_by_locators           — constrains results to parents of this specific
*     (section_tipo, section_id) pair.
*   sqo.limit = 10                   — cap to avoid unbounded results for densely linked
*     transcripts; adjust in ontology config if more parents are needed.
*
* Response shape
* --------------
*   api_response.result is a mixed datum array whose entries may have:
*     { typo: 'sections', value: [{section_tipo, section_id}, …] } — the parent locators.
*   Additional entries carry display labels resolved from the component context.
*   The render_related_list function in render_tool_indexation.js consumes this shape.
*
* @returns {Promise<Object>} Resolves with `api_response.result` datum.
*/
tool_indexation.prototype.load_related_sections_list = async function() {

	const self = this

	const transcription_component = self.transcription_component

	const source = {
		action			: 'related_search',
		model			: transcription_component.model,
		tipo			: transcription_component.tipo,
		section_tipo	: transcription_component.section_tipo,
		section_id		: transcription_component.section_id,
		lang			: transcription_component.lang,
		mode			: 'related_list'
	}

	const sqo = {
		section_tipo		: ['all'],
		mode				: 'related',
		limit				: 10,
		offset				: 0,
		full_count			: false,
		filter_by_locators	: [{
			section_tipo	: transcription_component.section_tipo,
			section_id		: transcription_component.section_id
		}]
	}

	const rqo = {
		action	: 'read',
		source	: source,
		sqo		: sqo
	}

	// get context and data
		const api_response = await data_manager.request({
			body : rqo
		})

	const datum = api_response.result


	return datum
}//end load_related_sections_list



/**
* ACTIVE_VALUE
* Registers a named reactive callback that will be invoked whenever
* `update_active_values` is called with a matching name.
*
* This forms the "active-value" pub-sub pattern used inside the tag-info panel:
* UI widgets (tag-id label, state selector, delete-button label) call `active_value`
* once during their setup to subscribe to a named slot, then `update_active_values`
* fans out to all subscribers for that slot each time the selected tag changes.
*
* Duplicate registrations (same `name` AND same `callback` reference) are silently
* skipped to prevent double-firing when a component is re-rendered without a full
* destroy/rebuild cycle.
*
* `self.active_elements` is initialised lazily here (not in the constructor) because
* this method may be called before any built instance exists; the `|| []` guard is
* therefore intentional.
*
* @param {string}   name     - Slot name; must match a `name` in `update_active_values` values.
*                              Convention: 'tag_id', 'state'.
* @param {Function} callback - Function called with `(value)` when the slot fires.
*                              The callback's identity is used for dedup — use stable
*                              references (closures assigned to `const`), not inline lambdas.
* @returns {boolean} true if the element was added; false if it was already registered.
*/
tool_indexation.prototype.active_value = function(name, callback) {

	const self = this

	self.active_elements = self.active_elements || []

	// check already exists in list of active_elements
		const found = self.active_elements.find(el => {
			return el.name===name && el.callback===callback
		})
		if (found) {
			console.warn("Skip already added active value name:", name);
			return false
		}

	// add if not already exists
		self.active_elements.push({
			name		: name,
			callback	: callback
		})

	// debug
		if(SHOW_DEBUG===true) {
			console.warn("self.active_elements added new one:", name, self.active_elements);
		}

	return true
}//end active_value



/**
* UPDATE_ACTIVE_VALUES
* Fans out a batch of named values to all callbacks registered via `active_value`.
*
* Iterates `values`, and for each entry finds every element in `self.active_elements`
* with the matching `name`, then invokes its callback with the new `value`.
* Multiple subscribers to the same slot are all called (one-to-many fan-out).
*
* Called by `fn_click_tag_index` (in `init`) each time the editor clicks a tag span
* to push the tag's `tag_id` and `state` simultaneously to the tag-info panel widgets.
*
* If `self.active_elements` is not yet initialised (e.g. `active_value` was never
* called), the `|| []` guard prevents a runtime error and the loop is simply a no-op.
*
* @param {Array<{name: string, value: *}>} values - Batch of slot-name/value pairs.
*   Example:
*   [
*     { name: 'tag_id', value: '42' },
*     { name: 'state',  value: 'n' }
*   ]
* @returns {boolean} Always true.
*/
tool_indexation.prototype.update_active_values = function(values) {

	const self = this

	const active_elements = self.active_elements || []

	const values_length = values.length
	for (let i = 0; i < values_length; i++) {

		const item = values[i]

		const founds = active_elements.filter(el => el.name===item.name)
		for (let j = 0; j < founds.length; j++) {

			const found = founds[j]
			if (found.callback) {
				found.callback(item.value)
			}
		}
	}

	// debug
		// console.log("Fired update_active_values self.active_elements list:", self.active_elements);


	return true
}//end update_active_values



/**
* DELETE_TAG
* Removes a tag and all of its associated relations and index records across every
* language variant of the transcript.
*
* This is a two-step destructive operation that requires two consecutive user
* confirmations (native `confirm` dialogs) before proceeding:
*
*   Step 1 — Delete the tag span in the component_text_area for ALL languages.
*             Calls `self.transcription_component.delete_tag(tag_id, 'index')`.
*             The second argument 'index' identifies the tag type so the component
*             knows which markup class to remove.  Errors are caught and displayed
*             via `alert` but do NOT abort step 2.
*
*   Step 2 — Delete the corresponding index locator from the component_relation_index
*             (indexing_component / component_portal).
*             Calls `self.indexing_component.delete_locator(locator, ar_properties)`
*             where the locator is matched by `{tag_id, type: DD_TIPOS.DEDALO_RELATION_TYPE_INDEX_TIPO}`
*             (dd96) and ar_properties = ['tag_id','type'] defines the composite key.
*             On success, `indexing_component.data` and `.datum` are explicitly
*             nulled before `refresh()` to force a full server re-fetch (the portal
*             caches its last response and would otherwise show stale data).
*
* The composite response object `{delete_tag, delete_locator}` is returned so the
* caller (the delete-button click handler in `get_tag_info`) can inspect both results
* and decide whether to hide the tag-info panel.
*
* (!) Both API calls use `alert()` for error display.  This is intentional (legacy UX)
*     but should be replaced with a notification bubble in a future refactor.
*
* (!) The @param annotation on the original doc-block says `button_obj` but the actual
*     parameter is `tag_id`.  The original doc-block was stale; corrected here.
*
* @param {string} tag_id - Identifier of the tag to delete (numeric string, e.g. '42').
* @returns {Promise<Object|false>} Resolves with `{delete_tag, delete_locator}` response
*   objects, or false if the user cancels either confirmation dialog.
*/
tool_indexation.prototype.delete_tag = async function(tag_id) {

	const self = this

	// Confirm action
		if( !confirm( `${self.get_tool_label('delete_tag') || 'Delete tag?'}\nID: ${tag_id}`) ) {
			return false
		}
		if( !confirm(
			`${get_label.warning || 'Warning!'} !! ${self.get_tool_label('warning_delete_tag') || 'It will delete the selected tag in all languages and all the relationships and indexing associated with it'}`)
			) {
			return false
		}

	// delete tag in all langs (component_text_area)
		const api_response_delete_tag = await self.transcription_component.delete_tag(
			tag_id,
			'index'
		)
		.catch(error => {
			console.error('ERROR: delete_tag found errors')
			console.error(error.message)
			return {result: false, msg: [error.message]}
		});
		// transcription_component response
		if (api_response_delete_tag.result===false) {
			// error case
			const msg = api_response_delete_tag.msg
				? api_response_delete_tag.msg.join('\n')
				: 'Unknown error'
			alert(
				(self.get_tool_label('error_delete_tag') || 'Error on delete tag') + '\n' + msg
			)
		}

	// delete_locator (component_portal)
	// Match the locator by tag_id + relation type dd96 (DEDALO_RELATION_TYPE_INDEX_TIPO).
	// ar_properties defines the composite key used to identify the specific locator row.
		const api_response_delete_locator = await self.indexing_component.delete_locator(
			// object locator
			{
				tag_id	: tag_id,
				type	: DD_TIPOS.DEDALO_RELATION_TYPE_INDEX_TIPO // dd96
			},
			// array ar_properties
			['tag_id','type']
		)
		.catch(error => {
			console.error('ERROR: delete_locator found errors')
			console.error(error.message)
			return {result: false, msg: [error.message]}
		});
		// indexing_component response
		if (api_response_delete_locator.result===false) {
			// error case
			const msg = api_response_delete_locator.msg
				? api_response_delete_locator.msg.join('\n')
				: 'Unknown error'
			alert(
				(self.get_tool_label('error_delete_locator') || 'Error on delete locator') + '\n' + msg
			)
		}else{
			// indexing_component. Remember force clean full data and datum before refresh
			// (!) Must null both .data and .datum before refresh; the component caches the
			// last server response and will not re-fetch unless these are explicitly cleared.
			self.indexing_component.data	= null
			self.indexing_component.datum	= null
			self.indexing_component.refresh()
		}

	// response
		const response = {
			'delete_tag'		: api_response_delete_tag,
			'delete_locator'	: api_response_delete_locator
		}

	return response
}//end delete_tag



// @license-end
