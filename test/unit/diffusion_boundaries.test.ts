/**
 * Dependency-direction gate for the diffusion rebuild (DIFFUSION_PLAN D1;
 * DIFFUSION_SPEC §2.5) — mechanical enforcement of the module boundaries,
 * in the source-scanning style of module_state_tripwire.test.ts:
 *
 * (a) src/core/** contains ZERO MariaDB client constructions and zero
 *     mysql-driver imports — "Bun owns MariaDB" is now "src/diffusion/
 *     targets/mariadb/ owns MariaDB", and core never crosses it.
 * (b) MariaDB client construction (Bun.sql 'mariadb'/'mysql' adapter,
 *     mysql://-style connection URLs, mysql2 driver imports) appears ONLY
 *     under src/diffusion/targets/mariadb/ — writers, jobs, resolvers all go
 *     through the target module.
 * (c) src/core/** never STATICALLY imports from src/diffusion/** — the
 *     dependency direction is diffusion → core, never the reverse. The ONE
 *     sanctioned seam is the API dispatch chokepoint (src/core/api/
 *     dispatch.ts) lazily `await import(...)`-ing diffusion ACTION handlers
 *     for registration (DIFFUSION_PLAN D2: "api/actions.ts … registered in
 *     src/core/api/dispatch.ts"); any other file doing even a dynamic import
 *     fails the gate.
 * (d) src/diffusion/** outside targets/mariadb/ never constructs a Bun SQL
 *     client of its own — Postgres access goes through src/core/db only
 *     (D1: "Postgres access in src/diffusion/** only via src/core/db").
 *
 * Patterns target CODE constructs (adapter options, driver imports,
 * connection URLs), not prose — comments legitimately discuss MariaDB.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';

const SRC_DIR = join(import.meta.dir, '..', '..', 'src');

/** The only subtree allowed to construct a MariaDB client. */
const MARIADB_TARGET_PREFIX = 'diffusion/targets/mariadb/';

/**
 * The sanctioned dynamic-import seams from core into diffusion:
 * - api/handlers/dd_diffusion_api.ts — the dd_diffusion_api action handlers
 *   (P0; moved out of dispatch.ts by the WS-C S2-25 extraction — dispatch now
 *   holds registry assembly only, the diffusion imports live with the class);
 * - area_maintenance/widgets/diffusion_server_control.ts — the maintenance
 *   widget (P5 re-home): the native dashboard reads queue/scheduler/advisory
 *   state through lazy imports, never statically.
 * - install/db_probe.ts — the install wizard's test_diffusion_connection step
 *   (DEC-19): reaches MariaDB through the diffusion/api/ FACADE only
 *   (probeDiffusionConnection), lazily, never the internals.
 */
const DIFFUSION_IMPORT_SEAMS = new Set([
	'core/api/handlers/dd_diffusion_api.ts',
	'core/area_maintenance/widgets/diffusion_server_control.ts',
	'core/install/db_probe.ts',
]);
const DISPATCH_SEAM = 'core/api/handlers/dd_diffusion_api.ts';

