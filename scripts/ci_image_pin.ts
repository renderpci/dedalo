/**
 * `bun run ci:image:pin` — move the CI image pin to the build ci-image.yml published for
 * THIS checkout's ci/Dockerfile + .bun-version (scripts/lib/ci_image.ts explains the pin).
 *
 * It resolves `<CI_IMAGE_NAME>:fp-<fingerprint>` (ghcr.io/dedalia-org/dedalo-ci) to its
 * manifest-list digest (anonymously — the package is public), writes ci/image.json, and
 * rewrites every `…dedalo-ci@sha256:…` literal in the workflows. It ALWAYS writes
 * CI_IMAGE_NAME — a pin still naming the transition's legacy repository
 * (CI_IMAGE_LEGACY) is moved to it even when the digest would be unchanged, and
 * `--check` reports it behind. Nothing else changes, so the diff is the pin and only
 * the pin.
 *
 * When to run it: after a ci/Dockerfile or .bun-version change has landed on master/v7
 * and ci-image.yml has published it (until then ci_workflow_tripwire is red, by design —
 * the gates cannot run in an image that does not exist yet), and after the weekly
 * no-cache rebuild, to take its distro security fixes.
 *
 *   bun run ci:image:pin           # update the lock + the literals
 *   bun run ci:image:pin --check   # exit 1 if the lock is not the published build
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	CI_IMAGE_LOCK,
	CI_IMAGE_NAME,
	CI_IMAGE_REF,
	CI_IMAGE_REFERENCES,
	CI_IMAGE_REPOSITORY,
	type CiImageLock,
	ciImageFingerprint,
	readCiImageLock,
} from './lib/ci_image.ts';

const REPO_ROOT = join(import.meta.dir, '..');
const REPOSITORY = CI_IMAGE_REPOSITORY;

/** The media types of a multi-arch INDEX — the only thing the pin may name. */
const INDEX_TYPES = new Set([
	'application/vnd.oci.image.index.v1+json',
	'application/vnd.docker.distribution.manifest.list.v2+json',
]);

async function ghcr(url: string, init?: RequestInit): Promise<Response> {
	try {
		return await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
	} catch (error) {
		throw new Error(
			`ghcr.io unreachable (${(error as Error).message}) — the pin needs the registry; nothing was changed.`,
		);
	}
}

async function publishedDigest(tag: string): Promise<string> {
	const tokenResponse = await ghcr(`https://ghcr.io/token?scope=repository:${REPOSITORY}:pull`);
	const tokenBody = (await tokenResponse.json().catch(() => null)) as { token?: string } | null;
	if (!tokenResponse.ok || typeof tokenBody?.token !== 'string') {
		throw new Error(
			`ghcr token for ${REPOSITORY}: HTTP ${tokenResponse.status}, no token in the reply — the package must exist and be PUBLIC (anonymous pull)`,
		);
	}
	const { token } = tokenBody;
	const manifest = await ghcr(`https://ghcr.io/v2/${REPOSITORY}/manifests/${tag}`, {
		method: 'HEAD',
		headers: {
			Authorization: `Bearer ${token}`,
			// The multi-arch INDEX, never one arch's manifest: GitHub/GitLab pull amd64
			// through it and an Apple-Silicon ci:local pulls arm64 through the same digest.
			Accept: [
				'application/vnd.oci.image.index.v1+json',
				'application/vnd.docker.distribution.manifest.list.v2+json',
			].join(', '),
		},
	});
	if (manifest.status === 404) {
		throw new Error(
			`${REPOSITORY}:${tag} is not published. ci-image.yml publishes it when ci/Dockerfile or .bun-version lands on master/v7 — push the definition first, then pin. (A package new to its owner — e.g. the first dedalia-org publish — must also be set PUBLIC: an anonymous pull of a private one answers like a missing one.)`,
		);
	}
	const digest = manifest.headers.get('docker-content-digest');
	if (!manifest.ok || digest === null || !/^sha256:[0-9a-f]{64}$/.test(digest)) {
		throw new Error(`ghcr manifest ${tag}: HTTP ${manifest.status}, digest ${digest}`);
	}
	// ghcr IGNORES Accept for a single-arch tag (measured 2026-09-26: an index Accept on
	// `…-amd64` still answers 200 with a plain manifest). Pinning one would make an
	// Apple-Silicon ci:local run amd64 under emulation — refuse it.
	const mediaType = (manifest.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
	if (!INDEX_TYPES.has(mediaType)) {
		throw new Error(
			`${REPOSITORY}:${tag} is not a multi-arch index (content-type ${mediaType || 'none'}) — refusing to pin it.`,
		);
	}
	return digest;
}

const check = process.argv.includes('--check');
const current = readCiImageLock(REPO_ROOT);
const fingerprint = ciImageFingerprint(REPO_ROOT);
let digest: string;
try {
	digest = await publishedDigest(`fp-${fingerprint}`);
} catch (error) {
	console.error(`ci:image:pin: ${(error as Error).message}`);
	process.exit(1);
}
const next: CiImageLock = { image: CI_IMAGE_NAME, digest, fingerprint };

if (
	current.image === next.image &&
	current.digest === next.digest &&
	current.fingerprint === next.fingerprint
) {
	console.log(`ci:image:pin: ${CI_IMAGE_LOCK} is the published build (${digest}).`);
	process.exit(0);
}
if (check) {
	console.error(
		`ci:image:pin: ${CI_IMAGE_LOCK} pins ${current.image}@${current.digest} (fp ${current.fingerprint.slice(0, 12)}); the published build of this checkout is ${next.image}@${digest} (fp ${fingerprint.slice(0, 12)}). Run: bun run ci:image:pin`,
	);
	process.exit(1);
}

writeFileSync(join(REPO_ROOT, CI_IMAGE_LOCK), `${JSON.stringify(next, null, '\t')}\n`);
for (const rel of CI_IMAGE_REFERENCES) {
	const path = join(REPO_ROOT, rel);
	const source = readFileSync(path, 'utf8');
	const rewritten = source.replace(CI_IMAGE_REF, `${CI_IMAGE_NAME}@${digest}`);
	if (rewritten !== source) writeFileSync(path, rewritten);
}
console.log(
	`ci:image:pin: ${current.image}@${current.digest} → ${next.image}@${digest} (fp ${fingerprint.slice(0, 12)}) in ${CI_IMAGE_LOCK} and ${CI_IMAGE_REFERENCES.join(', ')}.`,
);
