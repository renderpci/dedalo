// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global SHOW_DEVELOPER, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



/**
* TOOL_IDENTIFY
*
* Curator-facing front end of the object-identification engine
* (`engineering/IDENTIFY_SPEC.md`). It is opened from an OBJECT RECORD — the
* section inspector button, `show_in_inspector: true` in register.json — and
* answers one question: which records are most likely to be the same type as
* this one, and WHY.
*
* NO SERVER MODULE. The engine is already reachable over the normal gated API
* as `dd_identify_api:find_matches`, so this tool calls it directly through
* `data_manager` (the precedent is `core/search/js/search.js` calling
* `dd_rag_api:semantic_search`, and `tools/tool_cataloging/` which ships no
* server/ directory at all). A tool-local server module would only re-wrap an
* endpoint that already exists, adding a second permission surface for nothing.
* Everything the tool needs is on the wire already:
*   - the ranked results with their per-criterion `outcomes`,
*   - `blind_criteria`, `restricted_criteria` and `more_available` (the engine's
*     own anti-over-claim signals — this tool renders ALL THREE, never silently;
*     `restricted_criteria` is what makes a partial score say it is partial),
*   - the clean declines (`no_profile` | `invalid_profile` | `forbidden` |
*     `missing_seed`), which arrive as HTTP 200 with `result:false`.
*
* Record titles come from the EXISTING batched, ACL-checked
* `get_section_terms` endpoint via `fetch_section_terms` — no new endpoint,
* and locators whose terms the server declines to resolve simply keep their
* locator as the visible title.
*
* PROPOSALS: THE OTHER HALF. `dd_identify_api:get_proposals` answers the second
* question — not "which records are like this one" but "what should this record
* SAY". Two sources answer it and they do not make the same claim: a weighted
* vote over already-tagged neighbours ("seven similar coins record this") and a
* vision model constrained to the profile's vocabulary ("a model looking at the
* photograph suggested this"). The panel renders them apart, on purpose (see
* render_tool_identify.js), and the VISION source is opt-in per run because it
* calls a paid model and may send the record's photograph off the host.
*
* ACCEPTANCE USES THE ORDINARY COMPONENT SAVE, and nothing else. `accept_proposal`
* below gets a live component instance through `get_instance` and calls
* `change_value` — exactly what `tools/tool_cataloging/js/tool_cataloging.js`
* does, and exactly what the record's own edit form does when the curator types.
* There is deliberately NO tool-side write endpoint: the result must be
* indistinguishable from a hand-entered value (same TM audit, same observers,
* same server-side permission check), and a second write path is one more place
* for the save contract to drift.
*
* This file defines:
*   - `tool_identify` constructor — instance property declarations
*   - Lifecycle: init, build (both call their tool_common supers)
*   - find_matches   — the API round trip; fills self.report or self.decline
*   - get_proposals  — the proposals round trip; fills self.proposals / decline
*   - accept_proposal— the ordinary component save (get_instance + change_value)
*   - check_type_record — server-verified existence of a hand-typed Type id
*   - proposal_key   — the identity a dismissal is remembered by (memory only)
*   - resolve_labels — locators → record titles (batched, existing endpoint)
*   - open_record    — open a candidate through the client's own navigation
*   - on_close_actions — modal teardown
*
* The DOM lives in render_tool_identify.js, wired in by `wire_tool()` below.
*/



// imports
	// tool_common: base lifecycle (init/build/render), wire_tool
	import {tool_common, wire_tool} from '../../../core/tools_common/js/tool_common.js'
	// data_manager: raw API access. This tool has no server module, so it talks
	// to the already-registered dd_identify_api class directly.
	import {data_manager} from '../../../core/common/js/data_manager.js'
	// get_instance: the client's ONE component instance factory. Accepting a
	// proposal writes through a real component instance, never a bespoke call.
	import {get_instance} from '../../../core/common/js/instances.js'
	// fetch_section_terms: the client's existing batched locator → title resolver
	// (server action 'get_section_terms', per-locator read permission checked).
	import {fetch_section_terms} from '../../../core/section/js/build_graph_data.js'
	// open_window + object_to_url_vars: the client's own record deep-link grammar
	// (same one render_list_section.js uses for its "open record" button).
	// clone: the caller's SQO is NEVER mutated — a tool that narrows the user's
	// own filter leaves them looking at a different list than the one they built.
	import {open_window, object_to_url_vars, clone} from '../../../core/common/js/utils/index.js'
	// specific render of the tool
	import {render_tool_identify} from './render_tool_identify.js'
	// the promotion flow's pure decisions (no DOM, no network): what a member's
	// save actually did, and whether the component may hold another link at all.
	import {attach_outcome, data_limit_refusal, server_total} from './promote_rules.js'



