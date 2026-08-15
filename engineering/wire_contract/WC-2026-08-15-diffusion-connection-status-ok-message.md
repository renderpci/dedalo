# WC-2026-08-15-diffusion-connection-status-ok-message — `connection_status` is `{ok, code?, message}|null`

- **Date:** 2026-08-15 (P1 error sweep, tools/servers + diffusion; supersedes the
  SHAPE half of WC-067 — the nullity rule, the probe semantics and the verbatim
  strings there are unchanged).
- **Decision:** the nested target-database verdict on `get_diffusion_info`
  `section_diffusion_nodes[].connection_status` drops the PHP-era `{result,msg}`
  pair for `{ok, code?, message}` (ERRORS_SPEC §1: a reader branches on a
  registered code, never on prose). `code` is present only when `ok` is false
  and is always `diffusion.connection_failed`.

## Shape before (WC-067)

```json
"connection_status": { "result": false, "msg": "Database is NOT ready (missing or engine unreachable)." }
```

## Shape after

```json
"connection_status": { "ok": false, "code": "diffusion.connection_failed", "message": "Database is NOT ready (missing or engine unreachable)." }
"connection_status": { "ok": true,  "message": "Database is ready." }
"connection_status": null
```

- Server: `src/diffusion/targets/mariadb/db.ts` (`TargetDatabaseStatus`),
  `src/diffusion/api/info.ts`; the install probe adapter
  (`src/core/install/db_probe.ts`) maps it to the wizard's `{ok,msg}` step
  contract at the boundary.
- Client: `tools/tool_diffusion/js/render_tool_diffusion.js` reads `.ok` /
  `.message`.
- Gate: `test/unit/diffusion_connection_status.test.ts`.
- Frozen fixtures still carry the WC-067 nested `{result:false,msg}` payload;
  `test/parity/normalize.ts` keeps classifying that nested pair as DATA (not
  an envelope) — a fixture value, not a live shape.
