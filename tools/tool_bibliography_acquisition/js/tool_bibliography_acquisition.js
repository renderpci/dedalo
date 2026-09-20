// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, SHOW_DEVELOPER, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



/**
 * TOOL_BIBLIOGRAPHY_ACQUISITION
 *
 * Paste a public OAI-PMH journal URL, harvest + parse it server-side
 * (preview_url), review every publication found, then commit_publications
 * creates one rsc205 record per kept publication — fields, Series/Author
 * relations, and the PDF document when one is found.
 */



// imports
	import {dd_console} from '../../../core/common/js/utils/index.js'
	import {tool_common, wire_tool} from '../../../core/tools_common/js/tool_common.js'
	import {render_tool_bibliography_acquisition} from './render_tool_bibliography_acquisition.js'



/**
* TOOL_BIBLIOGRAPHY_ACQUISITION
* Tool constructor. Declares every instance property used by this tool.
*/
export const tool_bibliography_acquisition = function () {

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
}//end tool_bibliography_acquisition



// wire_tool does NOT wire tool_request (a gap in the tool_dev_template
// scaffold itself, confirmed against tool_numisdata_acquisition), so every
// server-backed tool needs this explicitly.
wire_tool(tool_bibliography_acquisition, render_tool_bibliography_acquisition)
tool_bibliography_acquisition.prototype.tool_request = tool_common.prototype.tool_request



/**
* INIT
* @param {Object} options - options.lang {string} active UI language code
* @returns {Promise<boolean>}
*/
tool_bibliography_acquisition.prototype.init = async function(options) {

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
tool_bibliography_acquisition.prototype.build = async function(autoload=false) {

	return await tool_common.prototype.build.call(this, autoload);
}//end build



/**
* PREVIEW_URL
* Dispatches 'preview_url' in the background (server/index.ts declares it
* backgroundRunnable — a full-journal OAI-PMH harvest can page through
* hundreds of records). The caller streams progress/result via
* data_manager.request_stream + render_stream.
* @param {string} url - the pasted journal/OAI-PMH URL
* @returns {Promise<Object>} API response envelope; on success carries
*   pid/pfile as extension keys (NOT under .data) for the caller to stream.
*/
tool_bibliography_acquisition.prototype.preview_url = async function(url) {

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
* fetched over the network, just parsing of content the operator's own
* browser already retrieved, so it's fast enough not to need job-streaming.
* The fallback for a source whose own defenses block this tool's automated
* fetch (confirmed live: OJS journal landing pages sit behind a Cloudflare
* challenge). Never written to disk.
* @param {string} url - the page's original URL (still needed: picks the
*   right adapter/parser and resolves the Series dedup key)
* @param {string} html - the saved page's content (an OAI-PMH XML response)
* @returns {Promise<Object>} API response envelope — same shape as
*   preview_url's, just not backgrounded.
*/
tool_bibliography_acquisition.prototype.preview_html = async function(url, html) {

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
* COMMIT_PUBLICATIONS
* Dispatches 'commit_publications' in the background — creates one rsc205
* record per publication (fields, Series/Author resolution, PDF import),
* easily minutes for a real batch.
* @param {Object[]} publications - the curated ExtractedPublication[] (excluded ones dropped)
* @returns {Promise<Object>} API response envelope; on success carries
*   pid/pfile as extension keys (NOT under .data) for the caller to stream.
*   The terminal frame's data is { results: [{ publication_identifier,
*   section_tipo, section_id, fields_written, series_section_id,
*   series_created, series_error, author_section_ids, author_errors,
*   document_imported, document_error }, ...] } — the *_error fields are
*   non-null when that step failed without rolling back what already
*   succeeded.
*/
tool_bibliography_acquisition.prototype.commit_publications = async function(publications) {

	const self = this

	const response = await self.tool_request({
		action		: 'commit_publications',
		background	: true,
		options		: {
			publications	: publications,
			section_tipo	: self.section_tipo
		}
	})

	if(SHOW_DEVELOPER===true) {
		dd_console("-> commit_publications API response (job dispatch):",'DEBUG',response);
	}

	return response
}//end commit_publications



// @license-end
