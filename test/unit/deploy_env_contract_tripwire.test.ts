/**
 * deploy_env_contract_tripwire — A SHIPPED UNIT MAY ONLY READ VARIABLES THAT
 * EXIST ON A REAL HOST (P0-13, 2026-08-30).
 *
 * THE DEFECT THIS CLOSES, measured. `deploy/dedalo-backup.service` shipped with
 *
 *     ExecStart=… pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME …
 *
 * under `EnvironmentFile=/opt/dedalo/private/.env`. The install wizard does not
 * write those names: `src/core/install/config_persist.ts` writes the
 * PHP-catalog spellings (`DEDALO_HOSTNAME_CONN`, `DEDALO_USERNAME_CONN`,
 * `DEDALO_DATABASE_CONN`, `DEDALO_PASSWORD_CONN`), and `MEDIA_PATH` only when
 * the CLI installer was given `--media-path`. systemd expands an unset variable
 * to the EMPTY STRING, so on a wizard-installed host the nightly backup ran as
 * the wrong role against the wrong server and produced nothing — while the
 * maintenance panel, which only asks whether a file exists and is non-empty,
 * reported a fresh restore point and let the operator authorise a code update
 * on the strength of it. A museum may hold ONE copy of its catalogue.
 *
 * The `DB_*` names are not imaginary: they ARE real keys of the typed config
 * catalog (`src/config/catalog/db.ts`), which is exactly why the mistake was
 * invisible to a reader. `src/config/env.ts::PHP_KEY_ALIASES` resolves the two
 * spellings onto each other — but that resolution lives in the TS ENGINE. No
 * part of it exists inside systemd or /bin/sh, so what a shipped unit gets is
 * the literal name and nothing else. That gap is what the two rules below
 * separate.
 *
 * NO GATE HELD THIS CONTRACT before P0-13, and none read `deploy/` as a TREE.
 * The nearest neighbour, `test/unit/operator_commands_tripwire.test.ts`, reads
 * exactly two of the eighteen files by name (leg E: the backup unit's store
 * tokens against PRODUCTION.md §6; leg F: the site-builder backup script's
 * behaviour), and leg H — added the same day as this file — checks the `--*-key`
 * ARGUMENTS the rebuilt unit now passes. None of them looks at `$VAR`
 * expansions, and nothing at all looked at the other sixteen files.
 *
 * ── WHAT IS ASSERTED ────────────────────────────────────────────────────────
 *
 *  A. THE EXTRACTOR ITSELF, against a synthetic sample, in BOTH directions —
 *     it must find the reference forms and it must NOT find the non-references
 *     (a local assignment, `$1`, `$@`, a command substitution, a comment). A
 *     scanner that finds nothing would make every leg below vacuously green.
 *  B. ANTI-VACUITY FLOORS on the real scan: how many files, how many raw
 *     references, how many distinct externally-sourced names.
 *  C. RULE R1 — a name a file reads with NO shell default anywhere in that file
 *     must be one the INSTALLER WRITES, or one a shipped unit sets with its own
 *     `Environment=` line. Catalog membership is deliberately NOT enough here:
 *     that is precisely the `$DB_HOST` defect. Positive control: the historical
 *     ExecStart line is replayed as a fixture and must be reported as five
 *     violations, while its correct form is accepted.
 *  D. RULE R2 — EVERY reference, defaulted ones included, must additionally be
 *     a documented key (the typed catalog or the runtime bootstrap keys) or an
 *     exemption. `${FOO:-/some/path}` cannot expand to a surprise empty string,
 *     so a documented-but-not-installer-written key is legitimate there; an
 *     UNDOCUMENTED name still has to be declared here with a reason.
 *  E. THE EXEMPTION LIST is small, reason-bearing, and STALE-FREE: an exempt
 *     name that `deploy/` no longer references fails, which is what makes the
 *     list shrink-only in practice.
 *  F. THE PROVIDED SETS ARE REAL — each derivation is checked against a key it
 *     must contain, so a parser that silently returns {} (renamed file, changed
 *     literal style) fails LOUDLY instead of turning C and D into a rubber
 *     stamp by making everything a violation… or, worse, by making the census
 *     look complete.
 *
 * ── CENSUS: TOTAL over deploy/, DERIVED on both sides ───────────────────────
 *
 * The referenced side is read off every `*.sh`, `*.service` and `*.timer` in
 * `deploy/` (listed with readdirSync — never enumerated here). The provided
 * side is parsed out of `config_persist.ts`, imported from `CONFIG_CATALOG` and
 * `RUNTIME_PATH_BOOTSTRAP_KEYS`, and read off the units' own `Environment=`
 * lines. Nothing on either side is typed out by hand.
 *
 * ── HONEST LIMITS (things this gate does NOT prove) ─────────────────────────
 *
 *  1. IT IS A STATIC READ. It proves a name is written SOMEWHERE by the
 *     installer, not that it holds a usable value, that the backup runs, that
 *     the dump restores, or that systemd parses the unit. Nothing here was run
 *     under systemd (this repo is developed on macOS).
 *  2. CONDITIONAL WRITES COUNT AS WRITES. `MEDIA_PATH` and
 *     `SERVER_UNIX_SOCKET` are written by `config_persist.ts` only when the CLI
 *     installer received the flag; the parser cannot see that condition. The
 *     tree's only consumer of `MEDIA_PATH` today resolves it itself and refuses
 *     loudly when unset (`deploy/dedalo-tree-backup.sh`), so the gap is covered
 *     by the script, not by this file.
 *  3. IT DOES NOT READ `--*-key` ARGUMENTS. `dedalo-backup.service` passes key
 *     NAMES as argv (`--db-key DB_NAME`) and `dedalo-db-backup.sh` resolves
 *     them in shell with the engine's TS-name-then-PHP-alias precedence. Those
 *     are not `$VAR` expansions and are held by leg H of
 *     `test/unit/operator_commands_tripwire.test.ts`, not here.
 *  4. FULL-LINE COMMENTS ARE SKIPPED, deliberately: `dedalo-backup.service`'s
 *     header quotes `$DB_PASSWORD` while explaining this very defect, and a
 *     scanner that read comments would go red on the fix. Mid-line comments are
 *     NOT stripped (a `#` inside a shell string cannot be told from a comment
 *     without a parser), so a reference in a trailing comment is still counted
 *     — over-reporting, which is the safe direction.
 *  5. ASSIGNMENT MASKING IS ORDER-BLIND. A name assigned anywhere in a file is
 *     treated as local to it. A script that read a variable from the
 *     environment BEFORE assigning it would be missed.
 *  6. SCOPE IS `deploy/` UNITS AND SHELL SCRIPTS. `deploy/*.conf` (nginx's
 *     `$host`, `$request_uri` are web-server variables, not environment) and
 *     the compose stacks are out of scope; a compose `environment:` block is a
 *     different contract with a different provider.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CONFIG_CATALOG } from '../../src/config/catalog/index.ts';
import { RUNTIME_PATH_BOOTSTRAP_KEYS } from '../../src/core/install/runtime_paths.ts';

const ROOT = resolve(import.meta.dir, '../..');
const DEPLOY = join(ROOT, 'deploy');

/**
 * Variables that legitimately come from somewhere other than the installer or
 * the config catalog. ENUMERATED, SHRINK-ONLY, one reason each — and leg E
 * refuses a stale entry, so removing the last reference removes the exemption.
 */
