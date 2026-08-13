/**
 * CHANGE_VALUE → REFRESH — the contract of
 *   client/dedalo/core/component_common/js/component_common.js (change_value)
 *   against the REAL client/dedalo/core/common/js/common.js (refresh)
 *
 * THE GAP THIS CLOSES. `change_value({refresh:true})` held self.status at
 * 'changing' across the whole call, while `common.refresh` REFUSES any status
 * but 'rendered' (it warns "/// destroyed fail" and returns false). So ~30 call
 * sites asked for a refresh that never happened: the value was saved and the
 * component kept rendering the old data until the page was reloaded. The cure
 * restores the real status around the refresh call only, and moves the
 * queue authority off the status string onto `self.changing` — so an
 * overlapping change_value arriving mid-refresh still queues instead of racing
 * the destroy/rebuild.
 *
 * HOW IT RUNS. Both modules are browser ES modules whose leaf imports
 * (event_manager, data_manager, ui, instances, css…) are serving-time seams
 * that need a DOM. As in test/unit/transcription_status_panel.test.ts, a
 * `Bun.plugin` `onResolve` hook redirects each leaf specifier before Bun's
 * resolver runs — here to the real, minimal stub modules in
 * test/unit/fixtures/client_module_stubs/ (a `mock.module` virtual path is NOT
 * usable for these: unlike the panel's non-existent `core/…/ui.js` seam, these
 * specifiers resolve on disk and Bun reads the redirect target, so it must be
 * a real file). `common.js` itself is NOT stubbed: refresh() is the real
 * function under test, driven against a stub instance whose
 * destroy/build/render are spies.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { plugin } from 'bun';

const REPO = '/Users/paco/Trabajos/Dedalo/v7/master_dedalo';
const COMPONENT_COMMON_PATH = `${REPO}/client/dedalo/core/component_common/js/component_common.js`;
const COMMON_PATH = `${REPO}/client/dedalo/core/common/js/common.js`;
const STUBS = `${REPO}/test/unit/fixtures/client_module_stubs`;

// ────────────────────────────────────────────────────────────────────────────
// Leaf stubs: one on-disk module per leaf specifier the two files import.
// ────────────────────────────────────────────────────────────────────────────

/** specifier suffix → stub module file */
const LEAF_STUBS: Array<[RegExp, string]> = [
	[/common\/js\/utils\/index\.js$/, `${STUBS}/utils_index.js`],
	[/common\/js\/event_manager\.js$/, `${STUBS}/event_manager.js`],
	[/common\/js\/data_manager\.js$/, `${STUBS}/data_manager.js`],
	[/common\/js\/instances\.js$/, `${STUBS}/instances.js`],
	[/common\/js\/events\.js$/, `${STUBS}/events.js`],
	[/common\/js\/ui\.js$/, `${STUBS}/ui.js`],
	[/common\/js\/render_common\.js$/, `${STUBS}/render_common.js`],
	[/page\/js\/css\.js$/, `${STUBS}/css.js`],
	[/component_common\/js\/events_subscription\.js$/, `${STUBS}/events_subscription.js`],
	[/component_common\/js\/dataframe\.js$/, `${STUBS}/dataframe.js`],
];

// The leaf specifiers are relative and never cross a 'core/' segment
// ('./events_subscription.js', '../../common/js/ui.js', '../../page/js/css.js').
// Bun plugins are PROCESS-WIDE, so every filter must exclude any specifier
// carrying a '/core/' segment — that is the shape the tool files use
// ('../../../core/common/js/ui.js') and the seam
// transcription_status_panel.test.ts redirects for itself. Without that
// exclusion this file's stubs silently hijack the tool_transcription gates when
// the suite runs them together (verified: 12 failures).
const leaf_filter = (suffix: RegExp) => new RegExp(`^(?!.*/core/)\\.{1,2}/.*${suffix.source}`);

beforeAll(() => {
	plugin({
		name: 'component-common-change-value-leaf-stubs',
		setup(build) {
			for (const [suffix, stub_path] of LEAF_STUBS) {
				build.onResolve({ filter: leaf_filter(suffix) }, () => ({ path: stub_path }));
			}
		},
	});
});

// biome-ignore lint/suspicious/noExplicitAny: the modules under test are untyped client JS.
let component_common_module: any;
// biome-ignore lint/suspicious/noExplicitAny: idem.
let common_module: any;

beforeAll(async () => {
	(globalThis as Record<string, unknown>).SHOW_DEBUG = false;
	component_common_module = await import(COMPONENT_COMMON_PATH);
	common_module = await import(COMMON_PATH);
});

// ────────────────────────────────────────────────────────────────────────────
// The stub instance: real change_value + real refresh, spied lifecycle
// ────────────────────────────────────────────────────────────────────────────

interface Calls {
	save: number;
	build: number;
	render: number;
	destroy: number;
	/** self.status as refresh() saw it, per call */
	status_at_refresh: string[];
	/** order marker of save starts/ends, to prove serialisation */
	trace: string[];
}

// biome-ignore lint/suspicious/noExplicitAny: stub instance mirrors untyped client JS.
type Instance = any;

