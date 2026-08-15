# WC-2026-08-15-install-refusals-typed — install/update refusals are typed public codes; the probes stay `ok()` reports

- **Date:** 2026-08-15 (P1 install-update-tools sweep, `00ebfd9d9e`).
- **Decision:** DEC-15, DEC-19 (the install surface is pre-auth by design).
  Normative source: `engineering/ERRORS_SPEC.md` §4. Envelope:
  `WC-2026-08-15-error-envelope-v2`; status:
  `WC-2026-08-15-error-status-is-a-channel`.
- **Re-harvest: NO — impossible by definition.** The install wizard and the code
  updater are TS-owned surfaces; the frozen store carries no installer body.

## What this covers

`src/core/install/**` (the wizard steps, the probes, `refuse.ts`,
`server_info.ts`), `src/core/update/**` (`code_update.ts`, the update-server
client) and the pre-auth intake `dd_error_report_api::receive_report`
(WC-017).

## Shape before (TS until today)

Every step hand-built `{result:false, msg:'…', errors:[]}` at HTTP 200, and
`server_info` / the DB probes hand-built `{result:true, …}` alongside diagnostic
keys the wizard reads by name. A refused step (bad password, wrong state) and a
crashed step (psql unreachable) were the same body, and the CLI installer's
top-level catch printed whatever string happened to be in `msg`.

## Shape after (TS)

Two rules, split by what the surface IS:

**Probes and reports SUCCEED.** A probe's job is to report a verdict, so its
verdict is DATA: `ok(data, {requestId, extend})`, with the diagnostic keys the
wizard already reads (`in_use`, `environment`, `pfile`, the diagnostics grid of
`WC-2026-07-09-installer-diagnostics-grid`) as EXTENSION keys. "The database is
not reachable" answered by a probe is a successful probe, not a failed request.
The nested target-database verdict follows the same reasoning at one level down
— `WC-2026-08-15-diffusion-connection-status-ok-message` gives it
`{ok, code?, message}`, and `src/core/install/db_probe.ts` adapts that to the
wizard's step contract at the boundary.

**Actions THROW.** `refuseInstall(code, detail)` and `refuseUpdate(code, detail)`
are `never`-typed throwing helpers — a helper may exist only if it throws; none
of them builds a body:

| code | status | when |
|---|---|---|
| `install.invalid_input` | 400 | a submitted value is unusable (password too short, bad config value) |
| `install.state_conflict` | 409 | not in this state (root password already set, cannot seal yet, target DB already populated) |
| `install.step_failed` | 500 | the machine side failed (psql, filesystem, unexpected hash format) |
| `install.unknown_step` | 400 | the wizard asked for a step that does not exist |
| `install.not_reachable` | 404 | the install surface is closed on this host (Gate 1b) |
| `install.ip_denied` | 403 | the caller's address is off the install allowlist |
| `update.refused` | 400 | the update was declined before doing anything (not runnable here, checksum mismatch, not a ZIP, unsafe archive) |
| `update.failed` | 500 | the update ran and broke |
| `update_server.refused` | 400 | the update SERVER declined the request |

**The install codes are `disclosure: 'public'`, and the sentence is carried
twice on purpose.** The wizard is PRE-AUTH and runs on a machine with no
ontology and no label catalog, so `render_installer.js` can render nothing but
the envelope's own sentence — a `label_key` is worthless there. `refuseInstall`
therefore sets both `publicMessage` (the wire) and `message` (the log line, and
what the CLI installer's top-level catch prints), so the operator at the
terminal and the operator at the browser read the same words. This is the one
place in the engine where the wire sentence is deliberately not the registry's.

**`receive_report`'s Gate-1c mimicry becomes a CODE IDENTITY.** WC-017 made a
disabled intake answer the EXACT unregistered-action refusal so a probe cannot
learn the endpoint exists on this host. That property is now expressed in the
type system rather than in duplicated body-building: both Gate 1 and a disabled
Gate 1c throw the same `request.unknown_action` with the same
`details.action`, from the same `unknownAction()` constructor
(`src/core/api/dispatch.ts`), so the two bodies are byte-identical minus
`request_id`. `install.not_reachable` (404, GONE) plays the same role for the
install surface: a sealed instance and a never-installed one answer the same
shape.

## Reason

An installer is the surface with the LEAST context available to interpret a
failure — no session, no catalog, often no database — and it was the surface
answering `200` with prose. The split (probe reports vs action refusals) is the
honest one: `ok` describes whether the ENGINE could do what was asked, and a
probe asked to look at a broken database and reporting "broken" did exactly what
was asked.

Typing the refusals also puts `install.state_conflict` on `409`, which is the
one status a wizard genuinely needs: it means "re-read the state and re-render
the step", as opposed to `400` ("your input was wrong") and `500` ("the box is
broken"). Under a single 200 the wizard had to guess, and it guessed by
substring.

Expressing the Gate-1c mimicry as one constructor removes the way that property
rots: two hand-built bodies drift the moment either is edited, and the whole
value of the mimicry is that they are IDENTICAL.

## Gate reconciliation

`test/unit/dispatch_error_native.test.ts` (Gate 1 and disabled Gate 1c produce
the same body minus `request_id`; `install.not_reachable` 404;
`install.ip_denied` 403) · `error_report_receiver.test.ts` (flag off / token /
throttle / schema paths, unchanged in substance) · the install and update native
gates for each `refuseInstall` / `refuseUpdate` site · `error_registry_native.test.ts`
(the `install.*` / `update.*` rows: category↔status, labels, public disclosure).

**Re-harvest: NOT NEEDED.** No installer or updater body is in the frozen store;
`adoptErrorEnvelopeV2` / `FROZEN_ERROR_BODIES` (`test/parity/normalize.ts`)
classify only the eight oracle-era root `result:false` bodies listed in
`WC-2026-08-15-error-envelope-v2`.
