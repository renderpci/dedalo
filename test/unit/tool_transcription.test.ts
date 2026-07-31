/**
 * R1 gate: tool_transcription LOCAL half + the remote-ASR seam. The core builds
 * the audio_tr WAV from a scratch AV original with the REAL ffmpeg binary, is
 * idempotent, and hard-deletes. The tool module loads with the full action
 * surface (permission: null → imperative media_ddo gates). The remote seam is
 * exercised through stubs: status-poll body construction, SSRF fail-closed,
 * segment→TC-text conversion (seg2tc parity), and the bounded completion poll
 * with an injected save. Full tool_request→DB drive is ledgered (media not
 * synced here), matching the media_tools.test.ts convention.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { config } from '../../src/config/config.ts';
import { mediaTypeOf } from '../../src/core/concepts/media.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { runBinary } from '../../src/core/media/engine/spawn.ts';
import type { MediaIdentity, MediaPathOptions } from '../../src/core/media/path.ts';
import {
	deleteTranscribableAudio,
	ensureTranscribableAudio,
	transcribableAudioLocation,
} from '../../src/core/media/tools/transcription.ts';
import { secondsToTc } from '../../src/core/resolve/tr_marks.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { getToolConfig, resetConfigCache } from '../../src/core/tools/config.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import {
	type TranscriberStatusRequest,
	babelTranscriberStatusProvider,
	buildTranscriberStatusBody,
	hasExistingTranscription,
	mapTranscriberEngine,
	pollTranscriptionCompletion,
	resolveTranscriberConfig,
	resolveTranscriberProvider,
	resolveTranscriberStatusProvider,
	segmentsToTcText,
} from '../../src/core/tools/transcription_asr.ts';
import { mustGet } from '../helpers/assert.ts';

const ROOT = `${tmpdir()}/dedalo_transcription_${process.pid}`;
const av = mediaTypeOf('component_av')!;
const HAVE_FFMPEG = existsSync(config.media.binaries.ffmpeg);
const identity: MediaIdentity = {
	componentTipo: 'rsc439',
	sectionTipo: 'rsc170',
	sectionId: 7,
	lang: null,
};
const pathOpts: MediaPathOptions = { initialMediaPath: '', maxItemsFolder: null, mediaRoot: ROOT };

/** Make a scratch AV original: a short mp4 with an audio stream (sine tone). */
async function makeAvOriginal(): Promise<void> {
	const abs = `${ROOT}/av/original/rsc439_rsc170_7.mp4`;
	mkdirSync(abs.slice(0, abs.lastIndexOf('/')), { recursive: true });
	await runBinary(
		[
			config.media.binaries.ffmpeg,
			'-y',
			'-f',
			'lavfi',
			'-i',
			'sine=frequency=440:duration=1',
			'-c:a',
			'aac',
			abs,
		],
		{ nice: false },
	);
}

beforeAll(() => rmSync(ROOT, { recursive: true, force: true }));
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

describe('tool_transcription local core', () => {
	test.if(HAVE_FFMPEG)(
		'ensureTranscribableAudio builds the audio_tr WAV from the AV original',
		async () => {
			await makeAvOriginal();
			const rel = await ensureTranscribableAudio(av, identity, pathOpts);
			expect(rel).toBe('/av/audio_tr/rsc439_rsc170_7.wav');
			expect(existsSync(transcribableAudioLocation(av, identity, pathOpts).absolutePath)).toBe(
				true,
			);
		},
	);

	test.if(HAVE_FFMPEG)('ensure is idempotent — reuses the existing WAV', async () => {
		const rel = await ensureTranscribableAudio(av, identity, pathOpts);
		expect(rel).toBe('/av/audio_tr/rsc439_rsc170_7.wav');
	});

	test.if(HAVE_FFMPEG)('delete removes it (true), then is a no-op (false)', () => {
		expect(deleteTranscribableAudio(av, identity, pathOpts)).toBe(true);
		expect(existsSync(transcribableAudioLocation(av, identity, pathOpts).absolutePath)).toBe(false);
		expect(deleteTranscribableAudio(av, identity, pathOpts)).toBe(false);
	});

	test('ensure rejects a non-av component', async () => {
		const image = mediaTypeOf('component_image')!;
		await expect(ensureTranscribableAudio(image, identity, pathOpts)).rejects.toThrow(
			/component_av/,
		);
	});
});

