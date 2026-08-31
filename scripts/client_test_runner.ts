/**
 * CLIENT TEST RUNNER (headless)
 *
 * Bun port of the PHP reference runner `test/client/puppeteer_runner.js`. Drives
 * the copied vanilla-JS client's Mocha/Chai suites in headless Chrome against the
 * TS server, so the browser-level client tests become a repeatable one-shot /
 * CI gate — complementing the server-side differential gates under `test/parity/`.
 *
 * How it works (identical control flow to the PHP runner):
 *   1. Launch headless Chrome and open the test runner page
 *      (`/dedalo/test/client/index.html`, served by src/server.ts under /dedalo/*).
 *   2. If `page_globals.is_logged !== true`, AUTHENTICATE. Two paths:
 *      - `cookie` (DEFAULT) — call `login()` (core/security/auth.ts) IN THIS
 *        PROCESS with the configured test credentials and inject the resulting
 *        session (and media-auth) cookie into the browser. Same password check,
 *        same session row, same audit line as a real login: the only thing
 *        skipped is the FORM. It is skipped because the form path is flaky on
 *        a dev box (the two-step reveal loses the submit and the wait times
 *        out), and a gate nobody can run is not a gate.
 *      - `form` (`--auth form`) — type into the copied client's own login form,
 *        the original path. Keep it: it is the only thing that exercises the
 *        client's login UI against TS auth/CSRF.
 *      - `mint` (`--auth mint`) — DEV ONLY, NO PASSWORD: mint a session for an
 *        EXISTING username straight through the session store. For the case
 *        the other two cannot serve — a dev DB whose `DEDALO_TEST_PASSWORD` is
 *        stale (a restored production dump carries ITS passwords, not the
 *        .env one), where a gate that refuses to run teaches nothing. It is
 *        never the default and prints a banner every run: a green run under
 *        `mint` has NOT exercised authentication.
 *   3. Click "run all" (`#test_run_all`), poll until the button re-enables, then
 *      scrape `window.global_stats` + per-group DOM stats.
 *   4. Exit 0 iff no pending suites AND no failure outside KNOWN_FAILING (the
 *      disclosed, shrink-only baseline below) — a suite in that list that now
 *      PASSES is also red, so the list can never outlive the bug it names.
 *
 * This is deliberately NOT a `bun test` file: it needs a live server + a real
 * browser, so it stays out of the `bunfig.toml` (root=test) discovery and is run
 * explicitly via `bun run test:client`.
 *
 * THE SERVER IS THE RUN'S OWN, ON THE SUITE DATABASE (2026-08-19). This runner
 * used to drive whatever `bun run dev` was already serving — which is the
 * APPLICATION's database by default, so the reseed, the demo-ontology fixture
 * and ~125 browser suites wrote into real records. It now starts its own server
 * on the dedicated suite database and tears it down, and it VERIFIES the target
 * over the wire before Chrome is launched (`/health` must answer the
 * fingerprint of the same `dedalo_test_marker` row this process reads). The
 * mechanism, the alternatives weighed, and the refusal live in
 * scripts/client_test_server.ts. `--url` still points at a server you started
 * yourself — it is checked exactly the same way, never trusted.
 *
 * Usage:
 *   bun run scripts/client_test_runner.ts [options]
 *
 * Options (env var fallback in parens):
 *   --url <url>        Runner page of a server YOU started (TEST_URL) — verified
 *                      to be on the suite database like any other target
 *   --port <n>         Port for the run's own server     (default 4390, next free)
 *   --auth <mode>      cookie (default) | form   (TEST_AUTH)
 *   --timeout <ms>     Max run wait, ms          (TEST_TIMEOUT; default 300000)
 *   --headless <bool>  Headless                  (HEADLESS; default true)
 *   --user <username>  Login username            (DEDALO_TEST_USER, else PHP_API_USERNAME)
 *   --password <pwd>   Login password            (DEDALO_TEST_PASSWORD, else PHP_API_PASSWORD)
 *   --no-reseed        Skip the canonical test3 reseed before/after the run
 *   --strict           Treat EVERY failure as red, ignoring KNOWN_FAILING
 *
 * Credentials are read via the project env loader (src/config/env.ts), so they
 * resolve from ../private/.env exactly like the rest of the config — no secret
 * ever needs to be passed on the command line.
 */

import puppeteer, { type Browser, type Page } from 'puppeteer';
import { readEnv } from '../src/config/env.ts';
import {
	assertServedDatabase,
	type ClientTestServer,
	findFreePort,
	localSuiteFingerprint,
	originOf,
	probeServedDatabase,
	repointProcessToSuiteDatabase,
	resolveSuiteDatabase,
	SUITE_DIFFUSION_DOMAIN,
	startClientTestServer,
	suiteServerPaths,
} from './client_test_server.ts';

/** The install seed's own user, and the credential the suite database gets. */
const SUITE_LOGIN_USER = 'root';
/** Kept in step with src/core/test_data/suite_login.ts (imported lazily below). */
const SUITE_LOGIN_PASSWORD = 'dedalo_suite_client_tests';

// ---------------------------------------------------------------------------
// CLI / env argument resolution (mirrors the PHP runner's getArg helper).
// ---------------------------------------------------------------------------

