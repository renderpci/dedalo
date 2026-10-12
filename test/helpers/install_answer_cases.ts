/**
 * THE INSTALLER'S ANSWER MATRIX — one set of cases every front-end parity gate
 * runs (terminal installer phase 2, 2026-10-12): the CLI flags, the answers
 * file, the browser wizard's post and the interactive plain mode must decide
 * the SAME plan for each.
 *
 * Users: test/unit/install_plan_parity_tripwire.test.ts (CLI ≡ wizard ≡ answers
 * file, the phase-1 matrix), test/unit/install_plain_parity_tripwire.test.ts
 * (+ plain mode, + the route cases), test/unit/install_screen_model_tripwire.test.ts
 * (the local-fixture ontology source).
 *
 * The SCRATCH ontology TLDs of the screen fixture (zzsma, zzsmb) are owned
 * HERE (scratch_tld_uniqueness_tripwire: a helper owner, its users import it).
 * Every thesaurus code used is a REAL vendored hierarchy.json entry read at run
 * time or a generic one the generic_tld_tripwire allows (ad, fr, htoponymy) —
 * never an install's own TLD.
 *
 * Writes nothing itself: `writeLocalOntologySource` writes ONLY into the
 * directory its caller made (a mkdtemp dir the caller removes).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildInstallContext } from '../../src/core/install/context.ts';
import type { InstallPlan } from '../../src/core/install/install_plan.ts';
import {
	collectHierarchyDependencies,
	declarersOf,
	type HierarchyDependency,
	hierarchyDependencyPlan,
	type OntologyCatalog,
	vendoredCoreDeclarers,
	vendoredOntologyCatalog,
} from '../../src/core/install/ontology_choice.ts';
import {
	buildOntologyPackage,
	type FixtureOntologyTld,
} from '../../src/core/test_data/ontology_package_fixture.ts';

// ── the wizard's own defaults (read from its context, never re-typed) ─────────

const WIZARD_PROPERTIES = buildInstallContext().properties as Record<string, unknown> & {
	hierarchies: { tld: string }[];
	toponymy_typology: number;
	ontologies: { default: string[] };
};

/** The wizard's served properties (its context) — what it renders and posts from. */
export const WIZARD_CONTEXT_PROPERTIES = WIZARD_PROPERTIES;

/**
 * The thesauri the WIZARD POSTS before any declaration is known: NONE
 * (2026-10-10 — pre-selection comes only from the declared dependencies, which
 * the plan adds itself). Its context carries no default list at all, so the
 * empty post IS its default answer.
 */
export const WIZARD_DEFAULT_THESAURI: string[] = [];
/** The domain ontologies the WIZARD pre-ticks (its context, not a re-typed list). */
export const WIZARD_DEFAULT_ONTOLOGIES: string[] = WIZARD_PROPERTIES.ontologies.default;

// ── the declared thesauri, derived through the production functions ──────────

/**
 * The thesauri the RELEASE declares for an install order — the core TLDs'
 * declarations (vendoredCoreDeclarers: part of EVERY plan) followed by the
 * order's — never a hand-typed list.
 */
export function declaredThesauri(
	order: readonly string[],
	catalog: OntologyCatalog = vendoredOntologyCatalog(),
): { dependencies: HierarchyDependency[]; install: string[] } {
	const { dependencies } = collectHierarchyDependencies([
		...vendoredCoreDeclarers(),
		...declarersOf(order, catalog),
	]);
	return { dependencies, install: hierarchyDependencyPlan(dependencies).install };
}

// ── the phase-1 matrix (CLI ≡ wizard ≡ answers file) ─────────────────────────

export interface AnswerCase {
	name: string;
	argv: string[];
	/** The same answers as the wizard posts them (its key names, its value shapes). */
	wizard: Record<string, unknown>;
}

