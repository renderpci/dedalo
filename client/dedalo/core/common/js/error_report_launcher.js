// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals, get_label */
/*eslint no-undef: "error"*/

/**
* ERROR_REPORT_LAUNCHER
*
* The SINGLE global launcher for tool_error_report: a small fixed button that
* lets an administrator report a problem from ANY page — list, thesaurus, area,
* edit, AND menu-less windows (e.g. a thesaurus term opened with `?menu=false`,
* print windows). One consistent surface, present everywhere, so there is no
* menu-bar duplicate to reason about.
*
* Admin-only (matches the tool's own access). Called once from
* core/page/js/index.js after the page renders. Idempotent, and never throws
* (a launcher defect must not break the page).
*
* open_tool is imported LAZILY (on click) so this global boot module does not
* pull the tool machinery into every page load.
*
* SHAPE: a LATERAL TAB on the right edge (since 2026-09-22), not a floating
* corner disc. The tool is used very rarely, so the launcher must be present
* everywhere while taking almost no screen and overlapping nothing: at rest the
* tab is a ~12px sliver flush to the edge and reveals its icon on hover/focus.
* It keeps ONE constant position in every mode — list, edit, thesaurus,
* menu-less — because a once-a-month launcher lives on habit.
*
* ALERTED STATE: the tab listens to the page-wide error signal
* (ERROR_SIGNAL, declared in common/js/error_dispatch.js — an uncaught JS
* error, or an ApiError the user was
* actually shown) and UNFOLDS, icon out, so the launcher is obvious exactly when
* it is needed. It folds back on the FIRST HOVER OR FOCUS — the cue has been
* seen, and an unfolded tab sits over the inspector rail's scrollbar gutter, so
* a state the user cannot dismiss would turn the fix into a click trap. No
* timer: a cue that expires while the user is still reading the toast that
* caused it has told nobody anything.
*
* The COUNT is not the cue. It rides in the title and survives the fold, so a
* hover still says how many failures are unreported; only a successful open of
* the tool resets it.
*
* POSITION IS NOT SET HERE. All geometry lives in
* core/page/css/layout/error_report_tab.less — the alerted state too
* (.error_report_edge_tab.alerted), never an inline style.
*/

import {ERROR_SIGNAL} from './error_dispatch.js'

const BUTTON_ID = 'error_report_floating_launcher'

export function install_error_report_launcher() {

	try {

		// admin only (matches getUserTools: the tool is granted to global admins)
			if (typeof page_globals==='undefined' || page_globals.is_global_admin!==true) {
				return
			}

		// idempotent
			if (document.getElementById(BUTTON_ID)) {
				return
			}

		// edge tab. Purple sliver + white tool icon; placed by the stylesheet.
			const button = document.createElement('div')
			button.id = BUTTON_ID
			button.className = 'error_report_edge_tab'
			button.setAttribute('role', 'button')
			button.tabIndex = 0
			const base_title = (typeof get_label!=='undefined' && get_label.error_report) || 'Report a problem'
			button.title = base_title

		// alerted state. Two levels, deliberately: the UNFOLDING is the attention
		// cue (folded by the first hover/focus, below) and the COUNT is the
		// pending-report state, reset only by a successful open (clear_alert).
			let pending = 0
			const fold_alert = () => button.classList.remove('alerted')
			const clear_alert = () => {
				pending = 0
				fold_alert()
				button.title = base_title
			}

		// inner icon element so the white filter applies to the ICON only,
		// not the purple tab behind it. Only the image is set here (it is
		// tool-specific); the box is styled by .error_report_tab_icon.
			const icon = document.createElement('div')
			icon.className = 'error_report_tab_icon'
			icon.style.backgroundImage = "url('/dedalo/tools/tool_error_report/img/icon.svg')"
			button.appendChild(icon)

			const open_handler = async (e) => {
				e.stopPropagation()
				try {
					const { open_tool } = await import('../../../core/tools_common/js/tool_common.js')
					// synthetic caller: view_modal requires one (lang / id_base /
					// label). This launcher runs on menu-less pages with no live
					// component; the tool's on_close_actions skips the component
					// re-activate that would fail on a synthetic caller.
					const search = new URLSearchParams(window.location.search)
					const tipo = search.get('tipo') || search.get('t') || 'dd85'
					await open_tool({
						tool_context	: 'tool_error_report',
						caller	: {
							model	: 'error_report_launcher',
							type	: 'tool',
							tipo	: tipo,
							lang	: (typeof page_globals!=='undefined' && page_globals.dedalo_data_lang) || 'lg-eng',
							id_base	: 'error_report_launcher',
							label	: base_title
						}
					})
					// only NOW: an alert cleared by a click that opened nothing would
					// lose the one cue pointing at an unreported failure (the import
					// can 404, and menu-less pages are this launcher's habitat).
					clear_alert()
				} catch (error) {
					console.error('error_report_launcher: failed to open the tool', error)
				}
			}
			button.addEventListener('mousedown', (e) => e.stopPropagation())
			button.addEventListener('click', open_handler)
			button.addEventListener('keydown', (e) => { if (e.key==='Enter' || e.key===' ') open_handler(e) })

			document.body.appendChild(button)

		// SEED from the buffer before listening. error_capture.js installs its window
		// handlers before any application module evaluates; this launcher installs at
		// the END of page build (page/js/index.js), so every boot-time failure — the
		// very case this feature exists for — raised the signal into a void. The
		// buffer already holds those entries, so the state is recoverable.
			const captured = Array.isArray(window.dedalo_js_errors) ? window.dedalo_js_errors.length : 0
			if (captured > 0) {
				pending = captured
				button.classList.add('alerted')
				button.title = base_title + ' (' + pending + ')'
			}

		// the cue has been seen: fold. `once` is wrong here — the tab must unfold
		// again for the NEXT failure, so it re-arms with every signal.
			button.addEventListener('mouseenter', fold_alert)
			button.addEventListener('focus', fold_alert)

		// One listener for the page's life: the signal is raised by error_capture.js
		// (uncaught JS) and error_dispatch.js (a SHOWN ApiError). Opening the tool
		// clears it — the user has been taken to the report form, which is the
		// whole point of the unfolding.
			window.addEventListener(ERROR_SIGNAL, () => {
				try {
					pending += 1
					button.classList.add('alerted')
					button.title = base_title + ' (' + pending + ')'
				} catch (error) {
					// an observer must never break the page it observes
				}
			})

	} catch (error) {
		// a launcher defect must never break the page it is meant to help report on
		console.error('error_report_launcher install failed', error)
	}
}

// @license-end
