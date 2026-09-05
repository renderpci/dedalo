/**
 * CONVERTER ADMISSION — how many heavy media conversions this process runs AT
 * ONCE, and what happens to the request that arrives when they are all busy.
 *
 * THE DEFECT THIS EXISTS TO REFUSE (audit MEDIA-01, second half). The resource
 * bound landed first: `magickResourceLimitArgs()` + the shipped policy stop ONE
 * conversion from taking the box (14.4 GB RSS on a 40000x30000 TIFF became a
 * bounded 22 MB run). It bounds one process, and the finding's other half is
 * PLURAL — measured 2026-09-05 on the exact upload-preview argv: a 2.4 MB
 * 20000x20000 TIFF now decodes inside its memory ceiling by SPILLING, and spends
 * the whole `-limit disk` budget (16 GiB apparent / 8.2 GiB real) and 22 s doing
 * it. Two concurrent uploads held 16 GiB of real disk simultaneously. Nothing
 * anywhere bounded K: `createStagedThumbnail` is awaited INLINE on the
 * authenticated upload request, so K uploads were K conversions, and the
 * per-process bound multiplied by K is not a bound at all.
 *
 * THE GATE IS ON THE SPAWN DOORS, NOT ON THE UPLOAD HANDLER. Routing only the
 * upload through `media/jobs.ts` would have bounded the ONE caller the audit
 * happened to name and left every other inline derivative build (regenerate,
 * rotation, the maintenance sweeps, a tool) as unbounded as before. A permit
 * taken where the converter is actually spawned bounds all of them, including
 * the ones written after this file, and needs no wire change: the request still
 * gets its preview, it just waits its turn instead of racing.
 *
 * WHAT A PERMIT COSTS AND WHY THE QUEUE IS BOUNDED TOO. A waiter holds a request
 * lane, so an unbounded queue trades the disk exhaustion for a lane exhaustion.
 * A waiter that has queued longer than `DEDALO_MEDIA_CONVERT_QUEUE_SECONDS` is
 * refused with `rate.limited` (429, retryable) — the honest answer for "this
 * server is converting as much as it is willing to convert at once", and the one
 * the client can act on, rather than a lane held until the socket dies.
 *
 * NOT A JOB QUEUE. `media/jobs.ts` is the SUPERVISOR for work that outlives its
 * request (AV transcodes): it has ids, pfiles, progress frames and a poll wire.
 * This is a permit taken and released inside one call. The two caps are
 * deliberately separate numbers — a job lane holds an ffmpeg for minutes, a
 * converter permit holds a magick for seconds — and a job that converts takes
 * both, which is correct: its ffmpeg lane says it may run, this says it may
 * decode right now.
 */

import { config } from '../../../config/config.ts';
import { DedaloError } from '../../errors/dedalo_error.ts';

/**
 * A bounded permit pool. A class, not a bare pair of module bindings, so a test
 * can exercise the REAL admission logic at its own limits instead of asserting a
 * spelling — the process-wide instance below is one of these, built from config.
 */
const CONVERT_KEYS = 'DEDALO_MEDIA_CONVERT_CONCURRENCY / DEDALO_MEDIA_CONVERT_QUEUE_SECONDS';
const AV_KEYS = 'DEDALO_MEDIA_AV_CONCURRENCY / DEDALO_MEDIA_AV_QUEUE_SECONDS';

export class ConverterAdmission {
	private readonly limit: number;
	private readonly queueMs: number;
	private readonly keys: string;
	private inFlight = 0;
	private highWater = 0;
	private readonly waiting: {
		readonly grant: () => void;
		readonly refuse: (error: Error) => void;
		readonly timer: ReturnType<typeof setTimeout>;
	}[] = [];

	/**
	 * `keys` names the two config keys this pool is tuned by, so the refusal a
	 * waiter gets tells the operator WHICH ceiling refused it — there are two
	 * pools (images and AV) and naming the image ones in an ffmpeg refusal would
	 * send them to the wrong parameter.
	 */
	constructor(limit: number, queueSeconds: number, keys = CONVERT_KEYS) {
		this.limit = Math.max(1, Math.trunc(limit));
		this.queueMs = Math.max(1, Math.trunc(queueSeconds)) * 1000;
		this.keys = keys;
	}

	/** How many conversions hold a permit right now (observability + the gate). */
	get active(): number {
		return this.inFlight;
	}

	/** The most that ever held a permit at once — the number the bound is about. */
	get peak(): number {
		return this.highWater;
	}

	/** How many callers are waiting for a permit right now. */
	get queued(): number {
		return this.waiting.length;
	}

	/** The configured ceiling (read by the gate; never mutated). */
	get concurrency(): number {
		return this.limit;
	}

	/**
	 * Run `work` holding a permit. Waits for one when the pool is full, and
	 * REFUSES rather than waiting forever.
	 *
	 * `label` names the converter in the refusal's log sentence (never on the
	 * wire — `rate.limited` discloses to the operator only).
	 */
	async run<T>(label: string, work: () => Promise<T>): Promise<T> {
		await this.acquire(label);
		try {
			return await work();
		} finally {
			this.release();
		}
	}