export const BASE_ARGV = [
	'--db-name',
	'dedalo_parity',
	'--db-user',
	'parity_user',
	'--db-password',
	'secret pass',
	'--db-host',
	'localhost',
	'--db-port',
	'5432',
	'--entity',
	'parity',
	'--entity-label',
	'Parity Museum',
	'--timezone',
	'Europe/Madrid',
	'--locale',
	'es-ES',
	'--langs',
	'lg-spa,lg-eng',
	'--app-lang',
	'lg-spa',
	'--data-lang',
	'lg-eng',
];

/** The same answers as the wizard posts them (its key names, its value shapes). */
export const BASE_WIZARD: Record<string, unknown> = {
	db_database: 'dedalo_parity',
	db_username: 'parity_user',
	db_password: 'secret pass',
	db_hostname: 'localhost',
	db_port: '5432',
	db_socket: '',
	entity: 'parity',
	entity_label: 'Parity Museum',
	timezone: 'Europe/Madrid',
	locale: 'es-ES',
	langs: ['lg-spa', 'lg-eng'],
	app_lang_default: 'lg-spa',
	data_lang_default: 'lg-eng',
	diffusion: false,
	mailer: false,
	update_servers: true,
	hierarchies: WIZARD_DEFAULT_THESAURI,
	ontologies: WIZARD_DEFAULT_ONTOLOGIES,
};

export const DIFFUSION_ARGV = [
	'--diffusion',
	'--mysql-host',
	'mariadb.local',
	'--mysql-port',
	'3307',
	'--mysql-name',
	'web_parity',
	'--mysql-user',
	'web_user',
	'--mysql-password',
	'web pw',
];
export const DIFFUSION_WIZARD = {
	diffusion: true,
	mysql_hostname: 'mariadb.local',
	mysql_port: '3307',
	mysql_database: 'web_parity',
	mysql_username: 'web_user',
	mysql_password: 'web pw',
};
export const MAILER_ARGV = [
	'--mailer',
	'--smtp-host',
	'smtp.example.org',
	'--smtp-port',
	'465',
	'--smtp-secure',
	'ssl',
	'--smtp-user',
	'mailer@example.org',
	'--smtp-password',
	'mail pw',
	'--smtp-from',
	'noreply@example.org',
	'--smtp-from-name',
	'Dédalo',
];
export const MAILER_WIZARD = {
	mailer: true,
	smtp_host: 'smtp.example.org',
	smtp_port: '465',
	smtp_secure: 'ssl',
	smtp_user: 'mailer@example.org',
	smtp_pass: 'mail pw',
	smtp_from: 'noreply@example.org',
	smtp_from_name: 'Dédalo',
};

/** The phase-1 matrix: every case the CLI and the wizard can both express. */
export const CASES: readonly AnswerCase[] = [
	{ name: 'base (every default)', argv: BASE_ARGV, wizard: BASE_WIZARD },
	{
		name: '+diffusion',
		argv: [...BASE_ARGV, ...DIFFUSION_ARGV],
		wizard: { ...BASE_WIZARD, ...DIFFUSION_WIZARD },
	},
	{
		name: '+mailer',
		argv: [...BASE_ARGV, ...MAILER_ARGV],
		wizard: { ...BASE_WIZARD, ...MAILER_WIZARD },
	},
	{
		name: '+serving keys',
		argv: [
			...BASE_ARGV,
			'--media-path',
			'/srv/dedalo/media',
			'--socket',
			'/run/dedalo/dedalo_ts.sock',
			'--media-access-mode',
			'publication',
		],
		wizard: {
			...BASE_WIZARD,
			media_path: '/srv/dedalo/media',
			unix_socket: '/run/dedalo/dedalo_ts.sock',
			media_access_mode: 'publication',
		},
	},
	{
		name: 'air-gapped (no update servers)',
		argv: [...BASE_ARGV, '--no-update-servers'],
		wizard: { ...BASE_WIZARD, update_servers: false },
	},
	{
		name: 'thesauri: none',
		argv: [...BASE_ARGV, '--hierarchies', 'none'],
		wizard: { ...BASE_WIZARD, hierarchies: [] },
	},
	{
		name: 'thesauri: explicit',
		argv: [...BASE_ARGV, '--hierarchies', 'ad,fr'],
		wizard: { ...BASE_WIZARD, hierarchies: ['ad', 'fr'] },
	},
	{
		name: 'thesauri: with the core lg',
		argv: [...BASE_ARGV, '--hierarchies', 'lg,fr'],
		wizard: { ...BASE_WIZARD, hierarchies: ['lg', 'fr'] },
	},
	{
		name: 'ontologies: explicit oh',
		argv: [...BASE_ARGV, '--ontologies', 'oh'],
		wizard: { ...BASE_WIZARD, ontologies: ['oh'] },
	},
	{
		name: 'ontologies: a core TLD dropped with a note',
		argv: [...BASE_ARGV, '--ontologies', 'DD,oh'],
		wizard: { ...BASE_WIZARD, ontologies: ['dd', 'oh'] },
	},
	{
		name: 'ontologies: air-gapped default (the vendored oh)',
		argv: [...BASE_ARGV, '--no-update-servers', '--ontologies', 'default'],
		wizard: { ...BASE_WIZARD, update_servers: false },
	},
];

