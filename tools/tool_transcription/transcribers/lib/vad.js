// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/


/**
* VAD
* Voice-activity detection and decode-window planning: find where somebody is
* actually speaking, and cut the audio there instead of every 30 seconds.
*
* WHY THIS EXISTS. Whisper decodes fixed-length windows. Cutting blindly does two
* damaging things to an interview recording:
*   - it cuts through the middle of words, so consecutive windows must OVERLAP and
*     the overlap gets transcribed twice (the duplicated phrases users report);
*   - it feeds the model long stretches of silence and room tone, which is the
*     single most reliable way to make Whisper hallucinate a repetition loop.
* Cutting at real pauses removes both: windows need no overlap, and silence never
* reaches the model.
*
* It also gives the paragraph grouper what it needs — the pauses ARE the paragraph
* boundaries — and gives the UI an honest progress figure (speech seconds done out
* of speech seconds total, instead of "still working").
*
* METHOD. Short-term energy with an adaptive noise floor and hysteresis:
*   1. RMS energy per ~20 ms frame;
*   2. the noise floor is a low percentile of those frames, so a hissy field
*      recording and a clean studio interview both calibrate themselves;
*   3. speech opens above the high threshold and only closes below the low one
*      (hysteresis), so a brief dip inside a word does not split it;
*   4. regions shorter than `min_speech_seconds` are dropped as clicks/coughs, and
*      regions separated by less than `min_silence_seconds` are merged back.
*
* This is deliberately model-free: it needs no download, works offline and costs
* nothing measurable next to the ASR itself. `find_speech_regions` is the seam a
* neural VAD (Silero ONNX) would replace later — it returns plain regions, so
* nothing downstream would change.
*
* Exports:
*   find_speech_regions — samples → speech regions in seconds
*   build_windows       — regions → decode windows for the recogniser
*   plan_windows        — the two of them, the normal entry point
*   total_speech_seconds — how much speech the plan covers (progress denominator)
*/


/**
* DEFAULT_OPTIONS
* Tuning knobs. The speech/silence durations are what make the output READ well:
* 0.35 s is about the shortest pause a listener perceives as a pause, and a decode
* window of 30 s is Whisper's native context length — going beyond it silently
* truncates.
*/
export const DEFAULT_OPTIONS = {
	frame_seconds			: 0.02,	// energy frame length (20 ms)
	noise_percentile		: 0.15,	// which quantile of frame energy counts as "the room"
	speech_percentile		: 0.95,	// … and which counts as "somebody talking"
	high_threshold_ratio	: 0.30,	// speech opens this far up from floor towards speech level
	low_threshold_ratio		: 0.12,	// … and closes below this (hysteresis)
	min_dynamic_range		: 2.0,	// floor×this: below it the recording has no usable contrast
	absolute_floor			: 1e-4,	// silence guard for digitally clean recordings
	min_speech_seconds		: 0.20,	// shorter bursts are clicks, not speech
	min_silence_seconds		: 0.35,	// shorter gaps are inside a phrase, not between phrases
	pad_seconds				: 0.20,	// context kept around each region, so no word is clipped
	max_merge_gap_seconds	: 2.0,	// silence longer than this is never sent to the model
	max_window_seconds		: 28,	// decode window cap (Whisper's context is 30 s)
	min_window_seconds		: 1.0	// windows shorter than this are merged forward
};


/**
* FRAME_ENERGY
* Per-frame RMS energy of a mono PCM buffer.
*
* @param {Float32Array} samples - mono PCM, any sample rate
* @param {number} frame_length - frame length in SAMPLES
* @returns {Float32Array} one RMS value per frame
*/
function frame_energy( samples, frame_length ) {

	const count		= Math.max( 1, Math.floor(samples.length / frame_length) );
	const energies	= new Float32Array( count );

	for (let frame = 0; frame < count; frame++) {

		const from	= frame * frame_length;
		const to	= Math.min( from + frame_length, samples.length );

		let sum = 0;
		for (let i = from; i < to; i++) {
			sum += samples[i] * samples[i];
		}

		energies[frame] = Math.sqrt( sum / Math.max(1, to - from) );
	}

	return energies;
}//end frame_energy


