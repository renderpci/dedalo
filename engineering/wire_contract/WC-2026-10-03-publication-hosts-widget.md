# WC-2026-10-03-publication-hosts-widget — the `publication_hosts` maintenance widget is TS-ONLY (no PHP twin)

- **Date:** 2026-10-03, with phase 3 of `engineering/PUBLICATION_HOST_SPEC.md` (§8): the
  engine side of the publication host (registry, the paired agent channel, the panel).
- **Decision:** DEC-12 (the invariants are gated: root-only actions, the non-root reduced
  row and the secret-free payload by `test/unit/publication_host_widget_native.test.ts`, the
  ownership classification by `update_ownership_tripwire`, the per-action pool by
  `maintenance_door_unbounded_native`). Catalog divergence in the WC-018 / WC-035 /
  WC-2026-09-03-maintenance-reconcile-status-widget TS-only pattern.
- **Shape before (PHP):** nothing. The frozen PHP engine had no publication-host
  registry and no agent channel, so its `get_ar_widgets` catalog can never contain
  this id.
- **Shape after (TS):** the maintenance catalog gains one block,
  `id: 'publication_hosts'`, category `publication`, label key `publication_hosts`,
  served right after `site_builder_status` on every install (no eager `value`; the
  panel loads through `get_widget_value`).
  - **panel** (`get_widget_value`, global-admin readable):
    `{ registry: { state: 'ok' | 'registry_invalid' | 'registry_locked', reason },
    registry_path, engine_qualities, is_root, hosts }`. `hosts` is one row per
    registered host, built by `src/core/publication_host/host_status.ts`
    (`buildHostPanelRow`, served unchanged): `{ name, address_label, public_url,
    checks: [{id, state, detail?}], rules: { expected, reported },
    apis: { v1, v2: { current, previous } }, token_present, bundle_present,
    pairing_proved }`. Root's rows add the edit-form fields `qualities` and
    `probe: { published, unpublished }`. A caller who is not root gets rows WITHOUT
    `address_label`, `qualities` and `probe`, and `registry_path: null` (no
    infrastructure topology below root). `hosts` is `null` (never `[]`) exactly when
    the registry cannot be read (`registry.state` not `'ok'`). No token, key or PEM text
    is ever in the payload; a failed agent call contributes its registered error code,
    never its message. Secrets are read with `secretPresenceOutcome`: a secret refused
    on disk (`bad_mode`/`bad_owner`/`bad_token`/`bad_bundle`) reaches
    `buildHostPanelRow` as `refused` and blocks that host's `secrets` check with the
    reason; a host with a refused or missing required secret (token; plus the engine
    bundle for a TLS host) is not dialled. The other hosts render.
  - **Decided:** a non-root read still asks each paired agent for its read-only
    `status` (pairing proved first; no actor; no mutation), because the checks are the
    panel's content. Every agent-changing or agent-probing action stays root-only.
  - **actions** (`widget_request`, ROOT-ONLY — a global admin who is not root gets
    `perm.denied` before anything is loaded or dialled):
    `apply_rules({name})` → `{ host, server, hash, dropped }`;
    `probe({name})` → `{ host, probe }` (the agent's `media.probe` body under `probe`);
    `rollback_api({name, api: 'v1'|'v2'})` → `{ host, api, from, to }`;
    `set_host_fields({name, public_url?, qualities?, probe?})` → `{ host, fields }`;
    `remove_host({name})` → `{ host, removed: true }` (secrets, registry entry, then the
    in-process pairing proof). Every answer carries an operator `msg`.
    Failures: agent failures surface as the `publication_host.*` codes; a registry that
    cannot be read or written as `publication_host.registry_invalid`, or
    `publication_host.busy` when its lock is held (`wire.ts` `registryError`); input
    faults and unknown hosts as `maintenance.action_refused`; a hash the agent reports
    other than the one sent, or a secret dir that cannot be deleted, as
    `maintenance.action_failed`.
  All five are classified `ENGINE_NATIVE`.
- **Reason:** a publication host is a native TS subsystem (the agent under
  `publication/host_agent/`, the registry under `<private>/`); the panel is its only
  interactive door on the work host. Hosts are added by the root pairing CLI
  (`scripts/publication_host_pair.ts`), never typed into the panel, so the panel takes
  no address and no credential.
- **Gate reconciliation:**
  - `test/parity/widgets_differential.test.ts` — `publication_hosts` joins
    `TS_ONLY_WIDGET_IDS`, filtered out of the catalog byte-compare against the frozen
    PHP oracle. No re-harvest needed and none is possible.
  - `test/parity/dedalo_files_differential.test.ts` — the widget's CLIENT tree
    (`/dedalo/core/area_maintenance/widgets/publication_hosts/`) joins `isTsOnlyEntry`
    in the commit that adds that tree.
  - TS ground truth: `test/unit/publication_host_widget_native.test.ts`.
- **Fixture interaction (DEC-14b):** NO re-harvest; the frozen PHP fixtures never
  contained this id.
