/**
 * tool_media_versions server module — regenerate/inspect media derivatives.
 *
 * Every action gates 'record_tipo': level>=2 on the (section_tipo, media
 * component) PAIR *and* the per-record project scope — PHP asserts both at each
 * of these seven doors (assert_tipo_permission + assert_record_in_user_scope).
 * Reads gate level>=1. The plain 'record' kind these used to declare checked the
 * SECTION level only, so a user explicitly denied write on one media component
 * could still delete its files through a section grant. build_version may run av
 * transcodes in the background.
 */

import { MEDIA_JOB_STATUS_ACTION } from '../../../src/core/tools/job_status.ts';
import type { ToolServerModule } from '../../../src/core/tools/module.ts';
import {
	buildVersion,
	conformHeaders,
	deleteQuality,
	deleteVersion,
	getFilesInfo,
	rotate,
	syncFiles,
} from './media_versions.ts';

export const tool: ToolServerModule = {
	name: 'tool_media_versions',
	apiActions: {
		get_files_info: { permission: 'record_tipo', minLevel: 1, handler: getFilesInfo },
		build_version: { permission: 'record_tipo', minLevel: 2, handler: buildVersion },
		sync_files: { permission: 'record_tipo', minLevel: 2, handler: syncFiles },
		delete_version: { permission: 'record_tipo', minLevel: 2, handler: deleteVersion },
		delete_quality: { permission: 'record_tipo', minLevel: 2, handler: deleteQuality },
		// component_av-specific (register.json specific_actions): remux container headers.
		conform_headers: { permission: 'record_tipo', minLevel: 2, handler: conformHeaders },
		// component_image-specific (register.json specific_actions): rotate a quality tier.
		rotate: { permission: 'record_tipo', minLevel: 2, handler: rotate },
		// The poll wire for the av transcode build_version mints (job_id). Without
		// it the panel could only guess from the filesystem — it blinked
		// "Processing" forever when a job failed, because a file that is never
		// written is indistinguishable from one that is still encoding.
		get_job_status: MEDIA_JOB_STATUS_ACTION,
	},
	backgroundRunnable: ['build_version'],
};
