/**
 * BUILD-FAILURE BANNER CONTRACT — client/dedalo/core/common/js/render_api_error.js
 *
 * WHY THIS FILE EXISTS. When an element's build() answered false, render_page
 * and ts_object showed ONE fixed sentence — "Maybe your user doesn't have
 * permissions" — even when the real cause was a failed request (a dev server
 * restarting, a timeout). build_autoload had the ApiError in hand and threw it
 * away. Now it stamps `instance.build_error` and `render_build_failure` renders
 * the truth.
 *
 * WHAT IS PINNED:
 *  A. With a build_error, the banner shows that error's text, not the
 *     permission guess.
 *  B. Without one (empty context — the no-access answer), the permission hint
 *     stays.
 *  C. A transient error (retryable / transport) gets a Reload button whose click
 *     swaps the banner for the rebuilt node; a non-transient one gets none.
 *  D. build_autoload after a RECOVERED auth failure (re-login) re-sends the
 *     request once and RETURNS its answer — it used to run a nested
 *     build()+render() and still answer false, so render_page painted the
 *     "permissions" banner over a page that had loaded. It never re-builds or
 *     re-renders the instance itself, and never retries twice.
 *
 * HARNESS. render_api_error.js imported REAL; ui.js masked with a tiny fake DOM.
 */

import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { join } from 'node:path';

const CLIENT_COMMON = join(import.meta.dir, '..', '..', 'client', 'dedalo', 'core', 'common', 'js');

type FakeNode = {
	element_type: string;
	class_name?: string;
	text_content?: string;
	children: FakeNode[];
	parentNode: FakeNode | null;
	disabled?: boolean;
	listeners: Record<string, (e: unknown) => unknown>;
	addEventListener: (name: string, cb: (e: unknown) => unknown) => void;
	replaceWith: (n: unknown) => void;
	replaced_with?: unknown;
};

const globals = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};
let render_build_failure: (o: Record<string, unknown>) => FakeNode;
let ApiError: new (f: Record<string, unknown>) => object;
let build_autoload: (self: Record<string, unknown>) => Promise<unknown>;
/** what data_manager.request answers, in order */
let responses: unknown[] = [];
/** what handle_api_error reports */
let recovered = false;

const make_node = (o: Record<string, unknown>): FakeNode => {
	const node: FakeNode = {
		element_type: o.element_type as string,
		class_name: o.class_name as string | undefined,
		text_content: o.text_content as string | undefined,
		children: [],
		parentNode: null,
		listeners: {},
		addEventListener(name, cb) {
			node.listeners[name] = cb;
		},
		replaceWith(n) {
			node.replaced_with = n;
		},
	};
	const parent = o.parent as FakeNode | undefined;
	if (parent) {
		parent.children.push(node);
		node.parentNode = parent;
	}
	return node;
};

const UI_PATH = join(CLIENT_COMMON, 'ui.js');
const DATA_MANAGER_PATH = join(CLIENT_COMMON, 'data_manager.js');
const ERROR_DISPATCH_PATH = join(CLIENT_COMMON, 'error_dispatch.js');
/** The real modules, captured before they are stubbed and restored after. */
const real: Record<'ui' | 'data_manager' | 'error_dispatch', Record<string, unknown>> = {
	ui: {},
	data_manager: {},
	error_dispatch: {},
};

beforeAll(async () => {
	for (const key of ['window', 'SHOW_DEBUG', 'SHOW_DEVELOPER', 'get_label'])
		saved[key] = globals[key];
	globals.window = globalThis;
	globals.SHOW_DEBUG = false;
	globals.SHOW_DEVELOPER = false;
	globals.get_label = {};
	// SPREAD, never truncate: mock.module is process-global, so each stub keeps
	// every real export and overrides only what this file drives. The real
	// modules are captured here (after the browser globals above exist) and
	// put back in afterAll.
	real.ui = await import(UI_PATH);
	real.data_manager = await import(DATA_MANAGER_PATH);
	real.error_dispatch = await import(ERROR_DISPATCH_PATH);
	mock.module(UI_PATH, () => ({
		...real.ui,
		ui: { ...(real.ui.ui as object), create_dom_element: make_node },
	}));
	({ render_build_failure } = (await import(join(CLIENT_COMMON, 'render_api_error.js'))) as never);
	({ ApiError } = (await import(join(CLIENT_COMMON, 'api_error.js'))) as never);
	mock.module(DATA_MANAGER_PATH, () => ({
		...real.data_manager,
		data_manager: {
			...(real.data_manager.data_manager as object),
			request: async () => responses.shift(),
		},
	}));
	mock.module(ERROR_DISPATCH_PATH, () => ({
		...real.error_dispatch,
		handle_api_error: async () => ({ recovered }),
	}));
	({ build_autoload } = (await import(join(CLIENT_COMMON, 'common.js'))) as never);
});

