# WC-2026-09-27-external-allowlist-at-door-only — the egress host allowlist is enforced at the outbound door only, never at `api_config` parse

- **Date:** 2026-09-27 (`src/external/config.ts` `parseApiConfig` / `validateUrlField`
  drop the allowlist branch; `src/external/transport.ts` `fetchExternalJson` →
  `parseAllowedUrl` is the ONE enforcement point).
- **Decision:** — (engine fix; amends the parse-time allowlist claim of
  `WC-2026-08-05-external-api-config-publication`, the degradation shape of
  `WC-2026-08-15-external-degradation-is-a-notice` and the failure path of
  `WC-2026-08-06-external-search-request`; spec: `engineering/EXTERNAL_SPEC.md`
  §2.2 and §5 step 3).
- **Re-harvest: NO — impossible by definition, and not needed.** No parity gate
  covers it: external search did not exist in the oracle (the browser made the
  call), and the fixture store holds no external emission. The frozen
  `api_config` echoes in `test/parity/fixtures/oracle_harvest/` are unchanged —
  publication (`publishApiConfig`) never consulted the allowlist.

## What this covers

Every answer that depended on `parseApiConfig` refusing an `api_url` /
`api_url_search` whose host is not in `DEDALO_EXTERNAL_ALLOWED_HOSTS`:

1. `dd_external_api::search` degradation (`src/core/api/handlers/dd_external_api.ts`,
   `searchDegraded`).
2. The record path's `source_status` (`src/core/components/component_external/value.ts`,
   `deriveExternalValue`).
3. Classification (`isExternalReferenceSection`, `src/external/record_fields.ts`)
   and every door that asks it — above all the time-machine restore
   (`listExternalSectionTipos`, `src/core/update/transform/section_id_restore.ts`).
4. The section-id classifier `classifyWireSectionId` (`src/core/concepts/section_id.ts`,
   read / permissions / import doors), the record-reference frontier
   (`frontierRecordReference`, `src/core/security/frontier_scope.ts`) and the
   export degradation report (`src/diffusion/export/external_prefetch.ts`).

## Shape before (TS, 2026-08-05 → 2026-09-27)

The allowlist was checked at PARSE (`validateUrlField` with `fetched: true`), so
a binding to a non-allowlisted host could not be constructed at all:

- **Search**: `resolveExternalSearchTarget` threw, and the handler degraded with
  the counterparty UNKNOWN —

  ```json
  HTTP 200
  { "ok": true, "data": { "context": [], "data": [] },
    "notices": [ { "code": "external.bad_config",
                   "label_key": "external_source_misconfigured", "retryable": false,
                   "details": { "service": "unknown" } } ],
    "source_status": { "service": "unknown", "state": "misconfigured",
                       "label_key": "external_source_misconfigured", "retryable": false } }
  ```

- **Record path**: `source_status: { service: "unknown", state: "misconfigured", … }`.
- **`classifyWireSectionId`**: THREW on an external section's string id.
- **Frontier**: the classifier throw was caught and the reference REFUSED
  (fail closed, `FrontierRefusal`).
- **Export report**: the prefetch was skipped by the throw; every cell derived
  `misconfigured` with `service: "unknown"` in `counts[]` / `sample[]`.
- **Time-machine restore**: REFUSED — `update.refused` naming the carrier section
  (on the vendored seed, `test3` with its Zenon `api_config`), on EVERY restore of
  ANY component in ANY section, because the restore classifies every
  `api_config` carrier. With the catalog's default EMPTY allowlist (the safe
  default) that was every install that had not opted into server-side fetching.
  Measured on a deployed install restoring a `tch1` component.

## Shape after (TS)

- **Search**: the binding parses, the request reaches the door, and the door
  refuses it at step 3 (before any DNS) —

  ```json
  HTTP 200
  { "ok": true, "data": { "context": [], "data": [] },
    "notices": [ { "code": "external.blocked_host",
                   "label_key": "external_source_misconfigured", "retryable": false,
                   "details": { "service": "zenon" } } ],
    "source_status": { "service": "zenon", "state": "misconfigured",
                       "label_key": "external_source_misconfigured", "retryable": false } }
  ```

  The notice `code` is now the TRUE kind (`external.blocked_host`, not
  `external.bad_config`) and `details.service` / `source_status.service` name
  the REAL service instead of `unknown`.
- **Record path**: `source_status.service` is the real service; `state` stays
  `misconfigured` (`stateForKind('blocked_host')`), `retryable` stays `false`.
- **`classifyWireSectionId`**: classifies the string id as `external-ref`.
- **Frontier**: an external reference classifies `'external'` and is kept —
  classification, not egress; nothing is fetched on this path.
- **Export report**: the prefetch runs and reaches the door; `counts[]` /
  `sample[]` report `{ service: "zenon", state: "misconfigured" }`.
- **Breaker**: `blocked_host` stays NEUTRAL (EXTERNAL_SPEC §5) — a local verdict
  learns nothing about the remote, so an empty allowlist never opens a circuit.
- **Classification / restore**: no longer consult the allowlist. A time-machine
  restore succeeds with the allowlist empty and no `.env` change. A genuinely
  malformed binding (`bad_config`, `not_registered`) is still refused
  `update.refused` — shape errors stay loud.
- **Egress is unchanged**: nothing leaves the server for a non-allowlisted host.
  `fetchExternalJson` is the only outbound door (`external_outbound_tripwire`)
  and applies the allowlist to the FINAL URL before any resolver traffic.

## Reason

The allowlist is the operator's EGRESS policy: it answers "where may this
server go". Parse answers "is this binding well-formed" and classification
answers "are this section's ids remote records" — neither makes a request. Checking
the egress policy there (a) made the safe default break an unrelated write path
(every TM restore), (b) made classification install-dependent, and (c) cost the
client the real diagnostic: the notice said `bad_config` for a service it could
not name, when the configuration was valid and the host was simply not allowed.
One allowlist, one enforcement point, at the place the socket would open.

## Gate reconciliation

- `test/unit/external_secret_confinement_tripwire.test.ts` — inverted: a
  non-allowlisted `api_url` PARSES; a request to it through `fetchExternalJson`
  is refused `blocked_host` before any DNS.
- `test/unit/external_emit_native.test.ts` — empty allowlist still yields
  `misconfigured`, now via the door; asserts `source_status.service === 'zenon'`
  (was `unknown`).
- New native regression gate on the suite DB, allowlist forced EMPTY
  (`overrideExternalSettingsForTests`): classification answers without throwing,
  `listExternalSectionTipos` returns the carrier set, and a TM restore succeeds.
- CI: `ci_workflow_tripwire` Rule 6b (hosted tiers must allowlist every seed
  host) and the `DEDALO_EXTERNAL_ALLOWED_HOSTS:=zenon.dainst.org` default in
  `scripts/ci/hosted_env.sh` are DELETED — they existed only to dodge the
  parse-time refusal; CI now runs the safe empty default. No gate performs a
  real network fetch (every door test injects `fetchImpl`).
