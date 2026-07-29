// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/



/**
* RENDER_TOOL_IDENTIFY
* Client-side render module for tool_identify.
*
* WHAT THIS VIEW IS FOR. A ranked list of scores would be worse than nothing:
* a bare number is either ignored or trusted far past what it means
* (IDENTIFY_SPEC §5). So the per-criterion BREAKDOWN is rendered inline for
* every candidate — never behind a toggle, never a "details" view — and it
* distinguishes FOUR states, not two:
*
*   agreed = true      → agreed     (green, solid rule)
*   agreed = false     → differed   (red, solid rule)
*   agreed = null      → NOT RECORDED on either side (muted, DASHED rule)
*   restricted = true  → NOT READABLE by you (muted, DOTTED rule)
*
* The last two are the load-bearing distinctions, and they are NOT the same
* statement. Absence is not disagreement: the engine excludes it from what was
* achievable, so it did not lower the score, and the UI must not paint it as a
* failure. "Restricted" is not absence either: the field may well be full, this
* caller simply has no grant on it, so the engine neither compared nor quoted it
* — reading that row as "nobody recorded this" would be a false conclusion about
* the CATALOGUE drawn from a fact about the READER. Each outcome's `detail`
* string is written for a human and is shown verbatim.
*
* THE WEIGHT SLOT SAYS ONE OF THREE THINGS, for the same reason:
*   - GATE (`required`) — every candidate on screen had to agree on this; it
*     decided membership, so its declared weight is deliberately NOT in the
*     score (IDENTIFY_SPEC §5). Never confuse it with a zero weight.
*   - WEIGHT n — it contributed n to the ratio.
*   - DESCRIPTIVE — shown, never scored.
*
* Three more honesty surfaces are rendered whenever the server sets them,
* because they exist precisely so the tool cannot quietly over-claim:
*   - `blind_criteria` — "this record states nothing for X, so X discriminated
*     nothing"; the score was computed without those criteria.
*   - `restricted_criteria` — "you may not read X", so X was neither compared
*     nor quoted and THE SCORES HERE ARE PARTIAL: a colleague with more grants
*     sees a different number for the same pair. Kept visibly apart from
*     `blind_criteria` above — one is about the data, the other about you.
*   - `more_available` — the pool cap stopped the comparison; more candidates
*     exist than were scored. A FLAG, not a count (the engine fetches cap+1
*     precisely so it never has to claim a number).
*
* THUMBNAILS SUPPORT THE BREAKDOWN, they do not replace it. Identification is a
* visual task — a curator comparing two coins looks at them — so the seed and
* every candidate show the thumb the server resolved from the profile's
* declared preview component, side by side. The picture is never the argument: the
* per-criterion rows stay the primary content of every card.
*
* `thumb_url` is null whenever the profile declares no preview component or the
* derivative was never generated, and that case renders as a NEUTRAL PLACEHOLDER
* — never a broken-image icon, which reads as "this tool is broken" rather than
* "this record has no photograph". The same placeholder replaces an <img> that
* fails to load (a media URL is cookie-gated by the web server, so a request can
* still fail after the file was found on disk).
*
* Declines each get their own message. `no_profile` is NORMAL — a section that
* does not do identification is not a broken section — so it is styled as
* information, not as an error.
*
* ── PROPOSALS: TWO SOURCES THAT MUST NEVER LOOK ALIKE ────────────────────────
*
* The proposals panel renders what the record SHOULD say for the criteria it
* leaves empty. Two sources answer, and the whole design of this half is that a
* curator must not confirm them on the same evidence:
*
*   - NEIGHBOUR VOTE — "7 similar coins record this". A corpus consensus. It is
*     checkable: the citing neighbours are listed by name, each one a click away,
*     and the competing values are shown with their shares. Rendered with the
*     tool's own solid colour and the word CORPUS.
*   - VISION MODEL — "a model looking at the photograph suggested this". One
*     machine's opinion about a picture, supported by nothing but its own stated
*     reason, which is quoted verbatim next to the photograph it read. Rendered
*     in a different colour, with a DOTTED rule, the word MODEL, the model's name
*     and whether it sends images off this host — and an explicit sentence saying
*     that no record attests it.
*
* Neither is styled as "better". They are styled as DIFFERENT KINDS OF CLAIM,
* because that is what they are, and a shared renderer with a small grey source
* label would let a curator confirm a machine's guess at corpus speed.
*
* The vision source is OPT-IN per run (it costs money and may egress), and the
* panel says so where the control is — including when the server reports it as
* `not_requested`, so "no model proposals" can never read as "the model looked
* and found nothing".
*
* ACCEPT writes through the record's own component save (tool_identify.js
* accept_proposal). A proposal the server marked non-writable is rendered
* READ-ONLY with the server's own explanation, never with a disabled-looking
* Accept button: above all the MULTI-HOP case, where the value belongs to a
* linked record and the panel offers to open that record instead. REJECT removes
* the card and is remembered in memory only.
*
* Architecture: `render_tool_identify` is a constructor-as-namespace; its
* single prototype method `edit` is mixed into `tool_identify` by wire_tool().
* The module-private helpers below build the DOM so `edit` stays thin.
*
* @module render_tool_identify
*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	// ui: DOM node factory + the standard tool wrapper/content_data builders
	import {ui} from '../../../core/common/js/ui.js'
	// the batch half: the groups inside a set of records, and promoting one of
	// them to a canonical Type record. It reuses this module's decline renderer
	// and record-title resolver (exported below) so the whole tool speaks with
	// one voice about a decline.
	import {build_clusters_panel} from './render_tool_identify_clusters.js'



/**
* RENDER_TOOL_IDENTIFY
* Constructor-as-namespace. Holds the prototype `edit` wired into the tool.
* @returns {boolean}
*/
export const render_tool_identify = function() {

	return true
}//end render_tool_identify



