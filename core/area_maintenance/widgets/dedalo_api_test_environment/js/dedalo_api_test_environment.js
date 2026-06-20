// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* DEDALO_API_TEST_ENVIRONMENT module
*
* Maintenance-area widget that lets Dédalo administrators craft and fire raw API
* requests (RQOs — Request Query Objects) directly against any dd_api endpoint and
* inspect the response inline.  It is the browser-side equivalent of a curl/Postman
* session scoped to the current authenticated Dédalo session.
*
* The widget renders a full-featured JSON editor (svelte-jsoneditor / standalone
* build) pre-filled with a representative RQO targeting the core section read
* action.  The editor content is persisted automatically to localStorage under the
* key 'json_editor_api' so that the last submitted request survives a page reload.
*
* Lifecycle:
*   init() → build() → render() → list()/edit()
*                                      ↓
*                          get_content_data_edit() — creates DOM skeleton and
*                          registers self.activate as the JSON-editor factory.
*
* The JSON-editor build is intentionally deferred: the heavy createJSONEditor call
* only runs when the widget panel is first opened (load() → activate()).  If load()
* is called before the async content scaffold finishes, self._open acts as a flag so
* that get_content_data_edit() calls load_editor() immediately upon completion.
*
* Exported:
*   dedalo_api_test_environment — constructor function
*
* Server peer: core/area_maintenance/widgets/dedalo_api_test_environment/
*   class.dedalo_api_test_environment.php
* Render peer: render_dedalo_api_test_environment.js
*   (holds get_content_data_edit and the prototype.list method)
*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_dedalo_api_test_environment} from './render_dedalo_api_test_environment.js'



/**
* DEDALO_API_TEST_ENVIRONMENT
* Constructor for the API test-environment widget instance.
*
* Instance properties follow the standard Dédalo widget contract defined in
* widget_common.  All lifecycle methods (init, build, render, destroy) are
* inherited from widget_common.prototype; the render methods (edit/list) are
* delegated to render_dedalo_api_test_environment.prototype.list.
*
* Additional properties specific to this widget:
*   @var {boolean|undefined} _open    — set to true by load() the first time the
*                                       panel is opened; consumed by get_content_data_edit
*                                       to decide whether to call load_editor() eagerly.
*   @var {Function|undefined} activate — injected by get_content_data_edit once the
*                                        DOM scaffold is ready; calling it builds the
*                                        JSON editor inside json_editor_api_container.
*   @var {Object|undefined} editor    — reference to the svelte-jsoneditor instance,
*                                       set by load_editor(); null-checked on re-build
*                                       to prevent duplicate editor creation.
*/
export const dedalo_api_test_environment = function() {

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
}//end dedalo_api_test_environment



/**
* COMMON FUNCTIONS
* Extend lifecycle and render methods from shared widget prototypes.
*
* All standard widget lifecycle steps (init, build, render, destroy) are copied
* directly from widget_common.prototype so this widget participates in the normal
* component_info autoload flow without custom logic.
*
* The edit and list render modes both resolve to the same implementation
* (render_dedalo_api_test_environment.prototype.list) because the widget has no
* distinct display-only view — administrators always interact with the live editor.
*
* The load method is overridden here (not in widget_common) to implement the
* deferred-editor pattern: it marks the instance as open and triggers the JSON
* editor factory if it is already available, without re-building the DOM wrapper.
*/
// prototypes assign
	// // lifecycle
	dedalo_api_test_environment.prototype.init		= widget_common.prototype.init
	dedalo_api_test_environment.prototype.build		= widget_common.prototype.build
	dedalo_api_test_environment.prototype.render	= widget_common.prototype.render
	dedalo_api_test_environment.prototype.destroy	= widget_common.prototype.destroy
	// // render
	dedalo_api_test_environment.prototype.edit		= render_dedalo_api_test_environment.prototype.list
	dedalo_api_test_environment.prototype.list		= render_dedalo_api_test_environment.prototype.list
	// // load (defer heavy JSON editor build until widget is opened)
	/**
	* LOAD
	* Called by the host panel (area_maintenance) when the user first opens this
	* widget's collapsible section.  Marks the instance as open and delegates to
	* self.activate() when that factory has already been registered by
	* get_content_data_edit.  If the content scaffold has not yet resolved (race
	* between panel-open and async spinner callback), self._open is used as a flag
	* so that get_content_data_edit will call load_editor() upon completion instead.
	*
	* The deferred-load pattern avoids instantiating the heavy svelte-jsoneditor
	* library for widgets that are never opened during a page session.
	*
	* @returns {Promise<boolean>} Always resolves to true once the flag is set.
	*/
	dedalo_api_test_environment.prototype.load = async function() {
		this._open = true
		if (typeof this.activate==='function') {
			this.activate()
		}
		return true
	}



// @license-end