const args = Bun.argv.slice(2);

/** Resolve a value from --flag, then an env var, then a default. */
function getArg(flag: string, envVar: string, defaultValue?: string): string | undefined {
	const index = args.indexOf(flag);
	if (index !== -1 && args[index + 1] !== undefined) {
		return args[index + 1];
	}
	return readEnv(envVar) ?? defaultValue;
}

const log = (message: string): void => {
	process.stdout.write(`${message}\n`);
};
const error = (message: string): void => {
	process.stderr.write(`ERROR: ${message}\n`);
};

/** The runner page, given an origin. */
function runnerPageUrl(origin: string): string {
	return `${origin}/dedalo/test/client/index.html`;
}

const headlessArg = getArg('--headless', 'HEADLESS', 'true');
const headless = headlessArg !== 'false';

/**
 * An EXTERNAL server to drive, or undefined = the run starts its own. Either
 * way the target is probed: `--url` buys you a server you can watch, never a
 * server that is taken on trust.
 */
const externalUrl = getArg('--url', 'TEST_URL');
const preferredPort = Number.parseInt(getArg('--port', 'TEST_PORT', '4390') as string, 10);
const timeout = Number.parseInt(getArg('--timeout', 'TEST_TIMEOUT', '300000') as string, 10);
// Credentials: prefer DEDALO_TEST_*, fall back to the PHP reference creds already
// in ../private/.env (same shared DB, so the same user authenticates on TS).
//
// USERNAME: the seed's own `root` unless told otherwise — the suite database is
// built from install/db/dedalo_install.pgsql.gz, which is where that user comes
// from. PASSWORD: whatever is configured, else the SUITE CONSTANT
// (src/core/test_data/suite_login.ts). The seed ships root with NO password, so
// before the browser logs in the runner MAKES this credential true on the
// disposable database (ensureSuiteLogin below) — that is how the run keeps
// exercising a real, password-verified login instead of falling back to
// `--auth mint`, which verifies nothing.
const username =
	getArg('--user', 'DEDALO_TEST_USER') ?? readEnv('PHP_API_USERNAME') ?? SUITE_LOGIN_USER;
const password = getArg('--password', 'DEDALO_TEST_PASSWORD') ?? SUITE_LOGIN_PASSWORD;

const reseedEnabled = !args.includes('--no-reseed');
const strict = args.includes('--strict');
/** How the run authenticates: an in-process real login + cookie, or the form. */
const authMode = (getArg('--auth', 'TEST_AUTH', 'cookie') as string).toLowerCase();
if (authMode !== 'cookie' && authMode !== 'form' && authMode !== 'mint') {
	error(`Unknown --auth '${authMode}'. Use 'cookie' (default), 'form' or 'mint' (dev only).`);
	process.exit(1);
}

/**
 * Reseed the canonical test3 playground from the single verified source
 * (src/core/test_data/). The component sweeps save random values into the
 * shared test3 records, so the run must START deterministic (pre-run) and
 * must not leave pollution behind for the parity gates (post-run).
 *
 * DB-only (DEC-20 — save events fan out in-process): a long-lived dev server
 * may still hold stale test3-derived datalist caches after this external
 * reseed. Restart it — or trigger the "Unit test area" maintenance widget,
 * which reseeds in-process — when full cache coherence matters.
 *
 * client/ stays byte-identical: in-run shared-record pollution between suites
 * (per-suite section_ids in elements.js) is future UPSTREAM work — see the
 * rewrite/LEDGER.md known-open row.
 */
async function reseedCanonicalTest3(phase: string): Promise<void> {
	const { restoreCanonicalTest3 } = await import('../src/core/test_data/seed.ts');
	const { restored } = await restoreCanonicalTest3();
	log(`Canonical test3 reseed (${phase}): ${restored} records restored.`);
}

/**
 * Provision the "map of grapes" demo ontology (test480/test507/test506) that
 * `test_additional_text_area.js`'s geolocation block depends on — see
 * src/core/test_data/map_of_grapes_fixture.ts. Idempotent; pre-run only
 * (nothing in the suite mutates the ontology shape, only the record's data,
 * which this re-provisions to the same starting content each run).
 *
 * Same DB-only caveat as reseedCanonicalTest3: this runs in the SCRIPT's own
 * process, so its cache-invalidation call only clears ITS OWN in-memory
 * ontology cache, not the long-lived dev server's. The first time this
 * fixture is created against a server that already cached a negative lookup
 * for these tipos (e.g. from an earlier failed request), restart the TS
 * server once — every run after that is DB-only stable.
 */
async function ensureMapOfGrapesFixture(): Promise<void> {
	const { ensureMapOfGrapesFixture: ensure } = await import(
		'../src/core/test_data/map_of_grapes_fixture.ts'
	);
	await ensure();
	log('Map of grapes fixture (test480/507/506): ensured.');
}

/**
 * Provision the SECOND project `test_component_filter.js` needs — see
 * src/core/test_data/projects_fixture.ts for why one is not enough. Installed
 * before the server spawns (so it reads the row cold) and swept in the same
 * place the post-run reseed runs, so no other tier on this shared database
 * inherits a widened projects catalog.
 */
