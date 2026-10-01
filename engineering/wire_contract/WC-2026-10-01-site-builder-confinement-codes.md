# WC-2026-10-01-site-builder-confinement-codes — the site builder's confinement refusals reach the engine wire as two typed codes

- **Date:** 2026-10-01 (audit 2026-09-26, LEAD-1b owed item "tool_sitebuilder wire.ts maps no
  confinement.* reason"; lane 5).
- **Decision:** none (a defect fix with a wire effect).
- **Doors:** every `tool_sitebuilder` action that relays a daemon response
  (`tools/tool_sitebuilder/server/daemon_client.ts` `mapError` → `wire.ts` `codeForProblem`),
  in practice `session_start` / `session_message` / `build`.
- **Shape before:** the daemon's 503 confinement refusals — `reason: "confinement_unavailable"`
  and `reason: "confinement.<code>"` (`site_busy`, `identity_missing`, `identity_quarantined`,
  `unit_refused`, `unit_nonconformant`, `daemon_stopping`) — matched no entry and fell to the
  status default: `ok:false`, error code `site_builder.failed`, `retryable: true`. A host that
  cannot confine the agent read as "an error, try again".
- **Shape after:** `ok:false`, HTTP 503, one of two NEW registered codes:
  - `site_builder.busy` (`retryable: true`, label `error_site_builder_busy`) for
    `confinement.site_busy`, `confinement.identity_quarantined`, `confinement.daemon_stopping`
    — it clears without anyone acting;
  - `site_builder.confinement_unavailable` (`retryable: false`, label
    `error_site_builder_confinement_unavailable`) for `confinement_unavailable`,
    `confinement.identity_missing`, `confinement.unit_refused`, `confinement.unit_nonconformant`
    and the new `confinement.agent_cli_unsupported` (PLANT: the installed Claude Code CLI does not
    list a flag the turn needs to keep agent-written hooks/MCP/settings out).
  Both `operator` disclosure: the daemon's `detail` stays log-only, as for every site_builder
  code. The client policy is unchanged (`site_builder.*` → inline, `sitebuilder_controller.js`).
- **Reason:** the client acts on `retryable`; a refusal only an operator can clear must not
  offer a retry, and one that clears by itself must not read as a configuration fault.
- **Gate reconciliation:** no parity fixture covers the site builder proxy (it post-dates the
  harvest); no fixture edit, no re-harvest. Gate: `test/unit/tool_sitebuilder.test.ts` "every
  daemon confinement reason maps…" — the daemon's own error classes render each reason through a
  stand-in daemon; the mapping's key set must EQUAL `['confinement_unavailable',
  ...CONFINEMENT_CODES.map(c => 'confinement.' + c)]` (the daemon's runtime list,
  `publication/site_builder/src/errors.ts`), so a code added daemon-side without a mapping is red.
