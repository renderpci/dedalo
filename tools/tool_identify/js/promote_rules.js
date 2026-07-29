// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/



/**
* PROMOTE_RULES
* The three DECISIONS the promotion flow makes, as pure functions — no DOM, no
* imports, no globals.
*
* Promotion writes curatorial data to thirty records at a time through the
* ordinary component save. What is dangerous about it is not the save, it is the
* REPORT: a run that says "attached" when nothing was written, or "already"
* because the existing link happened to sit on page 2 of the portal, teaches a
* curator that the catalogue says something it does not say. Silently attaching
* 27 of 30 is the worst outcome available here; reporting 30 attached when 3 were
* written is worse.
*
* So the rules live here, alone, where they can be tested without a browser:
*
*   - {@link attach_outcome}      what ONE member's save actually did, derived
*                                 from what the SERVER reported and nothing else.
*   - {@link data_limit_refusal}  whether the component may hold another link at
*                                 all (the portal's own `data_limit`, which the
*                                 bulk path bypasses because it does not go
*                                 through link_record).
*   - {@link lock_flow_controls}  freezing the whole promote block for the
*                                 duration of a run.
*
* Nothing here touches the network or the DOM tree beyond `querySelectorAll`, and
* nothing here writes.
*
* @module promote_rules
*/



/**
* TO_TOTAL
* A server-reported count as a number, or null when there is no usable one.
* Deliberately strict: `undefined`, `null`, `''` and NaN are all "the server did
* not say", and a missing count must never be read as zero (which would make
* every save look like a first link).
*
* @param {*} value
* @returns {number|null}
*/
const to_total = function(value) {

	if (value===null || value===undefined || value==='') {
		return null
	}
	const total = Number(value)

	return (Number.isFinite(total) && total>=0) ? total : null
}//end to_total



/**
* SERVER_TOTAL
* The count of locators the server says a component holds, read from a component
* datum in the canonical save/read shape: `result.data[] → {tipo, pagination:{total}}`.
*
* This is the ONLY authoritative count available to the client. `data.entries` is
* the currently loaded PAGE, so a component whose links span pages reports fewer
* entries than it holds — the bug that made "already linked" a guess.
*
* @param {Object|null|undefined} data_item - one element of result.data
* @returns {number|null}
*/
export const server_total = function(data_item) {

	if (!data_item || typeof data_item!=='object' || !data_item.pagination) {
		return null
	}

	return to_total(data_item.pagination.total)
}//end server_total



/**
* FIND_COMPONENT_DATA
* The saved component's own datum inside an API response
* (`api_response.result.data`), matched by tipo exactly as component_portal's
* link_record matches it.
*
* @param {*} api_response
* @param {string} component_tipo
* @returns {Object|null}
*/
export const find_component_data = function(api_response, component_tipo) {

	const data = (api_response && api_response.result && Array.isArray(api_response.result.data))
		? api_response.result.data
		: null
	if (data===null) {
		return null
	}
	const found = data.find(item => item && item.tipo===component_tipo)

	return (typeof found!=='undefined') ? found : null
}//end find_component_data



/**
* ATTACH_OUTCOME
* WHAT ONE MEMBER'S SAVE ACTUALLY DID — the server's answer, not the client's guess.
*
* The engine drops a duplicate locator instead of refusing the save
* (`save_component.ts` validateRelationInsert: "a dup is DROPPED so
* pagination.total stays unchanged — the client's server-authoritative duplicate
* check"), and it echoes the component back with its FULL total. So the total is
* the whole answer:
*
*   total_after >  total_before  → 'attached'   a locator was written
*   total_after <= total_before  → 'already'    the server dropped it as a dup,
*                                               over the WHOLE dataset — including
*                                               the pages this client never loaded
*   total_after === 0            → 'failed'     the component holds nothing after
*                                               a save that claimed success
*   either total unknown         → 'unconfirmed'
*
* 'unconfirmed' exists because the honest fourth answer must be sayable. A truthy
* `api_response.result` means "the request did not fail"; it does not mean a
* locator was written, and reporting 'attached' on it is precisely the false
* report this flow is built to avoid.
*
* @param {Object} options
*   options.api_response {*}          what change_value returned (false = cancelled)
*   options.component_tipo {string}   the link component, to find its datum
*   options.total_before {*}          the server-reported total BEFORE the save
* @returns {{status:string, detail:string}} status ∈ attached|already|failed|unconfirmed
*/
export const attach_outcome = function(options) {

	const api_response		= options.api_response
	const component_tipo	= options.component_tipo
	const total_before		= to_total(options.total_before)

	// change_value returns exactly false when the user cancelled or a guard
	// refused before any request left the browser
		if (api_response===false) {
			return { status : 'failed', detail : 'the save was cancelled' }
		}

	// a refusal is the server's own message, verbatim
		if (!api_response || typeof api_response!=='object' || !api_response.result) {
			const errors = (api_response && Array.isArray(api_response.errors)) ? api_response.errors : []
			const msg = (api_response && typeof api_response.msg==='string' && api_response.msg.length>0)
				? api_response.msg
				: (errors.join(', ') || 'the server refused the save')
			return { status : 'failed', detail : msg }
		}

	const total_after = server_total(find_component_data(api_response, component_tipo))

	if (total_after===null || total_before===null) {
		return {
			status : 'unconfirmed',
			detail : 'the save was accepted but the server did not report how many links this component holds, so it cannot be confirmed here that the Type was written — open the record and check it'
		}
	}

	// the component holds nothing at all after a successful save: whatever was
	// sent did not land (component_portal.link_record treats this the same way)
		if (total_after===0) {
			return {
				status : 'failed',
				detail : 'the server reports no links on this component after the save, so nothing was written'
			}
		}

	if (total_after>total_before) {
		return { status : 'attached', detail : '' }
	}

	return {
		status	: 'already',
		detail	: 'already linked to this Type — the server reports the same number of links after the save as before it, so nothing was written'
	}
}//end attach_outcome



