/**
 * THE PANEL'S KIT — the publication-host kit (kit.ts, the format `hostagent:pack` writes) built
 * by the engine for a saved draft (drafts.ts), from the INSTALLED release
 * (engineering/PUBLICATION_HOST_SPEC.md §9.14; engineering/OUTBOUND_SPEC.md §5).
 *
 * SOURCE = WHAT THE UPDATER VERIFIED. The kit's source is the agent package and the two Bun pin
 * files, censused at extract time in the publication manifest (update/publication_manifest.ts,
 * the kit census): every build re-proves the tree against it (verifyKitSourceTree) and re-hashes
 * every file it reads against the same manifest (the TOCTOU half). A dev checkout (no verified
 * release) or a manifest without the kit census is refused, naming `bun run hostagent:pack` —
 * the CLI that packs a checkout. The kit never carries what was not verified.
 *
 * DEPENDENCIES — NO NEW DOOR. The agent's production node_modules are installed exactly where and
 * how the work system already installs release dependencies for the Publication API v2 bundles
 * (api_bundles.ts): under the code updater's backup root (`<backup>/.pubapi_build/<release>/`),
 * by the PINNED Bun (`process.execPath`), `install --frozen-lockfile --production --linker
 * hoisted --ignore-scripts`, with the minimal environment and the shared install cache
 * (installV2DepsReal), and walked by the same refusals (dependencyFiles). It is the SAME egress
 * (OUTBOUND_SPEC §5, the package-registry fetch of a release's dependencies), reached from the
 * same panel by a root-only action; no door is added to the engine's request path.
 *
 * THE DRAFT IS JUDGED TWICE. Saved, by the agent's zero-dependency rules in-process (drafts.ts);
 * built, by the agent's own zod parseDraft in a child Bun inside the kit's copy (kit.ts
 * draftJudgeProgram), exactly as the CLI packer does: the code that goes into the kit judges it.
 *
 * CACHE: `<backup>/.pubapi_build/<release>/kits/<name>.tar.gz` + `<name>.json`. The sidecar is
 * written LAST, after the file re-hashed to the writer's sha256; a hit needs the same release,
 * digest and draft bytes AND the file re-hashing. The release dir is pruned with the API bundles'.
 * Builds of one name+release share one promise (kitBuildsInFlight).
 *
 * ASYNC ONLY (sync_io_on_request_path_tripwire): reached from the panel's actions.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { draftServesV1 } from '../../../publication/host_agent/src/provision/init/draft.ts';
import { projectRoot } from '../../config/env.ts';
import { resolveCodeBackupRoot } from '../update/code_update.ts';
import { INSTALLED_DIGEST } from '../update/install_stamp.ts';
import {
	manifestKitFiles,
	PUBLICATION_AGENT_ROOT,
	type PublicationManifest,
	readPublicationManifest,
	verifyKitSourceTree,
} from '../update/publication_manifest.ts';
import { DEDALO_VERSION } from '../update/version.ts';
import {
	API_BUILD_DIR,
	ApiBundleError,
	dependencyFiles,
	installV2DepsReal,
	publicationReleaseId,
	readBundleFile,
	v2DepsInstallEnv,
} from './api_bundles.ts';
import { draftJson, type PanelDraft } from './drafts.ts';
import {
	AGENT_REL,
	buildKit,
	type DraftVerdict,
	draftJudgeProgram,
	draftVerdictFrom,
	excludedFromKit,
	INSTALL_SH_REL,
	type KitConstants,
	type KitFile,
	kitConstants,
	kitFileName,
	PackRefused,
} from './kit.ts';

export const KITS_DIR = 'kits';
/** How long the draft judge may run (it parses one small file). */
export const KIT_JUDGE_TIMEOUT_MS = 60_000;
const SHA256_HEX = /^[0-9a-f]{64}$/;

export type KitBuildReason =
	| 'no_verified_release'
	| 'unsafe_seams'
	| 'missing_manifest'
	| 'digest_mismatch'
	| 'drift'
	| 'source_missing'
	| 'not_regular_file'
	| 'deps_install_failed'
	| 'deps_symlink'
	| 'dev_dependency'
	| 'draft_refused'
	| 'kit_refused'
	| 'write_mismatch';

