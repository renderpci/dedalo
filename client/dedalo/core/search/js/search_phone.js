// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label*/
/*eslint no-undef: "error"*/

// imports
import { ui } from '../../common/js/ui.js';

/**
 * SEARCH_PHONE
 * The phone gestures of the search pane.
 *
 * The filter builder is drag-only: a field is dragged from the FIELDS list onto
 * a group. HTML5 drag never fires from a finger, so on a touch screen the task
 * cannot be done at all (the same gap tools_common/js/touch_pick.js closes for
 * the tools). Here the gesture is a plain TAP: every field row carries a "+"
 * (render_add_field_button) and adding routes through the SAME on_drop the drop
 * handler uses (synthetic_drop_event) — a second gesture, not a second
 * implementation.
 *
 * Whether to offer the tap is decided by the caller (touch_pick.is_touch(): a
 * coarse pointer, not a width — a narrow desktop window still drags).
 */

/**
 * SYNTHETIC_DROP_EVENT
 * The minimal DragEvent shape a drop handler reads
 * (`preventDefault`, `stopPropagation`, `dataTransfer.getData`), so a tap can
 * feed the exact same drop path as a mouse drag. Same contract as
 * touch_pick.as_drop_event, built here because there is no held payload: the
 * tap adds immediately.
 *
 * @param {string} data - exactly what dragstart puts in dataTransfer 'text/plain'
 * @returns {Object} a synthetic drop event
 */
export const synthetic_drop_event = (data) => ({
	preventDefault: () => {},
	stopPropagation: () => {},
	dataTransfer: {
		getData: () => data,
	},
}); //end synthetic_drop_event

/**
 * RENDER_ADD_FIELD_BUTTON
 * The phone-only "+" a field row carries: one tap adds the field to the search
 * canvas. A real <button> with an accessible name so it is not just a glyph.
 *
 * @param {Object} options
 * @param {string} options.label - accessible name / tooltip (translated)
 * @param {string} [options.field_label] - the field's own name, appended to the accessible name
 * @param {function():void} options.on_add - called once per tap (the search does the add)
 * @returns {HTMLElement} the button node (caller appends it to the row)
 */
export const render_add_field_button = (options) => {
	if (!options || typeof options.on_add !== 'function') {
		throw new Error('render_add_field_button: on_add is required');
	}

	const label = options.label || get_label.add_field || 'Add field';

	const button = ui.create_dom_element({
		element_type: 'button',
		type: 'button',
		class_name: 'add_field_button',
		title: label,
		aria: {
			label: options.field_label ? label + ': ' + options.field_label : label,
		},
	});

	button.addEventListener('click', (e) => {
		// the row itself may drill into a child section (has_subquery): a tap on
		// the "+" is an add, never that
		e.stopPropagation();
		e.preventDefault();
		options.on_add();
	});

	return button;
}; //end render_add_field_button

// @license-end
