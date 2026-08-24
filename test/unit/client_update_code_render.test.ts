/**
 * client_update_code_render — the update_code widget's client contract
 * (DEC-12 gate; model: client_update_ontology_tlds_input.test.ts).
 *
 * WHAT WENT WRONG WITHOUT THIS GATE (all real, measured 2026-08-23):
 *   - the info modal's header read `versions_info.info.entity_label`, a field
 *     the server never sends → every modal opened with a BLANK header;
 *   - a "Beta updates" checkbox filtered rows whose version === 'development',
 *     a value the TS manifest never emits → a dead control;
 *   - `alert()` / `confirm()` blocked the renderer (one blocking dialog freezes
 *     CDP and every headless run);
 *   - radios minted document-wide numeric ids (`id="1"`) and version strings
 *     were injected into class tokens (`file_container 6.4.1` → two classes,
 *     one of them `6.4.1` — an invalid selector token);
 *   - `use_worker: true` in the model layer was INERT: nothing in client/
 *     reads it, while its JSDoc claimed a web worker;
 *   - the IndexedDB resume path read a key nothing wrote — dead code that this
 *     rewrite makes LIVE (render_stream persists it) and therefore load-bearing.
 *
 * TWO LAYERS:
 *   1. source-shape assertions over the widget's js (no DOM);
 *   2. the pure phase reducer (update_code_phases.js — dependency-free by
 *      design, so it imports directly) driven through the real sequences:
 *      download → … → restart → interrupted must transition to health polling,
 *      a PRE-swap interrupt is INDETERMINATE ('interrupted', no polling) —
 *      only a frame reporting a failed phase may say failed.
 *
 * Honest limit: layer 1 proves wiring shape, not rendered behaviour — the
 * browser suite (client/dedalo/test/client/js/test_update_code.js) covers the
 * rendered panel and the cross-widget bleed end to end.
 *
 * DB-less, network-less → hermetic tier.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WIDGET_DIR = join(
	import.meta.dir,
	'..',
	'..',
	'client/dedalo/core/area_maintenance/widgets/update_code',
);
const render_src = readFileSync(join(WIDGET_DIR, 'js/render_update_code.js'), 'utf8');
const model_src = readFileSync(join(WIDGET_DIR, 'js/update_code.js'), 'utf8');
const css_src = readFileSync(join(WIDGET_DIR, 'css/update_code.less'), 'utf8');
const COMMON_DIR = join(import.meta.dir, '..', '..', 'client/dedalo/core/common/js');
const common_src = readFileSync(join(COMMON_DIR, 'common.js'), 'utf8');
const render_common_src = readFileSync(join(COMMON_DIR, 'render_common.js'), 'utf8');
const master_labels = JSON.parse(
	readFileSync(join(import.meta.dir, '../../src/core/labels/master.json'), 'utf8'),
) as Record<string, string>;

import {
	apply_phase_frame,
	init_phase_state,
	resolve_final_frame,
	resolve_health_outcome,
	UPDATE_PHASES,
} from '../../client/dedalo/core/area_maintenance/widgets/update_code/js/update_code_phases.js';

describe('update_code source shape', () => {
	test('no blocking dialogs: every confirm is ui.confirm, no alert at all', () => {
		for (const [name, src] of [
			['render_update_code.js', render_src],
			['update_code.js', model_src],
		] as const) {
			expect(/\balert\s*\(/.test(src), `${name} must not call alert()`).toBe(false);
			// every `confirm(` occurrence must be `ui.confirm(`
			const confirm_calls = src.match(/[\w.]*confirm\s*\(/g) ?? [];
			for (const call of confirm_calls) {
				expect(call.startsWith('ui.confirm'), `${name}: '${call}' must be ui.confirm(`).toBe(true);
			}
		}
		expect(render_src).toContain('ui.confirm(');
	});

	test('the dead surfaces stay dead', () => {
		// beta/'development' branch, incremental mode, numeric radio ids, the
		// ignored staging path, the inert worker flag
		expect(render_src.includes("'development' &&")).toBe(false);
		expect(render_src.includes('beta_update')).toBe(false);
		expect(model_src.includes('beta_update')).toBe(false);
		expect(render_src.includes('update_mode')).toBe(false);
		expect(model_src.includes('update_mode')).toBe(false);
		expect(model_src.includes('use_worker')).toBe(false);
		expect(render_src.includes('dedalo_source_version_local_dir')).toBe(false);
		expect(/id\s*:\s*i\s*\+\s*1/.test(render_src), 'radios must not mint numeric ids').toBe(false);
		// class token stays clean; the version travels as data
		expect(render_src).toContain("class_name\t\t: 'file_container',");
		expect(render_src).toContain('file_container.dataset.version');
		// the css no longer styles retired markup
		expect(css_src.includes('.development')).toBe(false);
		expect(css_src.includes('.servers_grid')).toBe(false);
		expect(css_src.includes('update_mode_container')).toBe(false);
		expect(css_src.includes('beta_updates_container')).toBe(false);
	});

	test('the modal header renders what the server actually sends', () => {
		expect(render_src.includes('entity_label')).toBe(false);
		expect(render_src.includes('tool_names')).toBe(false);
		expect(render_src).toContain('[info.entity, info.host].filter(Boolean)');
	});

	test('arrow-on-prototype trap removed in the model layer', () => {
		expect(model_src).toContain(
			'update_code.prototype.get_code_update_info = async function ( server ) {',
		);
		expect(model_src).toContain('update_code.prototype.update_code = async function ( options ) {');
		// the 1-hour timeouts are gone with the background-job contract
		expect(model_src.includes('3600')).toBe(false);
	});

	test('both the start and the resume path stream through update_process_status', () => {
		// ONE tracker serves both paths; the mandated call lives inside it…
		expect(render_src).toContain('update_process_status(LOCAL_DB_ID, pid, pfile,');
		expect(render_src).toContain("const LOCAL_DB_ID = 'process_update_code'");
		// …and both paths route into it
		const track_calls = render_src.match(/track_process\(/g) ?? [];
		expect(
			track_calls.length,
			'start + resume must both call track_process',
		).toBeGreaterThanOrEqual(
			2, // the two call sites — asserted precisely below
		);
		const resume_block = render_src.slice(
			render_src.indexOf('const check_process_data'),
			render_src.indexOf('check_process_data()'),
		);
		expect(resume_block).toContain('track_process(local_data.value.pid, local_data.value.pfile');
		const modal_block = render_src.slice(render_src.indexOf('const render_info_modal'));
		expect(modal_block).toContain('track_process(pid, pfile, body_response');
	});

	test('stream-mirror coupling: the two common.js behaviours the reducer feed rides on', () => {
		// The widget's ONLY per-chunk feed is render_stream's `.display_json_box`
		// DOM mirror (common.js exposes no per-chunk hook). That works because of
		// two behaviours this widget does not own — pinned HERE so a change to
		// common.js goes red in this gate instead of silently classifying every
		// successful update as a failure (last_phase stays null → pre-swap death):
		//  1. update_process_status hardcodes display_json:true at its
		//     render_stream call site;
		const ups = common_src.slice(common_src.indexOf('export const update_process_status'));
		expect(ups.length, 'update_process_status must exist in common.js').toBeGreaterThan(0);
		const call_site = ups.slice(0, ups.indexOf('}//end update_process_status'));
		expect(/display_json\s*:\s*true/.test(call_site), 'display_json:true at the call site').toBe(
			true,
		);
		//  2. render_stream mirrors EVERY chunk into `.display_json_box` as the
		//     JSON of the whole sse_response;
		expect(/class_name\s*:\s*'display_json_box'/.test(render_common_src)).toBe(true);
		expect(render_common_src).toContain(
			'info_node.display_json_box.textContent = JSON.stringify(sse_response',
		);
		// …and the widget actually observes that mirror.
		expect(render_src).toContain("stream_node.querySelector('.display_json_box')");
		expect(render_src).toContain('new MutationObserver(');
		// the mirror is reducer feed, not operator surface: the widget css hides
		// it (locally — the shared render_common surface is untouched)
		expect(css_src).toContain('.update_stream .display_json_box');
		expect(/\.update_stream \.display_json_box\s*\{\s*display:\s*none;/.test(css_src)).toBe(true);
	});

	test('stream death vs job death: interrupted keeps the resume key, refusal renders its sentence', () => {
		// FINDING 3: a pre-swap stream death is INDETERMINATE — the tracker must
		// restore the resume key (render_stream's teardown deletes it) and say
		// "connection lost", never "failed".
		expect(render_src).toContain('const finish_interrupted');
		const interrupted_block = render_src.slice(
			render_src.indexOf('const finish_interrupted'),
			render_src.indexOf('const poll_health'),
		);
		expect(interrupted_block).toContain('data_manager.set_local_db_data(');
		expect(interrupted_block).toContain(
			'{ id : LOCAL_DB_ID, value : { pid : pid, pfile : pfile } }',
		);
		expect(interrupted_block).toContain('update_code_connection_lost');
		// FINDING 4 (client half): a job that ENDED (final frame, is_running:false)
		// with an error but no started phase renders the refusal sentence, not a
		// blank track + generic failure. The final frame is detected on the mirror
		// and its error normalized through the shared helper.
		expect(render_src).toContain('sse_response.is_running===false');
		expect(render_src).toContain('normalize_stream_error(sse_response)');
		expect(render_src).toContain('error_text(final_error)');
		expect(render_src).toContain('update_refusal');
		expect(css_src).toContain('update_refusal');
	});

	test('phase names AND status words are label keys, defined in the master catalog', () => {
		expect(render_src).toContain("get_label['update_code_phase_'+phase_id]");
		expect(render_src).toContain("get_label['update_code_status_'+status]");
		for (const phase of UPDATE_PHASES) {
			expect(typeof master_labels[`update_code_phase_${phase}`]).toBe('string');
		}
		for (const status of ['pending', 'running', 'done', 'failed', 'skipped']) {
			expect(typeof master_labels[`update_code_status_${status}`]).toBe('string');
		}
		expect(typeof master_labels.update_code_connection_lost).toBe('string');
	});

	test('the pre-selection comment states the REAL invariant (ascending, next rung)', () => {
		// FINDING 5: the server sorts ASCENDING (code_manifest.ts); index 0 is
		// the next legal rung, not "the newest". A comment claiming newest-first
		// would mislead a future fix into pre-selecting the LAST entry.
		expect(render_src.includes('newest-first')).toBe(false);
		expect(render_src).toContain('assertLinearUpgrade');
	});

	test('the picker keeps its pinned storage key and inline no-server error', () => {
		expect(render_src).toContain(
			"render_servers_list( value, 'CODE_SERVERS', 'dedalo.update_code.server' )",
		);
		expect(render_src).toContain("servers_list.classList.add('empty')");
		expect(render_src).toContain('update_code_no_server_selected');
	});

	test('the development refusal happens on the panel, before any picker', () => {
		const panel = render_src.slice(
			render_src.indexOf('const get_content_data_edit'),
			render_src.indexOf('}//end get_content_data_edit'),
		);
		expect(panel).toContain('update_code_dev_refused');
		expect(panel).toContain('button_submit.disabled = true');
		// the modal no longer carries the (post-confirm) refusal
		const modal = render_src.slice(render_src.indexOf('const render_info_modal'));
		expect(modal.includes('dedalo_entity')).toBe(false);
	});
});

describe('update_code phase reducer (pure)', () => {
	/** Frame helper: everything before `upto` done, `upto` running. */
	function frame_at(upto: string) {
		const idx = UPDATE_PHASES.indexOf(upto);
		return {
			phase: upto,
			phases: UPDATE_PHASES.map((id: string, i: number) => ({
				id,
				status: i < idx ? 'done' : i === idx ? 'running' : 'pending',
			})),
			version: '6.4.0',
			expected_version: '6.4.1',
		};
	}

	test('restart-then-interrupted transitions to health polling (resume key era over)', () => {
		// biome-ignore lint/suspicious/noExplicitAny: plain-JS reducer, untyped by design
		let state: any = init_phase_state('6.4.1');
		for (const phase of ['download', 'verify', 'extract', 'deps', 'preflight', 'swap', 'restart']) {
			state = apply_phase_frame(state, frame_at(phase));
			expect(state.mode).toBe('streaming');
			expect(state.last_phase).toBe(phase);
		}
		const before = state;
		state = apply_phase_frame(state, { interrupted: true });
		expect(state.mode).toBe('polling');
		// pure: the previous state is untouched
		expect(before.mode).toBe('streaming');
	});

	test('a PRE-swap interrupt is INDETERMINATE: interrupted, not failed, no polling', () => {
		// The server-side job is not tied to the SSE stream: a dropped connection
		// during a long deps/preflight leaves the job running, and it may swap
		// minutes later. Only a frame reporting a failed phase may say failed.
		// biome-ignore lint/suspicious/noExplicitAny: plain-JS reducer, untyped by design
		let state: any = init_phase_state('6.4.1');
		state = apply_phase_frame(state, frame_at('download'));
		state = apply_phase_frame(state, frame_at('extract'));
		state = apply_phase_frame(state, { interrupted: true });
		expect(state.mode).toBe('interrupted');

		// a stream that dies before ANY frame is equally indeterminate
		// biome-ignore lint/suspicious/noExplicitAny: plain-JS reducer, untyped by design
		let blank: any = init_phase_state('6.4.1');
		blank = apply_phase_frame(blank, { interrupted: true });
		expect(blank.mode).toBe('interrupted');
		expect(blank.last_phase).toBeNull();
	});

	test('a failed phase and a rollback frame end the run without interruption', () => {
		// biome-ignore lint/suspicious/noExplicitAny: plain-JS reducer, untyped by design
		let state: any = init_phase_state('6.4.1');
		state = apply_phase_frame(state, {
			phase: 'verify',
			phases: [
				{ id: 'download', status: 'done' },
				{ id: 'verify', status: 'failed' },
			],
			message: 'checksum mismatch',
		});
		expect(state.mode).toBe('failed');
		expect(state.message).toBe('checksum mismatch');

		// biome-ignore lint/suspicious/noExplicitAny: plain-JS reducer, untyped by design
		let rolled: any = init_phase_state('6.4.1');
		rolled = apply_phase_frame(rolled, {
			phase: 'health',
			rollback: { performed: true, to: '6.4.0' },
			message: 'health check failed',
		});
		expect(rolled.mode).toBe('rolled_back');
	});

	test('health outcomes: match → updated, mismatch → rolled back, silence → gone', () => {
		// biome-ignore lint/suspicious/noExplicitAny: plain-JS reducer, untyped by design
		let state: any = init_phase_state('6.4.1');
		state = apply_phase_frame(state, frame_at('restart'));
		state = apply_phase_frame(state, { interrupted: true, message: 'restarting' });

		expect(resolve_health_outcome(state, '6.4.1').outcome).toBe('updated');
		const rolled = resolve_health_outcome(state, '6.4.0');
		expect(rolled.outcome).toBe('rolled_back');
		expect(resolve_health_outcome(state, null).outcome).toBe('server_gone');
	});
});

