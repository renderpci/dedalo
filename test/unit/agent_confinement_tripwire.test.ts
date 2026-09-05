/**
 * TRIPWIRE — an agent turn is a DIFFERENT PRINCIPAL from the daemon that starts it
 * (PUB-01 / P1-21).
 *
 * The audit's finding was not that a directive was missing. It was that every boundary the
 * site-builder daemon draws around a coding agent — a closed environment key set, a
 * realpath-proved cwd, a HOME outside the workspaces, a pinned git remote, a unit hardened
 * to `ProtectSystem=strict` — described a child that then ran AS THE DAEMON'S OWN UID. No
 * filesystem mode and no `Protect*` directive separates a process from itself, so the
 * shared bearer under `$CREDENTIALS_DIRECTORY`, every provider key and the append handle on
 * the audit trail were readable to text a language model wrote, and stealing the bearer is
 * full daemon control including the irreversible deletion of a museum's published site.
 *
 * WHAT THIS GATE HOLDS, and why it is here rather than in the package's own suite: the
 * package suite runs only when the package's files change (`scripts/verify.ts`), and three
 * of the four properties below live in files a reader would not think of as the site
 * builder's — the ownership matrix, the rendered env, the polkit rule. It is also the
 * CENSUS: every process-creating call site in the daemon's source is enumerated here, so
 * the next one cannot be added without a decision about what it runs as.
 *
 *   §1 THE CENSUS. Every `Bun.spawn` / `spawnSync` / `child_process` spawn under
 *      `publication/site_builder/src/`, derived from the tree with a floor, each one either
 *      THE confined agent spawn or an enumerated exemption carrying its reason.
 *   §2 THE UNIT. The three directives that are about the agent rather than the daemon
 *      (`ProtectProc=invisible`, `RestrictSUIDSGID`, `LockPersonality`), beside the
 *      hardening set that was already there — asserted on a real render.
 *   §3 THE AUTHORIZATION. The rendered polkit rule: this museum's service user, this
 *      museum's transient-unit prefix, `manage-units` and three verbs, and nothing else.
 *   §4 THE RECORDED DECISION. One agent uid per MUSEUM, not per site — the acceptance the
 *      row required to be written down rather than left as an absence, asserted here so it
 *      cannot be silently reversed in either direction.
 *   §5 THE PROVISIONED HOST IS CONFINED BY CONSTRUCTION. The rendered env states the mode
 *      and the identity, so the daemon's production refusal never has to fire.
 *   §6 THE OTHER DOOR. A build step, an install script and a `git add` are agent-authored
 *      text too, executed on a routine publisher-triggered path. No module that runs a
 *      command inside a site workspace may reach the UNCONFINED runner: `util/spawn.ts` is
 *      imported by the confinement and the version probes, and by nothing else.
 *   §7 THE TREE THE TWO UIDS SHARE. The modes that make a confined turn able to write at
 *      all — one constant for the provisioned roots and the runtime workspaces — and the
 *      audit trail closed to the group the agent is in. Plus the two censuses that keep the
 *      tree's DOORS in one module: every path-based MUTATION and every path-based CONTENT
 *      READ under `src/`, each enumerated with a destination, because a lexical
 *      `confinedPath` follows a planted link in both directions — the write plant truncates
 *      the daemon's own audit trail, and the read plant serves the daemon's own
 *      `SERVICE_TOKEN` back through `GET /sites/<slug>/builds/<id>`.
 *
 * The BEHAVIOUR of a confined turn — the argv, the caps, the egress, the refusals, the
 * per-turn credential — is the package's own gate,
 * `publication/site_builder/tests/agent_confinement.test.ts`. This one is the invariant
 * scan around it.
 */

import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import {
	AGENT_USER_PREFIX,
	derive,
	type InstanceManifest,
	MODES,
	USER_PREFIX,
} from '../../publication/site_builder/src/provision/layout.ts';
import { renderAll } from '../../publication/site_builder/src/provision/render/index.ts';
import { parseManifest } from '../../publication/site_builder/src/provision/schema.ts';
import {
	PRIVATE_DIR_MODE,
	SHARED_DIR_MODE,
	SHARED_FILE_MODE,
} from '../../publication/site_builder/src/util/shared_tree.ts';
import { SITE_BUILDER_SRC, siteBuilderDaemonFiles } from '../helpers/publication_corpus.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const PACKAGE = join(REPO_ROOT, 'publication/site_builder');
const SOURCE_ROOT = SITE_BUILDER_SRC;
const DECLARATION = join(PACKAGE, 'deploy/examples/instance.example.json');

/* ────────────────────────────────────────────────────────────────────────────────────
 * The corpus
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * WHAT COUNTS AS STARTING A PROCESS.
 *
 * Deliberately wider than the one spelling this daemon uses today: `Bun.spawn`,
 * `Bun.spawnSync`, node's `spawn`/`spawnSync`/`exec`/`execFile`/`fork`, and `execSync`. A
 * census that matched only `Bun.spawn(` would be answered by the next author importing
 * `node:child_process`, which is a different spelling of the same decision.
 *
 * A member call (`X.exec(...)`) is NOT one of them — that is `RegExp.prototype.exec`, which
 * this tree uses eleven times, and an injected `io.exec` seam whose one implementation is
 * `provision/apply.ts` and is enumerated below. `Bun.spawn` is named explicitly for exactly
 * that reason: it is the one member call that IS a process.
 */
