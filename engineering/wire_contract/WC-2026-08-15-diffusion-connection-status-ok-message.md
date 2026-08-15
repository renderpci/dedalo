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

## Addendum 2026-08-15 — where this sits in the envelope-v2 series

Same day, same series. This entry is the NESTED case: `connection_status` is a
value inside `data`, not an envelope, so it takes the shape's spirit (`ok` as a
boolean, a registered `code`, a message for the log/curl side) without becoming
one — it has no `request_id` and no `error` object.

- The envelope itself: `WC-2026-08-15-error-envelope-v2`.
- Why a probe REPORTS rather than fails, and how the install adapter maps this
  verdict onto the wizard's step contract:
  `WC-2026-08-15-install-refusals-typed`.
- Why `test/parity/normalize.ts` keeps classifying the frozen nested
  `{result:false, msg}` payload as DATA and not as an envelope — an
  `adoptErrorEnvelopeV2` rule, listed with the eight root bodies in
  `WC-2026-08-15-error-envelope-v2` and reasserted in
  `WC-2026-08-15-stream-error-frames`.
