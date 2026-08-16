/**
 * THE CLIENT POLL MUST NOT PUBLISH A RECORDING (audit 2026-08 §5.6/3, the REAL
 * location — fixed 2026-08-09).
 *
 * `engineering/TRANSCRIPTION.md`'s law: recorded interviews are personal data,
 * and on-premise inference must NEVER require publishing the recording. The
 * on-premise sidecar (`local_whisper`) is POSTed the audio as BYTES and keys its
 * job by its own id, so `DEDALO_MEDIA_EXPORT_BASE` is meaningless to it — an
 * install that runs only the sidecar deliberately has none.
 *
 * `check_server_transcriber_status` — the CLIENT's poll, the one a running
 * transcription button depends on — nevertheless built the external media URL
 * unconditionally (`avUrl: externalMediaUrl(audioRel)`), which on such an
 * install THROWS the export-base configuration error. The client stopped
 * polling, the pid stayed live and the transcribe button stayed disabled: the
 * privacy-preserving engine was the only broken one.
 *
 * `statusPollNeedsExternalAudioUrl` (transcription_asr.ts) is the decision;
 * `statusPollAvUrl` (index.ts) is the handler's own seam for it. THE GATE THAT
 * MATTERS IS THE THIRD ONE: the second describe block RUNS
 * `checkServerTranscriberStatus` and reads the av_url the provider was actually
 * handed. Pinning helpers alone is what let the unconditional call site survive
 * the first fix — a verifier reverted the call site to
 * `avUrl: externalMediaUrl(audioRel)` and every gate in this subsystem stayed
 * green, which under the "tripwire or delete" law is a gate that certifies a
 * lie. Reverting it now turns `the ON-PREMISE poll hands the provider NO url`
 * red in both possible environments: with an export base configured the captured
 * av_url is a string instead of null, and without one `externalMediaUrl` throws
 * and the handler REFUSES (`tool.dependency_unavailable`).
 *
 * Both branches assert, so no block can be vacuous: the external engine must
 * really reach the media publication layer (a URL when a base is configured, the
 * LOUD refusal when it is not), which is what makes the on-premise `null` mean
 * "no URL was ever asked for" rather than "nothing here does anything".
 */

import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../../src/config/config.ts';
import { type MediaTypeSpec, mediaTypeOf } from '../../src/core/concepts/media.ts';
import type { MediaIdentity, MediaPathOptions } from '../../src/core/media/path.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import {
	LOCAL_ASR_ENGINE,
	type TranscriberStatusRequest,
} from '../../src/core/tools/transcription_asr.ts';
import {
	checkServerTranscriberStatus,
	statusPollAvUrl,
	tool,
} from '../../tools/tool_transcription/server/index.ts';
import { refusalOf } from '../helpers/refusal.ts';

/** A plausible av 'audio' quality relative path (the poll rebuilds this shape). */
const AUDIO_REL = 'audio/404/0/test94_test3_1.mp3';

describe('check_server_transcriber_status: the av_url is engine-decided', () => {
	test('the ON-PREMISE engine gets NO url — and never asks for one', async () => {
		// Non-throwing is half the assertion: on an install with no export base
		// (the normal on-premise state) building one is a hard error, so a null
		// answer here proves the media publication layer was never consulted.
		expect(statusPollAvUrl(LOCAL_ASR_ENGINE, AUDIO_REL)).toBeNull();
	});

	test('an EXTERNAL engine still gets the published url, or a loud refusal', async () => {
		const base = config.media.exportBase;
		if (base === undefined || base === '') {
			// The install publishes nothing: an external transcriber cannot be
			// handed a relative URL, and the poll must say so rather than POST a
			// meaningless address (the unset-means-unresolved law).
			expect(() => statusPollAvUrl('babel_transcriber', AUDIO_REL)).toThrow(
				/DEDALO_MEDIA_EXPORT_BASE/,
			);
		} else {
			expect(statusPollAvUrl('babel_transcriber', AUDIO_REL)).toBe(`${base}${AUDIO_REL}`);
		}
	});

	test('the rule is the engine, not a hardcoded pair of names', async () => {
		// Every non-on-premise engine is external as far as the poll is concerned
		// (transcription_asr.ts routes unknown engines to the babel provider), so
		// an engine added tomorrow inherits the same answer rather than silently
		// falling into the no-url branch.
		const base = config.media.exportBase;
		for (const engine of ['babel', 'babel_transcriber', 'some_future_asr']) {
			if (base === undefined || base === '') {
				expect(() => statusPollAvUrl(engine, AUDIO_REL)).toThrow(/DEDALO_MEDIA_EXPORT_BASE/);
			} else {
				expect(statusPollAvUrl(engine, AUDIO_REL)).toBe(`${base}${AUDIO_REL}`);
			}
		}
	});
});

