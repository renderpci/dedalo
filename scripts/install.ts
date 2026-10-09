/**
 * TS-NATIVE INSTALL CLI (DEC-19) — headless, unattended install of a fresh
 * Dédalo instance with no PHP anywhere. A FRONT END of the install plan
 * (src/core/install/install_plan.ts): the flags become the same answers the
 * browser wizard posts, the plan turns them into the .env and the step list,
 * and this script runs those steps through the SAME engine the wizard routes
 * (src/core/install/), then verifies an actual root login. install.sh drives
 * this script; it carries no install logic of its own either.
 *
 * The one subtlety: `config` freezes at import from the environment. So the
 * plan is built first (config-free), its boot environment is seeded into the
 * process (cliBootEnv), and only THEN is the engine imported — config then
 * resolves the REAL values (not install-mode sentinels), the pool points at the
 * target DB, and no restart is needed.
 *
 * Usage (npm script `dedalo:install` — NOT `install`, which is a reserved
 * package-manager lifecycle hook):
 *   bun run scripts/install.ts --db-name dedalo_x --db-user u --entity myentity \
 *       --root-password '...' [--db-host localhost] [--db-port 5432] [--db-socket ...] \
 *       [--db-password ...] [--entity-label ...] [--information ...] [--info-key ...] \
 *       [--timezone Europe/Madrid] [--locale es-ES] \
 *       [--langs lg-eng,lg-spa] [--app-lang lg-eng] [--data-lang lg-eng] \
 *       [--hierarchies es,fr | default | none] \
 *       [--diffusion --mysql-host ... --mysql-port ... --mysql-socket ... \
 *          --mysql-name ... --mysql-user ... --mysql-password ...] \
 *       [--mailer --smtp-host smtp.example.org --smtp-port 587 --smtp-secure tls \
 *          --smtp-user ... --smtp-password ... --smtp-from ... --smtp-from-name ...] \
 *       [--media-path /srv/dedalo/media] [--socket /run/dedalo/dedalo_ts.sock] \
 *       [--media-access-mode publication] \
 *       [--no-update-servers] [--skip-tools] [--plan]
 *
 * Defaults live in the plan, not here: --hierarchies omitted = the shared
 * default set (hierarchies.json install_checked_default — the wizard pre-ticks
 * the same); Languages (lg) is ALWAYS activated by the seed restore and is not
 * a choice. The official update server is written unless --no-update-servers
 * (air-gapped: ONTOLOGY_SERVERS / CODE_SERVERS = []). An unknown flag is an
 * error, never ignored.
 *
 * --plan prints ONE JSON line (env_keys, steps, hierarchies, notes, errors) and
 * exits — 0 when the answers are valid, 1 otherwise — touching nothing: no
 * database, no file, no root password needed.
 *
 * Secrets: --root-password or DEDALO_INSTALL_ROOT_PASSWORD (never echoed).
 */

// Both config-free — safe to import BEFORE the environment is seeded.
import { processEnvValue, seedProcessEnv } from '../src/config/env.ts';
import {
	answersFromCliArgs,
	buildInstallPlan,
	cliBootEnv,
	type InstallPlan,
	type InstallStepId,
} from '../src/core/install/install_plan.ts';

function fail(msg: string): never {
	console.error(`\n✖ install failed: ${msg}\n`);
	process.exit(1);
}

const invocation = answersFromCliArgs(Bun.argv.slice(2));
const plan = buildInstallPlan(invocation.raw);
const errors = [...invocation.errors, ...plan.errors];

if (invocation.planOnly) {
	console.log(
		JSON.stringify({
			env_keys: [...plan.envKeys],
			steps: [...plan.steps],
			hierarchies: [...plan.hierarchies],
			notes: [...plan.notes],
			errors,
		}),
	);
	process.exit(errors.length === 0 ? 0 : 1);
}

if (errors.length > 0) fail(errors.join('; '));
const rootPassword = invocation.rootPassword ?? processEnvValue('DEDALO_INSTALL_ROOT_PASSWORD');
if (!rootPassword) fail('--root-password (or DEDALO_INSTALL_ROOT_PASSWORD) is required');

// Seed the environment BEFORE importing config (see the header).
seedProcessEnv(cliBootEnv(plan));

/** The engine's step functions take the wizard's posted record — the plan's answers ARE it. */
const posted: Record<string, unknown> = { ...plan.answers };

/** Human text for each step line (`→ [<step id>] <text>`). */
const STEP_TEXT: Readonly<Record<InstallStepId, string>> = {
	test_db_connection: 'database connection',
	test_diffusion_connection: 'diffusion (MariaDB) connection',
	test_mailer_connection: 'SMTP connection',
	persist_config: 'write ../private/.env',
	check_directories: 'directories',
	install_db_from_default_file: 'restore database from seed (+ activate core hierarchies)',
	set_root_pw: 'set root password',
	install_hierarchies: `optional hierarchies: ${plan.hierarchies.join(', ') || 'none'}`,
	register_tools: 'register tools',
	install_finish: 'seal install',
};

async function stepDbConnection(): Promise<void> {
	const { testDbConnection } = await import('../src/core/install/db_probe.ts');
	const probe = await testDbConnection(posted);
	if (!probe.can_connect && !probe.db_exists) fail(probe.msg);
	if (!probe.db_exists) {
		fail(`database '${plan.answers.db_database}' must exist (empty) first — ${probe.msg}`);
	}
}

