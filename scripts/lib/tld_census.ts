/**
 * SPECIFIC-INSTALL TLD CENSUS — which test files bind to an ontology TLD that
 * ships with SOME install rather than with the engine.
 *
 * ── THE LAW IT MEASURES (AGENTS.md hard rules, 2026-08-19) ───────────────────
 * A test uses the generic `test` TLD and BUILDS the situation it tests
 * (src/core/test_data/situations). It never names a specific install's TLD —
 * `numisdata`, `oh`, `tch`, `rsc`, `ich`, `mdcat`, `dmm`, `zenon`, `cult`… —
 * because such a gate is green on the machine that happens to hold that
 * install's records and red everywhere else. Measured 2026-08-18: 214 test
 * files reference a non-seeded TLD (334 counting `rsc`/`oh`, whose ontology
 * ships in the seed but whose record tables are empty on a fresh install);
 * the parity tier is 208-red on the suite DB for exactly this reason.
 *
 * ── WHAT COUNTS ──────────────────────────────────────────────────────────────
 * A TIPO-shaped token: `<tld><digits>` at a word boundary — `numisdata6`,
 * `rsc167`, `tchi1` — after comments are blanked. A tipo is what a test binds
 * to; a bare TLD word in prose ("the numisdata install") is not a binding and
 * is not counted, so a header explaining WHY a file avoids a TLD stays free.
 * String contents ARE counted (that is where the bindings live).
 *
 * ── THE DENYLIST (known install TLDs) ────────────────────────────────────────
 * The gate denies a KNOWN set of install TLDs rather than "everything not
 * allowlisted": a first pass with the inverse rule counted `libx1`, `aa1`,
 * `nosuchtipo1`, `testrt1`, `sha1` — synthetic write-kernel tipos, hash names
 * and fabricated identifiers that bind to NO install. Those are exactly what
 * a generic test SHOULD use. So the census names the installs it knows:
 *   - the TLDs the 76 harvested parity gates bound to (the 2026-07-11 store
 *     is a census of one install: numisdata, rsc, oh, tch, tchi, ich, mdcat,
 *     tema, object, cult, dmm, dc, on, cont, material, technique, culture,
 *     grup, icon, seri, terr, sccmk, ndd, utoponymy, htoponymy, roleusr,
 *     rolepos, rolejob, uncertainty, special, sc*…);
 *   - the ones the unit tier reaches for besides those (zenon, actv, mht,
 *     category, ceramics, cm, nexus, qdp…).
 *
 * `nexus` and `qdp` were ADDED on 2026-08-20 after a review found them missing:
 * the application ontology holds 65 `nexus*` and 3 `qdp*` nodes and the frozen
 * store names `nexus18` / `qdp266`, so tests were binding them in full view of a
 * census that could not see it. A MISSING entry is the worst failure this list
 * has — it makes every "0 bindings" answer a lie — which is why the list is
 * grow-only and why a removal (see libx/marc below) needs proof that no
 * ontology node anywhere carries the prefix.
 *
 * TWO NAMES WERE REMOVED on 2026-08-19 because they are not TLDs at all, and
 * every "binding" they produced was a false positive: `libx` matched
 * **libx264**, ffmpeg's H.264 encoder, and `marc` matched **marc21**, the MARC
 * cataloguing standard (and its module path). No `dd_ontology` node in any
 * database starts with either — verified before removal. Re-adding them would
 * make six media gates and two parser gates permanently "install-bound" with
 * nothing to migrate, which is worse than useless: it teaches that a census
 * entry can be unfixable.
 * `rsc` and `oh` are ON the list although their ontology ships in the seed:
 * their record tables are EMPTY on a fresh install, so a test reading
 * `rsc170/5` binds to a corpus exactly as `numisdata6/1` does.
 *
 * The list is GROW-ONLY: discovering that a test binds a further install TLD
 * means ADDING it here (and re-freezing the baseline, which will list the
 * offending files); a TLD may leave the list only when no test names it.
 * Install-invariant TLDs (`test`, `zz*`, `dd`, `hierarchy`, `ontology`,
 * `ontologytype`, `lg`, the two-letter country hierarchies) are never on it.
 *
 * ── ONE IMPLEMENTATION ───────────────────────────────────────────────────────
 * The generic_tld_tripwire imports THIS census; the baseline generator
 * (scripts/generic_tld_baseline.ts) writes the artifact from THIS census.
 * A second implementation of "does this file bind a specific TLD" would make
 * the ratchet worthless.
 *
 * HERMETIC: tracked-source reads only. No DB, no network, no clock; imports
 * nothing from src/.
 */

import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { Glob } from 'bun';
import { stripComments } from '../../test/helpers/strip_comments.ts';

/** Repo root (this file lives at scripts/lib/tld_census.ts). */
export const REPO_ROOT = join(import.meta.dir, '..', '..');

/** The scanned tree: every test tier. */
export const SCAN_ROOTS = ['test'] as const;

/** Only test files are measured — helpers/fixtures are reached THROUGH a test. */
export const MEASURED_SUFFIX = '.test.ts';

