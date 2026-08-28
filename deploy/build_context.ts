/**
 * BUILD-CONTEXT POLICY — what may travel with the code into a container image,
 * and the generator for the two artifacts that enforce it: `.dockerignore` and
 * the Dockerfile's COPY allowlist.
 *
 * WHY THIS FILE EXISTS (audit 2026-08-26, OPS-01 · P1-5). `Dockerfile` was
 * `COPY . .` over the whole build context and `.dockerignore` was a
 * HAND-MAINTAINED DENYLIST that named neither `deploy/certs/` nor
 * `.dedalo.env` — both of which `.gitignore` already treats as secrets and both
 * of which `install.sh` WRITES BEFORE it runs `compose build`. The worst asset
 * is `deploy/certs/dedalo-local-ca.key`: the script tells the operator to
 * install the matching CA certificate into the Trusted Root store of EVERY
 * computer that will use Dédalo, so whoever obtains that key can mint a
 * browser-trusted certificate for ANY hostname on all of those workstations.
 * An image carrying it is a museum-wide MITM position that travels wherever the
 * image travels — a registry (`deploy/dedalo-image-update.sh --mode pull`), a
 * `docker save` tarball, or any host whose docker group has one more member
 * than the operator expects.
 *
 * The engine already refuses this exact hazard one lane over: `code_update`
 * REFUSES a tree swap rather than let `deploy/certs/key.pem` travel with the
 * code tree (`src/core/update/code_update.ts`, `refuseUntrackedSecrets`). This
 * file generalises that rule to the image lane, in the only direction that is
 * durable:
 *
 *   1. THE CONTEXT IS DENY-ALL AT DEPTH 1 — and that is the precise claim, not
 *      "deny-all". A `.dockerignore` pattern is matched SEGMENT-WISE and `*`
 *      never crosses a `/`, so the leading `*` denies exactly the TOP-LEVEL
 *      entries of the tree; the allowlist then re-includes the tracked ones,
 *      and inheritance carries that re-inclusion down their subtrees. An
 *      operator's ROOT drop-in — `.dedalo.env`, `deploy/` (never re-included),
 *      `media/`, `backup.pem` — is outside the context BY CONSTRUCTION. A drop-in
 *      NESTED INSIDE an allowlisted tree (`src/keys/backup.pem`, an editor
 *      scratch file under `client/`) is NOT: `*` never saw it, and its ancestor
 *      was re-included. Rules 2 and 4 are what cover that residual, and §4 of
 *      the artifact states what is left of it.
 *   2. THE CENSUS IS DERIVED, AND TOTAL OVER THE REPO'S `.gitignore` FILES.
 *      Every rule of EVERY tracked `.gitignore` — the root one and the nested
 *      ones under `publication/` — is translated into `.dockerignore` RELATIVE
 *      TO ITS OWN DIRECTORY and re-applied AFTER the allowlist (last match
 *      wins), so a gitignored path INSIDE an allowlisted tree
 *      (`.agents/settings.local.json`, `src/core/update/install_stamp.json`,
 *      `**​/*.css.map`, `publication/server_api/v2/dist/`) is denied too. Add a
 *      secret to any `.gitignore` and it is excluded from the image in the same
 *      change; forget to regenerate and `build_context_secret_tripwire` is red.
 *      The per-directory scoping is load-bearing, not tidiness: the v2 API's
 *      `dist/` rule translated GLOBALLY would also drop
 *      `client/…/service_ckeditor/css/dist/`, which the image needs — a context
 *      narrowed past what the engine needs is a defect, not caution.
 *   3. THE COPY IS NARROW. The Dockerfile names each allowlisted entry, so the
 *      containment of `deploy/` (the directory install.sh writes private keys
 *      into) does not depend on .dockerignore semantics being right: no COPY in
 *      the Dockerfile can reach it at all.
 *   4. SECRET-SHAPED NAMES ARE DENIED AT EVERY DEPTH. The residual of rule 1 is
 *      the nested untracked drop-in, and the shape that matters there is the
 *      one the tree-swap lane already refuses (`code_update.ts`,
 *      `isSecretShapedName`): a `certs` directory, a `.env*` name, a
 *      `.pem/.key/.crt/.cer/.p12/.pfx` extension — ANYWHERE. The tracked files
 *      of that shape (two placeholder samples) are re-included by exact path,
 *      DERIVED from the tracked tree, so adding a third reddens the gate rather
 *      than silently riding along.
 *
 * WHAT IS LEFT, STATED PLAINLY: a NON-secret-shaped untracked file nested inside
 * an allowlisted tree — `client/scratch.js`, `src/notes.txt` — still enters the
 * build context. It cannot be denied without enumerating every tracked file as
 * an allowlist entry, which would break an install on the first file someone
 * forgets to regenerate. The gate asserts this residual explicitly rather than
 * leaving the reader to discover it.
 *
 * REGENERATE with:  bun run deploy/build_context.ts
 * The gate `test/unit/build_context_secret_tripwire.test.ts` asserts both
 * artifacts equal what this file renders, and — independently — evaluates the
 * resulting ignore rules the way Docker does.
 *
 * This file is HOST tooling: `deploy/` is excluded from the image, so it never
 * ships inside one.
 */