describe('tool_transcription module', () => {
	test('loads with the full action surface', async () => {
		const loaded = await getLoadedTool('tool_transcription');
		expect(loaded).not.toBeNull();
		const actions = loaded!.module.apiActions;
		expect(Object.keys(actions).sort()).toEqual([
			'automatic_transcription',
			'build_subtitles_file',
			'check_server_transcriber_status',
			'create_transcribable_audio_file',
			'delete_transcribable_audio_file',
			// Admin-gated in-UI model seeding (validated against the catalog).
			'download_model',
			// Where the BROWSER engine may load its model from. The browser cannot
			// read the install's configuration, so the operator's model-store and
			// hub-fallback settings would otherwise be inert.
			'get_model_sources',
		]);
		// permission: null → each handler gates imperatively against its ddo.
		expect(
			mustGet(actions.create_transcribable_audio_file, 'create_transcribable_audio_file')
				.permission,
		).toBeNull();
		expect(
			mustGet(actions.automatic_transcription, 'automatic_transcription').permission,
		).toBeNull();
		expect(
			mustGet(actions.check_server_transcriber_status, 'check_server_transcriber_status')
				.permission,
		).toBeNull();
		expect(mustGet(actions.build_subtitles_file, 'build_subtitles_file').permission).toBeNull();
	});

	test('the background actions are allowlisted but NOT client-routable', async () => {
		const loaded = await getLoadedTool('tool_transcription');
		expect(loaded!.module.backgroundRunnable).toEqual([
			'check_background_transcriber_status',
			'background_download_model',
		]);
		// absent from apiActions — an action not in the map is unroutable.
		expect(loaded!.module.apiActions.check_background_transcriber_status).toBeUndefined();
		expect(loaded!.module.apiActions.background_download_model).toBeUndefined();
	});

	test('download_model refuses everyone but a global administrator', async () => {
		// The action makes the SERVER fetch ~1 GB from the public hub and write it
		// to disk — an operator act. The refusal must run before any catalog read.
		const loaded = await getLoadedTool('tool_transcription');
		const handler = loaded!.module.apiActions.download_model!.handler;
		const response = await handler({
			principal: stubPrincipal, // not an admin
			userId: 7,
			options: { model: 'onnx-community/whisper-large-v3-turbo' },
			background: false,
		});
		expect(response.result).toBe(false);
		expect(response.msg).toContain('administrator');
	});

	test('download_model refuses a model that is not in the catalog', async () => {
		// The id becomes a hub URL path and a store directory — free-form input
		// would download arbitrary repos or write outside the intended folder.
		const loaded = await getLoadedTool('tool_transcription');
		const handler = loaded!.module.apiActions.download_model!.handler;
		const admin: Principal = { userId: 1, isGlobalAdmin: true, isDeveloper: false };
		const response = await handler({
			principal: admin,
			userId: 1,
			options: { model: '../../evil/path' },
			background: false,
		});
		expect(response.result).toBe(false);
		expect(response.msg).toContain('not in the transcriber catalog');
	});
});

const stubPrincipal: Principal = { userId: 7, isGlobalAdmin: false, isDeveloper: false };

/**
 * The REAL envelope a failing poll puts on the wire, harvested once.
 *
 * The honesty branch needs the poll to actually REACH the provider, which needs
 * DEDALO_MEDIA_EXPORT_BASE (unset on a dev box, where the URL builder refuses
 * first). `config` freezes at import, so overlay it in a child — same pattern as
 * media_export_base.test.ts. The uri stays loopback, so the SSRF guard answers
 * `{result:false,…}` with no network call. Memoized: the client-coupling test
 * feeds this exact object to the browser poller.
 */
let failureEnvelope: { result: unknown; msg: string; errors: string[] } | null = null;
function liveFailureEnvelope(): { result: unknown; msg: string; errors: string[] } {
	if (failureEnvelope !== null) return failureEnvelope;
	const script = [
		"const {getLoadedTool}=await import('./src/core/tools/loader.ts');",
		"const t=await getLoadedTool('tool_transcription');",
		'const r=await t.module.apiActions.check_server_transcriber_status.handler({',
		'principal:{userId:-1,isGlobalAdmin:true,isDeveloper:true},userId:-1,background:false,',
		"options:{media_ddo:{component_tipo:'rsc35',section_tipo:'rsc167',section_id:1},",
		"transcriber_engine:'babel_transcriber',pid:4321}});",
		'console.log(JSON.stringify(r));',
	].join('');
	const probe = Bun.spawnSync(
		['bun', '--preload', './test/preload/component_registry.ts', '-e', script],
		{
			cwd: `${import.meta.dir}/../..`,
			env: {
				...process.env,
				DEDALO_DATABASE_CONN: 'dedalo7ts_test',
				DEDALO_MEDIA_EXPORT_BASE: 'http://media.example.org/dedalo/media',
			},
		},
	);
	const line = probe.stdout.toString().trim().split('\n').pop() ?? '{}';
	failureEnvelope = JSON.parse(line) as { result: unknown; msg: string; errors: string[] };
	return failureEnvelope;
}

