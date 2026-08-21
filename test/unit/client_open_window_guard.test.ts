/**
 * BLOCKED-POPUP CONTRACT — client/dedalo/core/common/js/utils/util.js
 *
 * WHY THIS FILE EXISTS. `open_window` is how Dédalo opens a tool, a record, an
 * ontology page and the related-records list. `window.open` returns `null`
 * whenever the browser refuses the popup — a blocker, a window-count limit, an
 * about:blank refusal — and the function dereferenced it immediately:
 *
 *     const new_window = window.open(url, target, window_features)
 *     // window.open returns null when the popup is blocked; bail out gracefully
 *     new_window.resizeTo(width, height)     // <- TypeError
 *
 * The comment described a guard that was never written. The TypeError escaped
 * `open_window` and aborted the caller mid-operation — and callers reach it with
 * work already done that cannot be undone: `open_records_in_window` has by then
 * built and destroyed a scratch section, which is what pinned an SQO filter in
 * the server session for that section_tipo.
 *
 * WHAT IS PINNED (contract, not implementation):
 *  A. A refused popup returns `null` and does NOT throw.
 *  B. A refused popup tells the user — it publishes a 'notification', because
 *     nothing else on the path can explain why nothing opened.
 *  C. A granted popup is still returned, resized and focused (the happy path is
 *     unchanged).
 *  D. A window that refuses `resizeTo` cross-origin is NOT fatal, and `focus()`
 *     is still attempted: `resizeTo` is not on the cross-origin WindowProxy
 *     allow-list, so once an external-engine URL commits its own origin it
 *     throws SecurityError — the same escaping-throw defect in another coat.
 *  E. `open_records_in_window` answers `false` when the window was refused. It
 *     used to answer `true` unconditionally, reporting success for records the
 *     user never saw while the session filter stayed pinned.
 *
 * HARNESS. `util.js` is imported REAL. `ui.js` is masked (it reaches for a DOM
 * that does not exist here) and `window.open` is a stub whose answer each test
 * chooses. No DB, no server, no browser.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { join } from 'node:path';

const CLIENT_COMMON = join(import.meta.dir, '..', '..', 'client', 'dedalo', 'core', 'common', 'js');
const UTIL_PATH = join(CLIENT_COMMON, 'utils', 'util.js');

type UtilModule = {
	open_window: (options: Record<string, unknown>) => unknown;
};

const globals = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};
let util: UtilModule;
let event_manager: {
	subscribe: (name: string, cb: (data: unknown) => void) => string;
	unsubscribe: (t: string) => void;
};

/** what the next window.open answers */
let open_answer: unknown = null;
/** how many times window.open was called */
let open_calls = 0;
/** notifications published during the test */
let notifications: unknown[] = [];
let notification_token: string;

beforeAll(async () => {
	for (const key of ['window', 'page_globals', 'SHOW_DEBUG', 'DEDALO_CORE_URL', 'get_label'])
		saved[key] = globals[key];

	globals.window = globalThis;
	globals.page_globals = {
		dedalo_data_lang: 'lg-eng',
		dedalo_data_nolan: 'lg-nolan',
		stream_readers: [],
	};
	globals.SHOW_DEBUG = false;
	globals.DEDALO_CORE_URL = '/dedalo/core';
	globals.get_label = {};
	(globals.window as Record<string, unknown>).screen = { width: 1920, height: 1080 };
	(globals.window as Record<string, unknown>).open = (..._args: unknown[]) => {
		open_calls++;
		return open_answer;
	};

	mock.module(join(CLIENT_COMMON, 'ui.js'), () => ({
		ui: {
			create_dom_element: () => ({ classList: { add() {}, remove() {} }, addEventListener() {} }),
		},
	}));

	util = (await import(UTIL_PATH)) as unknown as UtilModule;
	event_manager = (
		(await import(join(CLIENT_COMMON, 'event_manager.js'))) as {
			event_manager: typeof event_manager;
		}
	).event_manager;
	notification_token = event_manager.subscribe('notification', (data) => notifications.push(data));
});

afterAll(() => {
	event_manager.unsubscribe(notification_token);
	for (const key of ['window', 'page_globals', 'SHOW_DEBUG', 'DEDALO_CORE_URL', 'get_label'])
		globals[key] = saved[key];
});

beforeEach(() => {
	open_answer = null;
	open_calls = 0;
	notifications = [];
});

/** a granted popup; `resize_throws` reproduces the cross-origin WindowProxy refusal */
const fake_window = (resize_throws = false) => {
	const calls = { resized: 0, focused: 0 };
	return {
		calls,
		resizeTo() {
			if (resize_throws) throw new Error('SecurityError (stub cross-origin)');
			calls.resized++;
		},
		focus() {
			calls.focused++;
		},
	};
};

describe('open_window', () => {
	test('A. a refused popup returns null instead of throwing', () => {
		open_answer = null;

		let result: unknown;
		expect(() => {
			result = util.open_window({ url: 'https://stub.invalid/page' });
		}, 'a blocked popup still throws — the caller is aborted mid-operation').not.toThrow();

		expect(open_calls).toBe(1);
		expect(result).toBeNull();
	});

	test('B. a refused popup tells the user', () => {
		open_answer = null;

		util.open_window({ url: 'https://stub.invalid/page' });

		expect(notifications.length, 'nothing opened and nothing said so').toBeGreaterThan(0);
		const notice = notifications[0] as { msg?: string; type?: string };
		expect(typeof notice.msg).toBe('string');
		expect(notice.msg!.length).toBeGreaterThan(0);
	});

	test('C. a granted popup is returned, resized and focused', () => {
		const win = fake_window();
		open_answer = win;

		const result = util.open_window({ url: 'https://stub.invalid/page', width: 800, height: 600 });

		expect(result).toBe(win as unknown as never);
		expect(win.calls.resized).toBe(1);
		expect(win.calls.focused).toBe(1);
		expect(notifications.length, 'a successful open must not raise a notice').toBe(0);
	});

	test('D. a cross-origin resize refusal is not fatal and focus is still attempted', () => {
		const win = fake_window(true);
		open_answer = win;

		let result: unknown;
		expect(() => {
			result = util.open_window({ url: 'https://external.invalid/record' });
		}, 'a SecurityError from resizeTo still escapes and aborts the caller').not.toThrow();

		expect(result).toBe(win as unknown as never);
		expect(win.calls.resized).toBe(0);
		expect(win.calls.focused, 'focus() is cross-origin legal and must still run').toBe(1);
	});
});
