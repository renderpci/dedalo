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
*/

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

		// floating button (fixed, bottom-right). Purple disc + white tool icon.
			const button = document.createElement('div')
			button.id = BUTTON_ID
			button.setAttribute('role', 'button')
			button.tabIndex = 0
			button.title = (typeof get_label!=='undefined' && get_label.error_report) || 'Report a problem'
			Object.assign(button.style, {
				position		: 'fixed',
				right			: '1rem',
				bottom			: '1rem',
				width			: '2.4rem',
				height			: '2.4rem',
				zIndex			: '2000',
				cursor			: 'pointer',
				display			: 'flex',
				alignItems		: 'center',
				justifyContent	: 'center',
				borderRadius	: '50%',
				backgroundColor	: 'rgba(90, 65, 131, 0.92)',
				boxShadow		: '0 2px 8px rgba(0, 0, 0, 0.35)',
				opacity			: '0.85'
			})

		// inner icon element so the white filter applies to the ICON only,
		// not the purple disc behind it.
			const icon = document.createElement('div')
			Object.assign(icon.style, {
				width				: '1.3rem',
				height				: '1.3rem',
				backgroundImage		: "url('/dedalo/tools/tool_error_report/img/icon.svg')",
				backgroundRepeat	: 'no-repeat',
				backgroundSize		: 'contain',
				backgroundPosition	: 'center',
				filter				: 'brightness(0) invert(1)'
			})
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
							label	: button.title
						}
					})
				} catch (error) {
					console.error('error_report_launcher: failed to open the tool', error)
				}
			}
			button.addEventListener('mousedown', (e) => e.stopPropagation())
			button.addEventListener('click', open_handler)
			button.addEventListener('keydown', (e) => { if (e.key==='Enter' || e.key===' ') open_handler(e) })

			document.body.appendChild(button)

	} catch (error) {
		// a launcher defect must never break the page it is meant to help report on
		console.error('error_report_launcher install failed', error)
	}
}

// @license-end
