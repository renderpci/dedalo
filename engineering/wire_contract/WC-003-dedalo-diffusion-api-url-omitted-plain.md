# WC-003 — `DEDALO_DIFFUSION_API_URL` omitted from plain_vars under native diffusion

- **Date:** 2026-07-05 (native diffusion cutover levers); ledgered 2026-07-07.
- **Decision:** self-contained cutover posture (project memory: TS stands
  alone; the TS server serves NO `/dedalo/diffusion/api/v1/` route).
- **Shape before (PHP):** `plain_vars.DEDALO_DIFFUSION_API_URL =
  "/dedalo/diffusion/api/v1/"` (points the client at the legacy Bun diffusion
  API).
- **Shape after (TS, whenever native diffusion is on):** the key is ABSENT —
  the client then routes diffusion through the native TS actions.
- **Gate reconciliation:** `test/parity/environment_differential.test.ts`
  asserts the divergence explicitly (TS omits / PHP has) and compares the rest
  of plain_vars exactly.

### Addendum 2026-07-29 — native is now the DEFAULT, not an opt-in

The flag defaulted to `false`, so an install that never wrote
`DEDALO_DIFFUSION_NATIVE` kept emitting `DEDALO_DIFFUSION_API_URL` and pointed
`tool_diffusion` at the external PHP-era service. That service is decommissioned
(cutover 2026-07-11) and this server serves NO `/dedalo/diffusion/api/v1/`
route, so the `false` branch could only ever produce a 404 — observed as
`tool_diffusion` failing to open in any section, masked by a downstream
`Invalid tool wrapper: missing tool_header`.

Changes:

- Catalog default `DEDALO_DIFFUSION_NATIVE: false → true`
  (`src/config/catalog/diffusion.ts`). Emitting the key is now the explicit
  opt-out, for a deployment that still runs the external service behind a route
  of its own.
- The three readers moved from `readEnv('DEDALO_DIFFUSION_NATIVE') === 'true'`
  to `readBool('DEDALO_DIFFUSION_NATIVE')` — `readEnv` returns `undefined` when
  the key is unset and IGNORES the catalog, so the old form pinned the value to
  `false` no matter what the catalog said. Sites: `core/resolve/environment.ts`
  (the wire shape), `core/area_maintenance/widgets/diffusion_server_control.ts`
  and `.../check_config.ts` (the two panels that REPORT the posture — left on
  `readEnv` they would report "external" while the wire routed native).

Wire effect: on a default install `plain_vars` no longer carries
`DEDALO_DIFFUSION_API_URL`. The PHP-oracle divergence recorded above is
unchanged in kind; only the condition that triggers it is now the default.
