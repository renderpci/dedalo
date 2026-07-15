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
 *   2. If `page_globals.is_logged !== true`, log in through the copied client's
 *      own login form (the same form Phase 7 proved works against TS auth/CSRF).
 *   3. Click "run all" (`#test_run_all`), poll until the button re-enables, then
 *      scrape `window.global_stats` + per-group DOM stats.
 *   4. Exit 0 iff zero failures AND zero pending; non-zero otherwise.
 *
 * This is deliberately NOT a `bun test` file: it needs a live server + a real
 * browser, so it stays out of the `bunfig.toml` (root=test) discovery and is run
 * explicitly via `bun run test:client`.
 *
 * Usage:
 *   bun run scripts/client_test_runner.ts [options]
 *
 * Options (env var fallback in parens):
 *   --url <url>        Runner page URL           (TEST_URL; else built from SERVER_TCP_PORT)
 *   --timeout <ms>     Max run wait, ms          (TEST_TIMEOUT; default 300000)
 *   --headless <bool>  Headless                  (HEADLESS; default true)
 *   --user <username>  Login username            (DEDALO_TEST_USER, else PHP_API_USERNAME)
 *   --password <pwd>   Login password            (DEDALO_TEST_PASSWORD, else PHP_API_PASSWORD)
 *   --no-reseed        Skip the canonical test3 reseed before/after the run
 *
 * Credentials are read via the project env loader (src/config/env.ts), so they
 * resolve from ../private/.env exactly like the rest of the config — no secret
 * ever needs to be passed on the command line.
 */

import puppeteer, { type Browser, type Page } from 'puppeteer';
import { readEnv } from '../src/config/env.ts';

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

/** Default runner URL: the local TCP dev listener the browser can reach. */
function defaultRunnerUrl(): string {
	const port = (readEnv('SERVER_TCP_PORT') ?? '3500') as string;
	return `http://localhost:${port}/dedalo/test/client/index.html`;
}

const headlessArg = getArg('--headless', 'HEADLESS', 'true');
const headless = headlessArg !== 'false';

const testUrl = getArg('--url', 'TEST_URL') ?? defaultRunnerUrl();
const timeout = Number.parseInt(getArg('--timeout', 'TEST_TIMEOUT', '300000') as string, 10);
// Credentials: prefer DEDALO_TEST_*, fall back to the PHP reference creds already
// in ../private/.env (same shared DB, so the same user authenticates on TS).
const username = getArg('--user', 'DEDALO_TEST_USER') ?? readEnv('PHP_API_USERNAME') ?? '';
const password = getArg('--password', 'DEDALO_TEST_PASSWORD') ?? readEnv('PHP_API_PASSWORD') ?? '';

const log = (message: string): void => {
	process.stdout.write(`${message}\n`);
};
const error = (message: string): void => {
	process.stderr.write(`ERROR: ${message}\n`);
};

const reseedEnabled = !args.includes('--no-reseed');

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
 * Provision the "map of grapes" demo ontology (dmm480/dmm507/dmm506) that
 * `test_additional_text_area.js`'s geolocation block depends on — see
 * src/core/test_data/dmm_map_of_grapes_fixture.ts. Idempotent; pre-run only
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
		'../src/core/test_data/dmm_map_of_grapes_fixture.ts'
	);
	await ensure();
	log('Map of grapes fixture (dmm480/507/506): ensured.');
}

// ---------------------------------------------------------------------------
// Stats shape scraped from the runner page.
// ---------------------------------------------------------------------------

interface GroupStats {
	pass: number;
	fail: number;
	pending: number;
}
interface SuiteResult {
	name: string;
	group: string;
	status: string;
}
interface RunResults {
	total: number;
	pass: number;
	fail: number;
	pending: number;
	groups: Record<string, GroupStats>;
	suites: SuiteResult[];
}

async function main(): Promise<void> {
	let browser: Browser | undefined;
	let exitCode = 1;

	try {
		if (reseedEnabled) {
			await reseedCanonicalTest3('pre-run');
			await ensureMapOfGrapesFixture();
		}
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
		if (!response || !response.ok()) {
			error(`Failed to load test page: ${response?.status()} ${response?.statusText()}`);
			error('Make sure the TS server is running (bun run src/server.ts) with a SERVER_TCP_PORT.');
			process.exit(1);
		}
		log('Page loaded successfully.');

		await page.waitForSelector('#test_run_all', { timeout: 10000 });

		const needsLogin = await page.evaluate(() => {
			const globals = (window as unknown as { page_globals?: { is_logged?: boolean } })
				.page_globals;
			return !globals || globals.is_logged !== true;
		});

		if (needsLogin) {
			if (!username || !password) {
				error('Login required but credentials not provided.');
				error(
					'Set DEDALO_TEST_USER / DEDALO_TEST_PASSWORD (or PHP_API_USERNAME / PHP_API_PASSWORD) in ../private/.env, or pass --user/--password.',
				);
				process.exit(1);
			}
			log('Login required, attempting login...');
			await handleLogin(page, username, password);
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
				const status =
					['pass', 'fail', 'running', 'pending'].find((s) => dot?.classList.contains(s)) ??
					'pending';
				suites.push({
					name: (card as HTMLElement).dataset.testName || '',
					group: (card as HTMLElement).dataset.group || '',
					status,
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

		exitCode = results.fail > 0 || results.pending > 0 ? 1 : 0;
		if (results.pending > 0) {
			error(`${results.pending} test suite(s) did not complete.`);
		}
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
		process.exit(exitCode);
	}
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
