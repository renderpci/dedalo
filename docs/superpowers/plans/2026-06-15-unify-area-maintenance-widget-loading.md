# Unify area_maintenance widget data loading — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every area_maintenance widget fetch its server value only when it is opened (expanded), with a named background-status exception (`system_info`, `update_data_version`), eliminating the burst of `get_widget_value` requests fired on dashboard load.

**Architecture:** Centralize the load gate in the host (`render_area_maintenance.js`) and a shared `widget_common.prototype.load()`. The host stops eagerly fetching in `build()`, renders the collapsed shell, and triggers a uniform `load()` on the existing collapse "expose" hook (which also fires for widgets restored as open). Two declared background widgets additionally run `load()` at idle priority while collapsed. Per-widget migration removes each widget's ad-hoc eager fetch and relies on the unified path.

**Tech Stack:** Vanilla ES modules (browser), prototype-based "class" objects, `data_manager` for API, Puppeteer for the executable acceptance test. Server: PHP (`class.area_maintenance.php`). Spec: `docs/superpowers/specs/2026-06-15-unify-area-maintenance-widget-loading-design.md`.

---

## Background facts (verified, read before starting)

- Host: `core/area_maintenance/js/render_area_maintenance.js` → `render_widget()` (lines ~322-434). It creates a `label` (toggler) and a `body` (`widget_body hide`), wires `ui.collapse_toggle_track({ ... default_state:'closed' })` with `collapse`/`expose` callbacks, then `await widget.build(autoload)` (autoload = `item.value ? false : true`) and `await widget.render()`, then `widget_instance = widget`.
- `ui.collapse_toggle_track` (`core/common/js/ui.js:2163`) fires `expose_callback` on init when the persisted state is open, and on every manual open click; fires `collapse_callback` on close.
- `common.prototype.render({render_level:'content'})` (`core/common/js/common.js:560-606`) re-renders content via `self[render_mode]({render_level:'content'})` and replaces `self.node.content_data` in place — so a content repaint needs only `await self.render({render_level:'content'})`.
- `area_maintenance.prototype.get_value()` (`core/area_maintenance/js/area_maintenance.js:214`) is the shared fetch (`dd_area_maintenance_api / get_widget_value`, `use_worker:true`).
- `widget_common.prototype.build` (`core/widgets/widget_common/js/widget_common.js:216`) only fetches when `caller==='component_info'`; for area widgets it is a no-op. The eager fetch lives in each widget's **own** `build()` override calling `self.get_value()`.
- All `render_<name>.js` already support `render_level:'content'` (verified).

### Widget inventory (the work surface)

**A. Eager fetch in custom `build()` — delete the fetch line (identical edit):**
| widget | file:line of `self.value = await self.get_value()` |
|---|---|
| add_hierarchy | `add_hierarchy/js/add_hierarchy.js:67` |
| build_database_version | `build_database_version/js/build_database_version.js:72` |
| check_config | `check_config/js/check_config.js:72` |
| counters_status | `counters_status/js/counters_status.js:74` |
| database_info | `database_info/js/database_info.js:73` |
| dataframe_control | `dataframe_control/js/dataframe_control.js:72` |
| export_hierarchy | `export_hierarchy/js/export_hierarchy.js:72` |
| make_backup | `make_backup/js/make_backup.js:72` |
| media_control | `media_control/js/media_control.js:73` (keep the 3 post-action reloads in `render_media_control.js`) |
| register_tools | `register_tools/js/register_tools.js:72` (keep the `on_done` reload in `render_register_tools.js:171`) |

**B. Eager fetch inside content render — switch to `self.value`:**
| widget | file:line |
|---|---|
| update_code | `update_code/js/render_update_code.js:76` (`const value = await self.get_value() \|\| {}`) |
| update_ontology | `update_ontology/js/render_update_ontology.js:74` (`const value = await self.get_value()`) |

**C. Viewport-triggered heavy load — custom `load()` override + remove `when_in_viewport`:**
| widget | file:line |
|---|---|
| dedalo_api_test_environment | `dedalo_api_test_environment/js/render_dedalo_api_test_environment.js:180` |
| php_info | `php_info/js/render_php_info.js:80` |
| sqo_test_environment | `sqo_test_environment/js/render_sqo_test_environment.js:186` |

