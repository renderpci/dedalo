# WC-2026-10-11-site-builder-reason-codes — every site-builder refusal has its own `site_builder.*` code; none carries prose

- **Date:** 2026-10-11 (audit 2026-09-26 closure plan, site_builder residual WIRE-MAP, lane 4).
- **Decision:** WIRE-MAP — the code IS the message. The browser renders a refusal from its
  code's label (`render_api_error.js` reads the label before any message), so a refusal
  that shares a code shares a sentence, and a `publicMessage` reaches only MCP/curl callers.
- **Shape before:** `tools/tool_sitebuilder/server/wire.ts` mapped only the confinement
  reasons. Every other daemon reason fell through to the status default:
  - `slug_exists`, `workspace_exists`, `no_build`, `not_running`, the six busy reasons
    (`session_running`, `build_running`, `site_initializing`, `site_recovering`,
    `git_running`, `site_deleting`) and the three limits (`max_sites`, `disk_quota`,
    `max_concurrent_sessions`) → `site_builder.rejected` (400, not retryable);
  - `webspace_unavailable`, `domain_taken` → `site_builder.rejected` WITH an
    engine-authored `publicMessage` (`REFUSAL_SENTENCE`);
  - `reasonOf` read `reason ?? type`, so a reason-less problem branched on its `type` URI
    segment (`conflict`, `limit-exceeded`).
  - The engine's own pre-daemon refusals were all `site_builder.rejected` with a
    `publicMessage` sentence (invalid slug/id, missing name/domain/prompt/message,
    unconfirmed publish/purge, no publisher grant, not the session owner).
- **Shape after:**
  - Daemon reason → code (`DAEMON_REASON_CODES`, typed `Record<DaemonReason, ErrorCode>`
    over the daemon's `DAEMON_REASONS`, publication/site_builder/src/errors.ts):

    | reason | code | status | retryable |
    |---|---|---|---|
    | the six busy reasons | `site_builder.busy` | 503 | yes |
    | `slug_exists` | `site_builder.slug_exists` | 409 | no |
    | `workspace_exists` | `site_builder.workspace_exists` | 409 | no |
    | `domain_taken` | `site_builder.domain_taken` | 409 | no |
    | `webspace_unavailable` | `site_builder.webspace_unavailable` | 409 | no |
    | `no_build` | `site_builder.no_build` | 409 | no |
    | `not_running` | `site_builder.not_running` | 409 | no |
    | `max_sites` | `site_builder.site_limit` | 429 | no |
    | `disk_quota` | `site_builder.disk_quota` | 429 | no |
    | `max_concurrent_sessions` | `site_builder.capacity` | 429 | yes |
    | `confinement_unavailable`, `confinement.*` | unchanged (`confinement_unavailable` / `busy`) | 503 | as before |
    | `confinement.agent_cli_unproved` (NEW: the opencode probe could not ask — a question past its bound, a resource-refused spawn — and proved nothing against the binary) | `site_builder.busy` | 503 | yes |

  - `reasonOf` reads `problem.reason` ONLY. No reason → the status fallback
    (`site_builder.rejected` for 4xx, `site_builder.failed` for 5xx). An unknown reason
    (daemon newer than engine) → the same fallback plus one log line naming the reason.
  - Engine refusals → `site_builder.invalid_slug`, `invalid_id`, `name_required`,
    `domain_required`, `text_required`, `confirmation_required` (400), `not_permitted`,
    `not_session_owner` (403 — not `perm.*`, which the client maps to the no-access page).
  - `publicMessage` is carried on NO `site_builder.*` code; `REFUSAL_SENTENCE`,
    `refusalSentence` and `siteBuilderRejected` are deleted. The sentences live as the
    codes' labels (`src/core/labels/master.json`), `domain_taken`/`webspace_unavailable`
    verbatim from the deleted `REFUSAL_SENTENCE`.
  - Daemon side: `ConflictError`/`LimitExceededError` take a REQUIRED typed reason.
- **Client:** no change — the `site_builder.*: inline` policy covers every new code.
- **The stream door** (a running turn's error events, the SSE responder's frame) is its own
  entry: WC-2026-10-11-site-builder-turn-error-frames. The daemon's `ApiError` carries ONE
  typed extension, `reason: DaemonReason`, and `util/response.ts` emits it only when it is
  one of `DAEMON_REASONS` (a cast reason is dropped and logged); `WebspaceError` IS a
  `ConflictError` (reason `webspace_unavailable`).
- **Gate reconciliation:** no parity gate or oracle fixture carries `tool_sitebuilder`, so
  no fixture edit. Gates: `test/unit/tool_sitebuilder.test.ts` ("WIRE-MAP — every daemon
  reason → its own code": the daemon's own serializer answers, the real handler maps, the
  converter builds the body; list equality, per-reason code/retryable/label, prose off the
  wire, engine refusals), `test/unit/tool_sitebuilder_authz_native.test.ts`
  (`not_permitted` / `not_session_owner`).
