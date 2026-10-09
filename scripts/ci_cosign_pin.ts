/**
 * `bun run ci:cosign:pin` — move the cosign pin (ci/cosign.json) to the latest STABLE
 * sigstore/cosign release.
 *
 * WHY A PIN. .github/workflows/image-release.yml signs every published Dédalo image with
 * cosign and verifies every copy with it. A signing tool fetched as "whatever is latest
 * today" is the moving-tag problem rule 8 of ci_workflow_tripwire forbids for actions:
 * the workflow downloads EXACTLY the pinned release and refuses a binary whose sha256 is
 * not the pinned one, and refuses to publish at all while the pin is unset. This script
 * is the updater, the ci:image:pin pattern: it fetches only when run, writes one diff, and
 * `--check` is the nightly's staleness signal.
 *
 * TRUST, stated: the sha256 comes from the release's own checksums file, over TLS from
 * github.com — trust on first pin, reviewed in the diff that moves it. Every later run
 * of the workflow is held to those bytes.
 *
 *   bun run ci:cosign:pin           # write ci/cosign.json
 *   bun run ci:cosign:pin --check   # exit 1 when the pin is unset or not the latest stable release
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..');
const RELEASES = 'https://api.github.com/repos/sigstore/cosign/releases/latest';
const DOWNLOADS = 'https://github.com/sigstore/cosign/releases/download';

/** The pinned asset — the publish job runs on linux/amd64 (ubuntu-24.04). */
export const COSIGN_ASSET = 'cosign-linux-amd64';
export const COSIGN_PIN_PATH = join('ci', 'cosign.json');

export interface CosignPin {
	version: string | null;
	linux_amd64_sha256: string | null;
}

/** A stable `X.Y.Z` version (no prerelease suffix), from a release tag `vX.Y.Z`; null otherwise. */
export function stableVersionOfTag(tag: unknown): string | null {
	if (typeof tag !== 'string') return null;
	const matched = /^v?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(tag.trim());
	return matched === null ? null : (matched[1] as string);
}

/** The sha256 a `sha256sum`-format checksums file states for `asset`, or null. */
export function checksumFor(checksums: string, asset: string): string | null {
	for (const line of checksums.split('\n')) {
		const matched = /^([0-9a-f]{64})\s+\*?(\S+)\s*$/.exec(line.trim());
		if (matched !== null && matched[2] === asset) return matched[1] as string;
	}
	return null;
}

/** Whether a pin is complete: a stable version and a 64-hex digest. */
export function isPinSet(pin: CosignPin): pin is { version: string; linux_amd64_sha256: string } {
	return (
		stableVersionOfTag(pin.version) !== null &&
		typeof pin.linux_amd64_sha256 === 'string' &&
		/^[0-9a-f]{64}$/.test(pin.linux_amd64_sha256)
	);
}

/** The download URL of the pinned binary. */
export function cosignDownloadUrl(version: string): string {
	return `${DOWNLOADS}/v${version}/${COSIGN_ASSET}`;
}

/** A pin field: a string, or null when unset (absent counts as unset). */
function pinField(raw: Record<string, unknown>, key: string, path: string): string | null {
	const value = raw[key] ?? null;
	if (value !== null && typeof value !== 'string')
		throw new Error(`${path}: ${key} must be a string or null`);
	return value;
}

/** Read the pin file (default ci/cosign.json); throws on a malformed file, never on an unset pin. */
export function readCosignPin(path: string = join(REPO_ROOT, COSIGN_PIN_PATH)): CosignPin {
	const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
	return {
		version: pinField(raw, 'version', path),
		linux_amd64_sha256: pinField(raw, 'linux_amd64_sha256', path),
	};
}

async function fetchText(url: string): Promise<string> {
	const token = process.env.GITHUB_TOKEN;
	const headers: Record<string, string> = { 'User-Agent': 'dedalo-ci-cosign-pin' };
	if (token !== undefined && token !== '') headers.Authorization = `Bearer ${token}`;
	const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
	if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
	return await response.text();
}

/** The latest stable release and its pinned asset's sha256, from github.com. */
async function latestPin(): Promise<{ version: string; linux_amd64_sha256: string }> {
	const release = JSON.parse(await fetchText(RELEASES)) as { tag_name?: unknown };
	const version = stableVersionOfTag(release.tag_name);
	if (version === null)
		throw new Error(
			`the latest sigstore/cosign release is not a stable vX.Y.Z (${String(release.tag_name)})`,
		);
	const checksums = await fetchText(`${DOWNLOADS}/v${version}/cosign_checksums.txt`);
	const sha = checksumFor(checksums, COSIGN_ASSET);
	if (sha === null)
		throw new Error(`cosign v${version}: no ${COSIGN_ASSET} line in cosign_checksums.txt`);
	return { version, linux_amd64_sha256: sha };
}

function samePin(a: CosignPin, b: CosignPin): boolean {
	return a.version === b.version && a.linux_amd64_sha256 === b.linux_amd64_sha256;
}

/** Write the new pin, keeping the file's `$comment`. */
function writePin(next: CosignPin): void {
	const path = join(REPO_ROOT, COSIGN_PIN_PATH);
	const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
	const body = { ...raw, version: next.version, linux_amd64_sha256: next.linux_amd64_sha256 };
	writeFileSync(path, `${JSON.stringify(body, null, '\t')}\n`);
}

export async function main(argv: readonly string[]): Promise<number> {
	const current = readCosignPin();
	let next: { version: string; linux_amd64_sha256: string };
	try {
		next = await latestPin();
	} catch (error) {
		console.error(`ci:cosign:pin: ${(error as Error).message} — nothing was changed.`);
		return 1;
	}
	if (samePin(current, next)) {
		console.log(
			`ci:cosign:pin: ${COSIGN_PIN_PATH} pins the latest stable cosign (v${next.version}).`,
		);
		return 0;
	}
	if (argv.includes('--check')) {
		console.error(
			`ci:cosign:pin: ${COSIGN_PIN_PATH} pins ${current.version ?? 'nothing'}; the latest stable cosign is v${next.version}. Run: bun run ci:cosign:pin`,
		);
		return 1;
	}
	writePin(next);
	console.log(
		`ci:cosign:pin: ${current.version ?? 'unset'} → v${next.version} in ${COSIGN_PIN_PATH}.`,
	);
	return 0;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
