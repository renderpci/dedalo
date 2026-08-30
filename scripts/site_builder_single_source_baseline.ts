/**
 * THE SECOND-CENSUS BASELINE — generator and drift checker for
 * test/unit/site_builder_single_source_tripwire.test.ts.
 *
 *   bun run scripts/site_builder_single_source_baseline.ts           # rewrite the artifact
 *   bun run scripts/site_builder_single_source_baseline.ts --check   # print drift, exit 1
 *
 * ── WHAT IT FREEZES ─────────────────────────────────────────────────────────────────────
 *
 * For each load-bearing fact of the site-builder subsystem, WHICH FILES derive it. The set
 * may only SHRINK. A file deriving a fact its entry does not list is red; a file that stops
 * deriving one while the entry still claims it is red too (staleness loosens a ratchet
 * silently, which is the failure mode of every baseline nobody regenerates).
 *
 * Two facts are frozen NON-EMPTY, because they have a legitimate owner and an empty list
 * would make the measure unfalsifiable: `daemon_transport` (the resolver) and
 * `site_placement` (the layout that derives the default). One is frozen at TWO —
 * `pairing_fingerprint`, whose second spelling is licensed precisely because the two are
 * separate deployables and are RUN side by side by the pairing tripwire. The rest are
 * frozen EMPTY: they have a single owner that the measure excludes by name, so any file at
 * all appearing in them is a second derivation.
 *
 * ── THE ANTI-LAUNDERING GUARD ───────────────────────────────────────────────────────────
 *
 * Without `--allow-regression` this refuses to absorb growth. Adding an owner is a
 * deliberate diff whose REASON goes in the entry, and whose justification goes in the
 * commit message. There is no way to get green by editing the JSON: the gate recomputes.
 *
 * ONE IMPLEMENTATION: the measure is scripts/lib/site_builder_census.ts and nothing else.
 * HERMETIC: tracked-source reads only. No DB, no network, no clock.
 */

import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { census, FACTS, REPO_ROOT, scannedFiles } from './lib/site_builder_census.ts';

export const BASELINE_PATH = 'engineering/site_builder_single_source_baseline.json';

export interface FactEntry {
	/** What the fact is — carried into the artifact so it reads without the source. */
	readonly what: string;
	/** Why a second derivation is a defect. */
	readonly why: string;
	/** The files entitled to derive it, in codepoint order. */
	readonly owners: string[];
	/** One line per owner: why THAT file is allowed to. */
	readonly reasons: Record<string, string>;
}

export interface Baseline {
	readonly generated_by: string;
	readonly rule: string;
	readonly scanned_files: number;
	readonly facts: Record<string, FactEntry>;
}

/**
 * WHY EACH CURRENT OWNER IS ONE. Written here rather than discovered, because an
 * entitlement is a judgement and a judgement needs a sentence. An owner with no reason is
 * refused by the gate.
 */
const REASONS: Record<string, Record<string, string>> = {
	daemon_transport: {
		'src/core/site_builder/pairing.ts':
			'THE resolver. It is the one place the five DEDALO_SITE_BUILDER_* values are read as an address plus a credential, and every consumer (the tool, its daemon client, the ops panel, the ownership ledger) asks it rather than the keys.',
	},
	site_placement: {
		'publication/site_builder/src/provision/layout.ts':
			"THE owner. `derive()` computes a site's webspace — the declaration's override when it states one, `<webspace_base>/<domain>` when it does not — and PUBLISHES the answer in sites.json. The daemon reads that file and derives nothing.",
	},
	pairing_fingerprint: {
		'src/core/site_builder/pairing.ts':
			"The ENGINE's half. It cannot import the daemon's: they are separate deployables sharing no module.",
		'publication/site_builder/src/security/pairing.ts':
			"The DAEMON's half, for the same reason. The licence for this second spelling is conditional and the condition is mechanical: test/unit/site_builder_pairing_tripwire.test.ts imports BOTH and compares their output on the same inputs, so the equality is proved rather than promised.",
	},
	layout_constants: {},
	rendered_artifact_census: {
		'publication/site_builder/src/provision/fleet.ts':
			'A DIFFERENT census, deliberately. pathClaims() enumerates what one instance EXCLUSIVELY OWNS on a shared host — roots, socket, unit, htpasswd, vhosts — which is a superset of the artifacts and answers a different question (may two museums collide?). Deriving it from renderAll() would silently drop the roots and the socket, the collisions that matter most.',
		'publication/site_builder/src/provision/plan.ts':
			'CONSUMER, not a census. It derives the artifact set from renderAll() in observedPaths(); the two remaining named fields (unitPath, envFile) decide whether a daemon-reload is needed, and htpasswd is a plan action of its own. Naming three artifacts to make a decision is not keeping a list of them.',
	},
};