describe('check_server_transcriber_status handler', () => {
	test('denies fail-closed on an invalid media_ddo record target (READ gate)', async () => {
		const loaded = await getLoadedTool('tool_transcription');
		const handler = loaded!.module.apiActions.check_server_transcriber_status!.handler;
		const response = await handler({
			principal: stubPrincipal,
			userId: 7,
			options: {
				media_ddo: { component_tipo: 'rsc439', section_tipo: 'bad tipo!', section_id: 1 },
				transcriber_engine: 'babel_transcriber',
				pid: 123,
			},
			background: false,
		});
		expect(response.result).toBe(false);
		expect(response.msg).toContain('invalid record target');
	});

	test('reports the missing required parameters (PHP message shape)', async () => {
		const loaded = await getLoadedTool('tool_transcription');
		const handler = loaded!.module.apiActions.check_server_transcriber_status!.handler;
		const response = await handler({
			principal: stubPrincipal,
			userId: 7,
			options: {},
			background: false,
		});
		expect(response.result).toBe(false);
		expect(response.msg).toBe('Missing required parameters: media_ddo, transcriber_engine, pid');
	});
});

/**
 * The READ-gated poll, driven end to end against a SEEDED dd996 transcriber
 * config. Three regressions in one drive (audit 2026-07-28):
 *  1. the entry list was read at `config.transcriber_config.value`, a shape
 *     getToolConfig never emits — so BOTH remote-ASR actions were dead, always
 *     answering "Transcriber config (uri/key) is not defined";
 *  2. the poll called ensureAudioQuality, i.e. a level-1 READ action could fire
 *     an ffmpeg transcode and write a media file (PHP only builds the URL);
 *  3. an unreachable/blocked transcriber came back as `msg:'OK. Request done'`
 *     with `errors:[]` — a dead ASR server read as success (and the client maps
 *     a status-less response to its `default:` "Process done" branch).
 * The seeded uri is loopback, so the SSRF guard trips: no network is touched.
 */
describe('check_server_transcriber_status against a configured transcriber', () => {
	const SCRATCH_SECTION_ID = 990041;
	// SUPERUSER_ID: the gate is not the subject here — the poll's behaviour is.
	const adminPrincipal: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };

	beforeAll(async () => {
		await sql`DELETE FROM matrix_tools WHERE section_tipo = 'dd996' AND section_id = ${SCRATCH_SECTION_ID}`;
		await sql`
			INSERT INTO matrix_tools (section_id, section_tipo, string, misc)
			VALUES (
				${SCRATCH_SECTION_ID},
				'dd996',
				${'{"dd1326":[{"id":1,"value":"tool_transcription"}]}'}::text::jsonb,
				${'{"dd999":[{"id":1,"value":{"transcriber_config":[{"name":"babel_transcriber","uri":"http://127.0.0.1:9/api/","key":"scratch-key"}]}}]}'}::text::jsonb
			)`;
		resetConfigCache();
	});
	afterAll(async () => {
		await sql`DELETE FROM matrix_tools WHERE section_tipo = 'dd996' AND section_id = ${SCRATCH_SECTION_ID}`;
		resetConfigCache();
	});

	test('the seeded config resolves through the real getToolConfig shape', async () => {
		expect(
			resolveTranscriberConfig(await getToolConfig('tool_transcription'), 'babel_transcriber'),
		).toEqual({ uri: 'http://127.0.0.1:9/api/', key: 'scratch-key' });
	});

	test('never transcodes, and never reports a failed poll as OK', async () => {
		const loaded = await getLoadedTool('tool_transcription');
		const handler = loaded!.module.apiActions.check_server_transcriber_status!.handler;
		const response = await handler({
			principal: adminPrincipal,
			userId: -1,
			options: {
				media_ddo: { component_tipo: 'rsc35', section_tipo: 'rsc167', section_id: 1 },
				transcriber_engine: 'babel_transcriber',
				pid: 4321,
			},
			background: false,
		});
		// It got PAST the config lookup (regression 1).
		expect(response.msg).not.toContain('Transcriber config');
		// It never asked for the audio quality to be BUILT (regression 2):
		// 'AV original file not found' is ensureAudioQuality's error and can only
		// surface here if the read path tries to transcode.
		expect(response.msg).not.toContain('AV original file not found');
		// And it did not dress a failure up as a success (regression 3): the
		// loopback uri is refused by the SSRF guard (or, when
		// DEDALO_MEDIA_EXPORT_BASE is unset, the URL builder refuses first) —
		// either way this call cannot succeed, so it must not say 'OK.'.
		expect(response.result).toBe(false);
		expect(response.msg.startsWith('OK.')).toBe(false);
		expect((response.errors ?? []).length).toBeGreaterThan(0);
	});

	/**
	 * The honesty branch needs the poll to actually REACH the provider, which
	 * needs DEDALO_MEDIA_EXPORT_BASE (unset on a dev box, where the URL builder
	 * refuses first). `config` freezes at import, so overlay it in a child —
	 * same pattern as media_export_base.test.ts. The uri stays loopback, so the
	 * SSRF guard answers `{result:false,…}` with no network call.
	 */
	test('a provider failure is reported as a failure, never as OK', () => {
		const response = liveFailureEnvelope();
		expect(response.result).toBe(false);
		expect(response.msg).toBe('invalid transcriber URL');
		expect(response.errors).toEqual(['invalid transcriber URL']);
	});
});

