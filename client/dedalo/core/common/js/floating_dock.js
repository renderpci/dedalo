/*eslint no-undef: "error"*/

/**
* FLOATING_DOCK
* The ONE bottom-right corner where global floating UI lives.
*
* Extracted from error_report_launcher.js when a SECOND tenant appeared (the job
* tray). The dock was never the error launcher's property — core/page/css/layout/
* floating_dock.less already describes it as a shared facility and states the law
* this module exists to make followable:
*
*   "Never position a global button with its own fixed coordinates."
*
* That corner is CONTESTED: the inspector rail in edit mode and the assistant
* composer in list mode both claim it, and the dock's offsets are calc()s over
* --inspector_width so every tenant follows a live panel resize for free. A
* second module hand-rolling `position:fixed; bottom:1rem` re-opens exactly the
* overlap bug the dock was built to close.
*
* Adding a tenant: append it here and give it .floating_dock_button (or your own
* class for a non-disc tenant). The column stacks upwards from the corner.
*/

const DOCK_ID = 'floating_dock'


/**
* GET_FLOATING_DOCK
* The global floating dock, created on first use. A bare positioning frame —
* everything visual lives in floating_dock.less.
*
* @returns {HTMLElement}
*/
export function get_floating_dock() {

	const found = document.getElementById(DOCK_ID)
	if (found) {
		return found
	}

	const dock = document.createElement('div')
	dock.id = DOCK_ID
	document.body.appendChild(dock)

	return dock
}//end get_floating_dock