afterAll(() => {
	// Put the real modules back for every later file in the tier, then drop the stubs.
	mock.module(UI_PATH, () => real.ui);
	mock.module(DATA_MANAGER_PATH, () => real.data_manager);
	mock.module(ERROR_DISPATCH_PATH, () => real.error_dispatch);
	mock.restore();
	for (const key of ['window', 'SHOW_DEBUG', 'SHOW_DEVELOPER', 'get_label'])
		globals[key] = saved[key];
});

const text_of = (node: FakeNode) => node.children.map((c) => c.text_content ?? '').join(' ');
const button_of = (node: FakeNode) => node.children.find((c) => c.element_type === 'button');

describe('render_build_failure', () => {
	test('A. a build_error shows its own text, not the permission guess', () => {
		const instance = {
			model: 'section',
			section_tipo: 'test3',
			build_error: new ApiError({ code: 'client.network', message: 'Network down' }),
		};
		const text = text_of(render_build_failure({ instance }));
		expect(text).toContain('Network down');
		expect(text).not.toContain('permissions');
	});

	test('B. no build_error keeps the permission hint', () => {
		const text = text_of(
			render_build_failure({ instance: { model: 'section', section_tipo: 'test3' } }),
		);
		expect(text).toContain('permissions');
		expect(text).toContain('test3');
	});

	test('C. transient error → Reload swaps in the rebuilt node', async () => {
		const rebuilt = { rebuilt: true };
		const instance = {
			model: 'section',
			build_error: new ApiError({ code: 'client.timeout', message: 'Timed out' }),
		};
		const node = render_build_failure({ instance, on_retry: async () => rebuilt });
		node.parentNode = make_node({ element_type: 'div' }); // attached
		const button = button_of(node);
		expect(button).toBeDefined();
		await button?.listeners.click?.({ stopPropagation() {} });
		expect(node.replaced_with).toBe(rebuilt);
	});

	test('C. non-transient error → no Reload button', () => {
		const instance = {
			model: 'section',
			build_error: new ApiError({
				code: 'auth.forbidden',
				message: 'No',
				retryable: false,
				category: 'permission',
			}),
		};
		expect(
			button_of(render_build_failure({ instance, on_retry: async () => null })),
		).toBeUndefined();
	});
});

describe('build_autoload after re-login', () => {
	const auth_failure = () => ({
		ok: false,
		error: new ApiError({ code: 'auth.no_session', message: 'Session expired' }),
	});
	const make_self = () => {
		const calls = { build: 0, render: 0 };
		return {
			calls,
			self: {
				model: 'section',
				rqo: {},
				build: async () => void calls.build++,
				render: async () => void calls.render++,
			} as Record<string, unknown>,
		};
	};

	test('D. recovered → re-sends once and returns the fresh answer', async () => {
		const good = { ok: true, data: { context: [{}], data: [] } };
		responses = [auth_failure(), good];
		recovered = true;
		const { self, calls } = make_self();
		expect(await build_autoload(self)).toBe(good);
		expect(self.build_error).toBeNull();
		expect(calls).toEqual({ build: 0, render: 0 });
	});

	test('D. still failing after the re-send → false, no third request', async () => {
		responses = [auth_failure(), auth_failure(), { ok: true, data: {} }];
		recovered = true;
		const { self } = make_self();
		expect(await build_autoload(self)).toBe(false);
		expect(responses.length).toBe(1);
	});

	test('D. not recovered → false with the error kept', async () => {
		responses = [auth_failure()];
		recovered = false;
		const { self } = make_self();
		expect(await build_autoload(self)).toBe(false);
		expect((self.build_error as { code: string }).code).toBe('auth.no_session');
	});
});
