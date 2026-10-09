// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, afterEach, assert */
/*eslint no-undef: "error"*/

/**
 * TEST_PUBLICATION_HOST_SETUP
 * "New publication host" in the publication_hosts widget (render_new_host.js;
 * server: src/core/area_maintenance/widgets/publication_host_setup.ts).
 *
 * What it pins:
 *  - the section renders for ROOT only and only when the value carries
 *    drafts_state (the server sends drafts to root alone); a corrupt drafts
 *    file is a LOUD note, never an empty list;
 *  - each draft card shows its state (awaiting / paired as), its listener,
 *    its kit sha256; Build kit, Download kit (disabled until a kit exists),
 *    Remove draft (confirm-gated); the pairing upload exists only for an
 *    awaiting TWO-machine draft and takes no address;
 *  - Propose fills the form from the server's proposal; Save sends EXACTLY
 *    the draft keys (no engine group on two machines, no v1 block on v2-only,
 *    no address on one machine); a refusal marks the inputs its
 *    details.fields names and shows the label AND the sentence;
 *  - the pairing upload sends the package as base64 + the passphrase in one
 *    request and clears the passphrase input whatever the answer;
 *  - Download hands the decoded kit bytes to save_file under the kit's name
 *    and shows its sha256.
 *
 * Backend-free: widget_request / confirm_action / reload / save_file are
 * replaced on the INSTANCE.
 */

import { publication_hosts } from '../../../core/area_maintenance/widgets/publication_hosts/js/publication_hosts.js';
import { ApiError } from '../../../core/common/js/api_error.js';
import { debug_redacted } from '../../../core/common/js/data_manager.js';
import {
	base64_to_bytes,
	bytes_to_base64,
	read_draft_form,
} from '../../../core/area_maintenance/widgets/publication_hosts/js/render_new_host.js';

const container = document.getElementById('content');
const mounted = [];
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

const DRAFT = Object.freeze({
	instance: 'museum_org',
	layout: 'home',
	apis: 'v2_only',
	listen: { kind: 'tls', host: '10.20.0.2', port: 8471 },
	agent_user: 'museum_org_agent',
	web: { server: 'apache' },
	site: { domain: 'museum.org' },
	media: { mode: 'copy', root: '/srv/pub/museum_org' },
	v2: { unit: 'dedalo-publication-api-v2-museum_org', user: 'museum_org_v2', port: 3100 },
});

const draft_row = (overrides = {}) =>
	Object.assign(
		{
			name: 'museum_org',
			created_at: '2026-10-09T00:00:00.000Z',
			draft: DRAFT,
			state: 'awaiting',
			paired_as: null,
			kit: null,
		},
		overrides,
	);

const value = (drafts, extra = {}) =>
	Object.assign(
		{
			registry: { state: 'ok', reason: null },
			registry_path: '/srv/dedalo/private/publication_hosts.json',
			engine_qualities: [],
			is_root: true,
			hosts: [],
			drafts_state: 'ok',
			drafts: drafts,
		},
		extra,
	);

const build_widget = (widget_value) => {
	const self = new publication_hosts();
	self.id = 'publication_hosts';
	self.value = widget_value;
	self.caller = null;
	self.events_tokens = [];
	self.calls = [];
	self.reloads = 0;
	self.confirms = [];
	self.saved = [];
	self.next_response = { ok: true, data: null, msg: 'OK.' };
	self.confirm_action = (message) => {
		self.confirms.push(message);
		return true;
	};
	self.reload = async () => {
		self.reloads++;
	};
	self.save_file = (blob, name) => {
		self.saved.push({ blob, name });
	};
	self.widget_request = async (action, options) => {
		self.calls.push({ action: action, options: options });
		return typeof self.next_response === 'function' ? self.next_response(action, options) : self.next_response;
	};
	return self;
};

const mount = async (self) => {
	const content_data = await self.list({ render_level: 'content' });
	container.appendChild(content_data);
	mounted.push(content_data);
	return content_data;
};

const inputs_of = (content) => {
	const inputs = {};
	for (const node of content.querySelectorAll('.new_host_form [data-field]')) {
		inputs[node.dataset.field] = node;
	}
	return inputs;
};

