# Diffusion engine auto-start + defensive advisory — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Bun diffusion engine auto-start at boot / restart on crash, and replace the cryptic "HTTP 404" the tool throws when the engine is down with a calm, role-tailored advisory that auto-recovers for admins.

**Architecture:** Two parts. (A) Committed launchd + systemd units plus a `service-ctl.sh` adapter so one supervisor owns the process and both the maintenance widget and the tool drive it the same way. (B) A new server-side `dd_diffusion_api::get_engine_advisory` action that probes Bun **socket-first** via `diffusion_api_client` (works even when the nginx proxy is the broken link), auto-recovers for global-admins through the existing `diffusion_server_control::start_server`, and returns an advisory object the tool renders as a banner — gating the tool body so no browser 404/​toast ever fires.

**Tech Stack:** PHP 8.5 (PHPUnit via `vendor/bin/phpunit`), Bun/TypeScript (engine, unchanged), vanilla JS ES modules (tool UI), launchd/systemd/bash (service units).

## Global Constraints

- PHP files: `declare(strict_types=1)`; tabs for indentation; match `class.dd_diffusion_api.php` style.
- SEC-024: every remotely-callable action MUST be listed in `dd_diffusion_api::API_ACTIONS`. Internal helpers stay public-static but OUT of that list (the dd_manager dispatcher refuses to call any method not in the allowlist, so public ≠ remotely callable).
- Shell/service control is global-admin only and runs ONLY the validated keyword through the existing `diffusion_server_control` (no request-derived data reaches the shell). Do not write new `exec()` calls.
- JS files start with the `// @license magnet:?xt=...AGPL-3.0` header line, then `/*global ...*/` and `/*eslint no-undef: "error"*/`.
- `config/config.php` is per-install (git-ignored): never commit it. Committed config changes go to `config/sample.config.php`.
- Phpunit run command (from repo root): `vendor/bin/phpunit -c test/server/phpunit.xml --filter <name>`.
- Commit messages end with the repo's `Co-Authored-By:` trailer used by recent commits.

---

### Task 1: Committed cross-platform service units

**Files:**
- Create: `diffusion/service/com.dedalo.diffusion.plist`
- Create: `diffusion/service/dedalo-diffusion.service`
- Create: `diffusion/service/service-ctl.sh`
- Create: `diffusion/service/README.md`

**Interfaces:**
- Produces: `service-ctl.sh {start|stop|restart|status}` — the command `DEDALO_DIFFUSION_SERVICE_CMD` and the tool's auto-recover invoke. Honors env `DEDALO_DIFFUSION_LABEL` (default `com.dedalo.diffusion`).

- [ ] **Step 1: Write `diffusion/service/service-ctl.sh`**

```bash
#!/usr/bin/env bash
# service-ctl.sh — drive the OS-managed Dedalo diffusion service.
# Maps start|stop|restart|status to launchctl (macOS) or systemctl (Linux) so the
# maintenance widget AND the tool auto-recover control the SAME supervised process
# (no double-spawn / socket fight). Configure in config.php:
#   define('DEDALO_DIFFUSION_SERVICE_CMD', '/abs/path/diffusion/service/service-ctl.sh %action%');
set -u

LABEL="${DEDALO_DIFFUSION_LABEL:-com.dedalo.diffusion}"
ACTION="${1:-}"

is_macos() { [ "$(uname -s)" = "Darwin" ]; }
mac_target() { echo "gui/$(id -u)/${LABEL}"; }

do_macos() {
	local plist="$HOME/Library/LaunchAgents/${LABEL}.plist"
	case "$1" in
		start)   launchctl kickstart "$(mac_target)" 2>/dev/null || launchctl bootstrap "gui/$(id -u)" "$plist" ;;
		stop)    launchctl kill TERM "$(mac_target)" ;;
		restart) launchctl kickstart -k "$(mac_target)" ;;
		status)  launchctl print "$(mac_target)" >/dev/null 2>&1 ;;
	esac
}

do_systemd() {
	local sc="${DEDALO_DIFFUSION_SYSTEMCTL:-systemctl --user}"
	case "$1" in
		start)   $sc start   "${LABEL}.service" ;;
		stop)    $sc stop    "${LABEL}.service" ;;
		restart) $sc restart "${LABEL}.service" ;;
		status)  $sc is-active --quiet "${LABEL}.service" ;;
	esac
}

case "$ACTION" in
	start|stop|restart|status)
		if is_macos; then do_macos "$ACTION"; else do_systemd "$ACTION"; fi ;;
	*)
		echo "usage: $0 {start|stop|restart|status}" >&2
		exit 2 ;;
esac
```

