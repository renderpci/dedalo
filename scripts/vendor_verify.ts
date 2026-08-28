/**
 * VENDOR TREE INTEGRITY — recompute the digest of every committed third-party
 * tree under `vendor/` and compare it with `vendor/vendor_manifest.json`.
 *
 * WHY THIS EXISTS. A `vendor/` lib is third-party code we SERVE TO BROWSERS
 * (`src/core/client_libs/registry.ts`), and it escapes every integrity mechanism
 * the rest of the dependency tree enjoys: no registry, no lockfile line, no
 * `sha512-` integrity, no Dependabot, no `bun audit` row. What guards a
 * package-manager dependency is the lockfile hash; what guards a vendored one is
 * THIS file plus the manifest — nothing else in the repo hashes those bytes.
 *
 * The digest is deliberately a TREE digest, not a per-file list: it covers the
 * file set as well as the contents, so both an edited byte and an added or
 * deleted file move it. It is computed as
 *
 *     sha256( join( sorted( `${relpath}\0${sha256(bytes)}\n` ) ) )
 *
 * over every regular file under the lib root, relative paths POSIX-normalised,
 * so it is stable across platforms and independent of readdir order.
 *
 * WHERE IT RUNS. From `test/unit/dependency_integrity_tripwire.test.ts` (every
 * `bun test`) and from `scripts/ci/audit.ts`, which the hermetic CI tier already
 * invokes — the vendor pass runs BEFORE the networked advisory audit precisely so
 * the offline skip in that script can never skip integrity too.
 *
 * WHERE IT DOES NOT RUN: at boot. Hashing ~11 MB of pdfjs on every server start
 * would buy nothing — a tampered checkout is caught by git and by CI, not by the
 * process that would already be running the tampered code.
 *
 * HONEST LIMIT — distribution side. `test/unit/release_archive_tripwire.test.ts`
 * hashes NOTHING: it only refuses symlinks in the release archive. So this manifest
 * proves the CHECKOUT is intact; what protects an installation receiving an update
 * is the update's own archive-sha refusal (the manifest travels inside that archive
 * and is covered by its digest, not by an independent signature).
 *
 * THE ADVISORY AXIS (CLI-26, 2026-08-28). Integrity was only ever half the
 * question: a digest proves the bytes are the ones we pinned, never that the ones
 * we pinned are benign. `vendor/pdfjs` sat at 5.7.284 for 22 days inside
 * GHSA-hq66-cqwq-w95j (HIGH, arbitrary JS execution on opening a malicious PDF)
 * with every gate GREEN, because `bun audit` reads lockfiles and vendor/ has none.
 * So each manifest row now carries an `advisory` block: the coordinate an advisory
 * feed is keyed to (`npm` + `pdfjs-dist` + a plain semver), a review window, and a
 * LEDGER of the published advisories known to touch that version.
 * `checkVendorAdvisories()` below is the offline half — it hard-fails when the
 * declared version falls inside a ledgered range, and when `reviewed` is older than
 * the row's own window. `scripts/ci/audit.ts` adds the networked half: it asks the
 * GitHub advisory feed the same question and reds on anything the ledger does not
 * already carry, so the ledger cannot silently fall behind the world.
 *
 * THE VERSION-BINDING AXIS (CLI-26 review, 2026-08-28). Both axes above ask their
 * question about the version the row DECLARES, and until this was added nothing
 * checked that the declared version was the version the bytes actually ARE. A row
 * reading `"version": "6.2.108"` over a 5.7.284 tree would have satisfied the digest
 * (it hashes whatever is there), the range check (it compares the declared string)
 * and the feed query (it asks about the declared string) — three green gates over an
 * unpatched tree, which is CLI-26 again with the label moved instead of the bytes.
 * So every row also carries `version_evidence`: clauses naming a file INSIDE its own
 * vendored tree and a literal that must appear in it, and each literal must itself
 * contain the declared version. `checkVendorVersionEvidence()` re-proves them, and
 * `verifyVendorTrees()` runs it, so the digest and the label are checked together —
 * and `--write` REFUSES to bless a tree whose bytes do not state the declared
 * version, which is the moment the mislabel would otherwise be committed. A tree
 * that states no version anywhere (json-view) says so in `unprovable_reason`; the
 * absence is stated, never implied.
 *
 * WHY AN ACCEPTANCE IS NOT A RUBBER STAMP. An advisory in range can be accepted,
 * but only with (a) a reason code from a CLOSED set, (b) an expiry date, and
 * (c) at least one `verify` clause this file re-proves against the tree on every
 * run — e.g. "vendor/ckeditor/build/ckeditor.js does not contain GeneralHtmlSupport",
 * which is the precondition both CKEditor advisories require. The moment somebody
 * rebuilds that bundle with the feature in it, the acceptance evaporates and the
 * gate is red. A date alone could never do that; that is the difference between
 * this and the nudge it replaces.
 *
 * Usage:
 *   bun run scripts/vendor_verify.ts            verify (exit 1 on any drift)
 *   bun run scripts/vendor_verify.ts --write    recompute digests/counts into the
 *                                               manifest, PRESERVING the curated
 *                                               fields (version, upstream,
 *                                               archive_sha256, reviewed, note).
 *                                               REFUSES when a row's declared version
 *                                               is not evidenced in its own bytes —
 *                                               blessing a digest over a mislabelled
 *                                               tree is the one thing this command
 *                                               must never do. Review the diff: a
 *                                               changed digest is a changed dependency.
 */

