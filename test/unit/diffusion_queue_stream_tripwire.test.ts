/**
 * follow_queue tripwire (DEC-12: every documented invariant has one) — WC-067.
 *
 * The admin queue stream re-serializes its frame ONCE A SECOND, FOR EVERY
 * CONNECTED ADMIN, for as long as the maintenance widget is open. That cadence
 * is what makes two otherwise-harmless edits expensive, and neither of them
 * looks wrong in review:
 *
 *   1. "just add errors[] to the frame so I can see failures inline" — errors[]
 *      is an unbounded string[] appended per failing field, and `spec` carries
 *      the entire sanitized SQO. Either one turns a small frame into an
 *      unbounded one at 1 Hz.
 *   2. "listJobsForCaller already reads jobs, reuse it" — that reader is the
 *      24h/200-row history view over six whole jsonb columns (~1193 B/row
 *      measured). Polling it is ~240 kB of parse-and-stringify per admin per
 *      second to observe a counter that moves once per 500-record batch. And
 *      countPendingDiffusion, the other reader in the widget's get_value, is a
 *      GIN containment COUNT over a 685k-row / 814 MB table.
 *
 * Both are cheap to write, invisible in a green test run, and expensive in
 * production — the exact shape a tripwire exists for. The narrow key set is
 * simultaneously the cost gate and the data-minimisation gate: the frames name
 * every owner's jobs to a global admin, so less on the wire is also less
 * exposure.
 *
 * The two source assertions read the REAL function bodies via
 * Function.prototype.toString() rather than slicing the file with a regex, so
 * they cannot drift out of sync with a moved function or a renamed section
 * comment.
 *
 * Scope honesty: this gate proves the SHAPE and the READER. It does not prove
 * a live stream's cost — that is what /api/v1/counters
 * (diffusion_queue_streams_opened/_closed) is for at runtime.
 *
 * COST: pure, DB-less, network-less → hermetic tier.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildQueueFollowStream, followQueueAction } from '../../src/diffusion/api/actions.ts';
import type { ActiveJobRow } from '../../src/diffusion/jobs/queue.ts';
import { listActiveJobs } from '../../src/diffusion/jobs/queue.ts';
import { queueJobView } from '../../src/diffusion/jobs/sse.ts';

/** Exactly what a progress display needs, and nothing else. */
const ALLOWED_JOB_KEYS = [
	'attempt',
	'cancel_requested',
	'counter',
	'job_id',
	'max_attempts',
	'msg',
	'process_id',
	'state',
	'total',
] as const;

/** Unbounded or privileged fields that must never reach this wire. */
const FORBIDDEN_JOB_KEYS = [
	'spec',
	'sqo',
	'checkpoint',
	'result',
	'errors',
	'runner',
	'owner_user_id',
] as const;

/** The wide readers the 1 Hz tick must never call. */
const FORBIDDEN_READERS = ['listJobsForCaller', 'countPendingDiffusion'] as const;

const REPO_ROOT = join(import.meta.dir, '..', '..');

/**
 * Source with comments removed, for the assertions that look for CODE.
 *
 * Necessary because this feature is heavily commented about the very things
 * being banned: the live module's header explains why it never calls
 * `self.refresh()` per frame, and the progress model explains why there is no
 * ETA. Scanning raw text makes those explanations fail the gate — punishing the
 * documentation for describing the invariant it documents. Same reasoning, and
 * the same fix, as client_caller_chain_tripwire.
 *
 * Conservative on purpose: block comments, then whole lines that are comments.
 * It never strips a `//` occurring after code, so it cannot silently eat a
 * string literal or a regex containing slashes.
 */
function codeOf(src: string): string {
	return src
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.split('\n')
		.filter((line) => {
			const t = line.trim();
			return !t.startsWith('//') && !t.startsWith('*');
		})
		.join('\n');
}

const FIXTURE: ActiveJobRow = {
	job_id: 'job-1',
	client_process_id: 'process_diffusion_-1_mdcat353_rsc170',
	state: 'running',
	counter_text: '1284300',
	total_text: '4000000',
	msg: 'Processing records...',
	cancel_requested: false,
	attempt: 1,
	max_attempts: 3,
	n_running: 1,
	n_queued: 0,
};

