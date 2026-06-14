// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



/**
* WIDGET_COMMON
* Base constructor and shared prototype methods for all Dédalo widget instances.
*
* Widgets are read-only, display-only elements used inside component_info fields.
* They aggregate dynamic computed data produced by a server-side widget class
* (a subclass of class.widget_common.php) and present it alongside configurable
* labels. Unlike regular components they never write data to the database directly.
*
* Every concrete widget (calculation, state, user_activity, …) inherits its
* lifecycle from this module by assigning widget_common.prototype methods onto its
* own prototype. The lifecycle mirrors the core component lifecycle:
*
*   init() → build() → render() → [refresh cycles] → destroy()
*
* Status values progress through:
*   'initializing' → 'initialized' → 'building' → 'built'
*
* Differences from component_common:
*   - `this.tipo` is always null (widgets are positioned by the parent component,
*     not by an independent ontology tipo).
*   - `this.model` is fixed to 'widget'.
*   - `this.ipo` carries the Input-Process-Output configuration array that drives
*     the widget's data sourcing and output structure.
*   - `this.name` carries the widget class name (e.g. 'calculation', 'state'),
*     used when the build method makes an API request for widget data.
*
* The build() method on this base handles the component_info autoload path:
* when `self.caller === 'component_info'` and `autoload === true` it fires a
* 'get_widget_data' request via dd_component_info and stores the resolved payload
* in `self.value`. Concrete widgets whose data needs a different loading strategy
* should override build() rather than extend this one.
*
* Server peer:  core/widgets/widget_common/class.widget_common.php
* API handler:  core/api/v1/common/class.dd_component_info.php (action get_widget_data)
*
* Exported:
*   widget_common — base constructor (function, used via prototype assignment only)
*   widget_common.prototype.init
*   widget_common.prototype.build
*   widget_common.prototype.destroy  (from common)
*   widget_common.prototype.refresh  (from common)
*   widget_common.prototype.render   (from common)
*/



// imports
	import {data_manager} from '../../../common/js/data_manager.js'
	import {common} from '../../../common/js/common.js'



export const widget_common = function(){

	return true
}//end widget_common



/**
* COMMON FUNCTIONS
* Delegate core lifecycle methods to the shared base class common.
*
* Widgets do not need their own implementations of destroy, refresh, or render —
* those follow the same contract as every other Dédalo UI element, so the common
* prototypes are used directly:
*
*   destroy  — unsubscribes all event tokens in this.events_tokens, optionally
*              removes the DOM node, and marks status as 'destroyed'.
*   refresh  — tears down per-render dependencies, re-calls build() then render().
*   render   — dispatches to this.edit() or this.list() based on this.mode.
*
* Concrete widget constructors (calculation, state, etc.) assign widget_common
* methods onto their own prototypes in the same way, so every widget in the
* system ultimately shares these three implementations.
*/
// prototypes assign
	// lifecycle
	widget_common.prototype.destroy	= common.prototype.destroy
	widget_common.prototype.refresh	= common.prototype.refresh
	widget_common.prototype.render	= common.prototype.render



