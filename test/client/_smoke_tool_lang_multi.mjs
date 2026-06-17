// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/**
 * SMOKE TEST — tool_lang_multi
 *
 * No dedicated Mocha suite exists for this tool, so this loads the app test
 * page (real module environment, NGINX :7070) and dynamically imports the
 * actual tool module to verify:
 *   - all static imports resolve (module loads with no error)
 *   - the prototype wiring is intact (methods present)
 *   - the changed pure logic behaves: is_component_empty (multi-value) and
 *     resolve_engine (engine type / device / optional-chaining safety)
 *
 * Usage:  node test/client/_smoke_tool_lang_multi.mjs   (HEADLESS=false to watch)
 */
import puppeteer from 'puppeteer';

const BASE     = process.env.SA_BASE_URL || 'http://localhost:7070/v7/test/client/';
const exePath  = process.env.PUPPETEER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const headless = process.env.HEADLESS === 'false' ? false : true;

const log   = (m) => process.stdout.write(m + '\n');
const error = (m) => process.stderr.write('ERROR: ' + m + '\n');

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
		page.on('pageerror', (err) => error('pageerror: ' + err.message));
		page.on('console', (m) => { if (m.type() === 'error') error('console: ' + m.text()); });

		log(`Navigating to ${BASE}index.html ...`);
		await page.goto(BASE + 'index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });

		const modUrl = new URL('../../tools/tool_lang_multi/js/tool_lang_multi.js', BASE).href;
		log(`Importing module ${modUrl} ...`);

		const result = await page.evaluate(async (modUrl) => {
			const out = { ok: true, checks: [], error: null };
			const assert = (name, cond) => out.checks.push({ name, pass: !!cond });
			try {
				const mod = await import(modUrl);
				const { tool_lang_multi } = mod;
				assert('module exports tool_lang_multi', typeof tool_lang_multi === 'function');

				const p = tool_lang_multi.prototype;
				['init','build','get_component','automatic_translation','set_source_lang',
				 'translate_target','automatic_translation_all','resolve_engine',
				 'run_browser_translation','destroy'].forEach(m =>
					assert('method ' + m, typeof p[m] === 'function'));

				// is_component_empty (exported from render module)
				const render = await import(new URL('./render_tool_lang_multi.js', modUrl).href);
				const ice = render.is_component_empty;
				assert('is_component_empty exported', typeof ice === 'function');
				assert('empty: no data', ice({}) === true);
				assert('empty: []', ice({ data: { value: [] } }) === true);
				assert('empty: whitespace only', ice({ data: { value: ['   '] } }) === true);
				assert('non-empty: string', ice({ data: { value: ['hello'] } }) === false);
				assert('non-empty: object value', ice({ data: { value: [{ value: 'x' }] } }) === false);
				// the #8 fix: text only in a later element must count as NON-empty
				assert('multi-value: text at index 1', ice({ data: { value: ['', 'later'] } }) === false);
				assert('multi-value: object text at index 1', ice({ data: { value: [{ value: '' }, { value: 'y' }] } }) === false);

				// resolve_engine — build a fake self and exercise the branches
				const engines = [
					{ name: 'babel',   type: 'server',  label: 'Babel' },
					{ name: 'browser', type: 'browser', label: 'On device' }
				];
				const make_self = (sel, checked) => ({
					context: { config: { translator_engine: { value: engines } } },
					translator_engine_select: sel ? { value: sel } : null,
					translator_device_checkbox: { checked }
				});
				const re = p.resolve_engine;
				let r = re.call(make_self('browser', false));
				assert('resolve browser is_browser', r.is_browser === true);
				assert('resolve browser device webgpu', r.device === 'webgpu');
				r = re.call(make_self('browser', true));
				assert('resolve browser device wasm (checkbox)', r.device === 'wasm');
				r = re.call(make_self('babel', false));
				assert('resolve server is_browser false', r.is_browser === false);
				assert('resolve server name', r.translator_name === 'babel');
				// optional-chaining safety: no config at all must not throw
				r = re.call({ translator_engine_select: null, translator_device_checkbox: null });
				assert('resolve no-config no-throw', r.is_browser === false && r.engine === undefined);

				out.ok = out.checks.every(c => c.pass);
			} catch (e) {
				out.ok = false;
				out.error = (e && e.message) || String(e);
			}
			return out;
		}, modUrl);

		if (result.error) error('import/eval error: ' + result.error);
		for (const c of result.checks) log(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name}`);
		log(`\nRESULT: ${result.ok ? 'pass' : 'fail'} (${result.checks.filter(c=>c.pass).length}/${result.checks.length})`);
		exitCode = result.ok ? 0 : 1;
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