- [ ] **Step 2: Write `diffusion/service/com.dedalo.diffusion.plist`** (launchd template; `__PLACEHOLDERS__` filled at install)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>com.dedalo.diffusion</string>
	<key>ProgramArguments</key>
	<array>
		<string>__BUN_BIN__</string>
		<string>run</string>
		<string>index.ts</string>
	</array>
	<key>WorkingDirectory</key>
	<string>__APP_DIR__</string>
	<key>EnvironmentVariables</key>
	<dict>
		<key>SOCKET_PATH</key>
		<string>__SOCKET_PATH__</string>
	</dict>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>StandardOutPath</key>
	<string>__LOG_FILE__</string>
	<key>StandardErrorPath</key>
	<string>__LOG_FILE__</string>
</dict>
</plist>
```

- [ ] **Step 3: Write `diffusion/service/dedalo-diffusion.service`** (systemd template)

```ini
[Unit]
Description=Dedalo diffusion engine (Bun)
After=network.target

[Service]
Type=simple
WorkingDirectory=__APP_DIR__
Environment=SOCKET_PATH=__SOCKET_PATH__
ExecStart=__BUN_BIN__ run index.ts
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 4: Write `diffusion/service/README.md`** — install steps for both platforms

````markdown
# Diffusion engine service units

Supervise the Bun diffusion engine so it starts at boot and restarts on crash.
Pick ONE supervisor; both the maintenance widget and the tool's auto-recover then
drive it through `service-ctl.sh`.

## Placeholders (fill in all unit files)
- `__BUN_BIN__`      absolute path to `bun` (e.g. `~/.bun/bin/bun`, `which bun`)
- `__APP_DIR__`      absolute path to `<dedalo>/diffusion/api/v1`
- `__SOCKET_PATH__`  unix socket (default `/tmp/diffusion.sock`)
- `__LOG_FILE__`     macOS only, e.g. `/tmp/dedalo-diffusion.log`

## macOS (launchd)
1. Fill placeholders in `com.dedalo.diffusion.plist`.
2. `cp com.dedalo.diffusion.plist ~/Library/LaunchAgents/`
3. `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.dedalo.diffusion.plist`
4. Verify: `ls -l /tmp/diffusion.sock` (appears within ~1s).

## Linux (systemd, user scope)
1. Fill placeholders in `dedalo-diffusion.service`.
2. `cp dedalo-diffusion.service ~/.config/systemd/user/`
3. `systemctl --user daemon-reload && systemctl --user enable --now dedalo-diffusion`

## Wire it to Dedalo
In `config.php`:
```php
define('DEDALO_DIFFUSION_SERVICE_CMD', __DIR__ . '/../diffusion/service/service-ctl.sh %action%');
```
Then `service-ctl.sh {start|stop|restart|status}` controls the supervised process.
Do NOT also use `dedalo-diffusion.sh` once a supervisor owns the process — it spawns
a second, unsupervised copy that fights for the socket.
````

- [ ] **Step 5: Make the script executable and lint it**

Run:
```bash
chmod +x diffusion/service/service-ctl.sh
bash -n diffusion/service/service-ctl.sh && echo "syntax ok"
plutil -lint diffusion/service/com.dedalo.diffusion.plist
diffusion/service/service-ctl.sh bogus; echo "exit=$?"
```
Expected: `syntax ok`; `... OK` from plutil; usage line on stderr and `exit=2`.

- [ ] **Step 6: Commit**

```bash
git add diffusion/service/
git commit -m "feat(diffusion): committed launchd/systemd service units + service-ctl adapter

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Activate launchd on the dev box + document the service-cmd option

**Files:**
- Create (LOCAL, not committed): `~/Library/LaunchAgents/com.dedalo.diffusion.plist`
- Modify (LOCAL, not committed): `config/config.php` — repoint `DEDALO_DIFFUSION_SERVICE_CMD`
- Modify (committed): `config/sample.config.php` — document the `service-ctl.sh` option

**Interfaces:**
- Consumes: `service-ctl.sh` (Task 1).
- Produces: a supervised engine on this box; `DEDALO_DIFFUSION_SERVICE_CMD` pointing at `service-ctl.sh`.

- [ ] **Step 1: Stop the manual nohup instance left from diagnosis**

Run:
```bash
/Users/paco/Trabajos/Dedalo/v7/master_dedalo/diffusion/dedalo-diffusion.sh stop
ls /tmp/diffusion.sock 2>/dev/null && echo "socket still present" || echo "socket gone"
```
Expected: "diffusion stopped"; socket gone.

- [ ] **Step 2: Install the filled launchd plist**

Run (paths for THIS box: bun at `~/.bun/bin/bun`, app at the repo):
```bash
sed -e "s#__BUN_BIN__#$HOME/.bun/bin/bun#" \
    -e "s#__APP_DIR__#/Users/paco/Trabajos/Dedalo/v7/master_dedalo/diffusion/api/v1#" \
    -e "s#__SOCKET_PATH__#/tmp/diffusion.sock#" \
    -e "s#__LOG_FILE__#/tmp/dedalo-diffusion.log#" \
    /Users/paco/Trabajos/Dedalo/v7/master_dedalo/diffusion/service/com.dedalo.diffusion.plist \
    > "$HOME/Library/LaunchAgents/com.dedalo.diffusion.plist"