import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix, resolve, sep } from 'node:path';

export const REPO_ROOT = resolve(import.meta.dir, '..');
export const VENDOR_ROOT = join(REPO_ROOT, 'vendor');
export const MANIFEST_PATH = join(VENDOR_ROOT, 'vendor_manifest.json');

/** The manifest's own filename — a file, not a vendored lib directory. */
const MANIFEST_BASENAME = 'vendor_manifest.json';

export interface VendorManifestEntry {
	/** Upstream release this tree was taken from. */
	version: string;
	/** Where the bytes came from — a release/download URL a human can re-fetch. */
	upstream: string;
	/**
	 * sha256 of the upstream ARCHIVE, when one exists and was verified at vendoring
	 * time. `null` means no archive digest is known (see `note`) — the tree digest
	 * is then the only anchor, which is weaker provenance and says so.
	 */
	archive_sha256: string | null;
	/** Tree digest — see the header for the exact construction. */
	tree_sha256: string;
	/** Number of regular files under the lib root. */
	files: number;
	/** ISO date a human last reviewed this pin (staleness axis; Dependabot cannot). */
	reviewed: string;
	/** Anything a reader needs to know: what was trimmed, why it is vendored at all. */
	note: string;
	/** Advisory coordinate + ledger — see `checkVendorAdvisories`. */
	advisory: VendorAdvisoryBlock;
	/** Machine evidence that `version` is what these BYTES say — see `checkVendorVersionEvidence`. */
	version_evidence: VendorVersionEvidence;
}

/**
 * The bytes' own statement of their version.
 *
 * `clauses` name a file inside this lib's tree and a literal that must appear in it;
 * each literal must itself contain the declared version, so the clause cannot be
 * satisfied by a string that does not mention it. When a tree states no version
 * anywhere — a bundle with no version banner — `clauses` is empty and
 * `unprovable_reason` SAYS SO. The two are mutually exclusive: a row that carries
 * both is a row that hedged.
 */
export interface VendorVersionEvidence {
	unprovable_reason: string | null;
	clauses: VendorVersionEvidenceClause[];
}

/**
 * One binding. `must_contain` only: a version is proved by what the bytes DO say, and
 * `must_not_contain` can never establish an identity — allowing it would let a row
 * "prove" 6.2.108 by observing that the tree does not mention 5.7.284, which is true
 * of every tree in the world that is not 5.7.284.
 */
export interface VendorVersionEvidenceClause {
	file: string;
	must_contain: string;
}

export interface VendorManifest {
	note: string;
	libs: Record<string, VendorManifestEntry>;
}

/**
 * The closed set of reasons an advisory may be ACCEPTED rather than fixed.
 *
 * Closed on purpose: free-text acceptance is how a ratchet becomes a rubber stamp.
 * Each code says what the `verify` clauses must PROVE, and there is deliberately no
 * "reviewed and considered low risk" code — that is an opinion, not a fact a gate
 * can re-check.
 *
 *   feature_absent    the advisory's stated precondition is a feature/plugin that
 *                     these vendored bytes do not contain. Prove it with a
 *                     `must_not_contain` over the served file.
 *   not_served        the affected file is in the tree but no route serves it, so
 *                     no browser can reach it. Prove it against the serving census.
 *   mitigated_in_tree first-party code removes the precondition (e.g. an option the
 *                     mount forces off). Prove it with a `must_contain` over the
 *                     first-party file that does it.
 */