function make_instance(status: string): { instance: Instance; calls: Calls } {
	const calls: Calls = {
		save: 0,
		build: 0,
		render: 0,
		destroy: 0,
		status_at_refresh: [],
		trace: [],
	};

	const instance: Instance = {
		model: 'component_input_text',
		id: 'test_instance',
		id_base: 'test_base',
		lang: 'lg-eng',
		standalone: true, // skips update_datum
		status,
		changing: false,
		change_value_pool: [],
		data: { entries: [], changed_data: [] },
		paginator: null,

		// real functions under test
		change_value: component_common_module.component_common.prototype.change_value,
		refresh: async function (options: Record<string, unknown> = {}) {
			calls.status_at_refresh.push(this.status);
			return common_module.common.prototype.refresh.call(this, options);
		},

		// the value-model update is not what this gate is about
		update_data_value: () => true,

		save: async (_changed_data: unknown) => {
			calls.save = calls.save + 1;
			const marker = `save_${calls.save}`;
			calls.trace.push(`${marker}_start`);
			await Promise.resolve();
			calls.trace.push(`${marker}_end`);
			return { result: true };
		},

		// lifecycle spies used by the REAL common.refresh
		destroy: async function () {
			calls.destroy = calls.destroy + 1;
			this.status = 'destroyed';
			return true;
		},
		build: async function (_autoload: boolean) {
			calls.build = calls.build + 1;
			this.status = 'built';
			return true;
		},
		render: async function (_options: Record<string, unknown>) {
			calls.render = calls.render + 1;
			this.status = 'rendered';
			return {};
		},
	};

	return { instance, calls };
}

const changed_data = () => [Object.freeze({ action: 'update', key: 0, value: 'new value' })];

let warnings: string[] = [];
const real_warn = console.warn;
beforeEach(() => {
	warnings = [];
	console.warn = (...args: unknown[]) => {
		warnings.push(args.map(String).join(' '));
	};
});
afterAll(() => {
	console.warn = real_warn;
});

// ────────────────────────────────────────────────────────────────────────────

describe('change_value({refresh:true}) — THE gap', () => {
	test('a rendered instance really rebuilds: refresh runs past its status guard', async () => {
		const { instance, calls } = make_instance('rendered');

		const api_response = await instance.change_value({
			changed_data: changed_data(),
			refresh: true,
		});

		expect(api_response).toEqual({ result: true });
		expect(calls.save, 'the value is saved').toBe(1);
		expect(calls.status_at_refresh, 'refresh must be told the truth: the DOM is rendered').toEqual([
			'rendered',
		]);
		// The proof the refusal did NOT happen: refresh got all the way to
		// destroy + build + render.
		expect(calls.destroy).toBe(1);
		expect(calls.build, 'THE assertion: the component actually rebuilt').toBe(1);
		expect(calls.render).toBe(1);
		expect(warnings.join(' ')).not.toContain('destroyed fail');
		expect(instance.status).toBe('rendered');
		expect(instance.changing, 'the in-flight flag is always released').toBe(false);
	});

	test('refresh:false still never refreshes (unchanged meaning)', async () => {
		const { instance, calls } = make_instance('rendered');

		await instance.change_value({ changed_data: changed_data(), refresh: false });

		expect(calls.save).toBe(1);
		expect(calls.status_at_refresh).toEqual([]);
		expect(calls.build).toBe(0);
	});

	test('an instance that was never rendered is still refused — no forced refresh', async () => {
		const { instance, calls } = make_instance('built'); // built, never rendered

		await instance.change_value({ changed_data: changed_data(), refresh: true });

		expect(calls.save, 'the save still happens').toBe(1);
		expect(calls.status_at_refresh, 'the real status is stated, not a fabricated one').toEqual([
			'built',
		]);
		expect(calls.destroy, 'refresh refuses a non-rendered instance').toBe(0);
		expect(calls.build).toBe(0);
		expect(warnings.join(' ')).toContain('destroyed fail');
		expect(instance.status).toBe('built');
		expect(instance.changing).toBe(false);
	});
});

describe('the queueing invariant survives the fix', () => {
	test('a change_value overlapping the SAVE is queued, not run in parallel', async () => {
		const { instance, calls } = make_instance('rendered');

		const first = instance.change_value({ changed_data: changed_data(), refresh: false });
		// second call arrives while the first is mid-save
		const second = instance.change_value({ changed_data: changed_data(), refresh: false });
		expect(instance.change_value_pool.length, 'the overlapping call was deferred').toBe(1);

		await first;
		await second;
		await Promise.resolve();
		await Promise.resolve();

		// saves never interleave
		expect(calls.trace).toEqual(['save_1_start', 'save_1_end', 'save_2_start', 'save_2_end']);
	});

	test('a change_value overlapping the REFRESH is queued too (the trap)', async () => {
		const { instance, calls } = make_instance('rendered');

		let overlapped: Promise<unknown> | null = null;
		let pool_size_during_refresh = -1;
		let saves_during_refresh = -1;
		const real_build = instance.build;
		instance.build = async function (autoload: boolean) {
			// mid-refresh: the status has been restored to 'rendered', so ONLY the
			// self.changing flag can still make an overlapping call queue.
			if (!overlapped) {
				overlapped = instance.change_value({ changed_data: changed_data(), refresh: false });
				pool_size_during_refresh = instance.change_value_pool.length;
				saves_during_refresh = calls.save;
			}
			return real_build.call(this, autoload);
		};

		await instance.change_value({ changed_data: changed_data(), refresh: true });
		await overlapped;
		await Promise.resolve();
		await Promise.resolve();

		expect(pool_size_during_refresh, 'the mid-refresh call must be deferred, never raced').toBe(1);
		expect(saves_during_refresh, 'and it must not have saved yet').toBe(1);
		expect(calls.build, 'the refresh itself ran').toBe(1);
		expect(calls.trace).toEqual(['save_1_start', 'save_1_end', 'save_2_start', 'save_2_end']);
		expect(instance.changing).toBe(false);
	});
});