import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Repo root — this file lives at <root>/deploy/. */
export const buildContextRoot = resolve(import.meta.dir, '..');

export type ImageExclusion = { entry: string; reason: string };

/**
 * Tracked top-level entries deliberately kept OUT of the image, each with the
 * reason it is not needed there. Everything else git tracks at the root is
 * copied in — the rule is "keep unless there is a reason", because a context
 * narrowed past what the engine needs breaks an install, and an install that
 * breaks in a museum is worse than a megabyte.
 *
 * Staleness is a failure: the gate asserts every entry here is still tracked.
 */
export const IMAGE_EXCLUSIONS: readonly ImageExclusion[] = [
	{
		entry: 'deploy',
		reason:
			'THE SECRET LANE (OPS-01). install.sh writes the local-CA private key, the site key and the generated nginx conf into deploy/certs + deploy/*.generated.conf BEFORE `compose build`. Nothing inside the container ever reads deploy/ — the compose stacks bind-mount the proxy config and the certificates from the HOST checkout (docker-compose*.yml), and the systemd units are for bare-metal installs. Keeping the whole directory out of the context means no COPY can carry a key even if the ignore rules were wrong.',
	},
	{
		entry: 'test',
		reason:
			'The suite never runs in the image (it needs the marked suite database and the suite media root, neither of which exists in a container). ~34 MB of fixtures. Excluded before this policy too.',
	},
	{
		entry: '.github',
		reason: 'CI workflows — never read at runtime. Excluded before this policy too.',
	},
	{ entry: '.gitlab', reason: 'CI templates — never read at runtime.' },
	{ entry: '.gitlab-ci.yml', reason: 'CI pipeline definition — never read at runtime.' },
	{ entry: '.vscode', reason: 'Editor settings — a developer-machine artifact.' },
	{
		entry: '.claude',
		reason:
			'Committed SYMLINK alias of .agents/. A COPY whose SOURCE is a symlink dereferences it, so the alias would land as a second full copy of the tree; `.gitattributes` export-ignores it from release archives for the neighbouring reason (the installer refuses symlink entries). The real path .agents/ IS copied.',
	},
	{
		entry: 'CLAUDE.md',
		reason: 'Committed SYMLINK alias of AGENTS.md — same reason as .claude/.',
	},
];

/** The three paths the audit named: stated in the artifact even though the
 * deny-all base and the derived census already cover them. A rule you can grep
 * for is a rule the next operator can check. */
export const NAMED_SECRET_PATHS: readonly string[] = [
	'deploy/certs',
	'deploy/*.generated.conf',
	'.dedalo.env',
];

/** Every top-level entry git tracks, sorted. Fails loudly without git — a
 * context policy derived from a guess is worse than none. */
export function trackedTopLevelEntries(root: string = buildContextRoot): string[] {
	const listed = Bun.spawnSync(['git', '-C', root, 'ls-files', '-z'], {
		stdout: 'pipe',
		stderr: 'pipe',
	});
	if (listed.exitCode !== 0) {
		throw new Error(
			`build_context: \`git ls-files\` failed in ${root} — the build-context allowlist is derived from the tracked tree and cannot be computed without git: ${listed.stderr.toString()}`,
		);
	}
	const entries = new Set<string>();
	for (const path of listed.stdout.toString().split('\0')) {
		if (path.length === 0) continue;
		entries.add(path.split('/')[0] as string);
	}
	return [...entries].sort();
}

/** The tracked top-level entries that DO travel into the image. */
export function contextAllowlist(root: string = buildContextRoot): string[] {
	const excluded = new Set(IMAGE_EXCLUSIONS.map((one) => one.entry));
	return trackedTopLevelEntries(root).filter((entry) => !excluded.has(entry));
}

