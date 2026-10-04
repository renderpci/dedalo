// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

/**
 * TEST_REQUEST_ACTIVITY
 * The slow-server cue is ONE page state, and identical notices merge.
 *
 * WHY THESE ASSERTIONS. The transport's /health probe used to raise one yellow
 * "Awaiting for busy server.." bubble PER REQUEST at timeout/2: a section load
 * with several slow reads stacked identical bubbles, each lingering on its own
 * timer after its response had arrived. So: (1) N parallel slow requests through
 * the REAL data_manager.request publish 'slow' ONCE and 'idle' when the last
 * settles, and raise no notification bubble; (2) background calls
 * (update_lock_components_state) and `busy_notice:false` never feed it; (3) the
 * indicator paints the state, text only at very_slow, idempotent mount;
 * (4) prepend_bubble merges identical bubbles into one ×N and keeps distinct ones.
 * Pure-model coverage (thresholds, idempotent end): test/unit/request_activity_native.
 * Backend-free: window.fetch stubbed and restored.
 */

import {
	data_manager,
	LONG_WAIT_TIMEOUT_MS,
	request_activity,
} from '../../../core/common/js/data_manager.js';
import { event_manager } from '../../../core/common/js/event_manager.js';
import { REQUEST_SLOW_MS } from '../../../core/common/js/request_activity.js';
import { prepend_bubble, render_node_info } from '../../../core/common/js/utils/notifications.js';
import { mount_request_activity_indicator } from '../../../core/page/js/request_activity_indicator.js';

// slow_fetch — answers a v2 envelope after `ms`
const slow_fetch = (ms) => () =>
	new Promise((resolve) => {
		setTimeout(
			() =>
				resolve(
					new Response(JSON.stringify({ ok: true, data: {} }), {
						status: 200,
						headers: { 'content-type': 'application/json' },
					}),
				),
			ms,
		);
	});

// with_stubbed_fetch — replace window.fetch, run fn, always restore
const with_stubbed_fetch = async (impl, fn) => {
	const original = window.fetch;
	window.fetch = impl;
	try {
		await fn();
	} finally {
		window.fetch = original;
	}
};

// capture — collect the payloads of the named events until released
const capture = (names) => {
	const seen = Object.fromEntries(names.map((name) => [name, []]));
	const tokens = names.map((name) =>
		event_manager.subscribe(name, (payload) => seen[name].push(payload)),
	);
	return {
		seen,
		release: () => {
			for (const token of tokens) event_manager.unsubscribe(token);
		},
	};
};

const SLOW = REQUEST_SLOW_MS + 300;

