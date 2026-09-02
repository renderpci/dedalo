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
 * THE ANTI-LAUNDERING GUARD (P2-18 / GATE-20). `--update` compares the audit
 * against the committed baseline BY KEY and REFUSES to accept an advisory the
 * baseline does not hold unless told `--allow-regression --reason "<text>"`;
 * the reason is validated by the one shared validator
 * (`scripts/lib/reason_validator.ts`) and written INTO each accepted entry,
 * where the check path re-reads it. A count comparison was measured
 * insufficient — a swap keeps the count flat — and a commit message is read by
 * no gate. `test/unit/ratchet_integrity_tripwire.test.ts` proves both on
 * constructed fixtures.
 *
 * Usage: bun run scripts/ci/audit.ts [--update [--allow-regression --reason "<text>"]] [--require-network]
 *        --update            rewrites the baseline from the current audit (review the diff);
 *                            REFUSES to accept an advisory the baseline does not hold.
 *        --allow-regression  with --update: accept new advisories. Needs --reason.
 *        --reason "<text>"   why the advisories accepted in THIS run are accepted rather
 *                            than fixed. ONE per invocation, applied to every new entry of
 *                            the run (one triage, one run); it is also taken by kept
 *                            entries that have none yet. Written into the artifact.
 *        --require-network   turns a DEGRADED advisory lookup into a failure.
 *        --baseline <path>   read (and on --update, write) the artifact at <path> instead of
 *                            the committed one. For the gate's subprocess probes over a
 *                            scratch copy; CI never passes it.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Glob } from 'bun';
import { readFlagValue, readReasonArg, thinReasonProblem } from '../lib/reason_validator.ts';
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
/**
 * One accepted advisory. `reason` is WHY it is accepted rather than fixed —
 * written INTO the artifact, per entry, because a commit message is read by no
 * gate (P2-18 / GATE-20). An accepted RCE and a triaged low were
 * indistinguishable without it; and GATE-53 is what the field forces to the
 * surface: none of the entries accepted before it existed could truthfully have
 * written "no fix exists upstream".
 */
export type BaselineEntry = {
	id: number;
	severity: string;
	package: string;
	title: string;
	reason?: string;
};
export type Baseline = {
	generated: string;
	note: string;
	accepted: Record<string, BaselineEntry[]>;
};

/** A reason for accepting an advisory is a decision about shipped code: a full sentence. */
export const ADVISORY_REASON_MIN_WORDS = 12;

/**
 * The CURRENT committed baseline, in THREE states — never a null that means
 * "compare against nothing" (P2-18 / GATE-20, second round). The first draft
 * returned null on ANY read failure and `--update` then compared against the
 * empty set: a merge-conflicted file (unparseable JSON) DISABLED the refusal,
 * so "resolve the conflict by running the fix command" accepted every advisory
 * flaglessly — the exact laundering path, one level down.
 *   - `present`: the parsed artifact;
 *   - `absent`: no file — a bootstrap, where EVERY advisory is new and the
 *     refusal applies in full;
 *   - `unparseable`: a file that is not the artifact (a conflict marker, a
 *     truncated merge) — the generator REFUSES, it never guesses.
 */
export type PreviousBaseline =
	| { kind: 'present'; baseline: Baseline }
	| { kind: 'absent' }
	| { kind: 'unparseable'; error: string };

export async function readPreviousBaseline(path = BASELINE_PATH): Promise<PreviousBaseline> {
	const file = Bun.file(path);
	if (!(await file.exists())) return { kind: 'absent' };
	try {
		const parsed = (await file.json()) as Baseline;
		if (parsed === null || typeof parsed !== 'object' || typeof parsed.accepted !== 'object')
			return { kind: 'unparseable', error: 'no "accepted" map' };
		return { kind: 'present', baseline: parsed };
	} catch (error) {
		return { kind: 'unparseable', error: String(error) };
	}
}