async function ensureSuiteProjectsFixture(): Promise<void> {
	const { ensureSuiteProjectsFixture: ensure } = await import(
		'../src/core/test_data/projects_fixture.ts'
	);
	await ensure();
	log('Suite projects fixture (dd153 second project): ensured.');
}

async function removeSuiteProjectsFixture(): Promise<void> {
	const { removeSuiteProjectsFixture: remove } = await import(
		'../src/core/test_data/projects_fixture.ts'
	);
	await remove();
	log('Suite projects fixture (dd153 second project): swept.');
}

/**
 * PRE-FLIGHT: the diffusion surface `test_diffusion.js` drives must EXIST.
 *
 * The inspector draws the publish opener only when the section's tools list
 * carries `tool_diffusion`, and that tool's availability is `haveSectionDiffusion`
 * — an O(1) lookup in a map built by walking the CONFIGURED diffusion domain
 * (src/core/diffusion_bridge/diffusion_map.ts). An empty map is not an error
 * anywhere in the engine: a fresh install legitimately has no diffusion, so every
 * caller returns "unavailable" quietly. That silence is exactly what made a
 * misconfigured domain surface as six unexplained `expected false to equal true`
 * DOM assertions instead of naming itself. Assert it here, before Chrome starts,
 * so the run fails with the domain's name in the message.
 *
 * DB-only, like the other pre-run fixtures: it proves this DATABASE answers, in
 * THIS process, for the pinned SUITE_DIFFUSION_DOMAIN. An external `--url`
 * server started with a different domain is outside what this can see.
 */
async function assertSuiteDiffusionSurface(): Promise<void> {
	// The section test_diffusion.js opens (all three of its describes drive it).
	const DIFFUSION_SECTION = 'rsc170';
	const { haveSectionDiffusion, getSectionDiffusionMap } = await import(
		'../src/core/diffusion_bridge/diffusion_map.ts'
	);
	const map = await getSectionDiffusionMap();
	if (!(await haveSectionDiffusion(DIFFUSION_SECTION))) {
		throw new Error(
			`REFUSING to run: the diffusion domain '${SUITE_DIFFUSION_DOMAIN}' resolves ${map.size} publishable section(s) on this database and ${DIFFUSION_SECTION} is not among them` +
				(map.size === 0
					? " — the domain name matches no dd1190 child, or its subtree reaches no section. Rebuild the suite database with 'bun run test:db:setup'."
					: ` (it resolves: ${[...map].join(', ')}).`) +
				' Without it the inspector draws no publish opener and test_diffusion fails with unexplained DOM assertions.',
		);
	}
	log(
		`Diffusion domain '${SUITE_DIFFUSION_DOMAIN}': ${map.size} publishable sections, ${DIFFUSION_SECTION} included.`,
	);
}

/**
 * Make the run's credential true on the suite database (a no-op when it already
 * is). Guarded by the marker like every other test-data write, so it can only
 * ever touch a database that declares itself disposable.
 */
async function ensureSuiteLogin(): Promise<void> {
	const { ensureSuiteLoginPassword, SUITE_LOGIN_PASSWORD: constant } = await import(
		'../src/core/test_data/suite_login.ts'
	);
	if (constant !== SUITE_LOGIN_PASSWORD) {
		error(
			`the suite login constant drifted (${SUITE_LOGIN_PASSWORD} here vs ${constant} in src/core/test_data/suite_login.ts)`,
		);
		process.exit(1);
	}
	const outcome = await ensureSuiteLoginPassword(username, password);
	log(`Suite login for '${username}': ${outcome}.`);
}

// ---------------------------------------------------------------------------
// THE DISCLOSED BASELINE — shrink-only, never a blanket.
// ---------------------------------------------------------------------------

/**
 * Suites that are RED TODAY, each with what it actually asserts when it fails.
 *
 * MEASURED 2026-08-20 through THIS runner (which reseeds canonical test3 before
 * the run) against the :4000 dev listener: 131 suites, 131 pass, 0 fail, 0
 * pending, 0 deferred — the whole inventory runs. Two consecutive runs agree,
 * and a `--strict` run is identical because the list below is empty.
 *
 * (!) Measure the baseline WITH the reseed. A hand-driven run against a polluted
 * test3 showed NINE failures — seven of them were leftover state from earlier
 * runs, not bugs. `--no-reseed` is for iterating, never for freezing this list.
 *
 * This list is a LEDGER, not a mute button:
 *  - a failure NOT listed here is red (that is the whole point of the gate);
 *  - a suite listed here that PASSES is ALSO red — fix the bug, delete the row,
 *    in the same change. A stale excuse outliving its bug is how a baseline
 *    turns into a blanket.
 *  - `--strict` ignores the list entirely (every failure red), for the day the
 *    last row goes.
 *
 * These are client/server bugs, not runner problems; each needs its own change.
 * Do NOT add a row to get a run green — a row costs the same reading as the fix.
 *
 * THE LIST IS EMPTY (2026-08-20). Every failure is red on its own, and a plain
 * run is now equivalent to `--strict`. Keep it that way: the next red suite
 * gets a fix, not a row.
 */