describe('update_code terminal frame (resolve_final_frame)', () => {
	// The 2026-08-24 museum-probe false FAILURE: a fast install lands
	// swap→restart→done inside ONE SSE poll beat, so the client sees a track
	// frozen at an early phase PLUS the terminal frame — whose `data` is the
	// job's RETURN ENVELOPE (mediaJobs overwrites the last payload), never a
	// phase snapshot. That envelope is wire truth and decides the ending.
	const terminal = (body: Record<string, unknown>, errors: string[] = []) => ({
		is_running: false,
		data: body,
		errors,
	});

	test('a done envelope naming the installed version is SUCCESS despite a frozen track', () => {
		// biome-ignore lint/suspicious/noExplicitAny: plain-JS reducer, untyped by design
		let state: any = init_phase_state('7.0.1');
		state = apply_phase_frame(state, {
			phase: 'preflight',
			phases: [{ id: 'preflight', status: 'running' }],
		}); // …then the beats stop
		const ending = resolve_final_frame(state, {
			is_running: false,
			data: { msg: 'OK. Installed Dédalo 7.0.1 (clean).', ok: true, data: { version: '7.0.1' } },
			errors: [],
		});
		expect(ending).toEqual({ outcome: 'updated', version: '7.0.1' });
	});

	test('an error envelope / error list names the failure', () => {
		const refused = resolve_final_frame(
			// biome-ignore lint/suspicious/noExplicitAny: plain-JS reducer
			init_phase_state('7.0.1') as any,
			terminal({ ok: false, msg: 'Error. Release checksum mismatch' }),
		);
		expect(refused?.outcome).toBe('failed');
		expect(refused?.message).toContain('checksum');

		const errored = resolve_final_frame(
			// biome-ignore lint/suspicious/noExplicitAny: plain-JS reducer
			init_phase_state('7.0.1') as any,
			terminal({ ok: true }, ['Error. Code update failed']),
		);
		expect(errored?.outcome).toBe('failed');
		expect(errored?.message).toContain('Code update failed');
	});

	test('a frame that decides nothing stays null (caller keeps its heuristics)', () => {
		for (const frame of [
			null,
			{ is_running: true, data: null, errors: [] },
			{ is_running: false, data: null, errors: [] },
			{ is_running: false, data: { unexpected: 'shape' }, errors: [] },
		]) {
			// biome-ignore lint/suspicious/noExplicitAny: plain-JS reducer
			expect(resolve_final_frame(init_phase_state('7.0.1') as any, frame as any)).toBeNull();
		}
	});

	test('the renderer consults it before concluding failure (source shape)', () => {
		expect(render_src).toContain('resolve_final_frame(state, final_frame)');
		expect(render_src).toContain("ending.outcome==='updated'");
	});
});

