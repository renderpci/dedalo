// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global*/
/*eslint no-undef: "error"*/



// imports
	import { sitebuilder_controller } from './sitebuilder_controller.js'



/**
 * RENDER_TOOL_SITEBUILDER
 * The render layer for the site-builder workspace. Unlike a component-editing tool it has
 * no ddo_map and no main_element: it is a full-page workspace (opened as a window), so
 * edit() builds a bespoke three-pane layout — sites list, chat, preview — and hands the
 * pane nodes to a controller that owns all behavior and server round-trips.
 *
 * The controller is created ONCE and cached on the tool instance, so a re-render (refresh)
 * does not lose the selected site or the live session.
 *
 * @module render_tool_sitebuilder
 */
export const render_tool_sitebuilder = function() {
	return true
}//end render_tool_sitebuilder



/**
 * EDIT
 * Build and return the workspace root node. Wired onto the tool prototype by wire_tool().
 *
 * @returns {Promise<HTMLElement>}
 */
render_tool_sitebuilder.prototype.edit = async function() {

	const self = this

	const root = document.createElement('div')
	root.className = 'tool_sitebuilder'

	const sites = document.createElement('aside')
	sites.className = 'sb_pane sb_pane_sites'

	const chat = document.createElement('section')
	chat.className = 'sb_pane sb_pane_chat'

	const preview = document.createElement('section')
	preview.className = 'sb_pane sb_pane_preview'

	root.append(sites, chat, preview)

	// One controller per tool instance, cached so refresh() keeps live state.
	if (!self.controller) {
		self.controller = new sitebuilder_controller(self, { root, sites, chat, preview })
	} else {
		self.controller.nodes = { root, sites, chat, preview }
	}

	self.node = root

	// Boot asynchronously; the panes fill in as the daemon answers.
	self.controller.boot()

	return root
}//end edit
