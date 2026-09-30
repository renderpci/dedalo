# WC-023 — `update_ontology.update_ontology` OWNED-mode ingest is stricter than PHP (staged, verified, recoverable)

- **Date:** 2026-07-10 (UPDATE_PROCESS Phase 2 — the ontology import unlocked
  behind the standalone-ownership gate; Opus-designed transport hardening).
- **Shape:** only reachable when `engineOwnsInstall()` is true (always, since the 2026-07-11 cutover) — historically never while
  coexisting with PHP (closed mode keeps the frozen `engine_denied` bytes).
  Success envelope mirrors PHP: `result:true`,
  `msg = ('OK. Request done successfully' | 'Warning! Request done with
  errors') + joined step messages`, `root_info:{term, properties}` from dd1.
  Panel (`get_value`) bytes match PHP `{servers (probed), current_ontology,
  prefix_tipos, structure_from_server, body, confirm_text}`; the legacy
  `STRUCTURE_SERVER_URL/CODE` fallback is not carried (TS installs are
  v7-configured). **Partly SUPERSEDED by WC-028 (2026-07-11):** `prefix_tipos`
  is now emitted as `active_ontology_tlds` (same value, honest name); the rest
  of this byte list stands.
- **Divergences (each deliberately STRICTER; `src/core/ontology/
  data_io_import.ts` + `ontology_update.ts`):**
  D1 TLS peer verification stays ON (PHP `ssl_verifypeer=false`; private CAs
  via `NODE_EXTRA_CA_CERTS`; `NODE_TLS_REJECT_UNAUTHORIZED=0` refused +
  tripwired). D2 downloads refuse redirects. D3 streamed size caps
  (256 MiB/file) + stall guard. D4 the client-supplied `files` list is
  schema-validated (zod) — a malformed list PHP tolerated now hard-fails.
  D5 the network target is re-resolved from the CONFIG catalog by server
  code and every URL is origin-pinned; destination filenames are CONSTRUCTED
  from the validated tld (never `basename(url)`); `section_tipo` recomputed.
  D6 decompression byte + ratio ceilings. D7 **all-or-nothing**: everything
  stages + validates BEFORE the first destructive statement, a per-table
  recovery snapshot is taken first, each file's DELETE+`\copy` is ONE psql
  transaction, and any failure AUTO-RESTORES the snapshots — PHP's per-file
  partial success (`result:true` + errors, half-imported state) cannot occur;
  failures answer `result:false`. D8 COPY-shape sanity check before DELETE.
  Local-source runs ('Local files') read the IO dir directly instead of
  self-HTTP (wire-invisible).
- **TS-N/A steps:** the PHP session wipe + static JS lang-file regen have no
  TS equivalent (labels are DB-derived; in-process caches purged via
  `clearOntologyDerivedCaches`); the PHP backend-activity row is not ported.
- **Master surface (PHP parity, fail-closed):** `dd_utils_api:
  get_server_ready_status` + `get_ontology_update_info` (NO_LOGIN +
  CSRF-exempt machine-to-machine POSTs; refuse unless `IS_AN_ONTOLOGY_SERVER`
  + a configured access code) and the
  `/dedalo/install/import/ontology/<major.minor>/<file>` snapshot route
  (allowlisted basenames, confined dir). The recovery-file pair
  (`build_database_version.build_recovery_version_file` /
  `restore_dd_ontology_recovery_from_file`) is gated open with the same
  semantics as PHP (pg_dump slice of whitelisted TLDs; restore recreates only
  the `dd_ontology_recovery` table).
- **Gates:** `test/unit/ontology_ingest.test.ts` (transport hardening
  branches, manifest builder, schema-diff bytes, and the DESTRUCTIVE
  copy-import exercised on a throwaway scratch DATABASE incl. the
  mid-COPY-failure rollback proof); `test/unit/update_ownership_tripwire.test.ts`
  (gated non-stub + the TLS ban). The full owned-mode pipeline against a real
  master is an operator drill on a scratch instance (ledgered in
  rewrite/LEDGER.md — no automated surface mutates a live ontology).

## Addendum 2026-09-30 — D5 resolves the target by url ORIGIN, not by code

D5 matched the selected server by `code` (`catalog.servers.find(code)`) and
ignored the client `server.url`. Masters routinely share ONE access code, so a
panel that picked any server after the first got the FIRST entry's origin, and
every file then refused with `origin mismatch: <selected> != <first>` — the
update was impossible from any master but the first one listed.

- **Shape after:** the target is the configured entry whose url ORIGIN equals
  the origin of the client `server.url`; the returned origin is still the
  catalog's (the download pin). An origin not in the catalog — including a
  hostile url paired with a known code, which the old rule silently accepted —
  is refused before any artifact exists. The `localhost` pseudo-server is still
  selected by code (master instances only). Refusal `errors[]` entry:
  `unknown ontology server code: <code>` → `unknown ontology server: <origin>`
  (`msg` unchanged). The client already posts the servers-list entry verbatim,
  so no client change.
- **Gate reconciliation:** `test/unit/ontology_update_target_native.test.ts`
  (shared-code masters resolve to the SELECTED one; hostile/unparseable url
  refused), `ontology_update_shell_native.test.ts`, `ontology_ingest.test.ts`.
  No fixture store involvement (write path, no parity gate).