/**
 * Translate ONE `.gitignore` rule into the `.dockerignore` spelling(s) of the
 * same intent. The two formats look alike and are not:
 *
 *  - a leading `/` anchors a git rule to the directory the `.gitignore` sits in;
 *    a .dockerignore pattern is ALWAYS context-root-relative and `filepath.Clean`
 *    keeps the slash, so an anchored rule is written as `<dir>/<body>` with no
 *    leading slash;
 *  - a git rule with no slash matches AT ANY DEPTH BELOW ITS OWN DIRECTORY; a
 *    .dockerignore pattern is matched segment-wise and a bare `foo` reaches only
 *    the immediate children — hence the second, deeper spelling emitted by
 *    `atAnyDepth` below (the same reason this repo already carried
 *    `node_modules` AND a globstar twin);
 *  - a trailing `/` (directory-only in git) has no meaning in .dockerignore and
 *    is dropped;
 *  - `!` negations keep their position in the emitted order, because both
 *    formats resolve by LAST MATCH WINS.
 *
 * `directory` is the tracked `.gitignore`'s own directory, '' for the root one.
 * EVERY emitted pattern is confined to that subtree — a nested rule may never
 * reach outside the directory that declared it, which is what keeps the v2 API's
 * `dist/` from also dropping `client/…/service_ckeditor/css/dist/`.
 */
export function translateGitignoreRule(rule: string, directory = ''): string[] {
	const negated = rule.startsWith('!');
	let body = (negated ? rule.slice(1) : rule).trim();
	if (body.endsWith('/')) body = body.slice(0, -1);
	const anchored = body.startsWith('/');
	if (anchored) body = body.slice(1);
	if (body.length === 0) return [];
	const mark = negated ? '!' : '';
	const scope = directory.length > 0 ? `${directory}/` : '';
	// A rule with no slash matches at any depth below its own directory: the bare
	// spelling covers that directory's immediate children, `atAnyDepth`'s twin
	// covers everything deeper.
	if (!anchored && !body.includes('/')) {
		return atAnyDepth(body).map((pattern) => `${mark}${scope}${pattern}`);
	}
	return [`${mark}${scope}${body}`];
}

/**
 * The two spellings that together mean "this name, at any depth below here".
 *
 * NOT `[body, '**​/' + body]`, which is the obvious form and OVER-DENIES.
 * moby compiles a leading `**​/` to `((.*​/)|([^/]*))` — an alternation whose
 * SECOND branch is a partial segment with no separator after it — so `**​/.env`
 * matches `sample.env` and `**​/certs` matches `mycerts`. That is Docker's real
 * behaviour, and it cost this gate a red: the site builder's tracked
 * `sample.env` (operator documentation, not a credential) was dropped from the
 * image by the site builder's own `.env` rule. A guard that refuses lawful
 * traffic is a defect, not caution.
 *
 * `**​/*​/body` forces a real separator before the name: the globstar covers the
 * ancestors, `*` covers one whole segment, and the literal `/` is what the
 * partial-segment branch cannot fake. Depth 1 is the bare spelling's job.
 */
function atAnyDepth(body: string): string[] {
	return [body, `**/*/${body}`];
}

/** One tracked `.gitignore`'s live rules (comments and blanks out), each tagged
 * with the directory that declared it. */
export type CensusRule = { directory: string; rule: string };

/**
 * Every tracked `.gitignore` in the repo, root first then the nested ones in
 * path order. DERIVED from `git ls-files`, never enumerated: a `.gitignore`
 * added anywhere changes this list, which changes the rendered artifact, which
 * reddens the gate until both are regenerated. That is the staleness guard —
 * there is no scope statement to go out of date.
 */
export function gitignoreFiles(root: string = buildContextRoot): string[] {
	const listed = Bun.spawnSync(['git', '-C', root, 'ls-files', '-z', '--', '*.gitignore'], {
		stdout: 'pipe',
		stderr: 'pipe',
	});
	if (listed.exitCode !== 0) {
		throw new Error(
			`build_context: \`git ls-files -- *.gitignore\` failed in ${root} — the never-ship census is derived from the tracked ignore files and cannot be computed without git: ${listed.stderr.toString()}`,
		);
	}
	const files = listed.stdout
		.toString()
		.split('\0')
		.filter((path) => path === '.gitignore' || path.endsWith('/.gitignore'));
	if (!files.includes('.gitignore')) {
		throw new Error(
			`build_context: the root .gitignore is not tracked in ${root} — refusing to render a census that would silently omit it.`,
		);
	}
	return [
		'.gitignore',
		...files.filter((path) => path !== '.gitignore').sort((a, b) => a.localeCompare(b)),
	];
}

