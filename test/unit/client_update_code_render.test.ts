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
import { readdirSync, readFileSync } from 'node:fs';
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
const status_src = readFileSync(join(WIDGET_DIR, 'js/render_update_status.js'), 'utf8');
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
			// `channel` joined the signature on 2026-08-24 (the dev channel)
			'update_code.prototype.get_code_update_info = async function ( server, channel ) {',
		);
		expect(model_src).toContain('update_code.prototype.update_code = async function ( options ) {');
		// the 1-hour timeouts are gone with the background-job contract
		expect(model_src.includes('3600')).toBe(false);
	});

	test('both the start and the resume path stream through update_process_status', () => {
		// ONE tracker serves both paths; the mandated call lives inside it…
		// PARAMETRIZED since the restore joined (2026-08-25): the resume key is
		// the tracker's last argument, so the two jobs cannot resume as each
		// other, and BOTH keys are pinned here.
		expect(render_src).toContain('update_process_status(local_db_id, pid, pfile,');
		expect(render_src).toContain("const LOCAL_DB_ID = 'process_update_code'");
		expect(render_src).toContain("const LOCAL_DB_ID_RESTORE = 'process_restore_code'");
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
		expect(resume_block).toContain('track_process(');
		expect(resume_block).toContain('local_data.value.pid');
		expect(resume_block).toContain('local_data.value.pfile');
		// the archive digest survives the resume too (same-version installs)
		expect(resume_block).toContain('local_data.value.digest');
		const modal_block = render_src.slice(render_src.indexOf('const render_info_modal'));
		expect(modal_block).toContain('track_process(');
		expect(modal_block).toContain('file_active.sha256');
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
			// the digest rides along so a RESUMED panel can still judge a
			// same-version install (2026-08-24); the key is the tracker's own
			// parameter since the restore joined (2026-08-25), so an interrupted
			// restore is restored under the RESTORE key, never the update's
			'{ id : local_db_id, value : { pid : pid, pfile : pfile, digest : expected_digest } }',
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
			// envelope v2 failure body: the sentence is `error.message`. `msg` is a
			// handler extension key emitted on SUCCESS only, so a fixture carrying
			// it on ok:false would test a shape the server cannot send.
			terminal({
				ok: false,
				error: { code: 'update.failed', message: 'Error. Release checksum mismatch' },
			}),
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

// ---------------------------------------------------------------------------
// THE WAIVE-BACKUP CONTROL (2026-08-25). A code update REFUSES without a recent
// DATABASE backup, and the refusal sentence names `waive_backup` as the way
// through — a flag ONLY the drills could send, so a stale backup was a dead end
// for every operator. Source-shape gates, same reason as the switch below: the
// wiring lives in a DOM factory this suite cannot boot.
// ---------------------------------------------------------------------------
describe('update_code waive-backup control', () => {
	test('the flag reaches the wire, strictly and only as a boolean', () => {
		// The server reads `options.waive_backup === true` (code_update.ts). If
		// the client never puts the key in the bag, the checkbox is decoration.
		expect(/options\s*:\s*\{[^}]*waive_backup/s.test(model_src)).toBe(true);
		// a truthy stray must never be what disarms a guard — on BOTH sides
		expect(model_src).toContain('options.waive_backup === true');
	});

	test('the control is offered only when the backup gate is actually in the way', () => {
		// The server's `backup_fresh` check is `ok` exactly when the pipeline will
		// not refuse on this account. Rendering the waiver unconditionally would
		// invite an operator to disarm a guard that is not blocking anything.
		// via the shared predicate (see the ONE-predicate test below), which is
		// where the `backup_fresh` / `state!=='ok'` decision actually lives
		expect(render_src).toContain('backup_waiver_check(self.value?.consumer)');
		expect(/if\s*\(backup_check\)\s*\{/.test(render_src)).toBe(true);
	});

	test('the checkbox is a wrapping label, and its note carries the caution', () => {
		// house pattern (dev_channel_row / move_lang): the <label> WRAPS the input,
		// so there is no id/for pair to keep in sync.
		expect(render_src).toContain('waive_backup_label.prepend(waive_backup_input)');
		expect(render_src).toContain('update_code_waive_backup');
		expect(render_src).toContain('dd_note waive_backup_note state_warning');
	});

	test('a waived backup is restated in the final confirm', () => {
		// The checkbox is one click; the consequence is that the database is not
		// restorable. The last gate must say so, and via ui.confirm (never a
		// native dialog — see the blocking-dialogs test above).
		expect(render_src).toContain('update_code_waive_backup_confirm');
		expect(/waive_backup\s*:\s*waive_backup/.test(render_src)).toBe(true);
	});

	test('the modal reads a FRESH panel value, not the one build() seeded', () => {
		// self.value is read at build() time and backup freshness AGES: a panel
		// left open across the deadline would hide the only control that lets the
		// operator proceed.
		expect(render_src).toContain('self.value = fresh_value');
	});

	test('the headline never claims plain readiness over an outstanding waiver', () => {
		// `ready` is `!checks.some(blocked)` and the waivable gate now reports
		// `warn`, so `ready:true` no longer means "the DEFAULT request succeeds"
		// — that request sends waive_backup:false and is still refused. A bare
		// "Ready to update" there over-reports exactly as loudly as the "Update
		// blocked" it replaced.
		const status_src = readFileSync(join(WIDGET_DIR, 'js/render_update_status.js'), 'utf8');
		expect(status_src).toContain('update_code_ready_with_waiver');
		expect(typeof master_labels.update_code_ready_with_waiver).toBe('string');
	});

	test('the headline and the checkbox read ONE predicate, scoped to the waivable gate', () => {
		// `bun_pin` and `staging_clean` also emit `warn` on the consumer half and
		// neither is waivable, so a headline keyed on "any warn" demanded a waiver
		// the modal offered no way to give. One exported predicate, both sites.
		const status_src = readFileSync(join(WIDGET_DIR, 'js/render_update_status.js'), 'utf8');
		expect(status_src).toContain('export const backup_waiver_check');
		expect(status_src).toContain("el.id==='backup_fresh'");
		// neither site may re-derive the answer for itself
		expect(status_src).not.toContain("some(check => check.state==='warn')");
		expect(render_src).toContain('backup_waiver_check(self.value?.consumer)');
		expect(status_src).toContain('backup_waiver_check(consumer)');
	});

	test('the panel is re-stated from the value the modal reads', () => {
		// otherwise the modal's waiver row ("25 h") sits over a readiness row
		// still reading "23 h · ok": one fact, two states, both on screen.
		expect(/refresh_readiness\(consumer_half/.test(render_src)).toBe(true);
		// …and when there is no readiness block to replace (the FALLBACK painting,
		// a payload without `consumer`), the whole half is rendered again rather
		// than left stranded on version+build. See the browser suite for the
		// behavioural gate on refresh_readiness itself.
		expect(render_src).toContain('render_consumer_half(fresh_value.consumer)');
		expect(readFileSync(join(WIDGET_DIR, 'js/render_update_status.js'), 'utf8')).toContain(
			'export const refresh_readiness',
		);
	});

	test('its labels are defined in the master catalog', () => {
		for (const key of [
			'update_code_waive_backup',
			'update_code_waive_backup_note',
			'update_code_waive_backup_confirm',
		]) {
			expect(typeof master_labels[key], `${key} missing from master.json`).toBe('string');
		}
	});

	test('the row is styled in the MODAL footer, never under .role_body', () => {
		// The panel's own switch lives under `.role_body >.dev_channel_row`; a
		// selector pointing there for a node that renders in the modal footer
		// matches NOTHING and the styles simply vanish (the same silent failure
		// the `>` test below gates for the nodes that moved into a role block).
		expect(css_src).not.toContain('.role_body >.waive_backup_row');
		expect(css_src).toContain('.waive_backup_row');
		expect(css_src).toContain('>.waive_backup_check');
		expect(css_src).toContain('>.dd_note.waive_backup_note');
	});
});

// ---------------------------------------------------------------------------
// THE RESTORE CONTROL (2026-08-25). The DECISION it makes — whether to demand
// the downgrade waiver — is exercised in the browser suite; what is pinned here
// is what that decision is computed FROM, because reading the wrong version
// string is invisible in the DOM until a dev-channel install meets it.
// ---------------------------------------------------------------------------
describe('update_code restore control', () => {
	test('the downgrade decision compares the SERVER’s version, not the page global', () => {
		// page_globals.dedalo_version is DEDALO_ENGINE_VERSION and carries the
		// prerelease tag ('7.0.1.dev'); the pipeline compares
		// DEDALO_VERSION_TRIPLE.join('.'), a bare '7.0.1'. Comparing the page
		// global drew the waiver on every developer-channel restore of the
		// version already running, locked the submit behind it, and had the
		// server log "VERSION CHANGE CONFIRMED … from 7.0.1 to 7.0.1".
		expect(render_src).toContain(
			'export const render_restore_modal = function( self, point, body_response, running_version )',
		);
		expect(render_src).toContain('const from_version		= String(running_version ||');
		// …and the panel hands it the server's own field. Matched by SHAPE, not by
		// the holder's name: the consumer half became one re-callable writer
		// (render_consumer_half) on 2026-08-26 and `value.consumer` there is now
		// simply `consumer` — what must not drift is that the version comes off
		// the payload's engine, never off the page global.
		expect(/\(\s*consumer\.engine \|\| \{\}\)\.version/.test(render_src)).toBe(true);
		expect(
			/render_restore_modal\([^)]*page_globals\.dedalo_version/.test(render_src),
			'the restore modal must never be handed the page global as the running version',
		).toBe(false);
	});

	test('a blocked point’s tooltip is its OWN reason, and every reason id has a label', () => {
		// The reason ids are code_restore.ts's RestoreBlockReason. A missing label
		// used to fall back to the not-bootable sentence, which contradicted the
		// green `bootable` pill the same row draws.
		const status_src = readFileSync(join(WIDGET_DIR, 'js/render_update_status.js'), 'utf8');
		expect(status_src).toContain(
			"get_label['update_code_restore_reason_' + point.restorable_reason]",
		);
		const restore_src = readFileSync(
			join(import.meta.dir, '../../src/core/update/code_restore.ts'),
			'utf8',
		);
		const reasons = /export type RestoreBlockReason =([^;]+);/.exec(restore_src)?.[1] ?? '';
		const ids = [...reasons.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
		expect(ids.length).toBeGreaterThan(0);
		for (const id of ids) {
			expect(
				typeof master_labels[`update_code_restore_reason_${id}`],
				`update_code_restore_reason_${id} missing from master.json`,
			).toBe('string');
		}
	});

	test('the waiver label carries the %s the client substitutes', () => {
		// Both halves of one bug: the confirm header printed a raw %s nobody
		// substituted, and the waiver label had no %s for the .replace() that
		// names the target version.
		expect(render_src).toContain(".replace('%s', to_version");
		expect(master_labels.update_code_restore_confirm_downgrade).toContain('%s');
		expect(master_labels.update_code_restore_confirm).not.toContain('%s');
	});
});

// ---------------------------------------------------------------------------
// THE DEVELOPER-BUILDS SWITCH (2026-08-24). Source-shape gates: the wiring
// these behaviours need is spread across a DOM factory this suite cannot boot,
// so the gate is that the load-bearing lines exist and stay honest.
// ---------------------------------------------------------------------------
describe('update_code developer-builds switch', () => {
	test('the manifest request carries the channel the operator asked for', () => {
		// The switch is the ARMING: a master only offers developer builds to a
		// consumer that explicitly asks, and only when it opted in itself.
		expect(model_src).toContain('channel');
		expect(/options\s*:\s*\{[^}]*channel/s.test(model_src)).toBe(true);
	});

	test("the developer channel builds THE SERVER'S branch, never a literal ref", () => {
		// A client-baked 'v7' refused on every code server that does not carry
		// that branch ("Could not read src/core/update/version.ts at ref 'v7'").
		// The ref is source.branch; when it IS the release ref there is nothing
		// unreleased to publish and the row says so instead of offering a button.
		// no branch LITERAL other than the release ref's own channel
		expect(/branch\s*:\s*['"](?!master['"])/.test(render_src)).toBe(false);
		expect(render_src).toContain('const dev_branch');
		expect(/branch\s*:\s*dev_branch/.test(render_src)).toBe(true);
		expect(render_src).toContain('source.release_ref');
		expect(render_src).toContain('update_code_build_developer_unavailable');
		// the branch is a NAMED placeholder: its position differs per language
		expect(render_src).toContain("replaceAll('%branch%'");
		expect(master_labels.update_code_build_developer_confirm).toContain('%branch%');
	});

	test('every translation of the confirm keeps ONE %branch% and TWO %s', () => {
		// The client substitutes %branch% by NAME and then the two %s POSITIONALLY
		// (version, then path). A translator dropping %branch% ships a sentence
		// naming no branch; a third %s puts the path where the version belongs —
		// both silent, and both invisible to the labels tripwire (it checks key
		// sets, never placeholders).
		const key = 'update_code_build_developer_confirm';
		const catalog_dir = join(import.meta.dir, '../../src/core/labels/catalog');
		const sentences: Array<[string, string]> = [['master', master_labels[key] as string]];
		for (const file of readdirSync(catalog_dir).filter((name) => name.endsWith('.json'))) {
			const labels = JSON.parse(readFileSync(join(catalog_dir, file), 'utf8')) as Record<
				string,
				string
			>;
			// lg-eng carries no copy of master.json (the tripwire refuses duplicates)
			if (typeof labels[key] === 'string') sentences.push([file, labels[key]]);
		}
		expect(sentences.length).toBeGreaterThan(10);
		for (const [where, sentence] of sentences) {
			expect(`${where}: ${sentence.split('%branch%').length - 1}`).toBe(`${where}: 1`);
			expect(`${where}: ${sentence.split('%s').length - 1}`).toBe(`${where}: 2`);
		}
	});

	test('the panel offers the switch and re-lists through it', () => {
		expect(render_src).toContain('dev_channel');
		expect(render_src).toContain('update_code_dev_channel');
	});

	test('the status readout names a DEVELOPER BUILD as such, not "development checkout"', () => {
		// posture 'dev' now covers two very different trees: a working checkout
		// and an installed branch build. Calling the second one a checkout would
		// send an operator looking for a git tree that is not there.
		const status_src = readFileSync(join(WIDGET_DIR, 'js/render_update_status.js'), 'utf8');
		expect(status_src).toContain('install_channel');
		expect(status_src).toContain('update_code_posture_dev_build');
	});

	test('the panel is split into TWO ROLE BLOCKS, each naming whose code it is about', () => {
		// One screen answers two unrelated questions — what THIS install runs, and
		// what it PUBLISHES. Flat, they read as one list and 'Published releases'
		// looks like something the install might receive.
		expect(render_src).toContain('role_block');
		expect(render_src).toContain("role_block(\n\t\t\tcontent_data,\n\t\t\t'consumer'");
		expect(render_src).toContain("'code_server'");
		expect(render_src).toContain('update_code_role_consumer');
		expect(render_src).toContain('update_code_role_server');
	});

	test('each build action is ONE entry with the archive it produces', () => {
		// The buttons and the archives were two blocks, and nothing said the first
		// writes the second. The readout now lays out a row per channel and calls
		// back to mount the action into it.
		expect(render_src).toContain('make_builder_mounter');
		// rendered through render_code_server_half, so a build can re-run it
		expect(
			/render_code_server_status\(\s*server_body,\s*code_server,\s*make_builder_mounter/.test(
				render_src,
			),
		).toBe(true);
		expect(render_src).toContain('render_code_server_half(value.code_server)');
		const status_src = readFileSync(join(WIDGET_DIR, 'js/render_update_status.js'), 'utf8');
		// the mounter also receives the ARTIFACT CELL and the facts it currently
		// shows: the in-flight state belongs on the row being rewritten, and the
		// before-value has to be captured before the refresh destroys this half.
		expect(status_src).toContain('mount_builder(channel, action, value, built || null)');
		expect(status_src).toContain('build_row');
		expect(status_src).toContain('update_code_build_publish');
		// an unbuilt channel still shows its row, saying so
		expect(status_src).toContain('update_code_not_built');
		// and archives of other versions are listed, never dropped
		expect(status_src).toContain('update_code_other_archives');
		// ONE writer for the archive facts, called from BOTH lists (the duplicate
		// is how the stale 'developer (not offered)' wording survived in one)
		expect(status_src).toContain('const release_facts = function(');
		expect((status_src.match(/release_facts\(/g) ?? []).length).toBe(2);
	});

	test('the build actions read as BUTTONS, weighted by channel', () => {
		// In the readout's label column a pale outline reads as a caption; the one
		// thing on the row that DOES something must not be the quietest mark on it.
		expect(render_src).toContain("button_class\t: 'primary'");
		expect(render_src).toContain("classList.add('build_button', def.button_class)");
		expect(css_src).toContain('button.build_button');
	});

	test('a finished build REFRESHES the archive list beside the button', () => {
		// The row next to the button is a claim about the disk that the build just
		// changed: stale, it shows the old timestamp — or 'Not built yet' next to a
		// build that succeeded.
		expect(render_src).toContain('on_built');
		expect(render_src).toContain('refresh_code_server');
		// re-read from the SERVER, not from the value this render closed over
		expect(
			/refresh_code_server\s*=\s*async\s*\(build_mark\)\s*=>\s*\{[\s\S]{0,200}await self\.get_value\(\)/.test(
				render_src,
			),
		).toBe(true);
		// and the half is re-rendered from that fresh value, carrying the mark:
		// the whole half is replaced, so without it the new archive line appears
		// where the old one was with nothing saying which one is on screen.
		expect(render_src).toContain('render_code_server_half(fresh.code_server, build_mark)');
		// a failed refresh must not take the panel down
		expect(
			/catch \(error\) \{[\s\S]{0,240}console\.error\('update_code: could not refresh/.test(
				render_src,
			),
		).toBe(true);
	});

	test('both role blocks fold, and remember it', () => {
		expect(render_src).toContain('role_header icon_arrow');
		expect(render_src).toContain('dedalo.update_code.fold.');
		expect(render_src).toContain('read_fold');
		expect(render_src).toContain('store_fold');
		// storage failures degrade to an OPEN block, never to an error
		expect(render_src).toContain('} catch (_error) {\n\t\treturn false');
	});

	test('the switch carries an icon, and both role blocks carry theirs', () => {
		expect(render_src).toContain('dev_channel_icon');
		expect(render_src).toContain('role_icon');
		expect(css_src).toContain(".fn_maintenance_icon('bug.svg')");
		expect(css_src).toContain(".fn_maintenance_icon('download.svg')");
		expect(css_src).toContain(".fn_maintenance_icon('upload.svg')");
	});

	test('no `>` selector still points at content_data for a node that moved into a role block', () => {
		// The restructure re-parented these; a direct-child selector left behind
		// matches NOTHING and fails silently — the styles simply vanish.
		for (const moved of ['button_submit', 'dd_readout', 'dd_note', 'dev_channel_row']) {
			expect(
				new RegExp(`^\\t\\t>\\.${moved}\\b`, 'm').test(css_src),
				`.${moved} moved into .role_body — its selector must not be a direct child of content_data`,
			).toBe(false);
		}
		expect(css_src).toContain('.role_body >.dev_channel_row');
	});

	test('the health poll reads install_digest and hands it to the verdict', () => {
		// Without this the panel decides a same-version install by version alone —
		// which reports every rollback as a success.
		expect(render_src).toContain('install_digest');
		expect(/resolve_health_outcome\(\s*state\s*,\s*version\s*,\s*digest/.test(render_src)).toBe(
			true,
		);
	});

	test('the installed archive digest is what the tracker expects (from the manifest item)', () => {
		expect(render_src).toContain('expected_digest');
		// and it SURVIVES the panel-resume path, like pid/pfile already do
		expect(/value\s*:\s*\{\s*pid\s*:\s*pid,\s*pfile\s*:\s*pfile,\s*digest/.test(render_src)).toBe(
			true,
		);
	});

	test('the client interruption marker IS the one core/media/jobs.ts writes', () => {
		// The client tells "the owning process died" apart from "the job failed"
		// by a PREFIX in errors[], because JobStatusFrame carries no `status` —
		// it collapses into is_running:false (jobs.ts frameOf). That makes a
		// server string a client contract, so it gets a gate: a reworded marker
		// on the server would otherwise silently turn every resumed, completed
		// restore back into "the update failed" (the 2026-08-26 defect).
		const phases_src = readFileSync(join(WIDGET_DIR, 'js/update_code_phases.js'), 'utf8');
		const declared = /JOB_INTERRUPTED_PREFIX\s*=\s*'([^']+)'/.exec(phases_src)?.[1];
		expect(declared).toBe('interrupted: ');

		const jobs_src = readFileSync(join(import.meta.dir, '../../src/core/media/jobs.ts'), 'utf8');
		// every errors.push of an interruption uses that exact prefix…
		const pushes = jobs_src.match(/errors\.push\(\s*[`'"]interrupted[^`'"]*/g) ?? [];
		expect(pushes.length).toBeGreaterThanOrEqual(3);
		for (const push of pushes) {
			expect(push).toContain(`interrupted: `);
		}
		// …and no OTHER errors.push starts with the word, which would read as an
		// interruption to the client while meaning something else.
		const strays = (jobs_src.match(/errors\.push\(\s*[`'"][^`'"]*/g) ?? []).filter(
			(push) => /interrupted/i.test(push) && !push.includes('interrupted: '),
		);
		expect(strays).toEqual([]);

		// and the frame the client reads still has no `status` to use instead
		expect(/function frameOf\([^)]*\): JobStatusFrame \{[^}]*status:/s.test(jobs_src)).toBe(false);
	});
});


/**
 * THE RUNNING SURFACE — the half a "does the error render at all?" gate misses.
 *
 * Measured on the docker museum in map view (2026-08-28, 640px viewport, root
 * font 26px): every ending sentence WAS produced and WAS in the DOM, and the
 * operator still saw nothing, because the run's own scroll parked the phase
 * track 184px too low and the track's height did the rest. Two independent
 * causes, so two independent assertions — either one regressing hides the
 * progress again:
 *
 *   1. the scroll must be issued AFTER the surface is complete and must not be
 *      animated (a smooth scroll animates toward an offset computed when it is
 *      issued, so issuing it mid-build chases a stale layout);
 *   2. a pinned track that can grow to the height of its scrollport pins
 *      nothing — the cap and the rows' own overflow are what leave room for the
 *      stream and the endings underneath.
 */
describe('update_code tracking surface', () => {
	// the tracker function only — assertions below must not match the panel's
	// other scrolls (the modal, the readiness half).
	const tracker = render_src.slice(
		render_src.indexOf('const track_process = function('),
		render_src.indexOf('}//end track_process'),
	);

	test('the tracker exists and is the region under test', () => {
		expect(tracker.length).toBeGreaterThan(500);
		expect(tracker).toContain('update_stream');
	});

	test("the run's scroll is issued AFTER the stream node, and is not animated", () => {
		const stream_at = tracker.indexOf("class_name\t\t: 'update_stream'");
		const scroll_at = tracker.indexOf('scrollIntoView');
		expect(stream_at, 'the stream node is created in the tracker').toBeGreaterThan(-1);
		expect(scroll_at, 'the tracker scrolls its surface into view').toBeGreaterThan(-1);
		// ORDER is the fix: scrolling before the stream exists chased a layout
		// that was still growing and landed 184px short.
		expect(scroll_at).toBeGreaterThan(stream_at);
		// and no smooth animation on the START scroll — `behavior:'auto'` lands
		// deterministically. (reveal(), at the endings, is a separate call.)
		const start_scroll = tracker.slice(scroll_at, scroll_at + 200);
		expect(start_scroll).toContain("behavior:'auto'");
		expect(start_scroll).not.toContain("behavior:'smooth'");
	});

	test('every ending sentence is revealed, not merely appended', () => {
		// each ending appends its note as the LAST child of a surface taller than
		// the viewport; reveal() is what puts it where it can be read.
		const notes = tracker.match(/(reveal\()?ui\.create_dom_element\(\{[^}]*?class_name[^}]*?dd_note/gs) ?? [];
		expect(notes.length, 'the tracker still appends ending notes').toBeGreaterThanOrEqual(5);
		for (const note of notes) {
			expect(note.startsWith('reveal('), `an ending note is appended unrevealed: ${note.slice(0, 120)}`).toBe(true);
		}
		// reveal itself must tolerate the DOM stub this gate drives it against
		expect(tracker).toContain("typeof node.scrollIntoView==='function'");
	});

	test('the pinned phase track cannot own its scrollport', () => {
		const tracking = css_src.slice(css_src.indexOf('&.tracking {'));
		expect(tracking).toContain('position: sticky');
		// a cap, and rows that scroll INSIDE it — without both, the track grows
		// to the full height of the box and there is nothing left to pin above.
		expect(/max-height:\s*[^;]+;/.test(tracking)).toBe(true);
		expect(tracking).toContain('overflow-y: auto');
		// flex's default min-height:auto refuses to shrink below content, which
		// would push the overflow straight back onto the page.
		expect(tracking).toContain('min-height: 0');
	});
});

/**
 * THE BLOCKED-RESTORE REASON must name the versions it is about.
 *
 * "This copy pins a different Bun runtime than the one running" named NEITHER,
 * so an admin could not tell which Bun to install, nor which of eleven restore
 * points was the odd one — while both facts were already on the wire (the
 * point's own `bun_pin`, the engine's `bun`).
 */
describe('update_code restore-reason detail', () => {
	const KEY = 'update_code_restore_bun_versions';

	test('the label exists and takes the three versions the sentence needs', () => {
		const sentence = master_labels[KEY];
		expect(sentence, `${KEY} is defined in master.json`).toBeDefined();
		// pinned, running, pinned-again ("install X to restore it") — the client
		// substitutes positionally, so the count is the contract.
		expect(((sentence ?? '').match(/%s/g) ?? []).length).toBe(3);
	});

	test('the renderer fills it from the wire, not from a literal', () => {
		expect(status_src).toContain(KEY);
		expect(status_src).toContain('point.bun_pin');
		expect(status_src).toContain('engine.bun');
		// exactly the three the restore sentence takes — counted on the call that
		// fills THAT label, so an unrelated substitution elsewhere in the file
		// (the build readout's `was %s`) cannot satisfy this.
		const restore_fill = status_src.slice(status_src.indexOf(KEY));
		expect((restore_fill.match(/\.replace\('%s',/g) ?? []).length).toBe(3);
	});

	test('only the bun-pin refusal gets numbers, and only when both are known', () => {
		// the other two reasons have no versions to add; a point whose pin cannot
		// be read must degrade to the sentence alone, never print "undefined".
		expect(status_src).toContain("point.restorable_reason==='bun_pin_mismatch' && point.bun_pin && engine.bun");
		// the sentence itself is untouched — its translations stay valid
		expect(status_src).toContain("get_label['update_code_restore_reason_' + point.restorable_reason]");
	});

	test('the detail line has somewhere to render', () => {
		expect(status_src).toContain('restore_reason_detail');
		expect(css_src).toContain('.restore_reason_detail');
	});
});


/**
 * THE BUILD READOUT must say WHEN it is changing and WHAT it changed from.
 *
 * A build rewrites `<v>.zip` / `<v>-dev.zip` IN PLACE and takes tens of
 * seconds. Before this, the row beside the button said nothing while that ran,
 * and afterwards the whole half was replaced with a line that looks exactly
 * like the one it replaced (same name, near-same size, a timestamp nobody
 * memorised). Reported 2026-08-28: "is not clear if the information changes".
 *
 * Both halves are asserted, because either alone leaves the operator guessing:
 * an in-flight state with no before/after cannot confirm the write happened,
 * and a verdict with no in-flight state leaves the panel mute while it runs.
 */
describe('update_code build feedback', () => {
	test('the in-flight state is armed by the REQUEST, never by the click', () => {
		// build_form runs window.confirm synchronously and only then adds
		// `button_spinner`, before its first await — so a listener registered
		// after it sees the spinner iff the operator confirmed. Marking on click
		// would leave a declined confirm showing "building…" forever.
		expect(render_src).toContain("form.addEventListener('submit'");
		expect(render_src).toContain("classList.contains('button_spinner')");
		expect(render_src).toContain("artifact_cell.classList.add('building')");
		expect(render_src).toContain('update_code_build_building');
		// the marker goes on the ARTIFACT cell, not on the button: the button
		// already reports the request; only the row can report that ITS file is
		// the one being rewritten.
		expect(render_src).toContain('function(channel, node, artifact_cell, built_before)');
	});

	test('the before-value is captured at mount and survives the refresh', () => {
		// the refresh destroys this half, so nothing could read it back off the
		// DOM afterwards — it has to be closed over when the row is built.
		expect(render_src).toContain('built_before');
		expect(/previous\s*:\s*built_before/.test(render_src)).toBe(true);
		expect(render_src).toContain('channel\t\t: channel');
		// …and reaches the renderer as the mark for that channel only
		expect(status_src).toContain('build_mark && build_mark.channel===channel');
		expect(/render_code_server_status = function\(parent, code_server, mount_builder, build_mark\)/.test(status_src)).toBe(true);
	});

	test('the verdict is read off the STAMP, not asserted', () => {
		// "updated" must be a statement about the disk that the disk supports: a
		// build that wrote nothing leaves the stamp where it was, and the row
		// says THAT instead of claiming a change.
		expect(status_src).toContain('previous.stamp!==release.stamp');
		expect(status_src).toContain('update_code_build_updated');
		expect(status_src).toContain('update_code_build_unchanged');
		// the archive that did not exist before is an update, not "unchanged"
		expect(status_src).toContain('previous===null || previous.stamp!==release.stamp');
	});

	test('the before-value shows only what MOVED', () => {
		// Repeating the unchanged facts ("173 MB · 28/08/2026, 11:41:43" above,
		// "was 173 MB · 28/08/2026, 11:41:12" below) buries the one figure the
		// operator is reading for in three that did not change.
		expect(status_src).toContain('previous.bytes!==release.bytes');
		expect(status_src).toContain('same_day(previous.stamp, release.stamp)');
		expect(status_src).toContain('format_time');
		// and an UNCHANGED build renders no before-line at all: it would be
		// identical to the value above it, and the badge already says so.
		expect(/if \(!wrote\) \{\s*return null/.test(status_src)).toBe(true);
		expect(status_src).toContain('if (previous_text!==null)');
	});

	test('the value it replaced is spelled out, and every label is defined', () => {
		expect(status_src).toContain('build_file_previous');
		expect(status_src).toContain('update_code_build_previous');
		for (const key of [
			'update_code_build_building',
			'update_code_build_previous',
			'update_code_build_unchanged',
			'update_code_build_updated',
		]) {
			expect(master_labels[key], `${key} is defined in master.json`).toBeDefined();
		}
		// one substitution slot: the size · date the row showed before
		expect(((master_labels.update_code_build_previous ?? '').match(/%s/g) ?? []).length).toBe(1);
		// and the states have somewhere to render
		expect(css_src).toContain('&.building');
		expect(css_src).toContain('.build_file_previous');
		expect(css_src).toContain('&.built_updated');
	});
});


/**
 * THE DELETE AFFORDANCE — the client half of restore-point retention.
 *
 * The server half is gated in restore_points_native.test.ts; this pins the two
 * things that make the panel honest about a destructive action it now offers:
 * the button is a MIRROR of the server's verdict (never a second opinion, the
 * shape `restorable` already established), and a development checkout gets no
 * more power to delete than it has to restore.
 */
describe('update_code restore-point delete', () => {
	test('the button mirrors the server verdict, it never re-decides', () => {
		expect(status_src).toContain('point.deletable!==true');
		expect(status_src).toContain("get_label['update_code_delete_reason_' + point.deletable_reason]");
		// a disabled control must say why, RENDERED and not only hovered — the
		// same correction the restore reason already carries.
		expect(status_src).toContain('button_delete.title');
		expect(/class_name\s*:\s*'restore_reason',\s*\n\s*text_content\s*:\s*delete_reason/.test(status_src)).toBe(true);
		// and no click handler is wired on a refused row
		expect(/if \(point\.deletable!==true\) \{[\s\S]{0,900}\} else \{[\s\S]{0,200}addEventListener\('click'/.test(status_src)).toBe(true);
	});

	test('a development checkout gets neither Restore nor Delete', () => {
		// it refuses to overwrite its own tree; deleting its rollbacks would be
		// the same reach into a tree the panel does not own.
		expect(render_src).toContain('is_development ? null : (point) => delete_restore_point(self, point, body_response)');
	});

	test('the delete is synchronous and answers a VERDICT, not a job handle', () => {
		// its neighbours submit jobs because they end in a restart; this ends in
		// a directory being gone, and the server verifies that before answering.
		expect(model_src).toContain("action\t: 'delete_restore_point'");
		expect(model_src).not.toMatch(/delete_restore_point[\s\S]{0,900}pid/);
		// …and it does NOT reintroduce the hour-long pending request the
		// background-job contract removed (pinned above as `no 3600 in the
		// model`): bounded, because the DISK is the record of what happened, so
		// a client that gives up early loses nothing the next read cannot show.
		expect(/delete_restore_point = async function[\s\S]{0,1400}timeout : 600 \* 1000/.test(model_src)).toBe(true);
		// named, never pathed — the same contract as restore_code
		expect(/delete_restore_point = async function[\s\S]{0,900}name : options\.name/.test(model_src)).toBe(true);
	});

	test('the confirm NAMES the point, and the list is re-read after', () => {
		// several points differ only by timestamp: "are you sure?" about an
		// unnamed one is not a question.
		expect(render_src).toContain('update_code_delete_point_confirm');
		expect(/\.replace\('%s', String\(point\.name\)\)/.test(render_src)).toBe(true);
		expect(render_src).toContain('self.refresh_consumer');
		// a partial delete arrives as an ERROR envelope — the server refuses
		// rather than claiming a removal it could not verify
		expect(/delete_restore_point = async function[\s\S]{0,1600}request_failed\(api_response\)/.test(render_src)).toBe(true);
	});

	test('every label the affordance renders is defined', () => {
		for (const key of [
			'update_code_delete_point',
			'update_code_delete_point_confirm',
			'update_code_delete_point_done',
			'update_code_delete_reason_live_rollback',
		]) {
			expect(master_labels[key], `${key} is defined in master.json`).toBeDefined();
		}
		expect(((master_labels.update_code_delete_point_confirm ?? '').match(/%s/g) ?? []).length).toBe(1);
		expect(css_src).toContain('button_delete_point');
	});
});