/** `<package dir>::<npm package>::<advisory id>` — the identity a ratchet compares on. */
function keyOf(dir: string, pkg: string, advisory: Advisory): string {
	return `${dir}::${pkg}::${advisory.id}`;
}

/** Every accepted key of a baseline's `accepted` map, with its entry. */
function acceptedByKey(accepted: Record<string, BaselineEntry[]>): Map<string, BaselineEntry> {
	const byKey = new Map<string, BaselineEntry>();
	for (const [dir, entries] of Object.entries(accepted)) {
		for (const entry of entries ?? []) byKey.set(keyOf(dir, entry.package, entry), entry);
	}
	return byKey;
}

/**
 * The advisories `current` accepts that `previous` did not — BY KEY, never by
 * count. The first guard here compared totals (`after > before`), and a SWAP —
 * one advisory withdrawn upstream the same week a NEW one is published — kept
 * the count flat and laundered the new one flaglessly. A ratchet compares
 * identities; a count is a summary of identities and hides exactly the
 * exchange that matters. Exported: the gate proves it on a constructed swap.
 */
export function newlyAcceptedKeys(
	previous: Record<string, BaselineEntry[]>,
	current: Record<string, BaselineEntry[]>,
): string[] {
	const before = acceptedByKey(previous);
	return [...acceptedByKey(current).keys()].filter((key) => !before.has(key)).sort();
}

/**
 * Every accepted entry must carry a reason the shared validator accepts. This
 * runs on the CHECK path too, so a hand-edited or merged baseline whose entry
 * has no reason is RED, not merely un-regenerable. Exported: the gate proves it
 * on a reason-less and on a thin entry.
 */
export function acceptedEntryProblems(baseline: Baseline): string[] {
	const problems: string[] = [];
	for (const [key, entry] of acceptedByKey(baseline.accepted)) {
		const problem = thinReasonProblem(entry.reason, ADVISORY_REASON_MIN_WORDS);
		if (problem !== null) problems.push(`${key}: ${problem}`);
	}
	return problems;
}

/** What `--update` decided: a refusal (message, exit 1) or the baseline to write. */
export type UpdateDecision =
	| { kind: 'refuse'; message: string }
	| { kind: 'write'; next: Baseline };

/**
 * THE --update DECISION, pure and exported so the gate proves the OUTCOME on
 * constructed fixtures (a swap, a conflicted file, a missing file) instead of
 * grepping the block that calls it — a spelling check was measured to stay
 * green with the condition neutered to `&& false`.
 *
 * ANTI-LAUNDERING (P2-18 / GATE-20). `--update` used to overwrite `accepted`
 * with whatever `bun audit` reported this minute, unconditionally — and the
 * RED message hands the developer that exact command. So the reflex path was
 * the laundering path. A ratchet that records whatever it measured is not a
 * ratchet, it is a diary. The rules:
 *   1. the previous artifact must be READ: a conflicted or truncated file is a
 *      refusal, never an empty comparison; a missing one means every advisory
 *      is new;
 *   2. the comparison is BY KEY (`newlyAcceptedKeys`), never by count — a swap
 *      (one advisory vanished, one new, same total) is a regression;
 *   3. accepting a new advisory takes --allow-regression AND --reason: the
 *      reason is validated by the ONE shared validator and written INTO the
 *      entry, where a gate can read it, not into a commit message, where none
 *      can;
 *   4. the reason of every entry that stays is PRESERVED across --update, so
 *      regeneration never strips a triage; a kept entry that never had one
 *      (pre-GATE-20 artifact) takes this run's;
 *   5. the output is validated by the same predicate the check path applies,
 *      so the generator cannot write a file the gate would refuse.
 * ONE --reason per invocation applies to every new advisory accepted in that
 * run (one triage, one run); per-advisory reasons are per-advisory runs.
 */