/** Excluded PATH SEGMENTS. */
export const EXCLUDED_SEGMENTS = ['node_modules', 'fixtures'] as const;

/**
 * Known SPECIFIC-INSTALL TLDs. Grow-only (see header). Alphabetical.
 * Every entry is a TLD that appears, numbered, in this repo's tests or in the
 * frozen fixture store — i.e. an install this codebase has been tested
 * against, never a guess.
 */
export const INSTALL_TLDS: ReadonlySet<string> = new Set([
	'actv',
	'category',
	'ceramics',
	'cm',
	'cont',
	'cult',
	'culture',
	'dc',
	'depositiontype',
	'discoverytype',
	'dmm',
	'ds',
	'flora',
	'grup',
	'htoponymy',
	'ich',
	'icon',
	'material',
	'mdcat',
	'mht',
	'ndd',
	'nexus',
	'numisdata',
	'object',
	'objet',
	'oh',
	'on',
	'qdp',
	'render',
	'rolejob',
	'rolepos',
	'roleusr',
	'rsc',
	'sccmk',
	'scell',
	'sclat',
	'scsym',
	'sctxr',
	'scxibm',
	'scxibo',
	'scxpu',
	'seri',
	'special',
	'tch',
	'tchi',
	'technique',
	'tema',
	'terr',
	'uncertainty',
	'utoponymy',
	'zenon',
]);

/**
 * Sanity: an install-invariant TLD must NEVER be denied. Asserted by the
 * gate's self-test so a careless addition to INSTALL_TLDS cannot flip the
 * whole suite red.
 */
export const INVARIANT_TLDS: ReadonlySet<string> = new Set([
	'test',
	'dd',
	'hierarchy',
	'ontology',
	'ontologytype',
	'lg',
]);

/** `<tld><digits>` at a word boundary. TLDs are lowercase letters (safeTld). */
const TIPO_TOKEN = /(?<![A-Za-z0-9_])([a-z]{2,})([0-9]+)(?![A-Za-z0-9_])/g;

export interface FileTldRefs {
	/** Repo-relative, forward slashes. */
	file: string;
	/** Denied TLDs found, sorted, with the distinct tipos seen for each. */
	denied: Record<string, string[]>;
}

function toRepoRelative(absPath: string): string {
	return relative(REPO_ROOT, absPath).split(sep).join('/');
}

function isExcluded(repoRel: string): boolean {
	const segments = repoRel.split('/');
	return segments.some((segment) => (EXCLUDED_SEGMENTS as readonly string[]).includes(segment));
}

/** Denied TLD → distinct tipos for ONE source text. Exported for the self-tests. */
export function deniedTldsIn(source: string): Record<string, string[]> {
	const code = stripComments(source);
	const found = new Map<string, Set<string>>();
	for (const match of code.matchAll(TIPO_TOKEN)) {
		const tld = match[1] as string;
		if (!INSTALL_TLDS.has(tld)) continue;
		let set = found.get(tld);
		if (set === undefined) {
			set = new Set();
			found.set(tld, set);
		}
		set.add(match[0]);
	}
	const out: Record<string, string[]> = {};
	for (const tld of [...found.keys()].sort()) {
		out[tld] = [...(found.get(tld) as Set<string>)].sort();
	}
	return out;
}

/** Scan every measured file. Deterministic order. Throws on an unreadable file. */
export function census(): FileTldRefs[] {
	const results: FileTldRefs[] = [];
	for (const root of SCAN_ROOTS) {
		const glob = new Glob(`**/*${MEASURED_SUFFIX}`);
		for (const rel of glob.scanSync({ cwd: join(REPO_ROOT, root) })) {
			const abs = join(REPO_ROOT, root, rel);
			const repoRel = toRepoRelative(abs);
			if (isExcluded(repoRel)) continue;
			const denied = deniedTldsIn(readFileSync(abs, 'utf8'));
			if (Object.keys(denied).length > 0) results.push({ file: repoRel, denied });
		}
	}
	results.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
	return results;
}

/** Files scanned (for the anti-vacuity floor), independent of hits. */
export function scannedFileCount(): number {
	let n = 0;
	for (const root of SCAN_ROOTS) {
		const glob = new Glob(`**/*${MEASURED_SUFFIX}`);
		for (const rel of glob.scanSync({ cwd: join(REPO_ROOT, root) })) {
			if (!isExcluded(toRepoRelative(join(REPO_ROOT, root, rel)))) n++;
		}
	}
	return n;
}

/** Per-TLD file counts across the census — the `--report` view. */
export function summarizeByTld(results: readonly FileTldRefs[]): Record<string, number> {
	const counts = new Map<string, number>();
	for (const r of results) {
		for (const tld of Object.keys(r.denied)) counts.set(tld, (counts.get(tld) ?? 0) + 1);
	}
	const out: Record<string, number> = {};
	for (const [tld, n] of [...counts.entries()].sort(
		(a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1),
	)) {
		out[tld] = n;
	}
	return out;
}
