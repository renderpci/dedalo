/**
 * COMPONENT_INFO WIDGET CLIENT — the four client contracts that make the test6883
 * `descriptors` terms reachable from an test6813 LIST row, and keep the cell alive
 * when it refreshes.
 *
 * WHY THIS FILE EXISTS. The server half of this feature is correct and
 * deliberate: `src/core/components/component_info/widgets/oh/descriptors.ts:23`
 * returns `[]` in list mode so a 50-row list never pays for a portal read plus
 * grid build per row, and the client is meant to fetch ONE cell's terms on
 * click. That fetch had never run. Four client modules carried the defects, and
 * not one of them was reachable by any existing gate:
 *   - `biome.jsonc` excludes `**\/client`, so none of them is linted or
 *     type-checked;
 *   - `client_serving.test.ts` only asserts that what is SERVED is byte-identical
 *     to what is on disk — a dead branch serves perfectly;
 *   - `bun run test:client` never drives a component_info cell in a section list.
 * Worse, three of the four defects were DOCUMENTED as prose in the very file
 * that carried them (widget_common.js's `(!)` note, component_info.js's "known
 * quirk", render_list_descriptors.js's `(!)`). AGENTS.md: an invariant is
 * tripwired or deleted. This is the tripwire; the four prose notes were
 * rewritten to the new reality by the fixes.
 *
 * WHAT IS PINNED — each one is a regression of a defect reproduced in the
 * shipped client:
 *   1. THE FETCH FIRES AT ALL. `widget_common.prototype.build(true)` gated the
 *      autoload branch on `self.caller === 'component_info'` — a comparison
 *      against the STRING — while `component_info.get_widgets` passes
 *      `caller : self`, the live instance. Strict equality was always false, so
 *      `build(true)` issued no request, `self.value` stayed `[]`, and the Terms
 *      button painted "Total 0" for ever. Pinned: an object caller issues ONE
 *      `get_widget_data` RQO whose `source` carries the CALLER's coordinates
 *      (a widget's own `tipo` is always null) and `options.widget_name` the
 *      widget's own name.
 *   2. THE ANSWER LANDS, AND THE MODE RIDES WITH IT. `response_data(api_response)` →
 *      `self.value`; `source.mode` is the widget's own `self.mode`, which the
 *      Terms button has just flipped to 'edit' (and back to 'list' on collapse —
 *      the round-trip that re-renders the button). A failed answer must leave
 *      the previous value alone.
 *   3. AN UNRESOLVABLE TIPO FAILS LOUD. Before, the string branch was the only
 *      one that could fire and it would have POSTed `{tipo:undefined,…}`, which
 *      earns an `ok:false` envelope and an empty widget — a silent failure.
 *      Pinned: no request, exactly one console.error, lifecycle still reaches
 *      'built'. Also pinned in the other direction: `section_id === 0` is a
 *      LEGAL coordinate (the guard tests null/undefined, not falsiness), and a
 *      caller that is not a component_info stays silent — the loud path must
 *      not fire for widgets that load their own data.
 *   4. THE LIST CELL SURVIVES A REFRESH. `view_default_list_info.render` never
 *      set `wrapper.content_data` and ignored `options.render_level`, unlike its
 *      edit twins and unlike EVERY other model's list view (portal, svg,
 *      section). `common.refresh` defaults to `render_level:'content'`
 *      (common.js:720) and that branch reads `self.node.content_data`; missing,
 *      it replaces the cell with `Invalid content_data DOM node [test6883]` and
 *      installs that error div as the pointer. Pinned end-to-end through the
 *      real `common.render`.
 *      (!) This is a CONTRACT conformance pin, not a reproduction of a known
 *      live trigger. The obvious candidate is not one: test6883's `properties.observe`
 *      carries only a `server` key (no `client`), so
 *      `component_common.init_events_subscription` skips it (component_common.js:509)
 *      — and that function returns false for ANY non-edit mode (:485), so no
 *      list cell of any tipo ever subscribes. What made the omission real is the
 *      render contract itself: every caller that refreshes a rendered component
 *      lands on the 'content' branch by default, and this view was the only list
 *      view unable to serve it.
 *   5. NO WIDGET IS LOST ON A SECOND RENDER. `get_widgets` `continue`d on an
 *      already-loaded widget without pushing it into `ar_promises`, while
 *      `ar_instances` is REBUILT from `ar_promises` — so the second call
 *      returned an empty set and the cell rendered nothing. Pinned: two calls,
 *      all widgets, same instances, `widgets_properties` declaration order.
 *   6. `update_data_value` PARTITIONS BY WIDGET NAME. It filtered
 *      `item.widget === widget_name && item.key === i`, where `i` is the index
 *      in `widgets_properties` — but `key` is the IPO ENTRY index WITHIN the
 *      widget (descriptors.ts `ipo.entries()`), always 0 for test6883's single-IPO
 *      widgets. `descriptors` sits at index 1, so its value was wiped to `[]` on
 *      every data update. `get_widgets` filters by name only; the two must
 *      agree, and `key` stays what the server means by it (each widget consumes
 *      it itself: render_edit_descriptors.js `self.value.filter(item=>item.key===i)`).
 *
 * HOW IT RUNS. A hand-rolled DOM stub plus a fake `ui` and a patched
 * `data_manager.request`; no network, no server, no DB. Two module mocks, both
 * MANDATORY rather than stylistic — each masks an import that cannot be
 * resolved from disk at all:
 *   - `common/js/ui.js` imports `core/tools_common/js/tool_common.js` and
 *     `lib/codex-tooltip/dist/tooltip.js`, both SERVING seams with no such
 *     relative path in the repo; `common.js` imports `ui.js` and
 *     `widget_common.js` imports `common.js`, so nothing here is importable
 *     without it. (Same reason as client_upload_queue_render.test.ts, the
 *     precedent this file follows.)
 *   - `widgets/oh/media_icons/js/render_media_icons.js` reaches for the same
 *     `tool_common.js` seam directly. Mocking the seam itself does NOT work:
 *     Bun resolves a real module's static import against disk before consulting
 *     the mock registry (verified), so the mock has to sit on the render file.
 *     The `media_icons` WIDGET CLASS stays real — its identity, name, order and
 *     value partitioning are what pins 5 and 6 measure; only its DOM painting,
 *     which no pin touches, is stubbed.
 * `data_manager` is NOT mock.module'd: the real module is imported and
 * `data_manager.request` is property-patched, then restored in afterAll (the
 * precedent's pattern) — same capture through the live ESM binding, zero
 * cross-file leak. `mock.module` IS process-global and survives
 * `mock.restore()`; the ui mock is contained the way the precedent contains it
 * (superset members, and the only other file that mocks ui.js re-registers its
 * own in beforeAll), and nothing else under test/ imports render_media_icons.js.
 *
 * FIXTURE PROVENANCE. `widgets_properties` is copied VERBATIM from
 * `src/core/components/component_info/samples/context.json` (the served test6813/test6883
 * list-mode context): media_icons then descriptors, one IPO entry each —
 * declaration order is load-bearing for pins 5 and 6. The data entries are the
 * FROZEN server contract itself, imported from
 * `test/unit/fixtures/info_widget_native/entries.golden.json` (the `oh87` case), so
 * the client is pinned against the exact bytes `info_widget_native.test.ts`
 * pins the server against. Deliberately NOT `samples/api_data.json`: that file
 * is the STORED misc shape, `{id:n, value:{…}}`-wrapped, so `item.widget` is
 * undefined there and every client filter under test would select nothing —
 * pins 5 and 6 would pass vacuously. The served entries carry `widget` at the
 * TOP level (component_info/emit.ts → normalizeWidgetEntryKeys), which is what
 * `component_info.js` selects on.
 *
 * LIMITS, stated honestly. `requestIdleCallback` is a no-op here: the widget's
 * own build+render is deferred through it by `get_content_value`, and that
 * deferred fade-in is not what these pins measure — suppressing it keeps 4 and 5
 * deterministic and the console clean. Nothing in this file proves the SERVER is
 * right; `info_widget_native.test.ts` owns that, and its golden case is
 * deliberately untouched by this change (no wire divergence, no re-pin).
 */