export const ADVISORY_REASON_CODES = ['feature_absent', 'not_served', 'mitigated_in_tree'] as const;
export type AdvisoryReasonCode = (typeof ADVISORY_REASON_CODES)[number];

/**
 * One mechanically re-proved fact. `file` is repo-root relative; exactly one of the
 * two predicates must be present. A clause naming a file that does not exist is a
 * PROBLEM, never a pass — an acceptance whose evidence vanished is not an acceptance.
 */
export interface VendorAdvisoryVerifyClause {
	file: string;
	must_contain?: string;
	must_not_contain?: string;
}

export interface VendorAdvisoryAcceptance {
	reason_code: AdvisoryReasonCode;
	/** Prose a reader can audit — what was assessed and on what basis. */
	reason: string;
	/** ISO date the assessment was made. */
	assessed: string;
	/** ISO date the assessment stops counting. Past it, the row is RED. */
	expires: string;
	/** A path or URL a reader can chase to the assessment itself. */
	evidence: string;
	/** At least one; every clause is re-proved on every run. */
	verify: VendorAdvisoryVerifyClause[];
}

/** One published advisory, as the feed states it. */
export interface VendorAdvisoryRecord {
	/** GHSA id — the feed's own identity, so the networked arm can compare on it. */
	id: string;
	cve: string | null;
	severity: string;
	published: string;
	/** The feed's range grammar: comma-separated AND clauses, e.g. `>= 5.6.83, < 6.2.108`. */
	vulnerable_range: string;
	first_patched_version: string | null;
	summary: string;
	accepted: VendorAdvisoryAcceptance | null;
}

/**
 * The advisory coordinate of one vendored tree.
 *
 * `ecosystem`/`package`/`version` are what an advisory feed is keyed to. When no such
 * coordinate exists (a bundle with no version string at all), all three are null and
 * `unkeyable_reason` must SAY SO — the never-narrow law wants the absence stated, and
 * the review window then carries the whole weight for that row.
 */
export interface VendorAdvisoryBlock {
	ecosystem: string | null;
	package: string | null;
	version: string | null;
	unkeyable_reason: string | null;
	/** Days after `reviewed` at which this row goes RED. Per-row: a dead-upstream bundle and an actively-released viewer do not share one honest cutoff. */
	review_window_days: number;
	advisories: VendorAdvisoryRecord[];
}

/** Every regular file under `dir`, as POSIX paths relative to `dir`, sorted. */
export function listTreeFiles(dir: string): string[] {
	const out: string[] = [];
	const walk = (current: string): void => {
		for (const entry of readdirSync(current)) {
			const full = join(current, entry);
			// lstat, not stat: a symlink is never followed. A vendored tree is bytes we
			// commit; a link would make the digest depend on something outside it.
			const info = lstatSync(full, { throwIfNoEntry: false });
			if (info === undefined) continue;
			if (info.isDirectory()) walk(full);
			else if (info.isFile())
				out.push(
					full
						.slice(dir.length + 1)
						.split(sep)
						.join(posix.sep),
				);
		}
	};
	walk(dir);
	return out.sort();
}

/** The tree digest of one vendored lib directory. */
export function treeDigest(dir: string): { digest: string; files: number } {
	const relatives = listTreeFiles(dir);
	const lines = relatives.map((rel) => {
		const bytes = readFileSync(join(dir, rel));
		return `${rel}\0${createHash('sha256').update(bytes).digest('hex')}\n`;
	});
	return {
		digest: createHash('sha256').update(lines.join('')).digest('hex'),
		files: relatives.length,
	};
}

/** The vendored lib directories present on disk (the manifest's expected key set). */
export function listVendorDirs(): string[] {
	return readdirSync(VENDOR_ROOT)
		.filter((entry) => {
			if (entry === MANIFEST_BASENAME) return false;
			if (entry.startsWith('.')) return false;
			return lstatSync(join(VENDOR_ROOT, entry)).isDirectory();
		})
		.sort();
}

export function readManifest(): VendorManifest {
	return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as VendorManifest;
}

