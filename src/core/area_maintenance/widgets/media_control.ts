/**
 * media_control widget — the media-protection dashboard and mode switch.
 *
 * ENGINE-NATIVE since 2026-07-12 (closes audit MEDIA-01 / DECISION 1 option B). It was a
 * reporting shell that hardcoded its own answers and refused `set_media_access_mode` as
 * "run it from the PHP maintenance dashboard" — which no longer exists. Now every field
 * is resolved from `core/media/protection.ts`, the module that actually owns the mode,
 * the auth markers and the generated web-server rules.
 *
 * The mode switch is ROOT-ONLY and applies immediately: it writes the runtime override to
 * ts_state.json, regenerates BOTH rule files with the EXPLICIT new mode, and re-lays the
 * auth markers so users who are already logged in keep media access without
 * re-authenticating. Definition of the subsystem: engineering/MEDIA_PROTECTION.md.
 */

import type { Principal } from '../../security/permissions.ts';
import { type WidgetModule, type WidgetResponse, failed } from './support.ts';

async function mediaControlGetValue(
	_options: Record<string, unknown>,
	principal: Principal,
): Promise<WidgetResponse> {
	const { existsSync, readdirSync, statSync } = await import('node:fs');
	const { join } = await import('node:path');
	const protection = await import('../../media/protection.ts');

	const mediaPath = protection.mediaRoot();

	// PHP count_dir_files: null when the dir is missing, else the entry count.
	const countDirFiles = (dir: string): number | null => {
		try {
			if (!statSync(dir).isDirectory()) return null;
			return readdirSync(dir).length;
		} catch {
			return null;
		}
	};

	const basePath = protection.markerStoreBase();
	const markers = {
		base_path: basePath,
		base_exists: basePath !== null && existsSync(basePath),
		pub_count: basePath !== null ? countDirFiles(join(basePath, 'pub')) : null,
		auth_count: basePath !== null ? countDirFiles(join(basePath, 'auth')) : null,
	};

	// The generated rule files. `up_to_date` is a REAL answer now (a config-hash compare),
	// where the shell always reported null.
	const rules = protection.getRulesStatus();

	// NATIVE media-index status (the only source since the cutover retired the old-engine
	// socket). An unregistered store reports unreachable with the same envelope shape.
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
			msg: status.enabled ? null : 'MEDIA_PATH is not configured (media index off)',
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
			mode: protection.resolveMediaAccessMode(),
			mode_source: protection.resolveModeSource(),
			custom_override: protection.getStateOverride(),
			config_mode: protection.getConfigFileMode(),
			legacy_protect: protection.getLegacyProtectFlag(),
			cookie_name: protection.MEDIA_AUTH_COOKIE,
			// DERIVED from this install's quality catalog, never hardcoded: an install that
			// renamed a quality must see the folders its own rules actually allow.
			public_qualities: protection.getPublicQualities(),
			default_public_qualities: protection.getDefaultPublicQualities(),
			media_path: mediaPath,
			// The client reads `htaccess` (PHP shape). `rules` carries both artifacts —
			// the client ignores unknown keys, so this is additive.
			htaccess: rules.htaccess,
			rules: {
				apache: rules.htaccess,
				nginx: {
					...rules.nginx,
					// nginx reads its include at RELOAD, unlike Apache's per-request .htaccess:
					// stale-on-disk rules keep serving until the operator reloads.
					reload_required: rules.nginx.exists && rules.nginx.up_to_date === false,
				},
			},
			markers,
			engine,
			is_root: principal.userId === -1,
		} as unknown as WidgetResponse['result'],
		msg: 'OK. Request done successfully',
		errors: [],
	};
}

/**
 * Change the media access mode (PHP media_control::set_media_access_mode). Root-only,
 * and it applies in the same request.
 *
 * The client posts one of `config | off | private | publication` (render_media_control.js
 * build_mode_selector): 'config' REMOVES the override and falls back to the .env value.
 */
