/**
 * MEDIA family emit hook (audit S2-24) — the emit-time particularity of the
 * five media models (component_image / av / 3d / pdf / svg, declared as
 * `emitHook: 'media'` on their descriptors and dispatched by
 * components/emit_hooks.ts).
 *
 * Extracted VERBATIM from section/read.ts emitDdoData's media branch — the
 * media subsystem is the family's home (concepts/media.ts contract + this
 * engine dir), so the per-model emit behavior lives here instead of the shared
 * read pipeline (the descriptor doctrine: a model has a single place).
 *
 * Behavior (all PHP-pinned, see the inline notes):
 * - LIST mode ships the files_info projection (list qualities only);
 *   EDIT/viewer modes ship the stored media items (full files_info inside,
 *   what the quality selector iterates) plus the per-model envelope fields.
 * - component_av re-derives files_info from disk on every read (PHP scans —
 *   the stored copy is a cache that misses freshly transcoded qualities).
 * - component_image carries external_source (every mode) + base_svg_url
 *   (non-list) — without base_svg_url the edit view can't build its SVG
 *   envelope and falls back to the placeholder.
 * - component_av/3d carry posterframe_url in every mode; av edit adds the
 *   subtitles descriptor for the player's <track>.
 */

import type { ComponentEmitHook, EmitHookContext } from '../components/emit_hooks.ts';
import { mediaTypeOf } from '../concepts/media.ts';
import type { MatrixRecord } from '../db/matrix.ts';
import { buildDataItem } from '../resolve/component_data.ts';

export const mediaEmitHook: ComponentEmitHook = {
	async emitItem(context: EmitHookContext): Promise<void> {
		const { ddo, record, row, model, ddoMode, callerTipo, emission } = context;
		const { getMediaListValue } = await import('../resolve/media_list_value.ts');
		const { readComponentItems } = await import('../resolve/component_data.ts');
		const storedItems = readComponentItems(record, ddo.tipo, model);
		// component_av: its quality derivatives (e.g. '404', 'audio') are built
		// by an ASYNC transcode job that completes AFTER process_uploaded_file
		// persisted files_info — so the stored copy only ever carries 'original'.
		// PHP re-derives files_info by scanning the disk on EVERY read (the stored
		// copy is a cache, not authoritative); mirror that for av so the freshly
		// transcoded qualities show up on the next read. Without this the client
		// defaults to quality '404', can't find it in the stale files_info, and
		// shows an empty player even though the video is on disk. (Image/pdf/svg/3d
		// build derivatives synchronously, so their stored cache is already complete.)
		let effectiveItems: unknown[] | null = storedItems;
		if (model === 'component_av' && Array.isArray(storedItems) && storedItems.length > 0) {
			const { scanFilesInfo } = await import('./files_info.ts');
			const { resolveMediaPathOptions } = await import('./ontology_path.ts');
			const avSpec = mediaTypeOf('component_av');
			if (avSpec !== null) {
				const avPathOpts = await resolveMediaPathOptions(ddo.tipo, row.section_tipo);
				effectiveItems = storedItems.map((raw) => {
					const it = raw as Record<string, unknown>;
					const freshFilesInfo = scanFilesInfo(
						avSpec,
						{
							componentTipo: ddo.tipo,
							sectionTipo: row.section_tipo,
							sectionId: Number(row.section_id),
							lang: (it.lang as string | null) ?? null,
						},
						avPathOpts,
						{ originalNormalizedName: (it.original_normalized_name as string | undefined) ?? null },
					);
					return { ...it, files_info: freshFilesInfo };
				});
			}
		}
		const mediaEntries =
			ddoMode === 'list' ? getMediaListValue(model, effectiveItems) : effectiveItems;
		const item = buildDataItem(
			ddo.tipo,
			row.section_tipo,
			row.section_id,
			ddoMode,
			'lg-nolan',
			mediaEntries,
		);
		// IMAGE items always carry external_source (PHP component_image_json
		// → media_common::get_external_source): when properties.external_source
		// names an IRI component, its stored value on THIS record — an item
		// with non-empty dataframe AND iri — overrides the media URL; null
		// otherwise (the overwhelmingly common case).
		if (model === 'component_image') {
			item.external_source = await resolveExternalSource(record, ddo.tipo);
			// base_svg_url: the edit/viewer SVG envelope URL (PHP
			// get_base_svg_url(test_file=true)). null when no envelope on disk.
			if (ddoMode !== 'list') {
				item.base_svg_url = await resolveImageBaseSvgUrl(
					ddo.tipo,
					row.section_tipo,
					Number(row.section_id),
				);
			}
		}
		// AV and 3D items carry posterframe_url in EVERY mode (the client shows a
		// poster thumbnail without an extra request — the 3D snapshot / video
		// still); AV also carries, in EDIT mode, the subtitles descriptor for the
		// player's <track> (PHP component_av_json.php:167-190 /
		// component_3d_json.php:108-114). posterframe_url is null when the
		// component holds no media yet (PHP empty($value) → null).
		if (model === 'component_av' || model === 'component_3d') {
			const hasMedia = Array.isArray(storedItems) && storedItems.length > 0;
			if (hasMedia) {
				const { buildMediaIdentifier, additionalPath, subtitlesUrl } = await import('./path.ts');
				const { resolveMediaPathOptions } = await import('./ontology_path.ts');
				const { config: cfg } = await import('../../config/config.ts');
				const spec = mediaTypeOf(model);
				if (spec !== null) {
					const identifier = buildMediaIdentifier({
						componentTipo: ddo.tipo,
						sectionTipo: row.section_tipo,
						sectionId: Number(row.section_id),
						lang: null,
					});
					const pathOpts = await resolveMediaPathOptions(ddo.tipo, row.section_tipo);
					const bucket = additionalPath(Number(row.section_id), pathOpts.maxItemsFolder);
					const base = `${cfg.media.webBase}${spec.folder}`;
					// Posterframe extension is the AV posterframe ext for both types (PHP
					// component_3d uses DEDALO_AV_POSTERFRAME_EXTENSION too).
					item.posterframe_url = `${base}${pathOpts.initialMediaPath}/posterframe${bucket}/${identifier}.${cfg.media.avExtras.posterframeExtension}`;
					if (model === 'component_av' && ddoMode === 'edit') {
						const { getLangNameFromCode, getAlpha2FromCode } = await import(
							'../resolve/lang_names.ts'
						);
						const { currentDataLang } = await import('../resolve/request_lang.ts');
						const dataLang = currentDataLang();
						item.subtitles = {
							// Shared grammar (path.ts subtitlesUrl) — the same builder
							// tool_transcription build_subtitles_file writes with.
							subtitles_url: subtitlesUrl(
								{
									componentTipo: ddo.tipo,
									sectionTipo: row.section_tipo,
									sectionId: Number(row.section_id),
									lang: null,
								},
								dataLang,
							),
							lang_name: await getLangNameFromCode(dataLang),
							lang: getAlpha2FromCode(dataLang),
						};
					}
				}
			} else {
				item.posterframe_url = null;
			}
		}
		item.row_section_id = row.section_id;
		item.parent_tipo = callerTipo;
		emission.items.push(item);
	},
};