/** A refused kit build; `paths` names the files (tree keys or kit paths). Never a secret. */
export class KitBuildError extends Error {
	readonly reason: KitBuildReason;
	readonly paths: readonly string[];
	constructor(reason: KitBuildReason, message: string, paths: readonly string[] = []) {
		super(message);
		this.name = 'KitBuildError';
		this.reason = reason;
		this.paths = Object.freeze([...paths]);
	}
}

export interface PanelKit {
	name: string;
	instance: string;
	release: string;
	sha256: string;
	size: number;
	built_at: string;
	/** The file name install.sh is told (`--kit <file>`). */
	file_name: string;
	/** Absolute path of the cached kit (server side only: never on the wire). */
	file: string;
}

export interface KitBuildSeams {
	treeRoot?: string;
	backupRoot?: string;
	digest?: string | null;
	version?: string;
	/** The production install into the kit copy (default: installV2DepsReal, the pinned Bun). */
	installDeps?: (agentDir: string) => Promise<void>;
	/** The draft judge (default: the agent's parseDraft in a child Bun). */
	judge?: (agentDir: string, draftPath: string) => Promise<DraftVerdict>;
}

interface Context {
	treeRoot: string;
	backupRoot: string;
	digest: string | null;
	version: string;
	installDeps: (agentDir: string) => Promise<void>;
	judge: (agentDir: string, draftPath: string) => Promise<DraftVerdict>;
}

interface Sidecar {
	version: 1;
	name: string;
	instance: string;
	release: string;
	digest: string;
	draft_sha256: string;
	sha256: string;
	size: number;
	built_at: string;
}

/**
 * Kit builds in flight, keyed backupRoot + release + draft name — never request identity — so a
 * double click shares one install. Deleted the moment the build settles (module_state_tripwire).
 */
const kitBuildsInFlight = new Map<string, Promise<PanelKit>>();

function resolveContext(seams: KitBuildSeams): Context {
	if (seams.treeRoot !== undefined && seams.backupRoot === undefined) {
		throw new KitBuildError(
			'unsafe_seams',
			'kit refused (unsafe_seams): a scratch treeRoot must name its own backupRoot',
		);
	}
	return {
		treeRoot: seams.treeRoot ?? projectRoot,
		backupRoot: seams.backupRoot ?? resolveCodeBackupRoot(),
		digest: seams.digest === undefined ? INSTALLED_DIGEST : seams.digest,
		version: seams.version ?? DEDALO_VERSION,
		installDeps: seams.installDeps ?? installV2DepsReal,
		judge: seams.judge ?? judgeInChild,
	};
}

function releaseOf(ctx: Context): string {
	try {
		return publicationReleaseId(ctx.version, ctx.digest);
	} catch (error) {
		if (error instanceof ApiBundleError) {
			throw new KitBuildError(
				'no_verified_release',
				'kit refused (no_verified_release): this engine tree has no verified install digest (a dev checkout or a pre-stamp install) — build the kit on the checkout with `bun run hostagent:pack`',
			);
		}
		throw error;
	}
}

function sha256Hex(data: Uint8Array | string): string {
	return new Bun.CryptoHasher('sha256').update(data).digest('hex');
}

function kitPaths(
	backupRoot: string,
	release: string,
	name: string,
): { dir: string; kit: string; sidecar: string } {
	const dir = join(backupRoot, API_BUILD_DIR, release, KITS_DIR);
	return { dir, kit: join(dir, `${name}.tar.gz`), sidecar: join(dir, `${name}.json`) };
}

/** The default judge: the agent's parseDraft in a child Bun inside the kit copy (kit.ts). */
async function judgeInChild(agentDir: string, draftPath: string): Promise<DraftVerdict> {
	const child = Bun.spawn(
		[process.execPath, '--no-install', '-e', draftJudgeProgram(agentDir, draftPath)],
		{
			cwd: agentDir,
			env: { ...v2DepsInstallEnv(agentDir), LC_ALL: 'C' },
			stdout: 'pipe',
			stderr: 'pipe',
			signal: AbortSignal.timeout(KIT_JUDGE_TIMEOUT_MS),
		},
	);
	const [code, out, err] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	return draftVerdictFrom(out, code, err);
}