function build(): Baseline {
	const measured = census();
	const facts: Record<string, FactEntry> = {};
	for (const fact of FACTS) {
		const owners = (measured[fact.id] ?? []).slice().sort();
		facts[fact.id] = {
			what: fact.what,
			why: fact.why,
			owners,
			reasons: Object.fromEntries(
				owners.map((owner) => [owner, REASONS[fact.id]?.[owner] ?? '(NO REASON RECORDED)']),
			),
		};
	}
	return {
		generated_by: 'bun run scripts/site_builder_single_source_baseline.ts',
		rule: "SHRINK-ONLY. A fact's owner set may lose files, never gain them. A file deriving a fact it does not own is red; an entry naming a file that no longer derives it is red. Regenerating requires --allow-regression to absorb growth, and the reason belongs in the entry and in the commit message.",
		scanned_files: scannedFiles().length,
		facts,
	};
}

export function readBaseline(): Baseline | null {
	try {
		return JSON.parse(readFileSync(join(REPO_ROOT, BASELINE_PATH), 'utf8')) as Baseline;
	} catch {
		// Absent only on the run that mints it. The gate treats a missing baseline as RED —
		// a ratchet whose artifact is gone is not a loose ratchet, it is no ratchet.
		return null;
	}
}

/** Drift lines — empty when the frozen artifact and the measure agree. */
export function drift(): string[] {
	const frozen = readBaseline();
	if (frozen === null) return [`MISSING ${BASELINE_PATH} — run the generator`];
	const current = build();
	const lines: string[] = [];
	for (const fact of FACTS) {
		const was = new Set(frozen.facts[fact.id]?.owners ?? []);
		const now = new Set(current.facts[fact.id]?.owners ?? []);
		for (const path of [...now].sort()) {
			if (!was.has(path)) lines.push(`GROWTH  ${fact.id}: ${path} now derives this fact`);
		}
		for (const path of [...was].sort()) {
			if (!now.has(path)) lines.push(`STALE   ${fact.id}: ${path} no longer derives it`);
		}
		for (const [path, reason] of Object.entries(frozen.facts[fact.id]?.reasons ?? {})) {
			if (reason === '(NO REASON RECORDED)') {
				lines.push(`NOREASON ${fact.id}: ${path} is listed with no reason`);
			}
		}
	}
	if (frozen.scanned_files !== current.scanned_files) {
		lines.push(
			`SCOPE   the census now scans ${current.scanned_files} files, the baseline froze ${frozen.scanned_files}`,
		);
	}
	return lines;
}

/**
 * The bytes Biome would print for this JSON.
 *
 * Biome inlines a short array and this generator does not, so without it the repository
 * oscillates between two spellings of the same artifact: the generator writes one, `biome
 * check --write` rewrites it, and the next `--check` reports drift that is not drift.
 * Formatting is asked of the tool that owns the answer — the same rule this whole gate is
 * about.
 */
function formatJson(text: string): string {
	const result = Bun.spawnSync(['bunx', 'biome', 'format', '--stdin-file-path=baseline.json'], {
		cwd: REPO_ROOT,
		stdin: Buffer.from(text, 'utf8'),
		stdout: 'pipe',
		stderr: 'pipe',
	});
	if (result.exitCode !== 0) {
		throw new Error(
			`site_builder_single_source_baseline: biome could not format the artifact ` +
				`(${result.stderr.toString().trim()}). Nothing was written.`,
		);
	}
	return result.stdout.toString();
}

if (import.meta.main) {
	const args = new Set(Bun.argv.slice(2));
	if (args.has('--check')) {
		const lines = drift();
		if (lines.length === 0) {
			console.log('site-builder single-source census: no drift.');
			process.exit(0);
		}
		for (const line of lines) console.log(line);
		process.exit(1);
	}
	const growth = drift().filter((line) => line.startsWith('GROWTH'));
	if (growth.length > 0 && !args.has('--allow-regression')) {
		console.error(`REFUSING to absorb a new derivation:\n${growth.join('\n')}`);
		console.error(
			'\nA second derivation of one fact is the defect this subsystem was rebuilt around, four ' +
				'times over. Delete the derivation, or re-run with --allow-regression and say why in ' +
				'the entry and in the commit message.',
		);
		process.exit(1);
	}
	// Written through Biome's own formatter, so the artifact a generator produces is the
	// artifact `biome check` accepts. A generated file the linter then rewrites is a file
	// whose bytes depend on which of the two ran last.
	const formatted = formatJson(`${JSON.stringify(build(), null, '\t')}\n`);
	writeFileSync(join(REPO_ROOT, BASELINE_PATH), formatted, 'utf8');
	console.log(`wrote ${BASELINE_PATH}`);
}
