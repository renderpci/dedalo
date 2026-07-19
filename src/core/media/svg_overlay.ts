/**
 * IMAGE SVG OVERLAY — the edit-view display envelope (PHP component_image
 * create_default_svg_string_node / get_svg_file_path / get_base_svg_url).
 *
 * The client's image EDIT view does not point an <img> at the raster directly —
 * it loads an `<object type="image/svg+xml" data="{base_svg_url}">`, an SVG
 * envelope that embeds the raster via `<image xlink:href="{quality url}">` and
 * anchors the vector annotation layers ("Capas de dibujo"). When the read omits
 * `base_svg_url` (no envelope on disk) the client falls back to the placeholder
 * SVG and shows nothing. So every uploaded/regenerated image MUST also get its
 * SVG envelope, and the read MUST emit its URL.
 *
 * The envelope lives in a literal `svg` sub-folder of the image tree:
 *   MEDIA_PATH + /image + initial_media_path + /svg + additional_path + /<id>.svg
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../../config/config.ts';
import type { MediaTypeSpec } from '../concepts/media.ts';
import { getDimensions } from './engine/imagemagick.ts';
import {
	type MediaIdentity,
	type MediaPathOptions,
	additionalPath,
	assertInsideMediaRoot,
	buildMediaIdentifier,
	buildMediaLocation,
	requireMediaRoot,
} from './path.ts';

/** A resolved SVG-envelope location (relative URL/path + absolute FS path). */
export interface SvgLocation {
	/** Media-root-relative path, leading slash (e.g. /image/svg/0/rsc29_rsc170_1.svg). */
	relativePath: string;
	/** Absolute filesystem path, confined inside the media root. */
	absolutePath: string;
}

/** Compute the SVG-envelope location for an image identity (PHP get_svg_file_path). */
export function svgOverlayLocation(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
): SvgLocation {
	const identifier = buildMediaIdentifier(identity);
	const bucket =
		pathOpts.additionalPathOverride != null && pathOpts.additionalPathOverride !== ''
			? pathOpts.additionalPathOverride
			: additionalPath(identity.sectionId, pathOpts.maxItemsFolder);
	// folder + initial_media_path + '/svg' + additional_path  (literal 'svg' segment)
	const relativeDir = `${spec.folder}${pathOpts.initialMediaPath}/svg${bucket}`;
	const relativePath = `${relativeDir}/${identifier}.svg`;
	const root = requireMediaRoot(pathOpts.mediaRoot);
	const absolutePath = assertInsideMediaRoot(`${root}${relativePath}`, root);
	return { relativePath, absolutePath };
}

/**
 * Build the default SVG envelope string (PHP create_default_svg_string_node):
 * an <svg> sized to the raster with one <g id="raster"><image xlink:href=…/>.
 * `rasterUrl` is the default-quality raster URL (what the client swaps on a
 * quality change).
 */
export function buildDefaultSvgString(width: number, height: number, rasterUrl: string): string {
	return `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0,0,${width},${height}"><g id="raster"><image width="${width}" height="${height}" xlink:href="${rasterUrl}"/></g></svg>`;
}

/** The default-quality raster URL used as the SVG's xlink:href (DEDALO_MEDIA_URL + relative path).
 * Exported for the regenerate drift-fix (media/repair.ts): the PERSISTED envelope must embed
 * exactly this relative URL — v6 regenerate_component rewrites it when it drifted. */
export function defaultRasterUrl(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
): string {
	const location = buildMediaLocation(
		spec,
		identity,
		spec.defaultQuality,
		spec.defaultExtension,
		pathOpts,
	);
	return `/dedalo/${config.mediaDir}${location.relativePath}`;
}

/**
 * Create/overwrite the default SVG envelope for an image (PHP create_svg_file via
 * regenerate_component). Reads the default-quality raster's dimensions to size
 * the envelope. No-op (returns null) when the default-quality raster is absent.
 */
export async function createDefaultSvgFile(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
): Promise<string | null> {
	if (spec.model !== 'component_image') return null;
	const rasterPath = buildMediaLocation(
		spec,
		identity,
		spec.defaultQuality,
		spec.defaultExtension,
		pathOpts,
	).absolutePath;
	if (!existsSync(rasterPath)) return null;

	const dims = await getDimensions(rasterPath).catch(() => ({ width: 0, height: 0 }));
	const rasterUrl = defaultRasterUrl(spec, identity, pathOpts);
	const svg = buildDefaultSvgString(dims.width, dims.height, rasterUrl);

	const location = svgOverlayLocation(spec, identity, pathOpts);
	const dir = dirname(location.absolutePath);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o775 });
	writeFileSync(location.absolutePath, svg);
	return location.absolutePath;
}

/**
 * The `base_svg_url` the read emits (PHP get_base_svg_url(test_file=true)):
 * the envelope URL when the file exists, else null (the client then shows the
 * placeholder). URL = DEDALO_MEDIA_URL + the svg relative path.
 */
export function baseSvgUrl(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
): string | null {
	if (spec.model !== 'component_image') return null;
	const location = svgOverlayLocation(spec, identity, pathOpts);
	if (!existsSync(location.absolutePath)) return null;
	// Media web base (NOT the relative literal): the envelope is fetched by the
	// BROWSER, so it must point at wherever media is actually served. The href
	// EMBEDDED in the envelope file (defaultRasterUrl) stays relative on purpose
	// — it resolves against the envelope's own fetch origin, keeping the
	// persisted file host-portable.
	return `${config.media.webBase}${location.relativePath}`;
}