/**
* TOOL_IDENTIFY
* Tool constructor. Declares every instance property used by this tool.
*
* Properties:
*   id            - unique tool instance identifier (set by tool_common.init)
*   model         - string model name, always 'tool_identify'
*   mode          - display mode: 'edit'
*   node          - root HTMLElement rendered by render()
*   ar_instances  - live instances (always [] here: the tool renders no components)
*   events_tokens - event subscription tokens, unsubscribed by destroy()
*   status        - lifecycle state (null | 'inited' | 'built' | 'ready')
*   type          - 'tool'
*   caller        - the SECTION instance (the object record) that opened the tool
*   lang          - active UI language code
*   seed          - {section_tipo, section_id} of the record being identified,
*                   or null when the tool was opened without a saved record
*   limit         - how many scored candidates to ask for (server clamps [1,50])
*   report        - the last successful result object from find_matches, or null
*   decline       - {code, msg} of the last clean decline, or null
*   labels        - map `${section_tipo}_${section_id}` → record title
*   proposals     - the last successful get_proposals result object, or null
*   proposals_decline - {code, msg} of the last proposals decline, or null
*   vision        - whether the NEXT proposals run asks the vision model too.
*                   Starts FALSE, always: that source costs money and may send
*                   the record's photograph off the host, so it is a decision
*                   the curator makes per run, never a default.
*   dismissed     - proposal keys the curator rejected, in MEMORY ONLY. There is
*                   no schema for a persisted rejection and inventing one is out
*                   of scope, so a dismissed proposal simply does not come back
*                   until the panel is reopened.
*   accepted      - how many proposals were written this session (drives the
*                   caller refresh on close: this tool now writes)
*   clusters      - the last successful cluster report, or null
*   clusters_decline  - {code, msg} of the last clustering decline, or null
*   cluster_cap   - how many records one foreground run compares (shown in the
*                   UI: a grouping cannot be read without knowing its bound)
*   type_link_decline - {code, msg} of the last resolve_type_link decline. The
*                   two that matter are ANSWERS about the collection, not
*                   errors: 'no_type_section' (no canonical Types exist here) and
*                   'no_link_component' (the profile does not reveal which
*                   component is the Type link) — both mean promotion is not
*                   offered at all.
*   promoted      - how many members were attached to a Type this session
*                   (counted with `accepted` for the caller refresh on close)
*/
export const tool_identify = function () {

	this.id				= null
	this.model			= null
	this.mode			= null
	this.node			= null
	this.ar_instances	= null
	this.events_tokens	= null
	this.status			= null
	this.type			= null
	this.caller			= null
	this.lang			= null

	this.seed			= null
	this.limit			= 20
	this.report			= null
	this.decline		= null
	this.labels			= null

	this.proposals			= null
	this.proposals_decline	= null
	this.vision				= false
	this.dismissed			= null
	this.accepted			= 0

	this.clusters			= null
	this.clusters_decline	= null
	this.cluster_cap		= 200
	this.type_link_decline	= null
	this.promoted			= 0
}//end tool_identify



/**
* COMMON FUNCTIONS
* wire_tool performs the standard prototype assignments in one call:
*   render  <- tool_common.prototype.render
*   destroy <- common.prototype.destroy   (unsubscribes self.events_tokens)
*   refresh <- common.prototype.refresh
*   edit    <- render_tool_identify.prototype.edit
*/
wire_tool(tool_identify, render_tool_identify)

// tool_request. NOT wired by wire_tool (tools do not inherit tool_common's
// prototype — they copy the methods they use). The clustering half needs it:
// `cluster` is the tool's ONE server-module action, and `dd_tools_api /
// tool_request` is the only door onto a tool module. Everything else in this
// tool talks to dd_identify_api directly, which needs no tool wire at all.
tool_identify.prototype.tool_request = tool_common.prototype.tool_request



/**
* INIT
* Lifecycle step 1 of 3 (init → build → render).
*
* Calls the generic tool_common init first (it assigns model / section_tipo /
* section_id / lang / mode, resolves the caller and the tool_config), then
* resolves the SEED: the record this tool is about.
*
* The seed is read from the CALLER, not from `self.section_tipo` — a tool's own
* section_tipo is the tools registry section (dd1324), not the object's.
* `section_id_selected` is the fallback for the callers that carry the chosen
* record there rather than on `section_id`.
*
* A null seed is not an error state here: it is reported as the honest
* `missing_seed` decline by the render, which reads better than the generic
* tool error view.
*
* @param {Object} options - initialisation options forwarded from open_tool
*   options.lang {string} active UI language code (e.g. 'lg-spa')
* @returns {Promise<boolean>} the common_init sentinel value
*/
tool_identify.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	try {

		// (!) custom tool code inside try/catch so Dédalo can recover
		// (self.error triggers the generic error view instead of edit())

		self.lang = options.lang

		// seed. The record being identified, taken from the caller (a section
		// instance in edit mode). Both coordinates must be present and the
		// section_id must be a real, saved id.
			const caller		= self.caller || {}
			const section_tipo	= caller.section_tipo || null
			const raw_id		= (caller.section_id !== null && caller.section_id !== undefined)
				? caller.section_id
				: caller.section_id_selected
			const section_id	= Number(raw_id)

			self.seed = (typeof section_tipo==='string' && section_tipo.length>0 && Number.isFinite(section_id) && section_id>0)
				? { section_tipo : section_tipo, section_id : section_id }
				: null

		// labels map starts empty; resolve_labels fills it per report
			self.labels = {}

		// proposals state. `vision` starts false and is never persisted: opting
		// into a paid, possibly-egressing model is a per-run decision, and a
		// remembered "yes" would spend money on a panel someone merely opened.
			self.proposals			= null
			self.proposals_decline	= null
			self.vision				= false
			self.dismissed			= []
			self.accepted			= 0

		// clusters / promotion state. Nothing runs until the curator asks:
		// clustering compares a whole pool of records and promotion WRITES.
			self.clusters			= null
			self.clusters_decline	= null
			self.type_link_decline	= null
			self.promoted			= 0

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_init
}//end init



/**
* BUILD
* Lifecycle step 2 of 3.
*
* Calls the tool_common build super (it loads the tool CSS), but replaces the
* default ddo_map loader with a no-op: this tool renders no component
* instances, only its own DOM over the API answer. Without the override the
* generic loader would rebuild the caller's components for nothing.
*
* @param {boolean} [autoload=false] - forwarded to the super
* @returns {Promise<boolean>} the common_build sentinel value
*/
tool_identify.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build (loads the tool CSS)
		const common_build = await tool_common.prototype.build.call(this, autoload, {
			load_ddo_map : async function() {
				self.ar_instances = []
				return true
			}
		});


	return common_build
}//end build



