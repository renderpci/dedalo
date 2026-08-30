/**
 * THE SECOND-CENSUS MEASURE — which files DERIVE each of the site-builder subsystem's
 * load-bearing facts.
 *
 * ── WHY A CENSUS AND NOT A RULE ─────────────────────────────────────────────────────────
 *
 * This subsystem has been rebuilt around one recurring defect, four times over: ONE FACT,
 * DERIVED IN TWO PLACES.
 *
 *   1. `schema.ts` and `layout.ts` each owned the constants — different bounds, so a
 *      manifest could pass one and be refused by the other.
 *   2. The daemon derived `<base>/<domain>` while the provisioner honoured
 *      `sites[].webspace` — the vhost served one path and the daemon wrote another. On the
 *      committed reference declaration the two really did disagree.
 *   3. `contentfulPaths()` was a hand-kept census of the rendered artifacts beside
 *      `RENDERERS`, and had already drifted: `sites.json` was written once and never
 *      drift-checked again.
 *   4. `isAvailable()` kept its own opinion of "configured" (`url && token`) while the
 *      resolver said otherwise — so the tool hid itself on exactly the topology the
 *      provisioner delivers.
 *
 * Every one was invisible to a green suite, and every fix deleted a derivation rather than
 * making one "more careful". What no individual fix can do is stop the FIFTH — and a fifth
 * was found: `render/sites.ts` and `site_table.ts` each assert, independently, that a row's
 * paths lie inside its webspace.
 *
 * So the general gate is a census: for each fact, WHICH FILES derive it. The set may only
 * shrink. A new file deriving a fact somebody else already owns is red by default, and the
 * only way to add one is a deliberate, reason-carrying diff.
 *
 * ── ONE IMPLEMENTATION ──────────────────────────────────────────────────────────────────
 *
 * This module is the measure and the only one. `scripts/site_builder_single_source_baseline.ts`
 * shapes it into the frozen artifact and diffs it; `test/unit/site_builder_single_source_tripwire.test.ts`
 * imports both. A gate that re-implemented the scan would be a second census of the second
 * censuses, which is a joke this subsystem has already earned the right not to hear.
 *
 * ── HONEST LIMITS, STATED ───────────────────────────────────────────────────────────────
 *
 *  - It measures TEXT, with comments blanked. A derivation reached through a helper whose
 *    own file is measured is caught by that file's row; one reached through an unmeasured
 *    tree is not.
 *  - A constructed spelling is invisible (`config['siteBuilder']['url']`). That is the
 *    standing limit of every source census in this repo, and the behavioural halves of the
 *    tripwire exist because of it: the ones that can be asked of running code are.
 *  - It says a file MENTIONS the fact, not that it mentions it wrongly. The row is an
 *    entitlement to derive, and the reason beside it is what a reviewer reads.
 *
 * HERMETIC: tracked-source reads only. No DB, no network, no clock.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const REPO_ROOT = join(import.meta.dir, '..', '..');

/** Directory names never worth walking. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.test-tmp']);

/**
 * The trees a fact may be derived in. Deliberately BOTH sides: the four defects each had
 * one derivation on the engine side or in the provisioner and the other in the daemon, so a
 * census that saw only one tree could not have caught any of them.
 */
export const SCAN_ROOTS: readonly string[] = [
	'publication/site_builder/src',
	'src/core/site_builder',
	'src/core/area_maintenance/widgets',
	'tools/tool_sitebuilder/server',
];

/** One measurable fact, and how a file is judged to derive it. */
export interface Fact {
	readonly id: string;
	/** What the fact IS — printed in the refusal, so a red gate explains itself. */
	readonly what: string;
	/** Why a second derivation of it is a defect and not a duplication. */
	readonly why: string;
	/** True when this file's (comment-stripped) source derives the fact. */
	readonly derives: (code: string, path: string) => boolean;
}

/**
 * THE NAMES `src/provision/layout.ts` OWNS.
 *
 * Read from layout.ts itself rather than listed: the point of the fact is that layout is
 * the single owner, and a list here would be a second census of its exports — the very
 * shape being refused. Only `const`/`function` exports count: a TYPE re-declared elsewhere
 * is a compile error, not a silent second derivation.
 */
export function layoutOwnedNames(): string[] {
	const source = strip(read('publication/site_builder/src/provision/layout.ts'));
	const names = new Set<string>();
	for (const match of source.matchAll(/^export\s+(?:const|function)\s+([A-Za-z_$][\w$]*)/gm)) {
		names.add(match[1] as string);
	}
	if (names.size < 20) {
		throw new Error(
			`site_builder_census: layout.ts yielded only ${names.size} owned names — the export ` +
				'scan is broken, and a census that measures nothing cannot refuse anything.',
		);
	}
	return [...names].sort();
}

/** A declaration of `name` in this file that is NOT an import of it. */
function declaresName(code: string, name: string): boolean {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(
		`^\\s*(?:export\\s+)?(?:const|let|var|function|class)\\s+${escaped}\\b`,
		'm',
	).test(code);
}

/**
 * THE FACTS. Each one is a question this subsystem has already answered twice at least
 * once, or would be able to.
 */
