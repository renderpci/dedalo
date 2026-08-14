/**
 * TRANSCRIPTION STATUS PANEL — the contract of
 *   tools/tool_transcription/js/render_transcription_status.js
 *
 * THE GAP THIS CLOSES. The panel replaces a `div` whose error writer
 * (`set_error`) wrote a message into a node without ever removing its `hide`
 * class: every failure raised before a run started was invisible, and the
 * user saw only a button that stopped responding. `report()` and `fail()`
 * now un-hide unconditionally — that invariant had no automated gate because
 * the module needs a DOM to run at all. This file is that gate.
 *
 * HOW IT RUNS. The module's one import is `ui.create_dom_element` from
 * `core/common/js/ui.js` — a path that is a SERVING seam (the browser
 * resolves `/dedalo/tools/.../ui.js` through `/dedalo/` → `client/dedalo/`)
 * and does not exist as a real relative path on disk (there is no
 * `<repo>/core/` directory). A plain `mock.module` cannot intercept it
 * because Bun's static resolver fails to find the file before any mock
 * lookup runs (verified: `Cannot find module '../../../core/common/js/ui.js'`
 * even with the target mocked). A `Bun.plugin` `onResolve` hook redirects
 * the specifier to a virtual path BEFORE resolution is attempted, and
 * `mock.module` supplies that virtual path's contents — a fake
 * `create_dom_element` mirroring exactly the option keys this panel passes
 * (`element_type`, `class_name`, `parent`; see ui.js's own option list) plus
 * a `FakeNode` covering exactly the element surface the panel touches:
 * `classList` (add/remove/toggle/contains), `textContent`, `appendChild`,
 * `replaceChildren`, `addEventListener`. No DOM library added.
 */

import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { plugin } from 'bun';

const RENDER_PATH =
	'/Users/paco/Trabajos/Dedalo/v7/master_dedalo/tools/tool_transcription/js/render_transcription_status.js';

// ────────────────────────────────────────────────────────────────────────────
// A DOM stub with exactly the surface this panel touches
// ────────────────────────────────────────────────────────────────────────────

interface Listener {
	type: string;
	handler: (e: unknown) => void;
}

class FakeNode {
	tag: string;
	classes: string[] = [];
	children: FakeNode[] = [];
	parent: FakeNode | null = null;
	listeners: Listener[] = [];
	private text = '';

	constructor(tag: string) {
		this.tag = tag;
	}

	/** Mirrors real DOM: assigning .textContent replaces ALL children with one
	 * text node, so a later replaceChildren()/appendChild() clears it too — the
	 * panel relies on exactly that (clear() empties the transient line via
	 * progress_node.replaceChildren(), never a direct textContent reset). */
	get textContent() {
		return this.children.length > 0 ? this.children.map((c) => c.textContent).join('') : this.text;
	}
	set textContent(value: string) {
		this.children = [];
		this.text = value;
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
		/** Two-arg form used by the panel: `toggle('hide', force)`. */
		toggle: (name: string, force?: boolean) => {
			const want = force === undefined ? !this.classes.includes(name) : force;
			if (want) {
				if (!this.classes.includes(name)) this.classes.push(name);
			} else {
				this.classes = this.classes.filter((c) => c !== name);
			}
		},
	};

	appendChild(child: FakeNode) {
		child.parent = this;
		this.text = '';
		this.children.push(child);
		return child;
	}
	replaceChildren() {
		this.children = [];
		this.text = '';
	}
	addEventListener(type: string, handler: (e: unknown) => void) {
		this.listeners.push({ type, handler });
	}
	fire(type: string, event: Record<string, unknown> = {}) {
		const payload = { preventDefault() {}, stopPropagation() {}, ...event };
		for (const listener of [...this.listeners]) {
			if (listener.type === type) listener.handler(payload);
		}
	}

	/** Every node anywhere under this one, including itself. */
	all_nodes(): FakeNode[] {
		const out: FakeNode[] = [this];
		for (const child of this.children) out.push(...child.all_nodes());
		return out;
	}
}

