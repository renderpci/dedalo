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
 *      museum's transient-unit prefix, `manage-units`, STOP and KILL — and never START (F2:
 *      polkit sees no run-as uid for a transient start, so a start grant was root), with
 *      the daemon's confined runs refused off that same verb list until LEAD-1b.
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
 *   §8 THE EGRESS. Every door (turn / build / git) renders a PRIVATE network namespace, a
 *      masked `/run` and `IPAddressDeny=any`; the only reachable path is the door's own
 *      per-run `/run/dedalo-egress` sockets (none on git) — asked beside a CONCURRENT turn
 *      of the same uid, whose sockets are one `/proc/<pid>/root` away unless the door has
 *      its own PID namespace, and of the host's IPC namespace. Evaluated with a model of systemd
 *      whose filter is ALLOW-WINS — and whose control row, the pre-fix shape
 *      (`IPAddressAllow=any localhost` + a deny list), must come out UNSAFE, or the model is
 *      the longest-prefix misreading that made LEAD-1 look closed. Egress plans are
 *      hostname-only. HONEST LIMIT: the kernel's behaviour is proved by the VM probe, not here.
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
	MAX_INSTANCE_LENGTH,
	MODES,
	USER_PREFIX,
} from '../../publication/site_builder/src/provision/layout.ts';
import {
	AGENT_UNIT_VERBS,
	TRANSIENT_START_AUTHORIZED,
} from '../../publication/site_builder/src/provision/render/agent_authorization.ts';
import { renderAll } from '../../publication/site_builder/src/provision/render/index.ts';
import { parseManifest } from '../../publication/site_builder/src/provision/schema.ts';
import {
	PRIVATE_DIR_MODE,
	SHARED_DIR_MODE,
	SHARED_FILE_MODE,
} from '../../publication/site_builder/src/util/shared_tree.ts';
import {
	allowsFamily,
	canEnumerateInterfaces,
	type Destination,
	describeDestination,
	parseProperties,
	reach,
} from '../../publication/site_builder/tests/support/systemd_reach.ts';
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
		"issued through the polkit rule's stop grant (the rule grants no start — F2), because killing the client that " +
		'waits on a unit does not stop the unit — and `id -u/-G <AGENT_USER>`, a pinned ' +
		'root-owned binary asked which uid and groups the agent has, so the trust check can ask ' +
		'whether the AGENT can change what its own unit executes first. Neither runs anything ' +
		'agent-authored.',
	'util/spawn.ts':
		'runBinary — the ONE place a process is created, and the door itself. It REFUSES a cwd ' +
		'inside SITES_ROOT without the confinement token (`CONFINED_ARGV`), so a build step, an ' +
		'install script and a `git add` all reach it through runConfined() under the agent uid; ' +
		'what is left unconfined here is the driver VERSION PROBE, a pinned root-owned binary ' +
		'run with --version outside every workspace. §6 holds the import side of that rule.',
	'drivers/egress_shim.ts':
		"in-unit exec of the already-confined argv: the shim IS the transient unit's ExecStart, " +
		'so its one child_process spawn runs inside the unit PID 1 already started under the ' +
		'agent uid, in its private network namespace — after it has refused a namespace that ' +
		'is not in effect (§8). It widens nothing the unit did not already grant.',
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

	test('it grants THIS museum’s service user THIS museum’s agent units, STOP and KILL only', () => {
		const body = rule?.body ?? '';
		expect(body).toContain('org.freedesktop.systemd1.manage-units');
		expect(body).toContain(`subject.user !== "${layout.identity.user}"`);
		expect(body).toContain(`unit.indexOf("${layout.agentUnitPrefix}") !== 0`);
		expect(body).toContain('".service"');
		// The ENTIRE set of verbs answered YES, read off the rendered array — not a substring hunt
		// a comment could satisfy.
		const allowed = /var allowed = \[([^\]]*)\];/.exec(body)?.[1];
		expect(allowed).toBe('"stop", "kill"');
		// F2. polkit is handed a transient unit's NAME and VERB, never the uid it runs as, so a
		// "start" grant on `<prefix>*.service` let the service user `systemd-run
		// --unit=<prefix>x.service --uid=root` on systemd >= 257: root-equivalent. No verb that
		// creates or starts a unit may appear in the rule at all — code or comment.
		for (const verb of [
			'"start"',
			'"restart"',
			'"reload-or-restart"',
			'"enable"',
			'"reload-daemon"',
			'"mask"',
		]) {
			expect({ verb, present: body.includes(verb) }).toEqual({ verb, present: false });
		}
		// Everything unmatched falls through, so this file can only ADD the permission it
		// names — it can never widen or revoke another rule on the host.
		expect(body).toContain('polkit.Result.NOT_HANDLED');
		expect(body).toContain('polkit.Result.YES');
	});

	test('with no start granted, the daemon refuses confined runs — off the SAME verb list', () => {
		// The daemon's policy is a fact read off the rule's verbs, so the rule and the refusal
		// cannot disagree: put "start" back and both this leg and the one above are red.
		expect([...AGENT_UNIT_VERBS].sort()).toEqual(['kill', 'stop']);
		expect(TRANSIENT_START_AUTHORIZED).toBe(false);
		// The wiring, read from CODE (comments stripped). The behaviour — every confined door
		// answers 503 and spawns nothing — is publication/site_builder/tests/agent_confinement
		// .test.ts ("F2: …"); this gate cannot import the daemon's config (zod) by design.
		const code = readFileSync(join(SOURCE_ROOT, 'drivers/confinement.ts'), 'utf8')
			.split('\n')
			.map((line) => line.replace(/^\s*(\/\/|\*|\/\*).*$/, ''))
			.join('\n');
		expect(code).toContain('transientStartAuthorized: TRANSIENT_START_AUTHORIZED');
		expect(code).toContain(
			'if (!policy.transientStartAuthorized) problems.push(CONFINED_RUNS_DISABLED)',
		);
		expect(code).toContain('LEAD-1b');
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
		'workspace is agent-writable — putting the museum keys in the tree is the defect it avoids. ' +
		'And PID 1 reads it AS ROOT following links, so it is opened O_CREAT|O_EXCL|O_NOFOLLOW into ' +
		'lstat-proved, daemon-owned, private directories (ENVFILE).',
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
	'egress/gate.ts':
		'runtime dir, outside SITES_ROOT: the per-run egress socket directory ' +
		'`<runtime>/egress/<run>/` (mkdir 0750 + chmod 0660 on the two sockets it binds) in ' +
		"the daemon's RuntimeDirectory, root-created and never a path an agent turn can write; " +
		'the unit sees it only through its own BindPaths onto /run/dedalo-egress.',
});