/** One manifested tree file, read without following a link and re-hashed against the manifest. */
async function verifiedFile(
	ctx: Context,
	manifest: PublicationManifest,
	key: string,
): Promise<{ data: Uint8Array; executable: boolean }> {
	const expected = manifest.files[key];
	if (expected === undefined) {
		throw new KitBuildError(
			'source_missing',
			`kit refused (source_missing): ${key} is not in this release's manifest`,
			[key],
		);
	}
	const read = await readBundleFile(join(ctx.treeRoot, key));
	if (read.kind !== 'file') {
		throw new KitBuildError('not_regular_file', `kit refused (not_regular_file): ${key}`, [key]);
	}
	if (sha256Hex(read.data) !== expected) {
		throw new KitBuildError('drift', `kit refused (drift): ${key} (modified)`, [key]);
	}
	return { data: read.data, executable: read.mode === 0o755 };
}

function mapBundleError(error: unknown): unknown {
	if (!(error instanceof ApiBundleError)) return error;
	const reason: KitBuildReason =
		error.reason === 'deps_symlink' || error.reason === 'not_regular_file'
			? error.reason
			: 'deps_install_failed';
	return new KitBuildError(
		reason,
		error.message.replace('Publication API bundle refused', 'kit refused'),
		error.paths,
	);
}

async function verifiedManifest(ctx: Context): Promise<PublicationManifest> {
	const verdict = await verifyKitSourceTree(ctx.treeRoot, ctx.digest ?? undefined);
	if (!verdict.ok) {
		const named = verdict.drift.slice(0, 20).join(', ');
		throw new KitBuildError(
			verdict.reason,
			`kit refused (${verdict.reason})${named === '' ? '' : `: ${named}`} — the kit ships only what the updater verified; on a checkout, \`bun run hostagent:pack\``,
			verdict.drift,
		);
	}
	const manifest = await readPublicationManifest(ctx.treeRoot);
	if (manifest === null || manifest.digest !== ctx.digest) {
		throw new KitBuildError(
			'digest_mismatch',
			'kit refused (digest_mismatch): the manifest is not the running release',
		);
	}
	return manifest;
}

async function devDependencyPresent(agentDir: string): Promise<string | null> {
	const pkg = JSON.parse(await readFile(join(agentDir, 'package.json'), 'utf8')) as {
		devDependencies?: Record<string, string>;
	};
	for (const dev of Object.keys(pkg.devDependencies ?? {})) {
		if ((await stat(join(agentDir, 'node_modules', dev)).catch(() => null)) !== null) return dev;
	}
	return null;
}

