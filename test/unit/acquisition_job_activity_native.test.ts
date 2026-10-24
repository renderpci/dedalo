/**
 * Acquisition "Check my jobs" ↔ the server's REAL job rows (cross-client r5).
 *
 * When a commit dispatch's outcome is unknown, both acquisition tools read the
 * operator's own jobs (dd_utils_api::get_activity), keep the rows of THIS
 * action, and follow one to its end with get_process_status. An EMPTY list is
 * what offers a new attempt — so a client rule that stopped matching what the
 * server mints would offer a SECOND commit beside a running first one.
 *
 * ActivityRow declares no kind / pfile field (job_id is documented opaque), so
 * the client reads the job manager's id grammar `<kind>_<pid>_<counter>`
 * (media/jobs.ts nextId, kind `<tool>_<action>` from tools/background.ts) and
 * the pfile `<job id>.json`. This gate pins THAT dependency by outcome: REAL
 * background jobs submitted through scheduleBackground with each tool's REAL
 * loaded module (its own name, backgroundRunnable, lane declaration), their
 * rows read through the REAL get_activity handler and JSON round-tripped, fed
 * to the SHIPPED client functions (job_row_of_kind / job_row_follow_handle,
 * copied verbatim from each renderer), and the handle they derive opened with
 * the REAL get_process_status. A server rename of the id grammar, the kind
 * spelling or the pfile naming turns this red.
 *
 * The handler is a gated stub (the spec is scheduleBackground's own argument):
 * the real commit handler WRITES heritage records, and what is under test is
 * the job identity, not the import. Hermetic: a marked scratch job-registry dir,
 * a unique owner id, no DB write.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { ApiRequestContext } from '../../src/core/api/handler_context.ts';
import { utilsApiActions } from '../../src/core/api/handlers/dd_utils_api.ts';
import { getUtilsProcessStatus } from '../../src/core/api/process_status.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { ok } from '../../src/core/errors/convert.ts';
import { mediaJobs } from '../../src/core/media/jobs.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { scheduleBackground } from '../../src/core/tools/background.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import type { ToolActionSpec } from '../../src/core/tools/module.ts';
import { markProcessesDir } from '../helpers/test_media_root.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
/** A unique owner: no other gate's jobs can reach this user's activity rows. */
const OWNER_ID = -917_203;
const OWNER: Principal = { userId: OWNER_ID, isGlobalAdmin: false, isDeveloper: false };

const TOOLS = [
	{ name: 'tool_numisdata_acquisition', commit: 'commit_lots' },
	{ name: 'tool_bibliography_acquisition', commit: 'commit_publications' },
] as const;

type ActivityRowWire = { source: string; job_id: string; status: string };
type ClientJobRows = {
	job_row_of_kind: (row: unknown, jobKind: string) => boolean;
	job_row_follow_handle: (row: unknown) => { pid: string; pfile: string };
};

let scratchRoot = '';
let previousProcessesDir: string | undefined;
const clients = new Map<string, ClientJobRows>();

/** The renderer's imports — browser modules; the functions under test touch none of them. */
const RENDERER_IMPORT_STUBS: Record<string, string> = {
	'core/common/js/api_error.js':
		'export const normalize_stream_error = () => null\nexport const request_failed = () => false\nexport const response_data = () => null\n',
	'core/common/js/data_manager.js':
		'export const data_manager = {}\nexport const release_stream_reader = () => {}\n',
	'core/common/js/error_dispatch.js':
		'export const handle_api_error = () => {}\nexport const outcome_unknown = () => false\n',
	'core/common/js/render_api_error.js': "export const error_text = () => ''\n",
	'core/common/js/render_common.js': 'export const render_stream = () => {}\n',
	'core/common/js/ui.js': 'export const ui = {}\n',
	'core/common/js/utils/render_escape.js': 'export const escape_html = (value) => value\n',
};

/**
 * Each renderer is copied VERBATIM (the shipped bytes) into a scratch tree
 * whose `core/common/js` imports are stubs — no `mock.module`, nothing leaks.
 */
beforeAll(async () => {
	scratchRoot = mkdtempSync(join(tmpdir(), 'dd-acq-jobs-'));
	previousProcessesDir = process.env.DEDALO_MEDIA_PROCESSES_DIR;
	process.env.DEDALO_MEDIA_PROCESSES_DIR = markProcessesDir(join(scratchRoot, 'processes'));
	for (const [path, source] of Object.entries(RENDERER_IMPORT_STUBS)) {
		mkdirSync(dirname(join(scratchRoot, path)), { recursive: true });
		writeFileSync(join(scratchRoot, path), source);
	}
	for (const { name } of TOOLS) {
		const relative = `tools/${name}/js/render_${name}.js`;
		mkdirSync(dirname(join(scratchRoot, relative)), { recursive: true });
		cpSync(join(REPO_ROOT, relative), join(scratchRoot, relative));
		const renderer = (await import(join(scratchRoot, relative))) as Partial<ClientJobRows>;
		if (
			typeof renderer.job_row_of_kind !== 'function' ||
			typeof renderer.job_row_follow_handle !== 'function'
		) {
			throw new Error(`${relative} no longer exports job_row_of_kind / job_row_follow_handle`);
		}
		clients.set(name, renderer as ClientJobRows);
	}
});

