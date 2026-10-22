// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, beforeEach, afterEach, page_globals */
/*eslint no-undef: "error"*/

import { ApiError } from '../../../core/common/js/api_error.js';
import { common } from '../../../core/common/js/common.js';
import { data_manager } from '../../../core/common/js/data_manager.js';
import { event_manager } from '../../../core/common/js/event_manager.js';
import { get_instance } from '../../../core/common/js/instances.js';
import { ui } from '../../../core/common/js/ui.js';

/**
 * TEST_EMBEDDED_ERROR_SCOPE
 * `page_globals.page_error` is THE page-level failure: while it is set,
 * common.prototype.render swaps a render for the no-access panel. The owner
 * report: a regular user opened an inspector history block, its dd15 read was
 * refused (403), the refusal landed in the PAGE slot, and from then on every
 * render on the page — sibling blocks included — was the full-page panel, and
 * SPA navigation could not leave it.
 *
 *   1. an EMBEDDED instance's refused build never sets page_error (a page-root
 *      one does — the control), and neither does the page's every-request
 *      `api_error` listener;
 *   2. while page_error IS set, an embedded sibling (relation_list) still
 *      renders its own node; a page-root render gets the panel (the control);
 *   3. SPA navigation clears page_error and the next element renders.
 *
 * Blocks 1-2 are backend-free (data_manager.request patched); block 3 drives
 * the real page against the suite server.
 */

const refused = () => ({
	ok: false,
	request_id: 'rq-embedded',
	error: new ApiError({
		code: 'perm.denied',
		status: 403,
		request_id: 'rq-embedded',
		source: 'envelope',
	}),
});

/**
 * The history SQO the inspector sends. `mode 'tm'` here is the ROW SOURCE
 * (routes the dd15 read to matrix_time_machine), never a render mode — set as
 * `sqo.mode` so tm_mode_retired_tripwire reads it as such.
 */
const tm_sqo = () => {
	const sqo = {
		section_tipo: ['test3'],
		limit: 10,
		offset: 0,
		filter_by_locators: [{ section_tipo: 'test3', section_id: 1 }],
	};
	sqo.mode = 'tm';
	return sqo;
};

/** A dd15 history list as the inspector builds it — embedded under `caller`. */
const tm_list = (caller, id_variant) =>
	get_instance({
		model: 'section',
		tipo: 'dd15',
		section_tipo: 'dd15',
		mode: 'list',
		id_variant,
		caller,
		buttons: false,
		filter: false,
		session_save: false,
		request_config: [
			{
				api_engine: 'dedalo',
				type: 'main',
				sqo: tm_sqo(),
				show: {},
			},
		],
	});

describe(`EMBEDDED ERROR SCOPE`, function () {
	this.timeout(30000);

	let original_request = null;
	let original_page_error;

	beforeEach(() => {
		original_request = data_manager.request;
		original_page_error = page_globals.page_error;
		page_globals.page_error = null;
	});
	afterEach(() => {
		data_manager.request = original_request;
		page_globals.page_error = original_page_error ?? null;
	});

	it(`a refused EMBEDDED build never sets page_error; a page-root one does`, async () => {
		data_manager.request = async () => refused();

		const embedded = await tm_list({ model: 'inspector', id: 'fake_inspector' }, 'embedded_scope_a');
		assert.isFalse(await embedded.build(true), 'the embedded build answers false');
		assert.isNull(page_globals.page_error, 'an embedded refusal stays panel-scoped');
		await embedded.destroy(true, true);

		// CONTROL: the same refusal on a page-root element IS the page's failure
		const root = await tm_list(undefined, 'embedded_scope_root');
		assert.isFalse(await root.build(true));
		assert.equal(page_globals.page_error?.code, 'perm.denied', 'a page-root refusal sets the page slot');
		await root.destroy(true, true);
	});

	it(`while page_error is set, an embedded sibling still renders its own node`, async () => {
		page_globals.page_error = refused().error;

		const make = (caller) => {
			const instance = Object.create(common.prototype);
			Object.assign(instance, {
				id: 'fake_relation_list_' + (caller?.model || 'root'),
				model: 'relation_list',
				tipo: 'test138',
				mode: 'list',
				permissions: 1,
				status: 'built',
				caller,
				list: async () =>
					ui.create_dom_element({ element_type: 'div', class_name: 'relation_list_real' }),
			});
			return instance;
		};

		const sibling = await make({ model: 'inspector' }).render();
		assert.isTrue(sibling.classList.contains('relation_list_real'), 'the sibling rendered itself');
		assert.isFalse(sibling.classList.contains('page_error_container'));

		// CONTROL: a page-root render IS swapped for the page panel
		const root = await make({ model: 'page' }).render();
		assert.isTrue(root.classList.contains('page_error_container'), 'the page root shows the panel');
	});

	it(`SPA navigation clears page_error and the next element renders`, async () => {
		const page = await get_instance({ model: 'page', menu: false, id_variant: 'embedded_scope_page' });
		await page.build(true);
		const node = await page.render();
		document.getElementById('content').appendChild(node);

		// the page's every-request listener is NOT page scope: a refusal it hears
		// (any request's — an inspector block's) leaves the slot alone
		event_manager.publish('api_error', refused().error);
		await new Promise((resolve) => setTimeout(resolve, 50));
		assert.isNull(page_globals.page_error, "the page's api_error listener never sets the page slot");

		// a page-level refusal on the previous element...
		page_globals.page_error = refused().error;
		event_manager.publish('user_navigation', {
			source: { tipo: 'test3', section_tipo: 'test3', model: 'section', mode: 'list' },
			event_in_history: true, // no history.pushState on the test frame
		});
		// navigate() runs async behind the event: wait until the new element is
		// rendered and the navigation lock is released
		const landed = () =>
			!page.navigation_in_progress &&
			page.ar_instances.some((instance) => instance.tipo === 'test3' && instance.status === 'rendered');
		const deadline = Date.now() + 20000;
		while (!landed() && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 50));
		}

		assert.isNull(page_globals.page_error, 'navigation cleared the stale page error');
		const section = page.ar_instances.find((instance) => instance.tipo === 'test3');
		assert.isOk(section, 'the navigated element was instantiated');
		assert.equal(section.status, 'rendered', 'and rendered');
		assert.isNull(page.node.querySelector('.page_error_container'), 'no page panel left behind');

		await page.destroy(true, true, true);
	});
});
