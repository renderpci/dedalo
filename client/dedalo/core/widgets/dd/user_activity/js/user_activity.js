// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../widget_common/js/widget_common.js'
	import {render_user_activity} from '../js/render_user_activity.js'



/**
* USER_ACTIVITY
* Client-side widget constructor for the user-activity dashboard panel.
*
* Displays aggregated user-activity statistics (action types, sections
* touched, hourly distribution, publications) as D3-rendered charts with
* a summary KPI strip. Data is fetched asynchronously from the PHP
* `user_activity` widget via the `dd_component_info` API endpoint;
* `render_user_activity` handles layout and chart rendering.
*
* Lifecycle: init → build → render (edit/list both delegate to
* render_user_activity.prototype.edit, which performs the async API call
* when `self.value` is empty).
*
* Inherits all lifecycle methods from widget_common (init, build, destroy,
* render). Edit and list render modes share the same render function.
*/
export const user_activity = function(){

	this.id			// {string} unique DOM/instance identifier assigned by widget_common.init

	this.section_tipo	// {string} ontology tipo of the host section (e.g. 'dd793')
	this.section_id		// {string} record id of the host section; used as the user identifier
	this.lang			// {string} active language code (IETF, e.g. 'es-ES')
	this.mode			// {string} rendering mode: 'edit' | 'list'

	this.value			// {Array|null} raw widget payload from PHP get_data(); an array of
						//   { widget, key, widget_id, value } objects where widget_id === 'totals'
						//   holds the canonical {who, what, where, when, publish} stats object.
						//   Populated during init (from options) or lazily by the async API fetch.

	this.node			// {HTMLElement|null} root DOM node injected by widget_common.render

	this.status			// {string} lifecycle phase: 'initializing' | 'initialized' | 'building' | 'built'

	this.events_tokens = [] // {Array} event-manager subscription tokens registered by this instance;
							//   cleaned up in widget_common.prototype.destroy to prevent memory leaks
}//end user_activity



/**
* COMMON FUNCTIONS
* Extend the user_activity instance with shared prototype methods from
* widget_common (lifecycle: init, build, destroy, render) and from
* render_user_activity (UI: edit, list).
*
* Both 'edit' and 'list' modes delegate to render_user_activity.prototype.edit
* because the activity dashboard has the same visual output in both contexts.
*/
// prototypes assign
	// lifecycle
	user_activity.prototype.init	= widget_common.prototype.init
	user_activity.prototype.build	= widget_common.prototype.build
	user_activity.prototype.destroy	= widget_common.prototype.destroy
	user_activity.prototype.render	= widget_common.prototype.render
	// render
	user_activity.prototype.edit	= render_user_activity.prototype.edit
	user_activity.prototype.list	= render_user_activity.prototype.edit // (!) list reuses edit render — no separate list layout



// @license-end
