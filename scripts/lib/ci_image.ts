/**
 * THE CI IMAGE PIN — one digest for every place a tier runs.
 *
 * `ci/image.json` names the published build of ci/Dockerfile that the gates run in:
 * GitHub's hermetic/db/instance jobs (`container:`), GitLab's hermetic job (`image:`)
 * and `ci:local --docker` (which pulls it by digest). A verdict is then a property of
 * the commit, not of which runner or Mac judged it — the reason the image exists
 * (ci/README.md). Until 2026-09-26 only ci:local used the image, and a LOCAL build of
 * it at that: GitHub ran bare ubuntu-latest, GitLab bare oven/bun as root, so a local
 * green predicted neither.
 *
 * YAML cannot read this file, so the digest is also written literally into each
 * workflow; `test/unit/ci_workflow_tripwire.test.ts` holds every literal equal to it and
 * its fingerprint equal to this checkout's. `bun run ci:image:pin` (scripts/ci_image_pin.ts)
 * is the updater: it resolves the digest ci-image.yml published for the current
 * fingerprint and rewrites the lock and every literal in one step.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface CiImageLock {
	image: string;
	digest: string;
	fingerprint: string;
}

export const CI_IMAGE_LOCK = join('ci', 'image.json');

/** The files that reference the image by digest (the literals the lock must equal). */
export const CI_IMAGE_REFERENCES = [
	'.github/workflows/ci.yml',
	'.github/workflows/db.yml',
	'.gitlab-ci.yml',
] as const;

/** `ghcr.io/renderpci/dedalo-ci@sha256:<64 hex>` anywhere in a file. */
export const CI_IMAGE_REF = /ghcr\.io\/renderpci\/dedalo-ci@(sha256:[0-9a-f]{64})/g;

/** sha256(ci/Dockerfile ++ .bun-version) — the image's definition (ci/README.md). */
export function ciImageFingerprint(repoRoot: string): string {
	const hasher = new Bun.CryptoHasher('sha256');
	hasher.update(readFileSync(join(repoRoot, 'ci', 'Dockerfile')));
	hasher.update(readFileSync(join(repoRoot, '.bun-version')));
	return hasher.digest('hex');
}

export function readCiImageLock(repoRoot: string): CiImageLock {
	const lock = JSON.parse(readFileSync(join(repoRoot, CI_IMAGE_LOCK), 'utf8')) as CiImageLock;
	if (
		typeof lock.image !== 'string' ||
		!/^sha256:[0-9a-f]{64}$/.test(lock.digest) ||
		!/^[0-9a-f]{64}$/.test(lock.fingerprint)
	) {
		throw new Error(
			`${CI_IMAGE_LOCK}: expected {image, digest: "sha256:<64 hex>", fingerprint: "<64 hex>"}`,
		);
	}
	return lock;
}

/** `<image>@<digest>` — how every consumer names the locked build. */
export function lockedImageRef(lock: CiImageLock): string {
	return `${lock.image}@${lock.digest}`;
}
