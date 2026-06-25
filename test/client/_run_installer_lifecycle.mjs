// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/**
 * FOCUSED RUNNER — installer element lifecycle (no login required)
 *
 * Reproduces the "installer" element case of test_others_lifecycle.js headlessly:
 * get_instance({model:'installer', tipo:'dd1590'}) → init → build(autoload) →
 * render → destroy. build() uses get_install_context, which is a no-login API
 * action, so this verifies the core/install → core/installer rename end-to-end
 * without credentials. Fails loudly on any console/page error mentioning install.
 *
 * Usage: node test/client/_run_installer_lifecycle.mjs
 * Env: SA_BASE_URL (default NGINX :7070/v7/), PUPPETEER_EXECUTABLE_PATH, HEADLESS
 */
import puppeteer from 'puppeteer';

const BASE     = process.env.SA_BASE_URL || 'http://localhost:7070/v7/test/client/';
const CORE     = new URL('../../core/', BASE).href; // .../v7/core/
const exePath  = process.env.PUPPETEER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const headless = process.env.HEADLESS === 'false' ? false : true;

const log   = (m) => process.stdout.write(m + '\n');
const error = (m) => process.stderr.write('ERROR: ' + m + '\n');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
	let browser, exitCode = 1;
	const console_errors = [];
	try {
		browser = await puppeteer.launch({
			headless, executablePath: exePath, protocolTimeout: 600000,
			args: ['--no-sandbox', '--disable-setuid-sandbox']
		});
		const page = await browser.newPage();
		page.on('dialog', (d) => d.accept().catch(() => {}));
		page.on('pageerror', (err) => { if (err.message !== 'Login is required') console_errors.push('pageerror: ' + err.message); });
		page.on('console', (msg) => { if (msg.type() === 'error') console_errors.push('console.error: ' + msg.text()); });
		page.on('requestfailed', (req) => console_errors.push('requestfailed: ' + req.url() + ' (' + (req.failure()?.errorText) + ')'));

		// 1) bootstrap the app env via index.html (sets page_globals + DEDALO_API_URL,
		//    runs get_environment). It throws "Login is required" after env is set — ignored.
		log(`Bootstrapping env at ${BASE}index.html ...`);
		await page.goto(BASE + 'index.html', { waitUntil: 'networkidle0', timeout: 30000 });
		// wait until set_environment() has run (is_logged key present on page_globals)
		const start = Date.now();
		while (Date.now() - start < 15000) {
			const ready = await page.evaluate(() => !!window.page_globals && ('is_logged' in window.page_globals));
			if (ready) break;
			await sleep(200);
		}
		const env = await page.evaluate(() => ({ is_logged: window.page_globals?.is_logged, api: window.DEDALO_API_URL }));
		log(`env ready (is_logged=${env.is_logged}, DEDALO_API_URL=${env.api})`);

		// 2) drive the installer element lifecycle (mirrors test_others_lifecycle.js)
		log('Running installer lifecycle (init → build → render → destroy) ...');
		const res = await page.evaluate(async (CORE) => {
			const out = { steps: {}, error: null };
			try {
				const { get_instance, get_all_instances } = await import(CORE + 'common/js/instances.js');
				const inst = await get_instance({
					id_variant   : Math.random() + '-' + Math.random(),
					lang         : 'lg-eng',
					mode         : 'edit',
					model        : 'installer',
					tipo         : 'dd1590',
					context      : null
				});
				if (!inst) { out.error = 'get_instance returned null (module load / export name mismatch)'; return out; }
				out.steps.model   = inst.model;
				out.steps.type    = inst.type;
				out.steps.init    = inst.status;          // expect 'initialized'
				await inst.build(true);
				out.steps.build   = inst.status;          // expect 'built'
				await inst.render();
				out.steps.render  = inst.status;          // expect 'rendered'
				out.steps.node_tag = inst.node ? inst.node.tagName : null;
				await inst.destroy(true, true, true);
				out.steps.destroy = inst.status;          // expect 'destroyed'
				out.steps.instances_after = get_all_instances().length;
			} catch (e) {
				out.error = (e && e.message) ? e.message : String(e);
			}
			return out;
		}, CORE);

		log('\n----- installer lifecycle -----');
		log(JSON.stringify(res, null, 2));
		log('-------------------------------');

		const install_errors = console_errors.filter(e => /install/i.test(e));
		if (console_errors.length) {
			log('\nconsole/page/request errors observed:');
			console_errors.forEach(e => log('  - ' + e));
		}

		const ok =
			!res.error &&
			res.steps.model === 'installer' &&
			res.steps.init === 'initialized' &&
			res.steps.build === 'built' &&
			res.steps.render === 'rendered' &&
			res.steps.destroy === 'destroyed' &&
			install_errors.length === 0;

		log(`\nRESULT: ${ok ? 'PASS' : 'FAIL'}  (install-related errors: ${install_errors.length})`);
		exitCode = ok ? 0 : 1;
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
