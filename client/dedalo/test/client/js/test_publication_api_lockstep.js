// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, afterEach, assert */
/*eslint no-undef: "error"*/

/**
 * TEST_PUBLICATION_API_LOCKSTEP
 * The publication_hosts widget's API lockstep block (publication host phase 4):
 * engine release vs each host's v2/v1, the last push, a severity chip per row, the
 * refusal named in a danger note, "not verified yet" before any round, the runtime
 * file flagged unreadable, and the root push button — confirm-gated, one push_apis
 * call, the server sentence shown, the value reloaded (a `running` answer too);
 * disabled only with no host rows — a remembered refusal keeps it enabled, since
 * the push re-verifies the tree; absent for a non-root viewer.
 *
 * Backend-free: the pure view is rendered directly, and the wired button runs on a
 * REAL publication_hosts instance whose widget_request / confirm_action / reload
 * are replaced on the instance (a real confirm() would freeze the headless renderer).
 */

import { publication_hosts } from '../../../core/area_maintenance/widgets/publication_hosts/js/publication_hosts.js';
import {
	render_api_lockstep,
	render_runtime_invalid,
} from '../../../core/area_maintenance/widgets/publication_hosts/js/render_api_lockstep.js';

const container = document.getElementById('content');
const mounted = [];
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

const ENGINE = '7.0.3_a1b2c3d';
const OLD = '7.0.2_0f0f0f0';
const AT = '2026-10-03T12:00:00.000Z';

const make_panel = (over = {}) =>
	Object.assign(
		{
			engine_release: ENGINE,
			refused: null,
			checked_at: AT,
			rows: [
				{
					host: 'www',
					api: 'v2',
					engine: ENGINE,
					host_current: ENGINE,
					last_push: null,
					state: 'ok',
				},
				{
					host: 'www',
					api: 'v1',
					engine: ENGINE,
					host_current: OLD,
					last_push: { state: 'failed', release: ENGINE, error: 'publication_host.failed', at: AT },
					state: 'failed',
				},
				{
					host: 'mirror',
					api: 'v2',
					engine: ENGINE,
					host_current: OLD,
					last_push: null,
					state: 'mismatch',
				},
			],
		},
		over,
	);

const host_row = (name) => ({
	name: name,
	address_label: 'unix:/run/agent.sock',
	public_url: null,
	qualities: null,
	probe: { published: null, unpublished: null },
	checks: [{ id: 'pairing', state: 'ok' }],
	rules: { expected: null, reported: null },
	apis: { v1: { current: OLD, previous: null }, v2: { current: ENGINE, previous: null } },
	token_present: true,
	bundle_present: false,
	pairing_proved: true,
});

