// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/**
 * AREA_MAINTENANCE WIDGET LOADING — acceptance test
 *
 * Verifies the unified lazy-load contract by counting get_widget_value API
 * requests per widget while driving the live maintenance dashboard.
 *
 * Run (server must be serving the app; see test/client/README.md — serve via
 * NGINX, not `php -S`, and provide credentials):
 *   MAINT_URL=<maintenance dashboard URL> \
 *   DEDALO_TEST_USER=<user> DEDALO_TEST_PASSWORD=<pwd> \
 *   node test/client/maintenance/widget_loading.test.mjs
 *
 * Env:
 *   MAINT_URL              full URL that renders the area_maintenance dashboard
 *   DEDALO_TEST_USER       login username
 *   DEDALO_TEST_PASSWORD   login password
 *   HEADLESS               'false' to watch (default true)
 *   SETTLE_MS              ms to wait for background loads (default 4000)
 */
import puppeteer from 'puppeteer';

const url       = process.env.MAINT_URL;
const username  = process.env.DEDALO_TEST_USER || '';
const password  = process.env.DEDALO_TEST_PASSWORD || '';
const headless  = process.env.HEADLESS === 'false' ? false : true;
const settleMs  = parseInt(process.env.SETTLE_MS || '4000', 10);

const BACKGROUND = ['system_info', 'update_data_version'];
const LAZY_PROBE = 'make_backup'; // a known lazy widget id present on the dashboard

const log   = (m) => process.stdout.write(m + '\n');
const fail  = (m) => { process.stderr.write('FAIL: ' + m + '\n'); process.exitCode = 1; };
const ok    = (m) => log('ok - ' + m);

if (!url) { process.stderr.write('ERROR: set MAINT_URL\n'); process.exit(2); }

// counts of get_widget_value requests keyed by widget id (source.model)
const counts = {};
const bump = (id) => { counts[id] = (counts[id] || 0) + 1; };
const total = () => Object.values(counts).reduce((a, b) => a + b, 0);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
	const browser = await puppeteer.launch({ headless, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 1280, height: 1400 });
	page.on('dialog', (d) => d.accept().catch(() => {}));

	// network capture: tag every get_widget_value request with its widget id
	page.on('request', (req) => {
		const data = req.postData();
		if (data && data.includes('"action":"get_widget_value"')) {
			let id = 'unknown';
			try { id = JSON.parse(data)?.source?.model || 'unknown'; } catch (e) { /* keep unknown */ }
			bump(id);
		}
	});

	await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

	// login if needed (same approach as test/client/puppeteer_runner.js)
	const needsLogin = await page.evaluate(() => window.page_globals && window.page_globals.is_logged !== true);
	if (needsLogin) {
		if (!username || !password) { fail('login required but no credentials'); await browser.close(); return; }
		await page.waitForSelector('input[name="username"], #username, input[type="text"]', { timeout: 5000 });
		await page.evaluate((u, p) => {
			const ui = document.querySelector('input[name="username"], #username, input[type="text"]');
			const pi = document.querySelector('input[name="password"], #password, input[type="password"]');
			const sb = document.querySelector('input[type="submit"], button[type="submit"], .login_submit, .submit_button');
			if (ui) { ui.value = u; ui.dispatchEvent(new Event('input', { bubbles: true })); }
			if (pi) { pi.value = p; pi.dispatchEvent(new Event('input', { bubbles: true })); }
			if (sb) sb.click();
		}, username, password);
		await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
		await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
	}

	// wait for the dashboard grid and let any background loads settle
	await page.waitForSelector('.maintenance_groups .widget_container', { timeout: 20000 });
	await sleep(settleMs);

	// ASSERTION 1: on cold load only background widgets fetched
	const nonBackground = Object.keys(counts).filter(id => !BACKGROUND.includes(id));
	if (nonBackground.length === 0) ok('cold load: no lazy/static widget fetched');
	else fail('cold load fetched non-background widgets: ' + JSON.stringify(counts));

	for (const id of BACKGROUND) {
		if ((counts[id] || 0) <= 1) ok(`background widget ${id} fetched <=1 on cold load (${counts[id] || 0})`);
		else fail(`background widget ${id} fetched ${counts[id]} times (expected <=1)`);
	}

	// ASSERTION 2: opening a lazy widget triggers exactly one fetch
	const before = counts[LAZY_PROBE] || 0;
	const clicked = await page.evaluate((probeId) => {
		const container = document.getElementById(probeId);
		const label = container && container.querySelector('.widget_label');
		if (label) { label.click(); return true; }
		return false;
	}, LAZY_PROBE);
	if (!clicked) { fail(`probe widget ${LAZY_PROBE} not found on dashboard`); }
	else {
		await sleep(2500);
		const delta = (counts[LAZY_PROBE] || 0) - before;
		if (delta === 1) ok(`opening ${LAZY_PROBE} triggered exactly 1 fetch`);
		else fail(`opening ${LAZY_PROBE} triggered ${delta} fetches (expected 1)`);

		// ASSERTION 3: collapse + re-open does not refetch (cached)
		const beforeReopen = counts[LAZY_PROBE];
		await page.evaluate((probeId) => {
			const label = document.getElementById(probeId).querySelector('.widget_label');
			label.click(); // collapse
			setTimeout(() => label.click(), 200); // re-open
		}, LAZY_PROBE);
		await sleep(2500);
		if ((counts[LAZY_PROBE] || 0) === beforeReopen) ok(`re-opening ${LAZY_PROBE} did not refetch`);
		else fail(`re-opening ${LAZY_PROBE} refetched (now ${counts[LAZY_PROBE]}, was ${beforeReopen})`);
	}

	log(`\nrequest counts: ${JSON.stringify(counts)} (total ${total()})`);
	await browser.close();
}

main().catch(e => { process.stderr.write('ERROR: ' + e.message + '\n'); process.exit(1); });
// @license-end
