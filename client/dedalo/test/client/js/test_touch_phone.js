// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

import * as touch_pick from '../../../core/common/js/touch_pick.js';
import { render_pane_switch } from '../../../core/tools_common/js/pane_switch.js';
import { render_phone_reorder } from '../../../core/tools_common/js/phone_reorder.js';

// The phone gestures shared by the tools (responsive-tools plan). Backend-free:
// synthetic DOM, no API.

describe('TOUCH_PICK : tap to pick, tap to place', function () {
	it('pick holds the payload, shows the bar, as_drop_event hands it over once', function () {
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

	it('cancel drops the payload without placing it', function () {
		touch_pick.pick('{"a":1}', 'x');
		document.querySelector('.touch_pick_cancel').click();
		assert.equal(touch_pick.active(), false);
		assert.equal(touch_pick.as_drop_event(), null);
		assert.equal(document.querySelector('.touch_pick_bar'), null);
	});

	it('a second pick replaces the first (one payload per page)', function () {
		touch_pick.pick('"first"', 'a');
		touch_pick.pick('"second"', 'b');
		assert.equal(document.querySelectorAll('.touch_pick_bar').length, 1);
		assert.equal(touch_pick.as_drop_event().dataTransfer.getData('text/plain'), '"second"');
	});
});

describe('PANE_SWITCH : one pane at a time on a phone', function () {
	it('marks the first pane active and switches on click', function () {
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

	it('refuses fewer than two panes', function () {
		assert.throws(() =>
			render_pane_switch(document.createElement('div'), [{ key: 'a', label: 'A' }]),
		);
	});
});

describe('PHONE_REORDER : up/down replaces drag-sort on a phone', function () {
	it('calls on_move with -1 / 1 and disables the ends', async function () {
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

	it('requires on_move and both labels', function () {
		assert.throws(() => render_phone_reorder({ on_move: () => {}, labels: { up: 'Up' } }));
	});
});

// @license-end
