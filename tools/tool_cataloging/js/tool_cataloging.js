// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {get_instance} from '../../../core/common/js/instances.js'
	import {common} from '../../../core/common/js/common.js'
	import {tool_common} from '../../../core/tools_common/js/tool_common.js'
	import {render_tool_cataloging} from './render_tool_cataloging.js'



/**
* TOOL_CATALOGING
*
* Split-panel cataloging tool that lets users build and maintain hierarchical thesaurus
* structures by dragging records from a source section (left panel) onto thesaurus nodes
* (right panel). When a user drops a record onto the thesaurus, a new thesaurus term section
* is created and the dragged locator is written into a configured component_portal on that
* new section via the `ts_add_child_tool_cataloging` event.
*
* Typical use-case: organising numismatic types within specific mints, producing a tree catalog
* like "types → mints".
*
* Configuration (tool_config / ddo_map):
*   - A ddo entry with role `"section_to_cataloging"` drives the left panel; its `tipo` and
*     `section_tipo` determine which section records are displayed as draggable tiles.
*   - A ddo entry with role `"area_thesaurus"` drives the right panel; the instance must be
*     an area component that owns a thesaurus tree.
*   - `tool_config.set_new_thesaurus_value` is an object `{ tipo, section_tipo }` identifying
*     the component_portal inside the new thesaurus term section that should receive the
*     dragged locator. This key is mandatory for drag-and-drop to work.
*
* Prototype chain (methods delegated to shared implementations):
*   - render  → tool_common.prototype.render
*   - destroy → common.prototype.destroy
*   - refresh → common.prototype.refresh
*   - edit    → render_tool_cataloging.prototype.edit
*
* Own instance properties:
*   @var {string|null}   id                    - Unique instance identifier assigned by get_instance.
*   @var {string|null}   model                 - Always `"tool_cataloging"`.
*   @var {string|null}   mode                  - Active render mode (e.g. `"edit"`).
*   @var {HTMLElement|null} node               - Root DOM node once rendered.
*   @var {Array|null}    ar_instances          - Child component/section instances managed by this tool.
*   @var {string|null}   status                - Lifecycle status (`"initializing"`, `"ready"`, etc.).
*   @var {Array}         events_tokens         - Tokens returned by event_manager.subscribe(); used to
*                                               unsubscribe all listeners on destroy.
*   @var {string|null}   type                  - Instance type; always `"tool"`.
*   @var {string|null}   source_lang           - Source language code inherited from the caller's lang
*                                               (e.g. `"lg-eng"`). Preserved for future translation
*                                               features; currently set but not acted upon.
*   @var {string|null}   target_lang           - Target language code for translation workflows; set to
*                                               null during init and intended for future use.
*   @var {Array|null}    langs                 - Full list of project languages from
*                                               `page_globals.dedalo_projects_default_langs`.
*   @var {Object|null}   caller                - The button or component that opened this tool.
*   @var {Object|null}   section_to_cataloging - Section instance for the left panel (loaded in build).
*   @var {Object|null}   area_thesaurus        - Area/thesaurus instance for the right panel (resolved
*                                               from ar_instances in build).
*/
export const tool_cataloging = function () {

	this.id						= null
	this.model					= null
	this.mode					= null
	this.node					= null
	this.ar_instances			= null
	this.status					= null
	this.events_tokens			= []
	this.type					= null
	this.source_lang			= null
	this.target_lang			= null
	this.langs					= null
	this.caller					= null

	this.section_to_cataloging	= null // main section to be cataloging
	this.area_thesaurus			= null
}//end tool_cataloging



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_cataloging.prototype.render	= tool_common.prototype.render
	tool_cataloging.prototype.destroy	= common.prototype.destroy
	tool_cataloging.prototype.refresh	= common.prototype.refresh
	tool_cataloging.prototype.edit		= render_tool_cataloging.prototype.edit