/**
 * THE INVENTORY FLOOR — what this run must OBSERVE before its verdict means
 * anything (P0-2, the green-by-absence class).
 *
 * The verdict below is "no pending suite, and no failure outside KNOWN_FAILING".
 * Every term of that is about suites the run FOUND. A run that discovers three
 * cards instead of all of them — a renamed registry, a page that half-rendered,
 * a selector that stopped matching — passes all three, exits 0, and reports a
 * green client tier over almost nothing. The count is the only thing that
 * notices.
 *
 * A FLOOR, not an equality: adding suites raises it (update it in the same
 * change), and a DROP is a deliberate edit that has to say which suites went and
 * why. Measured 2026-08-31: 132 suites. Set just under, so one legitimately
 * deferred card does not red the tier while a discovery collapse does.
 *
 * (!) SUITES ONLY. `global_stats.total` is the CARD count, not a mocha-test
 * count — the page exposes no per-suite test total, so this floor cannot see a
 * suite that rendered and ran zero `it()`. Closing that needs a
 * `data-test-count` on the card; until then it is stated here rather than
 * implied by a number that does not mean what its name suggests.
 */
const SUITE_FLOOR = 128;

const KNOWN_FAILING: ReadonlyMap<string, string> = new Map([]);

/**
 * KNOWN_FLAKY WAS DELETED (2026-08-24), deliberately and without a replacement.
 *
 * It held one name, had no ratchet, no staleness check and no registration: a
 * listed suite that stopped flaking was never reported, so the row could outlive
 * its bug indefinitely. The honest mechanical form — an N-consecutive-green
 * record — needs an artifact nothing here keeps, and the naive rule ("listed but
 * passed → red") cannot work, because passing is what a flaky suite mostly does.
 *
 * So a flaky failure is now simply RED, and gets fixed or quarantined properly.
 * The principle is already stated for KNOWN_FAILING above: a stale excuse
 * outliving its bug is how a baseline turns into a blanket.
 */

// ---------------------------------------------------------------------------
// Stats shape scraped from the runner page.
// ---------------------------------------------------------------------------

interface GroupStats {
	pass: number;
	fail: number;
	pending: number;
}
/** One failing mocha test, as the frame reported it (client/.../frame_runner.js). */
interface SuiteFailure {
	title: string;
	message: string;
	stack?: string;
}
interface SuiteResult {
	name: string;
	group: string;
	status: string;
	/** Why it is red. Empty on a failing suite = no mocha failure at all. */
	failures: SuiteFailure[];
}
interface RunResults {
	total: number;
	pass: number;
	fail: number;
	pending: number;
	groups: Record<string, GroupStats>;
	suites: SuiteResult[];
}

/**
 * STEP ZERO, BEFORE ANY ENGINE IMPORT — point this process at the suite
 * database and get the fingerprint of its marker row (what every target is
 * then checked against).
 *
 * Order is load-bearing twice over: src/config/config.ts freezes the connection
 * at import, so the repoint must happen before the first dynamic import of
 * anything under src/core/ (the static imports at the top of this file are
 * puppeteer and src/config/env.ts, neither of which connects); and the
 * fingerprint must exist before a server is spawned, because it is what the
 * spawned server is checked against.
 *
 * `localSuiteFingerprint` calls `assertTestDatabase('client_test_runner')`, so
 * the runner's own writes (the test3 reseed, the map-of-grapes fixture) are
 * refused on an unmarked database by the same door as every other test-data
 * writer — the guarantee no longer depends on this file being careful.
 */
async function prepareSuiteDatabase(): Promise<{ suiteDb: string; fingerprint: string }> {
	const { suiteDb, appDb } = resolveSuiteDatabase();
	// The per-run session store must be in place BEFORE the first engine import:
	// src/core/security/session_store.ts resolves its path once, at import. Only
	// when the run owns its server — an external --url server reads its own
	// default store, and the runner must mint into that one.
	// (suiteServerPaths is pid-derived, so the spawn below computes the same.)
	repointProcessToSuiteDatabase(
		suiteDb,
		externalUrl === undefined ? suiteServerPaths().sessionDbPath : undefined,
	);
	log(`Suite database: ${suiteDb} (the application database '${appDb}' is never served).`);
	return { suiteDb, fingerprint: await localSuiteFingerprint() };
}

/**
 * The verified target: the run's own server, or the one `--url` names — checked
 * the same way either way.
 *
 * CALLED AFTER THE FIXTURES, deliberately. The runner writes them on its OWN
 * connection, so a server that was already up would be holding caches built
 * before those rows existed (that is what the "restart the TS server once"
 * caveat used to be about). A server started AFTER them has no such history —
 * it reads the reseeded playground and the demo ontology at boot. Nothing can
 * be done about that for an external `--url` server, where the caveat stands.
 */
async function openTarget(options: {
	suiteDb: string;
	fingerprint: string;
}): Promise<{ url: string; server?: ClientTestServer }> {
	if (externalUrl !== undefined) {
		const origin = originOf(externalUrl);
		log(`Verifying the server you started at ${origin}...`);
		const served = await probeServedDatabase(origin);
		assertServedDatabase({ origin, expected: options.fingerprint, served });
		log("Verified: that server is on this checkout's suite database.");
		return { url: externalUrl };
	}
	const port = await findFreePort(preferredPort);
	const server = await startClientTestServer({
		suiteDb: options.suiteDb,
		expectedFingerprint: options.fingerprint,
		port,
		log,
	});
	return { url: runnerPageUrl(server.origin), server };
}