async function mediaControlSetAccessMode(
	options: Record<string, unknown>,
	principal: Principal,
): Promise<WidgetResponse> {
	// GATE: ROOT, not merely global-admin. dispatchWidgetRequest's gate 1 only checks
	// isGlobalAdmin, and a profile-admin who can set the mode to 'off' can open the entire
	// media tree to the world. PHP gated this on DEDALO_SUPERUSER inside set_config_core.
	if (principal.userId !== -1) {
		return failed('only the root user can change the media access mode', ['unauthorized']);
	}

	const value = options.value;
	if (value !== 'config' && value !== 'off' && value !== 'private' && value !== 'publication') {
		return {
			result: false,
			msg: 'Error. Invalid value. Allowed: config | off | private | publication',
			errors: ['invalid value'],
		};
	}

	const { isStateWritable, setServerState } = await import('../../resolve/server_state.ts');
	if (!isStateWritable()) {
		return failed('the TS state file is not writable', ['state not writable']);
	}

	const protection = await import('../../media/protection.ts');
	if (protection.mediaRoot() === null && value !== 'off' && value !== 'config') {
		return failed('MEDIA_PATH is not configured — there is no media root to write the gate into', [
			'media path not configured',
		]);
	}

	// UI token → stored override. 'config' clears it (null = "no override").
	const override = value === 'config' ? null : value === 'off' ? false : value;
	setServerState({ media_access_mode: override });

	// The EFFECTIVE mode after the change. resolveMediaAccessMode() would also be correct
	// here (getServerState re-reads the file on every call), but the mode is resolved and
	// threaded EXPLICITLY on purpose — see the writeRuleFiles() call below.
	const effective = override !== null ? override : protection.resolveMediaAccessMode();

	// Regenerate BOTH rule files with the EXPLICIT mode.
	//
	// (!) The explicit argument is LOAD-BEARING. The .env layer of the mode lives in
	// `config`, a frozen module-level const evaluated once at import — in a Bun process
	// that lives for weeks. Anything that re-derives the mode from a cached layer here
	// risks writing rules for the OLD mode while reporting success; if the old mode was
	// 'off', protection never actually turns on and the operator believes it did.
	//
	// (!) 'off' WRITES the hardening-only template — it must never unlink the files. The
	// media root is full of user-uploaded files, and an .htaccess-less media dir is one
	// where Apache will happily execute an uploaded .php (SEC-088).
	try {
		protection.writeRuleFiles(effective === false ? 'off' : effective);
	} catch (error) {
		// The mode IS saved, but the gate on disk still carries the old rules. Surface the
		// mismatch rather than rolling back — a rollback would leave rules for a mode the
		// state no longer claims.
		console.error('[media_protection] rule-file write failed after a mode change:', error);
		return {
			result: false,
			msg:
				'Error. The mode was saved, but the media rule files could not be written, so the ' +
				'gate on disk still enforces the PREVIOUS mode. Check write permissions on the ' +
				'media root, then re-apply.',
			errors: ['rule file write failed'],
		};
	}

	// Re-enabling: re-lay the auth markers from the persisted store so users who ALREADY
	// hold a cookie keep media access instead of 404ing until their next login.
	if (effective !== false) {
		protection.syncAuthMarkersFromStore();
	}

	const status = protection.getRulesStatus();
	const label = effective === false ? 'off (media is world-readable)' : effective;
	const notes = [
		effective !== false
			? 'Users without the media auth cookie receive it at their next login.'
			: '',
		effective === 'publication'
			? "If this instance has existing publications, run 'Rebuild media index' once."
			: '',
		status.nginx.exists
			? 'nginx: RELOAD REQUIRED (nginx -t && nginx -s reload). The Apache .htaccess applies immediately.'
			: '',
	].filter((note) => note !== '');

	return {
		result: true,
		msg: `OK. Media access mode applied: ${label}. ${notes.join(' ')}`.trim(),
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
		// Full marker resync from the publication databases (native since the cutover).
		rebuild_media_index: async () =>
			(
				await import('../../diffusion_bridge/diffusion_delete.ts')
			).rebuildMediaIndex() as unknown as Promise<WidgetResponse>,
		set_media_access_mode: mediaControlSetAccessMode,
	},
	getValue: mediaControlGetValue,
};