// Migrated to the generic `test` TLD 2026-08-19 (AGENTS.md hard rules): every
// install tipo was rewritten through src/core/test_data/test_tld_tipo_map.json;
// seed-shipped ontology (dd/rsc/hierarchy/lg) stays and is spelled through `seed()`,
// which keeps it out of the install-TLD census's `<tld><digits>` token grammar.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { join } from 'node:path';
import golden from './fixtures/info_widget_native/entries.golden.json';

/** Seed-shipped ontology, spelled out of the install-TLD census's token grammar. */
const seed = <T extends string, N extends number>(tld: T, id: N): `${T}${N}` => `${tld}${id}`;

const CLIENT_CORE = join(import.meta.dir, '..', '..', 'client', 'dedalo', 'core');
const UI_PATH = join(CLIENT_CORE, 'common', 'js', 'ui.js');
const RENDER_MEDIA_ICONS_PATH = join(
	CLIENT_CORE,
	'widgets',
	'oh',
	'media_icons',
	'js',
	'render_media_icons.js',
);
const COMPONENT_INFO_PATH = join(CLIENT_CORE, 'component_info', 'js', 'component_info.js');
const VIEW_DEFAULT_LIST_PATH = join(
	CLIENT_CORE,
	'component_info',
	'js',
	'view_default_list_info.js',
);
const DESCRIPTORS_PATH = join(CLIENT_CORE, 'widgets', 'oh', 'descriptors', 'js', 'descriptors.js');
const DATA_MANAGER_PATH = join(CLIENT_CORE, 'common', 'js', 'data_manager.js');
const EVENT_MANAGER_PATH = join(CLIENT_CORE, 'common', 'js', 'event_manager.js');

