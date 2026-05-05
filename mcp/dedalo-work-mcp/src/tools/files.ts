import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkClient } from '@dedalo/mcp-common';
import { registerTool, type ToolContext } from './_shared/register.js';
import { rqo } from './_shared/rqo.js';

/**
 * File / upload tools (`dd_utils_api`).
 *
 * Uploads accept Dédalo's `options` payload because the upload protocol
 * is highly variant (single shot vs chunked vs streamed). Schemas
 * declare common keys explicitly and allow extras through `passthrough`.
 */
export function registerFilesTools(server: McpServer, client: WorkClient, ctx: ToolContext): void {
	const UploadOptions = z.object({
		file_name: z.string().min(1).describe('Original file name including extension.'),
		key_dir: z.string().min(1).describe('Sanitised target subdirectory inside Dédalo upload root.'),
		mime_type: z.string().optional(),
		size: z.number().int().nonnegative().optional(),
	}).passthrough();

	registerTool(server, {
		name: 'dedalo_upload_file',
		description:
			'Upload a file to Dédalo. Accepts document, image, audio, and video files. The Dédalo user profile must permit uploads.',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true, title: 'Upload file' },
		inputSchema: z.object({ options: UploadOptions }),
		handler: async ({ options }) =>
			client.call(rqo('upload', 'dd_utils_api', undefined, undefined, options, false)),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_join_chunked_files',
		description: 'Join previously uploaded chunks into a single complete file. Use after a chunked upload.',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true, title: 'Join chunked files' },
		inputSchema: z.object({ options: z.record(z.unknown()).describe('Options identifying the file and its chunks.') }),
		handler: async ({ options }) =>
			client.call(rqo('join_chunked_files_uploaded', 'dd_utils_api', undefined, undefined, options, false)),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_list_uploads',
		description: 'List files staged in the upload directory but not yet processed.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'List uploads' },
		inputSchema: z.object({ options: z.record(z.unknown()).optional() }),
		handler: async ({ options }) =>
			client.call(rqo('list_uploaded_files', 'dd_utils_api', undefined, undefined, options)),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_delete_upload',
		description: 'Delete a staged file that has not yet been processed.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, title: 'Delete upload' },
		inputSchema: z.object({ options: z.record(z.unknown()).describe('Options identifying the file to delete.') }),
		handler: async ({ options }) =>
			client.call(rqo('delete_uploaded_file', 'dd_utils_api', undefined, undefined, options, false)),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_browse_files',
		description: 'Browse the Dédalo media file system. Returns directory listings and metadata.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Browse files' },
		inputSchema: z.object({ options: z.record(z.unknown()).optional() }),
		handler: async ({ options }) =>
			client.call(rqo('get_dedalo_files', 'dd_utils_api', undefined, undefined, options)),
	}, ctx);
}
