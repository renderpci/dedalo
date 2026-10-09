# WC-2026-10-09-publication-host-v2-only-site — a publication host may serve the Publication API v2 ONLY (no Publication API v1)

- **Date:** 2026-10-09, with the v1-optional declaration of the publication-host agent
  (`engineering/PUBLICATION_HOST_SPEC.md`): a declaration WITHOUT a `v1` block is a
  v2-only site. Publication API v1 is legacy (v6-era websites) and will be removed; making
  it optional now makes that removal a deletion.
- **Decision:** DEC-12 (each branch gated: the status shape by
  `test/unit/publication_host_agent_client_native.test.ts`, the reconciler skip and the
  drift count by `test/unit/publication_host_api_reconcile.test.ts`, the host check and
  the panel row by `test/unit/publication_host_host_status_native.test.ts`, the push answer
  by `test/unit/publication_host_push_apis_widget.test.ts`, the reason sentence by the
  agent-reason twin in `test/unit/publication_host_wire_native.test.ts`, the badge by
  `client/dedalo/test/client/js/test_publication_api_lockstep.js`). Amends the TS-only
  channel and widget of WC-2026-10-03-publication-hosts-widget.
- **Shape before (PHP):** nothing — the frozen PHP engine had no publication host. Before
  this entry (TS): every host served both APIs; `GET /v1/status` had no `served_apis`.
- **Shape after (TS):**
  - **agent `GET /v1/status`** gains a REQUIRED `served_apis`: exactly `["v1","v2"]` or
    `["v2"]` (order fixed, v2 always present). `apis` keeps both keys; an unserved api's
    slot is `{current: null, previous: null}`. The engine (`agent_client.ts`
    `isServedApis`) reads any other value — missing included — as an unreadable body
    (`publication_host.failed`, `details.reason: 'unreadable_body'`): no compat with an
    agent that predates it (TS-era beta, no installs to carry).
  - **agent `POST /v1/releases/v1` / the v1 rollback on a v2-only host** → 422
    release-refused, the new closed reason `api_not_served` (the body is never read).
    The engine sentence (`wire.ts` AGENT_REASON_SENTENCES) says the host is a v2-only
    site and nothing was changed.
  - **reconciler** (`api_reconcile.ts`): the agent seam `agentApis` returns
    `{ apis, served }`; an api the host does not serve is the ApiAction
    `{ action: 'none', result: 'not_served' }` — no bundle is built for it (a round with
    no v1-serving host builds no v1 bundle), nothing is sent, nothing is recorded in the
    runtime file, and it never counts as drift (`apiReportToReconcile`) nor as a failed
    push (`push_apis`).
  - **panel**: each `hosts[]` row gains `served_apis` (the proved status's list, `null`
    when no status was proved). The `api_v1` host check of a v2-only site is
    `{ state: 'ok', detail: 'not_served' }` (the `rules_hash` `not_applicable` pattern),
    never `warn`. `api_lockstep.rows[].state` gains `'not_served'` (a reached host that
    does not serve the api; `host_current: null`), rendered as a plain badge "Not served"
    — neither amber nor red, whatever the runtime file still holds for that api.
- **Reason:** a v2-only site has no Publication API v1 anywhere; without the status fact
  the engine would push a v1 release every round, get refused, and paint the host red for
  an API it was deliberately never given.
- **Gate reconciliation:** no parity gate covers the publication-host channel (TS-only);
  no fixture changes, no re-harvest.