/**
* FIND_MATCHES
* The one server round trip: `dd_identify_api:find_matches`.
*
* Called directly through data_manager (no tool server module — see the file
* header). The dispatcher has already required a session and verified CSRF;
* the request principal is the ACL gate on the engine side, never a parameter
* sent from here.
*
* Result handling has exactly three outcomes, kept apart on purpose:
*   - success   → self.report is the result object, self.decline null
*   - DECLINE   → HTTP 200 with `result:false` and `errors:[code]`. These are
*                 ANSWERS, not failures ('no_profile' above all), so the code
*                 and the server's own message are both kept for the render.
*   - transport → self.decline.code = 'failed'
*
* @returns {Promise<boolean>} true when self.report was filled
*/
tool_identify.prototype.find_matches = async function() {

	const self = this

	// reset the previous answer: a stale report next to a new decline would be
	// the one genuinely misleading state this tool could show.
		self.report		= null
		self.decline	= null

	// no saved record to compare — the same decline code the server uses
		if (!self.seed) {
			self.decline = { code : 'missing_seed', msg : null }
			return false
		}

	try {

		const api_response = await data_manager.request({
			use_worker	: false,
			body		: {
				dd_api			: 'dd_identify_api',
				action			: 'find_matches',
				prevent_lock	: true,
				options			: {
					section_tipo	: self.seed.section_tipo,
					section_id		: self.seed.section_id,
					limit			: self.limit
				}
			}
		})

		if(SHOW_DEVELOPER===true) {
			console.log('-> tool_identify find_matches API response:', api_response);
		}

		const result = api_response ? api_response.result : null

		// clean decline (result:false) or an unusable envelope
		if (!result || typeof result!=='object') {
			const errors	= (api_response && Array.isArray(api_response.errors)) ? api_response.errors : []
			const code		= (typeof errors[0]==='string' && errors[0].length>0)
				? errors[0]
				: 'failed'
			self.decline = {
				code	: code,
				msg		: (api_response && typeof api_response.msg==='string') ? api_response.msg : null
			}
			return false
		}

		self.report = result

		return true

	} catch (error) {
		console.error('Error on tool_identify find_matches:', error);
		self.decline = { code : 'failed', msg : String(error && error.message ? error.message : error) }
		return false
	}
}//end find_matches



/**
* GET_PROPOSALS
* The proposals round trip: `dd_identify_api:get_proposals`.
*
* Asks what this record SHOULD say for the criteria it leaves empty, from both
* proposal sources. Result handling mirrors find_matches exactly (success /
* clean decline / transport), because the declines are the same set plus
* `invalid_source`.
*
* THE VISION SOURCE IS SENT ONLY WHEN THE CURATOR ASKED FOR IT. `self.vision`
* starts false and is set by the panel's own opt-in control; with it off the
* request names `neighbour_vote` and the server never constructs a model. With
* it on we ask for `all` — the neighbour vote is free and always worth having
* next to the model's guess, precisely so the two can be compared.
*
* @returns {Promise<boolean>} true when self.proposals was filled
*/
tool_identify.prototype.get_proposals = async function() {

	const self = this

	// reset the previous answer: a stale proposal list next to a new decline
	// would be the one genuinely misleading state this panel could show.
		self.proposals			= null
		self.proposals_decline	= null

	// no saved record to propose for — the same decline code the server uses
		if (!self.seed) {
			self.proposals_decline = { code : 'missing_seed', msg : null }
			return false
		}

	try {

		const api_response = await data_manager.request({
			use_worker	: false,
			body		: {
				dd_api			: 'dd_identify_api',
				action			: 'get_proposals',
				prevent_lock	: true,
				options			: {
					section_tipo	: self.seed.section_tipo,
					section_id		: self.seed.section_id,
					// 'all' = the vote AND the model; 'neighbour_vote' = the vote alone
					source			: self.vision===true ? 'all' : 'neighbour_vote'
				}
			}
		})

		if(SHOW_DEVELOPER===true) {
			console.log('-> tool_identify get_proposals API response:', api_response);
		}

		const result = api_response ? api_response.result : null

		// clean decline (result:false) or an unusable envelope
		if (!result || typeof result!=='object') {
			const errors	= (api_response && Array.isArray(api_response.errors)) ? api_response.errors : []
			const code		= (typeof errors[0]==='string' && errors[0].length>0)
				? errors[0]
				: 'failed'
			self.proposals_decline = {
				code	: code,
				msg		: (api_response && typeof api_response.msg==='string') ? api_response.msg : null
			}
			return false
		}

		self.proposals = result

		return true

	} catch (error) {
		console.error('Error on tool_identify get_proposals:', error);
		self.proposals_decline = { code : 'failed', msg : String(error && error.message ? error.message : error) }
		return false
	}
}//end get_proposals



/**
* PROPOSAL_KEY
* The identity a dismissal is remembered by.
*
* The SOURCE is part of it on purpose: the vote and the vision model can propose
* the same value for the same criterion, and rejecting a model's guess must not
* silently reject the corpus consensus that agrees with it — they are different
* claims and a curator dismissed exactly one of them.
*
* @param {Object} proposal
* @returns {string}
*/
tool_identify.prototype.proposal_key = function(proposal) {

	if (!proposal) {
		return ''
	}

	return [
		proposal.source || '',
		proposal.criterion_id || '',
		proposal.display || ''
	].join('::')
}//end proposal_key



