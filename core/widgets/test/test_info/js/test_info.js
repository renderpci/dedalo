// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../widget_common/js/widget_common.js'
	import {render_test_info} from '../js/render_test_info.js'



/**
* TEST_INFO
* Minimal test widget exercising the component_info rendering pipeline.
*
* This widget is intended exclusively for development and QA: it wires up the
* standard widget lifecycle (init → build → render) and delegates rendering to
* render_test_info, which displays the raw key/value pairs produced by the
* server-side class.test_info::get_data().  No production section or component
* type maps to this widget; it is only registered during test sessions.
*
* Instance properties are set by widget_common.prototype.init from the options
* object passed by the caller (typically component_info during widget boot).
*/
export const test_info = function(){

	this.id				// {string} unique DOM/instance identifier assigned by init

	this.section_tipo	// {string} ontology tipo of the host section (e.g. 'oh1')
	this.section_id		// {string|number} record identifier within the host section
	this.lang			// {string} active UI language code (e.g. 'lg-eng')
	this.mode			// {string} render mode — 'edit' | 'list' | 'edit_in_list' | 'list_in_list'

	this.value			// {Array} data items produced by class.test_info::get_data(); each item is
						//         an Object with at least {widget_id, id, value} properties

	this.node			// {HTMLElement|undefined} root DOM node after render(); undefined before first render

	this.events_tokens	= []	// {Array} event subscription tokens; populated by lifecycle methods
	this.ar_instances	= []	// {Array} child widget instances managed by this instance

	this.status			// {string} lifecycle phase: 'initializing' | 'initialized' | 'building' | 'built' | 'rendered'

	return true
}//end test_info



/**
* COMMON FUNCTIONS
* Extend test_info with shared lifecycle and render methods.
*
* Lifecycle methods (init, build, render, destroy) come from widget_common and
* handle options normalisation, optional server-side data load (when caller is
* component_info and autoload is true), and DOM mounting / teardown.
*
* Render methods (edit, list) come from render_test_info and build an <ul> of
* key/value <li> rows from this.value, wrapped in the standard widget wrapper
* produced by ui.widget.build_wrapper_edit.
*
* (!) Individual prototype.x = … lines are not doc-blocked here; documentation
* lives at the source method definitions in widget_common.js and render_test_info.js.
*/
// prototypes assign
	// lifecycle
	test_info.prototype.init		= widget_common.prototype.init
	test_info.prototype.build		= widget_common.prototype.build
	test_info.prototype.render		= widget_common.prototype.render
	test_info.prototype.destroy		= widget_common.prototype.destroy
	// render
	test_info.prototype.edit		= render_test_info.prototype.edit
	test_info.prototype.list		= render_test_info.prototype.list



// @license-end
