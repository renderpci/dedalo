// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, afterEach, assert */
/*eslint no-undef: "error"*/

/**
 * TEST_PUBLICATION_HOSTS
 * The publication_hosts maintenance widget (PUBLICATION_HOST_SPEC phase 3) and
 * media_control's one line pointing at it.
 *
 * What it pins:
 *  - a registry the server could not use (registry_invalid, or no registry
 *    block at all; hosts: null) is a LOUD state (reason shown — the server's
 *    registry.check row through check_row when sent — no card, no control),
 *    never an empty list;
 *  - every server string renders as TEXT (addresses and URLs are operator data);
 *  - check rows are labelled through check_row's `publication_hosts` prefix,
 *    and check_row's default prefix is unchanged for update_code / serve_code;
 *  - controls exist only for root; agent commands are disabled while the
 *    pairing is not proved; every agent-changing action is confirm-gated, shows
 *    the spinner while in flight, reports its outcome, and reloads only on success;
 *  - the edit form is prefilled from the row's qualities/probe; set_host_fields
 *    sends null for a blank field (= engine default);
 *  - media_control's line asks the dashboard to open publication_hosts.
 *
 * The fixtures follow the Task 7 panel wire ({registry:{state,reason},
 * registry_path, engine_qualities, is_root, hosts}) and its action answers
 * ({host, …}).
 *
 * Backend-free: widget_request / confirm_action / reload are replaced on the
 * INSTANCE, so no request, no native dialog (a blocking confirm() freezes the
 * headless renderer) and no get_value round-trip.
 */

import { OPEN_WIDGET_EVENT } from '../../../core/area_maintenance/js/maintenance_events.js';
import { media_control } from '../../../core/area_maintenance/widgets/media_control/js/media_control.js';
import { publication_hosts } from '../../../core/area_maintenance/widgets/publication_hosts/js/publication_hosts.js';
import { read_host_fields } from '../../../core/area_maintenance/widgets/publication_hosts/js/render_publication_hosts.js';
import { check_row } from '../../../core/area_maintenance/widgets/update_code/js/render_update_status.js';
import { ApiError } from '../../../core/common/js/api_error.js';
import { error_text } from '../../../core/common/js/render_api_error.js';

// DOM container
const container = document.getElementById('content');

// helpers
const mounted = [];
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
const labels = () => window.get_label || {};

const build_host = (overrides = {}) =>
	Object.assign(
		{
			name: 'www',
			address_label: 'https://pub.example.test:8443',
			public_url: 'https://www.example.test',
			qualities: ['1.5MB', 'web'],
			probe: { published: 'image/web/0/probe_published.jpg', unpublished: null },
			checks: [
				{ id: 'registry', state: 'ok' },
				{ id: 'secrets', state: 'ok' },
				{ id: 'reachable', state: 'ok' },
				{ id: 'pairing', state: 'ok' },
				{ id: 'rules_hash', state: 'blocked', detail: 'expected != reported' },
			],
			rules: { expected: 'a'.repeat(64), reported: 'b'.repeat(64) },
			apis: {
				v1: { current: '7.0.1_abcdef0', previous: '7.0.0_1234567' },
				v2: { current: '7.0.1_abcdef0', previous: null },
			},
			token_present: true,
			bundle_present: true,
			pairing_proved: true,
		},
		overrides,
	);

const panel_value = (registry, hosts, is_root = true) => ({
	registry: registry,
	registry_path: '/srv/dedalo/private/publication_hosts.json',
	engine_qualities: ['1.5MB', 'web'],
	is_root: is_root,
	hosts: hosts,
});

const ok_value = (hosts, is_root = true) =>
	panel_value({ state: 'ok', reason: null }, hosts, is_root);

const build_widget = (value) => {
	const self = new publication_hosts();
	self.id = 'publication_hosts';
	self.value = value;
	self.caller = null;
	self.events_tokens = [];
	// test doubles ON THE INSTANCE (the prototype stays the real one)
	self.calls = [];
	self.reloads = 0;
	self.confirms = [];
	self.confirm_answer = true;
	self.next_response = { ok: true, data: { host: 'www' } };
	self.confirm_action = (message) => {
		self.confirms.push(message);
		return self.confirm_answer;
	};
	self.reload = async () => {
		self.reloads++;
	};
	self.widget_request = async (action, options) => {
		self.calls.push({ action: action, options: options });
		return self.next_response;
	};
	return self;
};

const mount = async (self) => {
	const content_data = await self.list({ render_level: 'content' });
	container.appendChild(content_data);
	mounted.push(content_data);
	return content_data;
};