/**
 * Ctrl-C MUST NOT LEAVE SCRATCH DATA ON THE SHARED DATABASE.
 *
 * The projects fixture widens the authorized-projects catalog, and `finally`
 * never runs on a signal — so an interrupted run used to hand every later
 * `bun test` tier a catalog the suite database is not supposed to have, with
 * nothing to say where it came from. Registered ONCE, before any fixture is
 * installed; it sweeps, then re-raises the signal by exiting on the conventional
 * 128+n code so a shell still sees an interrupted run as interrupted.
 */
/**
 * Did THIS run install the projects fixture? The sweep REFUSES when it deletes
 * nothing (that refusal is the guarantee the row never survives a run), so it
 * must only be asked on a run that got as far as creating it — otherwise a run
 * that died in `prepareSuiteDatabase` reports a phantom "unaccounted for" row.
 */
let projectsFixtureInstalled = false;

function sweepOnSignal(): void {
	for (const signal of ['SIGINT', 'SIGTERM'] as const) {
		process.on(signal, () => {
			void (async () => {
				error(`${signal} — sweeping scratch fixtures before exit.`);
				if (projectsFixtureInstalled) {
					try {
						await removeSuiteProjectsFixture();
					} catch (err) {
						error(`sweep on ${signal} failed: ${(err as Error).message}`);
					}
				}
				process.exit(signal === 'SIGINT' ? 130 : 143);
			})();
		});
	}
}

