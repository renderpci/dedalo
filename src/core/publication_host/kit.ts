/**
 * THE PUBLICATION-HOST KIT — its format, the ONE implementation both builders share
 * (engineering/PUBLICATION_HOST_SPEC.md §9.12):
 *
 *   - `bun run hostagent:pack` (scripts/publication_host_pack.ts) on a work CHECKOUT: the
 *     git-tracked files, a fresh production install in a scratch copy;
 *   - the maintenance panel (kit_build.ts) on an INSTALLED release: the files the updater
 *     verified (publication_manifest.ts, the kit census), the same production install.
 *
 * Both hand their file set to buildKit, which refuses what kitProblems names and writes ONE
 * deterministic archive (gzip around ustar from bundle_writer.ts: mtime 0, uid/gid 0,
 * normalized modes, tree order), and both judge the draft with judgeDraftSource: the agent's
 * OWN parseDraft (draft_schema.ts) and draftServesV1 (draft.ts), run by a child Bun inside the
 * scratch copy, so the code and the zod that go into the kit judge the draft.
 *
 *   MANIFEST     the format line, then `<sha256>  <path>` for every other file
 *   draft.json   the draft, byte for byte
 *   install.sh   publication/host_agent/deploy/install.sh
 *   source/      the SOURCE_MANIFEST layout install.sh stages
 *
 * The kit's constants (format line, names, path grammar, the source layout) are READ from
 * install.sh — the verifier's own copy — so packer and verifier cannot drift, and this module
 * imports no agent module. A kit never carries a secret (SECRET_NAME, PRIVATE_KEY_BLOCK): the
 * database passwords are typed on the publication host (owner decision D6), the service token
 * is minted there.
 *
 * Pure but for buildKit's stream (no file or process I/O): both builders do their own I/O.
 */

import { createHash } from 'node:crypto';
import { type BundleWriterEntry, compareBundlePaths, writeBundle } from './bundle_writer.ts';

/** publication/host_agent, relative to the repo root (the kit's tree entry). */
export const AGENT_REL = 'publication/host_agent';
export const INSTALL_SH_REL = `${AGENT_REL}/deploy/install.sh`;

/**
 * Tracked agent files that are TEST material or documentation fixtures, never production: the
 * suite, its committed test env, and the rendered example trees (placeholder agent.env /
 * fragments a reader would mistake for an install's). Relative to publication/host_agent.
 */
export const KIT_AGENT_EXCLUDES: readonly string[] = Object.freeze([
	'tests/',
	'.env.test',
	'deploy/examples/',
]);

/**
 * The production install of the agent copy — the release bundles' own argv (api_bundles.ts
 * V2_DEPS_INSTALL_ARGS, held equal by publication_host_kit_pack): frozen, production, hoisted,
 * and NO lifecycle scripts. Spelled here, not imported, so the packer script loads no engine
 * config (api_bundles reaches the updater).
 */
export const KIT_DEPS_INSTALL_ARGS: readonly string[] = Object.freeze([
	'install',
	'--frozen-lockfile',
	'--production',
	'--linker',
	'hoisted',
	'--ignore-scripts',
]);

/** A file never carried, by name: credentials, keys, env files other than the shipped examples. */
const SECRET_NAME =
	/(^|\/)(\.env(\.(?!example$)[^/]*)?|[^/]*\.(pem|key|p12|pfx|jks)|id_(rsa|ecdsa|ed25519)[^/]*|SERVICE_TOKEN|credentials)$/;
/** A PEM private key WITH a body (a code constant naming the armour line has none). */
const PRIVATE_KEY_BLOCK =
	/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----\s*[A-Za-z0-9+/=\s]{64,}-----END [A-Z0-9 ]*PRIVATE KEY-----/;

/** A kit refusal (the CLI: exit 3; the panel: publication_host.kit_refused). */
export class PackRefused extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PackRefused';
	}
}

/**
 * A kit INPUT that is not what it must be by construction: install.sh without one of the kit's
 * constants, a draft judge that answered no verdict. A broken tree or child, never an operator's
 * draft (that is PackRefused).
 */
export class KitFormatError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'KitFormatError';
	}
}

/* ── the verifier's constants (install.sh) ─────────────────────────────────────────── */

export interface KitConstants {
	readonly formatLine: string;
	readonly manifestName: string;
	readonly draftName: string;
	readonly installName: string;
	readonly sourceDir: string;
	readonly pathPattern: RegExp;
	readonly dotSegmentPattern: RegExp;
	readonly maxEntries: number;
	/** SOURCE_MANIFEST: `<path>:<file|tree>`. */
	readonly sourceManifest: readonly { readonly path: string; readonly kind: 'file' | 'tree' }[];
	readonly sourceOptional: readonly string[];
}