// ────────────────────────────────────────────────────────────────────────────
// A DOM stub with exactly the surface these renderers touch
// ────────────────────────────────────────────────────────────────────────────

class FakeNode {
	tag: string;
	classes: string[] = [];
	children: FakeNode[] = [];
	parent: FakeNode | null = null;
	listeners: { type: string; handler: (e: unknown) => void }[] = [];
	style: Record<string, string> & { setProperty: (k: string, v: string) => void };
	textContent = '';
	html = '';
	id = '';
	title = '';
	// common.js checks nodeType before replacing a node in the 'full' branch.
	nodeType = 1;
	offsetHeight = 0;
	// The pointer view_default_list_info must expose (pin 4).
	content_data: FakeNode | null = null;

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
	/** The in-place cell swap common.render's 'content' branch performs. */
	replaceWith(node: FakeNode) {
		if (!this.parent) return;
		const index = this.parent.children.indexOf(this);
		if (index === -1) return;
		node.parent = this.parent;
		this.parent.children[index] = node;
		this.parent = null;
	}

	/** Descendants matching a single `.class` / `tag` selector. Depth-first. */
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

	addEventListener(type: string, handler: (e: unknown) => void) {
		this.listeners.push({ type, handler });
	}
	removeEventListener(type: string, handler: (e: unknown) => void) {
		const index = this.listeners.findIndex((l) => l.type === type && l.handler === handler);
		if (index !== -1) this.listeners.splice(index, 1);
	}
}

/** Mirrors ui.create_dom_element's option handling (the subset reached here). */
function fake_create_dom_element(options: Record<string, unknown>) {
	const element = new FakeNode((options.element_type as string) || 'div');
	if (options.id) element.id = options.id as string;
	if (options.class_name) element.className = options.class_name as string;
	if (options.style) {
		for (const [key, value] of Object.entries(options.style as Record<string, string>)) {
			element.style.setProperty(key, value);
		}
	}
	const has_text = (c: unknown) => c !== undefined && c !== null && c !== '';
	if (has_text(options.inner_html))
		element.insertAdjacentHTML('afterbegin', String(options.inner_html));
	else if (has_text(options.text_content)) element.textContent = String(options.text_content);
	if (options.parent) (options.parent as FakeNode).appendChild(element);
	return element;
}

/**
 * The `ui` members these modules reach for, mirroring the real factories'
 * class output (ui.js build_content_data :381, build_wrapper_list :490).
 * `show_message` is carried as a containment superset: it is the only other
 * member client_upload_queue_render.test.ts's module uses, so that file still
 * runs if this registration is the surviving one.
 */
