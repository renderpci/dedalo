// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global*/
/*eslint no-undef: "error"*/



/**
* SITE_BUILDER_STATUS
* area_maintenance widget for the Site Builder daemon. It is display-only plus a single
* launcher: it shows whether the daemon is configured and reachable, which coding agents it
* has available, and the most recent publishes, and it offers an "Open site builder" button
* that launches the workspace in its own window.
*
* The launcher lives here — in the maintenance area — deliberately: opening the site builder
* is an occasional, admin/developer action (like opening the Swagger UI from the
* publication_api widget), not a per-screen tool, so it does not belong in the top menu bar.
* Because area_maintenance is gated to global admins and developers, only they see this
* launch point; the tool's own grant and the publish gate still apply on top.
*
* Value shape (populated server-side by the widget's eagerValue in
* src/core/area_maintenance/widgets/site_builder_status.ts):
*   {
*     configured     : boolean,
*     reachable      : boolean,
*     url_host       : string|null,
*     drivers        : Array<{id, available, version, is_default}>,
*     last_publishes : Array<{ts, actor, action, site, detail}>
*   }
*
* Server peer:  src/core/area_maintenance/widgets/site_builder_status.ts
* Render peer:  ./render_site_builder_status.js
*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_site_builder_status} from './render_site_builder_status.js'



/**
* SITE_BUILDER_STATUS
* Constructor. Declares the well-known widget instance properties (seeded during the
* inherited init()).
*/
export const site_builder_status = function() {

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
}//end site_builder_status



// prototypes assign
	// lifecycle (from widget_common)
	site_builder_status.prototype.init		= widget_common.prototype.init
	site_builder_status.prototype.build		= widget_common.prototype.build
	site_builder_status.prototype.render	= widget_common.prototype.render
	site_builder_status.prototype.destroy	= widget_common.prototype.destroy
	// render (edit and list are identical — a display-only widget)
	site_builder_status.prototype.edit		= render_site_builder_status.prototype.list
	site_builder_status.prototype.list		= render_site_builder_status.prototype.list



// @license-end
