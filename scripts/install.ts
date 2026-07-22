/**
 * TS-NATIVE INSTALL CLI (DEC-19) — headless, unattended install of a fresh
 * Dédalo instance with no PHP anywhere. Drives the SAME engine
 * (src/core/install/) the browser wizard uses, in sequence, and ends by
 * verifying an actual root login.
 *
 * The one subtlety: `config` freezes at import from the environment. So this
 * script sets the DB/entity env vars from its flags FIRST, then dynamically
 * imports the engine — config then resolves the REAL values (not install-mode
 * sentinels), the pool points at the target DB, and no restart is needed.
 *
 * Usage (npm script `dedalo:install` — NOT `install`, which is a reserved
 * package-manager lifecycle hook):
 *   bun run scripts/install.ts --db-name dedalo_x --db-user u --entity mib \
 *       --root-password '...' [--db-host /tmp] [--db-port 5432] \
 *       [--db-password ...] [--hierarchies es,fr] [--diffusion --mysql-* ...] \
 *       [--media-path /srv/dedalo/media] [--socket /run/dedalo/dedalo_ts.sock] \
 *       [--media-access-mode publication] \
 *       [--mailer --smtp-host smtp.example.org --smtp-user ... --smtp-password ...] \
 *       [--skip-tools] [--yes]
 *
 * Secrets: --root-password or DEDALO_INSTALL_ROOT_PASSWORD (never echoed).
 */

// Pure — safe to import BEFORE config (it never pulls src/config/config.ts).
import { deriveLangConfig } from '../src/core/install/lang_catalog.ts';

const args = Bun.argv.slice(2);

function flag(name: string): string | undefined {
	const i = args.indexOf(`--${name}`);
	const next = i !== -1 ? args[i + 1] : undefined;
	if (next !== undefined && !next.startsWith('--')) return next;
	return undefined;
}
function has(name: string): boolean {
	return args.includes(`--${name}`);
}
function envOr(name: string, dflt = ''): string {
	return flag(name) ?? dflt;
}

function fail(msg: string): never {
	console.error(`\n✖ install failed: ${msg}\n`);
	process.exit(1);
}

// --- Collect inputs -------------------------------------------------------
const cfg = {
	db_hostname: envOr('db-host', '/tmp'),
	db_port: envOr('db-port', '5432'),
	db_socket: envOr('db-socket'),
	db_database: flag('db-name') ?? fail('--db-name is required'),
	db_username: flag('db-user') ?? fail('--db-user is required'),
	db_password: envOr('db-password'),
	entity: flag('entity') ?? fail('--entity is required'),
	entity_label: envOr('entity-label'),
	information: envOr('information', 'ts-install'),
	info_key: envOr('info-key', 'ts'),
	timezone: envOr('timezone', 'Europe/Madrid'),
	locale: envOr('locale', 'es-ES'),
	// Languages (comma list; --langs OMITTED → whole catalog, empty → refused).
	// app/data defaults must be members of the picked set (deriveLangConfig
	// validates + refuses otherwise).
	langs:
		flag('langs') === undefined
			? undefined
			: (flag('langs') as string)
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean),
	app_lang_default: flag('app-lang'),
	data_lang_default: flag('data-lang'),
	diffusion: has('diffusion'),
	mysql_hostname: envOr('mysql-host', 'localhost'),
	mysql_port: envOr('mysql-port', '3306'),
	mysql_socket: envOr('mysql-socket'),
	mysql_database: envOr('mysql-name'),
	mysql_username: envOr('mysql-user'),
	mysql_password: envOr('mysql-password'),
	// Outbound email (SMTP relay — password recovery); same keys the wizard's
	// optional step posts, persisted as DEDALO_SMTP_* by persistConfig.
	mailer: has('mailer'),
	smtp_host: envOr('smtp-host'),
	smtp_port: envOr('smtp-port', '587'),
	smtp_secure: envOr('smtp-secure', 'tls'),
	smtp_user: envOr('smtp-user'),
	smtp_pass: envOr('smtp-password'),
	smtp_from: envOr('smtp-from'),
	smtp_from_name: envOr('smtp-from-name'),
	// Serving / media. persistConfig writes these to .env when provided;
	// media_path also drives the directory write-probe (seeded into the env
	// below, before config imports).
	media_path: envOr('media-path'),
	unix_socket: envOr('socket'),
	media_access_mode: envOr('media-access-mode'),
};
if (cfg.mailer && cfg.smtp_host === '') {
	// An empty host would persist a DISABLED mailer — refuse the contradiction.
	fail('--mailer requires --smtp-host');
}
const rootPassword = flag('root-password') ?? process.env.DEDALO_INSTALL_ROOT_PASSWORD;
if (!rootPassword) fail('--root-password (or DEDALO_INSTALL_ROOT_PASSWORD) is required');
const hierarchies = (flag('hierarchies') ?? '')
	.split(',')
	.map((s) => s.trim())
	.filter(Boolean);
const skipTools = has('skip-tools');

