/**
 * media_control widget — the media-protection dashboard (PHP
 * widgets/media_control). The MEDIA DIRECTORY is shared, so the file-state
 * segments are byte-parity with PHP: the delivery-grade public quality
 * folders, media_path, the .htaccess existence/path, the .publication
 * marker-store counts and the diffusion engine media_index_status RPC.
 * ENGINE-NATIVE: mode/mode_source describe THIS server's posture (the dev
 * listener serves media session-gated; production enforcement is the reverse
 * proxy), the PHP config constants report null, cookie_name is the TS
 * session cookie (the credential that actually gates media here) and
 * htaccess.up_to_date is null — the rewrite template belongs to the PHP
 * install, so TS reports the shared file's existence, not its conformance.
 */

import type { Principal } from '../../security/permissions.ts';
import { type WidgetModule, type WidgetResponse, engineDenied } from './support.ts';

async function mediaControlGetValue(
	_options: Record<string, unknown>,
	principal: Principal,
): Promise<WidgetResponse> {
	const { existsSync, readdirSync, statSync } = await import('node:fs');
	const { join } = await import('node:path');
	const { readEnv } = await import('../../../config/env.ts');

	const mediaPath = readEnv('MEDIA_PATH') ?? null;

	// PHP count_dir_files: null when the dir is missing, else the entry count
	const countDirFiles = (dir: string): number | null => {
		try {
			if (!statSync(dir).isDirectory()) return null;
			return readdirSync(dir).length;
		} catch {
			return null;
		}
	};

	const basePath = mediaPath !== null ? join(mediaPath, '.publication') : null;
	const markers = {
		base_path: basePath,
		base_exists: basePath !== null && existsSync(basePath),
		pub_count: basePath !== null ? countDirFiles(join(basePath, 'pub')) : null,
		auth_count: basePath !== null ? countDirFiles(join(basePath, 'auth')) : null,
	};

	const htaccessPath = mediaPath !== null ? join(mediaPath, '.htaccess') : null;
	const htaccess = {
		exists: htaccessPath !== null && existsSync(htaccessPath),
		up_to_date: null,
		path: htaccessPath,
	};

	// markers: NATIVE media-index status (S2-31 store, in-process filesystem
	// read) — the only source since the 2026-07-11 cutover retired the
	// old-engine socket RPC. An unregistered store (failed boot registration,
	// server.ts logs it) reports unreachable with the same envelope shape.
	const { getNativeMediaIndexOps } = await import('../../diffusion_bridge/diffusion_delete.ts');
	const nativeOps = getNativeMediaIndexOps();
	let engine: {
		reachable: boolean;
		media_index_enabled: boolean | null;
		media_path: string | null;
		pub_markers: number | null;
		databases: string[];
		msg: string | null;
	};
	if (nativeOps !== null) {
		const status = await nativeOps.getStatus();
		engine = {
			reachable: true, // in-process: "the engine" is this server
			media_index_enabled: status.enabled,
			media_path: status.base,
			pub_markers: status.pub_markers,
			databases: status.databases,
			msg: status.enabled ? null : 'DEDALO_MEDIA_PATH is not configured (media index off)',
		};
	} else {
		engine = {
			reachable: false,
			media_index_enabled: null,
			media_path: null,
			pub_markers: null,
			databases: [],
			msg: 'Native media index is not registered (boot registration failed — see server log)',
		};
	}

	return {
		result: {
			// TS posture: media is served session-gated by the dev listener
			// when MEDIA_PATH is configured; the reverse proxy owns production
			mode: mediaPath !== null ? 'private' : false,
			mode_source:
				'TS server (dev listener session gate; production enforcement is the reverse proxy)',
			custom_override: null,
			config_mode: null,
			legacy_protect: null,
			cookie_name: 'dedalo_ts_session',
			// the standard delivery-grade derivatives (PHP
			// get_default_public_qualities over the install folder constants)
			public_qualities: [
				'av/404',
				'av/posterframe',
				'av/subtitles',
				'image/1.5MB',
				'image/thumb',
				'pdf/web',
				'svg/web',
				'3d/web',
			],
			default_public_qualities: [
				'av/404',
				'av/posterframe',
				'av/subtitles',
				'image/1.5MB',
				'image/thumb',
				'pdf/web',
				'svg/web',
				'3d/web',
			],
			media_path: mediaPath,
			htaccess,
			markers,
			engine,
			is_root: principal.userId === -1,
		} as unknown as WidgetResponse['result'],
		msg: 'OK. Request done successfully',
		errors: [],
	};
}

export const widget: WidgetModule = {
	spec: {
		id: 'media_control',
		category: 'integrity',
		label: { kind: 'label', key: 'media_control' },
	},
	apiActions: {
		get_value: mediaControlGetValue,
		// PHP widget delegate: the full marker resync via dd_diffusion_api
		// (admin gate = widget dispatch gate 1; PHP re-checks inside the API)
		rebuild_media_index: async () =>
			(
				await import('../../diffusion_bridge/diffusion_delete.ts')
			).rebuildMediaIndex() as unknown as Promise<WidgetResponse>,
		set_media_access_mode: engineDenied(
			'media_control.set_media_access_mode',
			'it writes the PHP install config (DEDALO_MEDIA_ACCESS_MODE_CUSTOM) and regenerates media/.htaccess',
		),
	},
	getValue: mediaControlGetValue,
};
