/**
 * CLIENT UPLOAD QUEUE RENDERER — the contract of
 *   client/dedalo/core/services/service_upload/js/render_edit_service_upload_queue.js
 *
 * WHY THIS FILE EXISTS. Until it did, that module (~1300 lines) had ZERO
 * mechanical coverage of any kind:
 *   - nothing imported it yet (the import tools still selected
 *     `service_dropzone` when this gate was written), so
 *     `bun run test:client` never reached a line of it;
 *   - `biome.jsonc:86` excludes `**\/client`, so it is neither linted nor
 *     type-checked;
 *   - `dedalo_files_differential.test.ts:151` only asserts the file is SERVED.
 * The adversarial pass measured exactly what that is worth: replacing the batch
 * controls' `previews_container.querySelectorAll` with `document.querySelectorAll`
 * and deleting the `URL.revokeObjectURL` call each left the whole unit suite AND
 * the 118-case browser suite green. Every invariant the module's header calls
 * load-bearing was comment-only — and AGENTS.md is explicit that an invariant is
 * tripwired or deleted. This is the tripwire, and it is the precondition for
 * deleting `service_dropzone`: a verified implementation must not be replaced by
 * an unverified one.
 *
 * WHAT IS PINNED (each one is a defect that was reproduced in the module this
 * one replaces, or in this one):
 *   - TWO WIDGETS ON ONE PAGE DO NOT CROSS-WIRE. `render_edit_service_dropzone`
 *     queried `document` for `.delete_checkbox` in both the master checkbox and
 *     the batch delete, so ticking "all" in one panel deleted rows in the other.
 *   - EVERY OBJECT URL IS REVOKED, on all three paths that end a preview's life
 *     (row removal, replacement by the server thumbnail, teardown). Dropzone
 *     revoked none: 300 queued scans held 300 decoded blobs until the tab closed.
 *   - `dragleave` USES A DEPTH COUNTER. A naive toggle un-highlights the drop
 *     zone the instant the pointer crosses onto a child row, which reads as "this
 *     target is dead" mid-drag.
 *   - EVERY `document`-LEVEL LISTENER IS TRACKED, so teardown can remove it.
 *     Those two are the only listeners here that do not die with the widget's own
 *     node; untracked, they stack one pair per render, unreachable for ever.
 *   - A RE-RENDER IS IDEMPOTENT (it tears the previous one down defensively
 *     instead of assuming destroy() ran).
 *   - `build_row` EMITS THE DOM THE CSS SELECTS. `.file-row`, `.preview_wrapp`
 *     and `.details_wrapp > .name|.error|.size` are selected FROM OUTSIDE this
 *     file by `tools/tool_import_files/css/tool_import_files.css:163-213`; a
 *     renamed class is an invisible layout regression.
 *
 * HOW IT RUNS. Fake `document` / `URL` / `Option` / `XMLHttpRequest` / `FormData`
 * plus a fake `ui.create_dom_element` (mirroring the real factory's option set),
 * which is also the ONLY way this module can be imported at all: the real
 * `ui.js` imports `core/tools_common/js/tool_common.js`, a SERVING seam that maps
 * to `tools/` and does not exist as a relative path on disk. No network, no
 * server, no DB. Every global is saved and restored in afterAll — bun test shares
 * one process and a leaked stub breaks every later file.
 */

import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { join } from 'node:path';

const CLIENT_CORE = join(import.meta.dir, '..', '..', 'client', 'dedalo', 'core');
const UI_PATH = join(CLIENT_CORE, 'common', 'js', 'ui.js');
const RENDER_PATH = join(
	CLIENT_CORE,
	'services',
	'service_upload',
	'js',
	'render_edit_service_upload_queue.js',
);

// ────────────────────────────────────────────────────────────────────────────
// A DOM stub with exactly the surface this renderer touches
// ────────────────────────────────────────────────────────────────────────────

interface Listener {
	type: string;
	handler: (e: unknown) => void;
	options?: unknown;
}