/**
 * CLIENT half of the outage-honesty contract (audit 2026-07-28).
 *
 * The server now answers a dead/blocked ASR server with `{result:false,…}`, but
 * the browser is what the user reads: `get_server_status()` in
 * tools/tool_transcription/js/render_tool_transcription.js switches on
 * `response.result.status`, and a status-less envelope used to fall through to
 * `case 3: default:` — rendering "Process done" AND deleting the stored pid.
 * A dead transcriber therefore looked like a finished transcription and threw
 * away the only handle to the running job.
 *
 * The client module is served over HTTP (its imports resolve to /dedalo/core/…,
 * which does not exist on disk), so it cannot be imported directly. This
 * harness loads the REAL source text, strips the import block, and re-exports
 * the module-scoped poller — every assertion below runs the shipped code.
 */
const CLIENT_SOURCE = `${import.meta.dir}/../../tools/tool_transcription/js/render_tool_transcription.js`;

interface StubNode {
	textContent: string;
	classList: {
		add: (c: string) => void;
		remove: (c: string) => void;
		contains: (c: string) => boolean;
	};
}
function stubNode(...initial: string[]): StubNode {
	const classes = new Set<string>(initial);
	return {
		textContent: '',
		classList: {
			add: (c: string) => {
				classes.add(c);
			},
			remove: (c: string) => {
				classes.delete(c);
			},
			contains: (c: string) => classes.has(c),
		},
	};
}

let getServerStatus: (options: unknown) => void;

async function loadClientPoller(): Promise<(options: unknown) => void> {
	const raw = await Bun.file(CLIENT_SOURCE).text();
	// named ({ a, b }) OR default (Split) imports — the module uses both.
	const stripped = raw.replace(
		/^[ \t]*import\s+(?:\{[^}]*\}|[A-Za-z_$][\w$]*)\s+from\s+'[^']*'[ \t]*;?[ \t]*$/gm,
		'',
	);
	// Fail LOUDLY if the import shape changed: a silent strip failure would make
	// the whole describe unloadable-but-green in the worst case.
	// (!) Asserts NO import survives, rather than naming one path prefix: the
	// previous check only knew about '../../../core/', so a default import of
	// '../../../lib/split/…' sailed past it and blew up at module load instead.
	if (/^[ \t]*import\s/m.test(stripped)) {
		throw new Error('client harness: the import block was not stripped — update the regex');
	}
	if (!stripped.includes('const get_server_status')) {
		throw new Error('client harness: get_server_status not found in the client source');
	}
	const probe = `${ROOT}/client_probe/render_tool_transcription.probe.mjs`;
	await Bun.write(probe, `${stripped}\nexport { get_server_status }\n`);
	const module = (await import(probe)) as { get_server_status: (options: unknown) => void };
	return module.get_server_status;
}