/**
* EDIT
* Render tool DOM nodes. Wired onto the tool prototype by wire_tool().
*
* @param {Object} options
* @param {string} [options.render_level='full'] - 'full' returns the whole
*   wrapper; 'content' returns only the inner content_data node.
* @returns {Promise<HTMLElement>}
*/
render_tool_identify.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = (options && options.render_level) || 'full'

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. Standard tool shell (header + close button)
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Builds the tool body and kicks off the identification.
*
* Layout (top to bottom):
*   1. summary   — what is being compared, and under which profile
*   2. toolbar   — re-run button
*   3. notices   — blind criteria / more available / declines
*   4. proposals — what this record could say, per source, with Accept/Reject
*   5. clusters  — the whole batch grouped, and promotion to a canonical Type
*   6. results   — the ranked candidate list with its breakdowns
*
* Proposals come FIRST because they are the actionable half: the ranked list
* explains, the proposals ask for a decision. Clusters sit between them: they
* are the batch version of the same decision, and the only part of this tool
* that writes to OTHER records (render_tool_identify_clusters.js).
*
* The shell paints first and the API round trip runs inside
* ui.load_item_with_spinner over the results container, so the user sees the
* tool immediately instead of an empty modal.
*
* @param {Object} self - the tool_identify instance
* @returns {Promise<HTMLElement>} content_data node
*/
const get_content_data = async function(self) {

	const content_data = ui.tool.build_content_data(self)

	// summary. Filled once the report (and the seed title) are known.
		const summary = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_summary',
			parent			: content_data
		})

	// toolbar. Re-run: the seed record can be edited while the tool is open.
		const toolbar = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_toolbar',
			parent			: content_data
		})
		const button_search = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary identify_search',
			text_content	: self.get_tool_label('identify_search') || 'Find matches',
			parent			: toolbar
		})

	// notices. blind_criteria / more_available / declines land here.
		const notices = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_notices',
			parent			: content_data
		})

	// proposals. What this record could say, and the two sources saying it.
		const proposals = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_proposals',
			parent			: content_data
		})
		build_proposals_panel(self, proposals)

	// clusters. The BATCH question ("which of these two hundred are the same
	// thing?") and the one action that makes a grouping permanent: promoting it
	// to a canonical Type record every member links to. Nothing runs here until
	// the curator presses the button — clustering compares the whole pool, and
	// promotion writes.
		const clusters = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_clusters',
			parent			: content_data
		})
		build_clusters_panel(self, clusters)

	// results. The ranked list.
		const results = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_results',
			parent			: content_data
		})

	const nodes = {
		summary	: summary,
		notices	: notices,
		results	: results
	}

	// run. Not awaited: the shell above is already complete, and the spinner
	// inside `results` reports the round trip. The catch is not decoration —
	// an unhandled rejection here would leave the spinner spinning forever
	// with nothing said.
		run_identification(self, nodes).catch(error => console.error(error))

	// re-run on demand
		button_search.addEventListener('click', function(e) {
			e.stopPropagation()
			button_search.classList.remove('identify_stale')
			run_identification(self, nodes).catch(error => console.error(error))
		})

	// event 'save'. A component of the SEED record was just saved, so the
	// criteria values this comparison was computed from may no longer hold.
	// Say so rather than let a stale ranking look current. The token goes into
	// self.events_tokens so destroy() unsubscribes it.
		self.events_tokens.push(
			event_manager.subscribe('save', fn_saved)
		)
		function fn_saved(payload) {

			const instance = payload ? payload.instance : null
			if (!instance || !self.seed) {
				return
			}
			if (instance.section_tipo!==self.seed.section_tipo) {
				return
			}
			if (String(instance.section_id)!==String(self.seed.section_id)) {
				return
			}
			// mark the current answer as stale; the re-run button clears it
			button_search.classList.add('identify_stale')
		}


	return content_data
}//end get_content_data



/**
* RUN_IDENTIFICATION
* One full cycle: ask the API, resolve the record titles, repaint.
*
* @param {Object} self - the tool_identify instance
* @param {Object} nodes - {summary, notices, results} containers
* @returns {Promise<HTMLElement|null>}
*/
const run_identification = async function(self, nodes) {

	// clear the previous answer's summary/notices before asking again
		nodes.summary.replaceChildren()
		nodes.notices.replaceChildren()

	return ui.load_item_with_spinner({
		container			: nodes.results,
		preserve_content	: false,
		label				: self.get_tool_label('identify_searching') || 'Comparing records…',
		callback			: async () => {

			const ok = await self.find_matches()

			if (ok!==true) {
				render_decline(self, nodes.notices)
				// an empty results list, not a fake one
				return ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'identify_results_empty'
				})
			}

			const report = self.report

			// titles for the seed and every candidate, in ONE batched request
			// through the client's existing (ACL-checked) resolver
				const locators = [{
					section_tipo	: report.seed.section_tipo,
					section_id		: report.seed.section_id
				}]
				const results = Array.isArray(report.results) ? report.results : []
				for (let i = 0; i < results.length; i++) {
					locators.push({
						section_tipo	: results[i].section_tipo,
						section_id		: results[i].section_id
					})
				}
				// merged, never replaced: the proposals panel resolves titles for its
				// own evidence records into the same map
				self.labels = Object.assign(self.labels || {}, await self.resolve_labels(locators))

			render_summary(self, nodes.summary, report)
			render_notices(self, nodes.notices, report)

			return render_results(self, report)
		}
	})
}//end run_identification



/**
* RENDER_SUMMARY
* What is being compared, and under which identification profile.
*
* @param {Object} self
* @param {HTMLElement} container
* @param {Object} report - the find_matches result object
* @returns {HTMLElement} container
*/
const render_summary = function(self, container, report) {

	// seed thumbnail. The object the candidates below are compared against —
	// shown first so the two pictures sit in the same eye-line.
		container.appendChild(
			render_thumb(self, report.seed ? report.seed.thumb_url : null, 'seed')
		)

	// seed
		add_summary_item(
			container,
			self.get_tool_label('identify_seed') || 'Comparing against',
			record_title(self, report.seed)
		)

	// profile. The curatorial descriptor that decided WHAT counts as identity
	// here — naming it is part of making the score readable.
		const profile = report.profile || {}
		const profile_label = profile.label || profile.id || ''
		if (profile_label!=='') {
			add_summary_item(
				container,
				self.get_tool_label('identify_profile') || 'Profile',
				profile_label
			)
		}


	return container
}//end render_summary



/**
* ADD_SUMMARY_ITEM
* One label/value pair inside the summary strip.
*
* @param {HTMLElement} container
* @param {string} label
* @param {string} value
* @returns {HTMLElement} item node
*/
const add_summary_item = function(container, label, value) {

	const item = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'identify_summary_item',
		parent			: container
	})
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'identify_summary_label',
		text_content	: label,
		parent			: item
	})
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'identify_summary_value',
		text_content	: value,
		parent			: item
	})

	return item
}//end add_summary_item