plutil -lint "$HOME/Library/LaunchAgents/com.dedalo.diffusion.plist"
```
Expected: `... OK`.

- [ ] **Step 3: Bootstrap and verify it runs**

Run:
```bash
launchctl bootstrap gui/$(id -u) "$HOME/Library/LaunchAgents/com.dedalo.diffusion.plist" 2>/dev/null
sleep 2
ls -l /tmp/diffusion.sock && echo "engine up"
```
Expected: socket present, "engine up". (If already bootstrapped: `launchctl kickstart -k gui/$(id -u)/com.dedalo.diffusion`.)

- [ ] **Step 4: Verify crash-restart (KeepAlive)**

Run:
```bash
pid=$(pgrep -f "bun.*index.ts"); echo "killing $pid"; kill -9 "$pid"; sleep 3
ls -l /tmp/diffusion.sock && pgrep -f "bun.*index.ts" >/dev/null && echo "restarted by launchd"
```
Expected: a NEW bun pid and the socket back → "restarted by launchd".

- [ ] **Step 5: Repoint the local service command + document in sample**

In `config/config.php` replace the `DEDALO_DIFFUSION_SERVICE_CMD` define with:
```php
		define('DEDALO_DIFFUSION_SERVICE_CMD', DEDALO_ROOT_PATH . '/diffusion/service/service-ctl.sh %action%');
```
In `config/sample.config.php`, update the `DEDALO_DIFFUSION_SERVICE_CMD` block to read:
```php
		// Supervisor command used by the 'diffusion_server_control' maintenance widget
		// and by tool_diffusion's auto-recover to start/stop/restart the Bun engine.
		// '%action%' is replaced by a validated start|stop|restart keyword.
		// With a real supervisor (launchd/systemd) use the adapter (see diffusion/service/README.md):
		//   define('DEDALO_DIFFUSION_SERVICE_CMD', DEDALO_ROOT_PATH . '/diffusion/service/service-ctl.sh %action%');
		// Empty = lifecycle controls disabled.
		define('DEDALO_DIFFUSION_SERVICE_CMD', '');
```

- [ ] **Step 6: Confirm the engine is reachable through nginx now**

Run:
```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST "http://localhost:7070/v7/diffusion/api/v1/" \
  -H "Content-Type: application/json" -d '{"action":"get_diffusion_status"}'
```
Expected: `HTTP 401` (reaches Bun; 401 only because curl has no session cookie) — NOT 404.

- [ ] **Step 7: Commit the committed file only**

```bash
git add config/sample.config.php
git commit -m "docs(config): document service-ctl.sh adapter for DEDALO_DIFFUSION_SERVICE_CMD

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: PHP `dd_diffusion_api::get_engine_advisory` (TDD)

**Files:**
- Modify: `core/api/v1/common/class.dd_diffusion_api.php` (add to `API_ACTIONS`; add 1 action + 4 helpers; add 2 tunables)
- Test: `test/server/api/dd_diffusion_api_Test.php` (add test methods)

**Interfaces:**
- Consumes: `diffusion_api_client::call(object $body, int $timeout): object` (socket-first; `result===false` + connection errors when unreachable; `data->checks` present when the engine answered); `diffusion_server_control::start_server(object $options): object` (admin-gated; `->result` bool); `security::is_global_admin(?int $user_id): bool`.
- Produces: `dd_diffusion_api::get_engine_advisory(object $rqo): object` returning
  `{ result:true, state:'ok'|'unhealthy'|'unreachable', is_admin:bool, recovered:bool, title:string, cause:string, steps:string[], actions:string[], checks:object|null, service_cmd_configured:bool, log_tail:string|null }`.
  Helpers (public-static, NOT in API_ACTIONS): `probe_engine()`, `build_engine_advisory(object $probe, bool $is_admin, bool $recovered, bool $service_cmd_configured)`, `first_failing_check($checks)`, `read_engine_log_tail()`. Tunables: `public static int $recover_poll_attempts = 5; public static int $recover_poll_interval_us = 500000;`.

- [ ] **Step 1: Write failing tests for the pure advisory builder**

