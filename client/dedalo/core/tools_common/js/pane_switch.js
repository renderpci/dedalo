// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/

// imports
import { ui } from '../../../core/common/js/ui.js';

/**
 * RENDER_PANE_SWITCH
 * Phone layout for a multi-pane tool (media ↔ text, source ↔ target): renders
 * a `[A | B]` segmented switch that shows ONE pane at a time below
 * @width_break_point_phone. On desktop the switch is `display:none` and every
 * pane shows — the CSS decides (tools_common/css/tool_responsive.less), so the
 * tool keeps a single render path.
 *
 * The tool marks each pane node `data-pane="<key>"` (any depth under `host`)
 * and inserts the returned node where the switch should sit (usually first in
 * content_data).
 *
 * @param {HTMLElement} host - Ancestor of every pane (e.g. the tool's content_data).
 * @param {Array<{key:string,label:string}>} panes - In display order; the first is active.
 * @returns {HTMLElement} The switch nav node.
 */
export const render_pane_switch = function (host, panes) {
	if (!host || !Array.isArray(panes) || panes.length < 2) {
		throw new Error('render_pane_switch: a host and at least two panes are required');
	}

	host.classList.add('pane_host', 'pane_switch_on');

	const nav = ui.create_dom_element({
		element_type: 'nav',
		class_name: 'pane_switch',
	});
	nav.setAttribute('role', 'tablist');

	const buttons = new Map();
	const activate = (key) => {
		for (const node of host.querySelectorAll('[data-pane]')) {
			node.classList.toggle('pane_active', node.dataset.pane === key);
		}
		for (const [k, button] of buttons) {
			const on = k === key;
			button.classList.toggle('active', on);
			button.setAttribute('aria-selected', on ? 'true' : 'false');
		}
		host.dataset.activePane = key;
	};

	for (const { key, label } of panes) {
		const button = ui.create_dom_element({
			element_type: 'button',
			class_name: 'pane_btn',
			text_content: label,
			parent: nav,
		});
		button.type = 'button';
		button.setAttribute('role', 'tab');
		button.addEventListener('click', (e) => {
			e.stopPropagation();
			activate(key);
		});
		buttons.set(key, button);
	}

	// panes may render after the switch (async tools): re-apply on insertion
	const observer = new MutationObserver(() => activate(host.dataset.activePane));
	observer.observe(host, { childList: true, subtree: true });

	activate(panes[0].key);

	return nav;
}; //end render_pane_switch

// @license-end