export function updateDecision(
	previous: PreviousBaseline,
	current: Record<string, BaselineEntry[]>,
	argv: readonly string[],
	today: string,
): UpdateDecision {
	if (previous.kind === 'unparseable') {
		return {
			kind: 'refuse',
			message:
				`== audit: REFUSED — ${BASELINE_PATH} exists but is not the artifact (${previous.error}).\n` +
				'   A conflict marker or a truncated merge is not "no baseline": resolve the file to the\n' +
				'   version you mean (git checkout --theirs/--ours, or the merge-base copy), then re-run.\n' +
				'   The generator never compares against a baseline it could not read.\n',
		};
	}
	const previousAccepted = previous.kind === 'present' ? previous.baseline.accepted : {};
	const previousByKey = acceptedByKey(previousAccepted);
	const added = newlyAcceptedKeys(previousAccepted, current);
	const allowRegression = argv.includes('--allow-regression');
	const reason = readReasonArg(argv);
	const reasonProblem =
		reason === null ? null : thinReasonProblem(reason, ADVISORY_REASON_MIN_WORDS);
	if (added.length > 0 && !allowRegression) {
		return {
			kind: 'refuse',
			message:
				`== audit: REFUSED — this would accept ${added.length} advisor${added.length === 1 ? 'y' : 'ies'} the committed baseline does not hold` +
				`${previous.kind === 'absent' ? ' (there is no committed baseline: every advisory is new)' : ''}:\n` +
				`${added.map((key) => `   + ${key}`).join('\n')}\n` +
				'   An advisory is accepted because someone TRIAGED it, never because the\n' +
				'   regeneration command was the easiest way past a red build. Fix it, or\n' +
				'   accept it deliberately — the reason goes INTO the baseline entry:\n' +
				'      bun run scripts/ci/audit.ts --update --allow-regression --reason "<why it is accepted rather than fixed>"\n',
		};
	}
	if (allowRegression && (reason === null || reasonProblem !== null)) {
		return {
			kind: 'refuse',
			message:
				`== audit: REFUSED — --allow-regression needs --reason "<text>": ${reasonProblem ?? 'none given'}.\n` +
				`   A reason names why the advisory is accepted rather than fixed (at least ${ADVISORY_REASON_MIN_WORDS} words,\n` +
				'   and "temporary" / "later" are not reasons). It is written into every entry this run accepts.\n',
		};
	}
	const accepted: Record<string, BaselineEntry[]> = {};
	for (const [dir, entries] of Object.entries(current)) {
		accepted[dir] = entries.map((entry) => {
			const key = keyOf(dir, entry.package, entry);
			const kept = previousByKey.get(key)?.reason;
			const isNew = !previousByKey.has(key);
			// A kept entry keeps its reason — unless that reason would not pass the
			// validator (a pre-GATE-20 leftover, a hand edit): then it takes this
			// run's, so the refusal below ("re-run with --reason") is advice that
			// can succeed. Measured: `kept ?? reason` preserved a THIN kept reason
			// forever and the only exit was a hand edit of the artifact.
			const keptIsValid =
				kept !== undefined && thinReasonProblem(kept, ADVISORY_REASON_MIN_WORDS) === null;
			const entryReason = isNew ? reason : keptIsValid ? kept : (reason ?? kept);
			return entryReason === null ? entry : { ...entry, reason: entryReason };
		});
	}
	const next: Baseline = {
		generated: today,
		note: 'Accepted (known, triaged) dependency advisories. Every entry carries the reason it is accepted rather than fixed (validated by scripts/lib/reason_validator.ts; a reason-less entry is RED). A NEW advisory fails CI; a vanished one only prints a nudge (see scripts/ci/audit.ts). Regenerate with `bun run scripts/ci/audit.ts --update`; accepting an advisory the baseline does not hold (compared by KEY, so a swap is a regression; a missing baseline makes every advisory new; a conflicted one is refused, never compared against nothing) REFUSES without `--allow-regression --reason "<text>"`, and the reason is written here, per entry.',
		accepted,
	};
	const problems = acceptedEntryProblems(next);
	if (problems.length > 0) {
		return {
			kind: 'refuse',
			message:
				'== audit: REFUSED — the baseline this would write carries entries without a valid reason:\n' +
				`${problems.map((line) => `   ${line}`).join('\n')}\n` +
				'   Re-run with --reason "<text>" to record the triage on them.\n',
		};
	}
	return { kind: 'write', next };
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
	const baselinePath = readFlagValue(process.argv, '--baseline') ?? BASELINE_PATH;
	const runDate = new Date().toISOString().slice(0, 10);

	// The artifact is read FIRST, through the three-state reader, before any
	// vendored-tree or network work: a missing or conflicted baseline is a
	// refusal (never "no constraints", never a bootstrap over a conflict
	// marker), and it is decided before `bun audit` is ever spawned — so the
	// gate proves this outcome by subprocess, offline, on a scratch copy.
	const previous = await readPreviousBaseline(baselinePath);
	if (update && previous.kind === 'unparseable') {
		const decision = updateDecision(previous, {}, process.argv, runDate);
		console.error(decision.kind === 'refuse' ? decision.message : 'unreachable');
		process.exit(1);
	}
	if (!update && previous.kind !== 'present') {
		console.error(
			`== audit: RED — ${baselinePath} is ${previous.kind === 'absent' ? 'missing' : `not the artifact (${previous.error})`}.\n` +
				'   The ratchet cannot run without its baseline. Restore the committed file (a conflict\n' +
				'   marker is a merge left half-done, not an empty baseline).\n',
		);
		process.exit(1);
	}

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
		// The decision is `updateDecision` — pure, exported, proved by the gate on a
		// swap, a conflicted file and a missing file. This block only carries it out.
		const decision = updateDecision(previous, current, process.argv, runDate);
		if (decision.kind === 'refuse') {
			console.error(decision.message);
			process.exit(1);
		}
		await Bun.write(baselinePath, `${JSON.stringify(decision.next, null, '\t')}\n`);
		console.log(
			`== audit: baseline REWRITTEN (${baselinePath}) — review the diff before committing.`,
		);
		process.exit(0);
	}

	// The artifact was read at the top of main through the three-state reader:
	// a missing or conflicted baseline exited RED there, before the network.
	const committed = previous;
	if (committed.kind !== 'present') process.exit(1);
	const baseline = committed.baseline;

	// The artifact is checked, not trusted: an entry that reached the file with no
	// reason — a hand edit, a merge resolution, a pre-GATE-20 leftover — is RED
	// here, exactly where the generator cannot have run.
	const entryProblems = acceptedEntryProblems(baseline);
	if (entryProblems.length > 0) {
		console.error('== audit: RED — accepted advisories without a valid reason in the baseline:\n');
		for (const problem of entryProblems) console.error(`   ${problem}`);
		console.error(
			'\n   Every accepted advisory records WHY it is accepted rather than fixed, in the entry\n' +
				'   itself. Record it: bun run scripts/ci/audit.ts --update --reason "<text>"\n',
		);
		process.exit(1);
	}

	const baselineKeys = new Set(acceptedByKey(baseline.accepted).keys());
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
			'\nFix it (bun update / an override / drop the dependency), or accept it deliberately —\n' +
				'the reason is validated and written INTO the baseline entry, where a gate reads it:\n' +
				'   bun run scripts/ci/audit.ts --update --allow-regression --reason "<why it is accepted rather than fixed>"\n' +
				'A plain --update REFUSES a new advisory. An accepted advisory is a decision, not a default.\n',
		);
		process.exit(1);
	}

	const total = [...currentKeys.keys()].length;
	console.log(
		`== audit: GREEN — ${total} known advisories, 0 new (baseline ${baseline.generated})`,
	);
}

if (import.meta.main) await main();
