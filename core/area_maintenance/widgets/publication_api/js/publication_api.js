// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* PUBLICATION_API
* area_maintenance widget that exposes Publication Server API configuration
* diagnostics and provides a launcher button for the Swagger UI of each
* configured publication database.
*
* This widget is purely read-only/display: all data is inlined by the server
* into `this.value` at widget registration time (class.area_maintenance.php
* builds the value from PHP constants). No deferred API fetch is required —
* this.build() delegates directly to widget_common and does NOT set autoload.
*
* Value shape (populated server-side, stored in this.value after init):
*   {
*     dedalo_diffusion_domain         : string   // configured diffusion domain URL
*     dedalo_diffusion_resolve_levels : *        // ontology resolve-level config
*     api_web_user_code_multiple      : Array<{  // one entry per published database
*       code    : string,                        // API authorisation code
*       db_name : string,                        // MariaDB target database name
*       api_ui  : string|undefined               // optional Swagger UI base URL override
*     }>
*     dedalo_diffusion_langs          : *        // active diffusion language config
*     diffusion_map                   : Object   // ontology/connection probe result
*                                                // from diffusion_utils::get_diffusion_map()
*   }
*
* Rendered output: for each entry in api_web_user_code_multiple a button is
* shown that opens the Swagger UI in a new tab (window.open), passing the API
* code, db_name and current application lang as query-string parameters.
* The full current configuration is also displayed as a pretty-printed JSON block
* (useful for diagnostics).
*
* Server peer:  core/area_maintenance/class.area_maintenance.php
*               (widget registration, value construction)
* Render peer:  core/area_maintenance/widgets/publication_api/js/render_publication_api.js
* API docs:     docs/diffusion/publication_api/publication_api.md
*
* Lifecycle (all inherited):
*   init() → build() → render() → [no refresh cycle] → destroy()
*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_publication_api} from './render_publication_api.js'



/**
* PUBLICATION_API
* Constructor. Declares all well-known instance properties so that downstream
* lifecycle methods (build, render) can assume they exist without undefined
* checks. All properties are seeded with their correct values during init()
* (inherited from widget_common).
*
* @var {string}        id            - Unique widget instance identifier ('publication_api')
* @var {string}        section_tipo  - Ontology tipo of the owning section (e.g. 'oh1')
* @var {string|number} section_id    - Record id within the owning section
* @var {string}        lang          - Active language tag (e.g. 'lg-eng')
* @var {string}        mode          - Render mode: 'edit' | 'list'
* @var {Object}        value         - Server-inlined config payload (see module header for shape)
* @var {HTMLElement}   node          - Root DOM node created by render(); null until first render
* @var {Array}         events_tokens - Event subscription tokens; drained by destroy()
* @var {Array}         ar_instances  - Child widget/component instances; drained by destroy()
* @var {string}        status        - Lifecycle status string (set by init/build/render/destroy)
*/
export const publication_api = function() {

	this.id

	this.section_tipo
	this.section_id
	this.lang
	this.mode

	this.value

	this.node

	this.events_tokens	= []
	this.ar_instances	= []

	this.status
}//end publication_api



/**
* COMMON FUNCTIONS
* Prototype assignments that wire the shared lifecycle and render methods onto
* this widget. Dédalo widgets delegate their lifecycle to widget_common and
* their render methods to the companion render_* module, rather than inheriting
* via ES6 class extends.
*
* Lifecycle methods (from widget_common):
*   init    — seeds all instance properties from the options bag; guards against
*             double-init; sets status 'initializing' → 'initialized'.
*   build   — transitions status 'building' → 'built'. For this widget no
*             autoload is needed because the server inlines this.value at
*             registration time; build() is called with autoload=false.
*   render  — dispatches to this.edit() or this.list() based on this.mode.
*   destroy — unsubscribes all events_tokens and marks status 'destroyed'.
*
* Render methods (from render_publication_api):
*   edit / list — both map to render_publication_api.prototype.list, which
*                 builds the Swagger UI launcher buttons and config JSON preview.
*                 'edit' and 'list' modes are intentionally identical for this
*                 display-only widget.
*/
// prototypes assign
	// // lifecycle
	publication_api.prototype.init		= widget_common.prototype.init
	publication_api.prototype.build		= widget_common.prototype.build
	publication_api.prototype.render	= widget_common.prototype.render
	publication_api.prototype.destroy	= widget_common.prototype.destroy
	// // render
	publication_api.prototype.edit		= render_publication_api.prototype.list
	publication_api.prototype.list		= render_publication_api.prototype.list



// @license-end