/**
* RENDER_THUMB
* The picture that stands for a record, or a neutral placeholder.
*
* `url` is the server-resolved `thumb_url`: it is null when the profile declares
* no preview component, and also when the derivative has not been generated —
* the server checks the file exists before naming it, precisely so this never
* renders a broken image. A null (or a load failure, which can still happen
* because media URLs are cookie-gated by the web server) becomes an EMPTY box
* styled as a neutral placeholder, not an error state: "no photograph yet" is
* the normal condition of a collection being catalogued.
*
* The error listener is attached BEFORE `src` is assigned, so a URL resolved
* synchronously from the browser cache cannot fire the event before anyone is
* listening (the same order component_av's list views use).
*
* @param {Object} self
* @param {string|null} url
* @param {string} variant - extra class: 'seed' | 'candidate'
* @returns {HTMLElement} thumb node
*/
const render_thumb = function(self, url, variant) {

	const thumb = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'identify_thumb ' + variant
	})

	const empty_label = self.get_tool_label('identify_no_image') || 'No image available'

	if (typeof url!=='string' || url.length<1) {
		thumb.classList.add('empty')
		thumb.title = empty_label
		return thumb
	}

	const image = ui.create_dom_element({
		element_type	: 'img',
		parent			: thumb
	})
	// decorative: the record's title is already next to it, so an alt text here
	// would only make a screen reader read the same record twice
	image.alt		= ''
	image.loading	= 'lazy'
	image.addEventListener('error', function() {
		image.remove()
		thumb.classList.add('empty')
		thumb.title = empty_label
	})
	image.src = url


	return thumb
}//end render_thumb



/**
* RENDER_NOTICES
* The three anti-over-claim signals the engine sends, rendered whenever set.
*
* `blind_criteria` and `restricted_criteria` arrive as criterion IDs; the human
* labels for those IDs are recovered from any candidate's outcomes (every
* non-ignored criterion appears in every breakdown). With no candidates at all
* the raw id is shown — that is still true, just less pretty, and inventing a
* label would not be.
*
* THE TWO LISTS ARE RENDERED SEPARATELY AND WORDED DIFFERENTLY, deliberately.
* "This record states nothing for X" is a claim about the DATA — the honest
* response is to go and catalogue X. "You may not read X" is a claim about the
* READER — X may be fully catalogued, and the honest response is to ask for the
* grant (or to read the score as partial). Merging them into one "these criteria
* did not count" list would let a curator conclude their collection is empty
* where it is only closed to them, which is a wrong conclusion about their own
* data reached from a true statement about their permissions.
*
* @param {Object} self
* @param {HTMLElement} container
* @param {Object} report
* @returns {HTMLElement} container
*/
const render_notices = function(self, container, report) {

	const labels_by_id = criterion_labels(report)

	// blind criteria: the SEED records nothing for these, so they discriminated
	// nothing and the score was computed without them.
		const blind = Array.isArray(report.blind_criteria) ? report.blind_criteria : []
		if (blind.length>0) {

			const notice = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'identify_notice blind',
				text_content	: self.get_tool_label('identify_blind_criteria')
					|| 'This record states nothing for the criteria below, so they could not discriminate.',
				parent			: container
			})

			const list = ui.create_dom_element({
				element_type	: 'ul',
				class_name		: 'identify_blind_list',
				parent			: notice
			})
			for (let i = 0; i < blind.length; i++) {
				const id = blind[i]
				ui.create_dom_element({
					element_type	: 'li',
					text_content	: labels_by_id[id] || id,
					parent			: list
				})
			}
		}

	// restricted criteria: THIS CALLER has no read grant on them, so they were
	// neither compared nor quoted and every score below is PARTIAL. Not the same
	// notice as `blind` above and never merged with it — see the header.
		const restricted = Array.isArray(report.restricted_criteria) ? report.restricted_criteria : []
		if (restricted.length>0) {

			const notice = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'identify_notice restricted',
				text_content	: self.get_tool_label('identify_restricted_criteria')
					|| 'You do not have permission to read the criteria below, so they were neither compared nor shown. The scores here were computed without them and are partial.',
				parent			: container
			})

			const list = ui.create_dom_element({
				element_type	: 'ul',
				class_name		: 'identify_restricted_list',
				parent			: notice
			})
			for (let i = 0; i < restricted.length; i++) {
				const id = restricted[i]
				ui.create_dom_element({
					element_type	: 'li',
					text_content	: labels_by_id[id] || id,
					parent			: list
				})
			}
		}

	// more available: the pool cap stopped the comparison — a FLAG, never a
	// count (the engine cannot honestly give one).
		if (report.more_available===true) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'identify_notice more',
				text_content	: self.get_tool_label('identify_more_available')
					|| 'More candidates exist than were scored.',
				parent			: container
			})
		}


	return container
}//end render_notices



/**
* CRITERION_LABELS
* Map criterion id → human label, harvested from the outcomes of the results
* (every non-ignored criterion appears in every candidate's breakdown).
*
* @param {Object} report
* @returns {Object} map id → label
*/
const criterion_labels = function(report) {

	const map		= {}
	const results	= Array.isArray(report.results) ? report.results : []
	for (let i = 0; i < results.length; i++) {
		const outcomes = Array.isArray(results[i].outcomes) ? results[i].outcomes : []
		for (let j = 0; j < outcomes.length; j++) {
			const outcome = outcomes[j]
			if (outcome && outcome.criterion_id && !map[outcome.criterion_id]) {
				map[outcome.criterion_id] = outcome.label || outcome.criterion_id
			}
		}
	}

	return map
}//end criterion_labels