class FakeNode {
	tag: string;
	classes: string[] = [];
	children: FakeNode[] = [];
	parent: FakeNode | null = null;
	listeners: Listener[] = [];
	style: Record<string, string> & { setProperty: (k: string, v: string) => void };
	dataset: Record<string, string> = {};
	textContent = '';
	html = '';
	disabled = false;
	multiple = false;
	checked = false;
	accept = '';
	value = '';
	src = '';
	type = '';
	id = '';
	title = '';
	name = '';
	// Only the file input has one; the renderer reads `input.files`.
	files: unknown[] = [];

	constructor(tag: string) {
		this.tag = tag;
		const style: Record<string, unknown> = {
			setProperty(this: Record<string, unknown>, key: string, value: string) {
				this[key] = value;
			},
		};
		this.style = style as FakeNode['style'];
	}

	get className() {
		return this.classes.join(' ');
	}
	set className(value: string) {
		this.classes = String(value).split(' ').filter(Boolean);
	}

	classList = {
		add: (...names: string[]) => {
			for (const name of names) if (!this.classes.includes(name)) this.classes.push(name);
		},
		remove: (...names: string[]) => {
			this.classes = this.classes.filter((c) => !names.includes(c));
		},
		contains: (name: string) => this.classes.includes(name),
		toggle: (name: string) => {
			if (this.classes.includes(name)) this.classes = this.classes.filter((c) => c !== name);
			else this.classes.push(name);
		},
	};

	appendChild(child: FakeNode) {
		child.parent = this;
		this.children.push(child);
		return child;
	}
	insertAdjacentHTML(_where: string, html: string) {
		this.html += html;
	}
	remove() {
		if (!this.parent) return;
		this.parent.children = this.parent.children.filter((c) => c !== this);
		this.parent = null;
	}

	/** Descendants matching a single `.class` / `tag` selector. Depth-first, document order. */
	querySelectorAll(selector: string): FakeNode[] {
		const out: FakeNode[] = [];
		const matches = (node: FakeNode) =>
			selector.startsWith('.') ? node.classes.includes(selector.slice(1)) : node.tag === selector;
		const walk = (node: FakeNode) => {
			for (const child of node.children) {
				if (matches(child)) out.push(child);
				walk(child);
			}
		};
		walk(this);
		return out;
	}
	querySelector(selector: string): FakeNode | null {
		return this.querySelectorAll(selector)[0] ?? null;
	}

	addEventListener(type: string, handler: (e: unknown) => void, options?: unknown) {
		this.listeners.push({ type, handler, options });
	}
	removeEventListener(type: string, handler: (e: unknown) => void, _options?: unknown) {
		const index = this.listeners.findIndex((l) => l.type === type && l.handler === handler);
		if (index !== -1) this.listeners.splice(index, 1);
	}
	/** Fires this node's own handlers for `type`. No bubbling: every listener the
	 * renderer attaches is either on the widget root or on a node it owns, and the
	 * tests dispatch on the node the handler is bound to. */
	fire(type: string, event: Record<string, unknown> = {}) {
		const payload = { preventDefault() {}, stopPropagation() {}, ...event };
		// Copy: a `{once:true}` handler removes itself while we iterate.
		for (const listener of [...this.listeners]) {
			if (listener.type !== type) continue;
			if (
				listener.options &&
				typeof listener.options === 'object' &&
				(listener.options as { once?: boolean }).once
			) {
				this.removeEventListener(type, listener.handler);
			}
			listener.handler(payload);
		}
	}
	count_listeners(type?: string) {
		return this.listeners.filter((l) => !type || l.type === type).length;
	}
}