/**
* INIT
* Initialises a tool_cataloging instance by delegating to the shared tool_common init and
* then setting cataloging-specific state.
*
* Beyond the generic init (which populates `id`, `model`, `mode`, `tool_config`, `ar_instances`,
* etc.), this method:
*   1. Resolves `langs` from `page_globals.dedalo_projects_default_langs`.
*   2. Derives `source_lang` from the caller's current language (falls back to null when no
*      caller is present — e.g. when the tool is opened from a section button with no lang
*      context).
*   3. Subscribes to the `ts_add_child_tool_cataloging` global event, which the thesaurus tree
*      fires whenever the user drops a record onto a node, triggering a new child-term creation
*      flow (see the handler inline docs below).
*
* @param {Object} options - Initialisation options forwarded verbatim to tool_common.prototype.init.
* @returns {Promise<boolean>} Resolves to the boolean returned by the common init (`true` on success).
*/
tool_cataloging.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	try {
		// set the self specific vars not defined by the generic init (in tool_common)
			self.langs			= page_globals.dedalo_projects_default_langs
			self.source_lang	= self.caller && self.caller.lang
				? self.caller.lang
				: null
			self.target_lang	= null

	} catch (error) {
		self.error = error
		console.error(error)
	}

	// ts_add_child_tool_cataloging event subscription
		// listen the thesaurus to update the data of the component_portal when the locator drag by user
		// the cataloging section has a portal that point to any other section to be ordered
		// when the user drag the section to be placed in the thesaurus the thesaurus create new term (new section)
		// this new section has a portal that need to be updated with the locator received
		/**
		* TS_ADD_CHILD_TOOL_CATALOGING_HANDLER
		* Handles the `ts_add_child_tool_cataloging` event emitted by the thesaurus tree when the
		* user successfully drags a source-section record and drops it onto a thesaurus node,
		* causing the tree to create a new child term (a new thesaurus section).
		*
		* Flow:
		*   1. Reads `new_ts_section` (the just-created thesaurus term section), `locator` (the
		*      source record the user dragged), and an optional `callback` from the event payload.
		*   2. Looks up `tool_config.set_new_thesaurus_value` — a `{ tipo, section_tipo }` object
		*      that identifies the component_portal inside the new term section that should receive
		*      the dragged locator. Aborts with a console error if this config key is absent.
		*   3. Obtains a live component_portal instance for that component via `get_instance`, then
		*      calls `build(true)` to hydrate it with server data.
		*   4. Constructs a single `insert` change-record and submits it via `component.change_value`,
		*      which persists the locator to the database in the same call.
		*   5. On success, if a `callback` was provided, forwards the server response to it so the
		*      thesaurus tree can refresh the newly-created node.
		*
		* @param {Object} options                        - Event payload from the thesaurus.
		* @param {Object} options.new_ts_section         - Descriptor of the newly created thesaurus section.
		* @param {string} options.new_ts_section.section_tipo - Section tipo of the new term.
		* @param {string} options.new_ts_section.section_id   - Section ID of the new term.
		* @param {Object} options.locator                - The locator that was dragged by the user.
		* @param {string} options.locator.section_id     - Section ID of the dragged record.
		* @param {string} options.locator.section_tipo   - Section tipo of the dragged record.
		* @param {Function|undefined} options.callback   - Optional callback the thesaurus passes to
		*                                                  receive the save response for node refresh.
		* @returns {Promise<void>}
		*/
		const ts_add_child_tool_cataloging_handler = async function(options) {

			// options
				// new_ts_section. The new section created by the thesaurus
				const new_ts_section = options.new_ts_section
				// locator. The locator drag by the user (the section as the term of the ts)
				const locator = options.locator
				// callback. Dispatch the callback to the thesaurus to update the node in the thesaurus tree
				const callback = options.callback

			// set_new_thesaurus_value. Get the thesaurus value defined in properties
				const set_new_thesaurus_value = self.tool_config.set_new_thesaurus_value
				// check if the tool_config has the new thesaurus value
				if(!set_new_thesaurus_value){
					console.error('Error, set_new_thesaurus_value is not present in properties.tool_config of the tool_cataloging ontology');
					return
				}

			// component to inject the locator
				const component = await get_instance({
					model			: 'component_portal',
					mode 			: 'edit',
					tipo			: set_new_thesaurus_value.tipo,
					section_tipo	: new_ts_section.section_tipo,
					section_id		: new_ts_section.section_id,
					lang			: page_globals.dedalo_data_nolan,
					type			: 'component'
				})
				await component.build(true);

			// insert the locator in the data of the component
				const changed_data = [Object.freeze({
					action	: 'insert',
					id		: null,
					value	: {
						section_id		: locator.section_id,
						section_tipo	: locator.section_tipo
					}
				})]
				// change_value (implies saves too)
				component.change_value({
					changed_data	: changed_data,
					refresh			: false
				})
				.then((response)=>{
					// the user has selected cancel from delete dialog
						if (response===false) {
							return
						}
					// dispatch the callback to the thesaurus to update the node in the thesaurus tree
						if (callback) {
							callback(response)
						}
				})
		}
		self.events_tokens.push(
			event_manager.subscribe('ts_add_child_tool_cataloging', ts_add_child_tool_cataloging_handler)
		)


	return common_init
}//end init