/**
* RENDER_DECLINE
* One honest message per decline code.
*
* `no_profile` is the important one: a section with no identification profile
* is a NORMAL section, not a broken one, so it is styled as information. Only
* `invalid_profile` and a transport failure are painted as problems, and both
* carry the server's own message verbatim — a malformed descriptor names the
* exact criterion and hop that is wrong, which is the whole point of refusing
* loudly instead of returning a quietly reduced result set.
*
* @param {Object} self
* @param {HTMLElement} container
* @param {Object} [decline_in] - the decline to render; defaults to self.decline
*   (the proposals panel passes self.proposals_decline, which uses the same codes)
* @returns {HTMLElement} notice node
*/
export const render_decline = function(self, container, decline_in) {

	const decline	= decline_in || self.decline || { code : 'failed', msg : null }
	const code		= decline.code

	// label key + tone per code. Unknown codes fall back to the generic
	// failure rather than being silently swallowed.
		const by_code = {
			no_profile		: { label : 'identify_no_profile',		tone : 'decline', show_detail : false },
			invalid_profile	: { label : 'identify_invalid_profile',	tone : 'failure', show_detail : true },
			forbidden		: { label : 'identify_forbidden',		tone : 'decline', show_detail : false },
			missing_seed	: { label : 'identify_missing_seed',	tone : 'decline', show_detail : false },
			// a source name the server does not define: a client bug, and refused
			// rather than quietly answered with the default source
			invalid_source	: { label : 'identify_invalid_source',	tone : 'failure', show_detail : true },
			// ── promotion (resolve_type_link) ───────────────────────────────
			// Both of these are ANSWERS ABOUT THE COLLECTION, not defects, and the
			// server's own sentence IS the explanation — so both show the detail and
			// only the second is painted as a problem:
			//  · no_type_section   this corpus keeps no canonical Types (a photo
			//                      archive clusters and promotes nowhere). Normal.
			//  · no_link_component the profile does not reveal WHICH component links
			//                      an object to its Type. The engine refuses to guess;
			//                      an administrator must add the criterion.
			no_type_section		: { label : 'identify_no_type_section',	tone : 'decline', show_detail : true },
			no_link_component	: { label : 'identify_no_link_component',tone : 'failure', show_detail : true },
			missing_section		: { label : 'identify_missing_seed',	tone : 'decline', show_detail : false },
			// the clustering action's own bad-request code
			invalid_request		: { label : 'identify_failed',			tone : 'failure', show_detail : true }
		}
		const spec = by_code[code] || { label : 'identify_failed', tone : 'failure', show_detail : true }

	const notice = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'identify_notice ' + spec.tone,
		text_content	: self.get_tool_label(spec.label) || 'The identification request did not return candidates.',
		parent			: container
	})

	// the server's own message: for invalid_profile it is the parser's exact
	// complaint, which an administrator needs verbatim.
		if (spec.show_detail===true && typeof decline.msg==='string' && decline.msg.length>0) {
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'identify_notice_detail',
				text_content	: decline.msg,
				parent			: notice
			})
		}


	return notice
}//end render_decline



/**
* RENDER_RESULTS
* The ranked candidate list (already sorted by score, server-side).
*
* @param {Object} self
* @param {Object} report
* @returns {HTMLElement} results node
*/
const render_results = function(self, report) {

	const node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'identify_results_list'
	})

	const results = Array.isArray(report.results) ? report.results : []

	// no candidates is an ANSWER, not a failure — say which.
		if (results.length<1) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'identify_notice decline',
				text_content	: self.get_tool_label('identify_no_results')
					|| 'No candidate scored high enough to be reported.',
				parent			: node
			})
			return node
		}

	for (let i = 0; i < results.length; i++) {
		node.appendChild(render_candidate(self, results[i]))
	}


	return node
}//end render_results



/**
* RENDER_CANDIDATE
* One candidate: verdict, title, score — and its full breakdown underneath.
*
* @param {Object} self
* @param {Object} result - {section_tipo, section_id, score, verdict, outcomes}
* @returns {HTMLElement} candidate node
*/
const render_candidate = function(self, result) {

	const verdict = (result.verdict==='same_type' || result.verdict==='candidate')
		? result.verdict
		: 'weak'

	const candidate = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'identify_candidate verdict_' + verdict
	})

	// head
		const head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_candidate_head',
			parent			: candidate
		})

	// thumbnail. First in the row so every candidate's picture lines up in one
	// column against the seed's, which is what a visual comparison needs. It
	// supports the breakdown below; it never stands in for it.
		const thumb = render_thumb(self, result.thumb_url, 'candidate')
		head.appendChild(thumb)

	// verdict badge. The three verdicts must be told apart WITHOUT reading the
	// number, so the word rides next to the colour.
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'identify_verdict',
			text_content	: self.get_tool_label('identify_verdict_' + verdict) || verdict,
			parent			: head
		})

	// title + locator. The locator is always shown: when no term resolves it IS
	// the title, and when one does it still tells the curator which record.
		const title = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_candidate_title',
			text_content	: record_title(self, result),
			parent			: head
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'identify_candidate_locator',
			text_content	: result.section_tipo + ' / ' + result.section_id,
			parent			: title
		})

	// score
		const score		= (typeof result.score==='number' && isFinite(result.score)) ? result.score : 0
		const percent	= Math.round(Math.max(0, Math.min(1, score)) * 100)
		const score_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_score',
			parent			: head
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'identify_score_value',
			text_content	: percent + '%',
			parent			: score_node
		})
		const score_bar = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'identify_score_bar',
			parent			: score_node
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'identify_score_fill',
			style			: { width : percent + '%' },
			parent			: score_bar
		})

	// open. Uses the client's own record deep-link + open_window (see
	// tool_identify.prototype.open_record) so the seed record stays loaded.
		const open_label = self.get_tool_label('identify_open_record') || 'Open this record'
		const button_open = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'secondary identify_open',
			text_content	: open_label,
			parent			: head
		})
		const locator = {
			section_tipo	: result.section_tipo,
			section_id		: result.section_id
		}
		const open_handler = function(e) {
			e.stopPropagation()
			self.open_record(locator)
		}
		button_open.addEventListener('click', open_handler)
		// the title and the picture are the other obvious click targets
		title.title = open_label
		title.addEventListener('click', open_handler)
		// only when there IS a picture: a placeholder that opens a record on click
		// is a target nobody can see, and its tooltip already says "no image"
		if (!thumb.classList.contains('empty')) {
			thumb.title = open_label
			thumb.classList.add('clickable')
			thumb.addEventListener('click', open_handler)
		}

	// breakdown. ALWAYS rendered — this is the feature, not a detail view.
		candidate.appendChild(render_outcomes(self, result))


	return candidate
}//end render_candidate



