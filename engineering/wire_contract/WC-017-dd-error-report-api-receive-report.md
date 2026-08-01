# WC-017 — `dd_error_report_api:receive_report`, a TS-only pre-auth intake action (PHP has no twin)

- **Date:** 2026-07-10 (user-approved error-report feature).
- **Shape:** a NEW API class+action with no PHP counterpart — the TS
  ACTION_REGISTRY was previously action-complete vs PHP API_ACTIONS, so any
  TS-only action is ledgered here. `receive_report` accepts an error report
  relayed machine-to-machine by another installation's server (the
  tool_error_report relay, WC-019) and appends it to the TS-owned
  `dedalo_ts_error_reports` table (migration 0002).
- **Exposure:** pre-auth (`NO_LOGIN_ACTIONS` + `CSRF_EXEMPT_ACTIONS`, the
  login posture) but FLAG-GATED: dispatch Gate 1c refuses unless
  `DEDALO_ERROR_REPORT_RECEIVER=true` (default off), answering the EXACT
  Gate-1 unregistered-action shape so a probe cannot learn the endpoint
  exists. Hardening in the handler: per-(entity,ip) sliding-window throttle,
  optional per-deployment shared token (constant-time), 256 KiB payload
  clamp, strict shared Zod schema. Security posture + privacy/retention:
  SECURITY_DECISIONS.md "Error-report intake".
- **Coexistence risk:** none — PHP never dispatches the class; a PHP server
  receiving the RQO answers its own unknown-action error, which the relay
  reports honestly to the admin.
- **Gate reconciliation:** no differential covers unknown API classes (no red
  to normalize). TS ground truth pinned in
  `test/unit/error_report_receiver.test.ts` (flag off/token/throttle/schema/
  stamping paths).