/**
* BUILD_CHANGED_DATA
* The engine's `CriterionValue` as the component's own changed_data atom.
*
* Module-private, and deliberately driven by the VALUE KIND rather than by the
* component model: a locator is inserted into a relation component's list, a
* text or a number fills a literal's slot. These are the exact atoms the
* components' own render modules build for a user edit
* (`render_edit_component_input_text.js` change_handler,
* `render_edit_component_number.js`, `tool_cataloging.js` for the portal), so
* the save that follows is the save a curator's own keystroke produces.
*
* Returns null when the value is not one this flow can honestly compose — the
* caller refuses rather than writing an approximation. (A date range never
* reaches here: the server already marks it non-writable.)
*
* @param {Object} proposal - the wire proposal (carries `value`)
* @param {Object} component - the live component instance (for lang + entries)
* @returns {Array|null} changed_data, or null
*/
const build_changed_data = function(proposal, component) {

	const value = (proposal && proposal.value && typeof proposal.value==='object')
		? proposal.value
		: null
	if (!value) {
		return null
	}

	const entries = (component.data && Array.isArray(component.data.entries))
		? component.data.entries
		: []

	// locators → a relation component's list. ADDING a link is what the
	// component's own picker does; it never replaces what is already there.
		if (value.kind==='locators') {
			const locator = Array.isArray(value.locators) ? value.locators[0] : null
			if (!locator || !locator.section_tipo || locator.section_id===null || locator.section_id===undefined) {
				return null
			}
			return [Object.freeze({
				action	: 'insert',
				id		: null,
				value	: {
					section_tipo	: locator.section_tipo,
					section_id		: locator.section_id
				}
			})]
		}

	// text / number → a literal component's slot
		let literal = null
		if (value.kind==='text') {
			const text = Array.isArray(value.values) ? value.values[0] : null
			literal = (typeof text==='string' && text.length>0) ? text : null
		}else if (value.kind==='number') {
			const number = Array.isArray(value.values) ? value.values[0] : null
			literal = (typeof number==='number' && isFinite(number)) ? number : null
		}
		if (literal===null) {
			return null
		}

	// the first EMPTY slot is filled rather than appended: a literal component
	// with no value still renders one empty input, and appending would leave that
	// empty input sitting above the value the curator just accepted.
		let key = entries.findIndex(entry =>
			!entry || entry.value===null || entry.value===undefined || entry.value===''
		)
		const found	= key>-1
		if (!found) {
			key = entries.length
		}
		const current	= (found && entries[key]) ? entries[key] : {}
		// a text component stores one entry per language, so the lang travels
		const defaults	= (value.kind==='text') ? { lang : component.lang } : {}
		const item		= Object.assign({}, defaults, current)
		item.value		= literal

	return [Object.freeze({
		action	: found ? 'update' : 'insert',
		id		: (current && current.id) ? current.id : null,
		key		: key,
		value	: item
	})]
}//end build_changed_data



/**
* ACCEPT_PROPOSAL
* Write an accepted proposal into the record's component — through the ORDINARY
* component save, and through nothing else.
*
* `get_instance` + `change_value` is the whole implementation, exactly as
* `tools/tool_cataloging/js/tool_cataloging.js` does every one of its writes.
* The result must be indistinguishable from the curator having typed the value:
* same TM audit, same observers, same server-side permission re-check, same
* diffusion. A tool-side write endpoint would be a second contract to keep in
* sync with the first, for no capability the first lacks.
*
* NEITHER `model` NOR `lang` is passed to get_instance on purpose: it resolves
* both from the element context, which is the only authority on a component's
* language (translatable components, transliteration and with_lang_versions all
* change it, and guessing wrong writes the value into the wrong language).
*
* A non-writable proposal is REFUSED here as well as in the render — above all
* the multi-hop case, where the value belongs to a linked record and writing it
* to this one would put a curator's confirmation somewhere it does not mean what
* it says. The server decided that; this never second-guesses it.
*
* @param {Object} proposal - the wire proposal (carries `value` and `target`)
* @returns {Promise<Object|boolean>} the api_response on success, false otherwise
*/
tool_identify.prototype.accept_proposal = async function(proposal) {

	const self = this

	const target = (proposal && proposal.target) ? proposal.target : null

	if (!self.seed) {
		console.error('tool_identify accept_proposal: no seed record');
		return false
	}
	if (!target || target.writable!==true || !target.component_tipo || !target.section_tipo) {
		// the render never offers Accept in this case; belt and braces, because
		// writing to the wrong place is the failure this feature cannot have
		console.error('tool_identify accept_proposal: proposal is not writable here', target);
		return false
	}

	try {

		// the live component instance of the SEED record
			const component = await get_instance({
				tipo			: target.component_tipo,
				section_tipo	: target.section_tipo,
				section_id		: self.seed.section_id,
				mode			: 'edit',
				type			: 'component'
			})
			if (!component) {
				console.error('tool_identify accept_proposal: unable to resolve component instance', target);
				return false
			}
			// build() is idempotent (it short-circuits on status 'built'), so this is
			// safe whether the instance is new or already live behind the modal
			await component.build(true)

		// the changed_data atom the component itself would have built
			const changed_data = build_changed_data(proposal, component)
			if (changed_data===null) {
				console.error('tool_identify accept_proposal: unusable proposal value', proposal.value);
				return false
			}

		// change_value (implies save too). `refresh:true` re-renders the component
		// so the curator sees the new value; the save also publishes
		// 'sync_data_<id_base>_<lang>' (which updates the record form's own copy of
		// this component) and 'save' (which this tool already subscribes to, and
		// which marks the ranking on screen as stale).
			const api_response = await component.change_value({
				changed_data	: changed_data,
				refresh			: true
			})

			// false = the change was cancelled or skipped by the component
			if (api_response===false || !api_response || api_response.result===false) {
				return false
			}

		self.accepted = self.accepted + 1

		return api_response

	} catch (error) {
		console.error('Error on tool_identify accept_proposal:', error);
		return false
	}
}//end accept_proposal



