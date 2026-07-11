/**
 * Transcription LOCAL half (PHP tool_transcription::create/delete_transcribable_
 * audio_file). Produces the `audio_tr` derivative — a 16 kHz mono WAV extracted
 * from the AV original — that the browser-side Whisper worker fetches and
 * transcribes. The remote-ASR path (automatic_transcription) is R4.
 *
 * `audio_tr` is a throwaway derivative: create is idempotent (reuse if present),
 * delete is a HARD unlink (not soft-delete, not time-machine tracked) — matching
 * PHP, which unlink()s the file directly.
 */

import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { AUDIO_TR_QUALITY, type MediaTypeSpec } from '../../concepts/media.ts';
import { extractAudio } from '../engine/ffmpeg.ts';
import {
	type MediaIdentity,
	type MediaLocation,
	type MediaPathOptions,
	buildMediaLocation,
} from '../path.ts';
import { resolveOriginalSource } from '../processing.ts';

const AUDIO_TR_EXTENSION = 'wav';

/** The on-disk + relative location of the audio_tr WAV for a component instance. */
export function transcribableAudioLocation(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
): MediaLocation {
	return buildMediaLocation(spec, identity, AUDIO_TR_QUALITY, AUDIO_TR_EXTENSION, pathOpts);
}

/**
 * Ensure the audio_tr WAV exists (build from the AV original if missing) and
 * return its relative media path. PHP: build_version('audio_tr', async=false)
 * then re-check quality_file_exist. Throws when the original is missing or the
 * extraction produced no file.
 */
export async function ensureTranscribableAudio(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
): Promise<string> {
	if (spec.model !== 'component_av') {
		throw new Error('transcribable audio requires a component_av source');
	}
	const location = transcribableAudioLocation(spec, identity, pathOpts);
	if (existsSync(location.absolutePath)) return location.relativePath;

	const source = resolveOriginalSource(spec, identity, pathOpts);
	if (source === null) throw new Error('AV original file not found');

	mkdirSync(dirname(location.absolutePath), { recursive: true, mode: 0o775 });
	await extractAudio(source, location.absolutePath, 'audio_tr');
	if (!existsSync(location.absolutePath)) {
		throw new Error('Audio file could not be created in audio_tr quality');
	}
	return location.relativePath;
}

/**
 * Ensure the standard `audio` quality exists (build from the AV original if
 * missing) and return its relative path. Used by the remote ASR submit (the
 * transcriber fetches this URL). PHP: quality_file_exist('audio') → build_version.
 */
export async function ensureAudioQuality(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
): Promise<string> {
	if (spec.model !== 'component_av')
		throw new Error('audio quality requires a component_av source');
	const location = buildMediaLocation(spec, identity, 'audio', spec.defaultExtension, pathOpts);
	if (existsSync(location.absolutePath)) return location.relativePath;
	const source = resolveOriginalSource(spec, identity, pathOpts);
	if (source === null) throw new Error('AV original file not found');
	mkdirSync(dirname(location.absolutePath), { recursive: true, mode: 0o775 });
	await extractAudio(source, location.absolutePath, 'audio');
	if (!existsSync(location.absolutePath)) throw new Error('audio quality could not be created');
	return location.relativePath;
}

/**
 * Hard-delete the audio_tr WAV. Returns true when a file was removed, false when
 * it was already absent (both are success — PHP returns result:true either way).
 */
export function deleteTranscribableAudio(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
): boolean {
	const location = transcribableAudioLocation(spec, identity, pathOpts);
	if (!existsSync(location.absolutePath)) return false;
	unlinkSync(location.absolutePath);
	return true;
}