/** Mirrors ui.create_dom_element's option handling (CREATE_DOM_ELEMENT_OPTIONS). */
function fake_create_dom_element(options: Record<string, unknown>) {
	const element = new FakeNode((options.element_type as string) || 'div');
	if (options.id) element.id = options.id as string;
	if (options.type && options.element_type !== 'textarea') element.type = options.type as string;
	if (options.src) element.src = options.src as string;
	if (options.class_name) element.className = options.class_name as string;
	if (options.style) {
		for (const [key, value] of Object.entries(options.style as Record<string, string>)) {
			element.style.setProperty(key, value);
		}
	}
	const title = options.title_label || options.title;
	if (title) element.title = title as string;
	const data_set = (options.dataset ?? options.data_set) as Record<string, string> | undefined;
	if (data_set) for (const [key, value] of Object.entries(data_set)) element.dataset[key] = value;
	if (options.value !== undefined) element.value = options.value as string;
	const has_text = (c: unknown) => c !== undefined && c !== null && c !== '';
	if (has_text(options.inner_html))
		element.insertAdjacentHTML('afterbegin', String(options.inner_html));
	else if (has_text(options.text_node)) element.textContent = String(options.text_node);
	else if (has_text(options.text_content)) element.textContent = String(options.text_content);
	if (options.name) element.name = options.name as string;
	if (options.parent) (options.parent as FakeNode).appendChild(element);
	return element;
}

const shown_messages: { text: string; type: string }[] = [];

// ── the upload wire surface (same shape as client_upload_queue.test.ts) ──────

const upload_response = () =>
	JSON.stringify({
		result: true,
		file_data: { tmp_name: 'a.jpg', key_dir: 'image', extension: 'jpg', thumbnail_url: '/t/a.jpg' },
	});

class FakeFormData {
	fields: [string, unknown][] = [];
	append(key: string, value: unknown) {
		this.fields.push([key, value]);
	}
}

class FakeXHR {
	upload = {
		listeners: {} as Record<string, ((e: unknown) => void)[]>,
		addEventListener: (type: string, fn: (e: unknown) => void) => {
			if (!this.upload.listeners[type]) this.upload.listeners[type] = [];
			this.upload.listeners[type]?.push(fn);
		},
	};
	listeners: Record<string, ((e: unknown) => void)[]> = {};
	status = 0;
	response = '';
	responseText = '';
	aborted = false;
	addEventListener(type: string, fn: (e: unknown) => void) {
		if (!this.listeners[type]) this.listeners[type] = [];
		this.listeners[type]?.push(fn);
	}
	open() {}
	setRequestHeader() {}
	abort() {
		this.aborted = true;
		for (const fn of this.listeners.abort ?? []) fn({});
		for (const fn of this.listeners.loadend ?? []) fn({});
	}
	send() {
		setTimeout(() => {
			if (this.aborted) return;
			this.status = 200;
			this.response = upload_response();
			this.responseText = this.response;
			for (const fn of this.upload.listeners.progress ?? []) fn({ loaded: 100, total: 100 });
			for (const fn of this.listeners.load ?? []) fn({ target: this });
			for (const fn of this.listeners.loadend ?? []) fn({});
		}, 1);
	}
}

function make_file(name: string, size = 10) {
	return { name, size, slice: (start: number, end: number) => ({ size: end - start }) };
}

// ────────────────────────────────────────────────────────────────────────────

const globals = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};
const revoked: string[] = [];
const created_urls: string[] = [];
let url_sequence = 0;
let fake_document: FakeNode;
// biome-ignore lint/suspicious/noExplicitAny: the module under test is untyped client JS.
let render_module: any;
// biome-ignore lint/suspicious/noExplicitAny: ditto.
let data_manager: any;
let original_request: unknown;
const api_calls: { action: string; options: Record<string, unknown> }[] = [];

