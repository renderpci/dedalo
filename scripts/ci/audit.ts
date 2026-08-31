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
 * THE VENDOR HALF (added 2026-08-24 with P2-5). `bun audit` only sees what a
 * lockfile names, and this repo also SERVES third-party browser code that no
 * lockfile names: the committed trees under `vendor/`. Dependabot cannot watch a
 * vendored tree and no advisory feed is keyed to it, so this script covers the two
 * axes a package manager would have covered:
 *   - INTEGRITY: `verifyVendorTrees()` rehashes every vendored tree against
 *     `vendor/vendor_manifest.json`. It runs FIRST, before any network call, so the
 *     offline skip below can never skip it — an offline run still proves the bytes.
 *   - STALENESS + ADVISORIES: this used to be a print that "NUDGES, never fails".
 *     CLI-26 (2026-08-28) is what that cost: `vendor/pdfjs` sat at 5.7.284 inside
 *     GHSA-hq66-cqwq-w95j (HIGH, arbitrary JS execution on opening a malicious PDF)
 *     for 22 days while this step printed `pdfjs 5.7.284 — reviewed 2026-07-12
 *     (46 days ago)` and exited 0, with the advisory 25 days inside that window.
 *     A nudge that cannot fail is not a gate (DEC-12), so it now HARD-FAILS, in two
 *     halves that need each other:
 *       · OFFLINE — `checkVendorAdvisories()` (scripts/vendor_verify.ts) compares the
 *         version each row DECLARES against the advisory ranges that row LEDGERS, and
 *         fails a `reviewed` date past the row's own window. Same function
 *         test/unit/vendor_advisory_tripwire.test.ts runs, so a developer and CI
 *         cannot disagree about what is red.
 *       · NETWORKED — `discoverVendorAdvisories()` below asks the GitHub advisory
 *         feed the same question per coordinate and reds on any advisory the ledger
 *         does NOT carry. That is the half the ledger cannot do for itself: committed
 *         data cannot learn about an advisory published after it was written.
 *     The earlier "a red no edit of ours caused" argument still holds for a VANISHED
 *     advisory, which is why that direction is still only a nudge. It does not hold
 *     here: a vendored tree inside a published advisory is a decision of ours that
 *     is still standing, and the fix is a version bump, not a rubber stamp.
 *
 * THE NETWORK POLICY (CLI-26 review, 2026-08-28), and why it is not "any non-ok is
 * RED". The first draft failed the tier on ANY non-ok HTTP. This script runs from
 * `scripts/ci/hermetic.sh`, and the GitHub advisory endpoint is anonymous at 60
 * requests/hour PER IP — so a shared runner that had already spent its quota would
 * have turned a 403 into a red build labelled as a vulnerability. That is not
 * caution, it is a false alarm on a security gate, and a security gate that cries
 * wolf gets commented out. So the outcomes are now three, not two:
 *
 *   FINDING  — the feed ANSWERED and named an advisory this ledger does not carry.
 *              Hard RED. Someone must look at it.
 *   DEGRADED — the lookup did not complete: transport failure, or a status meaning
 *              "not right now" (429, 403/rate limit, 5xx, 408). Loud, named per
 *              coordinate, with the rate-limit headers printed — and NOT a failure,
 *              because nothing was learned either way.
 *   RED      — a status meaning "your request is wrong" (400, 401, 404, 410, 422).
 *              That is OURS: a broken coordinate or a rejected token, and it must
 *              not hide behind the word "offline".
 *
 * `classifyAdvisoryFeedStatus()` is that split, exported and exercised on constructed
 * statuses by test/unit/vendor_advisory_tripwire.test.ts — a policy nobody can test is
 * a policy nobody can trust.
 *
 * DEGRADED IS NOT A HOLE, and this is the load-bearing half of the decision. What a
 * degraded run loses is only DISCOVERY of an advisory nobody has ledgered yet. What
 * still ran, offline and unskippable, is the committed ledger AND the per-row
 * `review_window_days` (90 days for pdfjs) — a human re-check that no network
 * condition can postpone, and that hard-fails `bun test` when it lapses. Set
 * `GITHUB_TOKEN` to raise the anonymous limit; pass `--require-network` on a tier
 * that must not tolerate a degraded lookup at all (a release check), and DEGRADED
 * becomes RED there without weakening the hermetic tier that cannot guarantee egress.
 *
 * Usage: bun run scripts/ci/audit.ts [--update] [--require-network]
 *        --update          rewrites the baseline from the current audit (review the diff).
 *        --require-network turns a DEGRADED advisory lookup into a failure.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Glob } from 'bun';