**D. Background-status widgets (load at idle while collapsed):**
| widget | change |
|---|---|
| system_info | remove `setTimeout(load_data,1500)` self-fetch in `render_system_info.js` (~line 100-137); render content from `self.value`; declare background |
| update_data_version | remove `self.value = await self.get_value()` in `update_data_version.js:101`; fix missing `event_manager` import; declare background |

**E. Static (inline `item.value`) — no change:** environment, lock_components, move_lang, move_locator, move_tld, move_to_portal, move_to_table, php_user, publication_api, sequences_status, unit_test.

---

## Task 1: Executable acceptance test (Puppeteer, network assertions)

Defines the desired end-state behaviour. It will FAIL until the migration is complete (expected — it is the red bar we drive to green).

**Files:**
- Create: `test/client/maintenance/widget_loading.test.mjs`

- [ ] **Step 1: Write the acceptance test**

Create `test/client/maintenance/widget_loading.test.mjs`:

```js
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
```

- [ ] **Step 2: Run it against the current code to confirm it fails**

Run (set MAINT_URL/credentials for your environment; see `test/client/README.md`):
```
MAINT_URL=... DEDALO_TEST_USER=... DEDALO_TEST_PASSWORD=... node test/client/maintenance/widget_loading.test.mjs
```
Expected: FAIL on Assertion 1 — cold load currently fetches many non-background widgets (the eager `build()` fetches). This confirms the test exercises the right behaviour.

- [ ] **Step 3: Commit**

```bash
git add test/client/maintenance/widget_loading.test.mjs
git commit -m "test(area_maintenance): acceptance test for lazy widget loading

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add the shared `widget_common.prototype.load()`

**Files:**
- Modify: `core/widgets/widget_common/js/widget_common.js` (imports near line 54-56; add method before `// @license-end`)

- [ ] **Step 1: Add `ui` to the imports**

In the imports block (currently lines 54-56) add the `ui` import:

```js
// imports
	import {data_manager} from '../../../common/js/data_manager.js'
	import {common} from '../../../common/js/common.js'
	import {ui} from '../../../common/js/ui.js'
```

- [ ] **Step 2: Add the `load` method**

Insert before the closing `// @license-end` line:

```js
/**
* LOAD
* Unified lazy data loader for maintenance widgets. Fetches the widget value
* exactly once (guarded), then repaints the body content by re-rendering at
* render_level 'content' (common.render swaps node.content_data in place).
*
* The host (render_area_maintenance) calls this on widget "expose" (open) and,
* for declared background widgets, at idle priority while still collapsed.
* Widgets with no get_value (static, server-inlined value) are a no-op.
* Widgets that load something other than a get_value payload (e.g. an iframe or
* JSON editor) override this method.
*
* @return {Promise<boolean>} true when loaded / already loaded / not applicable
*/
widget_common.prototype.load = async function() {

	const self = this

	// guard: fetch only once per instance lifecycle
		if (self._load_state==='loading' || self._load_state==='loaded') {
			return true
		}

	// static widget (value inlined by server): nothing to fetch
		if (typeof self.get_value!=='function') {
			return true
		}

	self._load_state = 'loading'

	// loading feedback inside the current content node
		const content_node = self.node ? self.node.content_data : null
		let spinner = null
		if (content_node) {
			spinner = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'spinner medium',
				parent			: content_node
			})
		}

	try {

		self.value = await self.get_value()
		self._load_state = 'loaded'

		// repaint content (spinner lives in the old content node, replaced here)
		if (self.node) {
			await self.render({ render_level : 'content' })
		}

	} catch (error) {
		self.error = error
		self._load_state = null // allow retry on next open
		if (spinner) {
			spinner.remove()
		}
		console.error('[widget load] ' + self.id + ':', error)
	}


	return true
}//end load
```

- [ ] **Step 3: Syntax check**

Run: `node --check core/widgets/widget_common/js/widget_common.js`
Expected: no output (exit 0).

- [ ] **Step 4: Commit**

```bash
git add core/widgets/widget_common/js/widget_common.js
git commit -m "feat(widgets): add unified widget_common.load() lazy loader

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Host — render shell only, load on expose, background scheduling

**Files:**
- Modify: `core/area_maintenance/js/render_area_maintenance.js` (imports line 8-11; `render_widget` ~322-434)

- [ ] **Step 1: Import `widget_common` (default `load` fallback)**

Add to the imports block (after the existing imports, lines 8-11):

```js
	import {widget_common} from '../../widgets/widget_common/js/widget_common.js'