// biome-ignore lint/suspicious/noExplicitAny: untyped client instances.
const fake_ui: any = {
	create_dom_element: fake_create_dom_element,
	activate_tooltips: () => {},
	show_message: () => {},
	component: {
		build_content_data: (instance: { type: string }) => {
			const node = new FakeNode('div');
			node.className = ['content_data', instance.type].join(' ');
			return node;
		},
		build_wrapper_list: (instance: {
			type: string;
			model: string;
			tipo: string;
			section_tipo: string;
			view?: string;
			context: { view?: string | null };
		}) => {
			const node = new FakeNode('div');
			const view = instance.view || instance.context.view || 'default';
			node.className = [
				`wrapper_${instance.type}`,
				instance.model,
				instance.tipo,
				`${instance.section_tipo}_${instance.tipo}`,
				'list',
				`view_${view}`,
			].join(' ');
			return node;
		},
	},
	widget: {
		build_wrapper_list: () => new FakeNode('div'),
		build_wrapper_edit: () => new FakeNode('div'),
	},
};

// ────────────────────────────────────────────────────────────────────────────
// Fixture: the served test6813/test6883 list-mode context + the frozen entries golden
// ────────────────────────────────────────────────────────────────────────────

/** VERBATIM from src/core/components/component_info/samples/context.json. */
const WIDGETS_PROPERTIES = [
	{
		ipo: [
			{
				input: {
					type: 'component_data',
					paths: [
						[{ var_name: 'av', section_tipo: seed('rsc', 167), component_tipo: seed('rsc', 35) }],
					],
					source: [{ section_id: 'current', section_tipo: 'current', component_tipo: 'test6837' }],
				},
				output: [
					{ id: 'id', label: 'id', value: 'link' },
					{ id: 'tc', label: 'tc', value: 'text' },
					{
						id: 'transcription',
						label: 'tool_transcription',
						value: 'link',
						process_section_tipo: 'test6877',
					},
					{
						id: 'indexation',
						label: 'tool_indexation',
						value: 'link',
						process_section_tipo: 'test6879',
					},
					{
						id: 'translation',
						label: 'tool_lang',
						value: 'link',
						process_section_tipo: 'test6881',
					},
				],
				process: null,
			},
		],
		path: '/oh/media_icons',
		widget_name: 'media_icons',
	},
	{
		ipo: [
			{
				input: {
					type: 'component_data',
					paths: [
						[
							{
								var_name: 'indexation',
								section_tipo: seed('rsc', 167),
								component_tipo: seed('rsc', 860),
							},
						],
					],
					source: [{ section_id: 'current', section_tipo: 'current', component_tipo: 'test6837' }],
				},
				output: [
					{ id: 'indexation', label: 'digitization', value: 'int' },
					{ id: 'terms', label: 'descriptors', value: 'text' },
				],
				process: null,
			},
		],
		path: '/oh/descriptors',
		widget_name: 'descriptors',
	},
];

/**
 * The served entries, byte-exact from the frozen golden. Its CASE KEY is a
 * fixture LABEL, not an ontology binding, and `info_widget_native.test.ts` (a
 * different gate) reads the same key — so it is not renamed here; it is only
 * spelled so the install-TLD census reads no `<tld><digits>` token in THIS
 * file (the fixture tree itself is outside the census).
 */
const GOLDEN_CASE = `oh${87}`;
const info_golden = (golden.cases as Record<string, { list: unknown[][]; edit: unknown[][] }>)[
	GOLDEN_CASE
] as { list: unknown[][]; edit: unknown[][] };
const LIST_ENTRIES = info_golden.list[0] as Record<string, unknown>[];
const EDIT_ENTRIES = info_golden.edit[0] as Record<string, unknown>[];
const DESCRIPTORS_ENTRIES = EDIT_ENTRIES.filter((item) => item.widget === 'descriptors');
const MEDIA_ICONS_ENTRIES = EDIT_ENTRIES.filter((item) => item.widget === 'media_icons');

const SECTION_TIPO = 'test6813';
const SECTION_ID = 3;
const TIPO = 'test6883';

function make_context(overrides: Record<string, unknown> = {}) {
	return {
		typo: 'ddo',
		type: 'component',
		model: 'component_info',
		tipo: TIPO,
		section_tipo: SECTION_TIPO,
		lang: 'lg-nolan',
		mode: 'list',
		view: null,
		css: null,
		permissions: 3,
		properties: {
			widgets: WIDGETS_PROPERTIES,
			show_in_modes: ['list', 'edit'],
			mode: 'list',
		},
		...overrides,
	};
}