/** Drive one poll cycle against a stubbed browser world. */
async function drivePoll(response: unknown, storedPid: number | null = 4321) {
	const deleted: string[] = [];
	const scheduled: number[] = [];
	const refreshes: number[] = [];
	const requests: unknown[] = [];
	// the real node is created as 'status_container hide' (.hide = display:none)
	const status_container = stubNode('hide');
	const button = stubNode('disable');

	// biome-ignore lint/suspicious/noExplicitAny: browser globals the client module reads free.
	const g = globalThis as any;
	const prior = { data_manager: g.data_manager, setTimeout: g.setTimeout };
	g.data_manager = {
		get_local_db_data: async (id: string) => (storedPid === null ? null : { id, pid: storedPid }),
		delete_local_db_data: (id: string) => {
			deleted.push(id);
		},
	};
	// Record the re-poll / refresh scheduling WITHOUT firing it (4s in real time).
	g.setTimeout = (_fn: unknown, ms: number) => {
		scheduled.push(ms);
		return 0;
	};
	const self = {
		media_component: { section_tipo: 'rsc167', section_id: 1 },
		transcription_component: {
			refresh: () => {
				refreshes.push(1);
			},
		},
		get_tool_label: () => null, // unlabelled instance → the literal fallbacks
		check_server_transcriber_status: async (options: unknown) => {
			requests.push(options);
			return response;
		},
	};
	const nodes = {
		status_container,
		button_automatic_transcription: button,
		transcriber_engine_select: { value: 'babel_transcriber' },
	};

	try {
		getServerStatus({ self, nodes });
		// every stubbed await resolves immediately: draining the microtask queue
		// runs the whole poll deterministically, with no wall-clock dependency.
		for (let i = 0; i < 100; i++) await Promise.resolve();
	} finally {
		g.data_manager = prior.data_manager;
		g.setTimeout = prior.setTimeout;
	}

	return { deleted, scheduled, refreshes, requests, status_container, button };
}

describe('client poll honesty (render_tool_transcription.get_server_status)', () => {
	beforeAll(async () => {
		getServerStatus = await loadClientPoller();
	});

	test('a {result:false} envelope is NOT rendered as a finished transcription', async () => {
		const run = await drivePoll({
			result: false,
			msg: 'invalid transcriber URL',
			errors: ['invalid transcriber URL'],
		});
		// the whole point: the user must not read "Process done"
		expect(run.status_container.textContent).not.toBe('Process done');
		expect(run.status_container.textContent).toContain('invalid transcriber URL');
		expect(run.status_container.classList.contains('error')).toBe(true);
		expect(run.status_container.classList.contains('processing')).toBe(false);
		// the node ships hidden (.hide = display:none !important): an error written
		// into it is only honest if it is actually shown.
		expect(run.status_container.classList.contains('hide')).toBe(false);
		// the pid is the only handle on the running job — it must survive
		expect(run.deleted).toEqual([]);
		// polling STOPS: no re-poll, and no component refresh was scheduled
		expect(run.scheduled).toEqual([]);
		expect(run.refreshes).toEqual([]);
	});

	test('a status-less / malformed envelope is treated as a failure, not as done', async () => {
		for (const response of [undefined, null, {}, { result: null }, { result: 'unexpected' }]) {
			const run = await drivePoll(response);
			expect(run.status_container.textContent).not.toBe('Process done');
			expect(run.status_container.classList.contains('error')).toBe(true);
			expect(run.deleted).toEqual([]);
			expect(run.scheduled).toEqual([]);
		}
	});

	test('the failure branch does not re-enable the button (a job may still be running)', async () => {
		const run = await drivePoll({ result: false, msg: 'transcriber HTTP 502' });
		expect(run.button.classList.contains('disable')).toBe(true);
	});

	test('status 2 still re-polls and keeps the pid', async () => {
		const run = await drivePoll({ result: { status: 2 }, msg: 'OK. Request done' });
		expect(run.status_container.textContent).toBe('Processing');
		expect(run.status_container.classList.contains('processing')).toBe(true);
		expect(run.status_container.classList.contains('error')).toBe(false);
		expect(run.deleted).toEqual([]);
		expect(run.scheduled).toEqual([4000]);
	});

	test('status 3 still clears the pid and refreshes the component', async () => {
		const run = await drivePoll({ result: { status: 3 }, msg: 'OK. Request done' });
		expect(run.status_container.textContent).toBe('Process done');
		expect(run.deleted).toEqual(['transcriber_process_rsc167_1']);
		expect(run.scheduled).toEqual([4000]);
	});

	test('status 1 still clears the stale pid and reads Inactive', async () => {
		const run = await drivePoll({ result: { status: 1 }, msg: 'OK. Request done' });
		expect(run.status_container.textContent).toBe('Inactive');
		expect(run.deleted).toEqual(['transcriber_process_rsc167_1']);
		expect(run.scheduled).toEqual([]);
	});

	/**
	 * The two halves, joined: the envelope the SERVER really emits for a dead
	 * transcriber, fed to the REAL browser poller. This is the gate that would
	 * catch either half drifting — a server that starts dressing failures as OK,
	 * or a client that starts trusting a status-less result again.
	 */
	test('the real server failure envelope renders as a failure in the browser', async () => {
		const envelope = liveFailureEnvelope();
		expect(envelope.result).toBe(false); // the harvest actually ran
		const run = await drivePoll(envelope);
		expect(run.status_container.textContent).toContain(envelope.msg);
		expect(run.status_container.classList.contains('error')).toBe(true);
		expect(run.deleted).toEqual([]);
		expect(run.scheduled).toEqual([]);
	});

	test('no stored pid → the poll never calls the server at all', async () => {
		const run = await drivePoll({ result: { status: 3 } }, null);
		expect(run.requests).toEqual([]);
		expect(run.status_container.textContent).toBe('');
	});
});