beforeAll(async () => {
	for (const key of [
		'document',
		'URL',
		'Option',
		'get_label',
		'XMLHttpRequest',
		'FormData',
		'DEDALO_API_URL',
		'window',
		'page_globals',
	]) {
		saved[key] = globals[key];
	}

	fake_document = new FakeNode('#document');
	// `document.createElement` is only reached through the fake ui factory, but the
	// real one uses it, so the stub keeps the same shape.
	(fake_document as unknown as Record<string, unknown>).createElement = (tag: string) =>
		new FakeNode(tag);
	(fake_document as unknown as Record<string, unknown>).body = new FakeNode('body');
	globals.document = fake_document;

	globals.URL = {
		createObjectURL: () => {
			url_sequence++;
			const url = `blob:fake/${url_sequence}`;
			created_urls.push(url);
			return url;
		},
		revokeObjectURL: (url: string) => {
			revoked.push(url);
		},
	};
	globals.Option = class {
		text: string;
		value: string;
		tag = 'option';
		classes: string[] = [];
		children: FakeNode[] = [];
		constructor(text: string, value: unknown) {
			this.text = text;
			// `new Option('', null)` yields the STRING 'null' — the sentinel
			// render_tool_import_files.js compares against.
			this.value = String(value);
		}
	};
	globals.get_label = {};
	globals.XMLHttpRequest = FakeXHR;
	globals.FormData = FakeFormData;
	globals.DEDALO_API_URL = '/api/v1/json/';
	globals.window = globalThis;
	globals.page_globals = { csrf_token: 'TOK' };
	(globals.window as Record<string, unknown>).page_globals = globals.page_globals;

	// (!) The ONLY way to import the module under test. See the file header: the
	// real ui.js reaches for a serving seam that is not a path on disk. Nothing
	// else in test/ imports ui.js as a module, so the mock cannot reach another
	// file's assertions — the interleaved run in the report proves it.
	mock.module(UI_PATH, () => ({
		ui: {
			create_dom_element: fake_create_dom_element,
			show_message: (_wrapper: unknown, text: string, type: string) => {
				shown_messages.push({ text, type });
			},
		},
	}));

	render_module = await import(RENDER_PATH);
	data_manager = (await import(join(CLIENT_CORE, 'common', 'js', 'data_manager.js'))).data_manager;
	original_request = data_manager.request;
	data_manager.request = async (options: { body: { action: string; options: unknown } }) => {
		api_calls.push({
			action: options.body.action,
			options: (options.body.options ?? {}) as Record<string, unknown>,
		});
		// list_uploaded_files answers a listing; everything else a bare ok.
		return options.body.action === 'list_uploaded_files'
			? { result: [], msg: 'ok' }
			: { result: true, msg: 'ok' };
	};
});

afterAll(() => {
	data_manager.request = original_request;
	for (const [key, value] of Object.entries(saved)) {
		if (value === undefined) delete globals[key];
		else globals[key] = value;
	}
});

/** A minimal service_upload stand-in: exactly the properties the renderer reads. */
// biome-ignore lint/suspicious/noExplicitAny: untyped client instance.
function make_self(overrides: Record<string, unknown> = {}): any {
	return {
		model: 'service_upload',
		type: 'service',
		tipo: 'dd1',
		section_tipo: 'dd1',
		section_id: '1',
		mode: 'edit',
		lang: 'lg-eng',
		key_dir: 'image',
		allowed_extensions: [],
		max_size_bytes: 0,
		upload_service_chunk_files: 0,
		max_concurrent: 4,
		file_processor: null,
		component_option: null,
		caller: { files_data: [], model: 'component_image', caller: { tipo: 'dd2' } },
		node: null,
		...overrides,
	};
}

/** Renders one widget INTO the fake document, exactly as a page would. */
// biome-ignore lint/suspicious/noExplicitAny: untyped client instance.
async function render_widget(self: any) {
	const content_data = await render_module.get_content_data_queue(self);
	(fake_document as unknown as { body: FakeNode }).body.appendChild(content_data);
	return content_data as FakeNode;
}

const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

/** Drives the file input, i.e. the real add path (queue.add + local thumbnail). */
function pick_files(content_data: FakeNode, files: unknown[]) {
	const input = content_data.querySelector('.queue_file_input');
	if (!input) throw new Error('the hidden multiple file input is gone');
	input.files = files;
	input.fire('change');
}

function reset_page() {
	(fake_document as unknown as { body: FakeNode }).body = new FakeNode('body');
	fake_document.listeners.length = 0;
	revoked.length = 0;
	created_urls.length = 0;
	shown_messages.length = 0;
	api_calls.length = 0;
}

// ────────────────────────────────────────────────────────────────────────────

