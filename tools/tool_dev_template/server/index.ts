/**
 * tool_dev_template — the EXEMPLAR tool server module. Copy this directory (or
 * run scripts/create_tool.ts) to start a new tool. It demonstrates every part of
 * the ToolServerModule contract:
 *
 *  - apiActions in MAP form with the four permission kinds + a null-spec action;
 *  - backgroundRunnable (the second allowlist for async execution);
 *  - isAvailable (toolbar availability hook);
 *  - onRegister / onRemove (registration lifecycle hooks).
 *
 * Handlers are `(context) => Promise<ToolResponse>`; the returned envelope
 * REPLACES the API response wholesale (own your result/msg/errors). The
 * declarative permission gate runs BEFORE the handler — inside the handler you
 * can trust that the caller cleared it.
 *
 * A tool's client half lives beside this dir (js/ css/ img/); the server/ dir is
 * never statically served.
 */

import type { ToolResponse, ToolServerModule } from '../../../src/core/tools/module.ts';

/** null-spec action: listed but gated inside the handler (here: always open). */
async function status(): Promise<ToolResponse> {
	return { result: { ok: true, tool: 'tool_dev_template' }, msg: 'OK', errors: [] };
}

/** 'tipo' gate demo: level >= 1 on (section_tipo, tipo) was already asserted. */
async function readDemo(context: {
	options: Record<string, unknown>;
}): Promise<ToolResponse> {
	const { section_tipo, tipo } = context.options;
	return { result: { section_tipo, tipo, read: true }, msg: 'OK', errors: [] };
}

/** 'record' gate demo: section write perm + record-in-scope already asserted. */
async function writeDemo(context: {
	options: Record<string, unknown>;
}): Promise<ToolResponse> {
	const { section_tipo, section_id } = context.options;
	return { result: { section_tipo, section_id, written: true }, msg: 'OK', errors: [] };
}

/** background demo: allowed to run detached (see backgroundRunnable below). */
async function longJob(context: {
	options: Record<string, unknown>;
	background: boolean;
}): Promise<ToolResponse> {
	return {
		result: { started: true, ran_in_background: context.background },
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
		long_job: { permission: 'section', minLevel: 2, handler: longJob },
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