/**
 * THE VERSION-BINDING CHECK. Returns the problems, EMPTY when green.
 *
 * Every other check in this file reasons about `advisory.version` — the STRING the row
 * declares. This is the one that makes that string cost something: the declared
 * version must appear, verbatim, inside a file of the lib's own tree.
 *
 * Four rules, each closing a way the binding could be faked:
 *   1. the clause file must live under `vendor/<id>/`. Evidence from outside the tree
 *      (a doc, a changelog we wrote) proves what we CLAIMED, not what we SHIPPED.
 *   2. `must_contain` must itself contain the declared version, so "pdf.js" is not
 *      evidence of 6.2.108.
 *   3. the file must exist and must actually contain the literal — a missing file is a
 *      PROBLEM, never a pass.
 *   4. no clauses ⇒ a substantive `unprovable_reason`, and never both.
 *
 * `today` plays no part here: this is a fact about bytes, not about dates.
 */
export function checkVendorVersionEvidenceIn(manifest: VendorManifest): string[] {
	const problems: string[] = [];

	for (const [id, entry] of Object.entries(manifest.libs)) {
		const evidence = entry.version_evidence as VendorVersionEvidence | undefined;
		if (evidence === undefined || evidence === null || typeof evidence !== 'object') {
			problems.push(
				`vendor/${id}: no "version_evidence". The row declares a version; something in the tree must SAY that version, or the row must state why nothing can.`,
			);
			continue;
		}
		const clauses = Array.isArray(evidence.clauses) ? evidence.clauses : null;
		if (clauses === null) {
			problems.push(`vendor/${id}: version_evidence.clauses must be an array (empty is fine)`);
			continue;
		}

		// The version the clauses must evidence. `advisory.version` is the machine one and
		// is already checked against the prose `version` field by the advisory arm, so
		// binding to it binds both — and a row with no machine version has nothing plain
		// enough to look for, which is exactly the case `unprovable_reason` covers.
		const declared =
			typeof entry.advisory?.version === 'string' ? (entry.advisory.version as string) : null;

		if (clauses.length === 0) {
			if (
				typeof evidence.unprovable_reason !== 'string' ||
				evidence.unprovable_reason.trim().length < 40
			) {
				problems.push(
					`vendor/${id}: version_evidence has no clauses AND no substantive unprovable_reason. State why these bytes cannot state their own version; do not leave it implied.`,
				);
			}
			continue;
		}
		if (typeof evidence.unprovable_reason === 'string') {
			problems.push(
				`vendor/${id}: version_evidence carries BOTH clauses and an unprovable_reason — one or the other, never a hedge`,
			);
		}
		if (declared === null) {
			problems.push(
				`vendor/${id}: version_evidence carries clauses but the row has no machine advisory.version for them to evidence`,
			);
			continue;
		}

		for (const clause of clauses) {
			if (typeof clause?.file !== 'string' || typeof clause.must_contain !== 'string') {
				problems.push(`vendor/${id}: a version_evidence clause needs a file and a must_contain`);
				continue;
			}
			if (!clause.file.startsWith(`vendor/${id}/`)) {
				problems.push(
					`vendor/${id}: version_evidence clause names "${clause.file}", which is outside vendor/${id}/. The bytes must state their own version; our own prose about them is not evidence.`,
				);
				continue;
			}
			if (!clause.must_contain.includes(declared)) {
				problems.push(
					`vendor/${id}: version_evidence clause over "${clause.file}" looks for "${clause.must_contain}", which does not contain the declared version "${declared}" — that clause could pass on any version`,
				);
				continue;
			}
			let text: string;
			try {
				text = readFileSync(join(REPO_ROOT, clause.file), 'utf-8');
			} catch {
				problems.push(
					`vendor/${id}: version_evidence names "${clause.file}", which does not exist`,
				);
				continue;
			}
			if (!text.includes(clause.must_contain)) {
				problems.push(
					`vendor/${id}: DECLARED VERSION IS NOT IN THE BYTES — ${clause.file} does not contain "${clause.must_contain}".\n` +
						`      The row says ${declared}. Either the tree was replaced without moving the label, or the label\n` +
						'      was moved without replacing the tree. Both make every other check in this file ask its\n' +
						'      question about a version that is not here.',
				);
			}
		}
	}
	return problems;
}

/** The same over the manifest on disk. */
export function checkVendorVersionEvidence(): string[] {
	return checkVendorVersionEvidenceIn(readManifest());
}