// ────────────────────────────────────────────────────────────────────────────

const globals = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};
let fake_document: FakeNode;
// biome-ignore lint/suspicious/noExplicitAny: the modules under test are untyped client JS.
let component_info_module: any;
// biome-ignore lint/suspicious/noExplicitAny: ditto.
let view_default_list_info: any;
// biome-ignore lint/suspicious/noExplicitAny: ditto.
let descriptors_module: any;
// biome-ignore lint/suspicious/noExplicitAny: ditto.
let event_manager: any;
// biome-ignore lint/suspicious/noExplicitAny: ditto.
let data_manager: any;
let original_request: unknown;

/** Every RQO the client posted, and the answer the next one gets. */
const api_calls: Record<string, unknown>[] = [];
let api_response: unknown = { ok: true, request_id: 'zzwidget', data: null };
/** console.error calls captured while a test runs (fail-loud is pin 3). */
let console_errors: unknown[][] = [];
let original_console_error: typeof console.error;

beforeAll(async () => {
	for (const key of [
		'document',
		'window',
		'page_globals',
		'get_label',
		'SHOW_DEBUG',
		'Node',
		'DEDALO_CORE_URL',
		'DEDALO_API_URL',
		'requestIdleCallback',
		'requestAnimationFrame',
	]) {
		saved[key] = globals[key];
	}

	fake_document = new FakeNode('#document');
	(fake_document as unknown as Record<string, unknown>).createElement = (tag: string) =>
		new FakeNode(tag);
	(fake_document as unknown as Record<string, unknown>).body = new FakeNode('body');
	globals.document = fake_document;
	globals.window = globalThis;
	globals.page_globals = { csrf_token: 'TOK', api_errors: [] };
	(globals.window as Record<string, unknown>).page_globals = globals.page_globals;
	globals.get_label = {};
	globals.SHOW_DEBUG = false;
	globals.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
	globals.DEDALO_CORE_URL = '/dedalo/core';
	globals.DEDALO_API_URL = '/api/v1/json/';
	// (!) Deliberate no-op — see the header's LIMITS paragraph. The widget's own
	// deferred build+render is not what these pins measure.
	globals.requestIdleCallback = () => 0;
	globals.requestAnimationFrame = () => 0;

	// (!) Both mocks are the ONLY way the modules under test can be imported at
	// all — see the header's HOW IT RUNS paragraph.
	mock.module(UI_PATH, () => ({ ui: fake_ui }));
	mock.module(RENDER_MEDIA_ICONS_PATH, () => {
		// A prototype carrier: media_icons.js reads render_media_icons.prototype.
		// biome-ignore lint/complexity/useArrowFunction: an arrow function has no prototype.
		const render_media_icons = function () {
			return true;
		};
		render_media_icons.prototype.edit = async () => new FakeNode('div');
		render_media_icons.prototype.list = async () => new FakeNode('div');
		return { render_media_icons };
	});

	component_info_module = await import(COMPONENT_INFO_PATH);
	view_default_list_info = (await import(VIEW_DEFAULT_LIST_PATH)).view_default_list_info;
	descriptors_module = await import(DESCRIPTORS_PATH);
	event_manager = (await import(EVENT_MANAGER_PATH)).event_manager;

	data_manager = (await import(DATA_MANAGER_PATH)).data_manager;
	original_request = data_manager.request;
	data_manager.request = async (options: { body: Record<string, unknown> }) => {
		api_calls.push(options.body);
		return api_response;
	};
});

afterAll(async () => {
	// (!) DRAIN BEFORE RESTORING. render_edit_component_info.get_content_value
	// defers each widget's own build+render through `setTimeout(…, 5)` →
	// dd_request_idle_callback, and dd_request_idle_callback dereferences the
	// bare global `window` (events.js). Restoring the globals synchronously
	// leaves those timers armed with no `window`, so they throw a ReferenceError
	// in a timer callback AFTER this file is done — an unhandled error that bun
	// attributes to whatever file is running next and that aborts it. Let the
	// timers land first (the stubbed requestIdleCallback is a no-op, so they
	// schedule nothing further), THEN restore.
	await new Promise((resolve) => setTimeout(resolve, 50));

	data_manager.request = original_request;
	for (const [key, value] of Object.entries(saved)) {
		if (value === undefined) delete globals[key];
		else globals[key] = value;
	}
});