/**
* RENDER_OUTCOMES
* The per-criterion breakdown of one candidate.
*
* Three states, three treatments — see the module header. The `detail` string
* is the engine's own curator-facing sentence and is printed verbatim.
*
* @param {Object} self
* @param {Object} result
* @returns {HTMLElement} outcomes node
*/
const render_outcomes = function(self, result) {

	const container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'identify_outcomes'
	})

	const outcomes = Array.isArray(result.outcomes) ? result.outcomes : []
	for (let i = 0; i < outcomes.length; i++) {

		const outcome = outcomes[i]

		// restricted FIRST: the server sends it with agreed=null, and reading that
		// null as "not recorded" would state something about the CATALOGUE that the
		// server never said — the value may exist and simply not be readable here.
		// Otherwise agreed: true | false | null, where null is ABSENCE (neither side
		// records it), never a failure — the engine already excluded it from what
		// was achievable, so it did not lower the score.
			const state = (outcome.restricted===true)
				? 'restricted'
				: (outcome.agreed===true)
					? 'agreed'
					: (outcome.agreed===false)
						? 'differed'
						: 'unrecorded'

			const state_label = {
				agreed		: self.get_tool_label('identify_agreed') || 'Agreed',
				differed	: self.get_tool_label('identify_differed') || 'Differed',
				unrecorded	: self.get_tool_label('identify_unrecorded') || 'Not recorded',
				restricted	: self.get_tool_label('identify_restricted') || 'Not readable by you'
			}[state]

			const mark = {
				agreed		: '✓',
				differed	: '✕',
				unrecorded	: '–',
				restricted	: '⊘'
			}[state]

		const row = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_outcome ' + state,
			parent			: container
		})

		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'identify_outcome_mark',
			text_content	: mark,
			parent			: row
		})

		const body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_outcome_body',
			parent			: row
		})
		const label_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_outcome_label',
			text_content	: outcome.label || outcome.criterion_id || '',
			parent			: body
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'identify_outcome_state',
			text_content	: state_label,
			parent			: label_node
		})

		// the engine's own human-readable reason
			if (typeof outcome.detail==='string' && outcome.detail.length>0) {
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'identify_outcome_detail',
					text_content	: outcome.detail,
					parent			: body
				})
			}

		// spell out what "not recorded" means, once per row: it is the state a
		// curator is most likely to misread as a mismatch. "Not readable by you"
		// gets its own sentence for the same reason and must not borrow that one —
		// the engine's `detail` here is a CONSTANT string (it may not quote a value
		// it refused to read), so this note is the whole explanation the row has.
			if (state==='unrecorded') {
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'identify_outcome_note',
					text_content	: self.get_tool_label('identify_unrecorded_note')
						|| 'Neither record states this, so it could not agree or differ. It did not lower the score.',
					parent			: body
				})
			} else if (state==='restricted') {
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'identify_outcome_note',
					text_content	: self.get_tool_label('identify_restricted_note')
						|| 'You do not have permission to read this field, so it was neither compared nor shown. This says nothing about whether the records state a value: the score was simply computed without it.',
					parent			: body
				})
			}

		// what this criterion did to the score — THREE distinct answers, because
		// two of them look identical if only the number is shown:
		//   · GATE (required): every candidate on screen had to agree on it, so it
		//     selected them rather than ranking them and its declared weight is
		//     deliberately out of the ratio (IDENTIFY_SPEC §5). The weight number
		//     is therefore NOT rendered here — printing it would credit the
		//     criterion with a contribution it never made.
		//   · WEIGHT n: it contributed n.
		//   · DESCRIPTIVE (weight 0): shown, never scored.
		// A gate is the STRONGEST criterion in a profile and a descriptive one the
		// weakest; before this branch existed, a required criterion whose weight
		// someone had zeroed rendered as the second.
			const weight		= (typeof outcome.weight==='number' && isFinite(outcome.weight)) ? outcome.weight : 0
			const is_gate		= outcome.required===true
			const weight_text	= is_gate
				? (self.get_tool_label('identify_gate') || 'gate — required, not part of the score')
				: weight>0
					? (self.get_tool_label('identify_weight') || 'weight') + ' ' + weight
					: (self.get_tool_label('identify_descriptive') || 'descriptive — shown, not scored')
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: is_gate ? 'identify_outcome_weight gate' : 'identify_outcome_weight',
				text_content	: weight_text,
				parent			: row
			})

		// the gate's own sentence, and only when the gate actually ran: a required
		// criterion the SEED states nothing for gated nobody (IDENTIFY_SPEC §5), so
		// claiming "every candidate had to agree on this" would be false there.
			if (is_gate && outcome.agreed===true) {
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'identify_outcome_note gate',
					text_content	: self.get_tool_label('identify_gate_note')
						|| 'This criterion decides who gets compared at all: every candidate listed agreed on it. That is why its weight is left out of the score — it ranks nothing.',
					parent			: body
				})
			}
	}


	return container
}//end render_outcomes



/* ═══════════════════════════ PROPOSALS ═══════════════════════════════════ */



/**
* BUILD_PROPOSALS_PANEL
* The proposals half of the tool: a head (title + the vision opt-in + a run
* button), a notices strip (per-source outcomes and declines) and the card list.
*
* The panel runs the NEIGHBOUR VOTE on open, because it is free — no model, no
* egress, only what curators already recorded. The vision source is never in
* that first run: the opt-in below sets the flag, and nothing is sent until the
* curator presses the button. Opening a panel must not spend money.
*
* @param {Object} self - the tool_identify instance
* @param {HTMLElement} container - the .identify_proposals node
* @returns {HTMLElement} container
*/
const build_proposals_panel = function(self, container) {

	// head
		const head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_proposals_head',
			parent			: container
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'identify_proposals_title',
			text_content	: self.get_tool_label('identify_proposals_title') || 'Suggested values',
			parent			: head
		})

	// vision opt-in. A paid model that may send this record's photograph off the
	// host — so it is a checkbox the curator ticks, per run, and the note next to
	// it says exactly what ticking it does.
		const vision_wrap = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'identify_vision_optin',
			parent			: head
		})
		const vision_input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox',
			parent			: vision_wrap
		})
		vision_input.checked = self.vision===true
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'identify_vision_optin_label',
			text_content	: self.get_tool_label('identify_vision_optin') || 'Also ask the vision model',
			parent			: vision_wrap
		})

	// run button
		const button_propose = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'secondary identify_propose',
			text_content	: self.get_tool_label('identify_propose') || 'Suggest values',
			parent			: head
		})

	// the opt-in's own warning, always visible next to the control
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_vision_note',
			text_content	: self.get_tool_label('identify_vision_note')
				|| 'The vision model runs only when you ask for it: it costs money and, depending on this installation, sends the record’s photograph off this host.',
			parent			: container
		})

	// notices (per-source outcomes) + the card list
		const notices = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_proposal_notices',
			parent			: container
		})
		const list = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_proposals_list',
			parent			: container
		})

	const nodes = {
		notices	: notices,
		list	: list
	}

	// ticking the box does NOT run anything: it arms the next run
		vision_input.addEventListener('change', function() {
			self.vision = vision_input.checked===true
			button_propose.classList.add('identify_stale')
		})

	// run on demand
		button_propose.addEventListener('click', function(e) {
			e.stopPropagation()
			button_propose.classList.remove('identify_stale')
			run_proposals(self, nodes).catch(error => console.error(error))
		})

	// first run: the vote alone (self.vision is false at init, always)
		run_proposals(self, nodes).catch(error => console.error(error))


	return container
}//end build_proposals_panel