function shValue(text: string, name: string): string {
	const match = new RegExp(`^${name}=(?:'([^']*)'|(\\S+))$`, 'm').exec(text);
	if (match === null) throw new KitFormatError(`${INSTALL_SH_REL} has no ${name}= line`);
	return match[1] ?? match[2] ?? '';
}

export function kitConstants(installSh: string): KitConstants {
	const sourceManifest = shValue(installSh, 'SOURCE_MANIFEST')
		.split(' ')
		.map((entry) => {
			const [path = '', kind = ''] = entry.split(':');
			if (kind !== 'file' && kind !== 'tree')
				throw new KitFormatError(`SOURCE_MANIFEST entry '${entry}'`);
			return Object.freeze({ path, kind: kind as 'file' | 'tree' });
		});
	return Object.freeze({
		formatLine: shValue(installSh, 'KIT_FORMAT_LINE'),
		manifestName: shValue(installSh, 'KIT_MANIFEST_NAME'),
		draftName: shValue(installSh, 'KIT_DRAFT_NAME'),
		installName: shValue(installSh, 'KIT_INSTALL_NAME'),
		sourceDir: shValue(installSh, 'KIT_SOURCE_DIR'),
		pathPattern: new RegExp(shValue(installSh, 'KIT_PATH_RE')),
		dotSegmentPattern: new RegExp(shValue(installSh, 'KIT_DOT_SEGMENT_RE')),
		maxEntries: Number(shValue(installSh, 'KIT_MAX_ENTRIES')),
		sourceManifest: Object.freeze(sourceManifest),
		sourceOptional: Object.freeze(shValue(installSh, 'SOURCE_OPTIONAL').split(' ').filter(Boolean)),
	});
}

/* ── the kit's files ───────────────────────────────────────────────────────────────── */

export interface KitFile {
	/** Kit-relative (`source/…`, `draft.json`, `install.sh`); never the MANIFEST. */
	readonly path: string;
	readonly bytes: Uint8Array;
	readonly executable: boolean;
}

const byPath = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Is an agent path test material (KIT_AGENT_EXCLUDES)? `rel` is relative to the agent dir. */
export function excludedFromKit(rel: string): boolean {
	return KIT_AGENT_EXCLUDES.some((ex) => (ex.endsWith('/') ? rel.startsWith(ex) : rel === ex));
}

/** Every reason this file set is not a kit install.sh would accept, or would carry a secret. */
export function kitProblems(files: readonly KitFile[], constants: KitConstants): string[] {
	const problems: string[] = [];
	const seen = new Set<string>();
	for (const file of files) {
		problems.push(...pathProblems(file.path, constants));
		if (seen.has(file.path)) problems.push(`'${file.path}' is listed twice`);
		seen.add(file.path);
		problems.push(...secretProblems(file));
	}
	for (const need of [constants.draftName, constants.installName]) {
		if (!seen.has(need)) problems.push(`the kit has no ${need}`);
	}
	// + the MANIFEST, + one directory per ancestor: still a cap install.sh's listing check applies
	if (files.length + 1 > constants.maxEntries)
		problems.push(
			`the kit holds ${files.length + 1} files (install.sh refuses more than ${constants.maxEntries} entries)`,
		);
	return problems;
}

/** A path outside the kit grammar, or the MANIFEST's own name. */
function pathProblems(path: string, constants: KitConstants): string[] {
	const problems: string[] = [];
	if (!constants.pathPattern.test(path) || constants.dotSegmentPattern.test(path)) {
		problems.push(`'${path}' is outside the kit path grammar (${constants.pathPattern.source})`);
	}
	if (path === constants.manifestName) problems.push(`'${path}' is the MANIFEST's own name`);
	return problems;
}

/** A file named like a credential, or else holding a PEM private key. */
function secretProblems(file: KitFile): string[] {
	if (SECRET_NAME.test(file.path))
		return [`'${file.path}' is named like a credential: a kit never carries a secret`];
	if (PRIVATE_KEY_BLOCK.test(Buffer.from(file.bytes).toString('latin1')))
		return [`'${file.path}' holds a PEM private key: a kit never carries a secret`];
	return [];
}

/** The MANIFEST: the format line, then `<sha256>  <path>` per file in byte order of the path. */
export function kitManifest(files: readonly KitFile[], constants: KitConstants): string {
	const lines = [...files]
		.sort((a, b) => byPath(a.path, b.path))
		.map((file) => `${sha256(file.bytes)}  ${file.path}`);
	return `${constants.formatLine}\n${lines.join('\n')}\n`;
}