const build_widget = (value) => {
	const self = new publication_hosts();
	self.id = 'publication_hosts';
	self.value = value;
	self.caller = null;
	self.events_tokens = [];
	self.calls = [];
	self.reloads = 0;
	self.confirms = [];
	self.confirm_answer = true;
	self.next_response = {
		ok: true,
		data: true,
		msg: `OK. Release ${ENGINE} is current on 1 publication host(s).`,
	};
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

const panel_value = (over = {}) =>
	Object.assign(
		{
			registry: { state: 'ok', reason: null, check: null },
			registry_path: '/srv/dedalo/private/publication_hosts.json',
			engine_qualities: ['1.5MB'],
			is_root: true,
			hosts: [host_row('www')],
			runtime_invalid: null,
			api_lockstep: make_panel(),
		},
		over,
	);

const mount = async (self) => {
	const content_data = await self.list({ render_level: 'content' });
	container.appendChild(content_data);
	mounted.push(content_data);
	return content_data;
};

describe('PUBLICATION HOSTS — API LOCKSTEP', function () {
	this.timeout(10000);

	afterEach(function () {
		while (mounted.length) {
			mounted.pop().remove();
		}
	});

	it('renders one row per host and API, with the engine release and its check time', function () {
		const node = render_api_lockstep(make_panel(), { is_root: true });
		assert.strictEqual(node.querySelectorAll('.lockstep_row').length, 3);
		assert.include(node.querySelector('.engine_release').textContent, ENGINE);
		assert.include(node.querySelector('.engine_release').textContent, AT);
	});

	it('a matching API is calm, a lagging one amber, a failed push red (naming its code)', function () {
		const rows = render_api_lockstep(make_panel()).querySelectorAll('.lockstep_row');
		assert.ok(rows[0].querySelector('.dd_badge.state_ok'));
		assert.ok(rows[1].querySelector('.dd_badge.state_danger'));
		assert.include(rows[1].textContent, 'publication_host.failed');
		assert.ok(rows[2].querySelector('.dd_badge.state_warning'));
	});

	it('a v2-only site\'s v1 row reads Not served on a plain badge — never amber or red', function () {
		const panel = make_panel({
			rows: [
				{ host: 'site', api: 'v1', engine: ENGINE, host_current: null, last_push: null, state: 'not_served' },
			],
		});
		const badge = render_api_lockstep(panel).querySelector('.lockstep_row .dd_badge');
		assert.strictEqual(badge.textContent, 'Not served');
		assert.strictEqual(badge.className, 'dd_badge');
	});

	it('names the refusal with its check time and keeps the push enabled (it re-verifies)', function () {
		const refused = 'v1: drift: publication/server_api/v1/json/index.php (modified)';
		const node = render_api_lockstep(make_panel({ engine_release: null, refused }), {
			is_root: true,
		});
		const note = node.querySelector('.dd_note.state_danger').textContent;
		assert.include(note, refused);
		assert.include(note, AT, 'the refusal says when it was checked (it may be stale)');
		assert.isFalse(node.querySelector('button.push_apis').disabled);
	});

	it('no host rows: nothing to push to, the push is disabled', function () {
		const node = render_api_lockstep(make_panel({ rows: [] }), { is_root: true });
		assert.isTrue(node.querySelector('button.push_apis').disabled);
	});

	it('not verified yet (no round since boot): says so, and the push stays enabled (it verifies first)', function () {
		const node = render_api_lockstep(
			make_panel({ engine_release: null, refused: null, checked_at: null }),
			{ is_root: true },
		);
		assert.include(node.querySelector('.engine_release').textContent, 'not verified yet');
		assert.strictEqual(node.querySelector('.dd_note.state_danger'), null);
		assert.isFalse(node.querySelector('button.push_apis').disabled);
	});

	it('a non-root viewer sees the rows, never the push button', function () {
		const node = render_api_lockstep(make_panel(), { is_root: false });
		assert.strictEqual(node.querySelectorAll('.lockstep_row').length, 3);
		assert.strictEqual(node.querySelector('button.push_apis'), null);
	});

	it('server strings reach the DOM as text, never markup', function () {
		const node = render_api_lockstep(
			make_panel({ engine_release: null, refused: '<img src=x onerror=alert(1)>' }),
		);
		assert.strictEqual(node.querySelector('img'), null);
		assert.include(node.querySelector('.dd_note.state_danger').textContent, '<img');
		const flag = render_runtime_invalid('<b>invalid_json</b>');
		assert.strictEqual(flag.querySelector('b'), null);
		assert.include(flag.textContent, '<b>invalid_json</b>');
	});

	it('an unreadable runtime file is flagged red in the panel, naming its reason', async function () {
		const content = await mount(build_widget(panel_value({ runtime_invalid: 'invalid_json' })));
		const flag = content.querySelector('.runtime_invalid');
		assert.ok(flag, 'the runtime note renders');
		assert.isTrue(flag.classList.contains('state_danger'));
		assert.include(flag.textContent, 'invalid_json');
		assert.ok(content.querySelector('.publication_host'), 'the host cards still render');
	});

	it('asks first, then sends ONE push_apis, shows the server sentence and reloads', async function () {
		const self = build_widget(panel_value());
		const content = await mount(self);
		content.querySelector('button.push_apis').click();
		await settle();
		assert.strictEqual(self.confirms.length, 1, 'the operator was asked');
		assert.include(self.confirms[0], ENGINE, 'the question names the release');
		assert.deepEqual(self.calls, [{ action: 'push_apis', options: {} }]);
		assert.include(
			content.querySelector('.body_response').textContent,
			`Release ${ENGINE} is current`,
		);
		assert.strictEqual(self.reloads, 1, 'value reloaded once');
	});

	it('a push still running server-side shows its sentence and reloads', async function () {
		const self = build_widget(panel_value());
		self.next_response = {
			ok: true,
			data: null,
			msg: 'Push started and still running after 60 s',
			running: true,
			report: null,
		};
		const content = await mount(self);
		content.querySelector('button.push_apis').click();
		await settle();
		assert.deepEqual(self.calls, [{ action: 'push_apis', options: {} }]);
		assert.include(content.querySelector('.body_response').textContent, 'still running');
		assert.strictEqual(self.reloads, 1);
	});

	it('a declined confirm sends nothing', async function () {
		const self = build_widget(panel_value());
		self.confirm_answer = false;
		const content = await mount(self);
		content.querySelector('button.push_apis').click();
		await settle();
		assert.strictEqual(self.confirms.length, 1);
		assert.deepEqual(self.calls, []);
		assert.strictEqual(self.reloads, 0);
	});
});

// @license-end