Add to `test/server/api/dd_diffusion_api_Test.php`:
```php
	public function test_build_advisory_ok(): void {
		$probe = (object)['state'=>'ok','checks'=>(object)[],'msg'=>''];
		$adv = dd_diffusion_api::build_engine_advisory($probe, true, false, true);
		$this->assertSame('ok', $adv->state);
		$this->assertSame(['retry'], $adv->actions);
		$this->assertNull($adv->log_tail);
	}

	public function test_build_advisory_user_is_calm_and_nontechnical(): void {
		$probe = (object)['state'=>'unreachable','checks'=>null,'msg'=>'boom'];
		$adv = dd_diffusion_api::build_engine_advisory($probe, false, false, true);
		$this->assertSame('unreachable', $adv->state);
		$this->assertFalse($adv->is_admin);
		$this->assertSame(['retry'], $adv->actions);   // never offers shell actions
		$this->assertNull($adv->checks);               // no internals leaked
		$this->assertNull($adv->log_tail);
		$this->assertStringContainsStringIgnoringCase('administrator', implode(' ', $adv->steps));
	}

	public function test_build_advisory_admin_unreachable_configured(): void {
		$probe = (object)['state'=>'unreachable','checks'=>null,'msg'=>''];
		$adv = dd_diffusion_api::build_engine_advisory($probe, true, false, true);
		$this->assertSame(['retry','restart_engine','show_log'], $adv->actions);
		$this->assertNotSame('', $adv->cause);
		$this->assertNotEmpty($adv->steps);
	}

	public function test_build_advisory_admin_unreachable_unconfigured(): void {
		$probe = (object)['state'=>'unreachable','checks'=>null,'msg'=>''];
		$adv = dd_diffusion_api::build_engine_advisory($probe, true, false, false);
		$this->assertSame(['retry'], $adv->actions); // no restart button without a service cmd
		$this->assertStringContainsStringIgnoringCase('DEDALO_DIFFUSION_SERVICE_CMD', implode(' ', $adv->steps));
	}

	public function test_build_advisory_admin_unhealthy_names_failing_check(): void {
		$checks = (object)[
			'server'  => (object)['result'=>true,  'msg'=>'ok'],
			'php_api' => (object)['result'=>true,  'msg'=>'ok'],
			'sql'     => (object)['result'=>false, 'msg'=>'DB down'],
		];
		$probe = (object)['state'=>'unhealthy','checks'=>$checks,'msg'=>''];
		$adv = dd_diffusion_api::build_engine_advisory($probe, true, false, true);
		$this->assertSame('unhealthy', $adv->state);
		$this->assertStringContainsString('sql', $adv->cause);
		$this->assertStringContainsString('DB down', $adv->cause);
		$this->assertSame(['retry'], $adv->actions);
	}
```

- [ ] **Step 2: Run them and watch them fail**

Run: `vendor/bin/phpunit -c test/server/phpunit.xml --filter test_build_advisory`
Expected: errors — "Call to undefined method dd_diffusion_api::build_engine_advisory".

- [ ] **Step 3: Implement the action + helpers**