/* ══════════════ CLUSTERS AND TYPE PROMOTION ══════════════════════════════ */



/**
* CLUSTER
* Group a whole batch at once: `tool_identify::cluster` (the tool's ONE server
* module action, background-runnable, IDENTIFY_SPEC §8.2).
*
* `find_matches` above asks "what else is like THIS record?". After an import the
* curator has the other question — "which of these two hundred are the same
* thing?" — and answering it by opening two hundred records is the work this
* system exists to remove.
*
* THE POOL IS THE CALLER'S OWN FILTER. The section instance that opened this tool
* carries the search the curator built (`caller.rqo.sqo`); it is DEEP-CLONED
* before `limit`/`offset` are zeroed, because narrowing the user's live filter
* would leave them looking at a different list than the one they made. With no
* usable filter the server falls back to the section's records, capped either
* way — clustering is quadratic and the cap is not optional.
*
* Run in the FOREGROUND deliberately: the panel offers a curator-sized batch
* (`cap`, shown next to the button) and reports the cap in the answer, so the run
* is seconds. A whole-collection run belongs on the background tier the server
* module already supports, with a job record and progress — not behind a modal
* the curator can navigate away from.
*
* @param {Object} [options]
*   options.cap {number} max records compared (server clamps)
*   options.min_cluster_size {number} smallest group worth reporting
* @returns {Promise<boolean>} true when self.clusters was filled
*/
tool_identify.prototype.cluster = async function(options={}) {

	const self = this

	// reset the previous answer: a stale grouping next to a new decline would be
	// the one genuinely misleading state this panel could show.
		self.clusters			= null
		self.clusters_decline	= null

	// clustering needs a section to cluster WITHIN. Without a seed there is no
	// section, which is the same honest decline the rest of the tool uses.
		if (!self.seed) {
			self.clusters_decline = { code : 'missing_seed', msg : null }
			return false
		}

	// sqo. The caller's live filter, CLONED (never the caller's own object) and
	// unpaginated: the curator means "the records I am looking at", not "the ten
	// on this page".
		const caller_sqo = (self.caller && self.caller.rqo && self.caller.rqo.sqo)
			? clone(self.caller.rqo.sqo)
			: null
		if (caller_sqo) {
			caller_sqo.limit	= 0
			caller_sqo.offset	= 0
		}

	try {

		const api_response = await self.tool_request({
			action	: 'cluster',
			options	: {
				section_tipo		: self.seed.section_tipo,
				...(caller_sqo ? { sqo : caller_sqo } : {}),
				cap					: options.cap ?? self.cluster_cap,
				min_cluster_size	: options.min_cluster_size ?? 2,
				lang				: self.lang
			}
		})

		if(SHOW_DEVELOPER===true) {
			console.log('-> tool_identify cluster API response:', api_response);
		}

		const result = api_response ? api_response.result : null

		if (!result || typeof result!=='object') {
			const errors	= (api_response && Array.isArray(api_response.errors)) ? api_response.errors : []
			const code		= (typeof errors[0]==='string' && errors[0].length>0)
				? errors[0]
				: 'failed'
			self.clusters_decline = {
				code	: code,
				msg		: (api_response && typeof api_response.msg==='string') ? api_response.msg : null
			}
			return false
		}

		self.clusters = result

		return true

	} catch (error) {
		console.error('Error on tool_identify cluster:', error);
		self.clusters_decline = { code : 'failed', msg : String(error && error.message ? error.message : error) }
		return false
	}
}//end cluster



/**
* RESOLVE_TYPE_LINK
* `dd_identify_api:resolve_type_link` — where a cluster may be promoted TO, and
* what this caller may do there.
*
* Three facts the client must never work out for itself, so it asks:
*   1. whether this collection has canonical Types at all (`typeSectionTipo`);
*   2. WHICH component links an object to its Type — derived from the profile's
*      own criteria, never guessed from "a portal pointing at the right
*      section", because writing thirty confirmations into the wrong component is
*      invisible and permanent;
*   3. the write grants (the link component, the Type section, its label field).
*
* Optionally SURVEYS the members it is given and reports the Types they already
* carry, which is what makes "attach to the existing Type" the one-click common
* case it should be.
*
* Declines are the panel's content, not an error state — above all
* `no_type_section` ("this collection keeps no Types") and `no_link_component`
* ("the profile does not say which component is the Type link"), both of which
* mean the promotion controls must NOT be offered.
*
* @param {Array<Object>} [records] - the cluster's members, [{section_tipo, section_id}]
* @param {number|null} [check_type_id] - a hand-typed Type record id to VERIFY;
*   the answer rides back as `result.type_record` (see check_type_record below)
* @returns {Promise<Object|null>} the result object, or null on a decline
*/
tool_identify.prototype.resolve_type_link = async function(records, check_type_id) {

	const self = this

	self.type_link_decline = null

	if (!self.seed) {
		self.type_link_decline = { code : 'missing_seed', msg : null }
		return null
	}

	try {

		const api_response = await data_manager.request({
			use_worker	: false,
			body		: {
				dd_api			: 'dd_identify_api',
				action			: 'resolve_type_link',
				prevent_lock	: true,
				options			: {
					section_tipo	: self.seed.section_tipo,
					...(Array.isArray(records) && records.length>0 ? { records : records } : {}),
					...(typeof check_type_id==='number' ? { check_type_id : check_type_id } : {})
				}
			}
		})

		if(SHOW_DEVELOPER===true) {
			console.log('-> tool_identify resolve_type_link API response:', api_response);
		}

		const result = api_response ? api_response.result : null

		if (!result || typeof result!=='object') {
			const errors	= (api_response && Array.isArray(api_response.errors)) ? api_response.errors : []
			const code		= (typeof errors[0]==='string' && errors[0].length>0)
				? errors[0]
				: 'failed'
			self.type_link_decline = {
				code	: code,
				msg		: (api_response && typeof api_response.msg==='string') ? api_response.msg : null
			}
			return null
		}

		return result

	} catch (error) {
		console.error('Error on tool_identify resolve_type_link:', error);
		self.type_link_decline = { code : 'failed', msg : String(error && error.message ? error.message : error) }
		return null
	}
}//end resolve_type_link