/**
 * Verify every vendored tree against the manifest.
 *
 * Returns the list of problems, EMPTY when green. It never throws on drift — the
 * caller (a gate, a CI script) decides how loud to be; it does throw when the
 * manifest itself cannot be read, because a missing manifest is not "no drift".
 */
export function verifyVendorTrees(): string[] {
	const manifest = readManifest();
	const onDisk = listVendorDirs();
	const declared = Object.keys(manifest.libs).sort();
	const problems: string[] = [];

	for (const id of onDisk) {
		if (!declared.includes(id)) {
			problems.push(`vendor/${id}/ exists but no vendor_manifest.json row declares it`);
		}
	}
	for (const id of declared) {
		if (!onDisk.includes(id)) {
			problems.push(`vendor_manifest.json declares "${id}" but vendor/${id}/ does not exist`);
			continue;
		}
		const entry = manifest.libs[id] as VendorManifestEntry;
		const { digest, files } = treeDigest(join(VENDOR_ROOT, id));
		if (digest !== entry.tree_sha256) {
			problems.push(
				`vendor/${id}/ tree digest drifted:\n` +
					`      manifest ${entry.tree_sha256}\n` +
					`      on disk  ${digest}\n` +
					'      Either the tree was edited (vendored code is NEVER patched in place —\n' +
					'      bump upstream with scripts/vendor_fetch.ts) or the manifest is stale.',
			);
		}
		if (files !== entry.files) {
			problems.push(`vendor/${id}/ file count: manifest ${entry.files}, on disk ${files}`);
		}
	}
	// The digest proves the bytes are the ones we pinned; the version evidence proves
	// the LABEL on the row is the label those bytes wear. Both are the manifest checked
	// against the tree, both must hold offline, and separating them is how a mislabelled
	// row would keep a green integrity gate — so they are one answer.
	problems.push(...checkVendorVersionEvidenceIn(manifest));
	return problems;
}

/* ── the advisory axis ─────────────────────────────────────────────────────── */

/**
 * A plain `major.minor.patch[-prerelease]` version, as numbers.
 *
 * THROWS on anything else. A version we cannot parse must never silently compare
 * as "outside the range" — that is a green over an unchecked dependency, the exact
 * failure this whole axis exists to remove.
 */
export function parseVersion(raw: string): { parts: number[]; prerelease: string } {
	const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(raw.trim());
	if (match === null) {
		throw new Error(`vendor advisory: "${raw}" is not a plain semver (major.minor.patch)`);
	}
	return {
		parts: [Number(match[1]), Number(match[2]), Number(match[3])],
		prerelease: match[4] ?? '',
	};
}

/** -1 / 0 / 1. A prerelease sorts BELOW its own release (semver §11), which is what an advisory range means by `< 6.2.108`. */
export function compareVersions(a: string, b: string): number {
	const left = parseVersion(a);
	const right = parseVersion(b);
	for (let i = 0; i < 3; i++) {
		const l = left.parts[i] ?? 0;
		const r = right.parts[i] ?? 0;
		if (l !== r) return l < r ? -1 : 1;
	}
	if (left.prerelease === right.prerelease) return 0;
	if (left.prerelease === '') return 1;
	if (right.prerelease === '') return -1;
	return left.prerelease < right.prerelease ? -1 : 1;
}

/**
 * Does `version` fall inside a GitHub-advisory range?
 *
 * The feed's grammar is comma-separated AND clauses over `>=`, `>`, `<=`, `<`, `=`
 * — e.g. `>= 5.6.83, < 6.2.108`. Anything else THROWS, for the same reason
 * `parseVersion` does: an unrecognised range is an unanswered question, not a pass.
 */
export function versionInRange(version: string, range: string): boolean {
	const clauses = range
		.split(',')
		.map((clause) => clause.trim())
		.filter((clause) => clause !== '');
	if (clauses.length === 0) throw new Error(`vendor advisory: empty version range`);
	for (const clause of clauses) {
		const match = /^(>=|<=|>|<|=)\s*(\S+)$/.exec(clause);
		if (match === null) {
			throw new Error(`vendor advisory: unparseable range clause "${clause}" in "${range}"`);
		}
		const operator = match[1] as string;
		const bound = match[2] as string;
		const cmp = compareVersions(version, bound);
		const satisfied =
			operator === '>='
				? cmp >= 0
				: operator === '>'
					? cmp > 0
					: operator === '<='
						? cmp <= 0
						: operator === '<'
							? cmp < 0
							: cmp === 0;
		if (!satisfied) return false;
	}
	return true;
}

