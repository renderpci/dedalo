import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkClient } from '@dedalo/mcp-common';
import { registerTool, type ToolContext } from './_shared/register.js';
import { rqo } from './_shared/rqo.js';
import { TipoSchema, OptionalLangSchema, SectionIdSchema, LocatorSchema } from './_shared/schemas.js';

/**
 * Per-component-type operations (portal, text_area, av, 3d).
 *
 * All actions are profile-gated by Dédalo. Annotations advertise
 * destructiveness so MCP clients can surface confirmation prompts.
 */
export function registerComponentTools(server: McpServer, client: WorkClient, ctx: ToolContext): void {
	const baseRecord = {
		tipo: TipoSchema.describe('Component tipo to operate on.'),
		section_tipo: TipoSchema,
		section_id: SectionIdSchema,
		lang: OptionalLangSchema,
	} as const;

	// ── Portal ───────────────────────────────────────────────────────────
	registerTool(server, {
		name: 'dedalo_portal_delete_locator',
		description: 'Remove a locator from a portal component, detaching the linked record.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, title: 'Portal: delete locator' },
		inputSchema: z.object({ ...baseRecord, locator: LocatorSchema }),
		handler: async ({ tipo, section_tipo, section_id, lang, locator }) =>
			client.call(rqo({ action: 'delete_locator', dd_api: 'dd_component_portal_api', source: { tipo, section_tipo, section_id, lang }, options: { locator }, prevent_lock: false })),
	}, ctx);

	// ── Text area tags ───────────────────────────────────────────────────
	registerTool(server, {
		name: 'dedalo_text_area_get_tags_info',
		description: 'List tags inside a text_area component with metadata and usage.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Text area: get tags info' },
		inputSchema: z.object(baseRecord),
		handler: async ({ tipo, section_tipo, section_id, lang }) =>
			client.call(rqo({ action: 'get_tags_info', dd_api: 'dd_component_text_area_api', source: { tipo, section_tipo, section_id, lang } })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_text_area_delete_tag',
		description: 'Delete a tag from a text_area component by tag id.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, title: 'Text area: delete tag' },
		inputSchema: z.object({ ...baseRecord, tag_id: z.string().min(1).describe('Tag identifier to delete.') }),
		handler: async ({ tipo, section_tipo, section_id, lang, tag_id }) =>
			client.call(rqo({ action: 'delete_tag', dd_api: 'dd_component_text_area_api', source: { tipo, section_tipo, section_id, lang }, options: { tag_id }, prevent_lock: false })),
	}, ctx);

	// ── AV ───────────────────────────────────────────────────────────────
	registerTool(server, {
		name: 'dedalo_av_get_media_streams',
		description: 'Return audio/video stream metadata: tracks, codecs, subtitles, bitrate.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'AV: get media streams' },
		inputSchema: z.object(baseRecord),
		handler: async ({ tipo, section_tipo, section_id, lang }) =>
			client.call(rqo({ action: 'get_media_streams', dd_api: 'dd_component_av_api', source: { tipo, section_tipo, section_id, lang } })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_av_download_fragment',
		description: 'Download a specific fragment from an AV resource by fragment id or time range.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'AV: download fragment' },
		inputSchema: z.object({ ...baseRecord, fragment: z.string().min(1).describe('Fragment identifier or time range expression.') }),
		handler: async ({ tipo, section_tipo, section_id, lang, fragment }) =>
			client.call(rqo({ action: 'download_fragment', dd_api: 'dd_component_av_api', source: { tipo, section_tipo, section_id, lang }, options: { fragment } })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_av_create_posterframe',
		description: 'Create a posterframe (thumbnail) for an AV resource at a given time position.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, title: 'AV: create posterframe' },
		inputSchema: z.object({ ...baseRecord, time: z.number().min(0).describe('Time position in seconds.') }),
		handler: async ({ tipo, section_tipo, section_id, lang, time }) =>
			client.call(rqo({ action: 'create_posterframe', dd_api: 'dd_component_av_api', source: { tipo, section_tipo, section_id, lang }, options: { time }, prevent_lock: false })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_av_delete_posterframe',
		description: 'Remove the posterframe of an AV resource.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, title: 'AV: delete posterframe' },
		inputSchema: z.object(baseRecord),
		handler: async ({ tipo, section_tipo, section_id, lang }) =>
			client.call(rqo({ action: 'delete_posterframe', dd_api: 'dd_component_av_api', source: { tipo, section_tipo, section_id, lang }, prevent_lock: false })),
	}, ctx);

	// ── 3D ───────────────────────────────────────────────────────────────
	registerTool(server, {
		name: 'dedalo_3d_move_file',
		description: 'Move a 3D model file to its target directory after upload.',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true, title: '3D: move file' },
		inputSchema: z.object({ ...baseRecord, target_dir: z.string().min(1).describe('Target directory inside Dédalo media storage.') }),
		handler: async ({ tipo, section_tipo, section_id, lang, target_dir }) =>
			client.call(rqo({ action: 'move_file_to_dir', dd_api: 'dd_component_3d_api', source: { tipo, section_tipo, section_id, lang }, options: { target_dir }, prevent_lock: false })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_3d_delete_posterframe',
		description: 'Remove the posterframe of a 3D model component.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, title: '3D: delete posterframe' },
		inputSchema: z.object(baseRecord),
		handler: async ({ tipo, section_tipo, section_id, lang }) =>
			client.call(rqo({ action: 'delete_posterframe', dd_api: 'dd_component_3d_api', source: { tipo, section_tipo, section_id, lang }, prevent_lock: false })),
	}, ctx);
}