/** Everything the kit holds: verified source, a fresh production install, the judged draft. */
async function collect(
	ctx: Context,
	manifest: PublicationManifest,
	draft: PanelDraft,
	agentDir: string,
): Promise<{ files: KitFile[]; constants: KitConstants }> {
	const installSh = await verifiedFile(ctx, manifest, INSTALL_SH_REL);
	const constants = kitConstants(new TextDecoder().decode(installSh.data));
	const sourceFiles: KitFile[] = [];
	// 1. the verified agent files (minus test material) into the kit copy
	for (const key of manifestKitFiles(manifest)) {
		if (!key.startsWith(`${PUBLICATION_AGENT_ROOT}/`)) continue;
		const inAgent = key.slice(AGENT_REL.length + 1);
		if (excludedFromKit(inAgent)) continue;
		const file = await verifiedFile(ctx, manifest, key);
		await mkdir(dirname(join(agentDir, inAgent)), { recursive: true });
		await writeFile(join(agentDir, inAgent), file.data);
		sourceFiles.push({
			path: `${constants.sourceDir}/${key}`,
			bytes: file.data,
			executable: file.executable,
		});
	}
	// 2. production node_modules, installed in the copy (the API bundles' installer). The
	//    lockfile is REQUIRED: bun accepts --frozen-lockfile with no lockfile and floats every
	//    version (api_bundles.ts lockfile_missing, the same rule).
	for (const input of ['package.json', 'bun.lock']) {
		if (manifest.files[`${AGENT_REL}/${input}`] === undefined) {
			throw new KitBuildError(
				'source_missing',
				`kit refused (source_missing): ${AGENT_REL}/${input} is not in this release — the agent's dependencies cannot be installed frozen without it`,
				[`${AGENT_REL}/${input}`],
			);
		}
	}
	try {
		await ctx.installDeps(agentDir);
	} catch (error) {
		throw mapBundleError(error);
	}
	const dev = await devDependencyPresent(agentDir);
	if (dev !== null) {
		throw new KitBuildError(
			'dev_dependency',
			`kit refused (dev_dependency): node_modules holds the development dependency '${dev}'`,
			[dev],
		);
	}
	const moduleFiles: KitFile[] = [];
	try {
		const top = await stat(join(agentDir, 'node_modules')).catch(() => null);
		if (top !== null) {
			for (const entry of await dependencyFiles(agentDir)) {
				const { data, mode } = await entry.load();
				moduleFiles.push({
					path: `${constants.sourceDir}/${AGENT_REL}/${entry.path}`,
					bytes: data,
					executable: mode === 0o755,
				});
			}
		}
	} catch (error) {
		throw mapBundleError(error);
	}
	// 3. the draft, judged by the code that goes into the kit
	const draftText = draftJson(draft);
	const draftPath = join(agentDir, '.kit_draft.json');
	await writeFile(draftPath, draftText);
	let verdict: DraftVerdict;
	try {
		verdict = await ctx.judge(agentDir, draftPath);
	} catch (error) {
		if (error instanceof PackRefused)
			throw new KitBuildError('draft_refused', `kit refused (draft_refused): ${error.message}`);
		throw error;
	}
	const servesV1 = draftServesV1(draft);
	if (verdict.instance !== draft.instance || verdict.servesV1 !== servesV1) {
		throw new KitBuildError(
			'draft_refused',
			"kit refused (draft_refused): the agent's parseDraft read another instance or API set",
		);
	}
	// 4. the other SOURCE_MANIFEST files (the v1 sample only for a draft that serves v1)
	const others: KitFile[] = [];
	for (const entry of constants.sourceManifest) {
		if (entry.kind !== 'file') continue;
		if (constants.sourceOptional.includes(entry.path) && !servesV1) continue;
		const file = await verifiedFile(ctx, manifest, entry.path);
		others.push({
			path: `${constants.sourceDir}/${entry.path}`,
			bytes: file.data,
			executable: file.executable,
		});
	}
	const files: KitFile[] = [
		{ path: constants.draftName, bytes: new TextEncoder().encode(draftText), executable: false },
		{ path: constants.installName, bytes: installSh.data, executable: true },
		...others,
		...sourceFiles,
		...moduleFiles,
	];
	return { files, constants };
}

async function readSidecar(path: string): Promise<Sidecar | null> {
	try {
		const value = JSON.parse(await readFile(path, 'utf8')) as Sidecar;
		return value.version === 1 && SHA256_HEX.test(value.sha256) ? value : null;
	} catch {
		return null;
	}
}

async function fileSha256(path: string): Promise<string | null> {
	try {
		const hasher = new Bun.CryptoHasher('sha256');
		for await (const chunk of Bun.file(path).stream()) hasher.update(chunk);
		return hasher.digest('hex');
	} catch {
		return null;
	}
}

function kitOf(sidecar: Sidecar, file: string): PanelKit {
	return {
		name: sidecar.name,
		instance: sidecar.instance,
		release: sidecar.release,
		sha256: sidecar.sha256,
		size: sidecar.size,
		built_at: sidecar.built_at,
		file_name: kitFileName(sidecar.instance),
		file,
	};
}

/**
 * The cached kit of `name` for THIS release and THESE draft bytes, re-hashed — or null (none,
 * stale, or altered on disk). Never builds. A tree without a verified release has none.
 */
export async function cachedPanelKit(
	name: string,
	draft: PanelDraft,
	seams: KitBuildSeams = {},
): Promise<PanelKit | null> {
	const ctx = resolveContext(seams);
	let release: string;
	try {
		release = releaseOf(ctx);
	} catch {
		return null;
	}
	const paths = kitPaths(ctx.backupRoot, release, name);
	const sidecar = await readSidecar(paths.sidecar);
	if (
		sidecar === null ||
		sidecar.name !== name ||
		sidecar.release !== release ||
		sidecar.digest !== ctx.digest ||
		sidecar.draft_sha256 !== sha256Hex(draftJson(draft))
	) {
		return null;
	}
	return (await fileSha256(paths.kit)) === sidecar.sha256 ? kitOf(sidecar, paths.kit) : null;
}

