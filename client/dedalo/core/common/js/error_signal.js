// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/

/**
* ERROR_SIGNAL
* The ONE page-wide "something went wrong" signal: a window CustomEvent that
* any observer may listen to. Today its single consumer is the error-report
* launcher tab (common/js/error_report_launcher.js), which unfolds itself so a
* user who just saw a failure can report it without hunting for the launcher.
*
* Two producers, both of which the user actually experiences:
*   - common/js/error_capture.js — an uncaught JS error / unhandled rejection;
*   - common/js/error_dispatch.js — an ApiError that was SHOWN (toast, modal,
*     inline, page panel). Silent policies and a recovered relogin are not
*     failures the user can describe, so they never raise the signal.
*
* It is a SIGNAL, not a channel: it carries no error payload beyond a coarse
* origin and code. The error data itself stays where it already lives — the
* bounded window.dedalo_js_errors buffer that tool_error_report reads when the
* user explicitly asks to report a problem. Nothing here transmits or stores.
*
* NOTE error_capture.js cannot import this module: it is a side-effect-only
* module that installs its listeners before any other application module
* evaluates, and it declares no imports on purpose. It therefore repeats the
* event name as a literal, and test/unit/client_error_signal.test.ts refuses
* the two from drifting apart.
*/

/** The window event name. Repeated as a literal in error_capture.js (gated). */
export const ERROR_SIGNAL = 'dedalo_error_signal'


/**
* SIGNAL_ERROR
* Raise the signal. Never throws: a page that is already failing must not fail
* twice because the observer machinery did.
* @param {object} detail {origin:'js'|'api', code:string|null}
* @return {void}
*/
export const signal_error = (detail) => {
	try {
		window.dispatchEvent(new CustomEvent(ERROR_SIGNAL, {detail: detail || {}}))
	} catch (e) {
		// an observer must never break the page it observes
	}
}//end signal_error

// @license-end
