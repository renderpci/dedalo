/**
 * SVG RASTERIZER — the one place a vector file becomes pixels.
 *
 * WHY IT IS NOT IMAGEMAGICK, which rasterizes every other source in this engine.
 * ImageMagick runs under the hardened `imagemagick-policy/policy.xml` (MEDIA-02),
 * which disables the scripting coders `MSL` and `MVG` — a long-standing RCE
 * vector. On a build with no librsvg delegate ImageMagick renders SVG through its
 * OWN renderer, and that renderer EMITS MVG, so the policy refuses the conversion:
 *
 *   magick 'x.svg[0]' -background '#ffffff' -flatten -thumbnail 222x148 out.jpg
 *   → "attempt to perform an operation not authorized by the security policy `MVG'"
 *
 * MEASURED on this install (2026-08-08): refused with the policy, produced with it
 * removed — i.e. the only way to rasterize SVG *through ImageMagick* is to hand
 * back the exact coder the hardening exists to remove. That was left KNOWN-OPEN in
 * policy.xml ("this costs the component_svg THUMB gear … a security decision"),
 * and this module is the decision: render the vector in a DEDICATED program and
 * keep MVG closed. `rsvg-convert` parses SVG and nothing else — it has no coder
 * dispatch, no delegate table and no scripting language to reach.
 *
 * The PNG this writes is an INTERMEDIATE: the thumb itself is still produced by
 * the shared ImageMagick recipe (processing.ts buildThumbVersion), so an SVG thumb
 * gets the same box, background and atomic-write treatment as every other thumb,
 * and the raster policy keeps applying to the file that is actually indexed.
 *
 * PHP anchor: component_svg::create_thumb (frozen class.component_svg.php:353) —
 * same intent (density 150 → raster → thumb box), different renderer for the
 * reason above.
 */

import { existsSync } from 'node:fs';
import { config } from '../../../config/config.ts';
import { DedaloError } from '../../errors/dedalo_error.ts';
import { runBinary } from './spawn.ts';

/** True when librsvg's CLI is installed where the config says (boot/gear probe). */
export function rsvgAvailable(): boolean {
	return existsSync(config.media.binaries.rsvgConvert);
}

/**
 * What an operator has to do when it is missing. Kept beside the probe because
 * every refusal in this file ends with it — an SVG thumb that cannot be built is
 * an INSTALL fact, and "no rasterizer" alone is not actionable.
 */
export const RSVG_MISSING_HINT =
	"SVG rasterization needs librsvg's 'rsvg-convert' (ImageMagick cannot do it — its SVG renderer emits MVG, which the hardened policy disables)";

/** Build the librsvg argv: `rsvg-convert --dpi-x N --dpi-y N -o <out> <src>`. */
export function buildRsvgArgv(source: string, target: string, dpi: number): string[] {
	if (!Number.isFinite(dpi) || dpi <= 0) {
		throw new Error(`rasterizeSvg: invalid dpi '${dpi}'`);
	}
	return [
		config.media.binaries.rsvgConvert,
		'--dpi-x',
		String(dpi),
		'--dpi-y',
		String(dpi),
		'--format',
		'png',
		'-o',
		target,
		source,
	];
}

/**
 * Rasterize an SVG to a PNG at `dpi` (default `DEDALO_SVG_THUMB_DPI`). Throws —
 * with the install hint — when the binary is absent, when the render fails, or
 * when it exits 0 having written nothing (the same output post-condition
 * `runMagickTo` enforces: an exit code is not evidence of a file).
 *
 * `nice` is ON, like every other media transform: this runs off the request path
 * (thumb builds) and the box is shared.
 */
export async function rasterizeSvg(
	source: string,
	target: string,
	dpi: number = config.media.svgThumbDpi,
): Promise<string> {
	if (!rsvgAvailable()) {
		// Operator disclosure: the install remedy names a filesystem path, so it
		// stays in the log; the wire says only "not available on this server".
		throw new DedaloError('media.engine_unavailable', {
			message: `rasterizeSvg: ${RSVG_MISSING_HINT} — not found at '${config.media.binaries.rsvgConvert}'. Install librsvg (brew install librsvg / apt install librsvg2-bin) or set DEDALO_RSVG_CONVERT_PATH.`,
			coordinates: { binary: config.media.binaries.rsvgConvert },
		});
	}
	const result = await runBinary(buildRsvgArgv(source, target, dpi), { nice: true });
	if (result.exitCode !== 0) {
		throw new Error(
			`rasterizeSvg: rsvg-convert failed for ${source} (exit ${result.exitCode}): ${result.stderr.trim()}`,
		);
	}
	if (!existsSync(target)) {
		throw new Error(
			`rasterizeSvg: rsvg-convert produced no output file for ${source} (exit 0) — ${result.stderr.trim()}`,
		);
	}
	return target;
}
