// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/**
 * FOCUSED RUNNER — test_service_autocomplete
 *
 * Runs a single client suite headlessly via frame.html and prints Mocha results.
 * Logs in once on index.html (form login) so frame.html sees is_logged:true.
 *
 * Usage:
 *   DEDALO_TEST_USER=root DEDALO_TEST_PASSWORD=*** \
 *   node test/client/_run_service_autocomplete.mjs
 *
 * Env:
 *   SA_BASE_URL                base of test/client/ (default NGINX :7070/v7/)
 *   SA_AREA                    suite area (default test_service_autocomplete)
 *   DEDALO_TEST_USER           login username (default root)
 *   DEDALO_TEST_PASSWORD       login password (required if not already logged in)
 *   PUPPETEER_EXECUTABLE_PATH  Chrome binary (default macOS Google Chrome)
 *   HEADLESS                   'false' to watch (default true)
 */
import puppeteer from 'puppeteer';

const BASE     = process.env.SA_BASE_URL || 'http://localhost:7070/v7/test/client/';
const AREA     = process.env.SA_AREA || 'test_service_autocomplete';
const user     = process.env.DEDALO_TEST_USER || 'root';
const pass     = process.env.DEDALO_TEST_PASSWORD || '';
const exePath  = process.env.PUPPETEER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const headless = process.env.HEADLESS === 'false' ? false : true;

const log   = (m) => process.stdout.write(m + '\n');
const error = (m) => process.stderr.write('ERROR: ' + m + '\n');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
	let browser;
	let exitCode = 1;
	try {
		browser = await puppeteer.launch({
			headless,
			executablePath: exePath,
			protocolTimeout: 600000,
			args: ['--no-sandbox', '--disable-setuid-sandbox']
		});
		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 1024 });
		page.on('dialog', (d) => d.accept().catch(() => {}));
		page.on('pageerror', (err) => error('pageerror: ' + err.message));

		// capture frame_runner's postMessage (top-level page: window.parent === window)
		await page.evaluateOnNewDocument(() => {
			window.__sa_result = null;
			window.addEventListener('message', (e) => {
				if (e && e.data && (e.data.type === 'test_end' || e.data.type === 'test_error')) {
					window.__sa_result = e.data;
				}
			});
		});

		// 1) establish same origin, then log in via the app API (cookie injection).
		// Form login is unreliable under the test page (NGINX rewrites / redirects),
		// so we drive the documented 2-step CSRF login with same-origin fetch; the
		// browser stores the session cookie automatically (credentials:'include').
		log(`Navigating to ${BASE}index.html ...`);
		await page.goto(BASE + 'index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });

		const alreadyLogged = await page.evaluate(() => window.page_globals && window.page_globals.is_logged === true);
		if (!alreadyLogged) {
			if (!pass) { error('Login required but DEDALO_TEST_PASSWORD is empty.'); process.exit(2); }
			log('Logging in via API (cookie injection)...');
			const apiBase = new URL('../../core/api/v1/json/', BASE).href;
			const ok = await page.evaluate(async (apiBase, u, p) => {
				const body = JSON.stringify({ dd_api: 'dd_utils_api', action: 'login', options: { username: u, auth: p } });
				const r1 = await fetch(apiBase, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body });
				const j1 = await r1.json();
				const token = j1.csrf_token;
				const r2 = await fetch(apiBase, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Dedalo-Csrf-Token': token }, body });
				const j2 = await r2.json();
				return j2.result === true;
			}, apiBase, user, pass);
			if (!ok) { error('API login failed.'); process.exit(2); }
			log('Login successful.');
		}

		// 2) run the focused suite
		log(`Running suite "${AREA}" ...`);
		await page.goto(BASE + 'frame.html?area=' + encodeURIComponent(AREA) + '&theme=light', { waitUntil: 'networkidle0', timeout: 30000 });

		const start = Date.now();
		let res = null;
		while (Date.now() - start < 120000) {
			try { res = await page.evaluate(() => window.__sa_result); } catch (e) { /* ignore transient */ }
			if (res) break;
			await sleep(500);
		}

		// dump the mocha report text for detail
		const report = await page.evaluate(() => {
			const el = document.getElementById('mocha');
			return el ? el.innerText : '';
		}).catch(() => '');
		if (report) { log('\n----- mocha report -----\n' + report + '\n------------------------'); }

		if (!res) { error('No result captured within timeout.'); exitCode = 1; }
		else if (res.type === 'test_error') { error('Suite failed to load: ' + res.error); exitCode = 1; }
		else {
			log(`\nRESULT: pass=${res.stats.pass} fail=${res.stats.fail} pending=${res.stats.pending}`);
			exitCode = (res.stats.fail > 0 || res.stats.pending > 0) ? 1 : 0;
		}
	} catch (err) {
		error('Unexpected: ' + err.message);
		if (err.stack) error(err.stack);
		exitCode = 1;
	} finally {
		if (browser) await browser.close();
		process.exit(exitCode);
	}
}

main();
// @license-end