```

- [ ] **Step 2: Add the background-widget declaration near the top of `render_widget`**

Inside `render_widget` (after the `let widget_instance = null` line, ~332), add:

```js
	// background-status widgets load at idle priority even while collapsed,
	// so admins see status without opening them. Server may also flag via item.background.
	const background_widget_ids = ['system_info', 'update_data_version']
	const is_background = item.background===true || background_widget_ids.includes(item.id)

	// unified load trigger (uses the widget's own load() override if present,
	// else the shared widget_common default)
	const trigger_load = () => {
		if (!widget_instance) {
			return
		}
		const loader = (typeof widget_instance.load==='function')
			? widget_instance.load.bind(widget_instance)
			: widget_common.prototype.load.bind(widget_instance)
		loader()
	}
```

- [ ] **Step 3: Wire `expose` to trigger the load**

Replace the existing `expose` callback (currently ~360-362):

```js
		const expose = () => {
			label.classList.add('up')
		}
```

with:

```js
		const expose = () => {
			label.classList.add('up')
			// unified lazy load: fetch widget data only when opened
			trigger_load()
		}
```

- [ ] **Step 4: Build shell-only (stop the eager autoload)**

Replace the autoload + build block (currently ~402-407):

```js
			// render and append widget node

			const autoload = (item.value)
				? false
				: true

			// build
			await widget.build( autoload )
```

with:

```js
			// build shell only — no eager data fetch.
			// Data loads on open via trigger_load() (see expose / background below).
			await widget.build()
```

- [ ] **Step 5: After `widget_instance = widget`, handle restored-open and background loads**

Immediately after the `widget_instance = widget` line (~422), add:

```js
			// background widgets: low-priority load while still collapsed
			if (is_background) {
				dd_request_idle_callback(() => {
					trigger_load()
				})
			} else if (!body.classList.contains('hide')) {
				// restored-open state: expose_callback may have fired before the
				// instance was ready, so ensure the load runs now.
				trigger_load()
			}
```

(`dd_request_idle_callback` is already imported at line 8.)

- [ ] **Step 6: Syntax check**

Run: `node --check core/area_maintenance/js/render_area_maintenance.js`
Expected: no output (exit 0).

- [ ] **Step 7: Commit**

```bash
git add core/area_maintenance/js/render_area_maintenance.js
git commit -m "feat(area_maintenance): gate widget data load on open + background opt-in

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Server — declare background widgets

**Files:**
- Modify: `core/area_maintenance/class.area_maintenance.php` (the `system_info` and `update_data_version` items in `get_ar_widgets()`)

- [ ] **Step 1: Locate the two items**

Run: `grep -n "id = 'system_info'\|id = 'update_data_version'" core/area_maintenance/class.area_maintenance.php`
Expected: two line numbers.

- [ ] **Step 2: Set `$item->background = true` on each**

For the `system_info` item block, add after its `$item->type = 'widget';` line:

```php
			$item->background = true; // load at idle while collapsed to surface server-issue status
```

For the `update_data_version` item block, add after its `$item->type = 'widget';` line:

```php
			$item->background = true; // load at idle while collapsed to surface available-update status
```

- [ ] **Step 3: Lint check**

Run: `php -l core/area_maintenance/class.area_maintenance.php`
Expected: `No syntax errors detected`.

- [ ] **Step 4: Commit**

