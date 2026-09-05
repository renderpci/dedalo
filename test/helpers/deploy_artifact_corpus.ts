/**
 * THE DEPLOY ARTIFACT CORPUS — the one lister that owns the roots of what the
 * engine SHIPS to an operator: the reverse-proxy configurations under `deploy/`
 * and the compose stacks at the repo root.
 *
 * `census_derivation_tripwire` refuses a gate that chooses its own walk root
 * in-file. The roots live HERE; a gate imports a shape and never names a
 * directory. Zero-argument on purpose — a parameterized lister hands the root
 * choice back to the caller.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** The deploy roots. The ONLY place they are named. */
export const DEPLOY_DIR = join(REPO_ROOT, 'deploy');

/** Every shipped nginx configuration or template under deploy/, by file NAME, sorted. */
export function nginxConfNames(): string[] {
	return readdirSync(DEPLOY_DIR)
		.filter((name) => name.startsWith('nginx'))
		.sort();
}

/** Every shipped nginx configuration or template under deploy/, absolute, sorted. */
export function nginxConfFiles(): string[] {
	return nginxConfNames().map((name) => join(DEPLOY_DIR, name));
}

/**
 * Every compose stack the repo TRACKS, repo-relative — git's view, so an
 * untracked local experiment is not a shipped stack.
 */
export function shippedComposeStacks(): string[] {
	const listed = Bun.spawnSync(['git', 'ls-files', 'docker-compose*.yml'], { cwd: REPO_ROOT });
	return new TextDecoder()
		.decode(listed.stdout)
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.sort();
}