async function main(): Promise<void> {
	let browser: Browser | undefined;
	let server: ClientTestServer | undefined;
	let exitCode = 1;

	sweepOnSignal();
	try {
		const suite = await prepareSuiteDatabase();
		if (authMode !== 'mint') {
			await ensureSuiteLogin();
		}
		if (reseedEnabled) {
			await reseedCanonicalTest3('pre-run');
			await ensureMapOfGrapesFixture();
		}
		// OUTSIDE the reseed block, deliberately. `--no-reseed` skips restoring the
		// test3 playground to iterate faster; it must not also remove a SITUATION a
		// suite asserts against. test_component_filter requires the projects
		// catalog to offer more options than the record selects, so without this
		// row `--no-reseed` would fail a suite that has nothing wrong with it — a
		// documented flag turning a green suite red is worse than the seconds it
		// saves. The fixture sweeps itself first, so it is idempotent.
		await ensureSuiteProjectsFixture();
		projectsFixtureInstalled = true;
		await assertSuiteDiffusionSurface();
		const target = await openTarget(suite);
		const testUrl = target.url;
		server = target.server;
		log(`Navigating to ${testUrl}...`);
		log(`Timeout set to ${timeout}ms`);

		// Prefer an explicit browser path (PUPPETEER_EXECUTABLE_PATH), else fall back
		// to a system Chrome install via `channel` so we don't require Puppeteer's
		// bundled-Chromium download (kept out of install to stay lightweight/CI-friendly).
		const executablePath = readEnv('PUPPETEER_EXECUTABLE_PATH');
		browser = await puppeteer.launch({
			headless,
			args: ['--no-sandbox', '--disable-setuid-sandbox'],
			...(executablePath ? { executablePath } : { channel: 'chrome' as const }),
		});

		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 1024 });

		// Accept native dialogs (e.g. the remove-confirm `confirm()`); without a
		// handler Chrome auto-dismisses them, cancelling remove/reset operations
		// that several suites exercise.
		page.on('dialog', (dialog) => {
			dialog.accept().catch(() => {});
		});
		page.on('pageerror', (err) => {
			error(`Page error: ${err instanceof Error ? err.message : String(err)}`);
		});

		const response = await page.goto(testUrl, { waitUntil: 'networkidle0', timeout: 30000 });
		if (!response?.ok()) {
			error(`Failed to load test page: ${response?.status()} ${response?.statusText()}`);
			error(
				"The run's own server answered /health but not the client page — check its output above.",
			);
			throw new Error('test page did not load');
		}
		log('Page loaded successfully.');

		await page.waitForSelector('#test_run_all', { timeout: 10000 });

		const needsLogin = await page.evaluate(() => {
			const globals = (window as unknown as { page_globals?: { is_logged?: boolean } })
				.page_globals;
			return globals?.is_logged !== true;
		});

		if (needsLogin) {
			if (!username || (!password && authMode !== 'mint')) {
				error('Login required but credentials not provided.');
				error(
					'The suite database supplies its own credential; pass --user/--password only to override it.',
				);
				process.exit(1);
			}
			if (authMode === 'cookie' || authMode === 'mint') {
				log(
					authMode === 'mint'
						? `Login required, MINTING a session for '${username}' WITHOUT a password...`
						: 'Login required, minting a session (real login, no form)...',
				);
				await injectSessionCookie(browser, page, testUrl, username, password, authMode);
			} else {
				log('Login required, attempting form login...');
				await handleLogin(page, username, password);
			}
		}

		// Sidebar fully populates from test_registry.js once logged in.
		await page.waitForSelector('#test_run_all:not([disabled])', { timeout: 10000 });

		log('Starting tests...');
		await page.click('#test_run_all');

		// Poll for completion: the run-all button re-enables when the queue drains.
		const startTime = performance.now();
		let completed = false;
		while (performance.now() - startTime < timeout) {
			completed = await page.evaluate(() => {
				const button = document.getElementById('test_run_all') as HTMLButtonElement | null;
				return button !== null && !button.disabled;
			});
			if (completed) {
				break;
			}
			await new Promise((r) => setTimeout(r, 1000));
		}

		if (!completed) {
			error(`Tests did not complete within ${timeout}ms timeout.`);
			process.exit(1);
		}
		log('Tests completed. Collecting results...');

		const results: RunResults = await page.evaluate(() => {
			const stats =
				(window as unknown as { global_stats?: Partial<RunResults> }).global_stats ?? {};
			const groups: Record<string, GroupStats> = {};
			for (const el of document.querySelectorAll('.test_group')) {
				const groupKey = (el as HTMLElement).dataset.group;
				const statsBar = el.querySelector('.test_group_stats');
				if (groupKey && statsBar) {
					const num = (sel: string) =>
						Number.parseInt(statsBar.querySelector(sel)?.textContent || '0', 10);
					groups[groupKey] = {
						pass: num('.group_stat_pass'),
						fail: num('.group_stat_fail'),
						pending: num('.group_stat_pending'),
					};
				}
			}
			// Per-suite outcome from each card's status dot — feeds the coverage ledger.
			const suites: SuiteResult[] = [];
			for (const card of document.querySelectorAll('.test_card')) {
				const dot = card.querySelector('.test_card_status');
				// 'deferred' FIRST: a deferred card is excluded from run-all and from
				// the page's counters by design (test_registry.js). Reading it as
				// 'pending' made three known-deferred suites look like a stalled run.
				const status =
					['deferred', 'pass', 'fail', 'running', 'pending'].find((s) =>
						dot?.classList.contains(s),
					) ?? 'pending';
				// The failure reasons the frame reported, parked on the card by
				// client/dedalo/test/client/js/index.js. Scraped alongside the dot so
				// a red suite is never opaque in the terminal.
				let failures: SuiteFailure[] = [];
				const raw = (card as HTMLElement).dataset.testFailures;
				if (raw) {
					try {
						failures = JSON.parse(raw) as SuiteFailure[];
					} catch {
						failures = [{ title: '(unparseable failure payload)', message: raw }];
					}
				}
				suites.push({
					name: (card as HTMLElement).dataset.testName || '',
					group: (card as HTMLElement).dataset.group || '',
					status,
					failures,
				});
			}
			return {
				total: stats.total || 0,
				pass: stats.pass || 0,
				fail: stats.fail || 0,
				pending: stats.pending || 0,
				groups,
				suites,
			};
		});

		log('\n=== Test Results ===');
		log(`Total:   ${results.total}`);
		log(`Pass:    ${results.pass}`);
		log(`Fail:    ${results.fail}`);
		log(`Pending: ${results.pending}`);
		if (Object.keys(results.groups).length > 0) {
			log('\n--- Per Group ---');
			for (const [group, stats] of Object.entries(results.groups)) {
				log(`${group}: ${stats.pass} pass, ${stats.fail} fail, ${stats.pending} pending`);
			}
		}
		if (results.suites.length > 0) {
			log('\n--- Per Suite (for the coverage ledger) ---');
			for (const suite of results.suites) {
				log(`  [${suite.status.toUpperCase().padEnd(7)}] ${suite.group}/${suite.name}`);
			}
		}
		log('');

		// WHY EACH RED SUITE IS RED — printed for EVERY failing suite, including one
		// listed in KNOWN_FAILING: a known failure with an unknown reason is still
		// unknown. A failing suite with no listed failure never reached mocha
		// (import/setup error, watchdog) — said explicitly, because that is itself a
		// diagnosis.
		const failing = results.suites.filter((s) => s.status === 'fail');
		if (failing.length > 0) {
			log('--- Failure detail ---');
			for (const suite of failing) {
				log(`  ${suite.group}/${suite.name}`);
				if (suite.failures.length === 0) {
					log('    (no mocha failure reported — the suite did not run to completion)');
					continue;
				}
				for (const failure of suite.failures) {
					log(`    ✗ ${failure.title}`);
					for (const line of String(failure.message).split('\n')) {
						log(`        ${line}`);
					}
					if (failure.stack) {
						for (const line of failure.stack.split('\n')) {
							log(`        ${line.trim()}`);
						}
					}
				}
			}
			log('');
		}

		// VERDICT — measured against the disclosed baseline, in both directions.
		const failed = results.suites.filter((s) => s.status === 'fail').map((s) => s.name);
		const unexpectedFailures = strict ? failed : failed.filter((name) => !KNOWN_FAILING.has(name));
		const unexpectedPasses = strict
			? []
			: [...KNOWN_FAILING.keys()].filter(
					(name) => results.suites.find((s) => s.name === name)?.status === 'pass',
				);
		// Annotate only when there IS an annotation: an empty header under a red run
		// reads as "these were expected", which is the opposite of the truth.
		const annotated = failed.filter((n) => KNOWN_FAILING.has(n));
		if (!strict && annotated.length > 0) {
			log('--- Known-failing suites (engineering ledger; see KNOWN_FAILING) ---');
			for (const name of annotated) {
				log(`  [KNOWN  ] ${name} — ${KNOWN_FAILING.get(name)}`);
			}
		}
		// THE INVENTORY FLOOR, before the pass/fail verdict — a run that observed
		// almost nothing must not be able to report success (P0-2).
		const observedSuites = results.suites.length;
		const inventoryShort: string[] = [];
		if (observedSuites < SUITE_FLOOR) {
			inventoryShort.push(
				`observed ${observedSuites} suites, floor is ${SUITE_FLOOR} — the page did not render the registry this run is supposed to check`,
			);
		}
		// NOT COVERED, and said rather than stubbed: a card with zero `it()` renders
		// a green dot and asserts nothing. See SUITE_FLOOR's note — it needs a
		// per-suite test count the page does not expose.
		for (const line of inventoryShort) {
			error(`INVENTORY: ${line}`);
		}

		if (results.pending > 0) {
			error(`${results.pending} test suite(s) did not complete.`);
		}
		for (const name of unexpectedFailures) {
			error(`NEW failing suite (not in KNOWN_FAILING): ${name}`);
		}
		for (const name of unexpectedPasses) {
			error(
				`${name} is listed in KNOWN_FAILING but PASSED — delete its row in the same change that fixed it (a stale excuse becomes a blanket).`,
			);
		}
		exitCode =
			results.pending > 0 ||
			unexpectedFailures.length > 0 ||
			unexpectedPasses.length > 0 ||
			inventoryShort.length > 0
				? 1
				: 0;
	} catch (err) {
		error(`Unexpected error: ${(err as Error).message}`);
		if ((err as Error).stack) {
			error((err as Error).stack as string);
		}
		exitCode = 1;
	} finally {
		if (browser) {
			await browser.close();
		}
		if (reseedEnabled) {
			// Never mask the test exit code with a reseed failure.
			try {
				await reseedCanonicalTest3('post-run');
			} catch (err) {
				error(`post-run reseed failed: ${(err as Error).message}`);
			}
		}
		// Swept whatever the reseed flag says, because it is INSTALLED whatever the
		// reseed flag says (see above). This row widens the authorized-projects
		// catalog on the SHARED suite database, so leaving it behind changes what
		// the unit and parity tiers see.
		if (projectsFixtureInstalled) {
			try {
				await removeSuiteProjectsFixture();
			} catch (err) {
				error(`post-run projects fixture sweep failed: ${(err as Error).message}`);
			}
		}
		// The run owns its server: it must not outlive the run (an orphan holds
		// the port and the next run picks a different one, silently).
		if (server !== undefined) {
			try {
				await server.stop();
				log("The run's own server stopped.");
			} catch (err) {
				error(`stopping the client-test server failed: ${(err as Error).message}`);
			}
		}
		process.exit(exitCode);
	}
}