/** MariaDB/MySQL client construction or driver import, as CODE (not prose). */
const MARIADB_CLIENT_PATTERNS: { name: string; regex: RegExp }[] = [
	{
		name: 'Bun.sql mariadb/mysql adapter option',
		regex: /adapter\s*:\s*['"](?:mariadb|mysql)['"]/,
	},
	{ name: 'mysql/mariadb connection URL', regex: /['"](?:mysql|mariadb):\/\// },
	{
		name: 'mysql2 driver import',
		regex: /(?:from\s*['"]mysql2|require\s*\(\s*['"]mysql2|import\s*\(\s*['"]mysql2)/,
	},
];

/**
 * Static import/export-from of src/diffusion (any depth of ../ prefix).
 * `import type` is EXEMPT: type-only imports are erased at compile time and
 * create no runtime dependency edge — the boundary rule governs runtime
 * coupling direction, not type reuse.
 *
 * MULTILINE-AWARE (evasion-hole hardening, 2026-07-07): the old regex was
 * single-line anchored, so a formatter-wrapped import list
 * (`import {\n  x,\n} from '.../diffusion/...'`) evaded rule (c) — and
 * because boundary_seam_tripwire allows FACADE targets, a multiline static
 * facade import was silently legalized despite rule (c) forbidding ALL
 * static core→diffusion imports (the seam is dynamic-import only). The scan
 * now runs on FULL FILE TEXT: between the `import`/`export` keyword and the
 * diffusion `from` specifier only import-clause characters (identifiers,
 * braces, commas, `*`, whitespace) may appear, so the match can span lines
 * but can never bridge two statements (quotes/semicolons/parens break it).
 */
const STATIC_DIFFUSION_IMPORT =
	/(?:^|\n)(?:import(?!\s+type\b)|export)\s[\w\s{},*]*?from\s*['"][^'"]*\/diffusion\//g;
/** Dynamic import of src/diffusion. */
const DYNAMIC_DIFFUSION_IMPORT = /import\s*\(\s*['"`][^'"`]*\/diffusion\//;
/** A Bun SQL client construction. */
const NEW_SQL_CONSTRUCTION = /new\s+SQL\s*\(/;

interface Violation {
	file: string;
	line: number;
	rule: string;
	text: string;
}

function scanSources(): {
	mariadbInCore: Violation[];
	mariadbOutsideTarget: Violation[];
	coreStaticDiffusionImports: Violation[];
	coreDynamicDiffusionImportsOffSeam: Violation[];
	sqlConstructionOutsideAllowed: Violation[];
} {
	const glob = new Glob('**/*.ts');
	const mariadbInCore: Violation[] = [];
	const mariadbOutsideTarget: Violation[] = [];
	const coreStaticDiffusionImports: Violation[] = [];
	const coreDynamicDiffusionImportsOffSeam: Violation[] = [];
	const sqlConstructionOutsideAllowed: Violation[] = [];

	for (const relativePath of glob.scanSync(SRC_DIR)) {
		const isCore = relativePath.startsWith('core/');
		const isDiffusion = relativePath.startsWith('diffusion/');
		const isMariadbTarget = relativePath.startsWith(MARIADB_TARGET_PREFIX);
		const content = readFileSync(join(SRC_DIR, relativePath), 'utf8');
		const lines = content.split('\n');

		// (c) static imports: FULL-TEXT scan so multiline import lists cannot
		// evade the gate (see the STATIC_DIFFUSION_IMPORT doc comment).
		if (isCore) {
			for (const match of content.matchAll(STATIC_DIFFUSION_IMPORT)) {
				const startIndex = (match.index ?? 0) + (match[0].startsWith('\n') ? 1 : 0);
				coreStaticDiffusionImports.push({
					file: relativePath,
					line: content.slice(0, startIndex).split('\n').length,
					rule: 'static import of src/diffusion from src/core',
					text: match[0].trim().split('\n').join(' '),
				});
			}
		}

		lines.forEach((lineText, index) => {
			const lineNumber = index + 1;

			// (a)+(b): MariaDB client constructs.
			for (const { name, regex } of MARIADB_CLIENT_PATTERNS) {
				if (!regex.test(lineText)) continue;
				const violation = {
					file: relativePath,
					line: lineNumber,
					rule: name,
					text: lineText.trim(),
				};
				if (isCore) mariadbInCore.push(violation);
				if (!isMariadbTarget) mariadbOutsideTarget.push(violation);
			}

			// (c): core → diffusion DYNAMIC imports (static ones scanned full-text above).
			if (isCore) {
				if (DYNAMIC_DIFFUSION_IMPORT.test(lineText) && !DIFFUSION_IMPORT_SEAMS.has(relativePath)) {
					coreDynamicDiffusionImportsOffSeam.push({
						file: relativePath,
						line: lineNumber,
						rule: 'dynamic import of src/diffusion outside the dispatch seam',
						text: lineText.trim(),
					});
				}
			}

			// (d): SQL client construction in diffusion outside the target module.
			if (isDiffusion && !isMariadbTarget && NEW_SQL_CONSTRUCTION.test(lineText)) {
				sqlConstructionOutsideAllowed.push({
					file: relativePath,
					line: lineNumber,
					rule: 'Bun SQL construction in src/diffusion outside targets/mariadb (Postgres goes via src/core/db)',
					text: lineText.trim(),
				});
			}
		});
	}

	return {
		mariadbInCore,
		mariadbOutsideTarget,
		coreStaticDiffusionImports,
		coreDynamicDiffusionImportsOffSeam,
		sqlConstructionOutsideAllowed,
	};
}

function formatViolations(violations: Violation[]): string {
	return violations.map((v) => `  src/${v.file}:${v.line} [${v.rule}] ${v.text}`).join('\n');
}

describe('diffusion module boundaries (SPEC §2.5 / PLAN D1 gate)', () => {
	const scan = scanSources();

	test('(a) src/core/** contains no MariaDB client construction or mysql import', () => {
		if (scan.mariadbInCore.length > 0) {
			throw new Error(
				`MariaDB constructs found in src/core:\n${formatViolations(scan.mariadbInCore)}`,
			);
		}
		expect(scan.mariadbInCore).toEqual([]);
	});

	test('(b) MariaDB client construction lives ONLY under src/diffusion/targets/mariadb/', () => {
		if (scan.mariadbOutsideTarget.length > 0) {
			throw new Error(
				`MariaDB constructs found outside targets/mariadb:\n${formatViolations(scan.mariadbOutsideTarget)}`,
			);
		}
		expect(scan.mariadbOutsideTarget).toEqual([]);
	});

	test('(c) src/core/** never imports src/diffusion (dispatch dynamic-import seam excepted)', () => {
		if (scan.coreStaticDiffusionImports.length > 0) {
			throw new Error(
				`Static core→diffusion imports found:\n${formatViolations(scan.coreStaticDiffusionImports)}`,
			);
		}
		if (scan.coreDynamicDiffusionImportsOffSeam.length > 0) {
			throw new Error(
				`Dynamic core→diffusion imports outside the sanctioned seams (${[...DIFFUSION_IMPORT_SEAMS].join(', ')}):\n${formatViolations(scan.coreDynamicDiffusionImportsOffSeam)}`,
			);
		}
		expect(scan.coreStaticDiffusionImports).toEqual([]);
		expect(scan.coreDynamicDiffusionImportsOffSeam).toEqual([]);
	});

	test('(c-seam) the dd_diffusion_api handler seam actually exists (gate stays honest if it moves)', () => {
		// If the registration seam is ever renamed, the exception above must move
		// with it — fail loudly instead of silently allowing a stale exception.
		const dispatchSource = readFileSync(join(SRC_DIR, DISPATCH_SEAM), 'utf8');
		expect(DYNAMIC_DIFFUSION_IMPORT.test(dispatchSource)).toBe(true);
	});

	test('(d) src/diffusion/** constructs no SQL client outside targets/mariadb', () => {
		if (scan.sqlConstructionOutsideAllowed.length > 0) {
			throw new Error(
				`SQL client construction outside targets/mariadb:\n${formatViolations(scan.sqlConstructionOutsideAllowed)}`,
			);
		}
		expect(scan.sqlConstructionOutsideAllowed).toEqual([]);
	});
});
