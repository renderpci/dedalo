/**
 * TRIPWIRE — the TS migration lane may touch SHARED rows only as a TAGGED,
 * PINNED seed-defect correction (2026-08-16).
 *
 * WHY THIS EXISTS. `install/db/migrate.ts` is the boot runner for the
 * `dedalo_ts_*` tables this server OWNS. The shared schema — `matrix_*`,
 * `dd_ontology*` — has its own write law: `db/matrix_write.ts` +
 * `ontology/ontology_write.ts`, tx-wrapped and TM-audited, confined by
 * `sql_confinement_tripwire`. That tripwire greps `src/` + `tools/` ONLY, so a
 * `.sql` file under `install/db/migrations/` can UPDATE a shared row at boot
 * outside every chokepoint and no gate notices. `0004_dd560_drop_view_tree.sql`
 * did exactly that — correctly (one row, `@>`-pinned to the exact defective
 * value, no TM by design) — and thereby set a precedent: the NEXT such file
 * might not be pinned, might not be a single row, might not be a correction.
 *
 * THE RULE (stated in migrate.ts's scope header, which this gate reads back so
 * the docs and the gate cannot disagree): shared-schema DML rides the migration
 * lane ONLY as a "SEED-DEFECT CORRECTION on shared rows", and such a statement
 * MUST (1) be an UPDATE — never INSERT / DELETE / TRUNCATE / ALTER / DROP /
 * CREATE on a shared table (a seed is shipped through the ontology, a purge is
 * a tool, a schema change is the installer's); (2) carry the TAG comment
 * `-- SHARED-ROW SEED CORRECTION:` with a reason, in the file; (3) pin its
 * WHERE with a jsonb `@>` containment on the exact defective value, so an
 * operator who has since changed the row (or already fixed it) is never
 * overwritten. Comments are stripped before the DML scan; the tag is looked
 * for in the raw text.
 *
 * ANTI-VACUITY: 0004 is pinned as the positive control (it must be found, it
 * must be tagged, its UPDATEs must be `@>`-pinned), and every matcher fires on
 * a synthetic offender.
 *
 * HERMETIC: filesystem reads of tracked files only. No DB, no network.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(import.meta.dir, '..', '..');
const MIGRATIONS_DIR = join(REPO, 'install', 'db', 'migrations');
const RUNNER = join(REPO, 'install', 'db', 'migrate.ts');

/** The tag a shared-row correction file MUST carry (verbatim, a `--` comment). */
const SHARED_ROW_CORRECTION_TAG = '-- SHARED-ROW SEED CORRECTION:';

/** The shared-schema tables the TS-owned lane does not own. */
const SHARED_TABLE = String.raw`(?:public\.)?(?:matrix_[a-z0-9_]*|matrix|dd_ontology[a-z0-9_]*)`;

/** Statements that are NEVER a correction on a shared table. */
const FORBIDDEN_DML = new RegExp(
	String.raw`\b(INSERT\s+INTO|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?|ALTER\s+TABLE|DROP\s+TABLE|CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+"?${SHARED_TABLE}"?\b`,
	'gi',
);
/** The one admissible shape: an UPDATE, whose statement text is then inspected. */
const SHARED_UPDATE = new RegExp(String.raw`\bUPDATE\s+"?${SHARED_TABLE}"?\b`, 'gi');

/** Strip `--` line comments (the only comment form these files use). */
function stripSqlComments(sql: string): string {
	return sql
		.split('\n')
		.map((line) => line.replace(/--.*$/, ''))
		.join('\n');
}

/** The statement text from an UPDATE match to its terminating `;`. */
function statementFrom(sql: string, index: number): string {
	const end = sql.indexOf(';', index);
	return end === -1 ? sql.slice(index) : sql.slice(index, end);
}

interface FileVerdict {
	file: string;
	sharedUpdates: number;
	violations: string[];
}