describe('render_edit_service_upload_queue — the DOM contract', () => {
	test('build_row emits the structure the consumer CSS selects into', async () => {
		reset_page();
		const self = make_self();
		const content_data = await render_widget(self);
		pick_files(content_data, [make_file('scan.tif', 2048)]);

		// tools/tool_import_files/css/tool_import_files.css:163-213 selects EXACTLY
		// these from outside this module. A renamed class here is an invisible
		// layout regression: the row still renders, unstyled.
		const row = content_data.querySelector('.file-row');
		expect(row, '.file-row is the row selector the tool CSS uses').not.toBeNull();
		expect(row?.querySelector('.preview_wrapp')).not.toBeNull();
		const details = row?.querySelector('.details_wrapp');
		expect(details).not.toBeNull();
		// The three text spans are children of .details_wrapp, in that order.
		expect(details?.children.map((c) => c.classes[0])).toEqual(['name', 'error', 'size']);
		expect(details?.querySelector('.name')?.textContent).toBe('scan.tif');
		expect(details?.querySelector('.size')?.textContent).toBe('2 KB');
		// The preview img the local/remote thumbnail is assigned to.
		expect(row?.querySelector('._preview_image')?.tag).toBe('img');
		// One status class, swapped — never accumulated.
		expect(row?.classes).toEqual(['file-row', 'row_status_pending']);
	});

	test('the row exposes the selects the import tools read off previewElement', async () => {
		reset_page();
		const self = make_self({
			file_processor: [{ function_name: 'ocr', function_name_label: 'OCR' }],
			component_option: [{ tipo: 'dd3', label: 'Image' }],
		});
		const content_data = await render_widget(self);
		pick_files(content_data, [make_file('a.jpg')]);

		// render_tool_import_files.js:264 does exactly this.
		const entry = self.caller.files_data[0];
		expect(entry.previewElement.querySelector('.file_processor_select')).not.toBeNull();
		expect(entry.previewElement.querySelector('.option_component_select')).not.toBeNull();
		// …and the pointer must not have made the wire object unserialisable.
		expect(() => JSON.stringify(self.caller.files_data)).not.toThrow();
		expect(JSON.parse(JSON.stringify(entry)).previewElement).toBeUndefined();
	});
});

describe('render_edit_service_upload_queue — two widgets on one page', () => {
	test('the master checkbox only ticks its OWN rows', async () => {
		reset_page();
		const first = make_self();
		const second = make_self();
		const node_first = await render_widget(first);
		const node_second = await render_widget(second);
		pick_files(node_first, [make_file('a.jpg'), make_file('b.jpg')]);
		pick_files(node_second, [make_file('c.jpg')]);

		const master = node_first.querySelector('.all_delete_checkbox');
		if (!master) throw new Error('master checkbox missing');
		master.checked = true;
		master.fire('change');

		// The dropzone renderer used document.querySelectorAll here, so this ticked
		// the other panel's rows too.
		expect(node_first.querySelectorAll('.delete_checkbox').map((n) => n.checked)).toEqual([
			true,
			true,
		]);
		expect(node_second.querySelectorAll('.delete_checkbox').map((n) => n.checked)).toEqual([false]);
	});

	test('batch delete never removes a row from the other widget', async () => {
		reset_page();
		const first = make_self();
		const second = make_self();
		const node_first = await render_widget(first);
		const node_second = await render_widget(second);
		pick_files(node_first, [make_file('a.jpg'), make_file('b.jpg')]);
		pick_files(node_second, [make_file('c.jpg'), make_file('d.jpg')]);

		// Tick EVERY checkbox on the page, including the other widget's: a
		// document-scoped batch delete then takes all four.
		for (const box of (fake_document as unknown as { body: FakeNode }).body.querySelectorAll(
			'.delete_checkbox',
		)) {
			box.checked = true;
		}

		const button =
			node_first.querySelector('.danger.delete') ?? node_first.querySelector('.delete');
		if (!button) throw new Error('batch delete button missing');
		button.fire('click');
		await settle();

		expect(first.caller.files_data.length, 'its own rows go').toBe(0);
		expect(
			second.caller.files_data.map((e: { name: string }) => e.name),
			'the other widget is untouched — the batch controls are scoped to their own container',
		).toEqual(['c.jpg', 'd.jpg']);
		expect(node_second.querySelectorAll('.file-row').length).toBe(2);
	});
});