/** Every live rule of every tracked `.gitignore`, in emission order. */
export function censusRules(root: string = buildContextRoot): CensusRule[] {
	const rules: CensusRule[] = [];
	for (const file of gitignoreFiles(root)) {
		const directory = file === '.gitignore' ? '' : file.slice(0, -'/.gitignore'.length);
		for (const line of readFileSync(join(root, file), 'utf-8').split('\n')) {
			const rule = line.trim();
			if (rule.length === 0 || rule.startsWith('#')) continue;
			rules.push({ directory, rule });
		}
	}
	return rules;
}

/** The census: every tracked `.gitignore` rule, in the .dockerignore spelling. */
export function censusPatterns(root: string = buildContextRoot): string[] {
	return censusRules(root).flatMap((one) => translateGitignoreRule(one.rule, one.directory));
}

/**
 * Filenames that smell like credentials wherever they sit. This is the SAME
 * rule the tree-swap lane refuses on (`src/core/update/code_update.ts`,
 * `SECRET_LIKE_NAME` + `isSecretShapedName`); the two lanes agree on the shape
 * or one of them is a hole.
 */
export const SECRET_LIKE_NAME = /\.(pem|key|crt|cer|p12|pfx)$/i;

/** The updater's `isSecretShapedName`, applied to a whole path. */
export function isSecretShapedPath(path: string): boolean {
	const segments = path.split('/');
	const name = segments[segments.length - 1] as string;
	return (
		SECRET_LIKE_NAME.test(name) ||
		name.startsWith('.env') ||
		segments.slice(0, -1).includes('certs')
	);
}

/**
 * The depth-agnostic secret-shape denies — the residual of the depth-1 `*`.
 * An EXTENSION pattern needs one spelling: moby's leading globstar compiles to
 * an alternation whose second branch may be empty, so `backup.pem` at the root
 * matches `**​/*.pem` just as `a/b/backup.pem` does. A pattern whose body starts
 * with a LITERAL needs `atAnyDepth`, or that same empty-ish branch turns it into
 * a partial-segment match. Leg A of the gate pins both readings.
 */
export const SECRET_SHAPE_PATTERNS: readonly string[] = [
	// An extension body already begins with `*`, so the plain globstar spelling
	// cannot fake a partial segment here — `**​/*.pem` means exactly "a name
	// ending .pem, at any depth".
	'**/*.pem',
	'**/*.key',
	'**/*.crt',
	'**/*.cer',
	'**/*.p12',
	'**/*.pfx',
	// These two begin with a literal, so they need `atAnyDepth`'s spelling or
	// they would also deny `sample.env` and `mycerts`.
	...atAnyDepth('.env*'),
	...atAnyDepth('certs'),
];

/**
 * Tracked files the shape denies would drop, re-included by exact path. DERIVED
 * from `git ls-files`: today two placeholder samples
 * (`publication/server_api/v2/.env.example`, `publication/site_builder/.env.test`).
 * A third one changes this artifact — and `build_context_secret_tripwire` leg I
 * holds the reviewed list of what is allowed to travel, so it goes red until a
 * human writes down why.
 */
export function trackedSecretShapedFiles(root: string = buildContextRoot): string[] {
	const listed = Bun.spawnSync(['git', '-C', root, 'ls-files', '-z'], {
		stdout: 'pipe',
		stderr: 'pipe',
	});
	if (listed.exitCode !== 0) {
		throw new Error(
			`build_context: \`git ls-files\` failed in ${root} — the secret-shape re-includes are derived from the tracked tree and cannot be computed without git: ${listed.stderr.toString()}`,
		);
	}
	// Confined to the allowlist: a `!` re-include of a path under an EXCLUDED
	// top-level entry (say `test/fixtures/key.pem`) would drag that one file back
	// into the image past the exclusion that keeps its whole tree out.
	const allowed = new Set(contextAllowlist(root));
	return listed.stdout
		.toString()
		.split('\0')
		.filter(
			(path) =>
				path.length > 0 && isSecretShapedPath(path) && allowed.has(path.split('/')[0] as string),
		)
		.sort();
}

/** Wrap a reason into comment lines — the reasons are the artifact's own
 * documentation, so they are carried whole, never truncated. */