beforeEach(() => {
	api_calls.length = 0;
	api_response = { ok: true, request_id: 'zzwidget', data: null };
	console_errors = [];
	original_console_error = console.error;
	console.error = (...args: unknown[]) => {
		console_errors.push(args);
	};
});

afterEach(() => {
	console.error = original_console_error;
});

/** A component_info instance with the served test6883 context, ready to render. */
// biome-ignore lint/suspicious/noExplicitAny: untyped client instance.
function make_component_info(overrides: Record<string, unknown> = {}): any {
	const instance = new component_info_module.component_info();
	Object.assign(instance, {
		id: `component_info_${TIPO}_${SECTION_TIPO}_${SECTION_ID}_lg-nolan`,
		model: 'component_info',
		type: 'component',
		tipo: TIPO,
		section_tipo: SECTION_TIPO,
		section_id: SECTION_ID,
		lang: 'lg-nolan',
		mode: 'list',
		permissions: 3,
		status: 'built',
		context: make_context(),
		data: { entries: EDIT_ENTRIES, datalist: [] },
		ar_instances: [],
		events_tokens: [],
		node: null,
		...overrides,
	});
	return instance;
}

/** A real `descriptors` widget, initialised exactly as get_widgets does. */
// biome-ignore lint/suspicious/noExplicitAny: untyped client instance.
async function make_descriptors_widget(options: Record<string, unknown> = {}): Promise<any> {
	const widget = new descriptors_module.descriptors();
	const widget_properties = WIDGETS_PROPERTIES[1] as Record<string, unknown>;
	await widget.init({
		id: `component_info_${TIPO}_${SECTION_TIPO}_${SECTION_ID}_lg-nolan_descriptors`,
		section_tipo: SECTION_TIPO,
		section_id: SECTION_ID,
		lang: 'lg-nolan',
		mode: 'edit',
		model: 'widget',
		value: [],
		datalist: [],
		ipo: widget_properties.ipo,
		name: 'descriptors',
		properties: widget_properties,
		caller: null,
		...options,
	});
	return widget;
}

// ────────────────────────────────────────────────────────────────────────────