describe('PUBLICATION_HOSTS WIDGET', function () {
	this.timeout(10000);

	afterEach(function () {
		while (mounted.length) {
			mounted.pop().remove();
		}
	});

	describe('readout', function () {
		it('a registry the server could not read is a loud state: reason shown, no card, no control', async function () {
			const self = build_widget(
				panel_value({ state: 'registry_invalid', reason: 'invalid_json' }, null),
			);
			const content = await mount(self);

			const note = content.querySelector('.registry_invalid');
			assert.ok(note, 'the invalid-registry note renders');
			assert.isTrue(
				note.classList.contains('state_danger'),
				'it is a danger note, not a quiet one',
			);
			assert.include(note.textContent, 'invalid_json', 'the reason is shown');
			assert.strictEqual(content.querySelectorAll('.publication_host').length, 0, 'no host card');
			assert.strictEqual(content.querySelectorAll('button').length, 0, 'no control');
		});

		it('the server registry.check row renders through check_row (publication_hosts prefix)', async function () {
			const self = build_widget(
				panel_value(
					{
						state: 'registry_invalid',
						reason: 'invalid_json',
						check: { id: 'registry', state: 'blocked', detail: 'invalid_json' },
					},
					null,
				),
			);
			const content = await mount(self);

			const note = content.querySelector('.registry_invalid');
			assert.ok(note, 'the invalid-registry note renders');
			const row = note.querySelector('.registry_check .check_row.state_blocked');
			assert.ok(row, 'the registry check renders as a blocked check row');
			assert.strictEqual(
				row.querySelector('.dd_k').textContent,
				labels().publication_hosts_check_registry || 'registry',
				'labelled through the publication_hosts prefix',
			);
			assert.include(row.textContent, 'invalid_json', 'its detail (the reason) is shown');
			assert.strictEqual(content.querySelectorAll('button').length, 0, 'no control');
		});

		it('a value with no registry block reads as invalid, never as an empty list', async function () {
			const self = build_widget({ is_root: true, hosts: [] });
			const content = await mount(self);

			assert.ok(content.querySelector('.registry_invalid'), 'missing registry block = invalid');
			assert.strictEqual(
				content.querySelector('.no_hosts'),
				null,
				'never the "no host paired" note',
			);
		});

		it('no paired host says how to pair one, and renders no card', async function () {
			const self = build_widget(ok_value([]));
			const content = await mount(self);

			const note = content.querySelector('.no_hosts');
			assert.ok(note, 'the no-host note renders');
			assert.include(note.textContent, 'dedalo:pair-publication-host', 'it names the documented pair command');
			assert.include(note.textContent, 'sudo -u', 'run as the engine user, never root');
			assert.strictEqual(content.querySelectorAll('.publication_host').length, 0);
		});

		it('a paired host renders its facts as TEXT and one prefixed check row per check', async function () {
			const hostile = '<img src=x onerror="window.__ph_xss=1">';
			const self = build_widget(ok_value([build_host({ address_label: hostile })]));
			const content = await mount(self);

			const card = content.querySelector('.publication_host[data-name="www"]');
			assert.ok(card, 'one card, keyed by host name');
			assert.strictEqual(
				card.querySelector('img'),
				null,
				'an operator string never parses as HTML',
			);
			assert.include(card.textContent, hostile, 'it is shown verbatim');
			assert.include(card.textContent, 'a'.repeat(64), 'expected rules hash shown');
			assert.include(card.textContent, 'b'.repeat(64), 'reported rules hash shown');

			const rows = card.querySelectorAll('.check_row');
			assert.strictEqual(rows.length, 5, 'one row per server check');

			const pairing_key = [...rows].map((row) => row.querySelector('.dd_k').textContent);
			assert.include(
				pairing_key,
				labels()['publication_hosts_check_pairing'] || 'pairing',
				'labelled through the publication_hosts prefix',
			);

			const blocked = card.querySelector('.check_row.state_blocked');
			assert.ok(blocked, 'the blocked check is marked on its row');
			assert.ok(blocked.querySelector('.dd_badge.pill_danger'), 'with the kit danger pill');
			assert.include(blocked.textContent, 'expected != reported', 'and the server fact');
		});

		it('a non-root admin sees the readout and a note, and no control at all', async function () {
			const self = build_widget(ok_value([build_host()], false));
			const content = await mount(self);

			assert.ok(content.querySelector('.root_only'), 'the root-only note renders');
			assert.ok(content.querySelector('.publication_host .check_row'), 'the readout still renders');
			assert.strictEqual(content.querySelector('.host_actions'), null, 'no action bar');
			assert.strictEqual(content.querySelector('.host_edit'), null, 'no edit form');
			assert.strictEqual(content.querySelectorAll('button').length, 0, 'no button anywhere');
		});

		it('agent commands are disabled while the pairing is not proved; remove stays available', async function () {
			const self = build_widget(ok_value([build_host({ pairing_proved: false })]));
			const content = await mount(self);

			assert.isTrue(content.querySelector('.button_apply_rules').disabled, 'apply disabled');
			assert.isTrue(content.querySelector('.button_probe').disabled, 'probe disabled');
			assert.isTrue(content.querySelector('.button_rollback_api').disabled, 'rollback disabled');
			assert.isFalse(
				content.querySelector('.button_remove_host').disabled,
				'remove is a local registry edit',
			);
		});

		it('rollback offers only an API that has a previous release', async function () {
			const self = build_widget(ok_value([build_host()]));
			const content = await mount(self);

			const select = content.querySelector('.host_rollback_select');
			assert.strictEqual(select.value, 'v1', 'the first API with a previous release is selected');
			const v2 = select.querySelector('option[value="v2"]');
			assert.isTrue(v2.disabled, 'v2 has no previous release to go back to');
			assert.include(
				select.querySelector('option[value="v1"]').textContent,
				'7.0.0_1234567',
				'the option names the target release',
			);
		});
	});

	describe('actions', function () {
		it('apply_rules is confirm-gated: a declined confirm sends nothing', async function () {
			const self = build_widget(ok_value([build_host()]));
			self.confirm_answer = false;
			const content = await mount(self);

			content.querySelector('.button_apply_rules').click();
			await settle();

			assert.strictEqual(self.confirms.length, 1, 'the operator was asked');
			assert.include(self.confirms[0], 'www', 'the question names the host');
			assert.deepEqual(self.calls, [], 'nothing was sent');
			assert.strictEqual(self.reloads, 0);
		});

		it('apply_rules confirmed: one request, spinner while in flight, result shown, value reloaded', async function () {
			const self = build_widget(ok_value([build_host()]));
			let release = null;
			self.widget_request = (action, options) => {
				self.calls.push({ action: action, options: options });
				return new Promise((resolve) => {
					release = () =>
						resolve({
							ok: true,
							data: { host: 'www', server: 'apache', hash: 'c'.repeat(64), dropped: [] },
						});
				});
			};
			const content = await mount(self);
			const button = content.querySelector('.button_apply_rules');

			button.click();
			await settle();
			assert.isTrue(button.classList.contains('button_spinner'), 'spinner while the agent works');

			release();
			await settle();
			assert.isFalse(button.classList.contains('button_spinner'), 'spinner removed after');
			assert.deepEqual(self.calls, [{ action: 'apply_rules', options: { name: 'www' } }]);
			assert.strictEqual(self.reloads, 1, 'value reloaded once');
			assert.include(
				content.querySelector('.body_response').textContent,
				'c'.repeat(64),
				'the applied hash is shown',
			);
		});

		it('a refused action shows the error sentence and does not reload', async function () {
			const self = build_widget(ok_value([build_host()]));
			const error = new ApiError({
				code: 'publication_host.timeout',
				status: 503,
				message: 'The publication host agent did not answer in time',
				source: 'envelope',
			});
			self.next_response = { ok: false, error: error };
			const content = await mount(self);
			const button = content.querySelector('.button_apply_rules');

			button.click();
			await settle();

			assert.include(
				content.querySelector('.body_response').textContent,
				error_text(error),
				'the failure is visible',
			);
			assert.strictEqual(self.reloads, 0, 'no reload on failure');
			assert.isFalse(
				button.classList.contains('button_spinner'),
				'spinner removed after a failure too',
			);
		});

		it('probe sends no confirm and does not reload', async function () {
			const self = build_widget(ok_value([build_host()]));
			self.next_response = {
				ok: true,
				data: {
					host: 'www',
					probe: {
						mode: 'shared',
						root: '/srv/pub_media',
						present: true,
						read_only: true,
						pub_readable: true,
						pub_markers: 3,
						problems: [],
					},
				},
			};
			const content = await mount(self);

			content.querySelector('.button_probe').click();
			await settle();

			assert.strictEqual(self.confirms.length, 0, 'a read-only probe asks nothing');
			assert.deepEqual(self.calls, [{ action: 'probe', options: { name: 'www' } }]);
			assert.strictEqual(self.reloads, 0);
			assert.include(content.querySelector('.body_response').textContent, '"pub_markers": 3');
		});

		it('rollback_api sends the selected API, confirm-gated, and reloads', async function () {
			const self = build_widget(ok_value([build_host()]));
			self.next_response = {
				ok: true,
				data: { host: 'www', api: 'v1', from: '7.0.1_abcdef0', to: '7.0.0_1234567' },
			};
			const content = await mount(self);

			content.querySelector('.button_rollback_api').click();
			await settle();

			assert.strictEqual(self.confirms.length, 1);
			assert.deepEqual(self.calls, [
				{ action: 'rollback_api', options: { name: 'www', api: 'v1' } },
			]);
			assert.strictEqual(self.reloads, 1);
		});

		it('remove_host is confirm-gated and reloads', async function () {
			const self = build_widget(ok_value([build_host()]));
			self.next_response = { ok: true, data: { host: 'www', removed: true } };
			const content = await mount(self);

			content.querySelector('.button_remove_host').click();
			await settle();

			assert.strictEqual(self.confirms.length, 1);
			assert.deepEqual(self.calls, [{ action: 'remove_host', options: { name: 'www' } }]);
			assert.strictEqual(self.reloads, 1);
		});

		it('set_host_fields sends the edited fields; a blank field is null', async function () {
			const self = build_widget(ok_value([build_host()]));
			self.next_response = {
				ok: true,
				data: { host: 'www', fields: ['public_url', 'qualities', 'probe'] },
			};
			const content = await mount(self);
			const form = content.querySelector('.host_edit');

			assert.strictEqual(
				form.querySelector('input[name="qualities"]').value,
				'1.5MB, web',
				'prefilled from the row',
			);
			assert.strictEqual(
				form.querySelector('input[name="probe_published"]').value,
				'image/web/0/probe_published.jpg',
				'probe prefilled from the row',
			);
			form.querySelector('input[name="public_url"]').value = ' https://public.example.test ';
			form.querySelector('input[name="probe_published"]').value = '';
			form.querySelector('input[name="probe_unpublished"]').value =
				'image/web/0/probe_unpublished.jpg';
			form.querySelector('.button_save_host').click();
			await settle();

			assert.strictEqual(self.confirms.length, 0, 'saving settings asks nothing');
			assert.deepEqual(self.calls, [
				{
					action: 'set_host_fields',
					options: {
						name: 'www',
						public_url: 'https://public.example.test',
						qualities: ['1.5MB', 'web'],
						probe: { published: null, unpublished: 'image/web/0/probe_unpublished.jpg' },
					},
				},
			]);
			assert.strictEqual(self.reloads, 1);
		});

		it('read_host_fields: blank inputs are null, qualities split on commas', function () {
			const input = (value) => ({ value: value });
			assert.deepEqual(
				read_host_fields('www', {
					public_url: input(''),
					qualities: input(' , ,'),
					probe_published: input('  '),
					probe_unpublished: input(''),
				}),
				{
					name: 'www',
					public_url: null,
					qualities: null,
					probe: { published: null, unpublished: null },
				},
				'empty qualities = the engine default (null), never an empty list',
			);
			assert.deepEqual(
				read_host_fields('www', {
					public_url: input('https://www.example.test'),
					qualities: input('web,1.5MB , 3MB'),
					probe_published: input('a.jpg'),
					probe_unpublished: input('b.jpg'),
				}).qualities,
				['web', '1.5MB', '3MB'],
			);
		});
	});

	describe('shared check_row', function () {
		it('keeps the update_code prefix by default (update_code / serve_code unchanged)', function () {
			const parent = document.createElement('div');
			check_row(parent, { id: 'superuser', state: 'ok' });
			assert.strictEqual(
				parent.querySelector('.dd_k').textContent,
				labels()['update_code_check_superuser'] || 'superuser',
			);
		});
	});
});