/**
* PERCENTILE
* The value at `ratio` through a sorted copy of the data. Used for the adaptive
* noise floor: a low percentile of frame energy is, by construction, "the quietest
* part of this particular recording".
*
* @param {Float32Array} values
* @param {number} ratio - 0..1
* @returns {number}
*/
function percentile( values, ratio ) {

	if (values.length===0) {
		return 0;
	}

	const sorted	= Float32Array.from( values ).sort();
	const index		= Math.min( sorted.length - 1, Math.max( 0, Math.floor(sorted.length * ratio) ) );

	return sorted[index];
}//end percentile


/**
* FIND_SPEECH_REGIONS
* Locate the stretches of audio that contain speech.
*
* @param {Float32Array} samples - mono PCM
* @param {number} sample_rate - e.g. 16000
* @param {Object} [options] - see DEFAULT_OPTIONS
* @returns {Array<{start:number, end:number}>} regions in SECONDS, in order
*/
export function find_speech_regions( samples, sample_rate, options ) {

	const opts = Object.assign({}, DEFAULT_OPTIONS, options || {});

	if (!samples || samples.length===0 || !(sample_rate>0)) {
		return [];
	}

	const frame_length	= Math.max( 1, Math.round(opts.frame_seconds * sample_rate) );
	const energies		= frame_energy( samples, frame_length );
	const frame_seconds	= frame_length / sample_rate;

	// Adaptive thresholds, interpolated between what this recording's ROOM sounds
	// like and what its SPEECH sounds like — a ratio of the noise floor alone
	// mis-calibrates on both a hissy field recording and a clean studio one.
	const noise_floor	= Math.max( percentile( energies, opts.noise_percentile ), opts.absolute_floor );
	const speech_level	= percentile( energies, opts.speech_percentile );
	const duration		= samples.length / sample_rate;

	// No usable contrast between floor and speech: either the whole recording is
	// speech (an answer with no pause in it) or the whole recording is silence.
	// Guessing boundaries here would invent them, so treat it as one block.
	if (speech_level<=(noise_floor * opts.min_dynamic_range)) {
		return speech_level>opts.absolute_floor
			? [{ start: 0, end: duration }]
			: [];
	}

	const span	= speech_level - noise_floor;
	const high	= noise_floor + (span * opts.high_threshold_ratio);
	const low	= noise_floor + (span * opts.low_threshold_ratio);

	const regions	= [];
	let open		= null;
	let silence_run	= 0;

	for (let frame = 0; frame < energies.length; frame++) {

		const energy	= energies[frame];
		const at		= frame * frame_seconds;

		if (open===null) {
			if (energy>=high) {
				open		= at;
				silence_run	= 0;
			}
			continue;
		}

		if (energy<low) {
			silence_run += frame_seconds;
			if (silence_run>=opts.min_silence_seconds) {
				// The region ended when the silence STARTED, not now.
				regions.push({ start: open, end: at - silence_run });
				open		= null;
				silence_run	= 0;
			}
			continue;
		}

		// Back above the low threshold: the dip was inside a phrase.
		silence_run = 0;
	}

	if (open!==null) {
		regions.push({ start: open, end: energies.length * frame_seconds });
	}

	// Drop clicks, pad, and clamp to the real duration.
	return regions
		.filter( region => (region.end - region.start)>=opts.min_speech_seconds )
		.map( region => ({
			start	: Math.max( 0, region.start - opts.pad_seconds ),
			end		: Math.min( duration, region.end + opts.pad_seconds )
		}) );
}//end find_speech_regions