const EXTERNAL_VARIABLES: ReadonlyMap<string, string> = new Map([
	[
		'HOME',
		'deploy.sh sends `\\$HOME/.bun/bin/bun` to the far side of an ssh command — escaped, so it is expanded by the REMOTE login shell as the deploy user, not by this host and not from ../private/.env',
	],
	[
		'TMPDIR',
		'POSIX environment, read by dedalo-tls-rotate.sh as `${TMPDIR:-/tmp}` for a mktemp -d staging directory that lives for one run',
	],
	[
		'RUNTIME_DIRECTORY',
		"systemd sets it from the unit's own `RuntimeDirectory=` (dedalo-backup.service declares one); it is the per-run status directory systemd creates and removes, so no installer could write it — the script falls back to /run/dedalo-backup when it is absent",
	],
	[
		'DEDALO_BACKUP_STATUS_DIR',
		'Override knob for the same per-run status directory, so the backup step runner can be exercised outside systemd (its behavioural gates do exactly that). It is not an engine config key — nothing in src/ reads it — and it is read as `${…:-}` behind the RUNTIME_DIRECTORY fallback',
	],
	[
		'DEDALO_BACKUP_MAILTO',
		'Deliberately NOT a .env key: ../private/.env is append-only/documented-keys-only, and the failure alarm must still work when the engine cannot start. Set with `systemctl edit` on dedalo-backup-alert@.service, whose commented Environment= line documents it. Read as `${…:-}`, so unset simply means the optional local-mail channel is off',
	],
	[
		'DEDALO_IMAGE_UPDATE_MODE',
		"The env spelling of dedalo-image-update.sh's own `--mode` flag (pull|build) for the docker stacks. It configures that helper script, not the engine, so it has no catalog entry; read as `${…:-}` and overridden by the flag",
	],
]);