```bash
git add core/area_maintenance/class.area_maintenance.php
git commit -m "feat(area_maintenance): flag system_info + update_data_version as background

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Migrate group A — delete eager fetch from each `build()`

The identical edit for 10 widgets: remove the `self.value = await self.get_value()` line from the custom `build()`. Their `render()` already reads `self.value || {}`; the host now loads on open. Keep every `get_value()` call that lives in a `render_*.js` (those are user-action reloads).

**Files (delete the indicated line, leaving the surrounding `try {}`/build intact):**
- `core/area_maintenance/widgets/add_hierarchy/js/add_hierarchy.js:67`
- `core/area_maintenance/widgets/build_database_version/js/build_database_version.js:72`
- `core/area_maintenance/widgets/check_config/js/check_config.js:72`
- `core/area_maintenance/widgets/counters_status/js/counters_status.js:74`
- `core/area_maintenance/widgets/database_info/js/database_info.js:73`
- `core/area_maintenance/widgets/dataframe_control/js/dataframe_control.js:72`
- `core/area_maintenance/widgets/export_hierarchy/js/export_hierarchy.js:72`
- `core/area_maintenance/widgets/make_backup/js/make_backup.js:72`
- `core/area_maintenance/widgets/media_control/js/media_control.js:73`
- `core/area_maintenance/widgets/register_tools/js/register_tools.js:72`

- [ ] **Step 1: For each file, remove the eager fetch**

In each `build()` the block looks like:

```js
	try {

		// specific actions.. like fix main_element for convenience
		self.value = await self.get_value()

	} catch (error) {
```

Delete the `self.value = await self.get_value()` line (and its preceding comment if it only describes that line). The `try/catch` stays (harmless) — or, if the `try` body becomes empty, leave a comment:

```js
	try {

		// data now loads on open via the unified widget load() (see render_area_maintenance)

	} catch (error) {
```

Do NOT touch any `get_value()` inside `render_media_control.js` (lines 98/320/408 — refresh button + post-action reloads) or `render_register_tools.js:171` (`on_done` reload).

- [ ] **Step 2: Verify no eager build-fetch remains in group A**

Run:
```
grep -rn "self.value = await self.get_value()" core/area_maintenance/widgets/*/js/*.js | grep -vE "render_(media_control|register_tools)\.js"
```
Expected: only `update_data_version/js/update_data_version.js` remains (migrated in Task 8). No `add_hierarchy.js`, `make_backup.js`, etc.

- [ ] **Step 3: Syntax-check the edited files**

Run:
```
for f in add_hierarchy build_database_version check_config counters_status database_info dataframe_control export_hierarchy make_backup media_control register_tools; do node --check core/area_maintenance/widgets/$f/js/$f.js || echo "FAIL $f"; done
```
Expected: no `FAIL` lines.

- [ ] **Step 4: Commit**

```bash
git add core/area_maintenance/widgets/*/js/*.js
git commit -m "refactor(area_maintenance): drop eager build fetch from lazy widgets

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Migrate group B — render-time fetch → use `self.value`

**Files:**
- Modify: `core/area_maintenance/widgets/update_code/js/render_update_code.js:76`
- Modify: `core/area_maintenance/widgets/update_ontology/js/render_update_ontology.js:74`

- [ ] **Step 1: update_code**

Replace line 76:

```js
		const value = await self.get_value() || {}
```

with:

```js
		const value = self.value || {}
```

- [ ] **Step 2: update_ontology**

Replace line 74:

```js
		const value = await self.get_value()
```

with:

```js
		const value = self.value || {}
```

(If later code assumes a populated `value`, the empty-shell render is hidden while collapsed and is repainted by `load()` on open. Confirm the function still parses; do not add other logic.)

- [ ] **Step 3: Syntax check**

Run:
```
node --check core/area_maintenance/widgets/update_code/js/render_update_code.js
node --check core/area_maintenance/widgets/update_ontology/js/render_update_ontology.js
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add core/area_maintenance/widgets/update_code/js/render_update_code.js core/area_maintenance/widgets/update_ontology/js/render_update_ontology.js
git commit -m "refactor(area_maintenance): render update_code/update_ontology from self.value

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Migrate group C — viewport widgets to load-on-open

These widgets load a heavy iframe/JSON-editor via `when_in_viewport`. Replace that with a custom `load()` override so the host triggers it on open. Each follows the same recipe.

### 7a: php_info

**Files:**
- Modify: `core/area_maintenance/widgets/php_info/js/render_php_info.js` (~line 80, the `when_in_viewport(content_data, () => { ... })` block)
- Modify: `core/area_maintenance/widgets/php_info/js/php_info.js` (prototype assignments + add `load`)

- [ ] **Step 1: Read both files**

Run: `sed -n '60,110p' core/area_maintenance/widgets/php_info/js/render_php_info.js` and read `php_info/js/php_info.js` fully. Identify the work done inside the `when_in_viewport` callback (setting the iframe `src`).

- [ ] **Step 2: Make the heavy-load logic callable from the instance**

In `render_php_info.js`, refactor so the work currently inside the `when_in_viewport(content_data, cb)` callback is performed by a function stored on the instance, e.g. set `self.activate = () => { <iframe src assignment> }`, and STOP calling `when_in_viewport`. Leave the iframe element created but with its `src` unset until activated. Example shape (adapt to the actual iframe variable name in the file):

```js
	// defer the heavy iframe load until the widget is opened (host calls load())
	self.activate = () => {
		if (self._activated) { return }
		self._activated = true
		iframe.src = iframe_src // the URL previously assigned inside when_in_viewport
	}
	// (removed: when_in_viewport(content_data, ...) — load now happens on open)
```

Remove the now-unused `when_in_viewport` import if nothing else uses it (check the file).

- [ ] **Step 3: Add a `load()` override on the widget**

In `php_info/js/php_info.js`, add to the prototype assignments:

```js
	php_info.prototype.load = async function() {
		if (typeof this.activate==='function') {
			this.activate()
		}
		return true
	}
```

- [ ] **Step 4: Repeat the same recipe for dedalo_api_test_environment**

- Modify `dedalo_api_test_environment/js/render_dedalo_api_test_environment.js:180`: move the JSON-editor build out of `when_in_viewport(json_editor_api_container, load_editor)` into `self.activate = load_editor` (guarded by `self._activated`); remove the `when_in_viewport` call (and its import if unused).
- Add `dedalo_api_test_environment.prototype.load` (same shape as Step 3) in `dedalo_api_test_environment/js/dedalo_api_test_environment.js`.

- [ ] **Step 5: Repeat for sqo_test_environment**

- Modify `sqo_test_environment/js/render_sqo_test_environment.js:186`: same move out of `when_in_viewport(json_editor_api_container, load_editor)` → `self.activate`; remove the call/import if unused.
- Add `sqo_test_environment.prototype.load` in `sqo_test_environment/js/sqo_test_environment.js`.

- [ ] **Step 6: Verify no `when_in_viewport` calls remain in these three render files**

Run:
```
grep -rn "when_in_viewport(" core/area_maintenance/widgets/php_info/js core/area_maintenance/widgets/dedalo_api_test_environment/js core/area_maintenance/widgets/sqo_test_environment/js
```
Expected: no output.

- [ ] **Step 7: Syntax check**

Run:
```
for w in php_info dedalo_api_test_environment sqo_test_environment; do
  node --check core/area_maintenance/widgets/$w/js/$w.js || echo "FAIL $w"
  node --check core/area_maintenance/widgets/$w/js/render_$w.js || echo "FAIL render_$w"
done
```
Expected: no `FAIL` lines.

- [ ] **Step 8: Commit**

```bash
git add core/area_maintenance/widgets/php_info core/area_maintenance/widgets/dedalo_api_test_environment core/area_maintenance/widgets/sqo_test_environment
git commit -m "refactor(area_maintenance): load viewport widgets on open via load() override

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Migrate group D — background widgets

### 8a: update_data_version

**Files:**
- Modify: `core/area_maintenance/widgets/update_data_version/js/update_data_version.js`

- [ ] **Step 1: Fix the missing `event_manager` import**

The file uses `event_manager.subscribe(...)` in `init()` (line ~76) but does not import it. Add to the imports block (lines 7-10):

```js
	import {event_manager} from '../../../../common/js/event_manager.js'
```

(Confirm the relative depth matches the other imports in this file — they use `../../../../`.)

- [ ] **Step 2: Remove the eager fetch in `build()`**

In `build()` (lines ~90-111) delete:

```js
			if (autoload) {
				// specific actions.. like fix main_element for convenience
				self.value = await self.get_value()
			}
```

leaving the `try {}` with a comment:

```js
		try {

			// data loads at idle via the unified background load (see render_area_maintenance)

		} catch (error) {
```

(`update_data_version` is already declared background in Task 4 / host list, so the host schedules its load.)

- [ ] **Step 3: Syntax check**

Run: `node --check core/area_maintenance/widgets/update_data_version/js/update_data_version.js`
Expected: clean.

### 8b: system_info

**Files:**
- Modify: `core/area_maintenance/widgets/system_info/js/render_system_info.js` (`render_content_data`, ~lines 69-150)

- [ ] **Step 4: Read `render_system_info.js` `render_content_data`**

Run: `sed -n '69,150p' core/area_maintenance/widgets/system_info/js/render_system_info.js`

- [ ] **Step 5: Render content from `self.value` instead of self-fetching**

Currently `render_content_data` builds a `datalist_container` showing "Collecting system info…", then defines `load_data` which calls `self.get_value().then(...)` and is fired by `setTimeout(load_data, 1500)` (~line 137). Replace that self-fetch with value-driven rendering:

- Remove the `load_data` function, the `load_status` bookkeeping, and the `setTimeout(load_data, 1500)` call.
- After creating `datalist_container`, render directly from the already-loaded value:

```js
		// datalist_container
			const datalist_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'datalist_container',
				inner_html		: 'Collecting system info. Please wait..',
				parent			: content_data
			})

			// render from value when loaded (host triggers the background/open load,
			// which fetches self.value then re-renders content)
			if (self.value) {
				render_datalist(self, datalist_container)
			}
```

`render_datalist` already clears the container before appending, so the placeholder text is replaced when value is present. The health-check pings inside `render_health_list` therefore only fire once the value is loaded (background or on open), not on the empty collapsed shell.

- [ ] **Step 6: Confirm the self-fetch is gone**

Run: `grep -n "setTimeout\|get_value\|load_status" core/area_maintenance/widgets/system_info/js/render_system_info.js`
Expected: no `setTimeout(load_data`, no `self.get_value()` call, no `load_status`.

- [ ] **Step 7: Syntax check**

Run:
```
node --check core/area_maintenance/widgets/system_info/js/render_system_info.js
node --check core/area_maintenance/widgets/system_info/js/system_info.js
```
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add core/area_maintenance/widgets/update_data_version core/area_maintenance/widgets/system_info
git commit -m "refactor(area_maintenance): background widgets load via unified path

- update_data_version: drop eager build fetch, fix event_manager import
- system_info: render from self.value, remove 1.5s self-fetch

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Full verification

- [ ] **Step 1: Whole-tree JS syntax check of touched modules**

Run:
```
find core/area_maintenance/widgets -name '*.js' -print0 | xargs -0 -n1 node --check && \
node --check core/area_maintenance/js/render_area_maintenance.js && \
node --check core/widgets/widget_common/js/widget_common.js && \
echo ALL_OK
```
Expected: `ALL_OK`.

- [ ] **Step 2: PHP lint + server API tests still pass (contract unchanged)**

Run:
```
php -l core/area_maintenance/class.area_maintenance.php
./vendor/bin/phpunit test/server/api/dd_area_maintenance_api_Test.php
```
Expected: `No syntax errors detected`; PHPUnit OK. (If the project uses a different PHPUnit entrypoint, use the repo's standard test command.)

- [ ] **Step 3: Run the acceptance test — now green**

Run (serve the app via NGINX per `test/client/README.md`, then):
```
MAINT_URL=... DEDALO_TEST_USER=... DEDALO_TEST_PASSWORD=... node test/client/maintenance/widget_loading.test.mjs
```
Expected: all `ok -` lines, no `FAIL`:
- cold load: no lazy/static widget fetched
- background `system_info` / `update_data_version` fetched ≤1
- opening `make_backup` → exactly 1 fetch
- re-opening `make_backup` → no refetch

- [ ] **Step 4: Manual smoke (browser DevTools, Network filtered to `get_widget_value`)**

Confirm by eye:
1. Cold dashboard load: zero `get_widget_value` except the two background widgets.
2. Open several lazy widgets (check_config, update_ontology, php_info, dedalo_api_test_environment): each loads its content on open; one request each (php_info/api-test load their iframe/editor on open, not before).
3. Static widgets (move_*, environment) render instantly, never request.
4. Reload with one widget left open → it auto-loads; others stay silent.
5. `media_control` / `register_tools` Refresh / submit actions still reload as before.

- [ ] **Step 5: Final commit (if any smoke fixes were needed)**

```bash
git add -A
git commit -m "fix(area_maintenance): verification fixes for unified widget loading

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes (coverage map)

- Spec "static / lazy / background modes" → Tasks 3 (resolution + host), 4 (background flag), 5/6/7 (lazy), 8 (background); static widgets untouched (Group E).
- Spec "load on open incl. restored-open" → Task 3 Step 3 (expose) + Step 5 (restored-open guard).
- Spec "background full value cached, reused on open" → Task 2 guard (`_load_state`) + Task 3 Step 5 (idle schedule).
- Spec "register_tools on-submit unchanged" → Task 5 keeps `render_register_tools.js:171`; only its eager build fetch is removed (this is the refined reading: the on-submit action is unchanged, but the eager *display* fetch must obey the main rule).
- Spec "uniform repaint via render_level:'content'" → Task 2 uses `self.render({render_level:'content'})`.
- Spec "update_data_version event_manager latent bug" → Task 8a Step 1.
- Method/property names used consistently: `load()`, `_load_state` ('loading'|'loaded'|null), `trigger_load()`, `is_background`, `activate`/`_activated` (viewport widgets), `item.background`.
```
