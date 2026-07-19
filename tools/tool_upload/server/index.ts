/**
 * tool_upload server module — process_uploaded_file (PHP tool_upload).
 *
 * Consumes a staged upload (already received + validated by the upload endpoint)
 * and ingests it: add_file into the original tier + per-type regenerate. Gates
 * level>=2 on the record (write). The staged tmp_name/key_dir come from the
 * upload receiver; the extension is re-validated in add_file.
 */

import { processUploadedFile } from '../../../src/core/media/ingest/process_uploaded_file.ts';
import { buildMediaIdentifier } from '../../../src/core/media/path.ts';
import { resolveMediaToolContext } from '../../../src/core/media/tool_support.ts';
import { persistUploadedMedia } from '../../../src/core/media/tools/files_info_persist.ts';
import { MEDIA_JOB_STATUS_ACTION } from '../../../src/core/tools/job_status.ts';
import type {
	ToolActionContext,
	ToolResponse,
	ToolServerModule,
} from '../../../src/core/tools/module.ts';

async function processUploaded(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const { spec, identity, pathOpts, items } = await resolveMediaToolContext(ctx.options);
		const fileData = (ctx.options.file_data ?? {}) as Record<string, unknown>;
		const userId = ctx.userId;
		const result = await processUploadedFile({
			spec,
			identity,
			pathOpts,
			userId,
			keyDir: String(fileData.key_dir ?? ctx.options.key_dir ?? ''),
			tmpName: String(fileData.tmp_name ?? ''),
			extension: String(fileData.extension ?? ''),
		});
		// Persist the fresh files_info + original_* keys to the record so the client
		// renders the NEW image (not the stale/placeholder). Without this the upload
		// only touched the disk; the stored media data stayed on the old file.
		await persistUploadedMedia({
			sectionTipo: identity.sectionTipo,
			sectionId: identity.sectionId,
			componentTipo: identity.componentTipo,
			lang: identity.lang,
			existingItems: items as { id?: number; lang?: string | null; files_info?: unknown }[],
			filesInfo: result.filesInfo,
			originalFileName: String(fileData.tmp_name ?? result.originalFileName),
			originalNormalizedName: `${buildMediaIdentifier(identity)}.${result.extension}`,
		});

		// Activity audit (PHP logger 'UPLOAD COMPLETE' code 11,
		// tool_upload :49). PHP serializes the whole file_data blob into the
		// payload as a JSON STRING — mirrored here, including the shape.
		{
			const { logActivity, hostFromClientIp } = await import(
				'../../../src/core/api/handlers/activity_log.ts'
			);
			await logActivity({
				what: 'UPLOAD COMPLETE',
				tipo: identity.componentTipo,
				userId,
				host: hostFromClientIp(ctx.clientIp),
				data: {
					msg: 'Upload file complete. Processing uploaded file',
					file_data: JSON.stringify(fileData),
				},
			});
		}
		return {
			result: true,
			msg: 'ok',
			errors: [],
			original_file_name: result.originalFileName,
			extension: result.extension,
			files_info: result.filesInfo,
			job_id: result.jobId,
		};
	} catch (error) {
		return { result: false, msg: (error as Error).message, errors: [(error as Error).message] };
	}
}

export const tool: ToolServerModule = {
	name: 'tool_upload',
	apiActions: {
		process_uploaded_file: { permission: 'record', minLevel: 2, handler: processUploaded },
		// DEC-22a: poll the transcode job started by process_uploaded_file (the
		// job_id in its response) — serves the client-shaped status frame().
		get_job_status: MEDIA_JOB_STATUS_ACTION,
	},
};