import {
	checkVendorAdvisories,
	readManifest,
	type VendorAdvisoryBlock,
	verifyVendorTrees,
} from '../vendor_verify.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const BASELINE_PATH = join(REPO_ROOT, 'engineering', 'dependency_audit_baseline.json');

/**
 * Every package with its own lockfile — one `bun audit` each.
 *
 * DERIVED FROM THE TREE (P2-5 / GATE-52), not enumerated. It was a literal
 * three-element array while FOUR manifests are tracked, each with its own
 * lockfile. The missing one —
 * `publication/site_builder/templates/basic` — is the build toolchain the site
 * scaffolder COPIES INTO EVERY GENERATED PUBLIC MUSEUM SITE, so it was neither
 * audited here nor guarded by the integrity gate nor updated by Dependabot. The
 * gate that should have caught it floored at `>= 3`: a floor set BELOW the
 * corpus can never notice a missing member.
 *
 * EXPORTED because it is the census of lockfiles, not a detail of this script:
 * `test/unit/dependency_integrity_tripwire.test.ts` reads the SAME list, so the
 * two cannot drift into "audited here, unguarded there".
 */
function discoverPackages(): string[] {
	const found: string[] = [];
	for (const rel of new Glob('**/package.json').scanSync({ cwd: REPO_ROOT })) {
		if (rel.includes('node_modules/')) continue;
		const dir = dirname(rel);
		// A package is a package when it LOCKS: a manifest with no lockfile has no
		// resolved dependency set to audit or to verify integrity against.
		if (!existsSync(join(REPO_ROOT, dir, 'bun.lock'))) continue;
		found.push(dir === '.' ? '.' : dir);
	}
	return found.sort();
}

export const PACKAGES: readonly string[] = discoverPackages();

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

function flatten(_dir: string, report: AuditReport): BaselineEntry[] {
	return Object.entries(report).flatMap(([pkg, advisories]) =>
		(advisories ?? []).map((a) => ({
			id: a.id,
			severity: a.severity ?? 'unknown',
			package: pkg,
			title: (a.title ?? '').slice(0, 160),
		})),
	);
}

/**
 * What one non-ok HTTP status from the advisory feed MEANS.
 *
 * The whole point of this split is that "the feed would not serve us right now" and
 * "we asked a question the feed rejects" are different facts and must not share one
 * verdict. Exported and exercised on constructed statuses, because the failure mode
 * being prevented — a rate limit rendered as a vulnerability — only ever shows up on
 * a status this repo cannot produce on demand.
 *
 *   'degraded'  429 (rate limit), 403 (GitHub's other rate-limit status, and its
 *               "not right now" in general), 408 (timeout), any 5xx. Nothing was
 *               learned, and nothing is claimed.
 *   'red'       400, 401, 404, 410, 422 and every other 4xx: the REQUEST is wrong —
 *               a coordinate we built badly, a URL shape that moved, a token the API
 *               rejected. Ours to fix, and it may not hide behind "offline".
 */
export function classifyAdvisoryFeedStatus(status: number): 'degraded' | 'red' {
	if (status === 429 || status === 403 || status === 408) return 'degraded';
	if (status >= 500) return 'degraded';
	return 'red';
}

/** What one coordinate's lookup produced. */
type VendorFeedOutcome = {
	/** Advisories the feed named that the ledger does not carry. Hard RED. */
	findings: string[];
	/** Lookups that did not complete, one line each. Loud, not a failure. */
	degraded: string[];
	/** Lookups the feed REFUSED because the request was wrong. Hard RED. */
	rejected: string[];
	/** Coordinates queried, and coordinates the feed actually answered. */
	queried: number;
	answered: number;
};

/**
 * Ask the GitHub advisory feed what it knows about each vendored coordinate.
 *
 * WHY IT IS SEPARATE FROM THE LEDGER. The committed ledger is what makes the gate
 * work offline and deterministically; it cannot, by construction, know about an
 * advisory published after it was written — CLI-26 is precisely that failure, one
 * query nobody had run. This is the query, run every CI pass.
 *
 * Unauthenticated, one request per keyed coordinate (three today): far inside the
 * 60/hour anonymous budget for a runner that owns its IP, and nowhere near it for a
 * shared one that does not — which is why a refusal is classified rather than
 * assumed. `GITHUB_TOKEN` is used when present only to raise that limit; the endpoint
 * is public, so a missing token is not a degraded run.
 *
 * The three outcomes never blur: see `classifyAdvisoryFeedStatus` and the header.
 */