/**
 * COOKIE AUTH — a REAL login, without the form.
 *
 * Calls `login()` (core/security/auth.ts) in this process: the same password
 * verification, the same throttle, the same session row in the shared session
 * store (../private/dedalo_ts_sessions.sqlite — the server reads the very row
 * this writes), the same audit line. Then it injects the session cookie into
 * the browser and reloads, which is the ONLY thing the form was doing that
 * this skips.
 *
 * Why not the form: it is a two-step reveal ("Siguiente" → "Entrar"), and on a
 * dev box the second step regularly loses the submit, so the wait for
 * `is_logged` times out and the gate cannot run AT ALL. `--auth form` keeps
 * that path for when the login UI itself is what you want to exercise.
 *
 * The cookie is HttpOnly, so it must be set through CDP (`browser.setCookie`)
 * — `document.cookie` in the page cannot write it. The media-auth cookie rides
 * along when login issued one, or the media-bearing suites see 404s.
 */
async function injectSessionCookie(
	browser: Browser,
	page: Page,
	url: string,
	user: string,
	pass: string,
	mode: string,
): Promise<void> {
	const { SESSION_COOKIE } = await import('../src/core/security/session_store.ts');
	const { MEDIA_AUTH_COOKIE } = await import('../src/core/media/protection.ts');

	const result = mode === 'mint' ? await mintSessionForUser(user) : await realLogin(user, pass);
	if (!result.ok || result.sessionToken === undefined) {
		error(`Login refused for '${user}': ${result.message}`);
		throw new Error('Login failed');
	}
	const { hostname } = new URL(url);
	await browser.setCookie({
		name: SESSION_COOKIE,
		value: result.sessionToken,
		domain: hostname,
		path: '/',
	});
	if (result.mediaAuthCookieValue !== undefined && result.mediaAuthCookieValue !== null) {
		await browser.setCookie({
			name: MEDIA_AUTH_COOKIE,
			value: result.mediaAuthCookieValue,
			domain: hostname,
			path: '/',
		});
	}
	await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
	const logged = await page.evaluate(() => {
		const globals = (window as unknown as { page_globals?: { is_logged?: boolean } }).page_globals;
		return globals?.is_logged === true;
	});
	if (!logged) {
		error('Session cookie injected but page_globals.is_logged is still not true.');
		throw new Error('Login failed');
	}
	log(`Login successful (session for '${user}', cookie injected).`);
}