describe('saveTranscriptionResult — the id-1 slot contract', () => {
	// THE transcription is the lang's single main text: item id 1, stated
	// explicitly. The id-less update this used to send relied on slice/sibling
	// resolution and APPENDED with a minted id when nothing resolved — a
	// finished 87-minute transcription landed invisible in item 2 while the
	// editor showed the empty item 1 (rsc167/528, 2026-07-28).
	test('an empty component receives the transcript as item id 1', async () => {
		const { saveTranscriptionResult } = await import('../../src/core/tools/transcription_asr.ts');
		const { insertMatrixRecordWithCounter, deleteMatrixRecord } = await import(
			'../../src/core/db/matrix_write.ts'
		);
		const { readMatrixRecord } = await import('../../src/core/db/matrix.ts');
		const { getMatrixTableFromTipo } = await import('../../src/core/ontology/resolver.ts');

		const table = (await getMatrixTableFromTipo('rsc167'))!;
		const sectionId = await insertMatrixRecordWithCounter(table, 'rsc167', {});
		try {
			const outcome = await saveTranscriptionResult({
				lang: 'lg-eng',
				transcriptionDdo: {
					component_tipo: 'rsc36',
					section_tipo: 'rsc167',
					section_id: sectionId,
				},
				segments: [{ start: 0, end: 4, text: ' Hello world.' }],
				userId: -1,
			});
			expect(outcome.saved).toBe(true);

			const record = await readMatrixRecord(table, 'rsc167', sectionId);
			const items = (record?.columns.string as Record<string, unknown[]>)?.rsc36 as {
				id?: unknown;
				lang?: string;
				value?: string;
			}[];
			expect(items).toHaveLength(1);
			expect(Number(items[0]?.id)).toBe(1); // the slot is STATED, never minted
			expect(items[0]?.lang).toBe('lg-eng');
			expect(items[0]?.value).toContain('Hello world.');
		} finally {
			await deleteMatrixRecord(table, 'rsc167', sectionId);
		}
	});
});

describe('remote ASR status seam', () => {
	const statusRequest: TranscriberStatusRequest = {
		uri: 'https://babel.example.org:8011/api/',
		key: 'k',
		avUrl: 'https://dedalo.example.org/dedalo/media/av/404/rsc35_rsc167_1.mp3',
		engine: 'babel_transcriber',
		userId: 7,
		entityName: 'mib',
		pid: 4321,
		deleteResult: false,
	};

	test('buildTranscriberStatusBody POSTs the exact PHP field set', () => {
		const body = buildTranscriberStatusBody(statusRequest);
		expect([...body.keys()].sort()).toEqual([
			'av_url',
			'delete_result',
			'engine',
			'entity_name',
			'key',
			'method_name',
			'pid',
			'url',
			'user_id',
		]);
		expect(body.get('key')).toBe('k');
		expect(body.get('url')).toBe('https://babel.example.org:8011/api/'); // PHP posts the uri as 'url'
		expect(body.get('av_url')).toBe(statusRequest.avUrl);
		expect(body.get('engine')).toBe('babel_transcriber');
		expect(body.get('method_name')).toBe('check_status');
		expect(body.get('user_id')).toBe('7');
		expect(body.get('entity_name')).toBe('mib');
		expect(body.get('pid')).toBe('4321');
		expect(body.get('delete_result')).toBe('false');
	});

	test('the background variant carries lang + delete_result true', () => {
		const body = buildTranscriberStatusBody({
			...statusRequest,
			deleteResult: true,
			lang: 'lg-spa',
		});
		expect(body.get('delete_result')).toBe('true');
		expect(body.get('lang')).toBe('lg-spa');
	});

	test('SSRF guard fails closed without any network call', async () => {
		for (const uri of ['http://127.0.0.1/x', 'http://169.254.169.254/x', 'file:///etc/passwd']) {
			const result = (await babelTranscriberStatusProvider({ ...statusRequest, uri })) as {
				result: unknown;
				msg: string;
			};
			expect(result.result).toBe(false);
			expect(result.msg).toBe('invalid transcriber URL');
		}
	});

	test('status provider resolution mirrors the PHP switch', () => {
		expect(resolveTranscriberStatusProvider('babel_transcriber').provider).not.toBeNull();
		expect(resolveTranscriberStatusProvider('local').provider).not.toBeNull();
		expect(resolveTranscriberStatusProvider('google_translation').provider).toBeNull();
		expect(resolveTranscriberStatusProvider('google_translation').error).toContain(
			'not implemented',
		);
	});

	test("engine 'local' maps to babel (PHP fall-through) for submit too", () => {
		expect(mapTranscriberEngine('local')).toBe('babel_transcriber');
		expect(mapTranscriberEngine('babel_transcriber')).toBe('babel_transcriber');
		expect(resolveTranscriberProvider('local').provider).not.toBeNull();
	});
});