const SPAWN_CALL =
	/(?:\bBun\.spawnSync\s*\(|\bBun\.spawn\s*\(|(?<![.\w])(?:spawnSync|spawn|execFileSync|execFile|execSync|exec|fork)\s*\()/g;

interface SpawnSite {
	readonly file: string;
	readonly line: number;
	readonly text: string;
}

/**
 * Plant a scratch file and REMEMBER its path. The positive controls feed the
 * scanners a LIST of files, never a directory: the corpus roots belong to the
 * shared lister (`test/helpers/publication_corpus.ts`), and a control that
 * walked a tree of its own would be a second, drifting answer to "what is the
 * corpus".
 */
function plant(planted: string[], path: string, body: string): string {
	writeFileSync(path, body);
	planted.push(path);
	return path;
}

/** Every process-creating call site under a tree, with its file relative to that tree. */
function spawnSites(files: readonly string[], root: string): SpawnSite[] {
	const sites: SpawnSite[] = [];
	for (const path of files) {
		const lines = readFileSync(path, 'utf8').split('\n');
		lines.forEach((text, index) => {
			// Comments are prose about spawning, not spawning. The daemon's modules explain
			// themselves at length, and `Bun.spawn(argv)` appears in three headers.
			const code = text.replace(/^\s*(\/\/|\*|\/\*).*$/, '');
			SPAWN_CALL.lastIndex = 0;
			if (SPAWN_CALL.test(code))
				sites.push({ file: relative(root, path), line: index + 1, text: text.trim() });
		});
	}
	return sites;
}

/**
 * THE ENUMERATED EXEMPTIONS — every process this daemon starts that is NOT an agent turn,
 * each with the reason it is not one. Shrink-only: a new entry is a new decision about what
 * runs as whom, and it belongs in a review rather than in a diff nobody reads.
 */
const EXEMPT: Readonly<Record<string, string>> = Object.freeze({
	'provision/apply.ts':
		'the PROVISIONER, not the daemon: an operator-run root process reading the host (id, ' +
		'getent, systemctl) and setting ownership (chown). It never executes agent-authored ' +
		'text, and confining it under the agent uid would be a root tool asking permission to ' +
		'do the thing it exists to do.',
	'drivers/confinement.ts':
		"the confinement's OWN control plane: `systemctl stop <this turn's transient unit>`, " +
		'issued through the same polkit grant that started it, because killing the client that ' +
		'waits on a unit does not stop the unit.',
	'util/spawn.ts':
		'runBinary — the ONE place a process is created, and the door itself. It REFUSES a cwd ' +
		'inside SITES_ROOT without the confinement token (`CONFINED_ARGV`), so a build step, an ' +
		'install script and a `git add` all reach it through runConfined() under the agent uid; ' +
		'what is left unconfined here is the driver VERSION PROBE, a pinned root-owned binary ' +
		'run with --version outside every workspace. §6 holds the import side of that rule.',
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * §1 The census
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('every process the site-builder daemon starts is accounted for', () => {
	const files = siteBuilderDaemonFiles();
	const sites = spawnSites(files, SOURCE_ROOT);

	test('the corpus is the tree, and it is not empty', () => {
		// The floor is what makes the emptiness assertions below mean anything: a scanner
		// pointed at a moved directory would otherwise report a clean census of nothing.
		expect(files.length).toBeGreaterThan(40);
		expect(sites.length).toBeGreaterThan(8);
	});

	test('exactly one of them spawns an agent turn, and it spawns the CONFINED argv', () => {
		const inDrivers = sites.filter(
			(site) => site.file.startsWith('drivers/') && !(site.file in EXEMPT),
		);
		expect(inDrivers.map((site) => site.file)).toEqual(['drivers/process.ts']);
		// The whole point of the row, read off the call itself: the supervisor spawns what
		// `confineTurn()` returned. A `Bun.spawn(plan.argv, …)` here is the defect restored,
		// and it is the exact line the audit found.
		expect(inDrivers[0]?.text).toContain('confined.argv');
		expect(inDrivers[0]?.text).not.toContain('plan.argv');
	});

	test('every other call site is an enumerated exemption with a reason', () => {
		const unexplained = sites
			.filter((site) => site.file !== 'drivers/process.ts')
			.filter((site) => !(site.file in EXEMPT))
			.map((site) => `${site.file}:${site.line} ${site.text}`);
		expect(unexplained).toEqual([]);
		// Shrink-only in the other direction too: an exemption whose file stopped spawning is
		// an exemption that would silently cover the NEXT spawn added to that file.
		for (const file of Object.keys(EXEMPT)) {
			expect({ file, live: sites.some((site) => site.file === file) }).toEqual({
				file,
				live: true,
			});
		}
		for (const [file, reason] of Object.entries(EXEMPT)) {
			expect({ file, stated: reason.length > 60 }).toEqual({ file, stated: true });
		}
	});

	test('the scanner really finds an offender — a planted one is reported', () => {
		// The positive control. Without it every assertion above is satisfied by a scanner that
		// found nothing, in a directory that moved, with a regex that matches no code.
		const dir = mkdtempSync(join(tmpdir(), 'agent-confinement-control-'));
		const planted: string[] = [];
		plant(planted, join(dir, 'rogue.ts'), 'export function go() {\n  Bun.spawn(["/bin/sh"]);\n}\n');
		plant(
			planted,
			join(dir, 'nested.ts'),
			"import { execFile } from 'node:child_process';\nexecFile('/bin/sh');\n",
		);
		plant(
			planted,
			join(dir, 'prose.ts'),
			'// Bun.spawn(argv) is what this module replaces.\nexport const x = 1;\n',
		);
		const found = spawnSites(planted, dir);
		expect(found.map((site) => site.file).sort()).toEqual(['nested.ts', 'rogue.ts']);
	});
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * The rendered host, from the committed reference declaration
 * ──────────────────────────────────────────────────────────────────────────────────── */

function manifestFrom(patch: Record<string, unknown> = {}): InstanceManifest {
	const doc = JSON.parse(readFileSync(DECLARATION, 'utf8')) as Record<string, unknown>;
	return parseManifest({ ...doc, ...patch }, { source: 'agent_confinement_tripwire' });
}

function render(patch: Record<string, unknown> = {}) {
	const manifest = manifestFrom(patch);
	const layout = derive(manifest);
	return { layout, artifacts: renderAll(layout, manifest) };
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * §2 The unit
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe("the museum's unit hardens the daemon AND what it starts underneath it", () => {
	const { artifacts } = render();
	const unit = artifacts.find((artifact) => artifact.kind === 'unit');

	test('the unit is rendered at all', () => {
		expect(unit).toBeDefined();
		expect(unit?.body.length).toBeGreaterThan(1000);
	});

	test('the three agent-facing directives stand beside the hardening set that was there', () => {
		const body = unit?.body ?? '';
		// The three this row adds. ProtectProc is the one the audit named by absence: without
		// it every `/proc/<pid>/environ` on the host — this daemon's included — is readable to
		// anything started underneath.
		for (const directive of [
			'ProtectProc=invisible',
			'RestrictSUIDSGID=yes',
			'LockPersonality=yes',
		]) {
			expect({ directive, present: body.includes(`\n${directive}`) }).toEqual({
				directive,
				present: true,
			});
		}
		// …and the set they must not have replaced. A gate that asserted only the new lines
		// would go green on a unit that had dropped ProtectSystem= to make room for them.
		for (const directive of [
			'NoNewPrivileges=yes',
			'ProtectSystem=strict',
			'ProtectHome=yes',
			'PrivateTmp=yes',
			'UMask=',
			'ReadWritePaths=',
			'LoadCredential=',
		]) {
			expect({ directive, present: body.includes(`\n${directive}`) }).toEqual({
				directive,
				present: true,
			});
		}
	});
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * §3 The authorization
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the agent authorization is rendered, scoped and per museum', () => {
	const { layout, artifacts } = render();
	const rule = artifacts.find((artifact) => artifact.kind === 'agent_authorization');

	test('it exists, as a root-owned file where polkit reads rules', () => {
		expect(rule).toBeDefined();
		expect(rule?.path).toBe(layout.agentPolicyPath);
		expect(rule?.path).toContain('/polkit-1/rules.d/');
		// Read by polkitd running as root; writable by nobody else. A group-writable rule file
		// is a grant the grantee can widen.
		expect({ owner: rule?.owner, group: rule?.group, mode: rule?.mode }).toEqual({
			owner: 'root',
			group: 'root',
			mode: 0o644,
		});
	});

	test('it grants THIS museum’s service user THIS museum’s transient units, and three verbs', () => {
		const body = rule?.body ?? '';
		expect(body).toContain('org.freedesktop.systemd1.manage-units');
		expect(body).toContain(`subject.user !== "${layout.identity.user}"`);
		expect(body).toContain(`unit.indexOf("${layout.agentUnitPrefix}") !== 0`);
		expect(body).toContain('".service"');
		for (const verb of ['"start"', '"stop"', '"kill"']) {
			expect({ verb, present: body.includes(verb) }).toEqual({ verb, present: true });
		}
		// The verbs a turn does NOT need, and which would make this grant a way to manage the
		// host: enabling a unit at boot, or reloading the manager's own configuration.
		for (const verb of ['"enable"', '"reload-daemon"', '"mask"']) {
			expect({ verb, present: body.includes(verb) }).toEqual({ verb, present: false });
		}
		// Everything unmatched falls through, so this file can only ADD the permission it
		// names — it can never widen or revoke another rule on the host.
		expect(body).toContain('polkit.Result.NOT_HANDLED');
		expect(body).toContain('polkit.Result.YES');
	});

	test("one museum's grant cannot reach another museum's turns", () => {
		const other = render({ instance: 'museum-b' });
		const otherRule = other.artifacts.find((artifact) => artifact.kind === 'agent_authorization');
		expect(otherRule?.path).not.toBe(rule?.path);
		expect(other.layout.agentUnitPrefix).not.toBe(layout.agentUnitPrefix);
		// The decisive one: B's rule must not authorize A's unit prefix, and vice versa.
		expect(otherRule?.body.includes(layout.agentUnitPrefix)).toBe(false);
		expect(rule?.body.includes(other.layout.agentUnitPrefix)).toBe(false);
	});
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * §4 The recorded decision
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the agent uid is per MUSEUM, and that choice is written down', () => {
	test('a turn does not run as the daemon, on any instance', () => {
		for (const instance of ['museum-a', 'museum-b', 'x-y-z']) {
			const { layout } = render({ instance });
			expect(layout.identity.agentUser).not.toBe(layout.identity.user);
			expect(layout.identity.agentUser).toBe(`${AGENT_USER_PREFIX}${instance}`);
			// The unix ceiling, on the longest name the grammar admits — the arithmetic that
			// fails at `useradd` on a museum's host if it is wrong, not here.
			expect(layout.identity.agentUser.length).toBeLessThanOrEqual(32);
			expect(layout.agentUnitPrefix.startsWith(`${USER_PREFIX}${instance}`)).toBe(true);
		}
	});

	test('two museums never share one agent uid', () => {
		expect(render({ instance: 'museum-a' }).layout.identity.agentUser).not.toBe(
			render({ instance: 'museum-b' }).layout.identity.agentUser,
		);
	});

	test('two SITES of one museum DO share one — the acceptance, asserted as made', () => {
		// This is the row's named decision, held in the direction it was decided. A per-site
		// pool would make this assertion fail, which is exactly right: the pool is the
		// replacement, and swapping it in must be a deliberate edit here and in the recorded
		// acceptance below, not a quiet change of shape.
		const doc = JSON.parse(readFileSync(DECLARATION, 'utf8')) as Record<string, unknown>;
		const sites = doc.sites as Array<Record<string, unknown>>;
		expect(sites.length).toBeGreaterThan(1);
		const { layout } = render();
		expect(layout.sites.length).toBe(sites.length);
		expect(new Set(layout.sites.map(() => layout.identity.agentUser)).size).toBe(1);
	});

	test('the acceptance is written beside the derivation, with its expiry condition', () => {
		const source = readFileSync(join(SOURCE_ROOT, 'provision/layout.ts'), 'utf8');
		// Not prose-matching for its own sake: the row's requirement was that the boundary this
		// design does NOT draw is stated where the naming is decided, so a reader of the layout
		// cannot mistake "sites share a uid" for an oversight. Three things must be in it: the
		// choice, what it does not protect, and what would end it.
		expect(source).toContain('THE RECORDED DECISION — ONE AGENT UID PER MUSEUM, NOT ONE PER SITE');
		expect(source).toContain('WHAT IS NOT DRAWN, AND IS ACCEPTED');
		expect(source).toContain('WHAT WOULD CHANGE IT');
		expect(source).toContain('limits.max_sites');
	});
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * §5 A provisioned host is confined by construction
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the rendered env leaves the daemon no unconfined mode to fall into', () => {
	const { layout, artifacts } = render();

	test('it states the mode and both halves of the identity', () => {
		const env = artifacts.find((artifact) => artifact.kind === 'env');
		const body = env?.body ?? '';
		expect(body).toContain('AGENT_CONFINEMENT="systemd_scope"');
		expect(body).toContain(`AGENT_USER="${layout.identity.agentUser}"`);
		expect(body).toContain(`AGENT_UNIT_PREFIX="${layout.agentUnitPrefix}"`);
		// And it still carries no credential — the property that lets this file be readable by
		// the service user's group at all.
		expect(body).not.toMatch(/^SERVICE_TOKEN=/m);
		expect(body).not.toMatch(/^ANTHROPIC_API_KEY=/m);
	});

	test('the shared trees are group-writable and setgid, so two uids can work in them', () => {
		// The ownership half of the second identity. Without the group write bit the agent
		// cannot write its own workspace and every turn fails; without setgid its files land in
		// the agent's own group and the daemon's commit reads a tree it half-owns; with the
		// world bits open, one museum's unpublished drafts are readable by every uid on the
		// host, which is the boundary this subsystem exists to draw.
		for (const key of ['workspaces', 'home'] as const) {
			const row = MODES[key];
			expect({ key, owner: row.owner, group: row.group }).toEqual({
				key,
				owner: 'user',
				group: 'group',
			});
			expect({ key, setgid: (row.mode & 0o2000) !== 0 }).toEqual({ key, setgid: true });
			expect({ key, groupWrite: (row.mode & 0o020) !== 0 }).toEqual({ key, groupWrite: true });
			expect({ key, world: row.mode & 0o007 }).toEqual({ key, world: 0 });
		}
		// The root ABOVE them is still root's: the daemon writes inside its roots and cannot
		// replace one, and neither can its agent.
		expect(MODES.stateDir.owner).toBe('root');
		// The credential store is unreachable to both of them through the filesystem.
		expect({ owner: MODES.secret.owner, mode: MODES.secret.mode }).toEqual({
			owner: 'root',
			mode: 0o600,
		});
	});

	test('the committed example carries the rendered rule, so a reviewer sees the grant', () => {
		// The examples are the third corner (`tests/provision_examples.test.ts`): a rule that
		// existed only in a renderer would be a host permission nobody ever read.
		const committed = join(
			PACKAGE,
			'deploy/examples/rendered/etc/polkit-1/rules.d',
			`49-${USER_PREFIX}${manifestFrom().instance}-agent.rules`,
		);
		expect(statSync(committed).isFile()).toBe(true);
		expect(readFileSync(committed, 'utf8')).toContain('org.freedesktop.systemd1.manage-units');
	});
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * §6 The other door — a build step is agent-authored text too
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * WHO MAY REACH THE UNCONFINED RUNNER.
 *
 * The turn was confined and the BUILD was not, and that made the build a WIDER principal
 * than the turn: `site.json` sits inside the workspace a turn writes, `bun install` executes
 * the lifecycle scripts of a `package.json` a turn authored, and `git add` runs the filters
 * of a `.git` a turn can replace — every one of them as the SERVICE user, the uid that owns
 * the workspaces, the audit trail and the credential directory the museum's bearer is read
 * from. The fix is a door (`util/spawn.ts` refuses a workspace cwd without the confinement's
 * token) and this is its import-side census: only the confinement and the version probes may
 * name the runner at all.
 */
const RUNNER_IMPORTERS: Readonly<Record<string, string>> = Object.freeze({
	'drivers/confinement.ts':
		'the holder of the token: runConfined() wraps the argv under the agent uid first, and is ' +
		'the only way a command runs inside a site workspace.',
	'drivers/claude_code.ts':
		'the driver VERSION PROBE — a pinned binary run with --version, outside every workspace.',
	'drivers/opencode.ts':
		'the driver VERSION PROBE — the same shape as claude_code above: a pinned binary asked ' +
		'for its version, with no cwd and nothing agent-authored anywhere near it.',
	'drivers/pi.ts':
		'the driver VERSION PROBE — the same shape again, on the driver that refuses to run a ' +
		'turn at all until it is implemented.',
});

/** Every file under a tree that imports the unconfined runner, derived from the tree. */
function runnerImporters(files: readonly string[], root: string): string[] {
	const found: string[] = [];
	for (const path of files) {
		const source = readFileSync(path, 'utf8');
		if (/from '(?:\.\.?\/)+util\/spawn'/.test(source)) found.push(relative(root, path));
	}
	return found.sort();
}

describe('a build step, an install script and a git hook run as the agent, never as the daemon', () => {
	const files = siteBuilderDaemonFiles();
	const importers = runnerImporters(files, SOURCE_ROOT);

	test('the corpus is the tree, and the runner really is imported somewhere', () => {
		expect(files.length).toBeGreaterThan(40);
		expect(importers.length).toBeGreaterThan(3);
	});

	test('only the confinement and the version probes reach the unconfined runner', () => {
		expect(importers).toEqual(Object.keys(RUNNER_IMPORTERS).sort());
		// The two modules whose commands run over agent-authored bytes must NOT be among
		// them — this is the exact shape the refutation reproduced.
		expect(importers).not.toContain('build/builder.ts');
		expect(importers).not.toContain('sites/git.ts');
		for (const [file, reason] of Object.entries(RUNNER_IMPORTERS)) {
			expect({ file, stated: reason.length > 60 }).toEqual({ file, stated: true });
		}
	});

	test('the two modules that execute agent-authored commands go through the confinement', () => {
		for (const file of ['build/builder.ts', 'sites/git.ts']) {
			const source = readFileSync(join(SOURCE_ROOT, file), 'utf8');
			expect({ file, confined: /runConfined\(/.test(source) }).toEqual({ file, confined: true });
		}
		// And the door is a REFUSAL, not a convention: the runner itself stops a spawn whose
		// cwd is inside the workspaces root. (Its behaviour — the refusal, the resolved-path
		// question, the one key that opens it — is the package's own gate.)
		const runner = readFileSync(join(SOURCE_ROOT, 'util/spawn.ts'), 'utf8');
		expect(runner).toContain('CONFINED_ARGV');
		expect(runner).toContain('config.SITES_ROOT');
	});

	test('the scanner really finds an importer — a planted one is reported', () => {
		const dir = mkdtempSync(join(tmpdir(), 'agent-confinement-runner-'));
		const planted: string[] = [];
		plant(
			planted,
			join(dir, 'rogue.ts'),
			"import { runBinary } from '../util/spawn';\nrunBinary(['sh'], { timeoutMs: 1 });\n",
		);
		plant(
			planted,
			join(dir, 'quiet.ts'),
			"import { join } from 'node:path';\nexport const x = join;\n",
		);
		expect(runnerImporters(planted, dir)).toEqual(['rogue.ts']);
	});
});

/* ────────────────────────────────────────────────────────────────────────────────────
 * §7 The tree the two uids share
 * ──────────────────────────────────────────────────────────────────────────────────── */

describe('the shared tree is writable to the agent, and the daemon’s own state is not', () => {
	test('the provisioned roots and the RUNTIME workspaces state one mode, not two', () => {
		// The half the second identity was missing: `MODES.workspaces` opened the ROOT, while
		// each site directory under it was created at runtime with the daemon's own umask
		// (0027) — drwxr-x---, agent in the group and never the owner. Every turn would have
		// started, been authorized, and failed on its first Write. One constant, both places.
		expect(MODES.workspaces.mode).toBe(SHARED_DIR_MODE);
		expect(MODES.home.mode).toBe(SHARED_DIR_MODE);
		expect(SHARED_DIR_MODE & 0o2000).toBe(0o2000); // setgid: agent files keep the museum's group
		expect(SHARED_DIR_MODE & 0o070).toBe(0o070); // group rwx: the other uid may write
		expect(SHARED_DIR_MODE & 0o007).toBe(0); // world: another museum sees nothing
		expect(SHARED_FILE_MODE & 0o060).toBe(0o060); // group rw: the agent EDITS site.json
		expect(SHARED_FILE_MODE & 0o007).toBe(0);
		// And the daemon's own per-site state inside that tree is not shared.
		expect(PRIVATE_DIR_MODE & 0o077).toBe(0);
	});

	test('the audit trail is closed to the group the agent uid is in', () => {
		// `ProtectSystem=strict` makes the audit root read-only to a turn; read-only is not
		// unreadable, and the agent's PRIMARY group is this museum's group. A 0640 trail was
		// therefore every actor row of the instance, readable to text a language model wrote.
		expect(MODES.auditFile.mode & 0o077).toBe(0);
		expect(MODES.auditFile.owner).toBe('user');
		expect(MODES.auditDir.owner).toBe('root');
		// The credential store, for the same reason, in the same direction.
		expect(MODES.secret.mode & 0o077).toBe(0);
		expect(MODES.secretsDir.mode & 0o077).toBe(0);
	});
});

/**
 * WHO STILL MUTATES THE FILESYSTEM BY PATH — the census, TOTAL over `src/`.
 *
 * Two defects, one wiring. `mkdir(dir, {recursive:true})` and `writeFile(path, body)` take
 * the daemon's umask (0027 on a provisioned host), so a module that reaches for them writes
 * a site directory the agent uid cannot enter and a `site.json` it cannot edit. And a
 * path-based write FOLLOWS LINKS: `confinedPath` is lexical, so a link planted where the
 * daemon writes redirects the daemon's own uid out of the tree.
 *
 * THE SCOPE IS THE WHOLE TREE, AND THE QUESTION IS THE DESTINATION. The first version of
 * this census scoped itself to `sites/`, `context/` and `build/` — the directories the fix
 * had touched — which is exactly the shape of a census that answers about itself: measured
 * afterwards, `sites/git.ts` (the `.git/info/exclude` rewritten on EVERY commit), BOTH
 * drivers' MCP configs (which carry the museum's Publication API key) and `sessions/store.ts`
 * (every event of every turn) were all still path-based, and three of the four were not even
 * scanned. So every `.ts` file under `src/` is scanned.
 *
 * AND THE SPELLING IS NOT THE SUBJECT EITHER. The second version required the `(` to follow
 * the bare name, so every `*Sync` variant, `Bun.write(` and `createWriteStream(` were
 * invisible — measured: a planted `src/zz_probe.ts` doing `mkdirSync(<workspace>, {recursive:
 * true})` + `writeFileSync(<workspace>/y.txt, body)` passed this census GREEN, and
 * `sites/webspace.ts` had been writing with `writeFileSync` all along, neither found nor
 * exempted. The name is matched with an optional `Sync`, plus `open`/`openSync` (an
 * `O_CREAT` open is a write), `Bun.write` and `createWriteStream`.
 *
 * AN EXEMPTION MUST SAY WHY A PLANTED LINK AT ITS DESTINATION CANNOT REDIRECT IT, and there
 * are only two honest answers: the destination is OUTSIDE `SITES_ROOT` and outside every
 * workspace, or the call REFUSES a planted name by construction (`O_EXCL|O_NOFOLLOW`, or
 * `symlink(2)`, which creates a link and never writes through one). Never "its modes are
 * someone else's business".
 */
const RAW_FS_WRITE =
	/(?:\bBun\.write\s*\(|\bcreateWriteStream\s*\(|(?<![.\w])(?:mkdir|writeFile|appendFile|copyFile|cp|chmod|rename|symlink|link|open)(?:Sync)?\s*\()/;

const RAW_FS_EXEMPT: Readonly<Record<string, string>> = Object.freeze({
	'audit.ts':
		'The actor trail under `AUDIT_DIR` — a PROVISIONED root outside `SITES_ROOT`, owned by ' +
		'the service user, 0700 with a 0600 file, and named by no path an agent turn can write ' +
		'in. `ProtectSystem=strict` makes it read-only to a turn on top of that.',
	'drivers/confinement.ts':
		"The per-turn environment file, in the DAEMON'S RUNTIME DIRECTORY (`RuntimeDirectory=`, " +
		'0700, root-created, outside `SITES_ROOT`). It is written there precisely BECAUSE the ' +
		'workspace is agent-writable — putting the museum keys in the tree is the defect it avoids.',
	'provision/apply.ts':
		'THE PROVISIONER, which runs as root before an agent uid exists and CREATES the roots ' +
		'the rest of this census is measured against. Its writes are an interface (`mkdir`, ' +
		'`writeFile`, `symlink`, `chmod` on the fs driver) over paths it derives from the ' +
		'declaration, never from a workspace.',
	'provision/adopt.ts':
		'The same provisioner, taking an already-installed tree into the layout: a `rename` of ' +
		'root-owned provisioned paths outside `SITES_ROOT`, before any turn can run.',
	'context/agents_md.ts':
		"`symlink('AGENTS.md', CLAUDE.md)` — CREATING a link, which never writes THROUGH one: " +
		"symlink(2) does not follow its final component and fails EEXIST. The file's content is " +
		'written by `writeFileShared`, which is the leg below.',
	'sites/template.ts':
		"`cp` copies a whole template tree, carrying the TEMPLATE's modes; the modes are then " +
		'restated over the result by applySharedModes(), which is the only way to catch what ' +
		'another program created.',
	'build/promote.ts':
		'The release store and the served surface, which are PROVISIONED webspace under ' +
		'`WEBSPACE_BASE` — outside `SITES_ROOT`, never a directory an agent turn can write, ' +
		'and moded by the provisioner rather than by this module.',
	'sites/webspace.ts':
		'The per-build write probe, inside the PROVISIONED webspace under `WEBSPACE_BASE` — ' +
		'outside `SITES_ROOT` and outside every workspace, created by the provisioner and ' +
		'read-only to a turn under `ProtectSystem=strict`.',
	'index.ts':
		'`chmodSync` on the LISTEN SOCKET this process just bound, in the daemon runtime ' +
		'directory outside `SITES_ROOT`; the other match is the `open()` handler of a ' +
		'`Bun.connect` socket, which is not a filesystem call at all.',
	'instance/roots.ts':
		'The BOOT PREFLIGHT probes. The audit append is `AUDIT_DIR`, outside `SITES_ROOT`; ' +
		'the create probe DOES land at the root of `SITES_ROOT`/`AGENT_HOME`, which is 2770, ' +
		'so it is opened `O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW` — an existing name of any kind, ' +
		'symlink included, is EEXIST rather than a redirect. It is the synchronous ' +
		'counterpart of the doors, in the one place that cannot await them.',
});

/**
 * The exemptions whose stated reason is the SECOND kind — "refused by construction" rather
 * than "outside the tree". A claim like that is checkable, so it is checked: the file must
 * really contain the guard it names.
 */
const REFUSAL_BY_CONSTRUCTION: Readonly<Record<string, string>> = Object.freeze({
	'instance/roots.ts': 'O_EXCL',
	'context/agents_md.ts': 'symlink(',
});

/**
 * The one module every daemon-side write into an agent-writable tree goes through. It is
 * excluded from the census because it IS the answer to it — and it is held to a stricter
 * rule of its own, three legs below.
 */
const THE_WRITER = 'util/shared_tree.ts';

/** Every file in the tree that mutates the filesystem by PATH rather than through the writer. */
function rawFsWriters(files: readonly string[], root: string): string[] {
	const found = new Set<string>();
	for (const path of files) {
		const file = relative(root, path);
		if (file === THE_WRITER) continue;
		for (const line of readFileSync(path, 'utf8').split('\n')) {
			const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '');
			if (RAW_FS_WRITE.test(code)) found.add(file);
		}
	}
	return [...found].sort();
}

describe('a site workspace is CREATED shared, not created and hoped over', () => {
	const writers = rawFsWriters(siteBuilderDaemonFiles(), SOURCE_ROOT);

	test('every path-based filesystem mutation in the daemon is enumerated', () => {
		// A floor on the scan itself: the census is derived from the tree, and a walk that
		// found nothing would satisfy `unexplained === []` without reading a line.
		expect(siteBuilderDaemonFiles().length).toBeGreaterThan(40);
		expect(writers.length).toBeGreaterThan(4);
		const unexplained = writers.filter((file) => !(file in RAW_FS_EXEMPT));
		expect(unexplained).toEqual([]);
		for (const [file, reason] of Object.entries(RAW_FS_EXEMPT)) {
			// Shrink-only in both directions: an exemption whose file stopped writing raw would
			// silently cover the next unstated mode added to it.
			expect({ file, live: writers.includes(file), stated: reason.length > 60 }).toEqual({
				file,
				live: true,
				stated: true,
			});
		}
		// And an exemption that claims to be REFUSED BY CONSTRUCTION rather than out of the
		// tree has to still hold the construction it names — the one kind of reason a scan
		// can check, so it is checked rather than read.
		for (const [file, guard] of Object.entries(REFUSAL_BY_CONSTRUCTION)) {
			// CODE, not prose: a comment that still describes the guard is exactly what a
			// removed guard leaves behind, and it must not answer for it.
			const code = readFileSync(join(SOURCE_ROOT, file), 'utf8')
				.split('\n')
				.map((line) => line.replace(/^\s*(\/\/|\*|\/\*).*$/, ''))
				.join('\n');
			expect({ file, guard, present: code.includes(guard) }).toEqual({
				file,
				guard,
				present: true,
			});
		}
	});

	test('the modules that build a workspace use the shared helpers', () => {
		// The positive side of the same rule, read off the three files that make a site: the
		// directory, the manifest and the agent's brief.
		for (const [file, helper] of [
			['sites/workspace.ts', 'mkdirShared'],
			['sites/manifest.ts', 'writeFileSharedAtomic'],
			['context/agents_md.ts', 'writeFileShared'],
			['sites/template.ts', 'applySharedModes'],
			// And the daemon's own per-build state, which lives INSIDE the tree the agent
			// writes: a record or a log written with a plain writeFile is a path the turn can
			// replace with a link (see the O_NOFOLLOW leg below).
			['build/builder.ts', 'writeFilePrivate'],
			['build/builder.ts', 'appendFilePrivate'],
			// The build record and the session meta are ATOMIC (tmp + rename, through the same
			// O_NOFOLLOW/hard-link/owner door): both are polled by a concurrent reader while
			// they are rewritten, and a truncate-in-place answers that poll with an empty file.
			['build/builder.ts', 'writeFilePrivateAtomic'],
			['sessions/store.ts', 'writeFilePrivateAtomic'],
			// THE FOUR THE FIRST REPAIR MISSED, each measured writing through a planted link
			// as the daemon before it was routed here (the behaviour is in the package gate):
			// the exclusion rewritten on every commit, both drivers' key-carrying MCP config,
			// and the session transcript.
			['sites/git.ts', 'writeFileSharedAtomic'],
			['sites/git.ts', 'mkdirShared'],
			['drivers/claude_code.ts', 'writeFileAgentReadable'],
			['drivers/opencode.ts', 'writeFileAgentReadable'],
			['sessions/store.ts', 'appendFilePrivate'],
			['sessions/store.ts', 'mkdirPrivate'],
		] as const) {
			const source = readFileSync(join(SOURCE_ROOT, file), 'utf8');
			// The CALL, not the mention: an import that survives while the call is deleted is
			// exactly the shape a mode fix regresses in.
			const called = new RegExp(`(?<![.\\w])${helper}\\s*\\(`).test(source);
			expect({ file, calls: helper, called }).toEqual({ file, calls: helper, called: true });
		}
	});

	/*
	 * THE PLANT THE OPEN TREE MADE POSSIBLE.
	 *
	 * 2770 is what lets a confined turn work; it also lets the turn drop a symlink where the
	 * DAEMON writes. Every path here is built by `confinedPath`, which is LEXICAL — it proves
	 * a spelling and knows nothing about the inode — so a path-based `writeFile`/`chmod`/
	 * `mkdir` follows the link and does the write as the daemon: the instance's own 0600
	 * audit trail truncated, refilled with agent-authored text and re-moded 0660.
	 *
	 * The refusal is BEHAVIOURAL (planted links at site.json.tmp, AGENTS.md, .builder and a
	 * build record, in publication/site_builder/tests/agent_confinement.test.ts). What is
	 * structural, and asserted here, is that the module cannot regress to a path-based write:
	 * the mode is set on a DESCRIPTOR, and every descriptor is opened O_NOFOLLOW.
	 */
	const PATH_BASED_MUTATION = /(?<![.\w])(?:chmod|writeFile|appendFile|mkdir)\s*\(/;

	/** Lines of a module that mutate the filesystem by PATH rather than through a handle. */
	function pathBasedMutations(source: string): string[] {
		const out: string[] = [];
		for (const line of source.split('\n')) {
			const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '');
			if (!PATH_BASED_MUTATION.test(code)) continue;
			// `mkdir(path)` with no mode and no recursion is the ONE allowed path call: it
			// creates a level that is then opened and moded through its descriptor, and it
			// fails EEXIST — it never follows anything.
			if (/(?<![.\w])mkdir\s*\(\s*path\s*\)/.test(code)) continue;
			out.push(code.trim());
		}
		return out;
	}

	test('the shared writers open descriptors, never paths — O_NOFOLLOW is the door', () => {
		const source = readFileSync(join(SOURCE_ROOT, 'util/shared_tree.ts'), 'utf8');
		// Every open in the module goes through the one wrapper, and the wrapper sets it.
		expect(source).toContain('flags | FS.O_NOFOLLOW');
		expect((source.match(/(?<![.\w])open\s*\(/g) ?? []).length).toBe(1);
		// The mode is stated on the HANDLE (fchmod), so the thing moded is the thing written.
		expect(source).toContain('handle.chmod(');
		// And nothing in it mutates a path directly, which is what followed a planted link.
		expect(pathBasedMutations(source)).toEqual([]);
		// A floor, so a module reduced to a stub cannot pass the three assertions above.
		expect(source.length).toBeGreaterThan(4000);

		// AND THE OPEN CARRIES NO `O_TRUNC`. Truncation at open time happens before any
		// question can be asked of the thing opened, so a hard-linked victim would already be
		// empty by the time its link count was read. The file is opened, interrogated, and
		// only then emptied — which is why the module holds `truncate(0)` and not O_TRUNC.
		expect(source).not.toContain('FS.O_TRUNC');
		expect(source).toContain('stats.nlink > 1');
		expect(source).toContain('PlantedHardLinkError');
		expect(source).toContain('handle.truncate(0)');

		// AND THE INODE IS ASKED WHOSE IT IS. `O_NOFOLLOW` proves the NAME was not a link and
		// `nlink` proves there is no second name; neither says who owns it. The agent uid can
		// unlink a file in a 2770 workspace and author its own in its place, and a write into
		// that inode lands the museum's Publication API key in a file whose mode the agent
		// chose — the closing `fchmod` fails EPERM only AFTER the bytes are on disk.
		// ONE PER DOOR — the write door (through `assertOwnInode`) and the read door. A single
		// occurrence would mean one of the two stopped asking, which is how the read half of
		// this module was missing in the first place. The refusals themselves are behavioural
		// (`tests/agent_confinement.test.ts` moves `process.getuid`, since one suite cannot be
		// two uids).
		expect((source.match(/stats\.uid !== process\.getuid/g) ?? []).length).toBe(2);
		expect(source).toContain('ForeignOwnerError');

		// AND THE READ DIRECTION EXISTS AT ALL, which is what made the write-only version of
		// this module a half-repair: the same chain walk, refusing a link, a second name and
		// a foreign inode, so the daemon cannot be pointed at its own secrets and asked to
		// serve them back through the API.
		for (const door of ['readFileShared', 'readFilePrivate', 'readdirShared']) {
			expect({ door, exported: source.includes(`export async function ${door}(`) }).toEqual({
				door,
				exported: true,
			});
		}
		// The daemon's own polled state is written atomically: a truncate-then-write through
		// one descriptor lets a concurrent reader see an empty file, and a death inside that
		// window makes the emptiness permanent.
		expect(source).toContain('export async function writeFilePrivateAtomic(');
	});

	test('the path-based scanner really finds one — a planted regression is reported', () => {
		// The positive control for the leg above: without it, `pathBasedMutations` returning
		// [] would be satisfied by a regex that matches nothing.
		expect(pathBasedMutations('await chmod(target, 0o660);')).toEqual([
			'await chmod(target, 0o660);',
		]);
		expect(pathBasedMutations('await writeFile(path, body);')).toEqual([
			'await writeFile(path, body);',
		]);
		// …and does not report the two shapes the module legitimately holds.
		expect(pathBasedMutations('await mkdir(path);')).toEqual([]);
		expect(pathBasedMutations('// writeFile(path, body) is what this replaces.')).toEqual([]);
		expect(pathBasedMutations('await handle.chmod(mode);')).toEqual([]);
	});

	test('the scanner really finds a raw write — a planted one is reported', () => {
		const dir = mkdtempSync(join(tmpdir(), 'agent-confinement-fs-'));
		const planted: string[] = [];
		const sites = join(dir, 'sites');
		mkdirSync(sites);
		plant(planted, join(sites, 'rogue.ts'), 'await mkdir(dir, { recursive: true });\n');
		plant(planted, join(sites, 'quiet.ts'), 'await mkdirShared(dir);\n');
		plant(
			planted,
			join(sites, 'prose.ts'),
			'// mkdir(dir) is what this replaces.\nexport const x = 1;\n',
		);
		// A member call is a different thing (`io.mkdir`), like RegExp.exec in the spawn census.
		plant(planted, join(sites, 'member.ts'), 'await io.mkdir(dir);\n');
		plant(planted, join(dir, 'top_level.ts'), 'await symlink(a, b);\n');
		// AND THE SPELLING IS NOT A HIDING PLACE. Each of these passed the census green while
		// the `(` had to follow the bare name — the middle one is the exact planted probe
		// (`mkdirSync` + `writeFileSync` straight into a workspace) that was measured GREEN.
		plant(planted, join(sites, 'sync.ts'), 'mkdirSync(p, { recursive: true });\n');
		plant(planted, join(sites, 'sync_write.ts'), 'writeFileSync(join(p, "y.txt"), body);\n');
		plant(planted, join(sites, 'bun_write.ts'), 'await Bun.write(p, body);\n');
		plant(planted, join(sites, 'stream.ts'), 'createWriteStream(p).end(body);\n');
		plant(planted, join(sites, 'open_sync.ts'), "openSync(p, 'w');\n");
		// TOTAL over the tree, not over a directory list: the top-level file is reported too,
		// which is the half the first version of this census could not see.
		expect(rawFsWriters(planted, dir)).toEqual([
			'sites/bun_write.ts',
			'sites/open_sync.ts',
			'sites/rogue.ts',
			'sites/stream.ts',
			'sites/sync.ts',
			'sites/sync_write.ts',
			'top_level.ts',
		]);
	});
});

/**
 * WHO STILL READS A PATH'S CONTENT — the census in the OTHER direction.
 *
 * A confused deputy has two directions, and the first repair closed one. `readFile` on a
 * lexical `confinedPath` follows a planted link exactly as `writeFile` did, and the daemon
 * then hands the bytes to the museum's own API. MEASURED on this package's own fixture, with
 * agent-uid actions only: `rm -rf .builder; mkdir -p .builder/builds; echo '{"id":"b1",…}' >
 * b1.json; ln -s <the daemon's service env> b1.log` made `getBuildLog` return
 * `SERVICE_TOKEN=…` and `GET /sites/<slug>/builds/b1` serve it as `{...record, log}` — which
 * is PUB-01's stated impact ("read the daemon's SERVICE_TOKEN / .env / the actor audit log")
 * reproducing THROUGH the fix for PUB-01. `getBuild`, `readManifest`, `replayEvents`,
 * `readMeta` and `listSessions` were the same shape.
 *
 * So the same rule, the same scope: every `.ts` file under `src/`, and an exemption states
 * that what it reads is outside `SITES_ROOT` and every workspace. DIRECTORY LISTINGS are not
 * in this regex and that is deliberate — a `readdir` yields NAMES, not content, and every
 * file a name leads to is opened through the doors above; `readdirShared` proves the chain
 * anyway, which is the stronger statement, and the honest limit is that a bare `readdir` of
 * a trusted root is not a finding here.
 */
const RAW_FS_READ = /(?:\bBun\.file\s*\(|\bcreateReadStream\s*\(|(?<![.\w])readFile(?:Sync)?\s*\()/;

const RAW_READ_EXEMPT: Readonly<Record<string, string>> = Object.freeze({
	'audit.ts':
		'The actor trail under `AUDIT_DIR` — a PROVISIONED root outside `SITES_ROOT`, 0700 ' +
		'with a 0600 file, named by no path an agent turn can write in.',
	'config.ts':
		'The instance `.env` and `$CREDENTIALS_DIRECTORY`, read at boot from roots the ' +
		'provisioner owns OUTSIDE `SITES_ROOT`. These are the very secrets the read plant was ' +
		'after; nothing here reads a path derived from a slug.',
	'instance/roots.ts':
		'The `.dedalo_site_instance` MARKER at the root of each provisioned root. `SITES_ROOT` ' +
		'is 2770, so this one is inside a directory the agent may write — and its content ' +
		'never leaves the process: it is compared to a constant instance name and the answer ' +
		'is boot or refuse-to-boot. A turn can already deny that by unlinking the marker.',
	'provision/apply.ts':
		'THE PROVISIONER, run as root before an agent uid exists, reading its own declaration ' +
		'and the root-owned paths it is about to create. Nothing it reads is under a workspace.',
	'provision/adopt.ts':
		'The same provisioner taking an installed tree into the layout: root-owned provisioned ' +
		'paths outside `SITES_ROOT`, before any turn can run.',
	'provision/fleet.ts':
		'The fleet index of instance declarations under the provisioner config root, outside ' +
		'`SITES_ROOT` and root-owned.',
	'sites/site_table.ts':
		"The provisioner's `sites.json` under the config directory (root:root 0644) — outside " +
		'`SITES_ROOT`, and the ONE thing that says where a site may be published.',
	'sites/template.ts':
		'The TEMPLATE catalogue under `TEMPLATES_DIR` — a repo-owned, read-only tree outside ' +
		'`SITES_ROOT`. The one read INSIDE a workspace (the placeholder rewrite) goes through ' +
		'`readFileShared`, which is the required-call leg below.',
});

/** Every file that reads a path's CONTENT rather than reading through the shared door. */
function rawFsReaders(files: readonly string[], root: string): string[] {
	const found = new Set<string>();
	for (const path of files) {
		const file = relative(root, path);
		if (file === THE_WRITER) continue;
		for (const line of readFileSync(path, 'utf8').split('\n')) {
			const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '');
			if (RAW_FS_READ.test(code)) found.add(file);
		}
	}
	return [...found].sort();
}

describe('what the daemon reads back out of an agent-writable tree is proved, not trusted', () => {
	const readers = rawFsReaders(siteBuilderDaemonFiles(), SOURCE_ROOT);

	test('every path-based content read in the daemon is enumerated', () => {
		expect(siteBuilderDaemonFiles().length).toBeGreaterThan(40);
		expect(readers.length).toBeGreaterThan(4);
		const unexplained = readers.filter((file) => !(file in RAW_READ_EXEMPT));
		expect(unexplained).toEqual([]);
		for (const [file, reason] of Object.entries(RAW_READ_EXEMPT)) {
			expect({ file, live: readers.includes(file), stated: reason.length > 60 }).toEqual({
				file,
				live: true,
				stated: true,
			});
		}
	});

	test('the doors that serve a tree back to the museum read through the shared helpers', () => {
		// Each of these was measured serving a planted link's target before it was routed
		// here; the behaviour is `publication/site_builder/tests/agent_confinement.test.ts`.
		for (const [file, helper] of [
			['build/builder.ts', 'readFilePrivate'], // the build record AND the build log
			['build/builder.ts', 'readdirShared'], // latestBuild's listing of `.builder/builds`
			['sessions/store.ts', 'readFilePrivate'], // the transcript and the meta sidecar
			['sessions/store.ts', 'readdirShared'], // the session index
			['sites/manifest.ts', 'readFileShared'], // site.json, which the agent may rewrite
			['sites/template.ts', 'readFileShared'], // the placeholder rewrite, inside the workspace
		] as const) {
			const source = readFileSync(join(SOURCE_ROOT, file), 'utf8');
			const called = new RegExp(`(?<![.\\w])${helper}\\s*\\(`).test(source);
			expect({ file, calls: helper, called }).toEqual({ file, calls: helper, called: true });
		}
	});

	test('the read scanner really finds one — a planted read is reported', () => {
		const dir = mkdtempSync(join(tmpdir(), 'agent-confinement-read-'));
		const planted: string[] = [];
		const sites = join(dir, 'sites');
		mkdirSync(sites);
		plant(planted, join(sites, 'rogue.ts'), "const t = await readFile(p, 'utf8');\n");
		plant(planted, join(sites, 'sync.ts'), "const t = readFileSync(p, 'utf8');\n");
		plant(planted, join(sites, 'bun.ts'), 'const t = await Bun.file(p).text();\n');
		plant(planted, join(sites, 'quiet.ts'), 'const t = await readFilePrivate(root, rel);\n');
		plant(
			planted,
			join(sites, 'prose.ts'),
			'// readFile(p) is what this replaces.\nexport const x = 1;\n',
		);
		plant(planted, join(sites, 'member.ts'), 'const t = await handle.readFile(p);\n');
		plant(planted, join(dir, 'top_level.ts'), "const t = readFileSync(p, 'utf8');\n");
		expect(rawFsReaders(planted, dir)).toEqual([
			'sites/bun.ts',
			'sites/rogue.ts',
			'sites/sync.ts',
			'top_level.ts',
		]);
	});
});
