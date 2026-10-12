/**
 * THE SOURCE TREE the installer runs from (terminal installer phase 4,
 * 2026-10-12) — the checkout or the verified release install.sh handed to it:
 * what host_runtime copies into the instance's home, where the unit templates
 * (deploy/systemd/) and the root-run scripts (deploy/*.sh) are read from, and
 * the Bun pin (.bun-version) the instance runtime must equal.
 *
 * Derived from THIS file's location (never the cwd, never the environment), so
 * a root process started anywhere reads its own tree. Config-free.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostRefuse } from './refuse.ts';

/** The tree this module belongs to (<tree>/src/core/install/host/source.ts). */
export function sourceTreeRoot(): string {
	return resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
}

/** A file of the source tree, as text (a missing one is refused — the tree is incomplete). */
export function sourceText(relative: string, root: string = sourceTreeRoot()): string {
	try {
		return readFileSync(join(root, relative), 'utf8');
	} catch {
		return hostRefuse(
			'install.step_failed',
			`${relative} is missing from the source tree ${root} — the release is incomplete`,
		);
	}
}

/** The Bun pin (.bun-version: one `x.y.z` line). */
export function bunPinOf(root: string = sourceTreeRoot()): string {
	const pin = sourceText('.bun-version', root).trim();
	if (!/^\d+\.\d+\.\d+$/.test(pin)) {
		hostRefuse('install.step_failed', `.bun-version holds '${pin}', not one x.y.z version`);
	}
	return pin;
}

/**
 * The verified asset hashes (.bun-sha256: `# bun-v<pin>`, `# signed-by: …`,
 * then `<sha256>  <asset>` lines) — the table install.sh checked the bootstrap
 * Bun against, and host_runtime checks the instance runtime's zip against.
 */
export function bunAssetHashes(root: string = sourceTreeRoot()): {
	pin: string;
	assets: Map<string, string>;
} {
	const lines = sourceText('.bun-sha256', root).split('\n');
	const pin = /^# bun-v(\d+\.\d+\.\d+)$/.exec(lines[0] ?? '')?.[1] ?? '';
	const assets = new Map<string, string>();
	for (const line of lines) {
		const match = /^([0-9a-f]{64}) {2}(bun-[a-z0-9-]+\.zip)$/.exec(line);
		if (match) assets.set(match[2] as string, match[1] as string);
	}
	return { pin, assets };
}