/**
* INIT
* Initialises a widget instance from the options bag supplied by the parent
* component or section renderer.
*
* Seeds all well-known widget properties so that downstream lifecycle methods
* (build, render) can assume they exist. Identical in structure to
* common.prototype.init but tailored to the widget property set:
*
*   - `tipo` is always set to null (widgets have no independent ontology tipo).
*   - `model` is always fixed to 'widget'.
*   - `ipo` carries the Input-Process-Output configuration array from the ontology.
*   - `name` carries the concrete widget class name, e.g. 'calculation'.
*   - `caller` is the parent component_info instance (object) or the string
*     'component_info' when the parent is identified by name only.
*
* Sets `this.is_init = true` as a one-shot guard: a second call on the same
* instance is treated as a programming error and logs a console error.  When
* SHOW_DEBUG is true, an alert() is also triggered to make the bug impossible to
* miss during development.
*
* (!) `alert()` is intentional debug behaviour — do not replace with console.warn.
*
* @param {Object} options - Widget initialisation options bag
* @param {string} options.id - Unique instance identifier string
* @param {string} options.section_tipo - Ontology tipo of the parent section (e.g. 'oh1')
* @param {string|number} options.section_id - Record identifier within the section
* @param {string} options.lang - Active language tag (e.g. 'lg-eng')
* @param {string} options.mode - Render mode: 'edit' | 'list' | 'search'
* @param {*} options.value - Pre-loaded widget data payload; null when autoload handles it
* @param {Array|null} options.datalist - Optional list-of-values for select-style widgets
* @param {Array|null} options.ipo - Input-Process-Output config array from the ontology
* @param {string} options.name - Concrete widget class name, e.g. 'calculation'
* @param {Object|null} options.properties - Instance-specific configuration properties from ontology
* @param {Object|string|null} options.caller - Parent instance or caller identifier string
* @returns {Promise<boolean>} Resolves to true on success; false if already initialised
*/
widget_common.prototype.init = async function(options) {

	const self = this

	// safe init double control. To detect duplicated events cases
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

	// set vars
		self.id				= options.id
		self.tipo			= null
		self.section_tipo	= options.section_tipo
		self.section_id		= options.section_id
		self.lang			= options.lang
		self.mode			= options.mode
		self.model			= 'widget'
		self.value			= options.value
		self.datalist		= options.datalist
		self.ipo			= options.ipo
		self.name			= options.name
		self.properties		= options.properties
		self.caller			= options.caller
		self.ar_instances	= [] // array of children instances of current instance (used for autocomplete, etc.)

	// status update
		self.status = 'initialized'


	return true
}//end init



/**
* BUILD
* Transitions the widget from 'initialized' to 'built' and, when autoload is
* requested for a component_info caller, fetches the widget's computed data from
* the server via the dd_component_info API action 'get_widget_data'.
*
* The component_info autoload path:
*   When `self.caller === 'component_info'` and `autoload === true`, constructs a
*   Request Query Object (RQO) targeting the dd_component_info API handler and
*   awaits the response. If the response carries a truthy `result`, that value is
*   stored in `self.value` and subsequently passed to the render method.
*
*   RQO shape sent to the server:
*   {
*     action  : 'get_widget_data',
*     dd_api  : 'dd_component_info',
*     source  : {
*       tipo         : self.caller.tipo,        // component_info ontology tipo
*       section_tipo : self.caller.section_tipo, // owning section tipo
*       section_id   : self.caller.section_id,   // record id
*       mode         : self.mode                 // 'edit' | 'list' | etc.
*     },
*     options : {
*       widget_name  : self.name  // e.g. 'calculation', 'state'
*     }
*   }
*
* (!) When `self.caller` is the string 'component_info' rather than the live
*     component_info object, the source fields `self.caller.tipo`,
*     `self.caller.section_tipo`, and `self.caller.section_id` will all be
*     undefined.  The RQO will still be sent, but the server will receive null
*     coordinates — widgets relying on this path should ensure `caller` is the
*     live instance, not the string identifier.
*
* When `autoload === false` or the caller is not component_info, this method
* does nothing beyond the status update. Concrete widgets that need a different
* data-load strategy should override build() entirely.
*
* The commented-out CSS load block (load_style) is preserved intentionally —
* per-widget CSS loading was deferred and may be activated in the future.
*
* @param {boolean} [autoload=false] - When true, triggers an API request to
*   populate self.value before the widget is rendered.
* @returns {Promise<boolean>} Resolves to true once the widget reaches 'built' status
*/
widget_common.prototype.build = async function(autoload=false) {

	const self = this

	// status update
		self.status = 'building'

	// load self style
		// const tool_css_url = DEDALO_CORE_URL + '/widgets' + self.properties.path + "/css/" + self.name + ".css"
		// common.prototype.load_style(tool_css_url) // returns promise

	// autoload
		if (autoload===true) {

			// component_info caller cases
			// all component_info widgets are using this unified load data way
			// for convenience we place this API request in the common build
			if (self.caller==='component_info') {

				const rqo = {
					action	: 'get_widget_data',
					dd_api	: 'dd_component_info',
					source	: {
						tipo			: self.caller.tipo,
						section_tipo	: self.caller.section_tipo,
						section_id		: self.caller.section_id,
						mode			: self.mode
					},
					options	: {
						widget_name	: self.name
					}
				}
				const api_response = await data_manager.request({
					body: rqo
				});

				if(api_response.result) {
					self.value = api_response.result
				}

			}else{

				// let each widget handle its own data load overwriting this build
			}
		}

	// status update
		self.status = 'built'


	return true
}//end build



// @license-end
