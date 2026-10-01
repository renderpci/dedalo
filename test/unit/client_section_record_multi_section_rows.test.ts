/**
 * LIST ROWS OF DIFFERENT SECTIONS NEVER SHARE A CHILD INSTANCE — the contract of
 *   client/dedalo/core/section_record/js/section_record.js
 *   (get_ar_columns_instances_list → build_instance)
 *
 * WHY THIS FILE EXISTS. A multi-section list (the ontology42 autocomplete: one
 * result list over ~220 ontology sections) carries ddos whose section_tipo is an
 * ARRAY, so each column's context is matched by tipo+mode only — the FIRST
 * context the server emitted (e.g. ontology5@dd0; here zzsr0). build_instance keyed the child
 * on that context's section_tipo, and the children's id_variant omitted the
 * row's section. Rows of different sections sharing a section_id (actv0/1,
 * ad0/1, af0/1…) therefore resolved to ONE instance key: get_instance handed
 * every row the same instance, its node ended up in the LAST row, and every
 * other row rendered ", , ," (reported live, 2026-10-01).
 *
 * Pinned: each child is keyed on ITS row's section (the context's section_tipo
 * is the row's, not the first-matched one) and its id_variant names the row's
 * section, so a portal cell's descendants (the same target record in every row)
 * stay per row. `biome.jsonc` excludes `**\/client`; without this test the
 * regression is silent.
 */

import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { join } from 'node:path';

const CLIENT_CORE = join(import.meta.dir, '..', '..', 'client', 'dedalo', 'core');
const UI_PATH = join(CLIENT_CORE, 'common', 'js', 'ui.js');
const INSTANCES_PATH = join(CLIENT_CORE, 'common', 'js', 'instances.js');
const SECTION_RECORD_PATH = join(CLIENT_CORE, 'section_record', 'js', 'section_record.js');

type InstanceOptions = Record<string, unknown> & { context: Record<string, unknown> };
const built: InstanceOptions[] = [];
// biome-ignore lint/suspicious/noExplicitAny: the client module is untyped JS
let section_record: any;

const globals = globalThis as Record<string, unknown>;
const saved: Record<string, unknown> = {};

beforeAll(async () => {
	for (const key of ['SHOW_DEBUG', 'window']) saved[key] = globals[key];
	globals.SHOW_DEBUG = false;
	globals.window = globalThis;
	// ui.js imports a SERVING seam (tools_common/js/tool_common.js) with no
	// relative path on disk — mocked, as in client_tm_list_destroy_race.
	mock.module(UI_PATH, () => ({ ui: { create_dom_element: () => ({}) } }));
	// OVERRIDE, NEVER REPLACE (mock.module is process-global): spread the real
	// module, stub only get_instance to capture what each row asks for.
	const real_instances = (await import(INSTANCES_PATH)) as Record<string, unknown>;
	mock.module(INSTANCES_PATH, () => ({
		...real_instances,
		get_instance: async (options: InstanceOptions) => {
			built.push(options);
			return { ...options, build: async () => true };
		},
	}));
	({ section_record } = (await import(SECTION_RECORD_PATH)) as { section_record: unknown });
});

afterAll(() => {
	for (const key of Object.keys(saved)) {
		if (saved[key] === undefined) delete globals[key];
		else globals[key] = saved[key];
	}
	mock.restore();
});

const TARGETS = ['zzsr0', 'zzsr1', 'zzsr2'];
const ddo = {
	tipo: 'ontology5',
	model: 'component_input_text',
	parent: 'ontology42',
	mode: 'list',
	section_tipo: TARGETS,
	column_id: 'ontology5',
};
// The server emits one context per section; zzsr0's comes first (rows are zzsr1/zzsr2).
const datum = {
	context: TARGETS.map((section_tipo) => ({
		tipo: 'ontology5',
		model: 'component_input_text',
		mode: 'list',
		section_tipo,
		lang: 'lg-nolan',
	})),
	data: ['zzsr1', 'zzsr2'].map((section_tipo) => ({
		tipo: 'ontology5',
		section_tipo,
		section_id: 1,
		mode: 'list',
		entries: [{ id: 1, lang: 'lg-nolan', value: `${section_tipo} term` }],
	})),
};

function row(section_tipo: string) {
	const self = Object.create(section_record.prototype);
	Object.assign(self, {
		tipo: 'ontology42',
		section_tipo,
		section_id: 1,
		mode: 'list',
		lang: 'lg-spa',
		caller: { model: 'service_autocomplete', section_tipo: 'localontology0', section_id: 1 },
		columns_map: [{ id: 'ontology5' }],
		context: { request_config: [{ show: { ddo_map: [ddo] } }] },
		datum,
		ar_instances: [],
	});
	return self;
}

describe('section_record list rows of different sections sharing a section_id', () => {
	test('each child is keyed on its own row section, never the first-matched context', async () => {
		built.length = 0;
		await row('zzsr1').get_ar_columns_instances_list();
		await row('zzsr2').get_ar_columns_instances_list();
		expect(built).toHaveLength(2);
		expect(built.map((options) => options.section_tipo)).toEqual(['zzsr1', 'zzsr2']);
		expect(built.map((options) => options.context.section_tipo)).toEqual(['zzsr1', 'zzsr2']);
		// the row's own data reached the child
		expect(
			built.map((options) => (options.data as { entries: { value: string }[] }).entries[0]?.value),
		).toEqual(['zzsr1 term', 'zzsr2 term']);
	});

	test("the children's id_variant names the row section (descendants stay per row)", async () => {
		built.length = 0;
		await row('zzsr1').get_ar_columns_instances_list();
		await row('zzsr2').get_ar_columns_instances_list();
		const [first, second] = built.map((options) => String(options.id_variant));
		expect(first).toContain('zzsr1');
		expect(second).toContain('zzsr2');
		expect(first).not.toBe(second);
	});
});