// ── the extractor ──────────────────────────────────────────────────────────

interface Reference {
	readonly name: string;
	readonly file: string;
	readonly line: number;
	/** `${NAME:-…}` / `:=` / `:?` — a form that cannot silently expand to empty. */
	readonly defaulted: boolean;
}

interface ScanResult {
	readonly references: readonly Reference[];
	/** Names the file assigns itself, i.e. NOT read from the environment. */
	readonly assigned: ReadonlySet<string>;
	/** `Environment=NAME=` names a systemd unit provides to what it starts. */
	readonly provides: ReadonlySet<string>;
}

/**
 * `$NAME`, `${NAME…}` and `${#NAME}`. The `{`-form's next character decides
 * whether the read carries a default: `:-`, `:=`, `:?` (and their `:`-less
 * spellings) cannot produce a silent empty string; `}`, `#`, `%`, `/` can.
 */
const REFERENCE_RE = /\$(\{#?)?([A-Za-z_][A-Za-z0-9_]*)([^}]?)/g;

/** Shell assignments, `for NAME in`, `read [-flags] NAME`. */
const ASSIGN_RE =
	/(?:^|[\s;&|(){}]|\b(?:local|export|readonly|declare|typeset)\s+)([A-Za-z_][A-Za-z0-9_]*)\s*=/g;
const FOR_RE = /\bfor\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\b/g;
const READ_RE = /\bread\s+(?:-\w+\s+)*([A-Za-z_][A-Za-z0-9_]*)/g;
/** A systemd unit setting a variable for the process it starts. */
const UNIT_ENV_RE = /^\s*Environment=["']?([A-Za-z_][A-Za-z0-9_]*)=/;

function scan(text: string, file: string, isUnit: boolean): ScanResult {
	const references: Reference[] = [];
	const assigned = new Set<string>();
	const provides = new Set<string>();
	const lines = text.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] as string;
		// See honest limit 4: a full-line comment is not code.
		if (/^\s*#/.test(line)) continue;
		if (isUnit) {
			const env = UNIT_ENV_RE.exec(line);
			if (env) provides.add(env[1] as string);
		} else {
			for (const m of line.matchAll(ASSIGN_RE)) assigned.add(m[1] as string);
			for (const m of line.matchAll(FOR_RE)) assigned.add(m[1] as string);
			for (const m of line.matchAll(READ_RE)) assigned.add(m[1] as string);
		}
		for (const m of line.matchAll(REFERENCE_RE)) {
			const braced = m[1] !== undefined;
			const name = m[2] as string;
			const after = m[3] ?? '';
			const defaulted = braced && /^[:\-=?+]/.test(after);
			references.push({ name, file, line: i + 1, defaulted });
		}
	}
	return { references, assigned, provides };
}

/** `*.sh`, `*.service`, `*.timer` under deploy/ — LISTED, never enumerated. */
const DEPLOY_FILES = readdirSync(DEPLOY)
	.filter((f) => /\.(sh|service|timer)$/.test(f))
	.sort();

const SCANS = DEPLOY_FILES.map((f) => ({
	file: f,
	isUnit: /\.(service|timer)$/.test(f),
	...scan(readFileSync(join(DEPLOY, f), 'utf8'), f, /\.(service|timer)$/.test(f)),
}));

/** Every reference whose name the SAME file does not assign itself. */
const EXTERNAL_REFERENCES: readonly Reference[] = SCANS.flatMap((s) =>
	s.references.filter((r) => !s.assigned.has(r.name)),
);

// ── the provided sets ──────────────────────────────────────────────────────

/**
 * Keys the install wizard actually writes into ../private/.env, parsed out of
 * the emitting module. Comment lines are dropped first: its header discusses a
 * literal `KEY=value` while explaining the arbitrary-key-injection guard.
 */
function installerWrittenKeys(): ReadonlySet<string> {
	const src = readFileSync(join(ROOT, 'src/core/install/config_persist.ts'), 'utf8');
	const keys = new Set<string>();
	for (const line of src.split('\n')) {
		if (/^\s*(\*|\/\/|\/\*)/.test(line)) continue;
		for (const m of line.matchAll(/[`'"]([A-Z][A-Z0-9_]{2,})=/g)) keys.add(m[1] as string);
	}
	return keys;
}

const INSTALLER_WRITTEN = installerWrittenKeys();
const UNIT_PROVIDED = new Set(SCANS.flatMap((s) => [...s.provides]));
const CATALOG_KEYS = new Set(Object.keys(CONFIG_CATALOG));
const BOOTSTRAP_KEYS = new Set(RUNTIME_PATH_BOOTSTRAP_KEYS);

/** R1's providers: something on a real host definitely sets the name. */
function providedOnHost(name: string): boolean {
	return INSTALLER_WRITTEN.has(name) || UNIT_PROVIDED.has(name);
}
/** R2's providers: the above, plus names an operator is DOCUMENTED to set. */
function documented(name: string): boolean {
	return providedOnHost(name) || CATALOG_KEYS.has(name) || BOOTSTRAP_KEYS.has(name);
}

/**
 * R1 violations in a scanned file's references: a name read with no default
 * ANYWHERE in that file (`[ -n "${X:-}" ]` before a bare `$X` is a sound and
 * used idiom, so one defaulted read makes the whole file's reads guarded).
 */
function unguardedUnprovided(scanned: {
	references: readonly Reference[];
	assigned: ReadonlySet<string>;
}): string[] {
	const guarded = new Set(scanned.references.filter((r) => r.defaulted).map((r) => r.name));
	const bad = new Set<string>();
	for (const r of scanned.references) {
		if (scanned.assigned.has(r.name)) continue;
		if (guarded.has(r.name)) continue;
		if (EXTERNAL_VARIABLES.has(r.name)) continue;
		if (!providedOnHost(r.name)) bad.add(r.name);
	}
	return [...bad].sort();
}

// ── legs ───────────────────────────────────────────────────────────────────

describe('deploy_env_contract_tripwire', () => {
	test('A. the extractor finds the reference forms — and nothing that is not one', () => {
		const sample = [
			'# a comment mentioning $COMMENT_ONLY must not count (honest limit 4)',
			'LOCAL_ONE="value"',
			'echo "$LOCAL_ONE $BARE ${BRACED} ${WITH_DEFAULT:-x} ${TRIMMED%/} ${#COUNTED}"',
			'printf "%s" "$1" "$@" "$(date)" "$$"',
			'for LOOP_VAR in a b; do echo "$LOOP_VAR"; done',
		].join('\n');
		const s = scan(sample, 'sample.sh', false);
		const names = s.references.map((r) => r.name);

		expect(names).toContain('BARE');
		expect(names).toContain('BRACED');
		expect(names).toContain('WITH_DEFAULT');
		expect(names).toContain('TRIMMED');
		expect(names).toContain('COUNTED');
		// The negative half: a scanner that matched these would be over-eager.
		expect(names).not.toContain('COMMENT_ONLY');
		expect(names).not.toContain('date');

		// Only the `:-` form is a guarded read.
		const defaulted = s.references.filter((r) => r.defaulted).map((r) => r.name);
		expect(defaulted).toEqual(['WITH_DEFAULT']);

		// Locally assigned names are not environment reads.
		expect(s.assigned.has('LOCAL_ONE')).toBe(true);
		expect(s.assigned.has('LOOP_VAR')).toBe(true);
		expect(s.assigned.has('BARE')).toBe(false);

		// A unit's Environment= line PROVIDES a name to what it starts.
		const unit = scan(
			[
				'[Service]',
				'Environment=PROVIDED_BY_UNIT=/opt/x',
				'ExecStart=/bin/x $PROVIDED_BY_UNIT',
			].join('\n'),
			'sample.service',
			true,
		);
		expect([...unit.provides]).toEqual(['PROVIDED_BY_UNIT']);
		expect(unit.references.map((r) => r.name)).toEqual(['PROVIDED_BY_UNIT']);
	});

	test('B. the scan is not empty — floors on files, references and external names', () => {
		// MEASURED 2026-08-30: 18 files (10 shell scripts, 6 .service, 2 .timer),
		// 573 raw references over 138 distinct names, of which 8 are read from the
		// environment rather than assigned locally. The floors sit below those so
		// ordinary edits do not trip them, and far above zero so an extractor that
		// stopped matching cannot pass.
		expect(DEPLOY_FILES.length).toBeGreaterThanOrEqual(15);
		expect(DEPLOY_FILES.filter((f) => f.endsWith('.sh')).length).toBeGreaterThanOrEqual(8);
		expect(DEPLOY_FILES.filter((f) => f.endsWith('.service')).length).toBeGreaterThanOrEqual(4);
		expect(SCANS.flatMap((s) => s.references).length).toBeGreaterThanOrEqual(300);
		expect(new Set(EXTERNAL_REFERENCES.map((r) => r.name)).size).toBeGreaterThanOrEqual(6);
	});

	test('C. R1 — an undefaulted read must be installer-written or unit-provided', () => {
		const offenders = SCANS.flatMap((s) => unguardedUnprovided(s).map((n) => `${s.file}: $${n}`));
		expect(offenders).toEqual([]);
	});

	test('C. R1 positive control — the historical ExecStart is caught, the fixed one is not', () => {
		// The line deploy/dedalo-backup.service shipped before P0-13. Every one of
		// these five names expanded to the empty string on a wizard-installed host.
		const broken = scan(
			[
				'[Service]',
				'EnvironmentFile=/opt/dedalo/private/.env',
				'ExecStart=/usr/bin/pg_dump -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -Fc -f /backup/db.backup',
				'ExecStart=/usr/bin/rsync -a --delete $MEDIA_PATH/ /backup/media/',
			].join('\n'),
			'broken.service',
			true,
		);
		expect(unguardedUnprovided(broken)).toEqual(['DB_HOST', 'DB_NAME', 'DB_PORT', 'DB_USER']);
		// MEDIA_PATH is NOT in that list, and the reason is honest limit 2: the
		// installer writes it when the CLI carried --media-path, so this gate
		// cannot call it absent. The refusal for that one lives in the script.
		expect(INSTALLER_WRITTEN.has('MEDIA_PATH')).toBe(true);

		// The same connection written in the spellings the wizard really emits is
		// accepted — otherwise the rule would just be "no variables at all".
		const fixed = scan(
			[
				'[Service]',
				'ExecStart=/usr/bin/pg_dump -h $DEDALO_HOSTNAME_CONN -U $DEDALO_USERNAME_CONN -d $DEDALO_DATABASE_CONN',
			].join('\n'),
			'fixed.service',
			true,
		);
		expect(unguardedUnprovided(fixed)).toEqual([]);
	});

	test('D. R2 — every reference is documented somewhere or exempted with a reason', () => {
		const undeclared = new Map<string, string>();
		for (const r of EXTERNAL_REFERENCES) {
			if (documented(r.name) || EXTERNAL_VARIABLES.has(r.name)) continue;
			if (!undeclared.has(r.name)) undeclared.set(r.name, `${r.file}:${r.line}`);
		}
		expect([...undeclared].map(([n, at]) => `$${n} (${at})`)).toEqual([]);
	});

	test('E. the exemption list is reasoned and stale-free', () => {
		const referenced = new Set(EXTERNAL_REFERENCES.map((r) => r.name));
		const stale = [...EXTERNAL_VARIABLES.keys()].filter((n) => !referenced.has(n));
		// An exemption nothing reads any more is a licence left lying around;
		// removing the reference must remove the entry, which is what keeps this
		// list shrink-only.
		expect(stale).toEqual([]);
		for (const [name, reason] of EXTERNAL_VARIABLES) {
			expect(reason.length, `${name} needs a substantive reason`).toBeGreaterThan(60);
		}
		// Small, and it stays small: raise this only with the entry, never ahead of it.
		expect(EXTERNAL_VARIABLES.size).toBeLessThanOrEqual(6);
	});

	test('F. the provided sets really parsed something', () => {
		// A parser that returns {} would make legs C/D fail loudly rather than
		// silently — but a parser that returns everything would not. Pin both the
		// floor and a key each source MUST and MUST NOT carry.
		expect(INSTALLER_WRITTEN.size).toBeGreaterThanOrEqual(30);
		expect(INSTALLER_WRITTEN.has('DEDALO_PASSWORD_CONN')).toBe(true);
		// The heart of the defect: the wizard writes the PHP spelling and NOT the
		// TS-native one, and PHP_KEY_ALIASES does not exist inside systemd.
		expect(INSTALLER_WRITTEN.has('DB_PASSWORD')).toBe(false);
		expect(CATALOG_KEYS.has('DB_PASSWORD')).toBe(true);
		expect(CATALOG_KEYS.size).toBeGreaterThanOrEqual(100);
		expect(BOOTSTRAP_KEYS.has('DEDALO_PRIVATE_DIR')).toBe(true);
		expect(UNIT_PROVIDED.has('DEDALO_BACKUP_STATE_DIR')).toBe(true);
	});
});