Add `'get_engine_advisory'` to the `API_ACTIONS` array. Append these methods to `dd_diffusion_api` (before the closing brace), and ensure `use`/visibility of `security`, `diffusion_api_client`, `diffusion_server_control` (all global classes, autoloaded — `diffusion_server_control` already cross-calls `dd_diffusion_api`, so the reverse autoloads too):
```php
	/** Tunables (overridable in tests to avoid real sleeps). */
	public static int $recover_poll_attempts   = 5;
	public static int $recover_poll_interval_us = 500000; // 0.5s

	/**
	* GET_ENGINE_ADVISORY
	* Probe the diffusion engine socket-first; for global-admins auto-recover an
	* unreachable engine via the configured service command; return a role-tailored
	* advisory the tool renders instead of a raw HTTP error.
	* @param object $rqo { options?: { auto_recover?: bool } }
	* @return object advisory (see build_engine_advisory)
	*/
	public static function get_engine_advisory(object $rqo) : object {

		$options      = $rqo->options ?? new stdClass();
		$auto_recover = (($options->auto_recover ?? true) !== false);
		$is_admin     = security::is_global_admin(logged_user_id())===true;
		$service_cmd_configured = defined('DEDALO_DIFFUSION_SERVICE_CMD') && DEDALO_DIFFUSION_SERVICE_CMD!=='';

		$probe     = self::probe_engine();
		$recovered = false;

		if ($probe->state==='unreachable' && $is_admin && $auto_recover && $service_cmd_configured) {
			$start = diffusion_server_control::start_server(new stdClass());
			if (!empty($start->result)) {
				for ($i=0; $i < self::$recover_poll_attempts; $i++) {
					usleep(self::$recover_poll_interval_us);
					$probe = self::probe_engine();
					if ($probe->state!=='unreachable') break;
				}
				$recovered = ($probe->state==='ok');
			}
		}

		return self::build_engine_advisory($probe, $is_admin, $recovered, $service_cmd_configured);
	}//end get_engine_advisory

	/**
	* PROBE_ENGINE
	* One socket-first health call. Returns { state, checks, msg }.
	* ok = engine answered result:true; unhealthy = answered result:false with checks;
	* unreachable = no usable answer (connection failure / missing endpoint).
	*/
	public static function probe_engine() : object {

		$res = diffusion_api_client::call((object)['action'=>'get_diffusion_status'], 5);

		$out = new stdClass();
		$out->checks = null;
		$out->msg    = $res->msg ?? '';

		if (!empty($res->result)) {
			$out->state  = 'ok';
			$out->checks = $res->data->checks ?? null;
			return $out;
		}
		if (isset($res->data) && isset($res->data->checks)) {
			$out->state  = 'unhealthy';
			$out->checks = $res->data->checks;
			return $out;
		}
		$out->state = 'unreachable';
		return $out;
	}//end probe_engine

	/**
	* FIRST_FAILING_CHECK
	* @return object|null { name, msg } of the first check whose result!==true.
	*/
	public static function first_failing_check($checks) : ?object {
		if (!is_object($checks)) return null;
		foreach ($checks as $name => $check) {
			if (is_object($check) && ($check->result ?? true)!==true) {
				return (object)['name'=>(string)$name, 'msg'=>(string)($check->msg ?? '')];
			}
		}
		return null;
	}//end first_failing_check

	/**
	* READ_ENGINE_LOG_TAIL
	* Last ~20 lines of the engine log (admin diagnostics). Bounded read; '' when absent.
	*/
	public static function read_engine_log_tail() : string {
		$log = getenv('DEDALO_DIFFUSION_LOG_FILE') ?: '/tmp/dedalo-diffusion.log';
		if (!is_file($log) || !is_readable($log)) return '';
		$lines = @file($log, FILE_IGNORE_NEW_LINES);
		if ($lines===false) return '';
		return implode("\n", array_slice($lines, -20));
	}//end read_engine_log_tail

	/**
	* BUILD_ENGINE_ADVISORY
	* Pure: maps probe state + role + service-cmd availability to the advisory object.
	*/
	public static function build_engine_advisory(object $probe, bool $is_admin, bool $recovered, bool $service_cmd_configured) : object {

		$advisory = new stdClass();
		$advisory->result   = true;
		$advisory->state    = $probe->state;
		$advisory->is_admin = $is_admin;
		$advisory->recovered= $recovered;
		$advisory->checks   = $is_admin ? ($probe->checks ?? null) : null;
		$advisory->service_cmd_configured = $service_cmd_configured;
		$advisory->actions  = ['retry'];
		$advisory->title    = '';
		$advisory->cause    = '';
		$advisory->steps    = [];
		$advisory->log_tail = null;

		if ($probe->state==='ok') {
			$advisory->title = 'Diffusion engine ready';
			return $advisory;
		}

		if (!$is_admin) {
			$advisory->title = 'Diffusion is temporarily unavailable';
			$advisory->steps = ['Please let your administrator know. You can keep working on everything else.'];
			return $advisory;
		}

		if ($probe->state==='unhealthy') {
			$failing = self::first_failing_check($probe->checks);
			$advisory->title = 'Diffusion engine is running, but a dependency is failing';
			$advisory->cause = $failing
				? ($failing->name . ': ' . $failing->msg)
				: ($probe->msg ?: 'A health check failed.');
			$advisory->steps = [
				'If the failing item is the database (sql), check the target database is running and reachable.',
				'Verify the diffusion credentials/configuration in config.php.',
				'Then click Retry.'
			];
			return $advisory;
		}

		// unreachable, admin
		$advisory->title = $recovered ? 'Diffusion engine recovered' : 'Diffusion engine is not running';
		if ($service_cmd_configured) {
			$advisory->cause = 'The diffusion engine (Bun service) is not responding'
				. ($recovered ? '' : ', and an automatic start attempt did not bring it up') . '.';
			$advisory->steps = [
				'Click "Restart engine" below.',
				'If it still fails, open the log (Show log) and send it to your IT team.',
				'As a last resort, on the server run: diffusion/service/service-ctl.sh restart'
			];
			$advisory->actions  = ['retry','restart_engine','show_log'];
			$advisory->log_tail = self::read_engine_log_tail();
		} else {
			$advisory->cause = 'The diffusion engine is not responding, and no service control command is configured to start it automatically.';
			$advisory->steps = [
				'Set DEDALO_DIFFUSION_SERVICE_CMD in config.php (see diffusion/service/README.md).',
				'Or start the engine from Maintenance → Diffusion server control.'
			];
		}
		return $advisory;
	}//end build_engine_advisory
```

- [ ] **Step 4: Run the builder tests — expect PASS**

Run: `vendor/bin/phpunit -c test/server/phpunit.xml --filter test_build_advisory`
Expected: all 5 pass.

- [ ] **Step 5: Write failing integration tests (probe + recover orchestration)**