/**
* CHECK_TYPE_RECORD
* DOES THIS HAND-TYPED TYPE ID EXIST, AND MAY THIS CALLER READ IT?
*
* The "attach to another existing Type, by record id" field is the only place in
* the flow where a locator is TYPED rather than picked, so it is the only place a
* typo becomes a bulk write: `4321` for `432` would put thirty locators on a
* record that does not exist, and nothing downstream notices (a portal insert
* does not check that its target exists).
*
* The client cannot answer this itself, and must not try: `get_section_terms`
* returns null for a missing id and omits forbidden sections silently, while the
* title renderer falls back to "tipo / id" — so a miss and a hit look the same on
* screen. The server answers instead (`resolve_type_link` → `type_record`), with
* existence AND readability, and only `exists:true` may arm the confirm step.
*
* @param {number} section_id - the id the curator typed
* @returns {Promise<Object|null>} {section_tipo, section_id, exists, label, reason, detail},
*                                 or null when the request itself declined
*/
tool_identify.prototype.check_type_record = async function(section_id) {

	const self = this

	const id = Number(section_id)
	if (!Number.isFinite(id) || id<1) {
		return {
			section_tipo	: null,
			section_id		: null,
			exists			: false,
			label			: null,
			reason			: 'invalid_id',
			detail			: 'that is not a record id, so nothing can be attached to it'
		}
	}

	// no members: this asks ONE question and must not re-survey the cluster
	const result = await self.resolve_type_link([], id)
	if (result===null || !result.type_record) {
		return null
	}

	return result.type_record
}//end check_type_record



/**
* CREATE_TYPE_RECORD
* Mint a canonical Type record — through the client's ORDINARY record creation,
* and through nothing else.
*
* `section.prototype.create_section()` is the exact call the "new record" button
* of that section makes; the server re-checks the write permission, stamps the
* counter, writes the TM row. The instance is created with `id_variant` so it can
* never be the curator's OWN open section instance (which would be a live object
* this tool has no business driving), and it is registered in `self.ar_instances`
* so the tool's destroy tears it down.
*
* @param {string} type_section_tipo
* @returns {Promise<number|null>} the new record's section_id, or null
*/
tool_identify.prototype.create_type_record = async function(type_section_tipo) {

	const self = this

	if (typeof type_section_tipo!=='string' || type_section_tipo.length<1) {
		console.error('tool_identify create_type_record: invalid type_section_tipo', type_section_tipo);
		return null
	}

	try {

		const section_instance = await get_instance({
			model			: 'section',
			tipo			: type_section_tipo,
			section_tipo	: type_section_tipo,
			section_id		: null,
			mode			: 'list',
			lang			: self.lang,
			type			: 'section',
			id_variant		: 'tool_identify_promote',
			// this instance exists to issue ONE create call: it renders nothing and
			// must not touch the user's stored navigation state
			session_save	: false,
			filter			: false,
			inspector		: false,
			paginator		: false,
			buttons			: false
		})
		if (!section_instance || typeof section_instance.create_section!=='function') {
			console.error('tool_identify create_type_record: unable to resolve section instance', type_section_tipo);
			return null
		}
		if (Array.isArray(self.ar_instances) && self.ar_instances.indexOf(section_instance)===-1) {
			self.ar_instances.push(section_instance)
		}

		const new_section_id = await section_instance.create_section()

		return (new_section_id && Number(new_section_id)>0)
			? Number(new_section_id)
			: null

	} catch (error) {
		console.error('Error on tool_identify create_type_record:', error);
		return null
	}
}//end create_type_record



/**
* NAME_TYPE_RECORD
* Write the curator's name for a just-minted Type into the Type section's own
* label component — the ordinary component save again (get_instance +
* change_value), identical to the accept_proposal path above.
*
* Only ever called for a label component the SERVER reported as a writable
* literal: a section whose main term is a thesaurus relation cannot be named with
* a typed string, and composing one would write an approximation of what the
* curator meant. In that case the panel says so and offers the record instead.
*
* A failure here is NOT fatal to the promotion: the Type exists and the members
* can still be attached to it. It is reported as its own line, because an unnamed
* Type record is a thing a curator must go and fix.
*
* @param {Object} label_component - {section_tipo, component_tipo} from resolve_type_link
* @param {number} section_id - the new Type record
* @param {string} text
* @returns {Promise<boolean>}
*/
tool_identify.prototype.name_type_record = async function(label_component, section_id, text) {

	const value = (typeof text==='string') ? text.trim() : ''

	if (!label_component || !label_component.component_tipo || value==='') {
		return false
	}

	try {

		const component = await get_instance({
			tipo			: label_component.component_tipo,
			section_tipo	: label_component.section_tipo,
			section_id		: String(section_id),
			mode			: 'edit',
			type			: 'component'
		})
		if (!component) {
			console.error('tool_identify name_type_record: unable to resolve component instance', label_component);
			return false
		}
		await component.build(true)

		// a new record's literal has no entry yet: insert the first one, in the
		// component's OWN language (it resolved it from the element context — this
		// never guesses which language a translatable component writes into)
		const entries	= (component.data && Array.isArray(component.data.entries)) ? component.data.entries : []
		const found		= entries.findIndex(entry =>
			!entry || entry.value===null || entry.value===undefined || entry.value===''
		)
		const key		= found>-1 ? found : entries.length
		const current	= (found>-1 && entries[key]) ? entries[key] : {}
		const item		= Object.assign({ lang : component.lang }, current)
		item.value		= value

		const api_response = await component.change_value({
			changed_data : [Object.freeze({
				action	: found>-1 ? 'update' : 'insert',
				id		: (current && current.id) ? current.id : null,
				key		: key,
				value	: item
			})],
			refresh	: false
		})

		return !(api_response===false || !api_response || api_response.result===false)

	} catch (error) {
		console.error('Error on tool_identify name_type_record:', error);
		return false
	}
}//end name_type_record