/** The archive's entries in tree order: the MANIFEST, every file, and each ancestor directory once. */
export function kitEntries(
	files: readonly KitFile[],
	constants: KitConstants,
): BundleWriterEntry[] {
	const manifest = new TextEncoder().encode(kitManifest(files, constants));
	const entries = new Map<string, BundleWriterEntry>();
	entries.set(constants.manifestName, {
		path: constants.manifestName,
		type: 'file',
		mode: 0o644,
		data: manifest,
	});
	for (const file of files) {
		const parts = file.path.split('/');
		for (let i = 1; i < parts.length; i += 1) {
			const dir = parts.slice(0, i).join('/');
			if (!entries.has(dir)) entries.set(dir, { path: dir, type: 'dir', mode: 0o755 });
		}
		entries.set(file.path, {
			path: file.path,
			type: 'file',
			mode: file.executable ? 0o755 : 0o644,
			data: file.bytes,
		});
	}
	return [...entries.values()].sort((a, b) => compareBundlePaths(a.path, b.path));
}

/** The kit's bytes and sha256. Refuses (PackRefused) a file set kitProblems names anything in. */
export async function buildKit(
	files: readonly KitFile[],
	constants: KitConstants,
): Promise<{ bytes: Uint8Array; sha256: string }> {
	const problems = kitProblems(files, constants);
	if (problems.length > 0) throw new PackRefused(problems.join('\n'));
	const entries = kitEntries(files, constants);
	async function* source(): AsyncGenerator<BundleWriterEntry> {
		yield* entries;
	}
	const { stream, sha256: digest } = await writeBundle(source());
	const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
	return { bytes, sha256: await digest };
}

/** The kit's file name for an instance (what install.sh is told with --kit). */
export function kitFileName(instance: string): string {
	return `dedalo_publication_host_kit_${instance}.tar.gz`;
}

/* ── the draft, judged by the kit's own code ───────────────────────────────────────── */

export interface DraftVerdict {
	readonly instance: string;
	readonly servesV1: boolean;
}

/**
 * The program a child Bun runs inside the scratch agent copy: the agent's OWN parseDraft
 * (draft_schema.ts) and draftServesV1 (draft.ts) on the draft file; prints ONE JSON line.
 */
export function draftJudgeProgram(scratchAgent: string, draftPath: string): string {
	const at = (rel: string): string => JSON.stringify(`${scratchAgent}/${rel}`);
	return [
		`import { parseDraft } from ${at('src/provision/init/draft_schema.ts')};`,
		`import { draftServesV1 } from ${at('src/provision/init/draft.ts')};`,
		'let raw;',
		`try { raw = JSON.parse(await Bun.file(${JSON.stringify(draftPath)}).text()); } catch { console.log(JSON.stringify({ ok: false, message: 'the draft is not JSON' })); process.exit(0); }`,
		"try { const d = parseDraft(raw, 'the draft'); console.log(JSON.stringify({ ok: true, instance: d.instance, servesV1: draftServesV1(d) })); }",
		'catch (e) { console.log(JSON.stringify({ ok: false, message: String(e && e.message ? e.message : e) })); }',
	].join('\n');
}

/** The child's last stdout line, parsed; a line that is no JSON is a broken child (an Error). */
function childVerdict(
	stdout: string,
	exitCode: number,
	stderr: string,
): { ok: boolean; instance?: string; servesV1?: boolean; message?: string } {
	const line = stdout.trim().split('\n').at(-1) ?? '';
	try {
		return JSON.parse(line);
	} catch {
		throw new KitFormatError(
			`judging the draft with the agent's parseDraft failed (exit ${exitCode}): ${stderr.trim().split('\n').slice(-3).join(' ')}`,
		);
	}
}

/** The child's last stdout line → the verdict; a refusal is PackRefused, a broken child an Error. */
export function draftVerdictFrom(stdout: string, exitCode: number, stderr: string): DraftVerdict {
	const verdict = childVerdict(stdout, exitCode, stderr);
	if (!verdict.ok)
		throw new PackRefused(
			`the draft is refused by the agent's own validation:\n${verdict.message ?? ''}`,
		);
	const instance = verdict.instance ?? '';
	if (!/^[a-z][a-z0-9_]{1,31}$/.test(instance))
		throw new PackRefused(`the draft's instance '${instance}' is not an instance name`);
	return { instance, servesV1: verdict.servesV1 === true };
}
