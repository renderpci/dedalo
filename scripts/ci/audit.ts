/**
 * DEPENDENCY AUDIT RATCHET — `bun audit` against a committed baseline.
 *
 * WHY A RATCHET AND NOT A BARE `bun audit`. On 2026-08-03, the day this was written,
 * the tree already carried 7 advisories (5 high) — all transitive, most through
 * `@huggingface/transformers` (sharp/libvips, adm-zip) and the MCP SDK (fast-uri,
 * @hono/node-server). A blocking bare audit would have been RED on day one, which
 * teaches everyone to ignore the step; a non-blocking one proves nothing and rots
 * into decoration ("tripwire or delete", DEC-12). So: the KNOWN set is data, in
 * `engineering/dependency_audit_baseline.json`, and a NEW advisory is the failure.
 * Accepting one is then a deliberate, reviewable edit — same shape as the tripwire
 * index and the WC- ledger.
 *
 * THE TWO DIRECTIONS ARE NOT SYMMETRIC, ON PURPOSE:
 *   - a NEW advisory fails the gate. It is ours: we added the dependency, or upstream
 *     published a finding about code we ship.
 *   - a VANISHED advisory only prints a nudge. The advisory database is a third-party
 *     moving target — withdrawals and re-scopings happen with no commit of ours. A red
 *     that no edit of ours caused, and that any developer can only fix by rubber-stamping
 *     a file, is how a gate loses its authority.
 *
 * NETWORK. `bun audit` queries the registry, so this runs in CI (which already does a
 * networked `bun install`) and is skipped OFFLINE — but skipped LOUDLY, with exit 0 only
 * when the failure is unmistakably a transport failure. Anything unparseable is RED:
 * a silent green over an audit that did not run is the exact trap this file exists to
 * avoid elsewhere.
 *
 * Usage: bun run scripts/ci/audit.ts [--update]
 *        --update rewrites the baseline from the current audit (review the diff).
 */

import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const BASELINE_PATH = join(REPO_ROOT, 'engineering', 'dependency_audit_baseline.json');

/** Every package with its own lockfile — one `bun audit` each. */
const PACKAGES = ['.', 'publication/server_api/v2', 'publication/site_builder'];

type Advisory = { id: number; url?: string; title?: string; severity?: string };
type AuditReport = Record<string, Advisory[]>;
type BaselineEntry = { id: number; severity: string; package: string; title: string };
type Baseline = {
	generated: string;
	note: string;
	accepted: Record<string, BaselineEntry[]>;
};

/** `<package dir>::<npm package>::<advisory id>` — the identity a ratchet compares on. */
function keyOf(dir: string, pkg: string, advisory: Advisory): string {
	return `${dir}::${pkg}::${advisory.id}`;
}

/**
 * Run `bun audit --json` in one package dir.
 *
 * `bun audit` exits NON-ZERO when it finds anything, so the exit code carries no
 * information about whether the audit RAN — only stdout does. Empty stdout with a
 * non-zero exit is the offline/transport case.
 */
async function auditPackage(dir: string): Promise<AuditReport | 'unreachable'> {
	const proc = Bun.spawn(['bun', 'audit', '--json'], {
		cwd: join(REPO_ROOT, dir),
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	await proc.exited;

	const trimmed = stdout.trim();
	if (trimmed === '') {
		console.error(`   audit produced no JSON in ${dir}: ${stderr.trim().slice(0, 300)}`);
		return 'unreachable';
	}
	try {
		return JSON.parse(trimmed) as AuditReport;
	} catch {
		// Parseable-looking output that is not JSON means the CLI contract moved under us.
		// That is a RED: we no longer know whether anything was audited.
		console.error(`   audit output in ${dir} is not JSON: ${trimmed.slice(0, 300)}`);
		process.exit(1);
	}
}

function flatten(dir: string, report: AuditReport): BaselineEntry[] {
	return Object.entries(report).flatMap(([pkg, advisories]) =>
		(advisories ?? []).map((a) => ({
			id: a.id,
			severity: a.severity ?? 'unknown',
			package: pkg,
			title: (a.title ?? '').slice(0, 160),
		})),
	);
}

const update = process.argv.includes('--update');

const current: Record<string, BaselineEntry[]> = {};
let unreachable = 0;
for (const dir of PACKAGES) {
	console.log(`== audit: ${dir}`);
	const report = await auditPackage(dir);
	if (report === 'unreachable') {
		unreachable++;
		continue;
	}
	current[dir] = flatten(dir, report).sort((a, b) =>
		`${a.package}${a.id}`.localeCompare(`${b.package}${b.id}`),
	);
}

if (unreachable === PACKAGES.length) {
	console.log('== audit: SKIPPED — the advisory registry is unreachable from here (offline).');
	console.log('   This is the only tolerated skip, and it is loud on purpose.');
	process.exit(0);
}
if (unreachable > 0) {
	// A partial failure is NOT offline — it is one package that could not be audited while
	// its neighbours could, which would silently narrow coverage.
	console.error('== audit: RED — some packages audited and some did not. Not a network state.');
	process.exit(1);
}

if (update) {
	const next: Baseline = {
		generated: new Date().toISOString().slice(0, 10),
		note: 'Accepted (known, triaged) dependency advisories. Regenerate with `bun run scripts/ci/audit.ts --update` and explain the delta in the commit message. A NEW advisory fails CI; a vanished one only prints a nudge (see scripts/ci/audit.ts).',
		accepted: current,
	};
	await Bun.write(BASELINE_PATH, `${JSON.stringify(next, null, '\t')}\n`);
	console.log(
		`== audit: baseline REWRITTEN (${BASELINE_PATH}) — review the diff before committing.`,
	);
	process.exit(0);
}

const baseline = (await Bun.file(BASELINE_PATH).json()) as Baseline;

const baselineKeys = new Set(
	Object.entries(baseline.accepted).flatMap(([dir, entries]) =>
		entries.map((e) => keyOf(dir, e.package, e)),
	),
);
const currentKeys = new Map<string, BaselineEntry & { dir: string }>();
for (const [dir, entries] of Object.entries(current)) {
	for (const e of entries) currentKeys.set(keyOf(dir, e.package, e), { ...e, dir });
}

const added = [...currentKeys.entries()].filter(([k]) => !baselineKeys.has(k));
const gone = [...baselineKeys].filter((k) => !currentKeys.has(k));

for (const k of gone) {
	console.log(`   nudge: baseline advisory no longer reported — ${k} (tighten the baseline)`);
}

if (added.length > 0) {
	console.error('\n== audit: RED — advisories that the committed baseline does not accept:\n');
	for (const [, e] of added) {
		console.error(`   [${e.severity}] ${e.package} (${e.dir}) — ${e.title}`);
		console.error(`      https://github.com/advisories (advisory id ${e.id})`);
	}
	console.error(
		'\nFix it (bun update / drop the dependency), or accept it deliberately:\n' +
			'   bun run scripts/ci/audit.ts --update\n' +
			'and say WHY in the commit message. An accepted advisory is a decision, not a default.\n',
	);
	process.exit(1);
}

const total = [...currentKeys.keys()].length;
console.log(`== audit: GREEN — ${total} known advisories, 0 new (baseline ${baseline.generated})`);