/**
* ATTACH_MEMBERS
* Link every member of a cluster to a Type record — one ORDINARY component save
* per member, and a per-member OUTCOME for every single one.
*
* THE WRITE IS THE NORMAL ONE. `get_instance` + `change_value` on the member's
* own link component, exactly as `tools/tool_cataloging/js/tool_cataloging.js`
* writes its portal and exactly as the record's edit form writes when the curator
* picks a record by hand: same TM audit, same observers, same server-side
* permission re-check, same diffusion. There is no bulk endpoint and there must
* not be one — thirty saves are thirty ordinary saves.
*
* PARTIAL FAILURE IS THE NORMAL CASE, NOT THE EXCEPTION. Thirty members are
* thirty round trips; one can fail on a component lock, a permission, a network
* blip. So:
*   - one member's failure NEVER stops the rest (each is its own try/catch);
*   - every member gets a status, and the caller renders all of them —
*     'attached', 'already' (it was linked to this Type before we arrived, so
*     nothing was written), 'failed' WITH the reason, or 'unconfirmed' when the
*     save was accepted but the server reported no total to confirm it by;
*   - the failures are the ones the panel lists for retry. Silently attaching 27
*     of 30 is the worst outcome available here — and reporting 30 attached when
*     3 were written is worse, which is why the status is DERIVED from the
*     server's echoed count (promote_rules.attach_outcome) and never from
*     `api_response.result` merely being truthy.
*
* THE PORTAL'S data_limit IS HONOURED. It is a client-side guard living in
* component_portal.link_record, which this path deliberately does not use; a
* member whose link component is already at capacity is REFUSED with that reason
* rather than quietly given a second locator (promote_rules.data_limit_refusal).
*
* @param {Object} options
*   options.members {Array<Object>}    [{section_tipo, section_id}, …]
*   options.type {Object}              the Type locator {section_tipo, section_id}
*   options.link_component_tipo {string}
*   options.on_progress {Function}     (done, total, outcome) — called per member
* @returns {Promise<Array<Object>>} [{section_tipo, section_id, status, detail}]
*/
tool_identify.prototype.attach_members = async function(options) {

	const self = this

	const members				= Array.isArray(options.members) ? options.members : []
	const type					= options.type
	const link_component_tipo	= options.link_component_tipo
	const on_progress			= (typeof options.on_progress==='function') ? options.on_progress : function(){}

	if (!type || !type.section_tipo || type.section_id===null || type.section_id===undefined || !link_component_tipo) {
		console.error('tool_identify attach_members: invalid target', options);
		return []
	}

	const outcomes = []

	for (let i = 0; i < members.length; i++) {

		const member	= members[i]
		const outcome	= {
			section_tipo	: member.section_tipo,
			section_id		: member.section_id,
			status			: 'failed',
			detail			: ''
		}

		try {

			// the member's own link component, live
				const component = await get_instance({
					tipo			: link_component_tipo,
					section_tipo	: member.section_tipo,
					section_id		: String(member.section_id),
					mode			: 'edit',
					type			: 'component'
				})
				if (!component) {
					outcome.detail = 'the link component could not be resolved on this record'
					outcomes.push(outcome)
					on_progress(i+1, members.length, outcome)
					continue
				}
				await component.build(true)

			// the SERVER's count of what this component holds, before anything is
			// written. `data.entries` is only the loaded PAGE, so it can never
			// answer "is it already linked" or "is the portal full" — the total in
			// the component's own pagination can, and it is what the outcome below
			// is derived from.
				const total_before = server_total(component.data)

			// already linked ON THIS PAGE? Then nothing is written, and that is
			// REPORTED rather than counted as a save — the curator asked for a
			// state, and the state was already true. A HIT here is always true; a
			// MISS proves nothing (the existing link may sit on another page), which
			// is why the authoritative answer is the server's total after the save.
				const entries = (component.data && Array.isArray(component.data.entries))
					? component.data.entries
					: []
				const exists = entries.find(entry =>
					entry
					&& entry.section_tipo===type.section_tipo
					&& String(entry.section_id)===String(type.section_id)
				)
				if (typeof exists!=='undefined') {
					outcome.status	= 'already'
					outcome.detail	= 'already linked to this Type — nothing was written'
					outcomes.push(outcome)
					on_progress(i+1, members.length, outcome)
					continue
				}

			// data_limit. The portal's own capacity rule. This path writes through
			// change_value directly (the ordinary save, by design), so it never
			// passes component_portal.link_record's guard — and a Type-link portal
			// with data_limit:1 would silently take a second locator, which by hand
			// is refused with an alert. Refuse here too, with the reason.
				const limit_refusal = data_limit_refusal({
					data_limit		: (component.context && component.context.properties)
						? component.context.properties.data_limit
						: null,
					current_total	: total_before
				})
				if (limit_refusal!==null) {
					outcome.detail = limit_refusal
					outcomes.push(outcome)
					on_progress(i+1, members.length, outcome)
					continue
				}

			// the insert atom the portal's own link_record builds, including
			// `from_component_tipo` — the server partitions a record's locators per
			// component with it, so without it the link lands in the relations bag
			// without an owner
				const changed_data = [Object.freeze({
					action	: 'insert',
					id		: null,
					value	: {
						section_tipo		: type.section_tipo,
						section_id			: type.section_id,
						from_component_tipo	: component.tipo
					}
				})]

			// change_value (implies save too). No refresh: the panel is what the
			// curator is looking at, and the record form gets the value through the
			// component's own 'sync_data_' publication.
				const api_response = await component.change_value({
					changed_data	: changed_data,
					refresh			: false
				})

				// THE OUTCOME IS THE SERVER'S, NOT OURS. A truthy `result` means the
				// request did not fail — it does not mean a locator was written. The
				// engine drops a duplicate insert and leaves the total unchanged, so
				// the echoed total is what says 'attached' or 'already', over the
				// WHOLE dataset rather than the page this client happened to load.
					const resolved	= attach_outcome({
						api_response	: api_response,
						component_tipo	: component.tipo,
						total_before	: total_before
					})
					outcome.status	= resolved.status
					outcome.detail	= resolved.detail
					if (resolved.status==='attached') {
						self.promoted = self.promoted + 1
					}

		} catch (error) {
			console.error('Error on tool_identify attach_members:', error);
			outcome.detail = String(error && error.message ? error.message : error)
		}

		outcomes.push(outcome)
		on_progress(i+1, members.length, outcome)
	}


	return outcomes
}//end attach_members