/** Judge ONE migration file's text against the rule. Pure, so the anti-vacuity probes reuse it. */
function judgeMigration(file: string, raw: string): FileVerdict {
	const violations: string[] = [];
	const body = stripSqlComments(raw);
	for (const hit of body.matchAll(FORBIDDEN_DML)) {
		violations.push(`${file}: '${hit[0].trim()}' — only an UPDATE may correct a shared row`);
	}
	const updates = [...body.matchAll(SHARED_UPDATE)];
	if (updates.length > 0 && !raw.includes(SHARED_ROW_CORRECTION_TAG)) {
		violations.push(
			`${file}: updates a shared table but carries no '${SHARED_ROW_CORRECTION_TAG}' tag`,
		);
	}
	for (const hit of updates) {
		const statement = statementFrom(body, hit.index ?? 0);
		if (!/\bWHERE\b/i.test(statement) || !statement.includes('@>')) {
			violations.push(
				`${file}: '${hit[0].trim()}' has no \`@>\`-pinned WHERE — a correction must name the exact defective value`,
			);
		}
	}
	return { file, sharedUpdates: updates.length, violations };
}

function migrationFiles(): string[] {
	return readdirSync(MIGRATIONS_DIR)
		.filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
		.sort();
}

describe('migration shared-row tripwire — install/db/migrations/*.sql', () => {
	const verdicts = migrationFiles().map((file) =>
		judgeMigration(file, readFileSync(join(MIGRATIONS_DIR, file), 'utf8')),
	);

	test('anti-vacuity: the positive control 0004 is scanned and IS a shared-row correction', () => {
		const control = verdicts.find((v) => v.file === '0004_dd560_drop_view_tree.sql');
		expect(control).toBeDefined();
		expect(control?.sharedUpdates).toBeGreaterThanOrEqual(2);
		expect(verdicts.length).toBeGreaterThanOrEqual(4);
	});

	test('every shared-row DML is a TAGGED, `@>`-pinned UPDATE', () => {
		expect(verdicts.flatMap((v) => v.violations)).toEqual([]);
	});

	test('the runner header names the allowed class with the SAME tag the gate requires', () => {
		const header = readFileSync(RUNNER, 'utf8');
		expect(header).toContain(SHARED_ROW_CORRECTION_TAG);
		expect(header).toContain('seed-defect correction');
	});

	test('anti-vacuity: each matcher fires on a synthetic offender', () => {
		const untagged = judgeMigration(
			'9999_probe.sql',
			"UPDATE public.dd_ontology SET properties = '{}' WHERE tipo = 'x' AND properties @> '{}';",
		);
		expect(untagged.violations.some((v) => v.includes("no '-- SHARED-ROW SEED CORRECTION:'"))).toBe(
			true,
		);
		const unpinned = judgeMigration(
			'9999_probe.sql',
			`${SHARED_ROW_CORRECTION_TAG} probe\nUPDATE matrix_ontology SET misc = '{}' WHERE section_id = 1;`,
		);
		expect(unpinned.violations.some((v) => v.includes('@>'))).toBe(true);
		const forbidden = judgeMigration(
			'9999_probe.sql',
			`${SHARED_ROW_CORRECTION_TAG} probe\nDELETE FROM matrix_test WHERE section_id = 1;\nINSERT INTO dd_ontology (tipo) VALUES ('x');`,
		);
		expect(forbidden.violations.length).toBe(2);
		// A comment naming a table is not DML.
		const prose = judgeMigration(
			'9999_probe.sql',
			'-- talks about UPDATE matrix_ontology only\nSELECT 1;',
		);
		expect(prose.violations).toEqual([]);
		// The clean shape passes.
		const clean = judgeMigration(
			'9999_probe.sql',
			`${SHARED_ROW_CORRECTION_TAG} probe\nUPDATE public.dd_ontology SET properties = properties - 'x' WHERE tipo = 'y' AND properties @> '{"x": 1}'::jsonb;`,
		);
		expect(clean.violations).toEqual([]);
	});
});