/** Mirrors ui.create_dom_element's option handling for the keys this panel
 * actually passes: element_type, class_name, parent. (No text_node/inner_html
 * option is ever passed here — the panel sets .textContent directly.) */
function fake_create_dom_element(options: Record<string, unknown>): FakeNode {
	const element = new FakeNode((options.element_type as string) || 'div');
	if (options.class_name) element.className = options.class_name as string;
	if (options.parent) (options.parent as FakeNode).appendChild(element);
	return element;
}

const UI_STUB_VIRTUAL_PATH = '/virtual/tool_transcription_status__ui_stub.js';

beforeAll(() => {
	mock.module(UI_STUB_VIRTUAL_PATH, () => ({
		ui: { create_dom_element: fake_create_dom_element },
	}));
	plugin({
		name: 'transcription-status-panel-ui-stub',
		setup(build) {
			// The panel's only import: '../../../core/common/js/ui.js', which is a
			// serving-time seam with no real relative path on disk. Redirect it to
			// the mocked virtual module before Bun's resolver tries (and fails) to
			// find it on the filesystem.
			build.onResolve({ filter: /core\/common\/js\/ui\.js$/ }, () => {
				return { path: UI_STUB_VIRTUAL_PATH };
			});
		},
	});
});

// biome-ignore lint/suspicious/noExplicitAny: the module under test is untyped client JS.
let panel_module: any;

beforeAll(async () => {
	panel_module = await import(RENDER_PATH);
});

// ────────────────────────────────────────────────────────────────────────────

/** A fake tool_transcription instance: only get_tool_label is read. */
function make_self(labels: Record<string, string> = {}) {
	return {
		get_tool_label: (key: string) => labels[key],
	};
}

function make_panel(labels: Record<string, string> = {}, on_action?: (...args: unknown[]) => void) {
	const self = make_self(labels);
	const panel = panel_module.create_status_panel({ self, on_action });
	return { self, panel, node: panel.node as FakeNode };
}

const messages_of = (node: FakeNode) => node.children[2] as FakeNode; // readiness, progress, messages
const progress_of = (node: FakeNode) => node.children[1] as FakeNode;

describe('create_status_panel — the un-hide invariant (THE gap)', () => {
	test('the panel starts hidden', () => {
		const { node } = make_panel();
		expect(node.classList.contains('hide')).toBe(true);
	});

	test('fail() un-hides the panel unconditionally', () => {
		const { panel, node } = make_panel();
		expect(node.classList.contains('hide'), 'precondition: starts hidden').toBe(true);
		panel.fail('some runtime error nobody classified');
		expect(
			node.classList.contains('hide'),
			'a failure raised before a run starts must never stay behind `hide` — that was the original defect',
		).toBe(false);
	});

	test('report() un-hides the panel the same way', () => {
		const { panel, node } = make_panel();
		expect(node.classList.contains('hide')).toBe(true);
		panel.report({ message: 'a plain report' });
		expect(node.classList.contains('hide')).toBe(false);
	});

	test('a failure with an empty raw message still produces a visible, non-empty report', () => {
		// Silence is the defect: even with nothing to say, the panel must say
		// SOMETHING and show it.
		const { panel, node, self } = make_panel();
		void self;
		panel.fail('');
		expect(node.classList.contains('hide')).toBe(false);
		const messages = messages_of(node);
		expect(messages.children.length).toBe(1);
		const message_node = messages.children[0]?.children[0] as FakeNode;
		expect(message_node.textContent).not.toBe('');
	});
});

