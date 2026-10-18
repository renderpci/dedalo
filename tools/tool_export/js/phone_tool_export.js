// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/

/**
 * PHONE_TOOL_EXPORT
 * The phone gestures of tool_export: adding an export column and reordering the
 * selected columns without an HTML5 drag (HTML5 drag never fires from a finger).
 *
 * Both gestures are a SECOND GESTURE, NOT A SECOND IMPLEMENTATION — they route
 * through the same drop model the mouse uses (drag_tool_export.js):
 *  - add: builds the exact payload `on_dragstart` would and calls `on_drop`,
 *    so the column is created by the one build path;
 *  - move: performs the same DOM reorder `on_drop`'s 'sort' branch does, then
 *    syncs (sync_ar_ddo_to_export + update_local_db_data).
 *
 * The "+" is created only when `touch_pick.is_touch()` is true (a coarse
 * pointer, not a width — a narrow desktop window still drags), so a fine-pointer
 * row stays drag-only. The up/down buttons are always rendered and shown by CSS
 * at the phone tier (tools_common/js/phone_reorder.js).
 *
 * Exports: on_component_row, add_export_component_from_row, move_export_component,
 *          update_phone_reorder_state, render_add_column_button,
 *          synthetic_drop_event
 */

import { is_touch } from '../../../core/common/js/touch_pick.js';
// imports
import { ui } from '../../../core/common/js/ui.js';

/**
 * SYNTHETIC_DROP_EVENT
 * The minimal DragEvent shape `on_drop` reads (`preventDefault`,
 * `stopPropagation`, `dataTransfer.getData`), so a tap can feed the exact same
 * drop path as a mouse drag. Same contract as touch_pick.as_drop_event.
 *
 * @param {string} [data] - what dragstart would have put in dataTransfer
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
 * RENDER_ADD_COLUMN_BUTTON
 * The phone-only "+" a component row carries: one tap adds that component as an
 * export column. A real <button> with an accessible name (not just a glyph).
 *
 * @param {Object} options
 * @param {string} options.label - accessible name / tooltip (translated)
 * @param {string} [options.field_label] - the component's own name, appended
 * @param {function():(boolean|void)} options.on_add - called once per tap
 * @returns {HTMLElement}
 */
export const render_add_column_button = (options) => {
	if (!options || typeof options.on_add !== 'function') {
		throw new Error('render_add_column_button: on_add is required');
	}

	const label = options.label || 'Add column';

	const button = ui.create_dom_element({
		element_type: 'button',
		type: 'button',
		// the SHARED fields-picker "+" class: the row affordance is styled once,
		// in the fields-picker sheet (search.less, loaded by main.css on every
		// page), so a search field row and an export component row are the same
		// control — not two copies that can drift.
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
}; //end render_add_column_button

/**
 * ON_COMPONENT_ROW
 * Caller hook for `render_components_list` (common/js/render_common.js): called
 * once per draggable component row. On a touch screen it appends the phone "+"
 * that adds the column on a tap; a finger cannot drag, so without it the export
 * cannot be configured at all. On a fine pointer it does nothing and the row
 * stays drag-only.
 *
 * @param {Object} options - {node, element, path} from render_components_list
 * @returns {boolean} true when the "+" was added
 */
export const on_component_row = function (options) {
	if (!is_touch()) {
		return false;
	}

	const node = options?.node;
	if (!node || node.querySelector(':scope > .add_field_button')) {
		return false;
	}

	// the row is draggable chrome: mark it so CSS drops the drag handle and
	// reserves room for the button
	node.classList.add('has_add_button');

	const button = render_add_column_button({
		label: this.get_tool_label('add_column') || 'Add column',
		field_label: node.textContent ? node.textContent.trim() : '',
		on_add: () => this.add_export_component_from_row(node, options.path),
	});
	node.appendChild(button);

	return true;
}; //end on_component_row

/**
 * ADD_EXPORT_COMPONENT_FROM_ROW
 * Adds one export column from a tap: builds the payload `on_dragstart` would
 * (same `path`, same `ddo`, same composed id) and reuses `on_drop`, so a tap is
 * the same add the drop is. A component already in the list is refused and
 * pointed at, exactly as the drag refuses a duplicate (on_dragover).
 *
 * @param {HTMLElement} node - the source row (carries `.ddo`)
 * @param {Array} path - the calculated component path (from render_components_list)
 * @returns {boolean} true when on_drop was invoked
 */
export const add_export_component_from_row = function (node, path) {
	const ddo = node?.ddo;
	const list = this.user_selection_list;
	if (!ddo || !list) {
		return false;
	}

	const payload = {
		drag_type: 'add',
		path: path,
		ddo: ddo,
		id: this.compose_id(ddo, path),
	};

	// duplicate: the same column is already selected — highlight it, add nothing
	const items = [...list.children].filter((el) => el.classList.contains('export_component'));
	const existing = items.find((el) => el.ddo?.id === payload.id);
	if (existing) {
		existing.classList.add('drop_duplicate');
		existing.scrollIntoView({ block: 'nearest' });
		setTimeout(() => existing.classList.remove('drop_duplicate'), 600);
		return false;
	}

	// append. A tap has no pointer, so the insertion index is the end of the
	// list; on_drop reads self.drag_payload + self.drop_index.
	this.drag_payload = payload;
	this.drop_index = items.length;

	return this.on_drop(list, synthetic_drop_event(JSON.stringify(payload)));
}; //end add_export_component_from_row

/**
 * MOVE_EXPORT_COMPONENT
 * The touch twin of the sort drag: moves one selected column up (-1) or down
 * (+1) and syncs — the same DOM reorder `on_drop`'s 'sort' branch performs, so
 * the save path is identical. Bounds are checked (a first row cannot move up,
 * a last row cannot move down), so an out-of-range move is a no-op.
 *
 * @param {HTMLElement} row - the .export_component to move
 * @param {number} direction - -1 (up) | 1 (down)
 * @returns {boolean} true when the row moved
 */
export const move_export_component = function (row, direction) {
	const list = this.user_selection_list;
	if (!list || !row) {
		return false;
	}

	const items = [...list.children].filter((el) => el.classList.contains('export_component'));
	const index = items.indexOf(row);
	if (index === -1) {
		return false;
	}

	const target = index + direction;
	if (target < 0 || target >= items.length) {
		return false;
	}

	// up   -> before the previous item
	// down -> before the item after the next one (null appends: last place)
	const reference = direction < 0 ? items[target] : items[target + 1] || null;
	list.insertBefore(row, reference);

	this.sync_ar_ddo_to_export();
	this.update_local_db_data();

	return true;
}; //end move_export_component

/**
 * UPDATE_PHONE_REORDER_STATE
 * Corrects the disabled state of every row's up/down buttons against the
 * current list order — called after every list mutation (sync_ar_ddo_to_export),
 * so the first row's "up" and the last row's "down" are always disabled.
 *
 * @returns {void}
 */
export const update_phone_reorder_state = function () {
	const list = this.user_selection_list;
	if (!list) {
		return;
	}

	const items = [...list.children].filter((el) => el.classList.contains('export_component'));
	const last = items.length - 1;

	items.forEach((row, index) => {
		const buttons = row.querySelectorAll(':scope > .phone_reorder > .phone_reorder_btn');
		if (buttons[0]) {
			buttons[0].disabled = index === 0;
		}
		if (buttons[1]) {
			buttons[1].disabled = index === last;
		}
	});
}; //end update_phone_reorder_state

// @license-end