// ---------------------------------------------------------------------------
// The terminal envelope is NOT a health confirmation.
//
// `on_done`'s stream_final branch used to force every phase — 'health'
// included — to 'done' and call finish_success() straight off an ok:true
// terminal frame. But that envelope is emitted BEFORE the restart
// (code_update.ts returns it, THEN the process dies), while the rollback
// sentinel still reads "pending". So the panel declared the update a success
// without ever asking /health whether the new tree boots, and reported exactly
// the same success when the engine came back rolled back onto the old version.
// The docs promise a health confirmation; this pins that the code performs one.
// ---------------------------------------------------------------------------
describe('a terminal ok frame hands off to health polling, never straight to success', () => {
	test('the success branch keeps the health phase open and polls', () => {
		// The branch must not mark 'health' done…
		const branch = render_src.slice(
			render_src.indexOf("if (ending && ending.outcome==='updated')"),
		);
		const body = branch.slice(0, branch.indexOf('return'));
		expect(body).toContain("p.id==='health' ? 'running' : 'done'");
		// …must enter polling mode with an expected_version…
		expect(body).toContain("mode				: 'polling'");
		expect(body).toContain('state.expected_version || ending.version');
		// …and must actually call the poller, not finish_success.
		expect(body).toContain('poll_health()');
		expect(body).not.toContain('finish_success');
	});

	test('resolve_health_outcome needs the expected_version this branch supplies', () => {
		// WHY the `state.expected_version || ending.version` fallback is
		// load-bearing: on the panel-RESUME path expected_version is null, and
		// a null one turns a perfectly good update into a 'rolled_back' report.
		const resumed = { ...init_phase_state(null), mode: 'polling' };
		expect(resolve_health_outcome(resumed, '7.0.1').outcome).toBe('rolled_back');

		const carried = { ...init_phase_state('7.0.1'), mode: 'polling' };
		expect(resolve_health_outcome(carried, '7.0.1').outcome).toBe('updated');
		// …and the old version still reads as a rollback, which is the point.
		expect(resolve_health_outcome(carried, '7.0.0').outcome).toBe('rolled_back');
	});
});