/** Whole days between two instants, floored — the unit both the window and the expiry speak. */
function daysBetween(fromIso: string, to: Date): number | null {
	const parsed = Date.parse(fromIso);
	if (Number.isNaN(parsed)) return null;
	return Math.floor((to.getTime() - parsed) / 86_400_000);
}

/** Every acceptance clause re-proved against the tree. Returns the problems. */
function verifyAcceptanceClauses(
	libId: string,
	advisoryId: string,
	acceptance: VendorAdvisoryAcceptance,
): string[] {
	const problems: string[] = [];
	if (acceptance.verify.length === 0) {
		problems.push(
			`vendor/${libId}: acceptance of ${advisoryId} carries no verify clause — an acceptance a gate cannot re-prove is a rubber stamp`,
		);
	}
	for (const clause of acceptance.verify) {
		const target = join(REPO_ROOT, clause.file);
		let text: string;
		try {
			text = readFileSync(target, 'utf-8');
		} catch {
			problems.push(
				`vendor/${libId}: acceptance of ${advisoryId} verifies against "${clause.file}", which does not exist`,
			);
			continue;
		}
		const hasContain = typeof clause.must_contain === 'string';
		const hasNotContain = typeof clause.must_not_contain === 'string';
		if (hasContain === hasNotContain) {
			problems.push(
				`vendor/${libId}: acceptance of ${advisoryId} — a verify clause needs exactly one of must_contain / must_not_contain (${clause.file})`,
			);
			continue;
		}
		if (hasContain && !text.includes(clause.must_contain as string)) {
			problems.push(
				`vendor/${libId}: acceptance of ${advisoryId} FAILED — ${clause.file} no longer contains "${clause.must_contain}". The mitigation is gone; the advisory is live again.`,
			);
		}
		if (hasNotContain && text.includes(clause.must_not_contain as string)) {
			problems.push(
				`vendor/${libId}: acceptance of ${advisoryId} FAILED — ${clause.file} now contains "${clause.must_not_contain}". The precondition this acceptance said was absent is present.`,
			);
		}
	}
	return problems;
}

/**
 * THE ADVISORY GATE, offline half. Returns the problems, EMPTY when green.
 *
 * `today` is injectable so the gate can prove its own date arithmetic on constructed
 * inputs rather than waiting for a calendar.
 */
export function checkVendorAdvisories(today: Date = new Date()): string[] {
	return checkVendorAdvisoriesIn(readManifest(), today);
}

/**
 * The same rules over a manifest the caller supplies.
 *
 * EXPORTED so the gate's positive controls can construct the exact shapes that must
 * be refused — an in-range advisory with no acceptance, an expired one, one whose
 * verify clause no longer holds — WITHOUT mocking the manifest reader (which
 * `mock_isolation_tripwire` rightly distrusts) and without a second copy of the
 * rules that could drift from the one CI runs.
 */
