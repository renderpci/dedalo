/**
 * SHOW_INTERFACE OWNERSHIP CONTRACT — client/dedalo/core/common/js/common.js
 *
 * WHY THIS FILE EXISTS. `set_context_vars(self)` builds `self.show_interface`
 * by merging the component's override over `default_show_interface`. The merge
 * used to keep the override BY REFERENCE and then write the missing default
 * keys straight into it — so the object handed to the instance WAS the
 * `context.properties.show_interface` (or `request_config_object.show.interface`)
 * it came from. Several render paths write flags into `self.show_interface`
 * (`view_indexation_edit_portal.js` forces `button_delete_link_and_record`
 * false; portal/text_area/select do the same for other flags), which silently
 * edited the source config for every later consumer of that same object.
 *
 * WHAT IS PINNED (contract, not implementation):
 *  A. `show_interface` is instance-owned: writing a flag on it does NOT touch
 *     `context.properties.show_interface`.
 *  B. Same for the `request_config_object.show.interface` branch.
 *  C. Filling the missing defaults does NOT add keys to the source object.
 *  D. The override still wins over the default, and every default key is
 *     present on the result (callers rely on `=== true` checks).
 *  E. Two instances built with no override do not share one object.
 *
 * HARNESS. `common.js` is imported REAL; its DOM/network-touching siblings are
 * masked. No DB, no server, no browser.
 */

import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { join } from 'node:path';

const CLIENT_COMMON = join(import.meta.dir, '..', '..', 'client', 'dedalo', 'core', 'common', 'js');
const COMMON_PATH = join(CLIENT_COMMON, 'common.js');

type SetContextVars = (self: Record<string, any>) => void;

const globals = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};
let set_context_vars: SetContextVars;

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

	mock.module(join(CLIENT_COMMON, 'ui.js'), () => ({
		ui: {
			create_dom_element: () => ({ classList: { add() {}, remove() {} }, addEventListener() {} }),
		},
	}));
	mock.module(
		join(import.meta.dir, '..', '..', 'client', 'dedalo', 'core', 'page', 'js', 'css.js'),
		() => ({
			get_inserted_rules: () => [],
		}),
	);

	set_context_vars = ((await import(COMMON_PATH)) as { set_context_vars: SetContextVars })
		.set_context_vars;
});

afterAll(() => {
	for (const key of ['window', 'page_globals', 'SHOW_DEBUG', 'DEDALO_CORE_URL', 'get_label'])
		globals[key] = saved[key];
});

/** the minimum `self` shape set_context_vars touches */
const fake_self = (
	context: Record<string, unknown> = {},
	request_config_object?: Record<string, unknown>,
): Record<string, any> => ({
	id: 'ddo_test',
	context: {
		type: 'component',
		model: 'component_input_text',
		tipo: 'test1',
		permissions: 2,
		...context,
	},
	request_config_object,
});

describe('show_interface ownership', () => {
	test('A. a context override is cloned, not aliased', () => {
		const source = { button_add: true, tools: true };
		const self = fake_self({ properties: { show_interface: source } });

		set_context_vars(self);

		expect(self.show_interface).not.toBe(source);
		self.show_interface.button_add = false;
		expect(source.button_add).toBe(true);
	});

	test('B. a request_config_object override is cloned, not aliased', () => {
		const source = { button_delete_link_and_record: true };
		const self = fake_self({ properties: {} }, { show: { interface: source } });

		set_context_vars(self);

		expect(self.show_interface).not.toBe(source);
		self.show_interface.button_delete_link_and_record = false;
		expect(source.button_delete_link_and_record).toBe(true);
	});

	test('C. filling the defaults does not add keys to the source', () => {
		const source: Record<string, unknown> = { button_add: false };
		const self = fake_self({ properties: { show_interface: source } });

		set_context_vars(self);

		expect(Object.keys(source)).toEqual(['button_add']);
		expect(source.tools).toBeUndefined();
	});

	test('D. the override wins and every default key is present', () => {
		const self = fake_self({ properties: { show_interface: { button_add: false } } });

		set_context_vars(self);

		expect(self.show_interface.button_add).toBe(false); // override wins
		expect(self.show_interface.tools).toBe(true); // default filled
		expect(self.show_interface.button_delete).toBe(true);
		expect(self.show_interface.read_only).toBe(false);
		expect(self.show_interface.button_edit_options.action_mousedown).toBe('navigate');
	});

	test('E. two default instances do not share one object', () => {
		const a = fake_self();
		const b = fake_self();

		set_context_vars(a);
		set_context_vars(b);

		expect(a.show_interface).not.toBe(b.show_interface);
		a.show_interface.button_add = false;
		expect(b.show_interface.button_add).toBe(true);
	});
});