/** What a plan DECIDES (the fields every front end must agree on). */
export function decided(plan: InstallPlan) {
	return {
		env: plan.env,
		envKeys: plan.envKeys,
		steps: plan.steps,
		hierarchies: plan.hierarchies,
		hierarchyDependencies: plan.hierarchyDependencies,
		suggestions: plan.suggestions,
		ontologies: plan.ontologies,
		ontologySource: plan.ontologySource,
		ontologyRequest: plan.ontologyRequest,
		activeOntologyTlds: plan.activeOntologyTlds,
		notes: plan.notes,
		warnings: plan.warnings,
		errors: plan.errors,
	};
}

// ── the screen fixture: a LOCAL ontology source with declared dependencies ────

/**
 * The screen-model fixture's ontologies: zzsma declares the ontology zzsmb
 * OPTIONAL and the thesaurus definition `htoponymy` OPTIONAL — the shape of
 * install campaign finding L31 (a declared empty toponymy definition must not
 * count as "a toponymy is selected").
 */
export const SCREEN_FIXTURE_ONTOLOGIES: readonly FixtureOntologyTld[] = Object.freeze([
	{
		tld: 'zzsma',
		name: 'zz screen A',
		typologyId: 8,
		typologyName: 'Catalog',
		dependencies: [
			{ tld: 'dd', main: 'ontology35', mandatory: true },
			{ tld: 'zzsmb', main: 'ontology35', mandatory: false },
			{ tld: 'htoponymy', main: 'hierarchy1', mandatory: false },
		],
		nodes: [{ id: 1, parent: 'zzsma0', model: 'dd6', term: 'A root' }],
	},
	{
		tld: 'zzsmb',
		name: 'zz screen B',
		typologyId: 8,
		typologyName: 'Catalog',
		dependencies: [{ tld: 'dd', main: 'ontology35', mandatory: true }],
		nodes: [{ id: 1, parent: 'zzsmb0', model: 'dd6', term: 'B root' }],
	},
]);

/** Write a local ontology source (the server export layout) into `dir` (the caller's mkdtemp). */
export function writeLocalOntologySource(
	dir: string,
	ontologies: readonly FixtureOntologyTld[] = SCREEN_FIXTURE_ONTOLOGIES,
): string {
	mkdirSync(dir, { recursive: true });
	for (const [name, bytes] of buildOntologyPackage([...ontologies])) {
		writeFileSync(join(dir, name), bytes);
	}
	return dir;
}

// ── the route cases (the terminal front ends only) ───────────────────────────

/** A route case: argv the plain mode must reproduce (no wizard: it cannot post a route). */
export interface RouteCase {
	name: string;
	argv: string[];
	/** Needs the local fixture source's catalog (`--ontology-source`). */
	local: boolean;
}