function wrapComment(text: string, firstPrefix: string, restPrefix: string): string[] {
	const lines: string[] = [];
	let prefix = firstPrefix;
	let current = '';
	for (const word of text.split(/\s+/)) {
		if (current.length > 0 && `${prefix}${current} ${word}`.length > 88) {
			lines.push(prefix + current);
			prefix = restPrefix;
			current = word;
		} else {
			current = current.length > 0 ? `${current} ${word}` : word;
		}
	}
	if (current.length > 0) lines.push(prefix + current);
	return lines;
}

export function renderDockerignore(root: string = buildContextRoot): string {
	const lines: string[] = [
		'# GENERATED — do not edit by hand. Regenerate with:  bun run context:gen',
		'# (`bun run context:check` renders without writing; the generator itself is',
		'# `bun run deploy/build_context.ts`, which context:gen is an alias of).',
		'#',
		'# The policy — an allowlist plus a derived census, rather than a hand-kept',
		'# denylist of secrets — is documented in deploy/build_context.ts (audit OPS-01 /',
		'# P1-5), together with the RESIDUAL this file does not close.',
		'# Gate: test/unit/build_context_secret_tripwire.test.ts.',
		'#',
		'# Docker resolves a path by LAST MATCH WINS, so the sections below are ordered',
		'# deny the root -> allow the code tree -> deny the secret shapes -> deny the',
		'# census -> name the OPS-01 assets.',
		'',
		'# --- 1. Nothing at the ROOT travels unless it is named below. ----------------',
		'# `*` is matched SEGMENT-WISE and never crosses a `/`, so this line denies the',
		'# TOP-LEVEL entries and nothing deeper — the precise claim is deny-all AT DEPTH',
		'# 1, not deny-all. An operator tree holds more than the repo at that depth:',
		'# deploy/ (certs, generated conf), .dedalo.env, media/, backups. None of it can',
		'# reach an image that starts from nothing. What is NOT covered here — an',
		'# untracked file NESTED inside an allowlisted tree — is section 3 and the',
		'# residual stated there.',
		'*',
		'',
		'# --- 2. The image tree: tracked top-level entries. ---------------------------',
		'# Derived from `git ls-files`; the entries deliberately left out are listed with',
		'# their reasons in deploy/build_context.ts IMAGE_EXCLUSIONS:',
	];
	for (const exclusion of IMAGE_EXCLUSIONS) {
		for (const line of wrapComment(`${exclusion.entry} — ${exclusion.reason}`, '#   ', '#     ')) {
			lines.push(line);
		}
	}
	for (const entry of contextAllowlist(root)) lines.push(`!${entry}`);
	lines.push(
		'',
		'# --- 3. Secret-SHAPED names, at EVERY depth. ---------------------------------',
		'# Section 1 denies the root; these deny the residual — an untracked drop-in',
		'# nested inside an allowlisted tree (src/keys/backup.pem, client/certs/…). The',
		'# shape is the one the code updater already refuses on the tree-swap lane',
		'# (code_update.ts, isSecretShapedName): a `certs` directory, a `.env*` name, a',
		'# key/certificate extension. An extension pattern needs one spelling; a pattern',
		'# starting with a literal needs two, because moby lets a leading `**/` match a',
		'# PARTIAL segment (`**/.env` would also deny `sample.env`).',
		'#',
		'# WHAT IS LEFT: a NON-secret-shaped untracked file nested inside an allowlisted',
		'# tree still enters the context. Denying that would mean allowlisting every',
		'# tracked file individually, and a context narrowed past what the engine needs',
		'# breaks an install — which is worse than a stray scratch file in a layer.',
	);
	for (const pattern of SECRET_SHAPE_PATTERNS) lines.push(pattern);
	const samples = trackedSecretShapedFiles(root);
	if (samples.length > 0) {
		lines.push(
			'#',
			'# The tracked files of that shape, re-included by exact path (placeholder',
			'# samples, never live credentials). DERIVED from `git ls-files` — a new one',
			'# rewrites this artifact and reddens the gate until a human reviews it.',
		);
		for (const sample of samples) lines.push(`!${sample}`);
	}
	lines.push(
		'',
		'# --- 4. The never-ship census, DERIVED from every tracked .gitignore. ---------',
		'# Re-applied AFTER the allowlist so a gitignored path INSIDE an allowlisted tree',
		'# (.agents/settings.local.json, src/core/update/install_stamp.json, the nested',
		'# node_modules trees — ~320 MB of foreign-platform binaries) is denied too, and',
		'# after section 3 so a gitignored path can never be resurrected by a re-include.',
		'# Nested .gitignore files are translated RELATIVE TO THEIR OWN DIRECTORY: the',
		'# v2 API ignores `dist/`, and applied globally that would also drop',
		'# client/…/service_ckeditor/css/dist/, which the image needs.',
		'# Sources:',
	);
	for (const file of gitignoreFiles(root)) lines.push(`#   ${file}`);
	for (const pattern of censusPatterns(root)) lines.push(pattern);
	lines.push(
		'',
		'# --- 5. Named explicitly (the OPS-01 assets). --------------------------------',
		'# Already covered by 1, 3 and 4. Stated anyway: these are the paths install.sh',
		'# writes before it builds, and a rule you can grep for is a rule the next',
		'# operator can check.',
	);
	for (const named of NAMED_SECRET_PATHS) lines.push(named);
	return `${lines.join('\n')}\n`;
}