describe('ASR write-back (process_file port)', () => {
	test('seg2tc parity (OptimizeTC::seg2tc)', () => {
		expect(secondsToTc(0)).toBe('00:00:00.000');
		expect(secondsToTc(1.85)).toBe('00:00:01.850');
		expect(secondsToTc(3.45)).toBe('00:00:03.450');
		expect(secondsToTc(322.342)).toBe('00:05:22.342');
		expect(secondsToTc(3661.007)).toBe('01:01:01.007');
		expect(secondsToTc(7322.5)).toBe('02:02:02.500');
		expect(secondsToTc(59)).toBe('00:00:59.000');
	});

	test('segmentsToTcText groups segments into paragraphs', () => {
		// Two consecutive segments of one answer: ONE paragraph, one time mark.
		// (It used to be one paragraph per segment — a cue list, not a transcript.)
		const segments = [
			{ start: 1.85, end: 3.45, text: ' Can you say me...' },
			{ start: 3.45, end: 6, text: ' blah blah...' },
		];
		expect(segmentsToTcText(segments)).toBe(
			'<p>[TC_00:00:01.850_TC]Can you say me... blah blah...</p>',
		);
		expect(segmentsToTcText([])).toBe('');
	});

	test('segmentsToTcText breaks a paragraph at a silence', () => {
		const segments = [
			{ start: 0, end: 4, text: 'Primera respuesta' },
			{ start: 20, end: 24, text: 'Segunda respuesta' },
		];
		expect(segmentsToTcText(segments)).toBe(
			'<p>[TC_00:00:00.000_TC]Primera respuesta</p><p>[TC_00:00:20.000_TC]Segunda respuesta</p>',
		);
	});

	test('segmentsToTcText honours the caller’s timecode density', () => {
		const segments = [
			{ start: 0, end: 4, text: 'uno' },
			{ start: 4, end: 8, text: 'dos' },
		];
		// 'segment' reproduces the historical one-mark-per-segment output.
		expect(segmentsToTcText(segments, { tc_mode: 'segment' })).toBe(
			'<p>[TC_00:00:00.000_TC]uno</p><p>[TC_00:00:04.000_TC]dos</p>',
		);
	});

	test('hasExistingTranscription: any item in the target lang blocks the save', () => {
		expect(hasExistingTranscription([], 'lg-spa')).toBe(false);
		expect(hasExistingTranscription([{ value: 'x', lang: 'lg-eng' }], 'lg-spa')).toBe(false);
		// PHP: an object item is non-empty even with an empty value → skip.
		expect(hasExistingTranscription([{ value: '', lang: 'lg-spa' }], 'lg-spa')).toBe(true);
		expect(hasExistingTranscription([{ value: 'manual edit', lang: 'lg-spa' }], 'lg-spa')).toBe(
			true,
		);
	});

	const pollJob = {
		status: {
			uri: 'https://babel.example.org/api/',
			key: 'k',
			avUrl: 'https://x/a.mp3',
			engine: 'babel_transcriber',
			userId: 7,
			entityName: 'mib',
			pid: 99,
			lang: 'lg-spa',
		},
		lang: 'lg-spa',
		transcriptionDdo: { component_tipo: 'rsc36', section_tipo: 'rsc167', section_id: 1 },
		userId: 7,
	};

	test('poll: waits on status 2, saves segments on status 3 (delete_result=true)', async () => {
		const seen: TranscriberStatusRequest[] = [];
		const sequence: unknown[] = [
			{ status: 2 },
			{ status: 2 },
			{ status: 3, transcription_data: { segments: [{ start: 1.85, text: ' hi' }] } },
		];
		let sleeps = 0;
		const saves: unknown[] = [];
		const outcome = await pollTranscriptionCompletion(pollJob, {
			provider: async (req) => {
				seen.push(req);
				return sequence.shift();
			},
			save: async (input) => {
				saves.push(input);
				return { saved: true, msg: 'OK. Transcription saved' };
			},
			maxAttempts: 10,
			intervalMs: 1,
			sleep: async () => {
				sleeps += 1;
			},
		});
		expect(outcome.result).toBe(true);
		expect(sleeps).toBe(2);
		expect(seen).toHaveLength(3);
		// server-side polls are the destructive ones (PHP delete_result=true)
		expect(seen.every((req) => req.deleteResult === true)).toBe(true);
		expect(saves).toHaveLength(1);
		expect(saves[0]).toMatchObject({
			lang: 'lg-spa',
			transcriptionDdo: pollJob.transcriptionDdo,
			segments: [{ start: 1.85, text: ' hi' }],
			userId: 7,
		});
	});

	test('poll: the save guard outcome propagates (skip is not a crash)', async () => {
		const outcome = await pollTranscriptionCompletion(pollJob, {
			provider: async () => ({
				status: 3,
				transcription_data: { segments: [{ start: 0, text: 'x' }] },
			}),
			save: async () => ({ saved: false, msg: 'component already has data — skipped' }),
			maxAttempts: 2,
			sleep: async () => {},
		});
		expect(outcome.result).toBe(false);
		expect(outcome.msg).toContain('already has data');
	});

	test('poll: bounded — gives up loudly after maxAttempts, never throws', async () => {
		const outcome = await pollTranscriptionCompletion(pollJob, {
			provider: async () => ({ status: 2 }),
			save: async () => ({ saved: true, msg: 'unreachable' }),
			maxAttempts: 3,
			sleep: async () => {},
		});
		expect(outcome.result).toBe(false);
		expect(outcome.msg).toContain('gave up after 3 poll attempts');
	});

	test('poll: status 1 and invalid statuses terminate without saving', async () => {
		const status1 = await pollTranscriptionCompletion(pollJob, {
			provider: async () => ({ status: 1 }),
			save: async () => {
				throw new Error('must not save');
			},
			maxAttempts: 2,
			sleep: async () => {},
		});
		expect(status1.result).toBe(false);
		expect(status1.msg).toContain('status 1');

		const invalid = await pollTranscriptionCompletion(pollJob, {
			provider: async () => ({ result: false, msg: 'invalid transcriber URL' }),
			save: async () => {
				throw new Error('must not save');
			},
			maxAttempts: 2,
			sleep: async () => {},
		});
		expect(invalid.result).toBe(false);
		expect(invalid.msg).toContain('status not valid');
	});
});