// ---------------------------------------------------------------------------
// THE SAME-VERSION VERDICT (2026-08-24, dev channel).
// The frame stream dies at the swap by design, so /health decides "updated" vs
// "rolled back". On a dev-channel install the version is IDENTICAL on both
// sides of that swap: comparing it reports success for a rollback just as
// eagerly as for a landed update. The installed archive digest is the token
// that moves, and the manifest item already carries it (file.sha256).
// ---------------------------------------------------------------------------
describe('resolve_health_outcome on a same-version (dev channel) install', () => {
	const NEW = 'a'.repeat(64);
	const OLD = 'b'.repeat(64);

	/** A panel mid-poll after a same-version install of the archive NEW. */
	// biome-ignore lint/suspicious/noExplicitAny: plain-JS reducer, untyped by design
	const polling = (): any => ({
		...init_phase_state('7.0.1', NEW),
		mode: 'polling',
	});

	test('the SAME version with the NEW digest is an update', () => {
		expect(resolve_health_outcome(polling(), '7.0.1', NEW).outcome).toBe('updated');
	});

	test('the SAME version with the OLD digest is a ROLLBACK — the case a version compare misses', () => {
		expect(resolve_health_outcome(polling(), '7.0.1', OLD).outcome).toBe('rolled_back');
	});

	test('silence is still server_gone, digest or not', () => {
		expect(resolve_health_outcome(polling(), null, null).outcome).toBe('server_gone');
	});

	test('a server that publishes NO digest falls back to the version verdict', () => {
		// An install running code older than this feature answers /health without
		// install_digest. Reporting every such update as a rollback would be worse
		// than the imprecision it replaces.
		expect(resolve_health_outcome(polling(), '7.0.1', null).outcome).toBe('updated');
	});

	test('a RELEASE install (no expected digest) keeps the version verdict exactly', () => {
		const release = { ...init_phase_state('7.0.1'), mode: 'polling' };
		expect(resolve_health_outcome(release, '7.0.1', OLD).outcome).toBe('updated');
		expect(resolve_health_outcome(release, '7.0.0', OLD).outcome).toBe('rolled_back');
	});
});