// wait_idle — the tracker is a page singleton: a request another suite left in
// flight must not fail this one's precondition, so wait it out (bounded)
const wait_idle = async (max_ms = 8000) => {
	const started = performance.now();
	while (request_activity.level() !== 'idle' || request_activity.pending() > 0) {
		if (performance.now() - started > max_ms) {
			throw new Error(`request_activity never went idle (pending ${request_activity.pending()})`);
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
};

// levels_of — run fn with fetch stubbed and return the published level sequence
const levels_of = async (fetch_impl, fn) => {
	await wait_idle();
	const events = capture(['request_activity']);
	try {
		await with_stubbed_fetch(fetch_impl, fn);
		return events.seen.request_activity.map((s) => s.level);
	} finally {
		events.release();
	}
};

describe('REQUEST_ACTIVITY — data_manager feeds one page state', function () {
	this.timeout(20000);

	it('N parallel slow requests: ONE slow, ONE idle at settle, no bubble', async () => {
		await wait_idle();
		const events = capture(['request_activity', 'notification']);
		try {
			await with_stubbed_fetch(slow_fetch(SLOW), async () => {
				await Promise.all(
					[1, 2, 3].map((n) => data_manager.request({ body: { action: 'read', n }, retries: 1 })),
				);
			});
			assert.deepEqual(
				events.seen.request_activity.map((s) => s.level),
				['slow', 'idle'],
				'one state change up, one down — never one per request',
			);
			assert.equal(events.seen.request_activity[0].pending, 3);
			assert.equal(events.seen.notification.length, 0, 'a wait is not a notification');
			assert.equal(request_activity.level(), 'idle');
		} finally {
			events.release();
		}
	});

	it('a fast request changes nothing', async () => {
		await wait_idle();
		const events = capture(['request_activity']);
		try {
			await with_stubbed_fetch(slow_fetch(10), async () => {
				await data_manager.request({ body: { action: 'read' }, retries: 1 });
			});
			assert.equal(events.seen.request_activity.length, 0);
		} finally {
			events.release();
		}
	});

	it('background actions, declared long operations and busy_notice:false never feed it', async () => {
		const silent = await levels_of(slow_fetch(SLOW), () =>
			Promise.all([
				data_manager.request({ body: { action: 'update_lock_components_state' }, retries: 1 }),
				data_manager.request({ body: { action: 'get_lock_status' }, retries: 1 }),
				data_manager.request({ body: { action: 'get_activity' }, retries: 1 }),
				data_manager.request({ body: { action: 'read' }, retries: 1, busy_notice: false }),
				data_manager.request({
					body: { action: 'read' },
					retries: 1,
					timeout: LONG_WAIT_TIMEOUT_MS + 1,
				}),
			]),
		);
		assert.deepEqual(silent, []);
		// positive control on the SAME harness: a plain read, and a long operation
		// that opts in, do feed it — the silence above is the policy, not a dead stub
		const fed = await levels_of(slow_fetch(SLOW), () =>
			data_manager.request({
				body: { action: 'read' },
				retries: 1,
				timeout: LONG_WAIT_TIMEOUT_MS + 1,
				busy_notice: true,
			}),
		);
		assert.deepEqual(fed, ['slow', 'idle']);
	});

	it('the CSRF resend is the SAME wait: the clock does not restart', async () => {
		// two halves, each under the slow threshold, together over it: only an
		// entry carried through the resend can reach 'slow'
		const half = Math.ceil(REQUEST_SLOW_MS * 0.7);
		let calls = 0;
		const csrf_then_ok = () =>
			new Promise((resolve) => {
				calls++;
				const first = calls === 1;
				setTimeout(
					() =>
						resolve(
							new Response(
								JSON.stringify(
									first
										? {
												ok: false,
												csrf_token: 'tok-resend',
												error: { code: 'auth.csrf_failed', retryable: false },
											}
										: { ok: true, data: {} },
								),
								{
									status: first ? 403 : 200,
									headers: { 'content-type': 'application/json' },
								},
							),
						),
					half,
				);
			});
		const levels = await levels_of(csrf_then_ok, () =>
			data_manager.request({ body: { action: 'read' }, retries: 1 }),
		);
		assert.equal(calls, 2, 'the CSRF refusal was resent once');
		assert.deepEqual(levels, ['slow', 'idle']);
		assert.equal(request_activity.pending(), 0, 'the inherited entry was ended');
	});
});

describe('REQUEST_ACTIVITY — the indicator paints the state', () => {
	it('idempotent mount; idle hidden, slow bar without text, very_slow one sentence', () => {
		const node = mount_request_activity_indicator();
		try {
			assert.strictEqual(mount_request_activity_indicator(), node, 'one indicator per document');
			assert.equal(document.querySelectorAll('#request_activity').length, 1);
			assert.isTrue(node.classList.contains('idle'));
			// a11y: the live region is IN the accessibility tree while idle (empty),
			// or screen readers skip the sentence written into it later
			const live = node.querySelector('.request_activity_text');
			assert.notEqual(getComputedStyle(node).display, 'none');
			assert.notEqual(getComputedStyle(live).display, 'none');
			assert.equal(
				getComputedStyle(node.querySelector('.request_activity_bar')).visibility,
				'hidden',
			);

			event_manager.publish('request_activity', { level: 'slow', pending: 2 });
			assert.isTrue(node.classList.contains('slow'));
			assert.isFalse(node.classList.contains('idle'));
			assert.equal(node.querySelector('.request_activity_text').textContent, '');

			event_manager.publish('request_activity', { level: 'very_slow', pending: 2 });
			assert.isTrue(node.classList.contains('very_slow'));
			assert.isFalse(node.classList.contains('slow'));
			const text = node.querySelector('.request_activity_text');
			assert.isAbove(text.textContent.length, 0);
			assert.equal(text.getAttribute('role'), 'status');
		} finally {
			event_manager.publish('request_activity', { level: 'idle', pending: 0 });
		}
		assert.isTrue(node.classList.contains('idle'));
		assert.equal(node.querySelector('.request_activity_text').textContent, '');
	});
});

describe('PREPEND_BUBBLE — identical notices merge', () => {
	it('identical bubbles merge into one ×N at the top; distinct ones stay', () => {
		const container = document.createElement('div');
		const bubble = (msg, type = 'error') => render_node_info({ msg, type });

		prepend_bubble(container, bubble('Network unreachable'));
		prepend_bubble(container, bubble('Something else'));
		prepend_bubble(container, bubble('Network unreachable'));
		prepend_bubble(container, bubble('Network unreachable'));
		prepend_bubble(container, bubble('Network unreachable', 'warning'));

		assert.equal(container.children.length, 3, 'one per distinct (type, text)');
		const merged = container.children[1];
		assert.isTrue(merged.classList.contains('error'));
		assert.equal(merged.dataset.bubble_count, '3');
		assert.equal(merged.querySelector('.bubble_count').textContent, '×3');
		assert.equal(
			container.children[0].dataset.bubble_count,
			'1',
			'same text, other type: not merged',
		);
		assert.isNull(container.children[0].querySelector('.bubble_count'));
	});

	it('bubble text stays text (no HTML parsed from the message)', () => {
		const container = document.createElement('div');
		const xss = '<img src=x onerror="window.__xss_fired=true">';
		prepend_bubble(container, render_node_info({ msg: xss, type: 'error' }));
		prepend_bubble(container, render_node_info({ msg: xss, type: 'error' }));
		assert.equal(container.children.length, 1);
		assert.isNull(container.querySelector('img'));
	});
});

// @license-end
