// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/

// imports
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_PHONE_REORDER
* Up/down buttons for one sortable item. Drag-sort stays the desktop gesture;
* below @width_break_point_phone these buttons show instead (decision
* 2026-09-27: buttons, not a touch-drag rewrite). Visibility is CSS
* (tools_common/css/tool_responsive.less), so the tool renders them always.
*
* The tool owns the move: `on_move(-1|1)` must perform the SAME reorder its
* drop handler does (same save path) — these buttons are a second gesture, not
* a second implementation.
*
* @param {Object} options
* @param {function(number):(void|Promise<void>)} options.on_move - Called with -1 (up) or 1 (down).
* @param {{up:string,down:string}} options.labels - Accessible names (tool labels, translated).
* @param {boolean} [options.is_first=false] - Disables "up".
* @param {boolean} [options.is_last=false] - Disables "down".
* @returns {HTMLElement}
*/
export const render_phone_reorder = function(options) {

	const {on_move, labels, is_first=false, is_last=false} = options
	if (typeof on_move!=='function' || !labels?.up || !labels?.down) {
		throw new Error('render_phone_reorder: on_move and labels {up, down} are required')
	}

	const container = ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'phone_reorder'
	})

	const add = (glyph, label, direction, disabled) => {
		const button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'phone_reorder_btn',
			text_content	: glyph,
			parent			: container
		})
		button.type = 'button'
		button.title = label
		button.setAttribute('aria-label', label)
		button.disabled = disabled
		button.addEventListener('click', async (e) => {
			e.stopPropagation()
			button.disabled = true
			try {
				await on_move(direction)
			} finally {
				button.disabled = disabled
			}
		})
	}
	add('▲', labels.up, -1, is_first)
	add('▼', labels.down, 1, is_last)

	return container
}//end render_phone_reorder



// @license-end