Add:
```php
	public function test_get_engine_advisory_unreachable_no_recover(): void {
		diffusion_api_client::$endpoint_override = '/tmp/dd_no_such_engine.sock';
		try {
			$adv = dd_diffusion_api::get_engine_advisory((object)[
				'action'  => 'get_engine_advisory',
				'options' => (object)['auto_recover'=>false]
			]);
		} finally {
			diffusion_api_client::$endpoint_override = null;
		}
		$this->assertTrue($adv->result);
		$this->assertSame('unreachable', $adv->state);
		$this->assertFalse($adv->recovered);
		$this->assertContains('retry', $adv->actions);
	}

	public function test_get_engine_advisory_admin_recover_attempt_does_not_loop(): void {
		if (security::is_global_admin(logged_user_id())!==true) {
			$this->markTestSkipped('logged test user is not a global admin');
		}
		// service cmd that "succeeds" but leaves the engine down → recovered must stay false,
		// and the poll must be bounded (fast: 1 attempt, 1µs).
		diffusion_api_client::$endpoint_override   = '/tmp/dd_no_such_engine.sock';
		diffusion_server_control::$service_cmd_override = 'true %action%';
		$prev_attempts = dd_diffusion_api::$recover_poll_attempts;
		$prev_interval = dd_diffusion_api::$recover_poll_interval_us;
		dd_diffusion_api::$recover_poll_attempts   = 1;
		dd_diffusion_api::$recover_poll_interval_us = 1;
		try {
			$adv = dd_diffusion_api::get_engine_advisory((object)['action'=>'get_engine_advisory']);
		} finally {
			diffusion_api_client::$endpoint_override        = null;
			diffusion_server_control::$service_cmd_override  = null;
			dd_diffusion_api::$recover_poll_attempts    = $prev_attempts;
			dd_diffusion_api::$recover_poll_interval_us = $prev_interval;
		}
		$this->assertSame('unreachable', $adv->state);
		$this->assertFalse($adv->recovered);
		$this->assertContains('restart_engine', $adv->actions);
	}
```

- [ ] **Step 6: Run integration tests — expect PASS**

