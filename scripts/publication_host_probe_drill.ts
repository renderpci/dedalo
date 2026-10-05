#!/usr/bin/env bun
/**
 * PUBLIC-URL PROBE DRILL (publication host phase 6, engineering/PUBLICATION_HOST_SPEC.md
 * §7). It runs the ENGINE's `probePublicGate` against a REAL Apache and a REAL nginx
 * serving the engine-rendered publication-host include. Rows:
 *   - gated → ok;
 *   - open gate → failed;
 *   - gate down → never ok;
 *   - invalid probe files, and a public name that resolves to a private address →
 *     unknown, with nothing sent.
 *
 * TWO PROCESSES, ON PURPOSE. The engine half must run with a scratch DEDALO_PRIVATE_DIR
 * (the host registry and runtime files) and a scratch, marked DEDALO_TEST_MEDIA_ROOT
 * (the pub/ ground truth). Both are read once, when the config is built. So this parent
 * imports no engine config. It composes the operator's config (catalog keys only,
 * scripts/lib/operator_config.ts, the update drill's precedent), overrides those two
 * keys, and spawns scripts/lib/publication_host_probe_drill_child.ts. The child refuses
 * to run unless both point at this scratch dir. The scratch dir is deleted on exit.
 *
 * Needs: Apache 2.4 + apxs and nginx (scripts/lib/web_server_harness.ts). A missing
 * binary is RED, never a skip: the instance CI tier runs this drill
 * (scripts/ci/instance_tier.sh; runner requirement: engineering/CI.md). No database.
 */

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { operatorConfig } from './lib/operator_config.ts';
import {
	type DrillServer,
	missingProbeBinaries,
	probeChildEnv,
	selectServers,
} from './lib/publication_host_probe_drill_kit.ts';

const REPO_ROOT = resolve(import.meta.dir, '..');
const CHILD = join(import.meta.dir, 'lib', 'publication_host_probe_drill_child.ts');

function servers(): DrillServer[] {
	let only: string | undefined;
	try {
		only = parseArgs({ options: { only: { type: 'string' } }, strict: true }).values.only;
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
	const selected = selectServers(only);
	if (selected === null) {
		console.error(`--only must be 'apache' or 'nginx' (got ${JSON.stringify(only)})`);
		process.exit(1);
	}
	return selected;
}

async function main(): Promise<number> {
	const selected = servers();
	const missing = missingProbeBinaries(selected);
	if (missing.length > 0) {
		console.error(
			`RED — missing on PATH: ${missing.join(', ')}. Needs Apache 2.4 + apxs and nginx (engineering/CI.md).`,
		);
		return 1;
	}
	const scratch = mkdtempSync(join(tmpdir(), 'dd_pubhost_probe_'));
	try {
		mkdirSync(join(scratch, 'private'));
		mkdirSync(join(scratch, 'media'));
		const child = Bun.spawn(
			[process.execPath, 'run', CHILD, '--scratch', scratch, '--servers', selected.join(',')],
			{
				cwd: REPO_ROOT,
				env: probeChildEnv(
					operatorConfig(),
					{ PATH: process.env.PATH, HOME: process.env.HOME },
					{ privateDir: join(scratch, 'private'), mediaRoot: join(scratch, 'media') },
				),
				stdio: ['ignore', 'inherit', 'inherit'],
			},
		);
		return (await child.exited) === 0 ? 0 : 1;
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

if (import.meta.main) process.exit(await main());