describe('widget_common.build — the component_info on-demand widget load', () => {
	test('an object caller issues the get_widget_data RQO with the CALLER coordinates', async () => {
		const caller = make_component_info();
		const widget = await make_descriptors_widget({ caller: caller, mode: 'edit' });
		api_response = { ok: true, request_id: 'zzwidget', data: DESCRIPTORS_ENTRIES };

		const built = await widget.build(true);

		// The whole bug in one assertion: `self.caller === 'component_info'`
		// compared the LIVE instance against a string, so nothing was ever sent.
		expect(api_calls.length, 'exactly one get_widget_data round-trip').toBe(1);
		expect(built).toBe(true);
		expect(widget.status).toBe('built');
		const rqo = api_calls[0] as Record<string, unknown>;
		expect(rqo.action).toBe('get_widget_data');
		expect(rqo.dd_api).toBe('dd_component_info');
		// A widget's own tipo is always null (widget_common.init), so every
		// coordinate but its NAME has to come off the caller.
		expect(rqo.source).toEqual({
			tipo: TIPO,
			section_tipo: SECTION_TIPO,
			section_id: SECTION_ID,
			mode: 'edit',
		});
		expect(rqo.options).toEqual({ widget_name: 'descriptors' });
		expect(console_errors.length).toBe(0);
	});

	test('the result lands in self.value and the mode rides from the widget', async () => {
		const caller = make_component_info();
		const widget = await make_descriptors_widget({ caller: caller, mode: 'edit' });
		api_response = { ok: true, request_id: 'zzwidget', data: DESCRIPTORS_ENTRIES };

		await widget.build(true);

		// This is what render_edit_descriptors paints: the indexation count and
		// the terms grid. Without it the Terms button showed "Total 0" for ever.
		expect(widget.value).toEqual(DESCRIPTORS_ENTRIES);
		expect(widget.value.map((item: { widget_id: string }) => item.widget_id)).toEqual([
			'indexation',
			'terms',
		]);

		// The collapse half of the round-trip: the button sets mode back to
		// 'list' and refreshes, the server answers [] (descriptors.ts:23) and the
		// list renderer paints the button again.
		const collapsing = await make_descriptors_widget({ caller: caller, mode: 'list' });
		api_response = { ok: true, request_id: 'zzwidget', data: [] };
		await collapsing.build(true);
		expect((api_calls[1] as { source: { mode: string } }).source.mode).toBe('list');

		// A failed answer (ok:false, no data) must not blank a value already on screen.
		const keeper = await make_descriptors_widget({
			caller: caller,
			mode: 'edit',
			value: DESCRIPTORS_ENTRIES,
		});
		api_response = {
			ok: false,
			request_id: 'zzwidget',
			error: {
				code: 'internal.unexpected',
				category: 'internal',
				message: 'x',
				label_key: 'k',
				retryable: false,
			},
		};
		await keeper.build(true);
		expect(keeper.value).toEqual(DESCRIPTORS_ENTRIES);
	});

	test('an unresolvable tipo fails loud: no request, one console.error', async () => {
		// The caller IS a component_info but carries no tipo. Sending empty
		// coordinates earns an ok:false envelope and an empty widget — the
		// silent failure this path is not allowed to have any more.
		const widget = await make_descriptors_widget({
			caller: { model: 'component_info', tipo: null, section_tipo: SECTION_TIPO, section_id: 1 },
			mode: 'edit',
		});
		const built = await widget.build(true);

		expect(api_calls.length, 'never POST empty coordinates').toBe(0);
		expect(console_errors.length).toBe(1);
		expect(widget.value).toEqual([]);
		// Failing loud must not wedge the lifecycle.
		expect(built).toBe(true);
		expect(widget.status).toBe('built');

		// The legacy STRING caller takes the same loud path: a widget's own tipo
		// is always null, so it can never resolve the component_info anchor.
		const legacy = await make_descriptors_widget({ caller: 'component_info', mode: 'edit' });
		await legacy.build(true);
		expect(api_calls.length).toBe(0);
		expect(console_errors.length).toBe(2);
	});

	test('section_id 0 is a legal coordinate, and a non-info caller stays silent', async () => {
		// The guard tests null/undefined, NOT falsiness — record id 0 must fetch.
		const caller = make_component_info({ section_id: 0 });
		const widget = await make_descriptors_widget({
			caller: caller,
			section_id: 0,
			mode: 'edit',
		});
		api_response = { ok: true, request_id: 'zzwidget', data: DESCRIPTORS_ENTRIES };
		await widget.build(true);
		expect(api_calls.length).toBe(1);
		expect((api_calls[0] as { source: { section_id: number } }).source.section_id).toBe(0);
		expect(console_errors.length).toBe(0);

		// Widgets hosted by anything else load their own data by overriding
		// build(); the fail-loud branch must not fire for them.
		const foreign = await make_descriptors_widget({
			caller: { model: 'component_portal', tipo: 'test6837' },
			mode: 'edit',
		});
		await foreign.build(true);
		expect(api_calls.length).toBe(1);
		expect(console_errors.length).toBe(0);
	});
});

describe('view_default_list_info.render — the list cell refresh contract', () => {
	test('the wrapper exposes content_data, and render_level content returns it bare', async () => {
		const self = make_component_info({ data: { entries: LIST_ENTRIES, datalist: [] } });

		const wrapper = await view_default_list_info.render(self, {});
		expect(wrapper.classes).toEqual([
			'wrapper_component',
			'component_info',
			TIPO,
			`${SECTION_TIPO}_${TIPO}`,
			'list',
			'view_default',
		]);
		// The pointer common.render's 'content' branch dereferences. Without it
		// the cell was replaced by 'Invalid content_data DOM node [test6883]'.
		expect(wrapper.content_data).toBe(wrapper.children[0]);
		expect(wrapper.content_data.classes).toContain('content_data');

		// The refresh path asks for the inner node only — a wrapper here would be
		// nested inside the previous wrapper on every refresh.
		const content = await view_default_list_info.render(self, { render_level: 'content' });
		expect(content.classes[0]).toBe('content_data');
		expect(content.classes).not.toContain('wrapper_component');
	});

	test('a content-level re-render swaps the cell in place through common.render', async () => {
		// common.refresh's default render_level is 'content' (common.js:720), so
		// every caller that refreshes a rendered list cell arrives here.
		const self = make_component_info({ data: { entries: LIST_ENTRIES, datalist: [] } });

		const wrapper = await self.render({ render_level: 'full' });
		fake_document.appendChild(wrapper);
		const first_content = wrapper.content_data;
		expect(first_content).not.toBeNull();

		const result = await self.render({ render_level: 'content' });

		expect(console_errors, 'no Invalid content_data DOM node notice').toEqual([]);
		expect(result).toBe(wrapper);
		expect(wrapper.content_data).not.toBe(first_content);
		expect(wrapper.content_data.classes).toContain('content_data');
		expect(wrapper.content_data.classes).not.toContain('no_access');
		// Swapped in place: the wrapper still holds exactly one child, the new one.
		expect(wrapper.children.length).toBe(1);
		expect(wrapper.children[0]).toBe(wrapper.content_data);
	});
});