afterAll(() => {
	if (previousProcessesDir === undefined)
		Reflect.deleteProperty(process.env, 'DEDALO_MEDIA_PROCESSES_DIR');
	else process.env.DEDALO_MEDIA_PROCESSES_DIR = previousProcessesDir;
	if (scratchRoot !== '') rmSync(scratchRoot, { recursive: true, force: true });
});

/** A handler that holds its job live until `release`, then succeeds. */
function gatedSpec(gate: Promise<void>): ToolActionSpec {
	return {
		permission: null,
		gatedInHandler: 'test fixture — the job identity is under test, not any gate',
		handler: async () => {
			await gate;
			return ok({ results: [] }, { requestId: 'acq-job-activity' });
		},
	};
}

/** Submit one REAL background job of `tool`::`method` for OWNER; the dispatch envelope. */
async function submit(
	tool: string,
	method: string,
	gate: Promise<void>,
): Promise<{ job_id: string; pfile: string }> {
	const loaded = await getLoadedTool(tool);
	if (loaded === undefined) throw new Error(`${tool} did not load`);
	expect(loaded.module.backgroundRunnable ?? []).toContain(method);
	const started = scheduleBackground(
		loaded,
		method,
		gatedSpec(gate),
		{},
		OWNER,
		OWNER_ID,
	) as unknown as {
		job_id: string;
		pfile: string;
	};
	expect(typeof started.job_id).toBe('string');
	return { job_id: started.job_id, pfile: started.pfile };
}

/** The operator's own rows as the client receives them: the real handler, over JSON. */
async function activityRows(): Promise<ActivityRowWire[]> {
	const context = {
		requestId: `acq-${crypto.randomUUID()}`,
		clientIp: '127.0.0.1',
		session: null,
		csrfCandidate: null,
		principal: OWNER,
	} as unknown as ApiRequestContext;
	const result = await utilsApiActions.get_activity?.({} as Rqo, context);
	const body = JSON.parse(JSON.stringify((result as { body: unknown }).body)) as { jobs?: unknown };
	expect(Array.isArray(body.jobs)).toBe(true);
	return body.jobs as ActivityRowWire[];
}

/** The first frame get_process_status streams for a handle — the client's own follow. */
async function firstFrame(handle: {
	pid: string;
	pfile: string;
}): Promise<Record<string, unknown>> {
	const outcome = getUtilsProcessStatus(
		{
			dd_api: 'dd_utils_api',
			action: 'get_process_status',
			update_rate: 250,
			options: { pid: handle.pid, pfile: handle.pfile },
		} as unknown as Rqo,
		OWNER,
	);
	const reader = (outcome.stream as ReadableStream<Uint8Array>).getReader();
	const { value } = await reader.read();
	await reader.cancel();
	const part = new TextDecoder()
		.decode(value)
		.split('data:\n')
		.map((chunk) => chunk.trim())
		.find((chunk) => chunk !== '');
	return JSON.parse(part as string) as Record<string, unknown>;
}

async function until(predicate: () => boolean, what: string): Promise<void> {
	const deadline = Date.now() + 10_000;
	while (!predicate()) {
		if (Date.now() > deadline) throw new Error(`timed out waiting for: ${what}`);
		await Bun.sleep(20);
	}
}

describe('acquisition Check-my-jobs reads the jobs the server REALLY mints', () => {
	for (const { name, commit } of TOOLS) {
		test(`${name}: the client picks out its live ${commit} job, and its handle follows that job`, async () => {
			const client = clients.get(name) as ClientJobRows;
			const commitKind = `${name}_${commit}`;
			const gate = Promise.withResolvers<void>();
			const committed = await submit(name, commit, gate.promise);
			// a job of the SAME tool, another action: never "one of this kind"
			const previewed = await submit(name, 'preview_url', gate.promise);
			try {
				// (a lane slot held by another file's job would leave it queued)
				await until(
					() => mediaJobs.status(committed.job_id)?.status === 'running',
					'the commit job runs',
				);
				const rows = await activityRows();
				const live = rows.filter((row) => row.job_id === committed.job_id);
				expect(live.length).toBe(1);

				const picked = rows.filter((row) => client.job_row_of_kind(row, commitKind));
				expect(picked.map((row) => row.job_id)).toEqual([committed.job_id]);
				expect(rows.some((row) => row.job_id === previewed.job_id)).toBe(true);
				expect(
					client.job_row_of_kind(
						rows.find((row) => row.job_id === previewed.job_id),
						commitKind,
					),
				).toBe(false);

				// the derived handle IS the dispatch's own, and the server streams THAT job
				const handle = client.job_row_follow_handle(picked[0]);
				expect(handle.pfile).toBe(committed.pfile);
				const frame = await firstFrame(handle);
				expect(frame.errors).toEqual([]);
				expect(basename(String(frame.pfile))).toBe(committed.pfile);
				expect((frame.data as { msg?: unknown }).msg).toBe(`Running ${name}::${commit}`);
				expect(frame.is_running).toBe(true);
			} finally {
				gate.resolve();
			}

			// ended inside the recency window: still listed, still picked out, so
			// the client offers "follow it", never a blind new attempt
			await until(
				() => mediaJobs.status(committed.job_id)?.status === 'done',
				'the commit job ends',
			);
			const after = (await activityRows()).filter((row) => client.job_row_of_kind(row, commitKind));
			expect(after.map((row) => [row.job_id, row.status])).toEqual([[committed.job_id, 'done']]);
			const ended = await firstFrame(client.job_row_follow_handle(after[0]));
			expect(ended.is_running).toBe(false);
			expect(ended.errors).toEqual([]);
		});
	}
});
