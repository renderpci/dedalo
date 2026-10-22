// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, beforeEach, afterEach */
/*eslint no-undef: "error"*/

import { data_manager } from '../../../core/common/js/data_manager.js';
import { holds_component_locks, section } from '../../../core/section/js/section.js';

/**
 * TEST_SECTION_LOCK_CLEANUP
 * A read-only Time Machine list sends NO lock-state request when it paginates
 * (WC-2026-10-23-own-lock-cleanup-ungated).
 *
 * The owner report: a non-admin paginating the inspector "Latest changes" list
 * (an embedded dd15 section, sqo.mode 'tm', session_save false) got a 403 —
 * section.navigate() sent `update_lock_components_state` /
 * `delete_user_section_locks` for section_tipo 'dd15', a section a non-admin
 * cannot read bare. A TM list never edits, so it holds no lock to clean.
 *
 * Drives the SHIPPED section.prototype.navigate on a section-prototype instance
 * whose refresh() is stubbed (the list's re-read is not the subject); the lock
 * request is fired from an idle callback, so each case waits it out.
 * Backend-free: data_manager.request patched on the shared singleton.
 */

// navigate() schedules the lock cleanup through requestIdleCallback ({timeout: 1000})
const idle_settled = () =>
	new Promise((resolve) => {
		if (typeof window.requestIdleCallback === 'function') {
			requestIdleCallback(() => setTimeout(resolve, 50), { timeout: 1500 });
		} else {
			setTimeout(resolve, 100);
		}
	});

// a Time Machine ROW SOURCE sqo (sqo.mode 'tm' — never a render mode,
// WC-2026-08-14-tm-ddo-mode-retired)
const tm_sqo = (fields = {}) => {
	const sqo = { ...fields };
	sqo.mode = 'tm';
	return sqo;
};

const make_section = (fields) => {
	const instance = Object.create(section.prototype);
	Object.assign(
		instance,
		{
			id: `lock_cleanup_${fields.tipo}`,
			mode: 'list',
			node_body: null,
			inspector: null,
			caller: null,
			refreshes: 0,
		},
		fields,
	);
	instance.refresh = async function () {
		this.refreshes++;
		return true;
	};
	return instance;
};

// the inspector Latest changes list (render_inspector.js load_time_machine_list_instance)
const make_tm_list = () =>
	make_section({
		tipo: 'dd15',
		section_tipo: 'dd15',
		session_save: false,
		caller: { model: 'inspector', section_tipo: 'test3', section_id: 1 },
		rqo: { sqo: tm_sqo({ section_tipo: ['test3'], offset: 10, limit: 10 }) },
		request_config_object: { sqo: tm_sqo({ section_tipo: ['test3'] }) },
	});

const lock_requests = (requests) =>
	requests.filter((body) => body?.action === 'update_lock_components_state');

describe(`SECTION LOCK CLEANUP`, function () {
	this.timeout(10000);

	let original_request = null;
	let requests = [];

	beforeEach(() => {
		original_request = data_manager.request;
		requests = [];
		data_manager.request = async (options) => {
			requests.push(options.body);
			return { ok: true, data: true, dedalo_notification: null };
		};
	});
	afterEach(() => {
		data_manager.request = original_request;
	});

	it(`paginating the embedded tm-mode dd15 list sends NO lock-state request`, async () => {
		const tm_list = make_tm_list();
		const result = await tm_list.navigate({ navigation_history: false });
		await idle_settled();

		assert.isTrue(result, 'the navigation completed');
		assert.equal(tm_list.refreshes, 1, 'the list re-read its page');
		assert.equal(lock_requests(requests).length, 0, 'no update_lock_components_state was sent');
	});

	it(`a tm-mode list scoped to a real section sends none either (it would drop live edit locks)`, async () => {
		// a TM row source on a non-dd15 section: the discriminator is the row source,
		// not the tipo (no shipped surface builds one today; the rule must not depend on it)
		const tm_list = make_section({
			tipo: 'test3',
			section_tipo: 'test3',
			session_save: false,
			rqo: { sqo: tm_sqo({ section_tipo: ['test3'] }) },
		});
		await tm_list.navigate({ navigation_history: false });
		await idle_settled();

		assert.equal(tm_list.refreshes, 1);
		assert.equal(lock_requests(requests).length, 0, 'no update_lock_components_state was sent');
	});

	it(`a normal section still cleans the user's own locks on navigation (control)`, async () => {
		const normal = make_section({
			tipo: 'test3',
			section_tipo: 'test3',
			session_save: true,
			rqo: { sqo: { section_tipo: ['test3'], offset: 10, limit: 10 } },
			request_config_object: { sqo: { section_tipo: ['test3'] } },
		});
		await normal.navigate({ navigation_history: false });
		await idle_settled();

		const sent = lock_requests(requests);
		assert.equal(sent.length, 1, 'exactly one lock cleanup was sent');
		assert.equal(sent[0].dd_api, 'dd_utils_api');
		assert.deepEqual(sent[0].options, {
			component_tipo: null,
			section_tipo: 'test3',
			section_id: null,
			action: 'delete_user_section_locks',
		});
	});

	it(`holds_component_locks: false on every TM surface, true on a normal section`, () => {
		assert.isFalse(holds_component_locks(make_tm_list()), 'the inspector Latest changes list');
		assert.isFalse(
			holds_component_locks({ tipo: 'test3', request_config_object: { sqo: tm_sqo() } }),
			'tm row source on the request_config only (before the rqo is built)',
		);
		assert.isFalse(
			holds_component_locks({ tipo: 'test3', section_tipo: 'test3', caller: { section_tipo: 'dd15' } }),
			'under a dd15 caller',
		);
		assert.isFalse(
			holds_component_locks({ tipo: 'test3', section_tipo: 'test3', data_source: 'tm' }),
			'a tool_time_machine preview',
		);
		assert.isTrue(
			holds_component_locks({ tipo: 'test3', section_tipo: 'test3', rqo: { sqo: {} } }),
			'a normal section',
		);
	});
});