export function checkVendorAdvisoriesIn(manifest: VendorManifest, today: Date): string[] {
	const problems: string[] = [];

	for (const [id, entry] of Object.entries(manifest.libs)) {
		const block = entry.advisory as VendorAdvisoryBlock | undefined;
		if (block === undefined || block === null || typeof block !== 'object') {
			problems.push(
				`vendor/${id}: no "advisory" block. Every vendored tree declares the coordinate an advisory feed is keyed to, or states why it has none.`,
			);
			continue;
		}

		// --- the coordinate ---------------------------------------------------
		const keyed =
			typeof block.ecosystem === 'string' &&
			typeof block.package === 'string' &&
			typeof block.version === 'string';
		if (keyed) {
			try {
				parseVersion(block.version as string);
			} catch (error) {
				problems.push(`vendor/${id}: ${(error as Error).message}`);
			}
			// The prose `version` field and the machine one must not drift apart: the
			// human reads the first, the gate compares the second. Bounded, not a bare
			// substring — "1.2.1" is inside "1.2.10", and a drift check that accepted
			// that would be lax in exactly the direction that matters.
			const boundedVersion = new RegExp(
				`(^|[^0-9.])${(block.version as string).replace(/\./g, '\\.')}([^0-9.]|$)`,
			);
			if (!boundedVersion.test(entry.version)) {
				problems.push(
					`vendor/${id}: advisory.version "${block.version}" does not appear in the row's version "${entry.version}" — the two identities have drifted`,
				);
			}
		} else if (typeof block.unkeyable_reason !== 'string' || block.unkeyable_reason.length < 40) {
			problems.push(
				`vendor/${id}: no advisory coordinate AND no substantive unkeyable_reason. State why no feed can be keyed to these bytes; do not leave it implied.`,
			);
		}

		// --- the review window (was a nudge, is now a gate) --------------------
		if (!Number.isInteger(block.review_window_days) || block.review_window_days < 1) {
			problems.push(`vendor/${id}: review_window_days must be a positive integer`);
		} else {
			const age = daysBetween(entry.reviewed, today);
			if (age === null) {
				problems.push(`vendor/${id}: reviewed "${entry.reviewed}" is not a parseable date`);
			} else if (age > block.review_window_days) {
				problems.push(
					`vendor/${id}: reviewed ${entry.reviewed} — ${age} days ago, past its ${block.review_window_days}-day window.\n` +
						'      Dependabot cannot watch a vendored tree, so this date IS the watch. Re-check the\n' +
						'      upstream release feed and the advisory feed (scripts/ci/audit.ts does the second\n' +
						'      for you when online), record any new advisory in this row, then move `reviewed`.',
				);
			}
		}

		// --- the ledger --------------------------------------------------------
		if (!Array.isArray(block.advisories)) {
			problems.push(`vendor/${id}: advisory.advisories must be an array (empty is fine)`);
			continue;
		}
		const seen = new Set<string>();
		for (const advisory of block.advisories) {
			if (typeof advisory.id !== 'string' || advisory.id.trim() === '') {
				problems.push(`vendor/${id}: an advisory row has no id`);
				continue;
			}
			if (seen.has(advisory.id)) {
				problems.push(`vendor/${id}: advisory ${advisory.id} is listed twice`);
			}
			seen.add(advisory.id);

			if (!keyed) {
				problems.push(
					`vendor/${id}: advisory ${advisory.id} is ledgered but the row has no version to compare it against`,
				);
				continue;
			}

			let inRange: boolean;
			try {
				inRange = versionInRange(block.version as string, advisory.vulnerable_range);
			} catch (error) {
				// Unparseable range = unanswered question = RED.
				problems.push(`vendor/${id}: advisory ${advisory.id} — ${(error as Error).message}`);
				continue;
			}

			if (!inRange) {
				// A ledger entry that no longer bites must be REMOVED, not left lying about
				// with an acceptance attached: a stale acceptance is how a future in-range
				// version inherits a decision nobody made about it.
				if (advisory.accepted !== null && advisory.accepted !== undefined) {
					problems.push(
						`vendor/${id}: advisory ${advisory.id} does not affect ${block.version} any more, but still carries an acceptance. Drop the acceptance (or the whole row).`,
					);
				}
				continue;
			}

			const acceptance = advisory.accepted;
			if (acceptance === null || acceptance === undefined) {
				problems.push(
					`vendor/${id}: version ${block.version} is INSIDE published advisory ${advisory.id}` +
						`${advisory.cve === null ? '' : ` / ${advisory.cve}`} (${advisory.severity}, published ${advisory.published})\n` +
						`      range "${advisory.vulnerable_range}" — ${advisory.summary}\n` +
						`      Fix: take the tree to ${advisory.first_patched_version ?? 'a patched release'} ` +
						'(scripts/vendor_fetch.ts), or record an acceptance with a reason code, an\n' +
						'      expiry and at least one verify clause this gate can re-prove.',
				);
				continue;
			}

			if (!ADVISORY_REASON_CODES.includes(acceptance.reason_code)) {
				problems.push(
					`vendor/${id}: acceptance of ${advisory.id} has reason_code "${acceptance.reason_code}", which is not one of ${ADVISORY_REASON_CODES.join(', ')}`,
				);
			}
			if (typeof acceptance.reason !== 'string' || acceptance.reason.trim().length < 40) {
				problems.push(
					`vendor/${id}: acceptance of ${advisory.id} has no substantive reason (>= 40 chars)`,
				);
			}
			if (typeof acceptance.evidence !== 'string' || acceptance.evidence.trim().length < 4) {
				problems.push(
					`vendor/${id}: acceptance of ${advisory.id} names no evidence a reader can chase`,
				);
			}
			if (!/^\d{4}-\d{2}-\d{2}$/.test(acceptance.assessed ?? '')) {
				problems.push(`vendor/${id}: acceptance of ${advisory.id} has no ISO "assessed" date`);
			}
			// daysBetween(expires, today) is POSITIVE once today is past the expiry date.
			const daysPastExpiry = daysBetween(acceptance.expires ?? '', today);
			if (!/^\d{4}-\d{2}-\d{2}$/.test(acceptance.expires ?? '') || daysPastExpiry === null) {
				problems.push(`vendor/${id}: acceptance of ${advisory.id} has no ISO "expires" date`);
			} else if (daysPastExpiry > 0) {
				problems.push(
					`vendor/${id}: acceptance of ${advisory.id} EXPIRED on ${acceptance.expires}. Re-assess the advisory against the current bytes, or fix it.`,
				);
			}
			problems.push(...verifyAcceptanceClauses(id, advisory.id, acceptance));
		}
	}
	return problems;
}

