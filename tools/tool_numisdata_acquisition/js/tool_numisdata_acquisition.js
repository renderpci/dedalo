// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, SHOW_DEVELOPER, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



/**
 * TOOL_NUMISDATA_ACQUISITION
 *
 * Paste a public auction URL, fetch + parse it server-side (preview_url),
 * review every lot found, then commit_lots creates one numisdata4 record per
 * kept lot — fields, Auction/Type relations, and the split obverse/reverse
 * image via tool_import_files' crop_50 processor.
 *
 * All five sources (jesusvico, biddr, aureo, numisbids, sixbid) are wired up
 * server-side; only jesusvico and biddr are verified against real data.
 */



// imports
	import {dd_console} from '../../../core/common/js/utils/index.js'
	import {tool_common, wire_tool} from '../../../core/tools_common/js/tool_common.js'
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



// wire_tool does NOT wire tool_request (confirmed against tool_export.js — a
// gap in the tool_dev_template scaffold itself), so every server-backed tool
// needs this explicitly.
wire_tool(tool_numisdata_acquisition, render_tool_numisdata_acquisition)
tool_numisdata_acquisition.prototype.tool_request = tool_common.prototype.tool_request



/**
* INIT
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
* No ddo_map is registered (register.json carries none), so the base build
* resolves self.ar_instances to a single synthetic entry — this tool only
* needs self.section_tipo, already set by init.
* @param {boolean} [autoload=false]
* @returns {Promise<boolean>}
*/
tool_numisdata_acquisition.prototype.build = async function(autoload=false) {

	return await tool_common.prototype.build.call(this, autoload);
}//end build



/**
* PREVIEW_URL
* Dispatches 'preview_url' in the background (server/index.ts declares it
* backgroundRunnable — a multi-page listing can run 30s+, long enough to hit
* the client's own retry timeout). The caller streams progress/result via
* data_manager.request_stream + render_stream.
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
* PREVIEW_HTML
* Dispatches 'preview_html' as a plain (non-background) request — nothing is
* fetched over the network, just cheerio parsing of HTML the operator's own
* browser already retrieved, so it's fast enough not to need job-streaming.
* The fallback for a source whose own defenses block this tool's automated
* fetch (e.g. numisbids.com) — a real browser visiting the page isn't
* automated retrieval, so there's nothing to bypass. Never written to disk.
* @param {string} url - the page's original URL (still needed: picks the
*   right adapter/parser and resolves relative links/the Auction dedup key)
* @param {string} html - the saved page's HTML content
* @returns {Promise<Object>} API response envelope — same shape as
*   preview_url's, just not backgrounded.
*/
tool_numisdata_acquisition.prototype.preview_html = async function(url, html) {

	const self = this

	const response = await self.tool_request({
		action		: 'preview_html',
		options		: {
			url				: url,
			html			: html,
			section_tipo	: self.section_tipo
		}
	})

	if(SHOW_DEVELOPER===true) {
		dd_console("-> preview_html API response:",'DEBUG',response);
	}

	return response
}//end preview_html



/**
* COMMIT_LOTS
* Dispatches 'commit_lots' in the background — creates one numisdata4 record
* per lot (fields, Auction/Type resolution, image split via crop_50), easily
* minutes for a real batch.
* @param {Object[]} lots - the curated ExtractedLot[] (excluded ones dropped)
* @param {Object} auction - the ExtractedAuction JSON preview_url returned (unmodified)
* @returns {Promise<Object>} API response envelope; on success carries
*   pid/pfile as extension keys (NOT under .data) for the caller to stream.
*   The terminal frame's data is { results: [{ lot_identifier, section_tipo,
*   section_id, fields_written, auction_section_id, auction_created,
*   auction_error, type_section_id, type_citation, type_error,
*   images_created, images_error }, ...] } — the *_error fields are non-null
*   when that step failed without rolling back what already succeeded.
*   type_section_id links only to an EXISTING numisdata3 record (never
*   created); a non-null type_citation with a null type_section_id means "a
*   citation was found but nothing in the catalog matched it."
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
