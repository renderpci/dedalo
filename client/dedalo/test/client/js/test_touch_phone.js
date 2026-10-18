// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

import { a11y } from '../../../core/common/js/a11y.js';
import { render_components_list } from '../../../core/common/js/render_common.js';
import * as touch_pick from '../../../core/common/js/touch_pick.js';
import { ui } from '../../../core/common/js/ui.js';
import {
	render_add_field_button,
	synthetic_drop_event,
} from '../../../core/search/js/search_phone.js';
import { render_pane_switch } from '../../../core/tools_common/js/pane_switch.js';
import { render_phone_reorder } from '../../../core/tools_common/js/phone_reorder.js';

// The phone gestures shared by the tools (responsive-tools plan). Backend-free:
// synthetic DOM, no API.

describe('TOUCH_PICK : tap to pick, tap to place', () => {
	it('pick holds the payload, shows the bar, as_drop_event hands it over once', () => {
		const payload = JSON.stringify({
			locator: { section_tipo: 'test3', section_id: '1' },
			caller: 'tool_cataloging',
		});

		touch_pick.pick(payload, '1');
		assert.equal(touch_pick.active(), true);
		assert.ok(document.querySelector('.touch_pick_bar'), 'the bar is shown');
		assert.ok(document.body.classList.contains('touch_pick_active'));

		const event = touch_pick.as_drop_event();
		// the minimal DragEvent shape the existing drop handlers read
		assert.equal(typeof event.preventDefault, 'function');
		assert.equal(typeof event.stopPropagation, 'function');
		assert.equal(event.dataTransfer.getData('text/plain'), payload);

		// consumed: nothing left to place, bar and body class gone
		assert.equal(touch_pick.active(), false);
		assert.equal(touch_pick.as_drop_event(), null);
		assert.equal(document.querySelector('.touch_pick_bar'), null);
		assert.equal(document.body.classList.contains('touch_pick_active'), false);
	});

	it('cancel drops the payload without placing it', () => {
		touch_pick.pick('{"a":1}', 'x');
		document.querySelector('.touch_pick_cancel').click();
		assert.equal(touch_pick.active(), false);
		assert.equal(touch_pick.as_drop_event(), null);
		assert.equal(document.querySelector('.touch_pick_bar'), null);
	});

	it('a second pick replaces the first (one payload per page)', () => {
		touch_pick.pick('"first"', 'a');
		touch_pick.pick('"second"', 'b');
		assert.equal(document.querySelectorAll('.touch_pick_bar').length, 1);
		assert.equal(touch_pick.as_drop_event().dataTransfer.getData('text/plain'), '"second"');
	});
});

describe('PANE_SWITCH : one pane at a time on a phone', () => {
	it('marks the first pane active and switches on click', () => {
		const host = document.createElement('div');
		const a = document.createElement('div');
		a.dataset.pane = 'media';
		host.appendChild(a);
		const b = document.createElement('div');
		b.dataset.pane = 'text';
		host.appendChild(b);

		const nav = render_pane_switch(host, [
			{ key: 'media', label: 'Media' },
			{ key: 'text', label: 'Text' },
		]);
		host.prepend(nav);

		assert.ok(host.classList.contains('pane_switch_on'));
		assert.ok(a.classList.contains('pane_active'));
		assert.ok(!b.classList.contains('pane_active'));

		nav.querySelectorAll('.pane_btn')[1].click();
		assert.ok(!a.classList.contains('pane_active'));
		assert.ok(b.classList.contains('pane_active'));
		assert.equal(nav.querySelectorAll('.pane_btn')[1].getAttribute('aria-selected'), 'true');
	});

	it('refuses fewer than two panes', () => {
		assert.throws(() =>
			render_pane_switch(document.createElement('div'), [{ key: 'a', label: 'A' }]),
		);
	});
});

describe('PHONE_REORDER : up/down replaces drag-sort on a phone', () => {
	it('calls on_move with -1 / 1 and disables the ends', async () => {
		const moves = [];
		const node = render_phone_reorder({
			on_move: (d) => {
				moves.push(d);
			},
			labels: { up: 'Up', down: 'Down' },
			is_first: true,
		});
		const [up, down] = node.querySelectorAll('.phone_reorder_btn');

		assert.equal(up.disabled, true, 'first item cannot move up');
		assert.equal(down.disabled, false);
		assert.equal(up.getAttribute('aria-label'), 'Up');

		down.click();
		await new Promise((r) => setTimeout(r, 0));
		assert.deepEqual(moves, [1]);
	});

	it('requires on_move and both labels', () => {
		assert.throws(() => render_phone_reorder({ on_move: () => {}, labels: { up: 'Up' } }));
	});
});