describe('remote ASR seam', () => {
	test('resolveTranscriberProvider: babel default, others rejected', () => {
		expect(resolveTranscriberProvider('babel_transcriber').provider).not.toBeNull();
		expect(resolveTranscriberProvider('whisper_x').provider).toBeNull();
		expect(resolveTranscriberProvider('whisper_x').error).toContain('not implemented');
	});
	test('resolveTranscriberConfig reads the shape getToolConfig ACTUALLY returns', () => {
		// getToolConfig returns the EFFECTIVE config: a flat map of key → resolved
		// value. The lookup used to read `config.transcriber_config.value`, a shape
		// it never produces, so no server-side engine could ever find its uri/key —
		// and the old fixture here was written to that same wrong shape, so the gate
		// stayed green while the feature was dead. This asserts the real one first.
		const effective = {
			transcriber_config: [{ name: 'babel_transcriber', uri: 'u', key: 'k' }],
		};
		expect(resolveTranscriberConfig(effective, 'babel_transcriber')).toEqual({
			uri: 'u',
			key: 'k',
		});

		// The raw-property forms an install may store are still accepted.
		expect(
			resolveTranscriberConfig(
				{ transcriber_config: { value: [{ name: 'local_whisper', uri: 'u2', key: 'k2' }] } },
				'local_whisper',
			),
		).toEqual({ uri: 'u2', key: 'k2' });
		expect(
			resolveTranscriberConfig(
				{
					config: {
						transcriber_config: { value: [{ name: 'babel_transcriber', uri: 'u', key: 'k' }] },
					},
				},
				'babel_transcriber',
			),
		).toEqual({ uri: 'u', key: 'k' });

		expect(resolveTranscriberConfig({}, 'babel_transcriber')).toBeNull();
		// An entry missing either half is not usable config.
		expect(
			resolveTranscriberConfig(
				{ transcriber_config: [{ name: 'babel_transcriber', uri: 'u' }] },
				'babel_transcriber',
			),
		).toBeNull();
	});
});