// ---------------------------------------------------------------------------
// THE CALL SITE ITSELF (checkServerTranscriberStatus, tool_transcription/server)
// ---------------------------------------------------------------------------

function avSpec(): MediaTypeSpec {
	const spec = mediaTypeOf('component_av');
	if (spec === null) throw new Error('component_av has no media spec — the fixture is impossible');
	return spec;
}
const AV_SPEC = avSpec();

/** test94/test3 is the av scratch pair; the poll only does path MATH on it. */
const IDENTITY: MediaIdentity = {
	componentTipo: 'test94',
	sectionTipo: 'test3',
	sectionId: 1,
	lang: null,
};
/** A throwaway media root: buildMediaLocation confines against it, nothing is written. */
const PATH_OPTS: MediaPathOptions = {
	initialMediaPath: '',
	maxItemsFolder: 1000,
	mediaRoot: mkdtempSync(join(tmpdir(), 'dedalo-poll-gate-')),
};

const PRINCIPAL: Principal = { userId: 16, isGlobalAdmin: false, isDeveloper: false };

/**
 * Run the REAL handler with only its three database reads replaced (permission
 * gate, tool config row, media context). The av_url decision and the media path
 * build stay on the production code path, and the provider records the request
 * the handler built — which is the only place the invariant is observable.
 */
async function pollWithEngine(
	engine: string,
	/** The caller may own the sink, so a REFUSAL (a throw) still exposes what the provider saw. */
	seen: TranscriberStatusRequest[] = [],
): Promise<{
	seen: TranscriberStatusRequest[];
	response: Awaited<ReturnType<typeof checkServerTranscriberStatus>>;
}> {
	const response = await checkServerTranscriberStatus(
		{
			principal: PRINCIPAL,
			userId: 16,
			background: false,
			options: {
				media_ddo: { component_tipo: 'test94', section_tipo: 'test3', section_id: 1 },
				transcriber_engine: engine,
				pid: 'job-7',
			},
		},
		{
			gate: async () => {},
			transcriberConfig: async () => ({ uri: 'https://asr.example.org/api', key: 'k' }),
			mediaContext: async () => ({
				spec: AV_SPEC,
				identity: IDENTITY,
				pathOpts: PATH_OPTS,
				items: [],
			}),
			statusProvider: () => ({
				provider: async (req) => {
					seen.push(req);
					return { status: 1 };
				},
				error: null,
			}),
		},
	);
	return { seen, response };
}

describe('checkServerTranscriberStatus — the HANDLER, not a helper it may stop calling', () => {
	test('the action the wire routes IS this exported function', () => {
		// Without this the gate below could drift onto a copy of the handler while
		// the real one keeps publishing recordings.
		expect(tool.apiActions.check_server_transcriber_status?.handler).toBe(
			checkServerTranscriberStatus,
		);
	});

	test('the ON-PREMISE poll hands the provider NO url — it never asks for one', async () => {
		// THE regression gate for audit 2026-08 §5.6/3. Revert the call site to
		// `avUrl: externalMediaUrl(audioRel)` and this fails either way: with an
		// export base configured `avUrl` becomes a string; without one (the normal
		// on-premise install) externalMediaUrl throws and the poll refuses.
		const { seen, response } = await pollWithEngine(LOCAL_ASR_ENGINE);

		expect(seen).toHaveLength(1);
		expect(seen[0]?.avUrl).toBeNull();
		expect(response.ok).toBe(true);
		expect(response.data).toEqual({ status: 1 });
		// The client poll is non-destructive: babel may only clean up on the
		// server-side background poll.
		expect(seen[0]?.deleteResult).toBe(false);
		expect(seen[0]?.pid).toBe('job-7');
	});

	test('an EXTERNAL poll DOES reach the publication layer (so the null above means something)', async () => {
		const base = config.media.exportBase;

		if (base === undefined || base === '') {
			// Nothing is published here, so the handler must refuse loudly rather
			// than POST an address babel cannot resolve. A refusal is a THROW
			// carrying the registered code (ERRORS_SPEC §4); the export-base
			// sentence is the LOG message the throw carries.
			const seen: TranscriberStatusRequest[] = [];
			const refusal = await refusalOf(
				pollWithEngine('babel_transcriber', seen).then((run) => run.response),
			);
			expect(refusal.code).toBe('tool.dependency_unavailable');
			expect(refusal.message).toContain('DEDALO_MEDIA_EXPORT_BASE');
			expect(seen).toHaveLength(0);
		} else {
			const { seen } = await pollWithEngine('babel_transcriber');
			expect(seen).toHaveLength(1);
			expect(seen[0]?.avUrl).toBe(
				`${base}${AV_SPEC.folder}/audio/0/test94_test3_1.${AV_SPEC.defaultExtension}`,
			);
		}
	});
});
