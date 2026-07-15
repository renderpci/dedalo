// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals*/
/*eslint no-undef: "error"*/



// imports
	import { tool_common, wire_tool } from '../../../core/tools_common/js/tool_common.js'
	import { render_tool_sitebuilder } from './render_tool_sitebuilder.js'



/**
 * TOOL_SITEBUILDER
 * Client constructor for the site-builder workspace tool.
 *
 * The tool is a full-page workspace (register.json `open_as: 'window'`), not a component
 * editor: it has no affected model and no ddo_map. It talks only to its own server actions
 * (which proxy to the standalone Site Builder daemon), so build() does not resolve a
 * main_element the way a component tool does.
 *
 * Properties are declared upfront (predictable instance shape); `controller` holds the
 * workspace state machine (sitebuilder_controller), created lazily by the render layer and
 * cached across refreshes.
 */
export const tool_sitebuilder = function() {

	this.id				= null
	this.model			= null
	this.mode			= null
	this.node			= null
	this.ar_instances	= null
	this.events_tokens	= null
	this.status			= null
	this.type			= null
	this.caller			= null
	this.langs			= null
	this.controller		= null
}//end tool_sitebuilder



// Standard prototype wiring: render/destroy/refresh from tool_common, edit from the render
// module. tool_request (the server round-trip) also comes from tool_common.
wire_tool(tool_sitebuilder, render_tool_sitebuilder)



/**
 * INIT
 * Seed the common tool vars, then set the workspace-specific ones. Step 1 of init → build
 * → render.
 *
 * @param {Object} options  {lang}
 * @returns {Promise<boolean>}
 */
tool_sitebuilder.prototype.init = async function(options) {

	const self = this

	const common_init = await tool_common.prototype.init.call(this, options)

	try {
		self.lang	= options.lang
		self.langs	= page_globals.dedalo_projects_default_langs
	} catch (error) {
		self.error = error
		console.error(error)
	}

	return common_init
}//end init



/**
 * BUILD
 * Load the tool CSS via the common build. There is no ddo_map to resolve (empty by
 * design), so the default loader is a no-op and no main_element is looked up.
 *
 * @param {boolean} [autoload=false]
 * @returns {Promise<boolean>}
 */
tool_sitebuilder.prototype.build = async function(autoload=false) {

	const self = this
	return tool_common.prototype.build.call(this, autoload)
}//end build