/**
* BUILD
* Builds the tool's data model and sub-instances after the shared tool_common build runs.
*
* In addition to the generic build (which instantiates the components listed in `ddo_map`
* via `tool_common.prototype.build`), this method:
*   1. Loads and builds the "section to cataloging" sub-section (left panel). This step is
*      performed manually — not via tool_common — because the target section may be the same
*      tipo as the caller, which tool_common explicitly excludes from its auto-instantiation
*      loop. See `load_section` for the options resolution logic.
*   2. Propagates the CSS class from the ddo entry's `properties.css` onto the section's context
*      so that the render layer can apply it to the panel container.
*   3. Resolves `area_thesaurus` from the already-built `ar_instances` array (the thesaurus
*      area is instantiated by tool_common) and sets cross-pointers:
*        - `area_thesaurus.caller = self`  — lets the thesaurus dispatch events back to this tool.
*        - `area_thesaurus.linker = self.indexing_component` — links the component used for
*          cross-indexation ((!): `self.indexing_component` is assigned by tool_common and may
*          be undefined if no indexing component is configured in the ontology).
*
* @param {boolean} [autoload=false] - When true, triggers a data load during build.
* @returns {Promise<boolean>} Resolves to the boolean returned by the common build.
*/
tool_cataloging.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// load section to cataloging
		// do not use the tool_common because the section to be load could be the caller and it's avoided in tool_common
			const section_to_cataloging	= self.tool_config.ddo_map.find(el => el.role==='section_to_cataloging')
			await self.load_section( section_to_cataloging )
			await self.section_to_cataloging.build(true)
			self.section_to_cataloging.context.css = section_to_cataloging.properties.css

		// area_thesaurus. fix area_thesaurus for convenience
			const area_thesaurus_ddo	= self.tool_config.ddo_map.find(el => el.role==='area_thesaurus')
			self.area_thesaurus			= self.ar_instances.find(el => el.tipo===area_thesaurus_ddo.tipo)
			// set instance in thesaurus mode 'relation'
			// self.area_thesaurus.context.thesaurus_mode = 'relation'
			self.area_thesaurus.caller = self
			self.area_thesaurus.linker = self.indexing_component

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build



/**
* LOAD_SECTION
* Instantiates the "section to cataloging" and registers it in `ar_instances`.
*
* Despite the function name (inherited from the original scaffolding), the actual role of this
* method is to create a `section` instance for the left panel using `get_instance` and attach
* the raw ddo `properties` object onto it for later use by the render layer (e.g. for CSS or
* view overrides). The instance is pushed into `self.ar_instances` so that the common
* lifecycle (destroy / refresh) covers it.
*
* Option resolution precedence: values from the `section_to_cataloging` ddo entry take priority;
* missing values fall back to the caller's corresponding properties. `type` is always forced to
* `"section"`; `section_id` uses the ddo value when present and falls back to `null`.
*
* @param {Object} section_to_cataloging          - The ddo entry (from `tool_config.ddo_map`) whose
*                                                  role is `"section_to_cataloging"`.
* @param {string} [section_to_cataloging.mode]   - Render mode (`"list"` by default).
* @param {string} [section_to_cataloging.tipo]   - Section tipo; falls back to `self.caller.tipo`.
* @param {string} [section_to_cataloging.section_tipo] - Section tipo identifier; falls back to
*                                                        `self.caller.section_tipo`.
* @param {string} [section_to_cataloging.lang]   - Language code; falls back to `self.caller.lang`.
* @param {string} [section_to_cataloging.section_lang] - Section language; falls back to
*                                                        `self.caller.section_lang`.
* @param {Object} [section_to_cataloging.properties]   - Arbitrary properties attached to the
*                                                        section instance for downstream use.
* @returns {Promise<boolean>} Always resolves to `true` after registering the instance.
*/
tool_cataloging.prototype.load_section = async function(section_to_cataloging) {

	const self = this

	const section_options = {
		model			: 'section',
		mode			: section_to_cataloging.mode || 'list',
		tipo			: section_to_cataloging.tipo || self.caller.tipo,
		section_tipo	: section_to_cataloging.section_tipo || self.caller.section_tipo,
		section_id		: section_to_cataloging.section_id || null,
		lang			: section_to_cataloging.lang || self.caller.lang,
		section_lang	: section_to_cataloging.section_lang || self.caller.section_lang,
		type			: 'section'
	}
	self.section_to_cataloging = await get_instance(section_options)
	// add properties to the section instance
	self.section_to_cataloging.properties = section_to_cataloging.properties

	// store instance
	self.ar_instances.push(self.section_to_cataloging)


	return true
}//end load_section



// @license-end