describe('render_edit_service_upload_queue — object URL lifetime', () => {
	test('a removed row revokes its preview URL', async () => {
		reset_page();
		const self = make_self();
		const content_data = await render_widget(self);
		pick_files(content_data, [make_file('a.jpg')]);
		expect(created_urls.length, 'a rasterisable local file gets a blob preview').toBe(1);
		expect(revoked).toEqual([]);

		await self.queue.remove(self.caller.files_data[0].id);
		// Dropzone revoked none of these: 300 queued scans held 300 decoded blobs
		// until the tab was closed.
		expect(revoked).toEqual([created_urls[0] as string]);
		expect(content_data.querySelectorAll('.file-row').length).toBe(0);
	});

	test('the server thumbnail replacing the local one revokes it', async () => {
		reset_page();
		const self = make_self();
		const content_data = await render_widget(self);
		pick_files(content_data, [make_file('a.jpg')]);
		expect(created_urls.length).toBe(1);

		self.queue.start();
		await settle();

		expect(self.caller.files_data[0].status).toBe('done');
		const row = content_data.querySelector('.file-row');
		expect(row?.querySelector('._preview_image')?.src).toBe('/t/a.jpg');
		// The blob is unreferenced by anything on screen the moment the <img> points
		// at the server's rendition.
		expect(revoked).toEqual([created_urls[0] as string]);
	});

	test('teardown revokes every URL still held', async () => {
		reset_page();
		const self = make_self();
		const content_data = await render_widget(self);
		pick_files(content_data, [make_file('a.jpg'), make_file('b.jpg')]);
		expect(created_urls.length).toBe(2);
		expect(revoked).toEqual([]);

		self.queue_teardown();
		expect(revoked.sort()).toEqual([...created_urls].sort());
		expect(content_data).toBeDefined();
	});
});

describe('render_edit_service_upload_queue — drag state', () => {
	test('dragleave onto a CHILD keeps the hover highlight (the depth counter)', async () => {
		reset_page();
		const self = make_self();
		const content_data = await render_widget(self);
		pick_files(content_data, [make_file('a.jpg')]);

		// Pointer enters the widget.
		content_data.fire('dragenter');
		expect(content_data.classList.contains('hover')).toBe(true);

		// Pointer crosses onto a row: the browser fires dragenter for the child
		// (bubbling to this handler) and THEN dragleave for the element being left.
		content_data.fire('dragenter');
		content_data.fire('dragleave');
		expect(
			content_data.classList.contains('hover'),
			'a naive boolean toggle un-highlights the zone the moment the cursor passes over a row',
		).toBe(true);

		// Pointer finally leaves the widget.
		content_data.fire('dragleave');
		expect(content_data.classList.contains('hover')).toBe(false);

		// An unbalanced extra dragleave must not drive the counter negative (the
		// next dragenter would then need two events to highlight).
		content_data.fire('dragleave');
		content_data.fire('dragenter');
		expect(content_data.classList.contains('hover')).toBe(true);
	});
});

describe('render_edit_service_upload_queue — listener ownership', () => {
	test('both document-level guards are tracked, and tracking is exhaustive', async () => {
		reset_page();
		const self = make_self();
		await render_widget(self);

		// Exactly two, and both preventDefault-only: a file dropped outside the
		// widget must not navigate the browser away from the application.
		expect(fake_document.count_listeners('dragover')).toBe(1);
		expect(fake_document.count_listeners('drop')).toBe(1);
		expect(fake_document.count_listeners()).toBe(2);

		const tracked_on_document = self.dom_listeners.filter(
			(l: { node: unknown }) => l.node === fake_document,
		);
		expect(tracked_on_document.map((l: { type: string }) => l.type).sort()).toEqual([
			'dragover',
			'drop',
		]);

		// (!) THE REAL ASSERTION. `service_upload.prototype.destroy` removes exactly
		// what `dom_listeners` holds; anything the renderer attached to `document`
		// WITHOUT tracking survives it, unreachable for ever (an anonymous handler
		// cannot be found again once its reference is gone).
		for (const listener of self.dom_listeners) {
			listener.node.removeEventListener(listener.type, listener.handler, listener.options);
		}
		expect(fake_document.count_listeners(), 'nothing untracked was left on document').toBe(0);
	});

	test('a re-render does not stack a second pair of document listeners', async () => {
		reset_page();
		const self = make_self();
		await render_widget(self);
		expect(fake_document.count_listeners()).toBe(2);

		// No destroy() in between — that is the whole point: the render must tear
		// the previous one down defensively rather than assume it ran.
		await render_widget(self);
		expect(
			fake_document.count_listeners(),
			'a render that assumes destroy() ran stacks an unreachable pair every time',
		).toBe(2);

		await render_widget(self);
		expect(fake_document.count_listeners()).toBe(2);
	});

	test('a re-render releases the previous render object URLs', async () => {
		reset_page();
		const self = make_self();
		const content_data = await render_widget(self);
		pick_files(content_data, [make_file('a.jpg')]);
		expect(created_urls.length).toBe(1);

		await render_widget(self);
		expect(revoked).toEqual([created_urls[0] as string]);
	});
});

