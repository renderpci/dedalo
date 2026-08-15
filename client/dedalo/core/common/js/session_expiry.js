/*global get_label, page_globals*/
/*eslint no-undef: "error"*/

/**
* SESSION_EXPIRY
* Warns the user BEFORE the session dies, so unsaved work can be committed instead
* of the next click failing (WC-051).
*
* WHY A LOCAL TIMER AND NOT A SERVER COUNTDOWN. The idle window restarts on every
* authenticated request, so a per-response `expires_in` field would carry the same
* number over and over — a countdown the client can hold itself, for free. Only the
* ABSOLUTE deadline is underivable here, so THAT is what the boot payload ships
* (`dedalo_session_absolute_expires_in`), once. Together they give the exact
* server-side rule: the session dies at whichever comes first.
*
* Recovery AFTER expiry is not this module's job — the server answers 401 with
* `error.code 'auth.not_logged'` and the client already raises the re-login modal on that
* token (page.js), with components retrying on `login_successful`.
*
* @see src/core/resolve/environment.ts buildPageGlobals — the three page_globals keys
* @see src/core/security/session_store.ts — the two clocks this mirrors
*/



	import {event_manager} from './event_manager.js'



/**
* Module state. Deliberately module-scoped and NOT per-instance: there is exactly
* one session per browsing context, so a second watcher would double-warn.
*/
	let idle_timer_id		= null
	let absolute_timer_id	= null
	// Latched so the warning fires ONCE per idle window rather than on every tick;
	// cleared whenever activity re-arms the timer.
	let warned				= false
	// Milliseconds. Resolved once at init from page_globals.
	let idle_ttl_ms			= 0
	let warning_lead_ms		= 0
	// Epoch ms of the absolute cap, or null when the operator disabled it.
	let absolute_deadline	= null



/**
* SHOW_WARNING
* Publishes the sticky notification. `remove_time` is null on purpose: a warning
* that vanishes on its own is a warning the user missed. Activity dismisses it by
* re-arming (the next notification replaces it) — and activity is precisely what
* makes it moot.
* @param {number} ms_left
* @return {void}
*/
	const show_warning = function(ms_left) {

		const minutes = Math.max(1, Math.round(ms_left / 60000))
		const template = (typeof get_label!=='undefined' && get_label.session_expiry_warning)
			? get_label.session_expiry_warning
			: 'Your session expires in %s min. Keep working to stay signed in.'

		event_manager.publish('notification', {
			msg			: template.replace('%s', minutes),
			type		: 'warning',
			remove_time	: null
		})
	}//end show_warning



/**
* ARM
* (Re)start the idle countdown. Called on init and on every authenticated API
* response, mirroring the server's `last_seen` refresh — the two clocks stay in
* step because they are driven by the same events.
* @return {void}
*/
	const arm = function() {

		if (idle_timer_id!==null) {
			clearTimeout(idle_timer_id)
		}
		warned = false

		if (idle_ttl_ms<=0 || warning_lead_ms<=0) {
			return // warning disabled (SESSION_WARNING_SECONDS=0) or nothing to arm
		}

		// Fire at the warning threshold, not at expiry: the point is to warn while
		// the session is still usable.
		const delay = idle_ttl_ms - warning_lead_ms
		if (delay<=0) {
			// Lead time >= the whole window: warn immediately, the window is tiny.
			warned = true
			show_warning(idle_ttl_ms)
			return
		}

		idle_timer_id = setTimeout(() => {
			if (warned===true) {
				return
			}
			warned = true
			show_warning(warning_lead_ms)
		}, delay)
	}//end arm



/**
* ARM_ABSOLUTE
* The cap cannot be postponed by activity, so it gets its own one-shot timer set at
* init and never re-armed. Without this, a user working continuously would be logged
* out with no warning at all — the idle timer never fires for them.
* @return {void}
*/
	const arm_absolute = function() {

		if (absolute_deadline===null || warning_lead_ms<=0) {
			return
		}
		if (absolute_timer_id!==null) {
			clearTimeout(absolute_timer_id)
		}

		const delay = absolute_deadline - Date.now() - warning_lead_ms
		if (delay<=0) {
			show_warning(Math.max(0, absolute_deadline - Date.now()))
			return
		}
		absolute_timer_id = setTimeout(() => {
			show_warning(warning_lead_ms)
		}, delay)
	}//end arm_absolute



/**
* INIT_SESSION_EXPIRY
* Wire the watcher. Safe to call when logged out or when the keys are absent (an
* older server, or an install that disabled the warning): it simply does nothing.
* @return {bool} true when armed, false when inert
*/
	export const init_session_expiry = function() {

		const globals = (typeof page_globals!=='undefined') ? page_globals : null
		if (!globals || globals.is_logged!==true) {
			return false
		}

		const ttl_seconds		= Number(globals.dedalo_session_ttl_seconds)
		const warning_seconds	= Number(globals.dedalo_session_warning_seconds)
		if (!Number.isFinite(ttl_seconds) || ttl_seconds<=0) {
			return false
		}
		if (!Number.isFinite(warning_seconds) || warning_seconds<=0) {
			return false // operator turned the warning off
		}

		idle_ttl_ms		= ttl_seconds * 1000
		warning_lead_ms	= warning_seconds * 1000

		const absolute_seconds = Number(globals.dedalo_session_absolute_expires_in)
		absolute_deadline = Number.isFinite(absolute_seconds) && absolute_seconds>0
			? Date.now() + (absolute_seconds * 1000)
			: null

		// Every authenticated API response is an activity beat — data_manager
		// publishes it from the same block that refreshes the CSRF token, so the
		// client's idle clock and the server's `last_seen` advance together.
		event_manager.subscribe('session_activity', arm)

		arm()
		arm_absolute()

		return true
	}//end init_session_expiry
