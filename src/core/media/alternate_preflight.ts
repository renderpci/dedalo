/**
 * ALTERNATE-EXTENSION BOOT PRE-FLIGHT (2026-08-07) — ADVISORY, NEVER FATAL.
 *
 * `DEDALO_*_ALTERNATIVE_EXTENSIONS` is a promise the engine keeps: the listed
 * formats are BUILT beside each derived tier (processing.ts
 * buildAlternateVersions / buildPdfCovers). There are exactly two ways an install
 * can state a promise the engine cannot keep, and BOTH are silent without this:
 *
 *  - THE MODEL HAS NO BUILDER AT ALL (av forces mp4/libx264 in every ffmpeg
 *    profile; svg and 3d derivatives are byte copies). `mediaTypeOf` drops those
 *    at construction into `refusedAlternateExtensions` so the scanners stop
 *    advertising files nothing can write — a narrowing that MUST be visible, with
 *    its key and the reason, or it is just another silent behaviour;
 *  - THIS HOST CANNOT ENCODE THE FORMAT (no AVIF delegate, or the hardened policy
 *    refuses it). Probed with a real 1x1 encode — `magick -list format` answers a
 *    different question (see canWriteImageFormat).
 *
 * IT IS A LINE, NOT A REFUSAL. Config-read `throw`, boot-fatal and ingest-assert
 * were all rejected: they turn "no ImageMagick delegate" into "no engine", and
 * every script and test inherits the brick. The engine stays up and degrades
 * honestly (the twin is not built and the failure is reported per upload); the
 * operator gets the whole picture at boot, once.
 *
 * IT LIVES IN A MODULE OF ITS OWN, not inline in server.ts, because the catalog
 * prose PROMISES it to operators three times ("refused at start-up, and the
 * server log names this parameter, its value and this reason") and an inline
 * fire-and-forget block with no awaited effect is exactly the shape a refactor
 * deletes as dead. Here it has a gate (test/unit/media_alternate_versions.test.ts).
 */

import { type MediaModel, mediaTypeOf, NO_ALTERNATE_BUILDER_REASON } from '../concepts/media.ts';
import { canWriteImageFormat } from './engine/imagemagick.ts';

/** The five media models, in the order the boot log names them. */
const MODELS: readonly MediaModel[] = [
	'component_image',
	'component_pdf',
	'component_av',
	'component_svg',
	'component_3d',
];

/**
 * Probe every configured alternate extension and RETURN the advisory lines (the
 * caller logs them). Returning them rather than only printing is what makes the
 * promise gateable: a test can assert the exact sentence an operator will read.
 *
 * Never throws for a probe failure — an unwritable format is an answer.
 */
export async function alternateExtensionWarnings(): Promise<string[]> {
	const warnings: string[] = [];
	for (const model of MODELS) {
		const spec = mediaTypeOf(model);
		if (spec === null) continue;
		if (spec.refusedAlternateExtensions.length > 0) {
			warnings.push(
				`[media] ${spec.alternateExtensionsConfigKey}=[${spec.refusedAlternateExtensions.join(', ')}] is NOT built and no longer advertised: ${model} has no alternate-extension builder — ${NO_ALTERNATE_BUILDER_REASON[model] ?? ''}`,
			);
		}
		for (const extension of spec.alternateExtensions) {
			if (await canWriteImageFormat(extension)) continue;
			warnings.push(
				`[media] ${spec.alternateExtensionsConfigKey} asks for '.${extension}', but ImageMagick on this host cannot write it (probed with a real 1x1 encode under the hardened policy). ${model} records will be built WITHOUT that version, and any existing one is retired when its tier is rebuilt.`,
			);
		}
	}
	return warnings;
}

/** Run the pre-flight and print it. Fire-and-forget from boot; never rejects. */
export async function reportAlternateExtensionSupport(): Promise<void> {
	try {
		for (const warning of await alternateExtensionWarnings()) {
			console.warn(warning);
		}
	} catch (error) {
		// A pre-flight that could not run must not be mistaken for a clean one.
		console.warn('[media] alternate-extension pre-flight skipped:', error);
	}
}