describe('render_edit_service_upload_queue — reporting a partial drop', () => {
	test('a truncated drop says an UNKNOWN number of files was lost', async () => {
		reset_page();
		const self = make_self();
		const content_data = await render_widget(self);

		// One `read_error` on a 450-file folder is ONE error object and can cost
		// hundreds of scans. "1 dropped item(s) could not be read" reads as a single
		// missing file, which is how a partial ingest goes unnoticed for years.
		content_data.fire('drop', { dataTransfer: null });
		await settle();
		expect(shown_messages.length, 'a clean (empty) drop reports nothing').toBe(0);

		const dropped = await import(
			join(CLIENT_CORE, 'services', 'service_upload', 'js', 'dropped_files.js')
		);
		const failing_dir = {
			isFile: false,
			isDirectory: true,
			name: 'box',
			fullPath: '/box',
			createReader: () => ({
				readEntries: (_ok: unknown, err: (e: unknown) => void) =>
					setTimeout(() => err(new Error('device i/o error')), 0),
			}),
		};
		const files = await dropped.files_from_drop({
			items: [{ kind: 'file', webkitGetAsEntry: () => failing_dir }],
			files: [],
		});
		expect(files.truncated, 'a directory that failed mid-read truncates the list').toBe(true);

		content_data.fire('drop', {
			dataTransfer: { items: [{ kind: 'file', webkitGetAsEntry: () => failing_dir }], files: [] },
		});
		await settle();
		expect(shown_messages.length).toBe(1);
		expect(shown_messages[0]?.type).toBe('warning');
		expect(shown_messages[0]?.text).toContain('INCOMPLETE');
		expect(shown_messages[0]?.text).toContain('unknown number of files');
	});
});

describe('render_edit_service_upload_queue — row painting', () => {
	test('paint_row reflects status, error text and the control matrix', async () => {
		reset_page();
		const self = make_self({ allowed_extensions: ['jpg'] });
		const content_data = await render_widget(self);
		pick_files(content_data, [make_file('bad.exe')]);

		const entry = self.caller.files_data[0];
		expect(entry.status).toBe('invalid');
		const row = content_data.querySelector('.file-row');
		expect(row?.classes).toEqual(['file-row', 'row_status_invalid']);
		// The queue is DOM-free and stores the label KEY; the renderer resolves it,
		// so the raw key never reaches the curator.
		expect(row?.querySelector('.error')?.textContent).not.toBe('');
		expect(row?.querySelector('.error')?.textContent).toContain('invalid_extension');
		// invalid: nothing to retry, nothing staged — only the row delete.
		expect(row?.querySelector('.start')?.classes).toContain('hide');
		expect(row?.querySelector('.row_button_delete')?.classes).not.toContain('hide');
	});

	test('a row deleted from its own button leaves the other rows alone', async () => {
		reset_page();
		const self = make_self();
		const content_data = await render_widget(self);
		pick_files(content_data, [make_file('a.jpg'), make_file('b.jpg')]);

		const first_row = content_data.querySelectorAll('.file-row')[0];
		first_row?.querySelector('.row_button_delete')?.fire('click');
		await settle();

		expect(self.caller.files_data.map((e: { name: string }) => e.name)).toEqual(['b.jpg']);
		expect(content_data.querySelectorAll('.file-row').length).toBe(1);
	});
});