/**
* DATA_LIMIT_REFUSAL
* THE PORTAL'S OWN CAPACITY RULE, HONOURED BY THE BULK PATH.
*
* `data_limit` is a client-side guard applied by `component_portal.link_record`
* (and `add_new_element`). This flow writes through `change_value` directly — the
* deliberate design, since the save must be the ordinary one — and therefore
* never passes that guard. A Type-link portal with `data_limit: 1` (the natural
* "one Type per record") would silently accept a second locator, which is exactly
* NOT "indistinguishable from a hand-entered value": by hand, the second link is
* refused with an alert.
*
* So the bulk path refuses too, per member, with an explanation the curator can
* act on — never a silent extra locator, and never a silent skip either (it is a
* reported outcome, counted in the summary).
*
* The count is the SERVER's total (the whole dataset), which is stricter and more
* honest than link_record's own page-length check.
*
* @param {Object} options
*   options.data_limit {*}     context.properties.data_limit (absent = no limit)
*   options.current_total {*}  links the component already holds
* @returns {string|null} the refusal detail, or null when there is room
*/
export const data_limit_refusal = function(options) {

	const data_limit = Number(options.data_limit)
	if (!Number.isFinite(data_limit) || data_limit<1) {
		return null // no limit declared: nothing to honour
	}

	const current = to_total(options.current_total)
	if (current===null) {
		return null // no trustworthy count: do not invent a refusal
	}

	if (current<data_limit) {
		return null
	}

	return 'this component accepts at most ' + data_limit + ' linked record(s) and already holds '
		+ current + ', so the Type link was not written — by hand the same link would be refused. '
		+ 'Remove the existing link first, or promote into the component that holds the Type link.'
}//end data_limit_refusal



/**
* LOCK_FLOW_CONTROLS
* FREEZE THE WHOLE PROMOTE BLOCK WHILE A RUN IS WRITING.
*
* Disabling only confirm and cancel is not a lock: the review button re-renders
* the stage (detaching the node the per-member outcomes are being written into,
* so the remaining failures become invisible), and the promote toggle closes the
* form — either one leaves a bulk write running against a UI that no longer shows
* it, and both allow a SECOND concurrent run over the same members.
*
* So the unit of locking is the whole `.identify_promote` block: every control
* inside it, whatever it is.
*
* Only controls this call actually disabled are re-enabled, so a button that was
* already disabled for its own reason stays that way; controls created DURING the
* run (the retry button) were never disabled by it and are left alone.
*
* @param {Object|null} root - the block element (anything with querySelectorAll)
* @returns {Function} unlock — idempotent, safe to call after the node is gone
*/
export const lock_flow_controls = function(root) {

	if (!root || typeof root.querySelectorAll!=='function') {
		return function() {}
	}

	const controls	= root.querySelectorAll('button, input, select, textarea')
	const locked	= []
	for (let i = 0; i < controls.length; i++) {
		const control = controls[i]
		if (control.disabled===true) {
			continue
		}
		control.disabled = true
		locked.push(control)
	}
	if (typeof root.classList!=='undefined' && root.classList) {
		root.classList.add('identify_promote_running')
	}

	let unlocked = false

	return function unlock() {
		if (unlocked===true) {
			return
		}
		unlocked = true
		if (typeof root.classList!=='undefined' && root.classList) {
			root.classList.remove('identify_promote_running')
		}
		for (let i = 0; i < locked.length; i++) {
			locked[i].disabled = false
		}
	}
}//end lock_flow_controls



// @license-end