/**
 * The exemptions whose stated reason is the SECOND kind — "refused by construction" rather
 * than "outside the tree". A claim like that is checkable, so it is checked: the file must
 * really contain the guard it names.
 */
const REFUSAL_BY_CONSTRUCTION: Readonly<Record<string, string>> = Object.freeze({
	'instance/roots.ts': 'O_EXCL',
	'drivers/confinement.ts': 'FS.O_EXCL | FS.O_NOFOLLOW',
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

/* ────────────────────────────────────────────────────────────────────────────────────
 * §8 The egress
 * ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * WHAT A CONFINED RUN MAY REACH, asked of the unit properties rather than read off them.
 *
 * LEAD-1: the unit said `IPAddressAllow=any localhost` and then denied loopback and the
 * private ranges, under a header claiming "longest-prefix wins". systemd's filter is
 * ALLOW-WINS: an address matching an allow entry is granted whatever the deny list says,
 * so `any` granted Postgres, the engine, the LAN and the metadata service to text a
 * language model wrote. The repair is not a better list — it is a PRIVATE NETWORK
 * NAMESPACE per run, `/run` masked, and one per-run socket directory bound back in, through
 * which the daemon's egress gate speaks hostnames only.
 *
 * The leaf (`drivers/network_profile.ts`) is the ONE producer of every network property a
 * unit receives, and it is config-free so this gate can import it; the package gate
 * (`tests/agent_confinement.test.ts`) proves the real `confineTurn`/`runConfined` render
 * EXACTLY its list. It is imported dynamically so that its absence is this section's red,
 * not the whole file's.
 */

const LEAF = join(PACKAGE, 'src/drivers/network_profile.ts');
const SHIM = join(PACKAGE, 'src/drivers/egress_shim.ts');
const CLASSIFIER = join(PACKAGE, 'src/egress/public_address.ts');

interface NetworkLeaf {
	DOORS: readonly string[];
	DOOR_PROFILE: Readonly<Record<string, { proxy: boolean; mcp: boolean }>>;
	PROXY_PORT: number;
	MCP_PORT: number;
	unitNetworkProperties(door: string, opts: { egressDir?: string }): string[];
	egressPlanFor(
		door: string,
		facts: {
			driver?: string;
			providerHosts: string[];
			registryHosts: string[];
		},
	): { hosts: string[]; mcp: boolean };
	planProblems(
		door: string,
		facts: {
			driver?: string;
			providerHosts: string[];
			registryHosts: string[];
		},
	): string[];
	childEgressEnv(door: string, driver?: string): Record<string, string>;
	egressDirFor(runtimeDir: string, unitName: string): string;
}

async function leaf(): Promise<NetworkLeaf> {
	return (await import(LEAF)) as NetworkLeaf;
}

/** The host a provisioned museum runs on — the runtime dir is the rendered one. */
const RUNTIME = '/run/dedalo-sites/test';
const UNIT = 'dedalo-site-test-agent-00000000-0000-0000-0000-000000000000.service';
/** A CONCURRENT run's uuid — its egress dir is a sibling of this run's. */
const SIBLING_RUN = '11111111-1111-1111-1111-111111111111';
const SIBLING_UNIT = `dedalo-site-test-agent-${SIBLING_RUN}.service`;

/**
 * HOW EVERY ROW BELOW ASKS: with the namespace in effect, and beside a CONCURRENT TURN of the
 * same museum (the same agent uid) rendered by the same leaf. A run never runs alone on a
 * museum with more than one site, and the model knows the route a lone-unit question cannot
 * see: a same-uid unit's mount view — its bound egress directory — through
 * `/proc/<pid>/root`, unless the asking unit has its own PID namespace.
 */
function reachOptions(net: NetworkLeaf): { netnsHonoured: true; concurrent: string[][] } {
	const siblingTurn = net.unitNetworkProperties('turn', {
		egressDir: net.egressDirFor(RUNTIME, SIBLING_UNIT),
	});
	return { netnsHonoured: true, concurrent: [siblingTurn] };
}

/**
 * WHAT NO DOOR MAY REACH. Host loopback (Postgres, the DNS stub, IPv6 loopback), the LAN,
 * the cloud metadata service, the host's own public address, the public internet directly
 * (egress is the gate's job, by hostname), the engine's and the databases' sockets, this
 * daemon's own socket and per-turn secret files, the docker socket, and an ABSTRACT unix
 * socket (which no mount mask can hide — only a network namespace does).
 */
const FORBIDDEN: readonly Destination[] = Object.freeze([
	{ kind: 'inet', ip: '127.0.0.1', port: 5432 },
	{ kind: 'inet', ip: '127.0.0.1', port: 3306 },
	{ kind: 'inet', ip: '127.0.0.53', port: 53 },
	{ kind: 'inet', ip: '::1', port: 5432 },
	{ kind: 'inet', ip: '10.0.0.5', port: 22 },
	{ kind: 'inet', ip: '192.168.1.1', port: 80 },
	{ kind: 'inet', ip: '169.254.169.254', port: 80 },
	{ kind: 'inet', ip: '203.0.113.7', port: 22 },
	{ kind: 'inet', ip: '1.1.1.1', port: 443 },
	{ kind: 'inet', ip: '2606:4700:4700::1111', port: 443 },
	{ kind: 'unix', path: '/run/postgresql/.s.PGSQL.5432' },
	{ kind: 'unix', path: '/run/dedalo/dedalo_ts.sock' },
	{ kind: 'unix', path: `${RUNTIME}/daemon.sock` },
	{ kind: 'unix', path: `${RUNTIME}/turns/${UNIT}.env` },
	{ kind: 'unix', path: '/var/run/docker.sock' },
	{ kind: 'unix', path: '/run/mysqld/mysqld.sock' },
	// RHEL/Fedora MariaDB's DEFAULT socket: outside /run, /tmp and /home, mode 0777 — the
	// path-socket case the /run mask alone does not cover (a netns does not help: path
	// sockets ignore network namespaces).
	{ kind: 'unix', path: '/var/lib/mysql/mysql.sock' },
	{ kind: 'unix', path: '/var/lib/postgresql/.s.PGSQL.5432' },
	// ANOTHER run's per-run egress sockets. A build (no MCP) or a git run (nothing) that could
	// open a concurrent turn's mcp.sock would speak to the Publication API with the daemon's
	// key. TWO routes, both asked: a view of the whole egress/ directory (the bind), and the
	// concurrent turn's own mount view through /proc/<pid>/root (same uid, no PID namespace)
	// — the per-run bind is a run's identity only because the second is closed too.
	{ kind: 'unix', path: `${RUNTIME}/egress/${SIBLING_RUN}/proxy.sock` },
	{ kind: 'unix', path: `${RUNTIME}/egress/${SIBLING_RUN}/mcp.sock` },
	// The host's /dev/shm (tmpfs, mode 1777). PrivateDevices= builds a private /dev but binds
	// the HOST's /dev/shm back into it, and path sockets ignore network namespaces: without a
	// per-unit mask it is one world-writable directory every door of every museum shares.
	{ kind: 'unix', path: '/dev/shm/x.sock' },
	// A SysV IPC key (or POSIX message queue) in the HOST's IPC namespace — shared by every
	// unit without PrivateIPC=yes, any museum's, and the host: a rendezvous no path mask sees.
	{ kind: 'ipc', name: 'sysv:0x5a5a0001' },
	{ kind: 'abstract', name: 'lp' },
]);

/** The pre-fix unit shape, kept as the evaluator's control row. */
const HEAD_SHAPE: readonly string[] = Object.freeze([
	'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6',
	'IPAddressAllow=any localhost',
	'IPAddressDeny=localhost link-local multicast 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 169.254.0.0/16 fc00::/7 fe80::/10',
]);

function doorProps(net: NetworkLeaf, door: string): { props: string[]; egressDir: string | null } {
	const egressDir = net.DOOR_PROFILE[door]?.proxy ? net.egressDirFor(RUNTIME, UNIT) : null;
	const props = net.unitNetworkProperties(door, egressDir ? { egressDir } : {});
	return { props, egressDir };
}

describe('§8 a confined run reaches its own egress door and nothing else', () => {
	test('control: the evaluator is ALLOW-WINS — the pre-fix shape reaches host loopback', () => {
		// If this row ever reads "blocked", the model is the longest-prefix misreading and every
		// row below it would certify a wide-open unit.
		for (const dest of [
			{ kind: 'inet', ip: '127.0.0.1', port: 5432 },
			{ kind: 'inet', ip: '10.0.0.5', port: 22 },
			{ kind: 'inet', ip: '169.254.169.254', port: 80 },
			{ kind: 'unix', path: '/run/postgresql/.s.PGSQL.5432' },
			{ kind: 'abstract', name: 'lp' },
		] as const) {
			expect({
				dest: describeDestination(dest),
				reached: reach(HEAD_SHAPE, dest, { netnsHonoured: true }),
			}).toEqual({
				dest: describeDestination(dest),
				reached: true,
			});
		}
	});

	test('the doors are exactly turn, build and git, each with a stated profile', async () => {
		const net = await leaf();
		expect([...net.DOORS].sort()).toEqual(['build', 'git', 'turn']);
		expect(Object.keys(net.DOOR_PROFILE).sort()).toEqual([...net.DOORS].sort());
		expect(net.DOOR_PROFILE.turn).toEqual({ proxy: true, mcp: true });
		expect(net.DOOR_PROFILE.build).toEqual({ proxy: true, mcp: false });
		expect(net.DOOR_PROFILE.git).toEqual({ proxy: false, mcp: false });
		expect(net.PROXY_PORT).not.toBe(net.MCP_PORT);
	});

	test('every door: nothing forbidden is reachable, with the netns in effect', async () => {
		const net = await leaf();
		for (const door of net.DOORS) {
			const { props } = doorProps(net, door);
			const reached = FORBIDDEN.filter((dest) => reach(props, dest, reachOptions(net))).map(
				describeDestination,
			);
			expect({ door, reached }).toEqual({ door, reached: [] });
		}
	});

	test('every door: its own sockets, and only the ones its profile names, are reachable', async () => {
		const net = await leaf();
		for (const door of net.DOORS) {
			const { props, egressDir } = doorProps(net, door);
			const profile = net.DOOR_PROFILE[door] as { proxy: boolean; mcp: boolean };
			const sockets = egressDir
				? [join(egressDir, 'proxy.sock'), ...(profile.mcp ? [join(egressDir, 'mcp.sock')] : [])]
				: [];
			const reachable = sockets.filter((path) =>
				reach(props, { kind: 'unix', path }, { netnsHonoured: true }),
			);
			expect({ door, reachable }).toEqual({ door, reachable: sockets });
			// The shim's own loopback listeners, inside the unit's namespace — the BPF backstop
			// (IPAddressDeny=any) must not have closed the one door it forwards to.
			if (profile.proxy) {
				const lo = { kind: 'inet', ip: '127.0.0.1', port: net.PROXY_PORT, scope: 'unit' } as const;
				expect({ door, loopback: reach(props, lo, { netnsHonoured: true }) }).toEqual({
					door,
					loopback: true,
				});
			}
		}
		// Git talks to nothing: no bind, no proxy, no inet family (the per-door family rows
		// below hold AF_UNIX + the AF_NETLINK the shim's interface enumeration needs).
		const git = doorProps(net, 'git');
		expect(git.egressDir).toBeNull();
		expect(git.props.some((p) => p.startsWith('BindPaths='))).toBe(false);
		expect(
			reach(
				git.props,
				{ kind: 'inet', ip: '127.0.0.1', port: net.PROXY_PORT, scope: 'unit' },
				{ netnsHonoured: true },
			),
		).toBe(false);
	});

	test('every door: the backstop filter denies by default, and allows nothing but the unit loopback', async () => {
		const net = await leaf();
		for (const door of net.DOORS) {
			const { props } = doorProps(net, door);
			const map = parseProperties(props);
			expect({ door, deny: map.get('IPAddressDeny') }).toEqual({ door, deny: ['any'] });
			const allow = (map.get('IPAddressAllow') ?? []).join(' ').split(/\s+/).filter(Boolean);
			expect({ door, extraAllow: allow.filter((token) => token !== 'localhost') }).toEqual({
				door,
				extraAllow: [],
			});
			expect({ door, netns: map.get('PrivateNetwork') }).toEqual({ door, netns: ['yes'] });
		}
	});

	test('every door: its socket families, as outcomes — git has no inet family, and every door can enumerate its interfaces', async () => {
		// The families are what decides whether a door can open a TCP socket at all (git must
		// not) and whether the shim's first act works: getifaddrs(3) is an AF_NETLINK query,
		// and a unit denied it sees NO interface — which the shim refuses (exit 78) on every
		// run. Dropping AF_NETLINK from a door is a silent total outage, not a hardening.
		const net = await leaf();
		for (const door of net.DOORS) {
			const { props } = doorProps(net, door);
			const profile = net.DOOR_PROFILE[door] as { proxy: boolean; mcp: boolean };
			expect({ door, enumerate: canEnumerateInterfaces(props) }).toEqual({ door, enumerate: true });
			expect({ door, unix: allowsFamily(props, 'AF_UNIX') }).toEqual({ door, unix: true });
			// A proxy door needs inet for the shim's loopback listeners; git needs none.
			expect({
				door,
				inet: allowsFamily(props, 'AF_INET'),
				inet6: allowsFamily(props, 'AF_INET6'),
			}).toEqual({ door, inet: profile.proxy, inet6: profile.proxy });
		}
		// Control: the evaluator really denies an unlisted family.
		expect(canEnumerateInterfaces(['RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6'])).toBe(
			false,
		);
		expect(allowsFamily(['RestrictAddressFamilies=AF_UNIX AF_NETLINK'], 'AF_INET')).toBe(false);
		// Control: repeated assignments MERGE, as systemd merges them — an extra allow-list in
		// front of git's own is inet for git, however the last line reads.
		const merged = (lines: string[], family: 'AF_UNIX' | 'AF_INET') =>
			allowsFamily(
				lines.map((line) => `RestrictAddressFamilies=${line}`),
				family,
			);
		expect(merged(['AF_INET', 'AF_UNIX'], 'AF_INET')).toBe(true);
		expect(merged(['AF_UNIX AF_INET', '~AF_INET'], 'AF_INET')).toBe(false);
		expect(merged(['~AF_INET', 'AF_INET'], 'AF_INET')).toBe(true);
		expect(merged(['~AF_INET', 'AF_INET'], 'AF_UNIX')).toBe(true);
		expect(merged(['AF_UNIX', ''], 'AF_INET')).toBe(true);
		expect(merged(['none'], 'AF_UNIX')).toBe(false);
		const git = doorProps(net, 'git').props;
		expect(allowsFamily(['RestrictAddressFamilies=AF_INET AF_INET6', ...git], 'AF_INET')).toBe(
			true,
		);
	});

	test('a host that ignores PrivateNetwork= is REFUSED by the shim, because the filter alone lets loopback in', async () => {
		const net = await leaf();
		// Without the namespace the `localhost` allow is the HOST's loopback — the reason the
		// shim, not the filter, is what makes the backstop safe.
		const { props } = doorProps(net, 'turn');
		expect(
			reach(props, { kind: 'inet', ip: '127.0.0.1', port: 5432 }, { netnsHonoured: false }),
		).toBe(true);
		const shim = (await import(SHIM)) as {
			checkNamespace(
				interfaces: Record<string, Array<{ internal: boolean; address: string; family: string }>>,
			): boolean;
		};
		const lo = [{ internal: true, address: '127.0.0.1', family: 'IPv4' }];
		expect(
			shim.checkNamespace({ lo, eth0: [{ internal: false, address: '10.0.0.5', family: 'IPv4' }] }),
		).toBe(false);
		expect(shim.checkNamespace({ lo })).toBe(true);
	});

	test('a proxy door refuses to render without its egress dir, and git refuses one', async () => {
		const net = await leaf();
		expect(() => net.unitNetworkProperties('turn', {})).toThrow();
		expect(() => net.unitNetworkProperties('build', {})).toThrow();
		expect(() => net.unitNetworkProperties('git', { egressDir: `${RUNTIME}/egress/x` })).toThrow();
	});

	test('the per-run socket path fits sun_path for the longest legal instance', async () => {
		// A unix socket path is at most 107 bytes on Linux (108 with the NUL). A per-run dir
		// that overflows it makes EVERY confined turn fail to bind — so it is measured on the
		// longest instance name the grammar allows, not on the test's own.
		const net = await leaf();
		const instance = `a${'b'.repeat(MAX_INSTANCE_LENGTH - 1)}`;
		const layout = derive(manifestFrom({ instance }));
		const unit = `${layout.agentUnitPrefix}${'f'.repeat(8)}-${'f'.repeat(4)}-${'f'.repeat(4)}-${'f'.repeat(4)}-${'f'.repeat(12)}.service`;
		const dir = net.egressDirFor(layout.runtimeDir, unit);
		for (const name of ['proxy.sock', 'mcp.sock']) {
			const path = join(dir, name);
			expect({ path, fits: Buffer.byteLength(path) <= 107 }).toEqual({ path, fits: true });
		}
		// …and it is never the runtime root nor the per-turn secret directory.
		expect(dir.startsWith(`${layout.runtimeDir}/egress/`)).toBe(true);
	});

	test('egress plans are hostname-only, and git has none', async () => {
		const net = await leaf();
		const facts = { providerHosts: [] as string[], registryHosts: [] as string[] };
		expect(net.egressPlanFor('git', { ...facts, driver: 'claude_code' }).hosts).toEqual([]);
		expect(net.egressPlanFor('turn', { ...facts, driver: 'claude_code' }).hosts).toEqual([
			'api.anthropic.com',
		]);
		expect(net.egressPlanFor('build', facts).hosts).toEqual(['registry.npmjs.org']);
		// NP25: MEMBERSHIP with every other fact non-empty — a host that names provider hosts (for
		// its opencode sites) and registries gives each door exactly its own, nothing appended.
		const everything = {
			providerHosts: ['api.provider.example'],
			registryHosts: ['registry.example.com'],
		};
		expect(net.egressPlanFor('turn', { ...everything, driver: 'claude_code' }).hosts).toEqual([
			'api.anthropic.com',
		]);
		expect(net.egressPlanFor('turn', { ...everything, driver: 'opencode' }).hosts).toEqual([
			'api.provider.example',
		]);
		for (const driver of ['claude_code', 'opencode']) {
			expect({
				driver,
				build: net.egressPlanFor('build', { ...everything, driver }).hosts,
			}).toEqual({
				driver,
				build: ['registry.example.com'],
			});
			expect({ driver, git: net.egressPlanFor('git', { ...everything, driver }).hosts }).toEqual({
				driver,
				git: [],
			});
		}
		expect(net.egressPlanFor('turn', { ...facts, driver: 'claude_code' }).mcp).toBe(true);
		expect(net.egressPlanFor('build', facts).mcp).toBe(false);
		// An opencode/pi turn with no declared provider has no host to reach — a named problem.
		const none = net.planProblems('turn', { ...facts, driver: 'opencode' });
		expect(none.join(' ')).toContain('AGENT_PROVIDER_HOSTS');
		// The grammar: no IP literal, no loopback name, no wildcard, no single label — each
		// refused with a problem and absent from the plan.
		for (const bad of [
			'10.0.0.5',
			'127.0.0.1',
			'[::1]',
			'::1',
			'localhost',
			'any',
			'*',
			'intranet',
			'x.localhost',
		]) {
			const hostile = { ...facts, driver: 'opencode', providerHosts: [bad] };
			expect({ bad, refused: net.planProblems('turn', hostile).length > 0 }).toEqual({
				bad,
				refused: true,
			});
			let hosts: string[] = [];
			try {
				hosts = net.egressPlanFor('turn', hostile).hosts;
			} catch {
				hosts = [];
			}
			expect({ bad, planned: hosts.includes(bad) }).toEqual({ bad, planned: false });
		}
		for (const door of net.DOORS) {
			for (const driver of ['claude_code', 'opencode']) {
				let hosts: string[] = [];
				try {
					hosts = net.egressPlanFor(door, {
						driver,
						providerHosts: ['api.provider.example'],
						registryHosts: ['registry.npmjs.org'],
					}).hosts;
				} catch {
					hosts = [];
				}
				for (const host of hosts) {
					const ok = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host);
					expect({ door, driver, host, hostname: ok }).toEqual({
						door,
						driver,
						host,
						hostname: true,
					});
				}
			}
		}
	});

	test('the child env sends proxy doors through the gate, and gives git no proxy at all', async () => {
		const net = await leaf();
		const proxy = `http://127.0.0.1:${net.PROXY_PORT}`;
		for (const door of ['turn', 'build']) {
			const env = net.childEgressEnv(door, 'claude_code');
			for (const key of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy']) {
				expect({ door, key, value: env[key] }).toEqual({ door, key, value: proxy });
			}
			expect({ door, node: env.NODE_USE_ENV_PROXY }).toEqual({ door, node: '1' });
		}
		expect(net.childEgressEnv('turn', 'claude_code').CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe(
			'1',
		);
		// opencode's own off-plan traffic (auto-update, the models.dev catalogue, LSP downloads,
		// share uploads) is turned OFF, not refused one CONNECT at a time.
		const opencode = net.childEgressEnv('turn', 'opencode');
		for (const key of [
			'OPENCODE_DISABLE_AUTOUPDATE',
			'OPENCODE_DISABLE_MODELS_FETCH',
			'OPENCODE_DISABLE_LSP_DOWNLOAD',
			'OPENCODE_DISABLE_SHARE',
		]) {
			expect({ key, value: opencode[key] }).toEqual({ key, value: '1' });
		}
		expect(net.childEgressEnv('git')).toEqual({});
	});

	test('the leaf, the shim and the classifier import only node builtins', () => {
		// They run where the daemon's config does not exist (this gate; inside the unit, under
		// ProtectHome/PrivateTmp/the /run mask), so a config import is a crash in one and a
		// policy that silently differs in the other.
		// The shim may read the leaf's port constants (the leaf is itself builtins-only); it
		// may hold no policy of its own and reach no config.
		const allowed: Record<string, readonly string[]> = {
			[LEAF]: [],
			[CLASSIFIER]: [],
			[SHIM]: ['./network_profile', './network_profile.ts'],
		};
		// The module graph as BUN resolves it (static imports, re-exports, dynamic import() and
		// require()), not a regex over the text: a string literal in an `export const` is not
		// an import, and a multi-line import is still one.
		const transpiler = new Bun.Transpiler({ loader: 'ts' });
		const specifiersOf = (code: string) => transpiler.scanImports(code).map((entry) => entry.path);
		for (const [file, extra] of Object.entries(allowed)) {
			const specifiers = specifiersOf(readFileSync(file, 'utf8'));
			expect({ file: relative(PACKAGE, file), scanned: specifiers.length > 0 }).toEqual({
				file: relative(PACKAGE, file),
				scanned: true,
			});
			const foreign = specifiers.filter((s) => !s.startsWith('node:') && !extra.includes(s));
			expect({ file: relative(PACKAGE, file), foreign }).toEqual({
				file: relative(PACKAGE, file),
				foreign: [],
			});
		}
		// Positive control: the scanner sees a config import however it is spelled.
		expect(
			specifiersOf(
				"import {\n  config,\n} from '../config';\nconst x = await import('./y');\nexport { z } from \"../z\";\n",
			).sort(),
		).toEqual(['../config', '../z', './y']);
	});

	// (The retired AGENT_EGRESS_ALLOW key is an OUTCOME gate in the package —
	// tests/egress_config.test.ts: a museum env carrying it stops the daemon at parse, naming
	// the replacements. A regex over rendered artifacts for the key's spelling was deleted: the
	// renderer never emitted it, so that row could not fail.)

	test('mutation: any view of the whole egress/ directory reaches a sibling run — the rows above are not blind to it', async () => {
		// The per-run bind is the identity. A leaf that bound the PARENT (egressDirFor returning
		// `<runtime>/egress`), or added a second, read-only view of it anywhere in the unit,
		// hands every run every concurrent turn's mcp.sock. Each shape must turn the
		// "nothing forbidden" row red — or that row certifies the leak.
		const net = await leaf();
		const sibling = [
			`unix:${RUNTIME}/egress/${SIBLING_RUN}/proxy.sock`,
			`unix:${RUNTIME}/egress/${SIBLING_RUN}/mcp.sock`,
		];
		for (const door of net.DOORS) {
			const { props } = doorProps(net, door);
			for (const extra of [
				`BindReadOnlyPaths=${RUNTIME}/egress:/run/dedalo-all`,
				`BindPaths=${RUNTIME}/egress`,
			]) {
				const mutated = [...props, extra];
				const reached = FORBIDDEN.filter((dest) => reach(mutated, dest, reachOptions(net))).map(
					describeDestination,
				);
				expect({ door, extra, reached }).toEqual({ door, extra, reached: sibling });
			}
		}
		// …and the parent-dir bind as the proxy doors' ONE bind (the leaf mutation itself).
		for (const door of ['turn', 'build']) {
			const parent = net.unitNetworkProperties(door, { egressDir: `${RUNTIME}/egress` });
			const reached = FORBIDDEN.filter((dest) => reach(parent, dest, reachOptions(net))).map(
				describeDestination,
			);
			expect({ door, reached }).toEqual({ door, reached: sibling });
		}
	});

	test('mutation: without its per-unit mask, the host /dev/shm is a shared path-socket directory', async () => {
		const net = await leaf();
		const shm = { kind: 'unix', path: '/dev/shm/x.sock' } as const;
		for (const door of net.DOORS) {
			const { props } = doorProps(net, door);
			expect({ door, shm: reach(props, shm, { netnsHonoured: true }) }).toEqual({
				door,
				shm: false,
			});
			// PrivateDevices= alone does not hide it: systemd binds the host's /dev/shm into the
			// private /dev. The model knows that, so dropping the mask is red.
			const unmasked = [
				...props.filter((prop) => !/^TemporaryFileSystem=\/dev\/shm(?::|$)/.test(prop)),
				'PrivateDevices=yes',
			];
			expect({ door, shm: reach(unmasked, shm, { netnsHonoured: true }) }).toEqual({
				door,
				shm: true,
			});
			// Control: PrivateDevices= really does hide the rest of the host's /dev.
			expect(reach(unmasked, { kind: 'unix', path: '/dev/x.sock' }, { netnsHonoured: true })).toBe(
				false,
			);
		}
	});

	test('mutation: without its PID namespace, every door reaches a concurrent turn’s sockets through /proc/<pid>/root', async () => {
		// The units share no mount of egress/, yet a same-uid concurrent unit is visible in /proc
		// (ProtectProc=invisible hides only OTHER uids) and /proc/<pid>/root is its mount view.
		// Dropping PrivatePIDs= must turn "nothing forbidden" red with EXACTLY the sibling's two
		// sockets — the ones its bind exposes — or that row certifies the leak this namespace closed.
		const net = await leaf();
		const sibling = [
			`unix:${RUNTIME}/egress/${SIBLING_RUN}/proxy.sock`,
			`unix:${RUNTIME}/egress/${SIBLING_RUN}/mcp.sock`,
		];
		for (const door of net.DOORS) {
			const { props } = doorProps(net, door);
			const shared = props.filter((prop) => !/^PrivatePIDs=/.test(prop));
			expect({ door, dropped: props.length - shared.length }).toEqual({ door, dropped: 1 });
			const reached = FORBIDDEN.filter((dest) => reach(shared, dest, reachOptions(net))).map(
				describeDestination,
			);
			expect({ door, reached }).toEqual({ door, reached: sibling });
			// Control: the route IS the concurrent unit — alone, the same unit reaches nothing.
			const alone = FORBIDDEN.filter((dest) => reach(shared, dest, { netnsHonoured: true })).map(
				describeDestination,
			);
			expect({ door, alone }).toEqual({ door, alone: [] });
		}
	});

	test('mutation: without its IPC namespace, every door shares the host’s SysV keys and message queues', async () => {
		const net = await leaf();
		for (const door of net.DOORS) {
			const { props } = doorProps(net, door);
			const shared = props.filter((prop) => !/^PrivateIPC=/.test(prop));
			expect({ door, dropped: props.length - shared.length }).toEqual({ door, dropped: 1 });
			const reached = FORBIDDEN.filter((dest) => reach(shared, dest, reachOptions(net))).map(
				describeDestination,
			);
			expect({ door, reached }).toEqual({ door, reached: ['ipc:sysv:0x5a5a0001'] });
		}
	});
});
