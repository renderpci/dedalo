/**
 * tool_dev_template — the EXEMPLAR tool server module. Copy this directory (or
 * run `bun run scripts/create_tool.ts`) to start a new tool. It demonstrates
 * every part of the ToolServerModule contract:
 *
 *  - apiActions in MAP form with EVERY permission kind the contract defines
 *    ('section', 'section_list' + its required sectionTipos extractor, 'tipo',
 *    'record', 'developer') plus a null-spec (handler-gated) action;
 *  - backgroundRunnable (the second allowlist for async execution) and the
 *    background-only context seams `publishProgress` / `signal`;
 *  - isAvailable (toolbar availability hook);
 *  - onRegister / onRemove (registration lifecycle hooks).
 *
 * `test/unit/tool_dev_template.test.ts` pins that list MECHANICALLY: it parses
 * the permission union out of src/core/tools/module.ts and fails if a kind the
 * contract declares is not demonstrated here. An exemplar that drifts from the
 * contract propagates the drift into every scaffolded tool.
 *
 * Handlers are `(context) => Promise<ToolResponse>`; the returned envelope
 * REPLACES the API response wholesale (own your result/msg/errors). The
 * declarative permission gate runs BEFORE the handler — inside the handler you
 * can trust that the caller cleared it.
 *
 * A tool's client half lives beside this dir (js/ css/ img/); the server/ dir is
 * never statically served. The same test asserts every action the client half
 * calls through `tool_request` exists in `apiActions` below.
 */

import type {
	ToolActionContext,
	ToolResponse,
	ToolServerModule,
} from '../../../src/core/tools/module.ts';

/** null-spec action: listed but gated inside the handler (here: always open). */
async function status(): Promise<ToolResponse> {
	return { result: { ok: true, tool: 'tool_dev_template' }, msg: 'OK', errors: [] };
}

/** 'tipo' gate demo: level >= 1 on (section_tipo, tipo) was already asserted. */
async function readDemo(context: { options: Record<string, unknown> }): Promise<ToolResponse> {
	const { section_tipo, tipo } = context.options;
	return { result: { section_tipo, tipo, read: true }, msg: 'OK', errors: [] };
}

/** 'record' gate demo: section write perm + record-in-scope already asserted. */
async function writeDemo(context: { options: Record<string, unknown> }): Promise<ToolResponse> {
	const { section_tipo, section_id } = context.options;
	return { result: { section_tipo, section_id, written: true }, msg: 'OK', errors: [] };
}

/**
 * 'record_tipo' gate demo: the gate for an action targeting a COMPONENT OF A
 * RECORD. Both halves are already asserted here — level on the
 * (section_tipo, tipo) PAIR *and* the record's project scope.
 *
 * Reach for this instead of 'record' whenever the action names a component:
 * 'record' checks the SECTION level and never looks at the tipo, so a user
 * explicitly denied write on that one component would still pass. The component
 * key is `tipo`, with `component_tipo` accepted as its alias.
 */
async function componentWriteDemo(context: {
	options: Record<string, unknown>;
}): Promise<ToolResponse> {
	const { section_tipo, tipo, section_id } = context.options;
	return {
		result: { section_tipo, tipo, section_id, component_written: true },
		msg: 'OK',
		errors: [],
	};
}

/**
 * 'section_list' gate demo: a BATCH action whose targets ride INSIDE the payload
 * (here `items[].section_tipo`). The extractor lives on the SPEC, not in this
 * handler, so the per-target level check still runs before the background fork —
 * see sectionTipos below. By the time we get here every target cleared minLevel.
 */
async function batchDemo(context: ToolActionContext): Promise<ToolResponse> {
	const items = Array.isArray(context.options.items) ? context.options.items : [];
	return { result: { batch: items.length, gated: true }, msg: 'OK', errors: [] };
}

/** 'developer' gate demo: caller is a developer; no section target is asserted. */
async function developerDemo(): Promise<ToolResponse> {
	return { result: { developer: true }, msg: 'OK', errors: [] };
}

/**
 * background demo: allowed to run detached (see backgroundRunnable below), and
 * the reference for the two background-only context seams:
 *
 *  - `publishProgress` is ABSENT in a foreground call (there is no job record),
 *    so it is always called optionally. Each payload REPLACES the job frame's
 *    `data` and wakes every subscriber, and it also rewrites the pfile mirror —
 *    so a real handler throttles its own rate instead of publishing per row.
 *  - `signal` is the job's cooperative-cancellation handle. A long handler checks
 *    it at LOOP BOUNDARIES and returns a partial summary; the executor never
 *    kills work mid-write.
 *
 * The returned ToolResponse becomes the job's terminal frame `data` — that is
 * where the client reads its report from.
 */
async function longJob(context: ToolActionContext): Promise<ToolResponse> {
	const total = 3;
	let done = 0;
	for (let step = 1; step <= total; step++) {
		if (context.signal?.aborted === true) break;
		done = step;
		context.publishProgress?.({ step, total, label: `step ${step}/${total}` });
	}
	return {
		result: {
			started: true,
			ran_in_background: context.background,
			steps_done: done,
			aborted: context.signal?.aborted === true,
		},
		msg: 'OK',
		errors: [],
	};
}

export const tool: ToolServerModule = {
	name: 'tool_dev_template',
	apiActions: {
		status: { permission: null, handler: status },
		read_demo: { permission: 'tipo', minLevel: 1, handler: readDemo },
		write_demo: { permission: 'record', minLevel: 2, handler: writeDemo },
		component_write_demo: {
			permission: 'record_tipo',
			minLevel: 2,
			handler: componentWriteDemo,
		},
		long_job: { permission: 'section', minLevel: 2, handler: longJob },
		developer_demo: { permission: 'developer', handler: developerDemo },
		batch_demo: {
			permission: 'section_list',
			minLevel: 2,
			// REQUIRED for 'section_list': pull the batch's targets out of the
			// payload. Every returned value is gated at minLevel; an empty list or
			// any invalid entry is a DENIAL (fail-closed), so a malformed payload
			// can never widen the batch.
			sectionTipos: (options) =>
				(Array.isArray(options.items) ? options.items : []).map(
					(item) => (item as { section_tipo?: unknown })?.section_tipo,
				),
			handler: batchDemo,
		},
	},
	// Only long_job may be forked to the background executor.
	backgroundRunnable: ['long_job'],
	// Availability hook: hide the tool on relation-children callers (example rule).
	isAvailable: (context) => context.callerModel !== 'component_relation_children',
	// Lifecycle hooks (framework-called, never in apiActions). Failures are
	// logged, not fatal. Seed per-install config here if the tool needs it.
	onRegister: async () => {
		console.log('[tool_dev_template] registered');
	},
	onRemove: async () => {
		console.log('[tool_dev_template] removed');
	},
};