/**
* RUN_PROPOSALS
* One full proposals cycle: ask the API, resolve the evidence record titles,
* repaint.
*
* @param {Object} self
* @param {Object} nodes - {notices, list}
* @returns {Promise<HTMLElement|null>}
*/
const run_proposals = async function(self, nodes) {

	nodes.notices.replaceChildren()

	return ui.load_item_with_spinner({
		container			: nodes.list,
		preserve_content	: false,
		label				: self.get_tool_label('identify_proposing') || 'Looking for suggestions…',
		callback			: async () => {

			const ok = await self.get_proposals()

			if (ok!==true) {
				render_decline(self, nodes.notices, self.proposals_decline)
				return ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'identify_results_empty'
				})
			}

			const report = self.proposals

			// titles for every record a proposal quotes as evidence, and for every
			// linked record a multi-hop proposal offers to open — ONE batched call
			// through the existing ACL-checked resolver.
				const locators	= []
				const seen		= {}
				const add		= function(locator) {
					if (!locator || !locator.section_tipo) {
						return
					}
					const key = locator.section_tipo + '_' + locator.section_id
					if (seen[key]===true) {
						return
					}
					seen[key] = true
					locators.push({
						section_tipo	: locator.section_tipo,
						section_id		: locator.section_id
					})
				}
				const proposals = Array.isArray(report.proposals) ? report.proposals : []
				for (let i = 0; i < proposals.length; i++) {
					const evidence = Array.isArray(proposals[i].evidence) ? proposals[i].evidence : []
					for (let j = 0; j < evidence.length; j++) {
						add(evidence[j])
					}
					const target = proposals[i].target || {}
					const open_records = Array.isArray(target.open_records) ? target.open_records : []
					for (let j = 0; j < open_records.length; j++) {
						add(open_records[j])
					}
				}
				if (locators.length>0) {
					self.labels = Object.assign(self.labels || {}, await self.resolve_labels(locators))
				}

			render_source_notices(self, nodes.notices, report)

			return render_proposals(self, report)
		}
	})
}//end run_proposals



/**
* RENDER_SOURCE_NOTICES
* One line per proposal source, whether it ran or not.
*
* This is the panel's anti-over-claim surface, and the `not_requested` case is
* the important one: with the vision opt-in off the server says so explicitly,
* and the panel repeats it — otherwise "no model suggestions" would be
* indistinguishable from "the model looked at the photograph and found nothing".
*
* @param {Object} self
* @param {HTMLElement} container
* @param {Object} report - the get_proposals result object
* @returns {HTMLElement} container
*/
const render_source_notices = function(self, container, report) {

	const sources = Array.isArray(report.sources) ? report.sources : []

	for (let i = 0; i < sources.length; i++) {

		const source	= sources[i]
		const is_vision	= source.source==='vision_model'
		const declined	= source.declined || null

		const notice = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_source_notice ' + (is_vision ? 'vision' : 'vote')
				+ (declined ? ' declined' : ' ran'),
			parent			: container
		})

		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'identify_source_badge ' + (is_vision ? 'vision' : 'vote'),
			text_content	: is_vision
				? (self.get_tool_label('identify_source_vision') || 'Model')
				: (self.get_tool_label('identify_source_vote') || 'Corpus'),
			parent			: notice
		})

		// what it did, in one sentence
			let text = ''
			if (declined) {
				text = declined.detail || declined.reason || ''
			}else if (is_vision) {
				const model = source.model || {}
				text = (self.get_tool_label('identify_source_vision_ran') || 'A vision model read this record’s photograph.')
					+ ' ' + (model.label || model.id || '')
			}else{
				const considered = (typeof source.neighbours_considered==='number') ? source.neighbours_considered : 0
				text = (self.get_tool_label('identify_source_vote_ran') || 'Values voted for by records like this one.')
					+ ' ' + considered + ' '
					+ (self.get_tool_label('identify_neighbours_considered') || 'readable neighbour(s) could vote.')
					+ ' ' + (source.neighbour_source_reason || '')
			}
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'identify_source_text',
				text_content	: text,
				parent			: notice
			})

		// criteria this source did not propose for, with the engine's own reason
			const skipped = Array.isArray(source.skipped) ? source.skipped : []
			if (skipped.length>0) {
				const list = ui.create_dom_element({
					element_type	: 'ul',
					class_name		: 'identify_skipped_list',
					parent			: notice
				})
				for (let j = 0; j < skipped.length; j++) {
					ui.create_dom_element({
						element_type	: 'li',
						text_content	: (skipped[j].label || skipped[j].criterion_id || '')
							+ ' — ' + (skipped[j].detail || skipped[j].reason || ''),
						parent			: list
					})
				}
			}

		// answers the model gave that were NOT in the vocabulary it was shown.
		// Reported so a hallucination is visible instead of invisible.
			const discarded = Array.isArray(source.discarded) ? source.discarded : []
			if (discarded.length>0) {
				const list = ui.create_dom_element({
					element_type	: 'ul',
					class_name		: 'identify_discarded_list',
					parent			: notice
				})
				for (let j = 0; j < discarded.length; j++) {
					ui.create_dom_element({
						element_type	: 'li',
						text_content	: (self.get_tool_label('identify_discarded') || 'Discarded model answer:')
							+ ' ' + (discarded[j].offered || '') + ' — ' + (discarded[j].detail || ''),
						parent			: list
					})
				}
			}
	}


	return container
}//end render_source_notices



/**
* RENDER_PROPOSALS
* The card list, minus anything the curator already dismissed this session.
*
* @param {Object} self
* @param {Object} report
* @returns {HTMLElement} list node
*/
const render_proposals = function(self, report) {

	const node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'identify_proposals_cards'
	})

	const all		= Array.isArray(report.proposals) ? report.proposals : []
	const dismissed	= Array.isArray(self.dismissed) ? self.dismissed : []
	const visible	= all.filter(proposal => dismissed.indexOf(self.proposal_key(proposal))===-1)

	// nothing to propose is an ANSWER (the per-source notices above already say
	// why: everything recorded, no readable neighbour, the model not asked…)
		if (visible.length<1) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'identify_notice decline',
				text_content	: self.get_tool_label('identify_no_proposals')
					|| 'No value is being suggested for this record.',
				parent			: node
			})
			return node
		}

	for (let i = 0; i < visible.length; i++) {
		node.appendChild(render_proposal(self, visible[i]))
	}


	return node
}//end render_proposals



