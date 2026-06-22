// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/**
 * PUPPETEER RUNNER
 * Runs Dédalo client tests from the terminal using headless Chrome.
 *
 * Usage:
 *   node test/client/puppeteer_runner.js [options]
 *
 * Options:
 *   --url <url>         Test page URL (default: http://localhost:8080/test/client/index.html)
 *   --timeout <ms>      Max wait time in ms (default: 300000 = 5 min)
 *   --headless <bool>   Run headless (default: true)
 *   --user <username>   Login username (or set DEDALO_TEST_USER env var)
 *   --password <pwd>    Login password (or set DEDALO_TEST_PASSWORD env var)
 *
 * Environment variables:
 *   TEST_URL             Test page URL
 *   TEST_TIMEOUT         Max wait time in ms
 *   DEDALO_TEST_USER     Login username
 *   DEDALO_TEST_PASSWORD Login password
 *   HEADLESS             Set to 'false' to show browser
 */

import puppeteer from 'puppeteer';

// parse CLI args
const args = process.argv.slice(2);
const getArg = (flag, envVar, defaultValue) => {
	const idx = args.indexOf(flag);
	if (idx !== -1 && args[idx + 1]) {
		return args[idx + 1];
	}
	return process.env[envVar] || defaultValue;
};

const headlessArg = getArg('--headless', 'HEADLESS', 'true');
const headless = headlessArg === 'false' ? false : (headlessArg === 'true' ? true : 'shell');

const testUrl = getArg('--url', 'TEST_URL', 'http://localhost:8080/test/client/index.html');
const timeout = parseInt(getArg('--timeout', 'TEST_TIMEOUT', '300000'), 10);
const username = getArg('--user', 'DEDALO_TEST_USER', '');
const password = getArg('--password', 'DEDALO_TEST_PASSWORD', '');

// output helpers
const log = (msg) => process.stdout.write(msg + '\n');
const error = (msg) => process.stderr.write('ERROR: ' + msg + '\n');

async function main() {
	let browser;
	let exitCode = 1;

	try {
		log(`Navigating to ${testUrl}...`);
		log(`Timeout set to ${timeout}ms`);

		browser = await puppeteer.launch({
			headless: headless,
			args: ['--no-sandbox', '--disable-setuid-sandbox']
		});

		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 1024 });

		// track page errors
		page.on('pageerror', (err) => {
			error(`Page error: ${err.message}`);
		});

		// navigate to test page
		const response = await page.goto(testUrl, {
			waitUntil: 'networkidle0',
			timeout: 30000
		});

		if (!response || !response.ok()) {
			error(`Failed to load test page: ${response?.status()} ${response?.statusText()}`);
			error('Make sure the PHP server is running (php -S localhost:8080 -t .)');
			process.exit(1);
		}

		log('Page loaded successfully.');

		// wait for sidebar to load
		await page.waitForSelector('#test_run_all', { timeout: 10000 });

		// check if login is needed
		const needsLogin = await page.evaluate(() => {
			return window.page_globals && window.page_globals.is_logged !== true;
		});

		if (needsLogin) {
			if (!username || !password) {
				error('Login required but credentials not provided.');
				error('Set DEDALO_TEST_USER and DEDALO_TEST_PASSWORD env vars, or use --user and --password args.');
				process.exit(1);
			}

			log('Login required, attempting login...');
			await handleLogin(page, username, password);
		}

		// wait for sidebar to fully load after login
		await page.waitForSelector('#test_run_all:not([disabled])', { timeout: 10000 });

		// run all tests
		log('Starting tests...');
		await page.click('#test_run_all');

		// poll for completion: button becomes re-enabled
		const startTime = Date.now();
		let completed = false;

		while (Date.now() - startTime < timeout) {
			completed = await page.evaluate(() => {
				const btn = document.getElementById('test_run_all');
				return btn && !btn.disabled;
			});

			if (completed) {
				break;
			}

			await new Promise(resolve => setTimeout(resolve, 1000));
		}

		if (!completed) {
			error(`Tests did not complete within ${timeout}ms timeout.`);
			process.exit(1);
		}

		log('Tests completed. Collecting results...');

		// collect results from page
		const results = await page.evaluate(() => {
			const stats = window.global_stats || {};
			const groups = {};

			// collect per-group stats from DOM
			const groupElements = document.querySelectorAll('.test_group');
			groupElements.forEach(el => {
				const groupKey = el.dataset.group;
				const statsBar = el.querySelector('.test_group_stats');
				if (groupKey && statsBar) {
					const pass = parseInt(statsBar.querySelector('.group_stat_pass')?.textContent || '0');
					const fail = parseInt(statsBar.querySelector('.group_stat_fail')?.textContent || '0');
					const pending = parseInt(statsBar.querySelector('.group_stat_pending')?.textContent || '0');
					groups[groupKey] = { pass, fail, pending };
				}
			});

			return {
				total: stats.total || 0,
				pass: stats.pass || 0,
				fail: stats.fail || 0,
				pending: stats.pending || 0,
				groups: groups
			};
		});

		// output results
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

		log('');

		// exit code
		exitCode = results.fail > 0 ? 1 : 0;

	} catch (err) {
		error(`Unexpected error: ${err.message}`);
		if (err.stack) {
			error(err.stack);
		}
		exitCode = 1;
	} finally {
		if (browser) {
			await browser.close();
		}
		process.exit(exitCode);
	}
}

async function handleLogin(page, username, password) {
	// wait for login form to appear in iframe or main page
	// login component renders in main page body
	try {
		// wait for login form
		await page.waitForSelector('input[name="username"], #username, input[type="text"]', { timeout: 5000 });

		// try to fill login form (adjust selectors as needed)
		await page.evaluate((user, pass) => {
			// find username input
			const userInput = document.querySelector('input[name="username"], #username, input[type="text"]');
			const passInput = document.querySelector('input[name="password"], #password, input[type="password"]');
			const submitBtn = document.querySelector('input[type="submit"], button[type="submit"], .login_submit, .submit_button');

			if (userInput) {
				userInput.value = user;
				userInput.dispatchEvent(new Event('input', { bubbles: true }));
			}
			if (passInput) {
				passInput.value = pass;
				passInput.dispatchEvent(new Event('input', { bubbles: true }));
			}
			if (submitBtn) {
				submitBtn.click();
			}
		}, username, password);

		// wait for login to complete (page_globals.is_logged becomes true)
		await page.waitForFunction(
			() => window.page_globals && window.page_globals.is_logged === true,
			{ timeout: 10000 }
		);

		log('Login successful.');
	} catch (err) {
		error(`Login failed: ${err.message}`);
		throw new Error('Login failed');
	}
}

console.log("DBG", process.argv[1], import.meta.url, import.meta.url === `file://${process.argv[1]}`);
// if run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}

// @license-end