/**
* RESOLVE_LABELS
* Locators → record titles, through the client's EXISTING batched resolver
* `fetch_section_terms` (server action 'get_section_terms'):
* one request for the whole page of candidates, per-locator read permission
* checked server-side, and sections whose section_map declares no term tipos
* are simply omitted from the answer.
*
* Deliberately non-fatal: a locator with no resolved term keeps its locator as
* the visible title (render_candidate below), which is honest — better a
* `numisdata4 / 512` than a blank row pretending to be a name.
*
* @param {Array<Object>} locators - [{section_tipo, section_id}, …]
* @returns {Promise<Object>} map `${section_tipo}_${section_id}` → title
*/
tool_identify.prototype.resolve_labels = async function(locators) {

	const self = this

	if (!Array.isArray(locators) || locators.length<1) {
		return {}
	}

	try {
		const terms = await fetch_section_terms(self, locators)
		return (terms && typeof terms==='object') ? terms : {}
	} catch (error) {
		console.error('Error on tool_identify resolve_labels:', error);
		return {}
	}
}//end resolve_labels



/**
* OPEN_RECORD
* Open a candidate record using the client's OWN navigation, not a new one:
* the same deep-link grammar and `open_window` helper that the list section's
* "edit record" button uses (core/section/js/render_list_section.js).
*
* A NEW WINDOW rather than in-page navigation is deliberate: this tool runs in
* a modal over the seed record, and navigating the page underneath would
* destroy the very record the comparison is about. `session_save:false` keeps
* the opened record from overwriting the user's stored navigation state, and
* `menu:false` goes with it (the client refuses navigation when session_save
* is false).
*
* @param {Object} locator - {section_tipo, section_id}
* @returns {boolean} false when the locator is unusable
*/
tool_identify.prototype.open_record = function(locator) {

	if (!locator || !locator.section_tipo || locator.section_id===null || locator.section_id===undefined) {
		console.error('tool_identify open_record: invalid locator', locator);
		return false
	}

	const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
		tipo			: locator.section_tipo,
		section_tipo	: locator.section_tipo,
		id				: locator.section_id,
		mode			: 'edit',
		session_save	: false, // do not overwrite the user's current section session
		menu			: false  // navigation is refused when session_save is false
	})

	open_window({
		url		: url,
		name	: 'identify_record_' + locator.section_tipo + '_' + locator.section_id
	})

	return true
}//end open_record



/**
* ON_CLOSE_ACTIONS
* Custom modal-close teardown. Defining this makes view_modal SKIP its default
* cleanup (caller.refresh + ui.component.activate).
*
* The identification half writes nothing, so refreshing the caller record after
* a pure comparison would be pure cost. The PROPOSALS half does write — through
* the normal component save — so when at least one proposal was accepted the
* caller IS refreshed, with the same options view_modal's default cleanup uses.
* The accepted values already reached the open form (change_value publishes
* `sync_data_`), but a record whose data changed should be re-read once rather
* than left assembled from events.
*
* @returns {void}
*/
tool_identify.prototype.on_close_actions = function() {

	const self = this

	// promotion writes to OTHER records (the cluster's members) as well as to
	// this one, so it counts here too: the seed is frequently one of the members.
	const wrote		= (self.accepted + self.promoted) > 0
	const caller	= self.caller

	try {
		if (typeof self.destroy==='function') {
			self.destroy(true, true, true)
		}
	} catch (error) {
		console.error(error)
	}

	if (wrote && caller && typeof caller.refresh==='function') {
		caller.refresh({
			refresh_id_base_lang : true
		})
		.catch(error => console.error('tool_identify on_close_actions: caller.refresh failed:', error))
	}
}//end on_close_actions



// @license-end