// --- Seed the environment BEFORE importing config -------------------------
// config.ts reads these at import; setting them now means the engine resolves
// the REAL config (not install-mode) and the pool targets this DB.
process.env.ENTITY = cfg.entity;
process.env.DB_NAME = cfg.db_database;
process.env.DB_HOST = cfg.db_hostname;
process.env.DB_PORT = cfg.db_port;
process.env.DB_USER = cfg.db_username;
process.env.DB_PASSWORD = cfg.db_password;
// MEDIA_PATH must be in the env before config imports so the directory step's
// write-probe (checkDirectories → config.media.rootPath) sees the real media
// root. persistConfig also writes it to .env, so --media-path is the single
// source — no separate `MEDIA_PATH=… bun run …` env-prefix needed.
if (cfg.media_path !== '') process.env.MEDIA_PATH = cfg.media_path;
process.env.DEDALO_INSTALL_NO_RESTART = 'true'; // the CLI never self-restarts

// LANGUAGES: config.ts requires the four lang keys once ENTITY/DB are set
// (INSTALL_MODE=false), so they MUST be in the env before config is imported or
// the CLI crashes at import. Derive once here (same values persistConfig writes)
// and preset the env; deriveLangConfig is pure (no config import).
const derivedLangs = deriveLangConfig({
	langs: cfg.langs,
	appLangDefault: cfg.app_lang_default,
	dataLangDefault: cfg.data_lang_default,
});
if (derivedLangs.errors.length > 0) fail(`languages: ${derivedLangs.errors.join('; ')}`);
process.env.DEDALO_APPLICATION_LANGS = JSON.stringify(derivedLangs.applicationLangs);
process.env.DEDALO_PROJECTS_DEFAULT_LANGS = JSON.stringify(derivedLangs.projectsDefaultLangs);
process.env.DEDALO_APPLICATION_LANGS_DEFAULT = derivedLangs.applicationLangsDefault;
process.env.DEDALO_DATA_LANG_DEFAULT = derivedLangs.dataLangDefault;
process.env.DEDALO_APPLICATION_LANG = derivedLangs.applicationLangsDefault;
process.env.DEDALO_DATA_LANG = derivedLangs.dataLangDefault;
process.env.DEDALO_STRUCTURE_LANG = derivedLangs.structureLang;

const step = (n: string) => console.log(`→ ${n}`);

async function main(): Promise<void> {
	console.log(`\nDédalo TS install — entity '${cfg.entity}', db '${cfg.db_database}'\n`);

	const { runInitTest } = await import('../src/core/install/init_test.ts');
	step('pre-flight checks');
	const init = runInitTest();
	if (!init.result) fail(`pre-flight: ${init.errors.join('; ')}`);

	const { testDbConnection } = await import('../src/core/install/db_probe.ts');
	step('database connection');
	const probe = await testDbConnection(cfg);
	if (!probe.can_connect && !probe.db_exists) fail(probe.msg);
	if (!probe.db_exists)
		fail(`database '${cfg.db_database}' must exist (empty) first — ${probe.msg}`);

	if (cfg.mailer) {
		// Verify the relay like the wizard does (connection + auth, no email
		// sent) — but WARN instead of failing: an unattended install may
		// legitimately configure a relay the build host cannot reach yet.
		const { testMailerConnection } = await import('../src/core/install/mailer_probe.ts');
		step('SMTP connection');
		const smtp = await testMailerConnection(cfg);
		if (!smtp.result) console.warn(`  ⚠ ${smtp.msg} — writing the SMTP config anyway`);
	}

	const { persistConfig } = await import('../src/core/install/config_persist.ts');
	step('write ../private/.env');
	const persisted = await persistConfig(cfg);
	if (!persisted.result) fail(persisted.msg);
	for (const [k, v] of Object.entries(persisted.generated)) {
		console.log(`  generated ${k} = ${v}`);
	}

	const { checkDirectories } = await import('../src/core/install/directories.ts');
	step('directories');
	const dirs = checkDirectories({ create: true });
	if (!dirs.result)
		fail(
			dirs.dirs
				.filter((d) => !d.writable)
				.map((d) => d.path)
				.join(', '),
		);

	const { installDbFromSeed } = await import('../src/core/install/db_restore.ts');
	step('restore database from seed');
	const restored = await installDbFromSeed();
	if (!restored.result) fail(restored.msg);

	const { setRootPassword } = await import('../src/core/install/root_pw.ts');
	step('set root password');
	const rootSet = await setRootPassword(rootPassword as string);
	if (!rootSet.result) fail(rootSet.msg);

	if (hierarchies.length > 0) {
		const { installHierarchies } = await import('../src/core/install/hierarchy_import.ts');
		step(`import hierarchies: ${hierarchies.join(', ')}`);
		const h = await installHierarchies(hierarchies);
		if (!h.result) console.warn(`  ⚠ some hierarchies failed: ${h.errors.join('; ')}`);
	}

	if (!skipTools) {
		const { registerInstallTools } = await import('../src/core/install/register_tools.ts');
		step('register tools');
		const tools = await registerInstallTools();
		console.log(`  ${tools.msg}`);
	}

	const { installFinish } = await import('../src/core/install/finish.ts');
	step('seal install');
	const finished = await installFinish();
	if (!finished.result) fail(finished.msg);

	// End-to-end proof: an actual root login must succeed against the new DB.
	const { login } = await import('../src/core/security/auth.ts');
	step('verify root login');
	const auth = await login('root', rootPassword as string, 'local');
	if (!auth.ok) fail('root login verification failed after install');

	console.log(
		'\n✔ install complete — root login verified. Start the server with `bun run start`.\n',
	);
	process.exit(0);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