describe('MEDIA_CONTROL link line', function () {
	this.timeout(10000);

	it('renders one read-only line and asks the dashboard to open publication_hosts', async function () {
		const self = new media_control();
		self.id = 'media_control';
		self.caller = null;
		self.events_tokens = [];
		self.value = {
			mode: 'private',
			mode_source: 'DEDALO_MEDIA_ACCESS_MODE',
			markers: { base_exists: true, pub_count: 0, auth_count: 0 },
			htaccess: { exists: true, up_to_date: true },
			engine: { reachable: true, media_index_enabled: true, pub_markers: 0, databases: [] },
			is_root: false,
		};
		const content = await self.list({ render_level: 'content' });
		container.appendChild(content);

		let seen = null;
		const on_open = (e) => {
			seen = e.detail;
		};
		document.addEventListener(OPEN_WIDGET_EVENT, on_open);
		try {
			const rows = content.querySelectorAll('.dd_readout .publication_hosts_link');
			assert.strictEqual(rows.length, 1, 'exactly one line, inside the status readout');
			rows[0].querySelector('button').click();
			assert.deepEqual(
				seen,
				{ id: 'publication_hosts' },
				'the dashboard is asked to open publication_hosts',
			);
		} finally {
			document.removeEventListener(OPEN_WIDGET_EVENT, on_open);
			content.remove();
		}
	});
});

// @license-end