/** `argv` without one value flag and its value. */
function withoutFlag(argv: readonly string[], flag: string): string[] {
	const at = argv.indexOf(flag);
	return at === -1 ? [...argv] : [...argv.slice(0, at), ...argv.slice(at + 2)];
}

/** The base answers WITHOUT the database fields (a docker/trial stack fixes them). */
const IDENTITY_ARGV = [
	'--entity',
	'parity',
	'--entity-label',
	'Parity Museum',
	'--timezone',
	'Europe/Madrid',
	'--locale',
	'es-ES',
	'--langs',
	'lg-spa,lg-eng',
	'--app-lang',
	'lg-spa',
	'--data-lang',
	'lg-eng',
];

/**
 * The route matrix (D5/D6): production with an instance (its derived names
 * taken as shown, and overridden), docker, trial, an explicit developer,
 * production with diffusion + mail, air-gapped with a local source and its
 * declared dependencies (one declined), thesauri explicit / a declared one
 * declined. `sourceDir` = a local fixture source (writeLocalOntologySource).
 */
export function routeCases(sourceDir: string): RouteCase[] {
	const declared = declaredThesauri(WIZARD_DEFAULT_ONTOLOGIES).install;
	const declinedOne = declared[0] as string;
	const declaredLast = declared.at(-1) as string;
	return [
		{
			name: 'route production + instance (derived names as shown)',
			argv: ['--route', 'production', '--instance', 'prado', ...IDENTITY_ARGV],
			local: false,
		},
		{
			name: 'route production + instance, names overridden + serving keys',
			argv: [
				'--route',
				'production',
				'--instance',
				'prado',
				'--db-name',
				'prado_db',
				'--db-user',
				'prado_role',
				'--db-password',
				'secret pass',
				'--media-path',
				'/data/prado/media',
				'--media-access-mode',
				'private',
				...IDENTITY_ARGV,
			],
			local: false,
		},
		{ name: 'route docker', argv: ['--route', 'docker', ...IDENTITY_ARGV], local: false },
		{ name: 'route trial', argv: ['--route', 'trial', ...IDENTITY_ARGV], local: false },
		{
			name: 'route developer (explicit)',
			argv: ['--route', 'developer', ...BASE_ARGV],
			local: false,
		},
		{
			name: 'production + diffusion + mailer',
			argv: [
				'--route',
				'production',
				'--instance',
				'prado',
				...IDENTITY_ARGV,
				...DIFFUSION_ARGV,
				...MAILER_ARGV,
			],
			local: false,
		},
		{
			name: 'air-gapped + a local source (an optional dependency declined)',
			argv: [
				...BASE_ARGV,
				'--no-update-servers',
				'--ontology-source',
				sourceDir,
				'--ontologies',
				'zzsma,oh',
				'--decline-dependencies',
				'zzsmb:ontology35',
			],
			local: true,
		},
		{
			name: 'thesauri: explicit + a declared one declined',
			argv: [
				...BASE_ARGV,
				'--hierarchies',
				'fr',
				'--decline-dependencies',
				`${declinedOne}:hierarchy1`,
			],
			local: false,
		},
		{
			// A declared thesaurus NAMED explicitly (after a country): it stays a root in the
			// flags' order — the screen must not demote it to "pre-ticked by an ontology".
			name: 'thesauri: a declared one named explicitly',
			argv: [...BASE_ARGV, '--hierarchies', `fr,${declaredLast}`],
			local: false,
		},
		{
			name: 'thesauri: a declared one named explicitly AND declined',
			argv: [
				...BASE_ARGV,
				'--hierarchies',
				`${declaredLast},fr`,
				'--decline-dependencies',
				`${declaredLast}:hierarchy1`,
			],
			local: false,
		},
		{
			name: 'odd values: spaces, quotes, a leading --, non-ASCII',
			argv: [
				...withoutFlag(BASE_ARGV, '--entity-label'),
				'--entity-label=--x \'quoted\' "double" Ñandú · 博物館',
				'--information=a b  c',
			],
			local: false,
		},
	];
}