describe('SEARCH_PHONE : tap-to-add replaces the field drag on a phone', () => {
	it('the "+" adds once and eats the row click (drill)', () => {
		let adds = 0;
		let row_clicked = false;
		// the row is an activable drill target, like the real field rows
		const row = document.createElement('li');
		a11y.make_activable(row, {
			on_activate: () => {
				row_clicked = true;
			},
		});
		const button = render_add_field_button({
			label: 'Add field',
			field_label: 'Title',
			on_add: () => {
				adds++;
			},
		});
		row.appendChild(button);

		button.click();

		assert.equal(adds, 1);
		assert.equal(row_clicked, false, 'the row click must not fire (has_subquery drill)');
		assert.equal(button.type, 'button');
		assert.equal(button.getAttribute('aria-label'), 'Add field: Title');
	});

	it('requires on_add', () => {
		assert.throws(() => render_add_field_button({ label: 'x' }));
	});

	it('synthetic_drop_event feeds the one drop handler the same payload', () => {
		const data = JSON.stringify({ path: '[]', section_id: '0' });
		const event = synthetic_drop_event(data);
		assert.equal(typeof event.preventDefault, 'function');
		assert.equal(typeof event.stopPropagation, 'function');
		assert.equal(event.dataTransfer.getData('text/plain'), data);
	});
});

describe('TOOLS_MENU : a tap must reach the row (dismissal cannot precede the tap)', () => {
	// ui.add_tools_menu collapses a section list's tools into ONE 'Tools' trigger
	// plus a native popover panel. It once dismissed the menu on a CAPTURE
	// pointerdown. On a touch tap that fires BEFORE the browser's compatibility
	// mousedown, so hiding the panel (display:none) makes that mousedown be
	// hit-tested against whatever is under the finger, the row's own mousedown
	// handler never runs, and the tool never opens — the mobile-dead Tools menu
	// (verified in a real touch run: the tap's mousedown landed on a DIV, not the
	// button). Dismissal must ride the row's OWN press.

	const build_menu = () => {
		const container = ui.create_dom_element({ element_type: 'div', parent: document.body });
		ui.add_tools_menu(
			{
				type: 'section',
				tipo: 'test3',
				id: 'test_touch_phone_tools_menu',
				tools: [
					{ model: 'tool_export', name: 'tool_export', label: 'Export', icon: '/x.svg' },
					{ model: 'tool_import', name: 'tool_import', label: 'Import', icon: '/x.svg' },
					{ model: 'tool_cache', name: 'tool_cache', label: 'Cache', icon: '/x.svg' },
				],
			},
			container,
		);
		return container;
	};

	it('renders one trigger and one sorted menuitem per tool', () => {
		const container = build_menu();
		try {
			const trigger = container.querySelector('.tools_menu_button');
			const panel = container.querySelector('.tools_menu_panel');
			assert.ok(trigger && panel, 'trigger + panel render');
			assert.equal(trigger.getAttribute('popovertarget'), panel.id);
			assert.equal(panel.getAttribute('role'), 'menu');
			const rows = [...panel.querySelectorAll(':scope > button[role="menuitem"]')];
			assert.deepEqual(
				rows.map((r) => r.textContent.trim()),
				['Cache', 'Export', 'Import'],
				'rows are sorted by label',
			);
			assert.equal(rows[0].dataset.tool, 'tool_cache', 'each row carries its tool name');
		} finally {
			container.remove();
		}
	});

	it('a lone pointerdown on a row keeps the menu open (it precedes the tap mousedown)', () => {
		const container = build_menu();
		try {
			const panel = container.querySelector('.tools_menu_panel');
			panel.showPopover();
			assert.equal(panel.matches(':popover-open'), true, 'the panel opens');

			panel.querySelector('button[role="menuitem"]').dispatchEvent(
				new PointerEvent('pointerdown', {
					bubbles: true,
					pointerType: 'touch',
					cancelable: true,
				}),
			);

			assert.equal(
				panel.matches(':popover-open'),
				true,
				'a pointerdown must not dismiss: it precedes the compatibility mousedown that opens the tool',
			);
		} finally {
			const panel = container.querySelector('.tools_menu_panel');
			if (panel?.matches(':popover-open')) panel.hidePopover();
			container.remove();
		}
	});

	it('a mousedown on the panel background keeps it open (only a row dismisses)', () => {
		const container = build_menu();
		try {
			const panel = container.querySelector('.tools_menu_panel');
			panel.showPopover();

			panel.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

			assert.equal(panel.matches(':popover-open'), true);
		} finally {
			const panel = container.querySelector('.tools_menu_panel');
			if (panel?.matches(':popover-open')) panel.hidePopover();
			container.remove();
		}
	});
});

