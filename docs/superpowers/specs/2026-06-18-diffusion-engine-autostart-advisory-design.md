# Diffusion engine auto-start + defensive advisory

**Status:** Approved (design)
**Date:** 2026-06-18

## Problem

Opening `tool_diffusion` from any section list/edit throws in the browser:

```
data_manager.js !!!!! SERVER ERROR ... Error: Not retry-able HTTP error 404
  at tool_diffusion.get_diffusion_status (tool_diffusion.js:319)
  at tool_diffusion.build (tool_diffusion.js:97)
```

Root cause (confirmed): the Bun diffusion engine was **not running** (`/tmp/diffusion.sock` absent). `tool_diffusion.build()` fires three Bun-only calls on every open — `get_diffusion_info`, `get_diffusion_status`, `list_processes` — to `DEDALO_DIFFUSION_API_URL` (`/v7/diffusion/api/v1/`). With the engine down, nginx can't reach the upstream socket → it wants to serve a **502**, but its configured `50x.html` error-page file is missing, so nginx returns a misleading **404**. That surfaces as the cryptic `data_manager` error and a red "Server responded with status 404" toast.

Two gaps:
1. **No supervision** — the dev/install boxes have no launchd/systemd unit, so Bun does not start at boot or restart after a crash.
2. **No defensive UX** — when the engine is unreachable the tool spews console errors and a meaningless 404 toast instead of telling the operator what is wrong and what to do. Many administrators lack the IT skills to map "404" to "the Bun service is down."

## Goal

- **A.** Bun starts automatically at boot and restarts on crash, via committed, cross-platform service units (launchd + systemd) plus a short install doc. Activated on the current dev box.
- **B.** When the tool detects the engine is in trouble it (i) silently auto-recovers for administrators, and (ii) when it can't, shows a calm, plain-language, role-tailored advisory describing the problem, the likely cause, and the actions to take — instead of the cryptic 404.

## Non-goals

- Re-routing the heavy `diffuse` streaming path through PHP — it stays browser → Bun.
- Fixing the nginx `50x.html` config on the dev box (local ops note, not a repo change).
- Detecting the rarer "engine up but nginx proxy location missing" misconfiguration (noted as a future check, not built).

## Approach (approved)

Shift only the tool's **health/advisory check** from "browser → nginx → Bun" to "browser → PHP → Bun socket", reusing the existing socket-first `diffusion_api_client`. PHP knows the user's role, can run the service command, and always returns clean JSON — so the very failure mode that breaks the browser path (engine down → nginx 404) no longer produces a scary toast, and detection/role-tailoring/auto-recovery all live in one server-side place. Everything else in the tool is unchanged when the engine is healthy.

## Design

### Part A — OS service units (committed, cross-platform)

New directory `diffusion/service/`:

- **`com.dedalo.diffusion.plist`** — launchd agent (macOS). `RunAtLoad=true`, `KeepAlive=true`; runs `bun index.ts` in the foreground from `diffusion/api/v1` with `SOCKET_PATH` in `EnvironmentVariables`; `StandardOut/ErrorPath` to a log file. Template with clearly-marked `__BUN_BIN__`, `__APP_DIR__`, `__SOCKET_PATH__` placeholders.
- **`dedalo-diffusion.service`** — systemd unit (Linux). `ExecStart=<bun> run index.ts`, `WorkingDirectory`, `Environment=SOCKET_PATH=...`, `Restart=always`, `WantedBy=multi-user.target`. Same placeholders.
- **`service-ctl.sh`** — thin adapter mapping `start|stop|restart|status` to the active manager (`launchctl` on macOS, `systemctl` on Linux). This is the single integration point so the maintenance widget **and** the auto-recover drive the *same* managed process.
- **`README.md`** — per-platform install steps (fill placeholders, copy unit into place, load/enable, verify socket).

**Single-manager rule:** once launchd/systemd owns the process (with KeepAlive / `Restart=always`), `DEDALO_DIFFUSION_SERVICE_CMD` must drive that manager via `service-ctl.sh` — **not** the legacy `dedalo-diffusion.sh`, which spawns its own detached copy and would double-instance / fight for the socket. `dedalo-diffusion.sh` remains for simple installs that opt out of a real supervisor.

**Dev-box activation (not committed):** instantiate the plist with real paths into `~/Library/LaunchAgents/com.dedalo.diffusion.plist`, `launchctl load`, verify the socket comes up and survives a `kill -9` (KeepAlive restart), and repoint `DEDALO_DIFFUSION_SERVICE_CMD` in `config/config.php` to `…/diffusion/service/service-ctl.sh %action%`.

### Part B — Advisory gate in the tool

#### New PHP action: `dd_diffusion_api::get_engine_advisory(object $rqo): object`

Added to `dd_diffusion_api::API_ACTIONS`. Steps:

1. `is_admin = security::is_global_admin(logged_user_id())`.
2. **Probe** with `diffusion_api_client::call((object)['action' => 'get_diffusion_status'])`:
   - clean result with `result===true` → `state = 'ok'`,
   - clean result with `result===false` and `checks` → `state = 'unhealthy'` (engine up, a dependency such as `sql`/`php_api` failing),
   - call failed / endpoint unavailable → `state = 'unreachable'`.