/**
* BUILD_WINDOWS
* Turn speech regions into decode windows for the recogniser.
*
* Regions are packed together until adding the next one would exceed
* `max_window_seconds`, so each window is as much CONTEXT as the model can hold —
* Whisper transcribes a full thought far better than a fragment — while never
* exceeding the context length (beyond which audio is silently dropped).
*
* A region longer than the cap on its own (an uninterrupted monologue) is split at
* the cap. That is the one place a cut can still land inside a word, and it is
* why `transcript_postprocess.strip_overlap` still runs afterwards.
*
* @param {Array<{start:number, end:number}>} regions
* @param {Object} [options] - see DEFAULT_OPTIONS
* @returns {Array<{start:number, end:number}>} windows in SECONDS
*/
export function build_windows( regions, options ) {

	const opts = Object.assign({}, DEFAULT_OPTIONS, options || {});

	if (!Array.isArray(regions) || regions.length===0) {
		return [];
	}

	const windows	= [];
	let current		= null;

	for (const region of regions) {

		// A region too long to ever fit: split it at the cap.
		let start = region.start;
		while ((region.end - start)>opts.max_window_seconds) {

			if (current!==null) {
				windows.push( current );
				current = null;
			}
			windows.push({ start: start, end: start + opts.max_window_seconds });
			start += opts.max_window_seconds;
		}

		const piece = { start: start, end: region.end };
		if ((piece.end - piece.start)<=0) {
			continue;
		}

		if (current===null) {
			current = piece;
			continue;
		}

		const gap = piece.start - current.end;

		if ((piece.end - current.start)<=opts.max_window_seconds && gap<=opts.max_merge_gap_seconds) {
			// Extend. The short silence between the two regions rides along, which
			// is what gives the model the pause as context — but a LONG silence
			// never does: that is precisely what makes Whisper hallucinate.
			current.end = piece.end;
		} else {
			windows.push( current );
			current = piece;
		}
	}

	if (current!==null) {
		windows.push( current );
	}

	// Merge a runt tail into its predecessor rather than decoding it alone.
	for (let i = windows.length - 1; i > 0; i--) {
		if ((windows[i].end - windows[i].start)<opts.min_window_seconds) {
			const previous = windows[i - 1];
			if ((windows[i].end - previous.start)<=opts.max_window_seconds) {
				previous.end = windows[i].end;
				windows.splice(i, 1);
			}
		}
	}

	return windows;
}//end build_windows


/**
* PLAN_WINDOWS
* The normal entry point: audio in, decode windows out.
*
* Falls back to fixed windows when VAD finds nothing at all — a recording that is
* entirely below the speech threshold (very quiet, or a codec artefact) must still
* be transcribable rather than silently returning an empty transcript.
*
* @param {Float32Array} samples - mono PCM
* @param {number} sample_rate
* @param {Object} [options] - see DEFAULT_OPTIONS
* @returns {Array<{start:number, end:number}>}
*/
export function plan_windows( samples, sample_rate, options ) {

	const opts		= Object.assign({}, DEFAULT_OPTIONS, options || {});
	const regions	= find_speech_regions( samples, sample_rate, opts );
	const windows	= build_windows( regions, opts );

	if (windows.length>0) {
		return windows;
	}

	if (!samples || samples.length===0 || !(sample_rate>0)) {
		return [];
	}

	// Fallback: fixed windows over the whole recording.
	const duration	= samples.length / sample_rate;
	const fallback	= [];
	for (let start = 0; start < duration; start += opts.max_window_seconds) {
		fallback.push({ start: start, end: Math.min( duration, start + opts.max_window_seconds ) });
	}

	return fallback;
}//end plan_windows


/**
* TOTAL_SPEECH_SECONDS
* How many seconds of audio a window plan covers — the denominator of the
* progress figure shown to the user.
*
* @param {Array<{start:number, end:number}>} windows
* @returns {number}
*/
export function total_speech_seconds( windows ) {

	if (!Array.isArray(windows)) {
		return 0;
	}

	return windows.reduce( (total, window) => total + Math.max(0, window.end - window.start), 0 );
}//end total_speech_seconds


// @license-end