if (import.meta.main) {
	const write = process.argv.includes('--write');
	if (write) {
		const manifest = readManifest();
		// REFUSE BEFORE WRITING. `--write` is the command that blesses whatever is on
		// disk as "what the manifest says", so it is the exact moment a mislabelled tree
		// gets a digest and becomes indistinguishable from a correct one. The evidence is
		// checked against the bytes now present, not the digests about to be written, so
		// a bump that changed the tree without changing `version` (or the reverse) dies
		// here rather than shipping a row whose every later check asks about a version
		// that is not in the tree.
		const evidenceProblems = checkVendorVersionEvidenceIn(manifest);
		if (evidenceProblems.length > 0) {
			console.error(
				'== vendor: REFUSING TO WRITE — a declared version is not evidenced in its own bytes:\n',
			);
			for (const problem of evidenceProblems) console.error(`   ${problem}`);
			// A guard that refuses without saying how to comply is a guard people route
			// around. `scripts/vendor_fetch.ts` still lists only the pre-CLI-26 curated
			// fields in its next-steps message, so a bumper who followed it lands here —
			// name every field, not just the one that failed.
			console.error(
				'\n   A bump edits FOUR curated fields before this command can run:\n' +
					'      "version"                     the prose label a human reads\n' +
					'      "advisory.version"            the plain semver every check compares on\n' +
					'      "version_evidence.clauses"    the literals carry the version, so they move with it\n' +
					'      "reviewed"                    the date you read the upstream + advisory feeds\n' +
					'   Find the literals in the new bytes first (e.g. grep the served file for the\n' +
					'   version string), then run --write again. Checklist:\n' +
					'   docs/development/vendored_library_versions.md — "Upgrade checklist".\n' +
					'   Writing a digest over a mislabelled tree is the one thing this command must not do.\n',
			);
			process.exit(1);
		}
		for (const id of listVendorDirs()) {
			const { digest, files } = treeDigest(join(VENDOR_ROOT, id));
			const previous = manifest.libs[id];
			if (previous === undefined) {
				console.error(
					`== vendor: vendor/${id}/ has no manifest row. Add it by hand (version, upstream,\n` +
						'   archive_sha256, reviewed, note are CURATED — --write only fills the digests).',
				);
				process.exit(1);
			}
			previous.tree_sha256 = digest;
			previous.files = files;
		}
		await Bun.write(MANIFEST_PATH, `${JSON.stringify(manifest, null, '\t')}\n`);
		console.log(`== vendor: digests rewritten (${MANIFEST_PATH}) — review the diff.`);
		process.exit(0);
	}

	const problems = verifyVendorTrees();
	if (problems.length > 0) {
		console.error('== vendor: RED — committed third-party trees do not match the manifest:\n');
		for (const problem of problems) console.error(`   ${problem}`);
		// Deliberately NOT a bare "just regenerate": --write fixes a stale digest and
		// refuses a mislabelled version, and telling a reader to reach for it in both
		// cases is how a ratchet becomes a reflex.
		console.error(
			'\nA drifted DIGEST after a deliberate bump: bun run scripts/vendor_verify.ts --write\n' +
				'A version not in the bytes: fix the row or the tree — --write will refuse it.\n',
		);
		process.exit(1);
	}
	const ids = listVendorDirs();
	console.log(
		`== vendor: GREEN — ${ids.length} vendored trees match the manifest (${ids.join(', ')})`,
	);
}