Run: `vendor/bin/phpunit -c test/server/phpunit.xml --filter test_get_engine_advisory`
Expected: both pass (second may report skipped if the test user isn't a global admin — acceptable).

- [ ] **Step 7: Run the whole diffusion API suite for regressions**

Run: `vendor/bin/phpunit -c test/server/phpunit.xml --filter dd_diffusion_api_Test`
Expected: no NEW failures vs. baseline (compare against the known pre-existing failures noted in project memory).

- [ ] **Step 8: Commit**

```bash
git add core/api/v1/common/class.dd_diffusion_api.php test/server/api/dd_diffusion_api_Test.php
git commit -m "feat(diffusion): get_engine_advisory action — socket probe, admin auto-recover, role-tailored advisory

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Tool build() gate — call the advisory, drop the direct status call

**Files:**
- Modify: `tools/tool_diffusion/js/tool_diffusion.js` (build() lines 85-114; replace `get_diffusion_status` method ~303-338 with `get_engine_advisory`)

**Interfaces:**
- Consumes: PHP `get_engine_advisory` (Task 3) via `data_manager.request` to `DEDALO_DIFFUSION_API_URL`-or-`data_manager.url`. NOTE: the advisory action is dispatched by PHP `dd_manager`, so it must go to the **PHP** endpoint (`data_manager.url`), not the Bun URL.
- Produces: `self.engine_advisory` (the advisory object) and a compatible `self.bun_status = { result, msg, checks }` for the existing status node.

- [ ] **Step 1: Add the `get_engine_advisory` method**

In `tool_diffusion.js`, replace the entire `tool_diffusion.prototype.get_diffusion_status = function(options){...}` block with:
```js
/**
* GET_ENGINE_ADVISORY
* Server-side engine health + (admin) auto-recover + role-tailored advisory.
* Dispatched by PHP dd_diffusion_api (NOT Bun) so it answers even when the engine
* is down — returns clean JSON, never a 404. @param object options {auto_recover?}
* @return promise<object> advisory
*/
tool_diffusion.prototype.get_engine_advisory = function(options={}) {

	const self = this

	const source = create_source(self, 'get_engine_advisory')

	const rqo = {
		dd_api	: 'dd_diffusion_api',
		action	: 'get_engine_advisory',
		source	: source,
		options : { auto_recover : options.auto_recover !== false }
	}

	// PHP endpoint (data_manager.url) — dd_manager dispatches this action, not Bun
	return new Promise(function(resolve){
		data_manager.request({
			url		: data_manager.url,
			body	: rqo
		})
		.then(function(response){
			if(SHOW_DEBUG===true) {
				console.log('-> get_engine_advisory response:', response);
			}
			resolve(response)
		})
		.catch(function(err){
			console.error('get_engine_advisory error:', err)
			resolve({ result:false, state:'unreachable', is_admin:false, recovered:false,
				title:'Diffusion is temporarily unavailable', cause:'', steps:[], actions:['retry'],
				checks:null, service_cmd_configured:false, log_tail:null })
		})
	})
}//end get_engine_advisory
```

- [ ] **Step 2: Rewrite `build()` to gate on the advisory**

Replace the `try { ... } catch` block in `tool_diffusion.prototype.build` (lines ~92-110) with:
```js
	try {

		// engine advisory gate (auto-recovers for admins; clean JSON even when engine down)
			const advisory = await self.get_engine_advisory({})
			self.engine_advisory = advisory
			self.bun_status = {
				result : advisory.state === 'ok',
				msg    : advisory.state === 'ok' ? 'Ready' : (advisory.title || 'Unavailable'),
				checks : advisory.checks || null
			}

		if (advisory.state === 'ok') {
			// engine healthy: load the diffusion body as before
			;[self.diffusion_info, self.active_processes] = await Promise.all([
				self.get_diffusion_info(),
				self.get_active_processes(),
			])
			self.resolve_levels               = self.diffusion_info.resolve_levels ?? 1
			self.skip_publication_state_check = self.diffusion_info.skip_publication_state_check ?? 1
		} else {
			// engine down/unhealthy: render() will show the advisory banner and skip the body
			self.diffusion_info  = self.diffusion_info  || {}
			self.active_processes = self.active_processes || []
		}

	} catch (error) {
		self.error = error
		console.error(error)
	}
```

- [ ] **Step 3: Sanity-check no other caller references the removed method**

Run: `grep -rn "get_diffusion_status" tools/tool_diffusion/js/`
Expected: no remaining references in the JS tool (the Bun action + PHP probe keep their own names; only the JS method is gone).

- [ ] **Step 4: Lint**

Run: `npx eslint tools/tool_diffusion/js/tool_diffusion.js`
Expected: no new errors (no-undef passes; `create_source`, `data_manager`, `SHOW_DEBUG` already imported/declared).

- [ ] **Step 5: Commit**

```bash
git add tools/tool_diffusion/js/tool_diffusion.js
git commit -m "feat(tool_diffusion): gate build on get_engine_advisory (PHP), drop direct Bun status call

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Advisory banner render + styles

**Files:**
- Modify: `tools/tool_diffusion/js/render_tool_diffusion.js` (get_content_data ~64-91: branch on advisory; add `render_engine_advisory`)
- Modify: `tools/tool_diffusion/css/tool_diffusion.less` (banner styles)

**Interfaces:**
- Consumes: `self.engine_advisory` (Task 4); `ui.create_dom_element`, `get_label`; `self.get_engine_advisory()` for Retry; `self.caller`-independent.
- Produces: a `.diffusion_engine_advisory` banner node; on non-ok state the tool body is skipped.

- [ ] **Step 1: Branch get_content_data on the advisory**

In `render_tool_diffusion.js`, at the top of `get_content_data` (right after `const fragment = new DocumentFragment()`), insert:
```js
	// engine advisory gate: when the engine is not ok, show the advisory and stop
		const advisory = self.engine_advisory || { state:'ok' }
		if (advisory.state !== 'ok') {
			render_engine_advisory(self, advisory, fragment)
			return fragment
		}
```

- [ ] **Step 2: Add the `render_engine_advisory` function**

Append to `render_tool_diffusion.js` (before the closing of the module / after `get_content_data`):
```js
/**
* RENDER_ENGINE_ADVISORY
* Calm, role-tailored banner shown when the diffusion engine is unreachable or
* unhealthy. Admins get cause + steps + actions (Retry / Restart engine / Show log);
* regular users get a reassuring notice. Data comes from PHP get_engine_advisory.
* @param instance self @param object advisory @param HTMLElement parent
*/
const render_engine_advisory = function(self, advisory, parent) {

	const state_class = advisory.state === 'unhealthy' ? 'unhealthy' : 'unreachable'
	const banner = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'diffusion_engine_advisory ' + state_class,
		parent			: parent
	})

	ui.create_dom_element({
		element_type	: 'h3',
		class_name		: 'advisory_title',
		text_content	: advisory.title || (get_label.diffusion_unavailable || 'Diffusion is temporarily unavailable'),
		parent			: banner
	})

	if (advisory.cause) {
		ui.create_dom_element({
			element_type	: 'p',
			class_name		: 'advisory_cause',
			text_content	: advisory.cause,
			parent			: banner
		})
	}

	if (Array.isArray(advisory.steps) && advisory.steps.length) {
		const list = ui.create_dom_element({ element_type:'ul', class_name:'advisory_steps', parent:banner })
		advisory.steps.forEach(step => ui.create_dom_element({
			element_type:'li', text_content:step, parent:list
		}))
	}

	// actions
	const actions = Array.isArray(advisory.actions) ? advisory.actions : ['retry']
	const bar = ui.create_dom_element({ element_type:'div', class_name:'advisory_actions', parent:banner })

	const reload = async (opts) => {
		// re-run the gate and rebuild the tool body in place
		const fresh = await self.get_engine_advisory(opts || {})
		self.engine_advisory = fresh
		self.bun_status = { result: fresh.state==='ok', msg: fresh.state==='ok' ? 'Ready' : (fresh.title||'Unavailable'), checks: fresh.checks||null }
		self.refresh()
	}

	if (actions.includes('retry')) {
		const btn = ui.create_dom_element({ element_type:'button', class_name:'button retry', text_content:get_label.retry || 'Retry', parent:bar })
		btn.addEventListener('click', () => reload({ auto_recover:false }))
	}
	if (actions.includes('restart_engine')) {
		const btn = ui.create_dom_element({ element_type:'button', class_name:'button warning restart_engine', text_content:get_label.restart_engine || 'Restart engine', parent:bar })
		btn.addEventListener('click', () => reload({ auto_recover:true }))
	}
	if (actions.includes('show_log') && advisory.log_tail) {
		const btn = ui.create_dom_element({ element_type:'button', class_name:'button show_log', text_content:get_label.show_log || 'Show log', parent:bar })
		const pre = ui.create_dom_element({ element_type:'pre', class_name:'advisory_log hide', text_content:advisory.log_tail, parent:banner })
		btn.addEventListener('click', () => pre.classList.toggle('hide'))
	}

	return banner
}//end render_engine_advisory
```

- [ ] **Step 3: Add banner styles**

Append to `tools/tool_diffusion/css/tool_diffusion.less`:
```less
.diffusion_engine_advisory {
	margin: 1em;
	padding: 1em 1.2em;
	border-radius: 6px;
	border-left: 4px solid #c98a00;
	background: #fff8e6;
	color: #4a3b00;

	&.unreachable { border-left-color: #b3261e; background: #fdeceb; color: #5f1512; }
	.advisory_title { margin: 0 0 .4em; font-size: 1.05em; }
	.advisory_cause { margin: 0 0 .6em; }
	.advisory_steps { margin: 0 0 .8em 1.1em; }
	.advisory_actions { display: flex; gap: .5em; }
	.advisory_log { margin-top: .8em; max-height: 14em; overflow: auto; background: #1e1e1e; color: #ddd; padding: .6em; font-size: .8em; }
	.advisory_log.hide { display: none; }
}
```
Then recompile if the build pipeline requires it (the repo ships a compiled `tool_diffusion.css`); follow the existing less build. If unsure, leave the `.less` change and note that styling is cosmetic — the banner is fully functional unstyled.

- [ ] **Step 4: Lint the JS**

Run: `npx eslint tools/tool_diffusion/js/render_tool_diffusion.js`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add tools/tool_diffusion/js/render_tool_diffusion.js tools/tool_diffusion/css/tool_diffusion.less
git commit -m "feat(tool_diffusion): role-tailored engine advisory banner (retry / restart / show log)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Manual acceptance verification

**Files:** none (verification only). Render functions are pure/exported so a future `test/client` unit test can assert the banner from a synthetic advisory; the gate below is the acceptance deliverable.

- [ ] **Step 1: Healthy path**

Ensure the engine runs (`diffusion/service/service-ctl.sh status`), open `tool_diffusion` from a section edit as an admin.
Expected: tool body loads as before; the `bun_status` node shows "Ready"; no console errors; no advisory banner.

- [ ] **Step 2: Engine-down, admin → auto-recover**

Stop it (`service-ctl.sh stop`), confirm `ls /tmp/diffusion.sock` is gone, open the tool as a global-admin.
Expected: a brief pause, then the tool loads normally (auto-recover restarted it) OR — if KeepAlive immediately re-spawns it — it loads with no banner. To force the "recovery failed" banner, temporarily set `DEDALO_DIFFUSION_SERVICE_CMD` to empty in `config.php`, stop the engine, reopen: banner titled "Diffusion engine is not running", with Retry only (no restart button), and **no** red "HTTP 404" toast. Restore config after.

- [ ] **Step 3: Engine-down, non-admin → calm notice**

With the engine down and `DEDALO_DIFFUSION_SERVICE_CMD` empty, open the tool as a non-admin user (or temporarily lower the test user's permission).
Expected: "Diffusion is temporarily unavailable … let your administrator know"; only a Retry button; no technical details, no log, no toast.

- [ ] **Step 4: Recover button**

Re-enable `DEDALO_DIFFUSION_SERVICE_CMD`, keep the engine stopped, open as admin, click **Restart engine**.
Expected: the banner is replaced by the loaded tool body; `ls /tmp/diffusion.sock` present.

- [ ] **Step 5: Record results**

Note pass/fail per step. Any failure → return to systematic-debugging before claiming done.

---

## Self-review notes (resolved)

- **Spec coverage:** A (units+adapter+dev activation) → Tasks 1-2; B PHP action/probe/recover/advisory → Task 3; JS gate (no 404 toast) → Task 4; role-tailored banner + buttons → Task 5; testing (PHP unit matrix + manual acceptance) → Tasks 3 & 6. nginx `50x.html` note is ops-only (spec Rollout §3), not a code task.
- **Endpoint correctness:** the advisory is a PHP `dd_manager` action, so Task 4 sends it to `data_manager.url` (PHP), not the Bun URL — this is what makes it answer when the engine is down.
- **Type consistency:** advisory shape `{result,state,is_admin,recovered,title,cause,steps[],actions[],checks,service_cmd_configured,log_tail}` is identical across Task 3 (produce), Task 4 (`self.bun_status` adapter), Task 5 (render). `build_engine_advisory(probe,is_admin,recovered,service_cmd_configured)` arity matches every call site and test.
- **Test seams:** `diffusion_api_client::$endpoint_override` (unreachable), `diffusion_server_control::$service_cmd_override` (start), `dd_diffusion_api::$recover_poll_*` (no real sleep) — all used; the ok/unhealthy end-to-end states need a live Bun and are covered by Task 6 manual + Task 3 pure-builder unit tests.
