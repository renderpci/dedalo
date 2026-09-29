/**
 * serve_code widget — the PROVIDER side of the code exchange: this installation
 * as a CODE SERVER, building releases from git and serving them to the
 * installations that update from it.
 *
 * Split out of update_code (2026-09-28): that panel is the CONSUMER side (take a
 * release, swap the tree, restart) and carried this role as a second block, so a
 * code server found its primary concern below an update it never runs — and the
 * development entity, which REFUSES to update itself, opened on the refused half.
 * Pairs with serve_ontology (the same split of update_ontology).
 *
 * Panel: `code_server` — the publish readiness through `planCodeBuild` itself,
 * the build source's git state, the archives on disk, the manifest a consumer at
 * this version would actually be offered, plus the advertised-URL self-probe.
 * Computed ONLY on a code server (null elsewhere: no git spawn, no directory
 * walk). EXECUTE: `build_version_from_git_master`, ownership-gated.
 *
 * Catalog: served only where it can act — a code server or the `development`
 * entity (registry.ts, the error_reports pattern). The module itself is always in
 * ALL_WIDGET_MODULES so update_ownership_tripwire classifies it on every machine.
 *
 * TS-only (no PHP twin): WC-2026-09-28-maintenance-serve-code-widget.
 * Gate: test/unit/serve_code_widget_native.test.ts.
 */

import { config } from '../../../config/config.ts';
import {
	engineDenied,
	fromEnvelope,
	gated,
	type WidgetModule,
	type WidgetResponse,
} from './support.ts';

/** Whether this installation serves the widget at all (catalog + dispatch). */
export function servesCode(): boolean {
	return config.update.isCodeServer === true || config.entity === 'development';
}

async function serveCodeGetValue(): Promise<WidgetResponse> {
	if (config.update.isCodeServer !== true) {
		return { data: { is_a_code_server: false, code_server: null } };
	}
	const { codeServerStatus } = await import('../../update/status.ts');
	const { publicOrigin } = await import('../../resolve/public_origin.ts');
	return {
		data: {
			is_a_code_server: true,
			// The self-probe is composed HERE, not inside codeServerStatus: that
			// function is synchronous filesystem work and stays that way, while
			// this one check has to go out over the network. It is appended to
			// the same list so the panel renders it like any other, and it can
			// only ever ADD a row — a probe that throws is impossible (the check
			// catches its own failures), and `ready` still follows the same
			// blocked-if-any rule.
			code_server: await withReachability(
				codeServerStatus(`${publicOrigin()}/dedalo/install/code`),
			),
		},
	};
}

/**
 * Append the advertised-URL self-probe to a code-server readout.
 *
 * Kept out of `codeServerStatus` so that function stays sync and pure — the
 * network is the only asynchronous thing in the whole readout, and folding it
 * in would make every caller await a fetch to read a directory listing.
 */
async function withReachability(
	status: Awaited<ReturnType<typeof import('../../update/status.ts').codeServerStatus>>,
): Promise<typeof status> {
	const { advertisedUrlReachableCheck } = await import('../../update/status.ts');
	const reachable = await advertisedUrlReachableCheck(status.releases);
	const checks = [...status.checks, reachable];
	return { ...status, checks, ready: !checks.some((entry) => entry.state === 'blocked') };
}

/**
 * The OPEN (owned) release build: git archive of a ref.
 *
 * COVERAGE-EXEMPT (coverage plan §5.2; reason registered in
 * engineering/crap_coverage_exempt.json): a three-field unwrap forwarding to
 * `core/update/code_build.ts`, gated in its own suite; running it shells out to
 * git and writes a release archive.
 */
async function buildVersionOwned(options: Record<string, unknown>): Promise<WidgetResponse> {
	const { buildVersionFromGit } = await import('../../update/code_build.ts');
	// The panel's two buttons send a BRANCH ('master' / 'developer') and nothing
	// else. The release they build is the version THE REF DECLARES — no longer
	// the engine's current version: taking the name from the running process
	// while the bytes came from a ref meant a master left running across a
	// version bump published mislabelled archives, and a master whose ref
	// declares its OWN version published a same-version zip that
	// assertLinearUpgrade refuses as a downgrade (measured 2026-08-24: a 7.0.0
	// master produced an uninstallable 7.0.0.zip). An explicit `version` from an
	// API caller is now a CLAIM, checked against the ref and refused on mismatch.
	const branch = typeof options.branch === 'string' ? options.branch : undefined;
	const ref = typeof options.ref === 'string' ? options.ref : branch;
	return fromEnvelope(
		await buildVersionFromGit({
			...(typeof options.version === 'string' ? { version: options.version } : {}),
			...(ref === undefined ? {} : { ref }),
		}),
	);
}

export const widget: WidgetModule = {
	spec: {
		id: 'serve_code',
		category: 'config',
		label: { kind: 'label', key: 'serve_code' },
	},
	apiActions: {
		// Ownership-gated (UPDATE_PROCESS Phase 4): closed = frozen engine_denied.
		build_version_from_git_master: gated(
			'serve_code.build_version_from_git_master',
			engineDenied(
				'serve_code.build_version_from_git_master',
				'it packages the PHP code tree from its git checkout',
			),
			buildVersionOwned,
		),
	},
	getValue: serveCodeGetValue,
};