	private acquire(label: string): Promise<void> {
		if (this.inFlight < this.limit) {
			this.take();
			return Promise.resolve();
		}
		return new Promise<void>((resolve, reject) => {
			const waiter = {
				grant: () => {
					clearTimeout(waiter.timer);
					this.drop(waiter);
					this.take();
					resolve();
				},
				refuse: (error: Error) => {
					clearTimeout(waiter.timer);
					this.drop(waiter);
					reject(error);
				},
				timer: setTimeout(() => {
					waiter.refuse(
						new DedaloError('rate.limited', {
							message: `media converter admission: ${label} waited ${String(this.queueMs / 1000)}s for one of ${String(this.limit)} conversion permits (${this.keys}) and was refused rather than holding the request lane`,
						}),
					);
				}, this.queueMs),
			};
			// The timer must never keep the process alive: a waiter is request work,
			// and a pending refusal is not a reason to postpone a shutdown.
			(waiter.timer as { unref?: () => void }).unref?.();
			this.waiting.push(waiter);
		});
	}

	private take(): void {
		this.inFlight += 1;
		if (this.inFlight > this.highWater) this.highWater = this.inFlight;
	}

	private drop(waiter: unknown): void {
		const at = this.waiting.indexOf(waiter as (typeof this.waiting)[number]);
		if (at >= 0) this.waiting.splice(at, 1);
	}

	private release(): void {
		this.inFlight -= 1;
		this.waiting[0]?.grant();
	}
}

/**
 * The process-wide pools. Lazily built so the module can be imported before the
 * config catalog is read (and so a test importing the class pays nothing).
 */
let processAdmission: ConverterAdmission | undefined;
let processAvAdmission: ConverterAdmission | undefined;

/** The one pool every IMAGE/PDF/SVG converter door takes its permit from. */
export function converterAdmission(): ConverterAdmission {
	processAdmission ??= new ConverterAdmission(
		config.media.convert.concurrency,
		config.media.convert.queueSeconds,
	);
	return processAdmission;
}

/**
 * The one pool every AV PRODUCER door takes its permit from — a SECOND pool, not
 * the converter one, and the separation is the point:
 *
 *   - the two pools hold for different orders of magnitude (an upload preview is
 *     seconds, a two-pass transcode of an hour-long interview is minutes), so a
 *     shared ceiling would make every thumbnail queue behind a video;
 *   - a media JOB lane holds while its ffmpeg waits here, so a converter permit
 *     must never be what an ffmpeg is waiting for, or a lane could sit behind an
 *     image conversion that is itself waiting on the same K.
 *
 * The default is `DEDALO_MEDIA_JOB_CONCURRENCY + 1`: the job supervisor's lanes
 * plus one, so a full job queue still leaves room for one interactive fragment.
 */
export function avAdmission(): ConverterAdmission {
	processAvAdmission ??= new ConverterAdmission(
		config.media.convertAv.concurrency,
		config.media.convertAv.queueSeconds,
		AV_KEYS,
	);
	return processAvAdmission;
}

/**
 * THE IMAGE DOOR. Every ImageMagick/Ghostscript/librsvg spawn runs inside this:
 * `runMagickTo` (imagemagick.ts), `rasterizePdfPage` (ghostscript.ts),
 * `rasterizeSvg` (svg.ts) and `runIdentify` (binaries.ts) — the last one
 * UNCONDITIONALLY, `-ping` included, because a header read is O(scene count) and
 * a 200000-scene source cost the upload preview 26.3 s / 8.73 GB before the
 * sequence ceiling. Poppler header reads (`pdfinfo`, `pdftotext`) and ffprobe
 * stay ungated — they open a container header and decode nothing.
 * `magick_policy_tripwire` holds the census of which is which.
 *
 * NEVER NEST ONE INSIDE ANOTHER: a permit held while waiting for a second permit
 * is a deadlock at concurrency 1. Every door takes its permit around the SPAWN
 * itself, so a caller composing two conversions (rasterize, then encode) holds
 * one permit at a time.
 */
export async function withConverterSlot<T>(label: string, work: () => Promise<T>): Promise<T> {
	return converterAdmission().run(label, work);
}

/**
 * THE AV DOOR. Every spawn that ENCODES OR CUTS AUDIO/VIDEO runs inside this:
 * `runProducer` (engine/ffmpeg.ts — posterframe, faststart, conform, audio
 * extraction, the two-pass transcode) and `runFfmpeg` (tools/fragment.ts).
 *
 * WHY IT EXISTS, and it is not symmetry for its own sake (audit MEDIA-01, the
 * ffmpeg half): these two doors were exempted from admission on the ground that
 * "the AV producer already has its own admission — media/jobs.ts caps how many
 * transcodes run at once". That reason was FALSE for the two interactive
 * actions. `create_posterframe` and `download_fragment` are awaited INLINE in a
 * request handler (`api/handlers/dd_component_av_api.ts`), belong to no job, and
 * appear in no lane; `download_fragment` re-encodes the whole clip when a
 * watermark is asked for, and its client waits an hour by contract. K
 * authenticated requests were K unbounded ffmpeg processes — the same statement
 * the image half of this finding is about, on a heavier converter.
 *
 * A media JOB takes BOTH: its lane says the work may run at all, this says an
 * ffmpeg may start right now. That is not a nested permit (a lane is not a
 * permit) and it cannot deadlock, because nothing holding an AV permit ever
 * waits for a lane.
 *
 * As with the converter door: never nest one inside another.
 */
export async function withAvSlot<T>(label: string, work: () => Promise<T>): Promise<T> {
	return avAdmission().run(label, work);
}