export const COPY_BLOCK_BEGIN =
	'# >>> BUILD-CONTEXT ALLOWLIST — generated by deploy/build_context.ts >>>';
export const COPY_BLOCK_END = '# <<< BUILD-CONTEXT ALLOWLIST <<<';

/**
 * The Dockerfile's COPY block. One COPY per directory (a multi-source COPY with
 * a directory source copies its CONTENTS, which would flatten every tree into
 * the same place), one final COPY for the root files.
 */
export function renderCopyBlock(root: string = buildContextRoot): string {
	const entries = contextAllowlist(root);
	const directories = entries.filter((entry) => statSync(join(root, entry)).isDirectory());
	const files = entries.filter((entry) => !directories.includes(entry));
	const lines = [COPY_BLOCK_BEGIN];
	for (const directory of directories) lines.push(`COPY ${directory} ./${directory}`);
	if (files.length > 0) lines.push(`COPY ${files.join(' ')} ./`);
	lines.push(COPY_BLOCK_END);
	return lines.join('\n');
}

/** Replace the marked block in the Dockerfile text. Throws if the markers are
 * gone — a silently un-updated Dockerfile is the failure this whole file is
 * about. */
export function withCopyBlock(dockerfile: string, block: string): string {
	const begin = dockerfile.indexOf(COPY_BLOCK_BEGIN);
	const end = dockerfile.indexOf(COPY_BLOCK_END);
	if (begin < 0 || end < 0 || end < begin) {
		throw new Error(
			`build_context: the Dockerfile has no "${COPY_BLOCK_BEGIN}" … "${COPY_BLOCK_END}" block to write into.`,
		);
	}
	return dockerfile.slice(0, begin) + block + dockerfile.slice(end + COPY_BLOCK_END.length);
}

/**
 * `--check` renders without writing and exits 1 on a difference — the CI/pre-push
 * spelling, symmetrical with `css:check` and `config:check`. It names WHICH
 * artifact drifted, because the two have different causes (a new top-level entry
 * vs. a new ignore rule).
 *
 * `--root <path>` points both modes at another checkout. It exists so the gate
 * can DRIVE the CLI end to end on a synthetic tree — a `--check` that only ever
 * runs on a current tree has never been seen to refuse anything — and it is the
 * spelling CI needs to check a worktree it did not cd into.
 */
function main(): void {
	const rootFlag = Bun.argv.indexOf('--root');
	const root = rootFlag < 0 ? buildContextRoot : resolve(Bun.argv[rootFlag + 1] as string);
	const dockerfilePath = join(root, 'Dockerfile');
	const dockerignore = renderDockerignore(root);
	const dockerfile = withCopyBlock(readFileSync(dockerfilePath, 'utf-8'), renderCopyBlock(root));
	if (Bun.argv.includes('--check')) {
		const stale = [
			readFileSync(join(root, '.dockerignore'), 'utf-8') === dockerignore ? null : '.dockerignore',
			readFileSync(dockerfilePath, 'utf-8') === dockerfile ? null : 'Dockerfile',
		].filter((one): one is string => one !== null);
		if (stale.length > 0) {
			console.error(
				`build_context: ${stale.join(' and ')} no longer match the tracked tree + the ignore census. Run \`bun run context:gen\`.`,
			);
			process.exit(1);
		}
		console.log('build_context: .dockerignore and the Dockerfile COPY allowlist are current.');
		return;
	}
	writeFileSync(join(root, '.dockerignore'), dockerignore);
	writeFileSync(dockerfilePath, dockerfile);
	console.log('build_context: wrote .dockerignore and the Dockerfile COPY allowlist.');
}

if (import.meta.main) main();
