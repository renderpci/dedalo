/**
 * MEDIA TOOL SUPPORT — resolve a media component's spec + identity + path options
 * from a tool request's options, and read its stored media items from the matrix.
 * Shared by the media tool handlers (tool_media_versions / tool_image_rotation /
 * tool_pdf_extractor / tool_posterframe).
 */

import { config } from '../../config/config.ts';
import { type MediaTypeSpec, isMediaModel, mediaTypeOf } from '../concepts/media.ts';
import { readMatrixRecord } from '../db/matrix.ts';
import {
	getMatrixTableFromTipo,
	getModelByTipo,
	getTranslatableByTipo,
} from '../ontology/resolver.ts';
import { resolveMediaPathOptions } from './ontology_path.ts';
import type { MediaIdentity, MediaPathOptions } from './path.ts';

/** The resolved context a media tool handler operates on. */
export interface MediaToolContext {
	spec: MediaTypeSpec;
	identity: MediaIdentity;
	pathOpts: MediaPathOptions;
	/** The stored media items for this component (files_info carriers), or []. */
	items: Record<string, unknown>[];
}

/** Options shape common to media tools. */
export interface MediaToolOptions {
	tipo?: unknown;
	component_tipo?: unknown;
	section_tipo?: unknown;
	section_id?: unknown;
	lang?: unknown;
}

/**
 * Resolve the media context for a tool request. Throws on a non-media component
 * or a missing target. `lang` defaults to the data lang for translatable
 * components, null otherwise (matches the identifier suffix rule).
 */
export async function resolveMediaToolContext(
	options: MediaToolOptions,
): Promise<MediaToolContext> {
	const componentTipo = String(options.tipo ?? options.component_tipo ?? '');
	const sectionTipo = String(options.section_tipo ?? '');
	const sectionId = Number(options.section_id);
	if (
		componentTipo === '' ||
		sectionTipo === '' ||
		!Number.isInteger(sectionId) ||
		sectionId <= 0
	) {
		throw new Error('media tool: tipo, section_tipo and a positive section_id are required');
	}
	const model = await getModelByTipo(componentTipo);
	if (model === null || !isMediaModel(model)) {
		throw new Error(`media tool: '${componentTipo}' is not a media component`);
	}
	const spec = mediaTypeOf(model);
	if (spec === null) {
		// unreachable after the isMediaModel gate above — fail loud, not silently
		throw new Error(`media tool: no media spec registered for model '${model}'`);
	}
	const translatable = await getTranslatableByTipo(componentTipo);
	const lang =
		typeof options.lang === 'string' ? options.lang : translatable ? config.menu.dataLang : null;
	const identity: MediaIdentity = { componentTipo, sectionTipo, sectionId, lang };
	const pathOpts = await resolveMediaPathOptions(componentTipo, sectionTipo);

	// Read the stored media items (for files_info / external_source).
	const table = await getMatrixTableFromTipo(sectionTipo);
	let items: Record<string, unknown>[] = [];
	if (table !== null) {
		const record = await readMatrixRecord(table, sectionTipo, sectionId);
		const mediaColumn = record?.columns.media as Record<string, unknown[]> | undefined;
		const raw = mediaColumn?.[componentTipo];
		if (Array.isArray(raw)) items = raw as Record<string, unknown>[];
	}
	return { spec, identity, pathOpts, items };
}