describe('PUBLICATION HOST SETUP (New publication host)', function () {
	this.timeout(10000);

	afterEach(function () {
		while (mounted.length) {
			mounted.pop().remove();
		}
	});

	it('renders for root only, and only when the server sent drafts', async function () {
		const root = await mount(build_widget(value([])));
		assert.ok(root.querySelector('.new_publication_host'), 'root sees the section');
		const admin = await mount(build_widget(value([], { is_root: false })));
		assert.isNull(admin.querySelector('.new_publication_host'), 'a non-root admin sees none');
		const older = build_widget(value([]));
		delete older.value.drafts_state;
		const none = await mount(older);
		assert.isNull(none.querySelector('.new_publication_host'), 'no drafts_state, no section');
	});

	it('a corrupt drafts file is a loud note, never an empty list', async function () {
		const content = await mount(build_widget(value(null, { drafts_state: 'drafts_invalid' })));
		const note = content.querySelector('.drafts_invalid');
		assert.ok(note, 'the note renders');
		assert.isTrue(note.classList.contains('state_danger'));
		assert.strictEqual(content.querySelectorAll('.publication_host_draft').length, 0);
	});

	it('a draft card: state, listener, kit sha; download disabled until a kit exists; pairing only for an awaiting two-machine draft', async function () {
		const content = await mount(build_widget(value([draft_row()])));
		const card = content.querySelector('.publication_host_draft');
		assert.ok(card);
		assert.include(card.textContent, '10.20.0.2:8471');
		assert.isTrue(card.querySelector('.button_download_kit').disabled, 'no kit, no download');
		assert.isFalse(card.querySelector('.button_build_kit').disabled);
		assert.ok(card.querySelector('.pair_package input[type="file"]'), 'the package input');
		assert.strictEqual(card.querySelector('.pair_package input[name="pairing_passphrase"]').type, 'password');
		assert.isNull(card.querySelector('.pair_package input[name*="address"], .pair_package input[name*="host"]'), 'no address input');

		const sha = 'c'.repeat(64);
		const built = await mount(
			build_widget(value([draft_row({ kit: { sha256: sha, release: '7.0.1_abcdef0', file_name: 'k.tar.gz', size: 3 } })])),
		);
		assert.include(built.querySelector('.publication_host_draft').textContent, sha, 'the kit sha256 is shown');
		assert.isFalse(built.querySelector('.button_download_kit').disabled);

		const one = await mount(
			build_widget(value([draft_row({ draft: Object.assign({}, DRAFT, { listen: { kind: 'unix' }, engine_group: 'dedalo' }) })])),
		);
		assert.isNull(one.querySelector('.pair_package'), 'a one-machine draft pairs itself during init');
		const paired = await mount(build_widget(value([draft_row({ state: 'paired', paired_as: 'museum_org' })])));
		assert.isNull(paired.querySelector('.pair_package'), 'a paired draft has no upload');
		assert.isTrue(paired.querySelector('.button_build_kit').disabled);
	});

	it('Propose fills the form; Save sends exactly the draft keys', async function () {
		const self = build_widget(value([]));
		const content = await mount(self);
		const inputs = inputs_of(content);
		inputs['site.domain'].value = 'museum.org';
		inputs['listen.kind'].value = 'tls';
		inputs['listen.kind'].dispatchEvent(new Event('change'));
		inputs['listen.host'].value = '10.20.0.2';
		self.next_response = { ok: true, data: { name: 'museum_org', draft: DRAFT } };
		content.querySelector('.button_propose_draft').click();
		await settle();
		assert.deepEqual(self.calls[0], {
			action: 'propose_draft',
			options: { domain: 'museum.org', machines: 'two', listen_host: '10.20.0.2', apis: 'v2_only' },
		});
		assert.strictEqual(inputs.instance.value, 'museum_org');
		assert.strictEqual(inputs['v2.port'].value, '3100');
		assert.strictEqual(inputs['media.root'].value, '/srv/pub/museum_org');

		self.next_response = { ok: true, data: { name: 'museum_org' }, msg: 'OK. Draft saved.' };
		content.querySelector('.button_save_draft').click();
		await settle();
		const save = self.calls[1];
		assert.strictEqual(save.action, 'save_draft');
		assert.deepEqual(save.options, { name: 'museum_org', draft: DRAFT }, 'the draft round-trips: two machines carry no engine group, v2-only no v1');
		assert.strictEqual(self.reloads, 1);
	});

	it('read_draft_form: one machine sends the group and no address; v1 + v2 sends the v1 user; none sends no root', function () {
		const field = (v) => ({ value: v });
		const inputs = {
			name: field('a_b'),
			instance: field('a_b'),
			'site.domain': field('a.b'),
			'listen.kind': field('unix'),
			'listen.host': field('10.0.0.1'),
			'listen.port': field('8471'),
			'web.server': field('nginx'),
			apis: field('v1_and_v2'),
			'v1.user': field('a_b_v1'),
			'media.mode': field('none'),
			'media.root': field('/x'),
			layout: field('system'),
			agent_user: field('a_b_agent'),
			engine_group: field('dedalo'),
			'v2.user': field('a_b_v2'),
			'v2.unit': field('u'),
			'v2.port': field('3101'),
		};
		const { draft } = read_draft_form(inputs);
		assert.deepEqual(draft.listen, { kind: 'unix' });
		assert.strictEqual(draft.engine_group, 'dedalo');
		assert.deepEqual(draft.v1, { user: 'a_b_v1' });
		assert.deepEqual(draft.media, { mode: 'none' });
		assert.strictEqual(draft.v2.port, 3101);
	});

	it('a refused save marks the named fields and shows the label and the sentence', async function () {
		const self = build_widget(value([]));
		const content = await mount(self);
		const inputs = inputs_of(content);
		self.next_response = {
			ok: false,
			error: new ApiError({
				code: 'publication_host_setup.draft_invalid',
				status: 400,
				label_key: 'error_publication_host_setup_draft_invalid',
				message: 'Error. The draft was refused:\nv2.port: v2.port 3100 — also used by instance x',
				details: { fields: 'v2.port,agent_user' },
				category: 'caller',
				retryable: false,
				source: 'envelope',
			}),
		};
		content.querySelector('.button_save_draft').click();
		await settle();
		assert.isTrue(inputs['v2.port'].classList.contains('field_error'));
		assert.isTrue(inputs.agent_user.classList.contains('field_error'));
		assert.isFalse(inputs.instance.classList.contains('field_error'));
		assert.strictEqual(inputs['v2.port'].getAttribute('aria-invalid'), 'true');
		const console_text = content.querySelector('.body_response').textContent;
		assert.include(console_text, 'also used by instance x', 'the sentence');
		assert.strictEqual(self.reloads, 0, 'no reload on a refusal');
	});

	it('the upload sends base64 + passphrase in one request and clears the passphrase whatever the answer', async function () {
		const self = build_widget(value([draft_row()]));
		const content = await mount(self);
		const card = content.querySelector('.publication_host_draft');
		const file_input = card.querySelector('.pair_package input[type="file"]');
		const bytes = new Uint8Array([0x44, 0x44, 0x50, 0x48, 0x50, 0x41, 0x49, 0x52, 1, 2, 3]);
		const transfer = new DataTransfer();
		transfer.items.add(new File([bytes], 'museum_org.pairing'));
		file_input.files = transfer.files;
		const pass = card.querySelector('input[name="pairing_passphrase"]');
		pass.value = 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01';
		self.next_response = {
			ok: false,
			error: new ApiError({
				code: 'publication_host_setup.pairing_refused',
				status: 400,
				label_key: 'error_publication_host_setup_pairing_refused',
				message: 'Error. The passphrase is wrong, or the package was altered.',
				details: { reason: 'package_auth' },
				category: 'caller',
				retryable: false,
				source: 'envelope',
			}),
		};
		card.querySelector('.button_pair_package').click();
		await settle();
		await settle();
		assert.strictEqual(self.calls.length, 1);
		assert.deepEqual(self.calls[0], {
			action: 'pair_package',
			options: { name: 'museum_org', package_base64: bytes_to_base64(bytes), passphrase: 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01' },
		});
		assert.strictEqual(pass.value, '', 'the passphrase input is cleared');
		assert.strictEqual(self.confirms.length, 1, 'confirm-gated');
		assert.strictEqual(self.reloads, 0);
		// no file: nothing sent
		file_input.files = new DataTransfer().files;
		pass.value = 'x';
		card.querySelector('.button_pair_package').click();
		await settle();
		assert.strictEqual(self.calls.length, 1);
		assert.strictEqual(pass.value, '');
	});

	it("the debug request line never carries the passphrase or the package (data_manager debug_redacted)", function () {
		const merged = { body: { action: 'widget_request', options: { name: 'a', passphrase: 'P', package_base64: 'QUJD' } } };
		const shown = debug_redacted(merged);
		assert.strictEqual(shown.body.options.passphrase, '[redacted]');
		assert.strictEqual(shown.body.options.package_base64, '[redacted]');
		assert.strictEqual(shown.body.options.name, 'a');
		assert.strictEqual(merged.body.options.passphrase, 'P', 'the request itself is unchanged');
	});

	it('Download hands the decoded kit to save_file under its name and shows the sha256', async function () {
		const sha = 'd'.repeat(64);
		const self = build_widget(value([draft_row({ kit: { sha256: sha, release: 'r', file_name: 'kit.tar.gz', size: 3 } })]));
		const content = await mount(self);
		const payload = new Uint8Array([1, 2, 250]);
		self.next_response = {
			ok: true,
			data: { sha256: sha, file_name: 'dedalo_publication_host_kit_museum_org.tar.gz', kit_base64: bytes_to_base64(payload) },
		};
		content.querySelector('.button_download_kit').click();
		await settle();
		assert.strictEqual(self.saved.length, 1);
		assert.strictEqual(self.saved[0].name, 'dedalo_publication_host_kit_museum_org.tar.gz');
		const got = new Uint8Array(await self.saved[0].blob.arrayBuffer());
		assert.deepEqual(Array.from(got), Array.from(payload));
		assert.include(content.querySelector('.body_response').textContent, sha);
		assert.deepEqual(Array.from(base64_to_bytes(bytes_to_base64(payload))), Array.from(payload));
	});
});

// @license-end