describe('follow_queue tripwire', () => {
	test('the streamed job frame carries EXACTLY the allowlisted keys', () => {
		const keys = Object.keys(queueJobView(FIXTURE)).sort();
		expect(
			keys,
			`The follow_queue job frame changed shape.\n\nThis frame is re-serialized once a second for every connected admin. Adding a field is a permanent per-second cost, and the unbounded ones (spec/sqo/errors/checkpoint/result) can make that cost unbounded. It is also the data-minimisation boundary: these frames name EVERY owner's jobs to a global admin.\n\nIf the addition is genuinely needed: bound it, add it here, and update the WC-067 entry in engineering/wire_contract/ in the same commit. If you only need it for one job on demand, the widget's get_value already carries the full row.`,
		).toEqual([...ALLOWED_JOB_KEYS]);
	});

	test('no unbounded or privileged field is reachable on the frame', () => {
		// Belt to the allowlist's braces: names the specific fields and why, so a
		// failure reads as an explanation rather than a diff.
		const view = queueJobView(FIXTURE) as unknown as Record<string, unknown>;
		for (const key of FORBIDDEN_JOB_KEYS) {
			expect(
				Object.hasOwn(view, key),
				`'${key}' appeared on the follow_queue wire. It is unbounded in size or is not the admin display's business; see the header of this file.`,
			).toBe(false);
		}
	});

	test('the 1 Hz tick never reaches for a wide reader', () => {
		// Reads the real function bodies, so moving or renaming code cannot make
		// this pass vacuously.
		const tickSource = [
			followQueueAction.toString(),
			buildQueueFollowStream.toString(),
			listActiveJobs.toString(),
		].join('\n');

		// guards the guard: prove we actually captured source, not "[native code]"
		expect(
			tickSource.length,
			'Could not read the queue-stream function bodies — this gate would pass vacuously.',
		).toBeGreaterThan(500);
		expect(tickSource).toContain('listActiveJobs');

		for (const reader of FORBIDDEN_READERS) {
			expect(
				tickSource.includes(reader),
				`The follow_queue tick reaches '${reader}'.\n\nlistJobsForCaller is the 24h/200-row HISTORY view over six whole jsonb columns; countPendingDiffusion is a GIN containment COUNT over a multi-hundred-megabyte table. Neither belongs on a per-second poll — the data they return either cannot change or changes only on unpublish.\n\nThe tick reads listActiveJobs and nothing else. History is refetched by the CLIENT, once, when the frame's membership marker changes.`,
			).toBe(false);
		}
	});

	test('the area_maintenance host keeps its widget teardown edges', () => {
		// These four lines in a SHARED host file are the only way a widget can
		// learn it stopped being visible. Nothing else in area_maintenance tells
		// it: collapsing an accordion was a bare class flip, the Map/List switch
		// is pure CSS, and the map view discarded widget DOM with innerHTML=''.
		// A host refactor that drops any of them silently strands whatever the
		// widget was holding — with no failing test anywhere near the widget.
		const host = readFileSync(
			join(REPO_ROOT, 'client/dedalo/core/area_maintenance/js/render_area_maintenance.js'),
			'utf8',
		);
		// Slice the collapse callback by its own boundaries rather than a
		// character window: a comment edit must not be able to break this gate.
		const collapseStart = host.indexOf('const collapse = () =>');
		const collapseBody =
			collapseStart === -1
				? ''
				: host.slice(collapseStart, host.indexOf('const expose', collapseStart));

		const edges: { name: string; present: boolean; why: string }[] = [
			{
				name: 'collapse → on_collapse',
				present: collapseBody.includes('on_collapse'),
				why: 'Collapsing the accordion must notify the widget. Without it a collapsed panel keeps its live resources open behind display:none.',
			},
			{
				name: 'expose → on_expose (after load)',
				present: host.includes('on_expose') && host.includes('trigger_open'),
				why: 'load() is one-shot guarded, so it cannot serve as the "visible now" signal on a RE-expose; on_expose must exist and must be chained after the load promise.',
			},
			{
				name: 'trigger_load returns its promise',
				present: /const trigger_load[\s\S]{0,600}?return Promise\.resolve\(loader\(\)\)/.test(host),
				why: 'Discarding the loader promise makes open-ordering unobservable: a live feed can start against the spinner DOM before self.value exists.',
			},
			{
				name: 'view switch dispatches dd_maintenance_view',
				present: host.includes('dd_maintenance_view'),
				why: 'Map/List is a CSS class flip; nodes stay connected and no callback fires. This event is the ONLY signal that a widget just became invisible.',
			},
			{
				name: 'select_tool destroys before innerHTML wipe',
				present: /widget_instance[\s\S]{0,300}?destroy\([\s\S]{0,300}?innerHTML\s*=\s*''/.test(
					host,
				),
				why: "innerHTML='' detaches nodes without teardown. The destroy loop must run BEFORE the wipe, or every widget the map view mounts is orphaned.",
			},
		];
		// guards the guard: a renamed callback would empty the slice and make the
		// first edge pass vacuously
		expect(
			collapseBody.length,
			'Could not locate the collapse callback in render_area_maintenance.js — this gate would check nothing.',
		).toBeGreaterThan(50);

		const missing = edges.filter((e) => !e.present);
		expect(
			missing.map((e) => `${e.name} — ${e.why}`),
			'An area_maintenance widget teardown edge is gone. See each line above.',
		).toEqual([]);
	});

	test('the client live layer owns exactly one stream and cleans it up', () => {
		const WIDGET = 'client/dedalo/core/area_maintenance/widgets/diffusion_server_control/js';
		// code only: the header comment legitimately NAMES the things banned below
		const live = codeOf(
			readFileSync(join(REPO_ROOT, WIDGET, 'live_diffusion_server_control.js'), 'utf8'),
		);

		// exactly ONE request_stream call site under area_maintenance, and it is
		// the widget model — not the render module, and not two of them
		const areaFiles = new Bun.Glob('client/dedalo/core/area_maintenance/**/*.js').scanSync(
			REPO_ROOT,
		);
		const openers: string[] = [];
		for (const rel of areaFiles) {
			const body = readFileSync(join(REPO_ROOT, rel), 'utf8');
			if (codeOf(body).includes('request_stream(')) openers.push(rel);
		}
		expect(
			openers,
			'Exactly one file under area_maintenance may open a stream. Two openers means two sockets per widget, and the teardown below only tracks one.',
		).toEqual([`${WIDGET}/diffusion_server_control.js`]);

		const rules: { name: string; ok: boolean; why: string }[] = [
			{
				name: 'cancels its reader',
				ok: live.includes('.cancel('),
				why: 'Without an explicit cancel the socket and the server-side poll+heartbeat outlive the widget.',
			},
			{
				name: 'splices its OWN reader out of the global registry',
				ok:
					live.includes('stream_readers') &&
					live.includes('splice(') &&
					!live.includes('stream_readers.length = 0'),
				why: 'page_globals.stream_readers is shared with make_backup / unit_test / move_* / tool_diffusion. Clearing it orphans their readers too.',
			},
			{
				name: 'balances its document listeners',
				ok:
					(live.match(/document\.addEventListener/g) ?? []).length ===
					(live.match(/document\.removeEventListener/g) ?? []).length,
				why: 'A listener added on create and not removed on destroy keeps the controller (and its DOM) alive after teardown.',
			},
			{
				name: 'disconnects its observer',
				ok: !live.includes('new IntersectionObserver') || live.includes('.disconnect()'),
				why: 'An IntersectionObserver holds a strong reference to the observed node.',
			},
			{
				name: 'never rebuilds the widget per frame',
				ok: !/self\.refresh\(/.test(live) && !/reload_widget\(/.test(live),
				why: 'A rebuild per frame destroys focus, the purge-hours input value and scroll position once a second. Frames PATCH; only a membership change reloads, via the injected on_reload.',
			},
			{
				name: 'uses no timer of its own',
				ok: !live.includes('setInterval('),
				why: 'The SSE heartbeat is the clock. A second timer is a second thing to leak.',
			},
			{
				name: 'registers for framework teardown',
				ok: codeOf(
					readFileSync(join(REPO_ROOT, WIDGET, 'render_diffusion_server_control.js'), 'utf8'),
				).includes('ar_instances.push'),
				why: 'do_delete_dependencies only destroys ar_instances entries; an unregistered controller is invisible to refresh({destroy:true}).',
			},
		];
		const broken = rules.filter((r) => !r.ok);
		expect(
			broken.map((r) => `${r.name} — ${r.why}`),
			'The live layer broke one of its resource rules.',
		).toEqual([]);
	});

	test('the progress model has ONE definition and stays honest', () => {
		const WIDGET = 'client/dedalo/core/area_maintenance/widgets/diffusion_server_control/js';
		const model = readFileSync(join(REPO_ROOT, WIDGET, 'progress_model.js'), 'utf8');
		const render = readFileSync(
			join(REPO_ROOT, WIDGET, 'render_diffusion_server_control.js'),
			'utf8',
		);
		const live = readFileSync(join(REPO_ROOT, WIDGET, 'live_diffusion_server_control.js'), 'utf8');
		// the ETA ban is about CODE — the modules explain at length WHY there is
		// no ETA, and that explanation must not fail the gate
		const codeSources = [model, render, live].map(codeOf);

		// One definition, two importers. A second copy would not fail loudly — it
		// would DRIFT, and the symptom is a bar whose fill disagrees with its own
		// caption while a job runs.
		expect(model).toContain('export const progress_view');
		for (const [name, src] of [
			['render', render],
			['live', live],
		] as const) {
			expect(
				src.includes("from './progress_model.js'"),
				`The ${name} module must IMPORT the shared progress model, never re-implement it.`,
			).toBe(true);
			expect(
				/const progress_view\s*=/.test(codeOf(src)),
				`The ${name} module defines its own progress_view. There must be exactly one, in progress_model.js.`,
			).toBe(false);
		}

		// The honesty rules the whole feature is built on (see progress_model.js).
		expect(
			model.includes('(estimated)'),
			'The percentage must be labelled "(estimated)": the total is a client estimate the server never re-counts.',
		).toBe(true);
		expect(
			model.includes('Estimate exceeded'),
			'counter > total must be REPORTED, not clamped into a plausible-looking number.',
		).toBe(true);
		for (const src of codeSources) {
			expect(
				/\b(time_remaining|eta|remaining_time)\b/i.test(src),
				'A time-remaining estimate reappeared. The engine reports CUMULATIVE elapsed, not per-record, so any ETA derived from it is wrong — tool_diffusion deleted its own for exactly this reason.',
			).toBe(false);
		}
	});

	test('every infinite animation has a reduced-motion escape, and motion lives in the kit', () => {
		// WHY THIS IS NOT JUST "respect the preference": general.less collapses
		// every animation to 0.001ms with iteration-count 1 under reduced motion.
		// For a SWEEPING fill that is not "no animation" — it parks the element on
		// its final keyframe, translateX(333%), entirely off the track. The bar
		// then reads EMPTY while a job is actively running: strictly worse than
		// no animation, and invisible to anyone not testing with the preference on.
		// So an infinite animation must declare its own resting state.
		const sheets = [
			'client/dedalo/core/area_maintenance/css/widget_kit.less',
			'client/dedalo/core/area_maintenance/css/area_maintenance.less',
			...new Bun.Glob('client/dedalo/core/area_maintenance/widgets/**/css/*.less').scanSync(
				REPO_ROOT,
			),
		];
		expect(
			sheets.length,
			'no stylesheets discovered — this gate would prove nothing',
		).toBeGreaterThan(5);

		const problems: string[] = [];
		for (const rel of sheets) {
			const css = readFileSync(join(REPO_ROOT, rel), 'utf8');

			// (a) motion belongs to the KIT, so there is one place to audit it
			if (rel.includes('/widgets/') && /@keyframes\s+/.test(css)) {
				problems.push(
					`${rel} declares @keyframes. Motion belongs in widget_kit.less so every animation is auditable in one place.`,
				);
			}

			// (b) every infinite animation names a keyframe that also has a
			//     prefers-reduced-motion override in the same file
			for (const match of css.matchAll(/animation:\s*([a-zA-Z0-9_-]+)[^;]*\binfinite\b/g)) {
				const name = match[1] as string;
				const reduced = /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css);
				const overridden =
					reduced &&
					new RegExp(
						`@media\\s*\\(prefers-reduced-motion:\\s*reduce\\)[\\s\\S]*?${name}[\\s\\S]*?\\}`,
					).test(css);
				// the override may target the SELECTOR rather than repeat the
				// keyframe name, so accept either form
				const selectorOverride =
					reduced &&
					/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation:\s*none/.test(css);
				if (!overridden && !selectorOverride) {
					problems.push(
						`${rel}: animation '${name}' runs INFINITE with no prefers-reduced-motion override in the same file. Under the global 0.001ms collapse it will freeze on its LAST keyframe — declare the resting state you actually want.`,
					);
				}
			}
		}
		expect(problems, problems.join('\n')).toEqual([]);
	});

	test('the active-set query stays narrow and indexed', () => {
		const source = listActiveJobs.toString();
		// the partial index <table>_state_idx exists for exactly this predicate
		expect(source).toContain("state IN ('queued','running')");
		// jsonb projected to scalars in SQL, never whole columns
		expect(source).toContain("totals->>'counter'");
		// window aggregates, so the LIMIT is an output cap and never a correctness cap
		expect(source).toContain('OVER ()');
		expect(
			/\bspec\b|\bcheckpoint\b|\bresult\b/.test(source),
			'listActiveJobs selects a wide jsonb column. Those columns are unbounded (spec carries the whole sanitized SQO) and this query runs once a second per admin.',
		).toBe(false);
	});
});
