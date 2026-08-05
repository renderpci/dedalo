/**
 * SCENE SELECTION — the one place that decides what "the source's own image" is.
 *
 * An image file is not necessarily one image (Photoshop layers, TIFF/PDF pages,
 * GIF frames), so every gear that hands a source to ImageMagick has to say WHICH
 * image it means. That decision is a single token, and it is built here.
 *
 * WHY ITS OWN LEAF MODULE: both the argv recipes (`imagemagick.ts`) and the probe
 * (`probe.ts`) need it, and `imagemagick.ts` already imports `probe.ts` — putting
 * the token builder in either one would close an import cycle. Same reason
 * `binaries.ts` exists. It also matters for CORRECTNESS and not just for layering:
 * `probeMetaChannels` asks ImageMagick about a specific image and the convert then
 * masks a specific image, and if those two ever disagreed the engine would decide
 * on one image's channels and apply the result to another's.
 *
 * `media_writer_discipline_tripwire.test.ts` bans `${source}[0]` everywhere but
 * here, so a new gear cannot paste a selector without deciding what it means.
 */

/**
 * Which image of a multi-image source a recipe operates on.
 *
 * - `representative` — take the source's OWN first image (`SOURCE[0]`). Correct
 *   whenever `probeImageSource().hasRepresentativeScene` is true: a merged
 *   PSD/TIFF composite, page 1 of a paged source, frame 1 of a GIF.
 * - `composite` — hand ImageMagick the whole sequence and let `-flatten` stack
 *   it. The fallback for a source that declares no representative image.
 *
 * Measured on the 2026-08-04 layered TIFFs: `[0]` vs `-flatten` differ by
 * RMSE 0.005 (an antialias halo from re-compositing already-composited content)
 * — scene 0 ALREADY contains the layers. Meanwhile a blanket `-flatten` is
 * measurably WRONG for paged/framed sources, which are allow-listed today:
 * multi-page TIFF → page 3, animated GIF → last frame, delta GIF → a stack
 * matching no frame. Hence: take the source's own image when it declares one.
 *
 * v6's `-layers merge` and `remove_layer_0` are deliberately NOT ported:
 * `-layers merge` can GROW the canvas and emit negative page offsets
 * (200x100 → 250x180, `240x120+-40+-20`), desynchronising the tier from
 * `getDimensions` and the SVG envelope; `remove_layer_0` was 59.7 % wrong here.
 */
export type SceneSelection = 'representative' | 'composite';

/** The source token a recipe feeds ImageMagick for this selection. */
export function sceneToken(source: string, selection: SceneSelection): string {
	return selection === 'representative' ? `${source}[0]` : source;
}