describe('component_info.get_widgets — every declared widget, every time', () => {
	test('a second call returns ALL widgets, in widgets_properties declaration order', async () => {
		const self = make_component_info();

		const first = await self.get_widgets();
		expect(first.map((widget: { name: string }) => widget.name)).toEqual([
			'media_icons',
			'descriptors',
		]);

		// The regression: the reuse branch `continue`d without collecting the
		// instance, while ar_instances is REBUILT from ar_promises — so the
		// second render produced an empty cell.
		const second = await self.get_widgets();
		expect(second.length).toBe(2);
		expect(second.map((widget: { name: string }) => widget.name)).toEqual([
			'media_icons',
			'descriptors',
		]);
		expect(second[0]).toBe(first[0]);
		expect(second[1]).toBe(first[1]);
		expect(self.ar_instances).toBe(second);
		expect(second.map((widget: { id: string }) => widget.id)).toEqual([
			`${self.id}_media_icons`,
			`${self.id}_descriptors`,
		]);

		// Re-use is the feature being preserved: the values are refreshed in
		// place from the current data, not re-imported.
		self.data.entries = LIST_ENTRIES;
		const third = await self.get_widgets();
		expect(third[0]).toBe(first[0]);
		expect(third[0].value).toEqual(LIST_ENTRIES);
		expect(third[1].value).toEqual([]);
	});
});

describe('component_info.update_data_value — partition by widget name', () => {
	test('a descriptors item reaches the descriptors instance at widgets_properties[1]', async () => {
		const self = make_component_info({ data: { entries: LIST_ENTRIES, datalist: [] } });
		const [media_icons_widget, descriptors_widget] = await self.get_widgets();
		expect(self.context.properties.widgets[1].widget_name).toBe('descriptors');

		const published: Record<string, unknown[]> = {};
		const tokens = [
			event_manager.subscribe(
				`update_widget_value_0_${self.id}_media_icons`,
				(value: unknown[]) => {
					published.media_icons = value;
				},
			),
			event_manager.subscribe(
				`update_widget_value_1_${self.id}_descriptors`,
				(value: unknown[]) => {
					published.descriptors = value;
				},
			),
		];

		// The bulk path a save/observe cycle takes (component_common:1133).
		const result = self.update_data_value({ action: 'set_data', value: EDIT_ENTRIES });
		event_manager.unsubscribe(tokens);

		expect(result).toBe(true);
		// The regression: the filter also required `item.key === i`, but `key` is
		// the IPO ENTRY index inside the widget (always 0 for test6883's single-IPO
		// widgets) — `0 === 1` is false, so descriptors was wiped to [] on every
		// data update, and media_icons (no key at all) with it.
		expect(descriptors_widget.value).toEqual(DESCRIPTORS_ENTRIES);
		expect(
			descriptors_widget.value.map((item: { widget_id: string; key: number }) => [
				item.widget_id,
				item.key,
			]),
		).toEqual([
			['indexation', 0],
			['terms', 0],
		]);
		expect(media_icons_widget.value).toEqual(MEDIA_ICONS_ENTRIES);

		// The event each widget UI listens on carries the same slice.
		expect(published.descriptors).toEqual(DESCRIPTORS_ENTRIES);
		expect(published.media_icons).toEqual(MEDIA_ICONS_ENTRIES);
	});
});
