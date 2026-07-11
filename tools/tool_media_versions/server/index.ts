/**
 * tool_media_versions server module — regenerate/inspect media derivatives.
 * Every mutation gates level>=2 on the record (per-record project scope); reads
 * gate level>=1. build_version may run av transcodes in the background.
 */

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
		get_files_info: { permission: 'record', minLevel: 1, handler: getFilesInfo },
		build_version: { permission: 'record', minLevel: 2, handler: buildVersion },
		sync_files: { permission: 'record', minLevel: 2, handler: syncFiles },
		delete_version: { permission: 'record', minLevel: 2, handler: deleteVersion },
		delete_quality: { permission: 'record', minLevel: 2, handler: deleteQuality },
		// component_av-specific (register.json specific_actions): remux container headers.
		conform_headers: { permission: 'record', minLevel: 2, handler: conformHeaders },
		// component_image-specific (register.json specific_actions): rotate a quality tier.
		rotate: { permission: 'record', minLevel: 2, handler: rotate },
	},
	backgroundRunnable: ['build_version'],
};