async function discoverVendorAdvisories(
	libs: Record<string, { advisory: VendorAdvisoryBlock }>,
): Promise<VendorFeedOutcome> {
	const outcome: VendorFeedOutcome = {
		findings: [],
		degraded: [],
		rejected: [],
		queried: 0,
		answered: 0,
	};

	for (const [id, entry] of Object.entries(libs)) {
		const block = entry.advisory;
		if (
			typeof block?.ecosystem !== 'string' ||
			typeof block.package !== 'string' ||
			typeof block.version !== 'string'
		) {
			// An unkeyable row (no version string upstream, e.g. json-view). Its
			// `unkeyable_reason` is asserted by the tripwire; nothing to query here.
			continue;
		}
		outcome.queried++;
		const coordinate = `${block.package}@${block.version}`;
		const url =
			`https://api.github.com/advisories?ecosystem=${encodeURIComponent(block.ecosystem)}` +
			`&affects=${encodeURIComponent(coordinate)}&per_page=100`;
		let response: Response;
		try {
			response = await fetch(url, {
				headers: {
					accept: 'application/vnd.github+json',
					'user-agent': 'dedalo-vendor-advisory-check',
					...(process.env.GITHUB_TOKEN === undefined
						? {}
						: { authorization: `Bearer ${process.env.GITHUB_TOKEN}` }),
				},
				signal: AbortSignal.timeout(20_000),
			});
		} catch (error) {
			outcome.degraded.push(
				`vendor/${id}: ${coordinate} — the feed could not be reached (${(error as Error).name})`,
			);
			continue;
		}
		if (!response.ok) {
			// The rate-limit headers are printed rather than interpreted: a reader who
			// sees `remaining 0` knows instantly this was a quota, not a vulnerability,
			// and a reader who sees a full budget knows to look further.
			const remaining = response.headers.get('x-ratelimit-remaining');
			const reset = response.headers.get('x-ratelimit-reset');
			const retryAfter = response.headers.get('retry-after');
			const budget =
				remaining === null && retryAfter === null
					? ''
					: ` [rate limit: remaining ${remaining ?? '?'}` +
						`${reset === null ? '' : `, resets ${new Date(Number(reset) * 1000).toISOString()}`}` +
						`${retryAfter === null ? '' : `, retry-after ${retryAfter}s`}]`;
			if (classifyAdvisoryFeedStatus(response.status) === 'degraded') {
				outcome.degraded.push(
					`vendor/${id}: ${coordinate} — the feed answered HTTP ${response.status}${budget}. ` +
						'Nothing was learned about this coordinate, and nothing is claimed.',
				);
			} else {
				outcome.rejected.push(
					`vendor/${id}: ${coordinate} — the feed REJECTED the request: HTTP ${response.status}${budget}.\n` +
						'      That status means the request was wrong, not that the feed was busy: a coordinate\n' +
						'      this script built badly, a moved URL shape, or a GITHUB_TOKEN the API refused.',
				);
			}
			continue;
		}
		let rows: {
			ghsa_id?: string;
			severity?: string;
			summary?: string;
			withdrawn_at?: string | null;
		}[];
		try {
			rows = (await response.json()) as typeof rows;
		} catch {
			// A 200 whose body is not the documented shape is OURS: the contract moved.
			outcome.rejected.push(
				`vendor/${id}: ${coordinate} — the feed answered HTTP 200 with a body this script cannot parse. The API contract moved under us.`,
			);
			continue;
		}
		outcome.answered++;
		const ledgered = new Set(block.advisories.map((advisory) => advisory.id));
		for (const row of rows) {
			if (typeof row.ghsa_id !== 'string') continue;
			if (row.withdrawn_at !== null && row.withdrawn_at !== undefined) continue;
			if (ledgered.has(row.ghsa_id)) continue;
			outcome.findings.push(
				`vendor/${id}: ${coordinate} is affected by ${row.ghsa_id} ` +
					`(${row.severity ?? 'unknown'}) — ${(row.summary ?? '').slice(0, 120)}\n` +
					'      This advisory is NOT in the manifest ledger. Nobody has looked at it.',
			);
		}
	}
	return outcome;
}

/**
 * The audit run. A FUNCTION, not top-level code: this module is imported for its
 * `PACKAGES` census, and an import that shells out to three networked `bun audit`
 * calls would make the tripwire that imports it slow, flaky and offline-dependent.
 */