async function buildFresh(
	name: string,
	draft: PanelDraft,
	ctx: Context,
	release: string,
): Promise<PanelKit> {
	const manifest = await verifiedManifest(ctx);
	const paths = kitPaths(ctx.backupRoot, release, name);
	await mkdir(paths.dir, { recursive: true });
	await rm(paths.sidecar, { force: true });
	// The kit copy IS the install dir, directly under the release dir: the installer's env puts
	// the shared cache at <build root>/.bun_install_cache (api_bundles.ts v2DepsInstallEnv).
	const scratch = join(dirname(paths.dir), `kit_src_${randomUUID()}`);
	const tmp = `${paths.kit}.tmp-${randomUUID()}`;
	try {
		const { files, constants } = await collect(ctx, manifest, draft, scratch);
		let kit: { bytes: Uint8Array; sha256: string };
		try {
			kit = await buildKit(files, constants);
		} catch (error) {
			if (error instanceof PackRefused)
				throw new KitBuildError('kit_refused', `kit refused (kit_refused): ${error.message}`);
			throw error;
		}
		await writeFile(tmp, kit.bytes, { mode: 0o600 });
		if ((await fileSha256(tmp)) !== kit.sha256) {
			throw new KitBuildError(
				'write_mismatch',
				'kit refused (write_mismatch): the file on disk is not what was written',
			);
		}
		await rename(tmp, paths.kit);
		const sidecar: Sidecar = {
			version: 1,
			name,
			instance: draft.instance,
			release,
			digest: ctx.digest as string,
			draft_sha256: sha256Hex(draftJson(draft)),
			sha256: kit.sha256,
			size: kit.bytes.length,
			built_at: new Date().toISOString(),
		};
		const sidecarTmp = `${paths.sidecar}.tmp-${randomUUID()}`;
		await writeFile(sidecarTmp, `${JSON.stringify(sidecar, null, '\t')}\n`, { mode: 0o600 });
		await rename(sidecarTmp, paths.sidecar);
		return kitOf(sidecar, paths.kit);
	} finally {
		await rm(tmp, { force: true });
		await rm(scratch, { recursive: true, force: true });
	}
}

/** The kit of `name` for the installed release: the cache, or a fresh build. Throws KitBuildError. */
export async function buildPanelKit(
	name: string,
	draft: PanelDraft,
	seams: KitBuildSeams = {},
): Promise<PanelKit> {
	const ctx = resolveContext(seams);
	const release = releaseOf(ctx);
	// keyed by the DRAFT too: a build of a removed-and-recreated name is never another draft's
	const key = `${ctx.backupRoot}\u0000${release}\u0000${name}\u0000${sha256Hex(draftJson(draft))}`;
	const running = kitBuildsInFlight.get(key);
	if (running !== undefined) return running;
	const job = (async () => {
		await verifiedManifest(ctx); // a cache hit is re-proved like a build (the tree may have drifted)
		return (
			(await cachedPanelKit(name, draft, seams)) ?? (await buildFresh(name, draft, ctx, release))
		);
	})().finally(() => kitBuildsInFlight.delete(key));
	kitBuildsInFlight.set(key, job);
	return job;
}

/** The kit's bytes, re-hashed at read time (null when it is gone or altered). */
export async function readPanelKit(kit: PanelKit): Promise<Uint8Array | null> {
	try {
		const bytes = new Uint8Array(await readFile(kit.file));
		return sha256Hex(bytes) === kit.sha256 ? bytes : null;
	} catch {
		return null;
	}
}

/** Removes the cached kit of `name` for this release (a removed or paired draft). Never throws. */
export async function removePanelKit(name: string, seams: KitBuildSeams = {}): Promise<void> {
	try {
		const ctx = resolveContext(seams);
		const release = releaseOf(ctx);
		// a build of this name still running would land its kit AFTER the removal: wait for it
		const prefix = `${ctx.backupRoot}\u0000${release}\u0000${name}\u0000`;
		const running = [...kitBuildsInFlight]
			.filter(([key]) => key.startsWith(prefix))
			.map(([, job]) => job);
		await Promise.allSettled(running);
		const paths = kitPaths(ctx.backupRoot, release, name);
		await rm(paths.kit, { force: true });
		await rm(paths.sidecar, { force: true });
	} catch {
		// no verified release: there is no cache to remove
	}
}
