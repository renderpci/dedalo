/**
 * WHERE THIS CONTAINER'S IMAGE CAME FROM — as the stack declares it
 * (installer unification D2, 2026-10-09).
 *
 * The operator chose the source when installing: one of Dédalo's registries,
 * a registry of their own, or a local build. install.sh records it in the
 * HOST-side `.dedalo.env` (DEDALO_IMAGE, DEDALO_IMAGE_MODE), which the engine
 * never reads; the compose stacks hand it to the engine as
 * DEDALO_CONTAINER_IMAGE / DEDALO_CONTAINER_IMAGE_MODE. The code-update panel
 * uses it to name the source and the host command — it never acts on it: the
 * engine has no docker access, and the host updater re-reads `.dedalo.env`.
 *
 * WHY THE PROCESS ENVIRONMENT ONLY. The value describes the container the
 * launcher built; `../private/.env` outlives every container and is shared by
 * every launch method, so a value there could only ever be stale. Same rule as
 * DEDALO_SUPERVISED (src/core/update/supervision.ts) — literal key per call, so
 * the config census sees it.
 *
 * WHY THE DISTINCT NAMES. DEDALO_IMAGE_* is the media-image configuration
 * family; DEDALO_CONTAINER_IMAGE cannot collide with a media key.
 *
 * A LEAF: env.ts and the registry validator only, never config.ts, so the
 * install mode and the ops CLI can load it. Values are VALIDATED — a wrong
 * repository or mode is reported as absent (null), never passed on.
 * Gate: test/unit/image_source_tripwire.test.ts.
 */

import { processEnvValue } from '../../config/env.ts';
import { isRepositoryReference } from './image_registries.ts';

/** How the image reaches this host: pulled from a registry, or built from the checkout. */
export type ImageSourceMode = 'pull' | 'build';

/** The declared source; each half is null when undeclared or invalid. */
export interface ImageSource {
	mode: ImageSourceMode | null;
	repository: string | null;
}

/** Reads one declared key. The seam: tests pass their own getter. */
export type ImageSourceGetter = (
	key: 'DEDALO_CONTAINER_IMAGE' | 'DEDALO_CONTAINER_IMAGE_MODE',
) => string | undefined;

/** The process-environment getter — a literal key at each call (the census reads it). */
function processGetter(
	key: 'DEDALO_CONTAINER_IMAGE' | 'DEDALO_CONTAINER_IMAGE_MODE',
): string | undefined {
	return key === 'DEDALO_CONTAINER_IMAGE'
		? processEnvValue('DEDALO_CONTAINER_IMAGE')
		: processEnvValue('DEDALO_CONTAINER_IMAGE_MODE');
}

/** A declared mode, or null. */
export function parseImageSourceMode(value: string | undefined): ImageSourceMode | null {
	const trimmed = value?.trim();
	return trimmed === 'pull' || trimmed === 'build' ? trimmed : null;
}

/** A declared repository (no tag, no digest), or null. */
export function parseImageRepository(value: string | undefined): string | null {
	const trimmed = value?.trim();
	return isRepositoryReference(trimmed) ? trimmed : null;
}

/** The image source the container stack declared. Read live, never cached. */
export function declaredImageSource(get: ImageSourceGetter = processGetter): ImageSource {
	return {
		mode: parseImageSourceMode(get('DEDALO_CONTAINER_IMAGE_MODE')),
		repository: parseImageRepository(get('DEDALO_CONTAINER_IMAGE')),
	};
}
