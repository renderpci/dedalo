# WC-2026-10-11-site-builder-turn-error-frames — a turn's error reaches the browser as a registered code, never as the daemon's prose

- **Date:** 2026-10-11 (audit 2026-09-26 closure plan, site_builder residual WIRE-MAP, lane 4 —
  the STREAM door; the control door is WC-2026-10-11-site-builder-reason-codes).
- **Decision:** the stream door goes through the ONE converter (ERRORS_SPEC §5.3): a stored error
  event and the daemon's `event: error` frame both reach the browser as `toErrorBody` for a
  registered `site_builder.*` code. The daemon's sentence is log-only on both doors.
- **Shape before:**
  - every error a turn produced was stored and relayed as
    `{type:'error', message:<daemon prose>, retriable}` — `setup failed: …`,
    `confinement refused: <the whole refusal>`, the agent's stderr tail, `turn timed out`;
  - the daemon's replay failure was `event: error` `{code:'replay_failed', message:<exception>}`;
  - `session_stream` (`tools/tool_sitebuilder/server/index.ts`) relayed the bytes verbatim, and
    the client printed `body.message`; a `replay_failed` row stood in the client's error policy
    for a token outside the registry.
- **Shape after:**
  - daemon (`publication/site_builder/src/drivers/turn_errors.ts`): an error EVENT is
    `{type:'error', reason, retriable}` — `reason` ∈ `DAEMON_REASONS` ∪ the supervisor faults
    (`turn_timeout`, `turn_interrupted`, `turn_setup_failed`, `turn_unit_lost`,
    `turn_agent_killed`, `turn_agent_exited`, `turn_failed`); `turn_agent_exited` adds
    `agent_output` (the agent's stderr tail, ≤ 500 chars, labelled). No `message`. The frame is
    `event: error` `{reason:'replay_failed'}`.
  - engine (`wire.ts` `relaySessionFrames` / `projectStreamRecord`): a stored error event becomes
    `{seq, ts, body:{type:'error', error:<toErrorBody>, agent_output?}}`; an `event: error` frame's
    data becomes `<toErrorBody>`; the engine's own `stream_lost` frame is the full body too
    (was `{code}`). Map (`TURN_EVENT_REASON_CODES`): the control door's `DAEMON_REASON_CODES`, plus

    | reason | code | status | retryable |
    |---|---|---|---|
    | `turn_timeout` | `site_builder.turn_timeout` | 503 | yes |
    | `turn_interrupted` | `site_builder.turn_interrupted` | 503 | yes |
    | `turn_setup_failed` | `site_builder.turn_setup_failed` | 503 | no |
    | `turn_agent_exited` | `site_builder.agent_failed` | 503 | no |
    | `turn_unit_lost`, `turn_agent_killed`, `turn_failed` | `site_builder.failed` | 503 | yes |
    | `replay_failed` | `site_builder.replay_failed` | 503 | no |

    A record with no reason or an unknown one (a session log written before this entry, a daemon
    newer than the engine) → `site_builder.failed`, its text dropped, the reason logged by name.
    A data record that is not JSON is dropped — and only that record: the records after it, and the stream's end, still reach the browser. Every other record is byte-identical. A record that
    outgrows `MAX_RELAY_RECORD_BYTES` (8 MiB) before its terminator ends the stream with
    `stream_lost`.
  - client: `render_event('error')` renders `error_text(body.error)` and `agent_output` as its own
    line; the `replay_failed` policy row is deleted (the frame is a `site_builder.*` code).
- **Gate reconciliation:** no parity gate or oracle fixture carries `tool_sitebuilder`, so no
  fixture edit. Gates: `test/unit/tool_sitebuilder_stream_codes.test.ts` (G-W1: real supervisor
  through both doors → real store/SSE → split mid-record → real relay; per-reason code/retryable/
  label, prose absent, non-error records byte-identical, legacy record, trailing record, the
  record bound, map/retriable parity), `publication/site_builder/tests/turn_errors.test.ts` (G-W2:
  every daemon reason and every supervisor fault as an event; the control door drops a cast reason).