describe('FIELDS_SELECTOR_PATH : a drilled level labels the navigation path', () => {
	// render_components_list is the FIELDS picker shared by search and tool_export.
	// It drills through portals recursively; on a phone a drilled level REPLACES its
	// parents (search.less), so the level bar must carry the PATH (see render_common
	// ar_section_path) and the phone layout reveals it instead of the plain name.
	const make_caller = () => ({
		calculate_component_path: (element, path) =>
			path.concat([
				{
					section_tipo: element.section_tipo,
					component_tipo: element.tipo,
					name: element.label,
				},
			]),
		get_section_id: () => 'tmp_search_1',
		// the drilled child section (fetched on a portal row's click)
		get_section_elements_context: async () => [
			{ model: 'section', tipo: 'test3child', label: 'Proyectos' },
			{
				model: 'component_input_text',
				tipo: 'test3child1',
				label: 'Id',
				section_tipo: 'test3child',
			},
		],
		on_dragstart: () => {},
	});

	const section_elements = [
		{ model: 'section', tipo: 'test3', label: 'Proyectos' },
		{ model: 'section_group', tipo: 'test3g1', label: 'Información general' },
		{
			model: 'component_portal',
			tipo: 'test3p1',
			label: 'Proyecto',
			section_tipo: 'test3',
			target_section_tipo: ['test3child'],
		},
	];

	it('root level: the plain section name, no deep_path', () => {
		const target_div = document.createElement('div');
		document.body.appendChild(target_div);
		try {
			render_components_list({
				self: make_caller(),
				section_tipo: 'test3',
				target_div,
				path: [],
				section_elements,
			});
			const bar = target_div.querySelector('li.section_bar_label');
			assert.ok(bar, 'the level bar renders');
			assert.equal(bar.classList.contains('deep_path'), false);
			assert.equal(bar.querySelector('.section_bar_full_path'), null, 'no path at root');
			assert.equal(bar.querySelector('.section_bar_section_name').textContent, 'Proyectos');
		} finally {
			target_div.remove();
		}
	});

	it('drilled level: full path in section_bar_full_path, plain name kept', () => {
		const target_div = document.createElement('div');
		document.body.appendChild(target_div);
		try {
			render_components_list({
				self: make_caller(),
				section_tipo: 'test3',
				target_div,
				path: [],
				section_elements,
				ar_section_path: ['Personas'],
			});
			const bar = target_div.querySelector('li.section_bar_label');
			assert.ok(bar.classList.contains('deep_path'), 'a drilled level is marked');
			assert.equal(
				bar.querySelector('.section_bar_full_path').textContent,
				'Personas / Proyectos',
				'root → level path',
			);
			assert.equal(
				bar.querySelector('.section_bar_section_name').textContent,
				'Proyectos',
				'the plain level name stays for the desktop layout',
			);
		} finally {
			target_div.remove();
		}
	});

	it('drilling slides the child level in (level_slide_forward)', async () => {
		const target_div = document.createElement('div');
		document.body.appendChild(target_div);
		try {
			render_components_list({
				self: make_caller(),
				section_tipo: 'test3',
				target_div,
				path: [],
				section_elements,
			});
			const portal_row = target_div.querySelector('li.has_subquery');
			assert.ok(portal_row, 'the portal row renders');
			portal_row.click();
			// the drill fetches the child context, then renders: let it settle
			await new Promise((resolve) => setTimeout(resolve, 20));
			const child = target_div.querySelector('ul.target_list_container');
			assert.ok(child.children.length > 0, 'the child level rendered');
			assert.ok(
				child.classList.contains('level_slide_forward'),
				'the entering level carries the slide-in class',
			);
		} finally {
			target_div.remove();
		}
	});

	it('closing a level slides its parent back in (level_slide_back)', async () => {
		const target_div = document.createElement('div');
		document.body.appendChild(target_div);
		try {
			render_components_list({
				self: make_caller(),
				section_tipo: 'test3',
				target_div,
				path: [],
				section_elements,
			});
			target_div.querySelector('li.has_subquery').click();
			await new Promise((resolve) => setTimeout(resolve, 20));
			const child = target_div.querySelector('ul.target_list_container');
			// the child level's own bar is its close control
			child.querySelector('li.section_bar_label').click();
			await new Promise((resolve) => setTimeout(resolve, 0));
			assert.equal(child.children.length, 0, 'the drilled level left');
			assert.ok(
				target_div.querySelector('ul.list_container').classList.contains('level_slide_back'),
				'the returning parent carries the slide-back class',
			);
		} finally {
			target_div.remove();
		}
	});

	it('markup in section labels does not leak into the joined path', () => {
		const target_div = document.createElement('div');
		document.body.appendChild(target_div);
		try {
			render_components_list({
				self: make_caller(),
				section_tipo: 'test3',
				target_div,
				path: [],
				section_elements: [{ model: 'section', tipo: 'test3', label: '<em>Proyectos</em>' }],
				ar_section_path: ['Personas'],
			});
			assert.equal(
				target_div.querySelector('.section_bar_full_path').textContent,
				'Personas / Proyectos',
			);
		} finally {
			target_div.remove();
		}
	});
});

// @license-end