/**
* RENDER_PROPOSAL
* One proposal card: the criterion, the proposed value, the confidence, its
* PROVENANCE (rendered differently per source — see the module header), and the
* accept / reject actions.
*
* @param {Object} self
* @param {Object} proposal
* @returns {HTMLElement} card node
*/
const render_proposal = function(self, proposal) {

	const is_vision = proposal.source==='vision_model'

	const card = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'identify_proposal ' + (is_vision ? 'source_vision' : 'source_vote')
	})

	// head: the criterion, and the badge that says WHAT KIND OF CLAIM this is
		const head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_proposal_head',
			parent			: card
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'identify_source_badge ' + (is_vision ? 'vision' : 'vote'),
			text_content	: is_vision
				? (self.get_tool_label('identify_source_vision') || 'Model')
				: (self.get_tool_label('identify_source_vote') || 'Corpus'),
			parent			: head
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'identify_proposal_criterion',
			text_content	: proposal.label || proposal.criterion_id || '',
			parent			: head
		})
		head.appendChild(render_confidence(self, proposal))

	// the proposed value itself
		const value_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_proposal_value',
			text_content	: (typeof proposal.display==='string' && proposal.display.length>0)
				? proposal.display
				: (self.get_tool_label('identify_no_value') || '(no readable value)'),
			parent			: card
		})
		// a date proposal is a SPAN, and its parts are worth reading
		const date_range = proposal.date_range || null
		if (date_range) {
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'identify_proposal_value_parts',
				text_content	: (self.get_tool_label('identify_date_central') || 'central')
					+ ': ' + (date_range.central || ''),
				parent			: value_node
			})
		}

	// PROVENANCE — the part a curator must read before confirming
		card.appendChild(render_provenance(self, proposal))

	// actions
		card.appendChild(render_proposal_actions(self, proposal, card))


	return card
}//end render_proposal



/**
* RENDER_CONFIDENCE
* The proposal's confidence as a number plus a bar.
*
* Deliberately the SAME widget for both sources, and deliberately not a ranking:
* a model's 0.6 and a corpus consensus's 0.6 are not comparable quantities, so
* the badge and the provenance block next to it are what a curator reads. The
* bar only says "how sure was whoever said this".
*
* @param {Object} self
* @param {Object} proposal
* @returns {HTMLElement}
*/
const render_confidence = function(self, proposal) {

	const raw		= (typeof proposal.confidence==='number' && isFinite(proposal.confidence)) ? proposal.confidence : 0
	const percent	= Math.round(Math.max(0, Math.min(1, raw)) * 100)

	const node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'identify_confidence'
	})
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'identify_confidence_label',
		text_content	: self.get_tool_label('identify_confidence') || 'confidence',
		parent			: node
	})
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'identify_confidence_value',
		text_content	: percent + '%',
		parent			: node
	})
	const bar = ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'identify_confidence_bar',
		parent			: node
	})
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'identify_confidence_fill',
		style			: { width : percent + '%' },
		parent			: bar
	})


	return node
}//end render_confidence



/**
* RENDER_PROVENANCE
* WHERE THIS PROPOSAL COMES FROM — the block that keeps the two sources apart.
*
* A vote is rendered as a CHECKABLE claim: the neighbours that voted are listed
* by title and locator, each one opening the record, and the competing values
* are shown with their shares. A vision suggestion is rendered as an
* UNCORROBORATED one: an explicit sentence saying no record attests it, the
* model's identity and egress class, its own stated reason quoted verbatim, and
* the photograph it looked at.
*
* @param {Object} self
* @param {Object} proposal
* @returns {HTMLElement}
*/
const render_provenance = function(self, proposal) {

	const provenance	= proposal.provenance || {}
	const is_vision		= proposal.source==='vision_model'

	const node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'identify_provenance ' + (is_vision ? 'vision' : 'vote')
	})

	if (is_vision) {

		const model = provenance.model || {}

		// the claim, stated. Not decoration: it is the difference between "seven
		// records agree" and "one machine guessed".
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'identify_provenance_claim',
				text_content	: self.get_tool_label('identify_vision_claim')
					|| 'No record attests this. A vision model was shown this record’s photograph and suggested it from the profile’s own list of allowed values.',
				parent			: node
			})

		// which model, and whether it saw the picture off this host
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'identify_provenance_model',
				text_content	: (model.label || model.id || '')
					+ (model.id ? ' (' + model.id + ')' : '')
					+ ' — '
					+ (model.egress==='external'
						? (self.get_tool_label('identify_egress_external') || 'this model runs off this host, so the photograph was sent to it')
						: (self.get_tool_label('identify_egress_local') || 'this model runs on this host; the photograph did not leave it')),
				parent			: node
			})

		// the model's own words, verbatim
			const reason = (typeof provenance.reason==='string') ? provenance.reason.trim() : ''
			if (reason!=='') {
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'identify_provenance_quote',
					text_content	: reason,
					parent			: node
				})
			}

		// the photograph it read
			const image = provenance.image || {}
			const image_row = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'identify_provenance_image',
				parent			: node
			})
			image_row.appendChild(render_thumb(self, image.thumb_url || null, 'candidate'))
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'identify_provenance_image_label',
				text_content	: (self.get_tool_label('identify_vision_image') || 'the picture it looked at')
					+ (image.component_tipo ? ' (' + image.component_tipo + ')' : ''),
				parent			: image_row
			})

		return node
	}

	// ── the corpus vote ─────────────────────────────────────────────────────
		const votes = (typeof provenance.votes==='number') ? provenance.votes : 0
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identify_provenance_claim',
			text_content	: votes + ' '
				+ (self.get_tool_label('identify_vote_claim')
					|| 'readable record(s) like this one already record this value. Nothing was inferred and no model was used.'),
			parent			: node
		})

	// which neighbour leg found them, in the engine's own words
		const reason = (typeof provenance.neighbour_source_reason==='string') ? provenance.neighbour_source_reason : ''
		if (reason!=='') {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'identify_provenance_reason',
				text_content	: reason,
				parent			: node
			})
		}

	// THE CITING NEIGHBOURS. The whole reason a vote is checkable: each one is a
	// real record the curator can open and read.
		const evidence = Array.isArray(proposal.evidence) ? proposal.evidence : []
		if (evidence.length>0) {
			const list = ui.create_dom_element({
				element_type	: 'ul',
				class_name		: 'identify_evidence_list',
				parent			: node
			})
			for (let i = 0; i < evidence.length; i++) {
				const item		= evidence[i]
				const locator	= {
					section_tipo	: item.section_tipo,
					section_id		: item.section_id
				}
				const row = ui.create_dom_element({
					element_type	: 'li',
					class_name		: 'identify_evidence',
					parent			: list
				})
				const link = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'identify_evidence_title',
					text_content	: record_title(self, locator),
					parent			: row
				})
				link.title = self.get_tool_label('identify_open_record') || 'Open this record'
				link.addEventListener('click', function(e) {
					e.stopPropagation()
					self.open_record(locator)
				})
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'identify_evidence_locator',
					text_content	: item.section_tipo + ' / ' + item.section_id,
					parent			: row
				})
			}
		}

	// the competing values: a winner shown without them is a winner nobody can
	// weigh (0.51 and 0.99 read identically otherwise)
		const distribution = Array.isArray(proposal.distribution) ? proposal.distribution : []
		if (distribution.length>1) {
			const dist = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'identify_distribution',
				parent			: node
			})
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'identify_distribution_label',
				text_content	: self.get_tool_label('identify_distribution') || 'The neighbours were divided:',
				parent			: dist
			})
			for (let i = 0; i < distribution.length; i++) {
				const entry		= distribution[i]
				const share		= (typeof entry.share==='number' && isFinite(entry.share)) ? entry.share : 0
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'identify_distribution_entry',
					text_content	: (entry.value || '') + ' ' + Math.round(share * 100) + '%',
					parent			: dist
				})
			}
		}


	return node
}//end render_provenance