/**
 * PHP media_common::get_external_source — the image component's
 * properties.external_source names an IRI component whose stored value on
 * the SAME record (an item with non-empty dataframe AND a non-empty iri)
 * overrides the media URL. Null in every other case (PHP empty() rules:
 * a bare object counts as non-empty; an empty array does not).
 */
async function resolveExternalSource(
	record: MatrixRecord,
	imageTipo: string,
): Promise<string | null> {
	const { getNode } = await import('../ontology/resolver.ts');
	const properties = (await getNode(imageTipo))?.properties as {
		external_source?: unknown;
	} | null;
	const iriTipo =
		typeof properties?.external_source === 'string' ? properties.external_source : null;
	if (iriTipo === null) return null;
	const { readComponentItems } = await import('../resolve/component_data.ts');
	const first = readComponentItems(record, iriTipo, 'component_iri')?.[0] as
		| { dataframe?: unknown; iri?: unknown }
		| undefined;
	const dataframe = first?.dataframe;
	const dataframeNonEmpty =
		dataframe !== undefined &&
		dataframe !== null &&
		dataframe !== false &&
		dataframe !== '' &&
		!(Array.isArray(dataframe) && dataframe.length === 0);
	if (dataframeNonEmpty && typeof first?.iri === 'string' && first.iri !== '') {
		return first.iri;
	}
	return null;
}

/**
 * The image's SVG-envelope URL for the edit/viewer (PHP component_image
 * get_base_svg_url(test_file=true)): the URL when the envelope file exists on
 * disk, else null (the client then shows the placeholder). Media not configured
 * (no MEDIA_PATH) → null, never throws.
 */
async function resolveImageBaseSvgUrl(
	componentTipo: string,
	sectionTipo: string,
	sectionId: number,
): Promise<string | null> {
	try {
		const spec = mediaTypeOf('component_image');
		if (spec === null) return null;
		const { resolveMediaPathOptions } = await import('./ontology_path.ts');
		const { baseSvgUrl } = await import('./svg_overlay.ts');
		const pathOpts = await resolveMediaPathOptions(componentTipo, sectionTipo);
		return baseSvgUrl(spec, { componentTipo, sectionTipo, sectionId, lang: null }, pathOpts);
	} catch {
		return null;
	}
}