describe('create_status_panel — text, never markup (SEC-031)', () => {
	test('message/cause/action/detail land as TEXT, never parsed as HTML', () => {
		const payload = '<script>alert(1)</script>';
		const { panel, node } = make_panel();
		panel.report({
			message: payload,
			cause: payload,
			action: payload,
			action_key: 'action_ask_admin', // not pressable → renders as a sentence
			detail: payload,
		});

		// No element anywhere in the subtree was created FROM the payload: a
		// parsed <script> would appear as a node with tag 'script'.
		const all = node.all_nodes();
		expect(all.some((n) => n.tag === 'script')).toBe(false);

		const block = messages_of(node).children[0] as FakeNode;
		const message_node = block.children[0] as FakeNode;
		const cause_node = block.children[1] as FakeNode;
		const action_node = block.children[2] as FakeNode;
		const details = block.children[3] as FakeNode;
		const pre = details.children[1] as FakeNode;

		expect(message_node.textContent).toBe(payload);
		expect(cause_node.textContent).toBe(payload);
		expect(action_node.textContent).toBe(payload);
		expect(pre.textContent).toBe(payload);
	});
});

describe('create_status_panel — warnings accumulate, progress overwrites', () => {
	test('two report() calls leave two message blocks', () => {
		const { panel, node } = make_panel();
		panel.report({ message: 'first' });
		panel.report({ message: 'second' });
		expect(messages_of(node).children.length).toBe(2);
	});

	test('two progress() calls leave one line, the latest', () => {
		const { panel, node } = make_panel();
		panel.progress('10%');
		panel.progress('42%');
		const progress = progress_of(node);
		expect(progress.textContent).toBe('42%');
		expect(progress.classList.contains('hide')).toBe(false);
	});

	test('progress() does not remove standing messages', () => {
		const { panel, node } = make_panel();
		panel.report({ message: 'a warning that must survive' });
		expect(messages_of(node).children.length).toBe(1);
		panel.progress('50%');
		expect(messages_of(node).children.length).toBe(1);
		panel.progress(''); // retiring the line
		expect(messages_of(node).children.length, 'retiring progress keeps the report').toBe(1);
	});
});

describe('create_status_panel — clear()', () => {
	test('clear() drops both the transient line and the standing messages', () => {
		const { panel, node } = make_panel();
		panel.report({ message: 'a warning' });
		panel.progress('33%');
		expect(messages_of(node).children.length).toBe(1);
		expect(progress_of(node).textContent).toBe('33%');

		panel.clear();
		expect(messages_of(node).children.length).toBe(0);
		expect(progress_of(node).textContent).toBe('');
		expect(progress_of(node).classList.contains('hide')).toBe(true);
	});
});

describe('create_status_panel — label resolution', () => {
	test('a known tool label wins over the English fallback', () => {
		const { panel, node } = make_panel({
			error_model_damaged: 'MODELO DAÑADO',
		});
		panel.fail('protobuf parsing failed'); // matches the model_damaged rule
		const block = messages_of(node).children[0] as FakeNode;
		const message_node = block.children[0] as FakeNode;
		expect(message_node.textContent).toBe('MODELO DAÑADO');
	});

	test('an undefined get_tool_label falls back to the English text, never a raw key', () => {
		const { panel, node } = make_panel(); // get_tool_label returns undefined for everything
		panel.fail('protobuf parsing failed');
		const block = messages_of(node).children[0] as FakeNode;
		const message_node = block.children[0] as FakeNode;
		// Must read as English prose, not the bare label key 'error_model_damaged'.
		expect(message_node.textContent).not.toBe('error_model_damaged');
		expect(message_node.textContent.length > 0).toBe(true);
		expect(message_node.textContent).not.toContain('error_');
	});

	test('an offered remedy shows the tool label, else the English action fallback', () => {
		const { panel, node } = make_panel();
		panel.fail('failed to fetch'); // classify_failure → action_key 'action_retry'
		const block = messages_of(node).children[0] as FakeNode;
		// action_retry is PRESSABLE → rendered as a button (children[1] is the
		// button since cause is '' for the network rule's cause_key fallback
		// text, which IS non-empty — so locate by tag instead of index).
		const button = block.all_nodes().find((n) => n.tag === 'button');
		expect(button).toBeDefined();
		expect((button as FakeNode).textContent).toBe('Try again');
	});
});

afterAll(() => {
	mock.restore();
});