/**
* RENDER_PROPOSAL_ACTIONS
* Accept / Reject — or the server's own explanation of why this proposal cannot
* be accepted here.
*
* THE MULTI-HOP CASE is the one that matters: the value belongs to a record this
* one links to, so accepting it here would write a curator's confirmation into
* the wrong record. The panel refuses to do that and offers the linked record
* instead — it neither writes to the wrong place nor drops the proposal.
*
* Reject removes the card and remembers the key in memory only (no schema for a
* persisted rejection, and inventing one is out of scope): it comes back the
* next time the panel is opened.
*
* @param {Object} self
* @param {Object} proposal
* @param {HTMLElement} card - the card this row belongs to (removed on accept/reject)
* @returns {HTMLElement} actions node
*/
const render_proposal_actions = function(self, proposal, card) {

	const target = proposal.target || {}

	const actions = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'identify_proposal_actions'
	})

	// where it would land, always shown: a curator confirming a value should see
	// which field of which record is about to change
		if (typeof target.component_tipo==='string' && target.component_tipo.length>0) {
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'identify_proposal_target',
				text_content	: (self.get_tool_label('identify_writes_into') || 'writes into')
					+ ' ' + target.component_tipo
					+ (target.component_model ? ' (' + target.component_model + ')' : ''),
				parent			: actions
			})
		}

	// ── not writable: the server's own explanation, verbatim ────────────────
		if (target.writable!==true) {

			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'identify_proposal_blocked ' + (target.reason || 'unknown'),
				text_content	: (self.get_tool_label('identify_readonly') || 'Read-only here.')
					+ ' ' + (target.detail || ''),
				parent			: actions
			})

			// multi-hop: offer the record the value actually belongs to
				const open_records = Array.isArray(target.open_records) ? target.open_records : []
				for (let i = 0; i < open_records.length; i++) {
					const locator	= open_records[i]
					const button	= ui.create_dom_element({
						element_type	: 'button',
						class_name		: 'secondary identify_open_target',
						text_content	: (self.get_tool_label('identify_open_target') || 'Open')
							+ ' ' + record_title(self, locator),
						parent			: actions
					})
					button.addEventListener('click', function(e) {
						e.stopPropagation()
						self.open_record(locator)
					})
				}

			actions.appendChild(build_reject_button(self, proposal, card))

			return actions
		}

	// ── writable: accept, through the ordinary component save ───────────────
		const button_accept = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary identify_accept',
			text_content	: self.get_tool_label('identify_accept') || 'Accept',
			parent			: actions
		})
		const button_reject = build_reject_button(self, proposal, card)
		actions.appendChild(button_reject)

		button_accept.addEventListener('click', async function(e) {
			e.stopPropagation()

			button_accept.disabled	= true
			button_reject.disabled	= true

			const response = await self.accept_proposal(proposal)

			if (response===false) {
				button_accept.disabled	= false
				button_reject.disabled	= false
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'identify_proposal_error',
					text_content	: self.get_tool_label('identify_accept_failed')
						|| 'The value could not be saved. Nothing was written.',
					parent			: actions
				})
				return
			}

			// the criterion is recorded now, so the proposal is spent. The card is
			// replaced by a one-line confirmation rather than vanishing silently.
				card.replaceChildren()
				card.classList.add('accepted')
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'identify_proposal_accepted',
					text_content	: (self.get_tool_label('identify_accepted') || 'Saved:')
						+ ' ' + (proposal.label || proposal.criterion_id || '')
						+ ' = ' + (proposal.display || ''),
					parent			: card
				})

			// the ranking on screen was computed before this value existed. The
			// tool's own 'save' subscription already marks it stale from the
			// component's save event — nothing extra to do here.
		})


	return actions
}//end render_proposal_actions



/**
* BUILD_REJECT_BUTTON
* Dismiss a proposal for this session.
*
* NOT persisted, deliberately: there is no schema for a stored rejection and
* inventing one is out of scope. The proposal returns the next time the panel is
* opened — which is honest, since nothing about the record changed.
*
* @param {Object} self
* @param {Object} proposal
* @param {HTMLElement} card
* @returns {HTMLElement} button node
*/
const build_reject_button = function(self, proposal, card) {

	const button = ui.create_dom_element({
		element_type	: 'button',
		class_name		: 'secondary identify_reject',
		text_content	: self.get_tool_label('identify_reject') || 'Dismiss'
	})
	button.title = self.get_tool_label('identify_reject_note')
		|| 'Hides this suggestion until the panel is reopened. Nothing is recorded.'

	button.addEventListener('click', function(e) {
		e.stopPropagation()
		const key = self.proposal_key(proposal)
		if (Array.isArray(self.dismissed) && self.dismissed.indexOf(key)===-1) {
			self.dismissed.push(key)
		}
		card.remove()
	})


	return button
}//end build_reject_button



/**
* RECORD_TITLE
* The resolved title of a record, or its locator when none resolved.
*
* Titles come from the batched `get_section_terms` answer stored on
* `self.labels`. The server omits locators the caller may not read and sections
* whose section_map declares no term tipos, so a miss is expected and shows the
* locator instead of an empty string.
*
* @param {Object} self
* @param {Object} locator - {section_tipo, section_id}
* @returns {string}
*/
export const record_title = function(self, locator) {

	if (!locator) {
		return ''
	}

	const key	= locator.section_tipo + '_' + locator.section_id
	const term	= (self.labels && typeof self.labels[key]==='string') ? self.labels[key].trim() : ''

	return term!=='' ? term : (locator.section_tipo + ' / ' + locator.section_id)
}//end record_title



// @license-end