/**
 * The optional probes WARN instead of failing: an unattended install may
 * legitimately configure a target the build host cannot reach yet.
 */
async function stepDiffusionConnection(): Promise<void> {
	const { testDiffusionConnection } = await import('../src/core/install/db_probe.ts');
	const probe = await testDiffusionConnection(posted);
	if (!probe.ok) console.warn(`  ⚠ ${probe.msg} — writing the diffusion config anyway`);
}

async function stepMailerConnection(): Promise<void> {
	const { testMailerConnection } = await import('../src/core/install/mailer_probe.ts');
	const smtp = await testMailerConnection(posted);
	if (!smtp.ok) console.warn(`  ⚠ ${smtp.msg} — writing the SMTP config anyway`);
}

async function stepPersistConfig(): Promise<void> {
	const { persistConfig } = await import('../src/core/install/config_persist.ts');
	// Every install step REFUSES BY THROWING a registered install.* code
	// (src/core/install/refuse.ts); main()'s catch prints its message through
	// fail(), so there is no per-step `result` to test.
	const persisted = await persistConfig(posted);
	for (const [key, value] of Object.entries(persisted.generated)) {
		console.log(`  generated ${key} = ${value}`);
	}
}

async function stepCheckDirectories(): Promise<void> {
	const { checkDirectories } = await import('../src/core/install/directories.ts');
	const dirs = checkDirectories({ create: true });
	if (dirs.ok) return;
	// A bare path list read as a crash (measured 2026-10-08: "install failed:
	// /backups/db"). Say what is wrong and as whom, so the operator can chown.
	const who = `uid ${process.getuid?.() ?? '?'}`;
	fail(
		`these directories are missing or not writable by this process (${who}): ` +
			dirs.dirs
				.filter((d) => !d.writable)
				.map((d) => `${d.label} ${d.path}${d.exists ? '' : ' (could not be created)'}`)
				.join(', '),
	);
}

async function stepRestoreSeed(): Promise<void> {
	const { installDbFromSeed } = await import('../src/core/install/db_restore.ts');
	const restored = await installDbFromSeed();
	console.log(`  ${restored.msg}`);
}

async function stepRootPassword(): Promise<void> {
	const { setRootPassword } = await import('../src/core/install/root_pw.ts');
	await setRootPassword(rootPassword as string);
}

/**
 * A failed hierarchy FAILS the install (nothing is sealed): the wizard cannot
 * pass a failed step either, and a thesaurus the operator asked for but cannot
 * use is not an install that worked.
 */
async function stepHierarchies(): Promise<void> {
	const { installHierarchies } = await import('../src/core/install/hierarchy_import.ts');
	const result = await installHierarchies([...plan.hierarchies]);
	console.log(`  ${result.msg}`);
	if (!result.ok) fail(`hierarchies: ${result.errors.join('; ')}`);
}

async function stepRegisterTools(): Promise<void> {
	const { registerInstallTools } = await import('../src/core/install/register_tools.ts');
	const tools = await registerInstallTools();
	console.log(`  ${tools.msg}`);
}

async function stepFinish(): Promise<void> {
	const { installFinish } = await import('../src/core/install/finish.ts');
	await installFinish();
}

/** One plan step → its engine call. EXHAUSTIVE: a new step id fails to compile here. */
function runStep(step: InstallStepId): Promise<void> {
	switch (step) {
		case 'test_db_connection':
			return stepDbConnection();
		case 'test_diffusion_connection':
			return stepDiffusionConnection();
		case 'test_mailer_connection':
			return stepMailerConnection();
		case 'persist_config':
			return stepPersistConfig();
		case 'check_directories':
			return stepCheckDirectories();
		case 'install_db_from_default_file':
			return stepRestoreSeed();
		case 'set_root_pw':
			return stepRootPassword();
		case 'install_hierarchies':
			return stepHierarchies();
		case 'register_tools':
			return stepRegisterTools();
		case 'install_finish':
			return stepFinish();
		default: {
			const unreachable: never = step;
			return fail(`unknown install step '${String(unreachable)}'`);
		}
	}
}

async function main(installPlan: InstallPlan): Promise<void> {
	const { answers } = installPlan;
	console.log(`\nDédalo TS install — entity '${answers.entity}', db '${answers.db_database}'\n`);
	for (const note of installPlan.notes) console.log(`  note: ${note}`);

	// Front-end affordance, not a plan step (the wizard shows the same report on load).
	const { runInitTest } = await import('../src/core/install/init_test.ts');
	console.log('→ pre-flight checks');
	const init = runInitTest();
	if (!init.result) fail(`pre-flight: ${init.errors.join('; ')}`);

	for (const step of installPlan.steps) {
		console.log(`→ [${step}] ${STEP_TEXT[step]}`);
		await runStep(step);
	}

	// End-to-end proof: an actual root login must succeed against the new DB.
	const { login } = await import('../src/core/security/auth.ts');
	console.log('→ verify root login');
	const auth = await login('root', rootPassword as string, 'local');
	if (!auth.ok) fail('root login verification failed after install');

	console.log(
		'\n✔ install complete — root login verified. Start the server with `bun run start`.\n',
	);
	process.exit(0);
}

main(plan).catch((error) => fail(error instanceof Error ? error.message : String(error)));