/** What either auth path hands back to the cookie injector. */
interface RunnerSession {
	ok: boolean;
	message: string;
	sessionToken?: string;
	mediaAuthCookieValue?: string;
}

/** The real thing: password verified, throttle applied, audit line written. */
async function realLogin(user: string, pass: string): Promise<RunnerSession> {
	const { login } = await import('../src/core/security/auth.ts');
	return await login(user, pass, '127.0.0.1');
}

/**
 * DEV ESCAPE HATCH (`--auth mint`): a session for an EXISTING user, no
 * password. It still resolves the real user row and the real admin grant
 * (resolvePrincipal), so the session is not a fabricated superuser — but NO
 * CREDENTIAL IS CHECKED. Refuses an unknown username, so it cannot invent a
 * user, and announces itself every run.
 */
async function mintSessionForUser(user: string): Promise<RunnerSession> {
	error('--auth mint: NO PASSWORD IS VERIFIED. This run does not exercise authentication.');
	const { sql } = await import('../src/core/db/postgres.ts');
	const rows = (await sql`
		SELECT section_id
		FROM matrix_users
		WHERE section_tipo = 'dd128'
		  AND string->'dd132'->0->>'value' = ${user}
		LIMIT 1
	`) as { section_id: number }[];
	const row = rows[0];
	if (row === undefined) {
		return { ok: false, message: `no such user '${user}' in this database` };
	}
	const { resolvePrincipal } = await import('../src/core/security/permissions.ts');
	const { createSession } = await import('../src/core/security/session_store.ts');
	const { isGlobalAdmin } = await resolvePrincipal(row.section_id);
	// Mint this session's MEDIA credential too, exactly as login does. Skipping it would
	// hand the run a session with no media access, so every image/av/pdf the suite loads
	// would 404 under a configured mode — and since the default became fail-closed, that
	// is now the ordinary case rather than an exotic one.
	const { issueSessionMediaKey } = await import('../src/core/media/protection.ts');
	const mediaKey = issueSessionMediaKey();
	return {
		ok: true,
		message: 'ok',
		sessionToken: createSession(row.section_id, user, isGlobalAdmin, mediaKey),
	};
}

/**
 * Log in through the copied client's own login form. The TS-served client uses
 * `#username` + `#auth` (password), with a two-step reveal ("Siguiente" → then
 * "Entrar"). We fill both fields (both live in the DOM) and click the login
 * form's submit button, then wait for `page_globals.is_logged === true`.
 */
async function handleLogin(page: Page, user: string, pass: string): Promise<void> {
	try {
		await page.waitForSelector('#username', { timeout: 5000 });

		await page.evaluate(
			(u, p) => {
				const setValue = (el: Element | null, value: string) => {
					if (el) {
						(el as HTMLInputElement).value = value;
						el.dispatchEvent(new Event('input', { bubbles: true }));
						el.dispatchEvent(new Event('change', { bubbles: true }));
					}
				};
				setValue(document.querySelector('#username'), u);
				setValue(document.querySelector('#auth'), p);

				// Click the visible login button. The login form uses `.button_enter`;
				// its two steps are "Siguiente" (reveal) then "Entrar" (submit). Prefer
				// the submit button; otherwise click whichever `.button_enter` is shown.
				const isVisible = (el: Element) => (el as HTMLElement).offsetParent !== null;
				const enters = Array.from(
					document.querySelectorAll<HTMLButtonElement>('.button_enter'),
				).filter(isVisible);
				const submit = enters.find((b) => b.type === 'submit') ?? enters[0] ?? null;
				submit?.click();
			},
			user,
			pass,
		);

		// If a two-step form only advanced past "Siguiente", the password field is
		// now revealed but not submitted — fill again and submit the final step.
		await page
			.waitForFunction(
				() => {
					const globals = (window as unknown as { page_globals?: { is_logged?: boolean } })
						.page_globals;
					return globals?.is_logged === true;
				},
				{ timeout: 10000 },
			)
			.catch(async () => {
				await page.evaluate(
					(u, p) => {
						const setValue = (el: Element | null, value: string) => {
							if (el) {
								(el as HTMLInputElement).value = value;
								el.dispatchEvent(new Event('input', { bubbles: true }));
								el.dispatchEvent(new Event('change', { bubbles: true }));
							}
						};
						setValue(document.querySelector('#username'), u);
						setValue(document.querySelector('#auth'), p);
						const submit = document.querySelector<HTMLButtonElement>(
							'.button_enter[type="submit"]',
						);
						submit?.click();
					},
					user,
					pass,
				);
				await page.waitForFunction(
					() => {
						const globals = (window as unknown as { page_globals?: { is_logged?: boolean } })
							.page_globals;
						return globals?.is_logged === true;
					},
					{ timeout: 10000 },
				);
			});

		log('Login successful.');
	} catch (err) {
		error(`Login failed: ${(err as Error).message}`);
		throw new Error('Login failed');
	}
}

main();
