// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, SHOW_DEVELOPER, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



/**
 * TOOL_NUMISDATA_ACQUISITION
 *
 * Paste a public auction URL, fetch + parse it server-side (preview_url),
 * review every lot found (exclude any before committing), then commit_lots
 * creates one real numisdata4 record per kept lot — fields, the Auction
 * relation (found-or-created once for the whole batch), and the split
 * obverse/reverse image via tool_import_files' crop_50 processor.
 *
 * Not yet built: the other four auction sources (only jesusvico.com is
 * wired up server-side so far), and a background-job path for very large
 * multi-page auctions (preview_url is still a single synchronous request).
 */



// imports
	import {dd_console} from '../../../core/common/js/utils/index.js'
// tool_common: base lifecycle (init/build/render), tool_request, wire_tool
	import {tool_common, wire_tool} from '../../../core/tools_common/js/tool_common.js'
// specific render of the tool
	import {render_tool_numisdata_acquisition} from './render_tool_numisdata_acquisition.js'



/**
* TOOL_NUMISDATA_ACQUISITION
* Tool constructor. Declares every instance property used by this tool.
*/
export const tool_numisdata_acquisition = function () {

	this.id				= null
	this.model			= null
	this.mode			= null
	this.node			= null
	this.ar_instances	= null
	this.events_tokens	= null
	this.status			= null
	this.main_element	= null
	this.type			= null
	this.caller			= null
	this.langs			= null
}//end tool_numisdata_acquisition



// wire_tool performs the standard prototype assignments (render/destroy/refresh
// from tool_common, edit from render_tool_numisdata_acquisition). It does NOT
// wire tool_request (confirmed against tool_export.js, a real server-backed
// tool — the tool_dev_template exemplar omits this line, a gap in the
// scaffold itself) — every tool that talks to its own server module needs
// this explicitly.
wire_tool(tool_numisdata_acquisition, render_tool_numisdata_acquisition)
tool_numisdata_acquisition.prototype.tool_request = tool_common.prototype.tool_request



/**
* INIT
* Mirrors the Dédalo tool lifecycle contract (step 1 of 3): init → build → render.
* @param {Object} options - options.lang {string} active UI language code
* @returns {Promise<boolean>}
*/
tool_numisdata_acquisition.prototype.init = async function(options) {

	const self = this

	const common_init = await tool_common.prototype.init.call(this, options);

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
* Mirrors the Dédalo tool lifecycle contract (step 2 of 3): init → build → render.
* No ddo_map is registered for this tool (register.json carries none), so the
* base build resolves self.ar_instances to a single synthetic entry pointing at
* the caller (the numisdata4 section) — this tool doesn't render that instance,
* it only needs self.section_tipo for the server call, already set by init.
* @param {boolean} [autoload=false]
* @returns {Promise<boolean>}
*/
tool_numisdata_acquisition.prototype.build = async function(autoload=false) {

	return await tool_common.prototype.build.call(this, autoload);
}//end build



/**
* PREVIEW_URL
* Dispatches action 'preview_url' to the tool's server module, IN THE
* BACKGROUND (server/index.ts declares it backgroundRunnable): a multi-page
* auction listing is fetched one rate-limited page at a time and can easily
* run 30s+, long enough that a synchronous call hit the client's own retry
* timeout and collided with the idempotency lock on the still-running first
* attempt (observed live). The HTTP call answers immediately with
* {job_id, background_job_id, pid, pfile}; the caller (render layer) drives
* the actual progress/result via data_manager.request_stream +
* render_common's render_stream, the same mechanism tool_import_files uses
* for its own background import job.
*
* @param {string} url - the pasted auction URL
* @returns {Promise<Object>} API response envelope; on success carries
*   pid/pfile as extension keys (NOT under .data) for the caller to stream.
*/
tool_numisdata_acquisition.prototype.preview_url = async function(url) {

	const self = this

	const response = await self.tool_request({
		action		: 'preview_url',
		background	: true,
		options		: {
			url				: url,
			section_tipo	: self.section_tipo
		}
	})

	if(SHOW_DEVELOPER===true) {
		dd_console("-> preview_url API response (job dispatch):",'DEBUG',response);
	}

	return response
}//end preview_url



/**
* COMMIT_LOTS
* Dispatches action 'commit_lots' to the tool's server module, IN THE
* BACKGROUND (server/index.ts declares it backgroundRunnable): creates one
* numisdata4 record per lot — weight/diameter/lot-number/date-text/obverse-
* reverse-design fields, its own Auction resolution (cached per distinct
* auction across the batch), and the image (download, crop_50 split, link
* through Obverse/Reverse) — easily minutes for a real review batch, so this
* streams the same way preview_url does rather than one synchronous call
* (observed live: a 190-lot batch blew the client's retry window).
*
* @param {Object[]} lots - the curated ExtractedLot[] (excluded ones dropped)
* @param {Object} auction - the ExtractedAuction JSON preview_url returned (unmodified)
* @returns {Promise<Object>} API response envelope; on success carries
*   pid/pfile as extension keys (NOT under .data) for the caller to stream.
*   The terminal frame's data is { results: [{ lot_identifier, section_tipo,
*   section_id, fields_written, auction_section_id, auction_created,
*   auction_error, images_created, images_error }, ...] } — the *_error
*   fields are non-null when that step failed without rolling back what
*   already succeeded.
*/
tool_numisdata_acquisition.prototype.commit_lots = async function(lots, auction) {

	const self = this

	const response = await self.tool_request({
		action		: 'commit_lots',
		background	: true,
		options		: {
			lots			: lots,
			auction			: auction,
			section_tipo	: self.section_tipo
		}
	})

	if(SHOW_DEVELOPER===true) {
		dd_console("-> commit_lots API response (job dispatch):",'DEBUG',response);
	}

	return response
}//end commit_lots



// @license-end