3. **Auto-recover** (only when `state==='unreachable'` **and** `is_admin` **and** `rqo->options->auto_recover !== false`): call `diffusion_server_control::start_server($options)` (already admin-gated + `SERVICE_ACTIONS` keyword-validated), wait briefly (bounded poll on socket/health, e.g. ≤5×500ms), then re-probe once. Set `recovered = (state becomes 'ok')`. Runs **at most once** per call.
4. Build and return the **advisory object** (below). `log_tail` (last ~20 lines of the engine log) is included **only for admins**.

Reuses vetted components; no new shell-exec or permission logic is written. When `DEDALO_DIFFUSION_SERVICE_CMD` is unset, `start_server` already returns `service_cmd_not_configured` — the advisory surfaces that as "engine control isn't configured; use Maintenance → Diffusion server control".

#### Advisory object (PHP → JS contract)

```jsonc
{
  "result": true,                 // the advisory call itself succeeded
  "state": "ok|unhealthy|unreachable",
  "is_admin": false,
  "recovered": false,             // true if auto-recover brought it up
  "title": "…",                   // short, plain language
  "cause": "…",                   // likely cause, plain language ('' for users)
  "steps": ["…", "…"],            // ordered actions ([] for users beyond 'notify admin')
  "actions": ["retry","restart_engine","show_log"], // buttons to render
  "checks": { "server": {...}, "php_api": {...}, "sql": {...} }, // admin only, when known
  "log_tail": "…"                 // admin only
}
```

#### JS flow — `tool_diffusion.build()`

Replace the current `get_diffusion_status` call with `get_engine_advisory` as the **gate**:

- `state==='ok'` → proceed exactly as today (`get_diffusion_info` + `get_active_processes` from Bun, normal render). `self.bun_status` is set to a `{ result, msg, checks }` shape so the existing `.bun_status ready` status node (render_tool_diffusion.js:72-90, which reads `bun_status.result`/`bun_status.msg`) keeps working unchanged.
- otherwise → render the advisory banner (new render function) and **skip** the diffusion body. Because `get_engine_advisory` returns HTTP 200 JSON, no `data_manager` 404 path fires and no error toast appears.

The JS `tool_diffusion.get_diffusion_status` method (currently the only caller of the Bun `get_diffusion_status` action from the client) is folded into the advisory and **removed** to avoid dead code; the Bun `get_diffusion_status` action itself stays (the advisory probes it via `diffusion_api_client`).

#### Role-tailored messages

- **Admin · unreachable (recovery failed):** "⚠️ The diffusion engine isn't running. We tried to start it automatically but it didn't come up. Likely cause: the engine service is stopped or failing to start. What to do: ① click **Restart engine**; ② if it still fails, open the log below and send it to your IT team; ③ as a last resort, on the server run `diffusion/service/service-ctl.sh restart`." Buttons: **[Retry] [Restart engine] [Show log]**.
- **Admin · unhealthy (e.g. sql):** "⚠️ The engine is running but a dependency is failing (`sql`: <msg>). Check the target database is running and that the credentials in config are correct." Buttons: **[Retry]**.
- **Regular user:** "ℹ️ Diffusion is temporarily unavailable. Please let your administrator know — you can keep working on everything else." Buttons: **[Retry]**.

`[Retry]` re-runs `get_engine_advisory`. `[Restart engine]` calls `get_engine_advisory` with an explicit recover request (admin only). `[Show log]` toggles `log_tail`.

## Error handling & safety

- Non-admins never trigger a shell command: the start path is admin-gated inside `diffusion_server_control`/`security::is_global_admin`. Non-admins always get the calm user message and `actions: ['retry']` only.
- Auto-recover is bounded and one-shot per call (no loop, bounded wait).
- The advisory call returning 200 means the existing `data_manager` error UI is bypassed for the open path; the cryptic 404 toast no longer appears for engine-down.
- Probe uses the socket-first client, so it is correct even when the nginx proxy/error-page is itself misconfigured.

## Testing

- **PHP unit** (`test/server/api/dd_diffusion_api_Test.php` or a sibling): matrix `{ok, unhealthy, unreachable} × {admin, non-admin} × {recover-succeeds, recover-fails}` with `diffusion_api_client::$endpoint_override` and a `diffusion_server_control` service-cmd override (both test hooks already exist). Assert `state`, `is_admin`, `recovered`, presence/absence of `log_tail`, and that non-admin never invokes the service command.
- **Client** (`test/client`): given each advisory object, the banner renders the correct variant and button set.
- **Manual:** stop Bun → open the tool as a global-admin (auto-recovers, body loads) and as a normal user (calm message, no recover, no 404 toast); kill the socket and confirm launchd/systemd restarts it.

## Rollout

1. Land Part A units + `service-ctl.sh` + README; activate on the dev box; confirm crash-restart.
2. Land Part B PHP action + JS gate/banner + tests.
3. Note for ops: drop a `50x.html` into the nginx html dir (or fix the `error_page` path) so any *future* engine outage reports an honest 502 rather than a masked 404. Local config, not a repo change.