export const FACTS: readonly Fact[] = Object.freeze([
	{
		id: 'daemon_transport',
		what: 'IS THE SITE BUILDER CONFIGURED, AND WHERE IS THE DAEMON — the five DEDALO_SITE_BUILDER_* values read as an address plus a credential.',
		why: 'Defect 4. `isAvailable()` tested `url && token` while `resolveSiteBuilderTransport` accepted a socket, so the tool hid itself from every toolbar on exactly the topology the provisioner makes primary. Every consumer must ASK the resolver; a second reading of the raw keys is a second opinion about whether a museum has a site builder at all.',
		derives: (code) => /\bsiteBuilder\.(url|token|socket|instance)\b/.test(code),
	},
	{
		id: 'site_placement',
		what: "WHERE A SITE LIVES ON THIS HOST — a webspace derived from a base and a domain, rather than read from the provisioner's published site table.",
		why: "Defect 2, and the most expensive of the four: the vhosts served `/srv/legacy-www/archive-example` while the daemon published into `/home/www/archive.example.net`. Every file on the host looked correct and the museum's page simply never changed. The provisioner OWNS the placement and publishes it in sites.json; the daemon reads it and derives nothing.",
		derives: (code) =>
			/\bwebspaceFor\s*\(/.test(code) || /\bWEBSPACE_BASE\b[\s\S]{0,120}\bdomain\b/.test(code),
	},
	{
		id: 'pairing_fingerprint',
		what: 'THE PAIRING RECIPE — sha256("dedalo-site-instance:" + instance + "\\n" + token).',
		why: 'It is spelled TWICE on purpose: the engine and the daemon are separate deployables sharing no module, and a shared module is not available to them. That is the one licensed second derivation in the subsystem, and the licence is conditional — the two are RUN side by side and must agree. A THIRD spelling would be a copy nothing compares.',
		derives: (code) =>
			/dedalo-site-instance:/.test(code) &&
			/(CryptoHasher|createHash)\s*\(\s*['"]sha256['"]\s*\)/.test(code),
	},
	{
		id: 'layout_constants',
		what: "THE INSTANCE LAYOUT'S CONSTANTS AND GRAMMARS — the instance-name pattern, the user prefix, the marker filename, the default paths, the mode matrix, the surface names.",
		why: 'Defect 1. `schema.ts` and `layout.ts` each declared them with DIFFERENT bounds, so a declaration could pass validation and be refused by derivation (or worse, the reverse). `layout.ts` is the owner; every other module imports. A file that declares a name layout exports has forked the grammar, whatever the value happens to be today.',
		derives: (code, path) => {
			if (path === 'publication/site_builder/src/provision/layout.ts') return false;
			return layoutOwnedNames().some((name) => declaresName(code, name));
		},
	},
	{
		id: 'rendered_artifact_census',
		what: 'WHICH ARTIFACTS THIS SUBSYSTEM WRITES — the set of files a host must hold for one museum.',
		why: "Defect 3. `contentfulPaths()` was a hand-kept list beside `RENDERERS` and had already drifted: the site table was added as a sixth artifact and never added there, so `sites.json` was written once and never drift-checked again — a hand edit to the file that tells the daemon where every museum's webspace is would have been invisible to `check`. The census must be DERIVED from the renderer registry; `render/index.ts` is its only owner.",
		derives: (code, path) => {
			if (path === 'publication/site_builder/src/provision/render/index.ts') return false;
			// A file that enumerates the RENDERERS is keeping a second list of them.
			const rendererMentions = (code.match(/\b\w+Renderer\b/g) ?? []).length;
			if (rendererMentions >= 3) return true;

			// …and a file that enumerates the artifact PATHS is keeping the same list under
			// another name. This is the shape defect 3 actually had, and the renderer count
			// scores it ZERO: `contentfulPaths()` named no renderer, it named
			// layout.unitPath / envFile / engineFragment / the vhost paths. A hand-kept list
			// that is CORRECT on the day it is written is invisible to any drift comparison —
			// it only becomes defect 3 later, when an artifact is added and this copy is not.
			// So the census refuses the shape, not the drift.
			const ARTIFACT_PATH_FIELDS = [
				'unitPath',
				'envFile',
				'siteTablePath',
				'engineFragment',
				'vhostPaths',
				'htpasswd',
			];
			const named = ARTIFACT_PATH_FIELDS.filter((field) =>
				new RegExp(`\\.${field}\\b`).test(code),
			).length;
			return named >= 3;
		},
	},
]);

/** Read a repo-relative file. */
function read(rel: string): string {
	return readFileSync(join(REPO_ROOT, rel), 'utf8');
}

/**
 * Source with comments blanked.
 *
 * The prose EXPLAINS every one of these facts at length — this subsystem's headers are the
 * reason the defects were findable at all — and a census that counted prose would report
 * every well-documented file as a second derivation.
 */
export function strip(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Every measured file, repo-relative, in codepoint order. */
export function scannedFiles(): string[] {
	const found: string[] = [];
	for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root), found);
	return found.map((path) => relative(REPO_ROOT, path).split(sep).join('/')).sort();
}

function walk(dir: string, into: string[]): void {
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return;
	}
	for (const name of entries) {
		if (SKIP_DIRS.has(name)) continue;
		const path = join(dir, name);
		if (statSync(path).isDirectory()) walk(path, into);
		else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) into.push(path);
	}
}

/** fact id → the files that derive it, in codepoint order. */
export function census(): Record<string, string[]> {
	const out: Record<string, string[]> = {};
	for (const fact of FACTS) out[fact.id] = [];
	for (const path of scannedFiles()) {
		const code = strip(read(path));
		for (const fact of FACTS) {
			if (fact.derives(code, path)) (out[fact.id] as string[]).push(path);
		}
	}
	return out;
}
