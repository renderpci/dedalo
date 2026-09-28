/**
 * serve_code WIDGET wiring — the code-server (PUBLISH) panel split out of
 * update_code on 2026-09-28 (WC-2026-09-28-maintenance-serve-code-widget).
 *
 *  1. the BUILD action's option shape (moved here with the action). The panel's
 *     two buttons send a BRANCH and nothing else; the handler used to read only
 *     `version`/`ref`, so every build refused with 'Invalid version number' and a
 *     code server could not publish a single release (until 2026-08-15).
 *  2. the split: registration, the ownership gate under its NEW key, the
 *     catalog condition (only where it can act), and the non-code-server panel
 *     answering without spawning git or walking directories.
 *
 * Pure wiring: the engine calls are intercepted; no git repo, no network.
 */

import { afterAll, describe, expect, mock, test } from 'bun:test';
import { ownershipMark } from '../../src/core/area_maintenance/widgets/support.ts';
import * as realBuildModule from '../../src/core/update/code_build.ts';

const REAL_BUILD = { ...realBuildModule };

afterAll(() => {
	mock.module('../../src/core/update/code_build.ts', () => REAL_BUILD);
	mock.restore();
});

/** The widget module, imported AFTER the mocks so its dynamic imports see them. */
async function serveCodeModule() {
	return await import('../../src/core/area_maintenance/widgets/serve_code.ts');
}

describe('serve_code registration + gate', () => {
	test('registered in the total surface, config category, gated build action', async () => {
		const { ALL_WIDGET_MODULES } = await import(
			'../../src/core/area_maintenance/widgets/registry.ts'
		);
		const { widget } = await serveCodeModule();
		expect(ALL_WIDGET_MODULES.find((m) => m.spec.id === 'serve_code')).toBe(widget);
		expect(widget.spec.category).toBe('config');
		expect(widget.spec.label).toEqual({ kind: 'label', key: 'serve_code' });
		expect(Object.keys(widget.apiActions ?? {})).toEqual(['build_version_from_git_master']);
		const mark = ownershipMark(widget.apiActions?.build_version_from_git_master as never);
		expect(mark?.kind).toBe('gated');
		expect(mark?.what).toBe('serve_code.build_version_from_git_master');
	});

	test('the served catalog carries it exactly when servesCode() says so, right after update_code', async () => {
		const { WIDGET_MODULES } = await import('../../src/core/area_maintenance/widgets/registry.ts');
		const { servesCode } = await serveCodeModule();
		const ids = WIDGET_MODULES.map((m) => m.spec.id);
		if (servesCode()) {
			expect(ids[ids.indexOf('update_code') + 1]).toBe('serve_code');
		} else {
			expect(ids).not.toContain('serve_code');
		}
	});

	test('servesCode follows the two keys it names', async () => {
		const src = await Bun.file(
			new URL('../../src/core/area_maintenance/widgets/serve_code.ts', import.meta.url),
		).text();
		expect(src).toContain(
			"return config.update.isCodeServer === true || config.entity === 'development';",
		);
	});

	test('a non-code-server answers a null half without touching git or the disk', async () => {
		const realConfigModule = await import('../../src/config/config.ts');
		const REAL_CONFIG = { ...realConfigModule };
		try {
			mock.module('../../src/config/config.ts', () => ({
				...REAL_CONFIG,
				config: {
					...REAL_CONFIG.config,
					update: { ...REAL_CONFIG.config.update, isCodeServer: false },
				},
			}));
			const { widget } = await serveCodeModule();
			const value = await widget.getValue?.({}, {} as never);
			expect(value?.data).toEqual({ is_a_code_server: false, code_server: null });
		} finally {
			mock.module('../../src/config/config.ts', () => REAL_CONFIG);
		}
	});
});

describe('build_version_from_git_master option mapping', () => {
	test('a bare branch forwards ONLY the ref — the bytes name the release', async () => {
		const calls: { version?: string; ref?: string }[] = [];
		mock.module('../../src/core/update/code_build.ts', () => ({
			...REAL_BUILD,
			buildVersionFromGit: async (options: { version?: string; ref?: string }) => {
				calls.push(options);
				return { ok: true, request_id: 'test', data: { built: true } };
			},
		}));
		const { widget } = await serveCodeModule();
		const action = widget.apiActions?.build_version_from_git_master;
		expect(action).toBeDefined();

		for (const branch of ['master', 'developer']) {
			await action?.({ branch }, {} as never);
		}
		// NO `version` key. The widget used to forward DEDALO_VERSION — the
		// RUNNING PROCESS's version — while the bytes came from the ref, so a
		// master left running across a bump published mislabelled archives, and
		// a master whose ref declares its own version published a same-version
		// zip that assertLinearUpgrade refuses (measured 2026-08-24: an
		// uninstallable 7.0.0.zip). The release is now named after the version
		// the REF declares; the widget must not supply one at all.
		expect(calls).toEqual([{ ref: 'master' }, { ref: 'developer' }]);
	});

	test('an explicit version/ref still wins over the branch (API callers)', async () => {
		const calls: { version?: string; ref?: string }[] = [];
		mock.module('../../src/core/update/code_build.ts', () => ({
			...REAL_BUILD,
			buildVersionFromGit: async (options: { version?: string; ref?: string }) => {
				calls.push(options);
				return { ok: true, request_id: 'test', data: { built: true } };
			},
		}));
		const { widget } = await serveCodeModule();
		await widget.apiActions?.build_version_from_git_master?.(
			{ branch: 'master', version: '7.0.1', ref: 'v7.0.1' },
			{} as never,
		);
		expect(calls).toEqual([{ version: '7.0.1', ref: 'v7.0.1' }]);
	});
});