async function main(): Promise<void> {
	const update = process.argv.includes('--update');
	// A tier that CAN guarantee egress may demand the networked arm actually answered.
	// The hermetic tier cannot, which is why this is opt-in rather than the default —
	// see the header: the default must never red a build for a rate limit.
	const requireNetwork = process.argv.includes('--require-network');

	// --- vendored trees: integrity (hard) then staleness (nudge) ---------------
	// Deliberately before the network audit: integrity must hold offline too.
	const vendorProblems = verifyVendorTrees();
	if (vendorProblems.length > 0) {
		console.error('== vendor: RED — committed third-party trees do not match the manifest:\n');
		for (const problem of vendorProblems) console.error(`   ${problem}`);
		console.error(
			'\n   Investigate before regenerating: bun run scripts/vendor_verify.ts --write\n',
		);
		process.exit(1);
	}
	const manifest = readManifest();
	const vendorRows = Object.entries(manifest.libs);
	console.log(`== vendor: ${vendorRows.length} committed trees, digests match the manifest`);
	const today = Date.now();
	for (const [id, entry] of vendorRows) {
		// Age is still REPORTED here — the threshold lives in the manifest, per row,
		// because a dead-upstream bundle (ckeditor) and an actively-released viewer
		// (pdfjs) do not share one honest cutoff. What changed is that passing it is
		// now a failure below, not a line of text nobody reads.
		const reviewedAt = Date.parse(entry.reviewed);
		const days = Number.isNaN(reviewedAt)
			? '??'
			: String(Math.floor((today - reviewedAt) / 86_400_000));
		const provenance =
			entry.archive_sha256 === null ? 'no archive digest' : 'archive digest on file';
		const window = entry.advisory?.review_window_days ?? '??';
		console.log(
			`   ${id.padEnd(12)} ${entry.version} — reviewed ${entry.reviewed} (${days}/${window} days, ${provenance})`,
		);
	}

	// The offline advisory + review-window arm. HARD, and before the network: an
	// offline run must still be able to fail on a ledgered advisory.
	const advisoryProblems = checkVendorAdvisories();
	if (advisoryProblems.length > 0) {
		console.error('\n== vendor: RED — advisory / review state of the committed trees:\n');
		for (const problem of advisoryProblems) console.error(`   ${problem}`);
		console.error('');
		process.exit(1);
	}
	console.log('   advisory ledger + review windows: OK\n');

	// The networked discovery arm. Three outcomes, kept apart on purpose — see the
	// header: a finding is a vulnerability, a rejection is our bug, a degraded lookup
	// is neither and must never be dressed as either.
	const discovery = await discoverVendorAdvisories(manifest.libs);

	if (discovery.rejected.length > 0) {
		console.error('\n== vendor advisories: RED — the advisory feed refused our request:\n');
		for (const problem of discovery.rejected) console.error(`   ${problem}`);
		console.error(
			'\nThis is not a network state and not a vulnerability: it is a query this script got\n' +
				'wrong, or a credential the API rejected. Fix the coordinate or the token.\n',
		);
		process.exit(1);
	}

	if (discovery.findings.length > 0) {
		console.error(
			'\n== vendor advisories: RED — published advisories the manifest does not ledger:\n',
		);
		for (const problem of discovery.findings) console.error(`   ${problem}`);
		console.error(
			'\nAdd each one to the lib row in vendor/vendor_manifest.json (id, cve, severity,\n' +
				'published, vulnerable_range, first_patched_version, summary) and then FIX it — bump\n' +
				'with scripts/vendor_fetch.ts, or record an acceptance with a verify clause the gate\n' +
				'can re-prove. Ledgering alone does not make it green.\n',
		);
		process.exit(1);
	}

	if (discovery.degraded.length > 0) {
		// LOUD, and worded so nobody can mistake it for either of the two reds above.
		const all = discovery.answered === 0;
		console.log(
			`\n== vendor advisories: DEGRADED — ${discovery.degraded.length} of ${discovery.queried} ` +
				`coordinate lookups did not complete${all ? ' (none did)' : ''}:`,
		);
		for (const line of discovery.degraded) console.log(`   ${line}`);
		console.log(
			'\n   NOT a finding and NOT a pass: what did not run is the search for advisories\n' +
				'   nobody has ledgered yet. What DID run, and cannot be skipped by any network\n' +
				'   condition, is the committed ledger and the per-row review window above.\n' +
				'   Set GITHUB_TOKEN to raise the anonymous 60/hour-per-IP limit; pass\n' +
				'   --require-network on a tier that must not tolerate this at all.',
		);
		if (requireNetwork) {
			console.error(
				'\n== vendor advisories: RED — --require-network was passed and the lookup was degraded.\n',
			);
			process.exit(1);
		}
		console.log('');
	}

	if (discovery.answered > 0 && discovery.findings.length === 0) {
		console.log(
			`== vendor advisories: GREEN — the feed answered for ${discovery.answered} of ` +
				`${discovery.queried} coordinates and reports nothing this ledger does not carry\n`,
		);
	}

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
	console.log(
		`== audit: GREEN — ${total} known advisories, 0 new (baseline ${baseline.generated})`,
	);
}

if (import.meta.main) await main();
