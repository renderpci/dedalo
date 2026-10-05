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
    `{ registry: { state: 'ok' | 'registry_invalid', reason, check },
    registry_path, engine_qualities, is_root, hosts }`. `registry.check` is `null` when
    the state is `'ok'`, else Task 6's `registryInvalidCheck(reason)` —
    `{ id: 'registry', state: 'blocked', detail: reason }`, a row the panel renders
    with the host check renderer (amended 2026-10-04, Task 7 review; the client
    renders it through `check_row(…, 'publication_hosts')` inside the loud note since
    2026-10-05). The panel read takes no registry lock, so `registry_locked` is not a
    panel state (dropped 2026-10-05, review finding): were a read ever to meet a held
    lock, get_value fails with `publication_host.busy`, never a "repair" instruction. `hosts` is one row per
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
    `probe({name})` → `{ host, probe }` (the agent's `media.probe` BOUNDED, E7 —
    amended 2026-10-05: exactly the seven known fields; `root` only as a printable
    absolute path ≤ 300 chars, else `'malformed'`; `problems` at most 16 lines of
    ≤ 300 chars with control/format characters removed, then one `… N more` line; the
    `msg` counts every problem the agent reported; the client renders it as text);
    `rollback_api({name, api: 'v1'|'v2'})` → `{ host, api, from, to }` (`from`/`to` are
    the agent's release ids only when they match `AGENT_RELEASE_ID`, else the literal
    `'malformed'`: agent prose is log-only, E7);
    `set_host_fields({name, public_url?, qualities?, probe?})` → `{ host, fields }`;
    `remove_host({name})` → `{ host, removed: true }` (under ONE registry lock hold:
    the entry is re-checked to be the pairing read before — same `fingerprint` and
    `paired_at`, else `maintenance.action_refused` "re-paired, retry" — then secrets,
    then the registry entry; then the in-process pairing proof). Every answer carries an
    operator `msg`. `set_host_fields` judges `qualities` / `probe` with the registry's
    own field checks (`validateQualities` / `validateProbePath`), so a value the registry
    would refuse is `maintenance.action_refused`, never `registry_invalid`. A hash the
    agent reports that is not 64-hex is named only as "a malformed rule hash".
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
    in the commit that adds that tree. The area's new cross-widget event LEAF
    (`/dedalo/core/area_maintenance/js/maintenance_events.js`, `OPEN_WIDGET_EVENT`:
    media_control's one line opening this panel) lives outside that prefix and joins
    `POST_HARVEST_CLIENT_ADDITIONS` in the same commit.
  - TS ground truth: `test/unit/publication_host_widget_native.test.ts`.
- **Fixture interaction (DEC-14b):** NO re-harvest; the frozen PHP fixtures never
  contained this id.

## Addendum 2026-10-05 — the shipped story, read against the code (docs review)

- **Who adds a host.** "the root pairing CLI" above is superseded: the pairing CLI
  (`scripts/publication_host_pair.ts`) is run as the engine user, the owner of
  `<private>` (`sudo -u <engine user> bun run dedalo:pair-publication-host …`), never root.
  It refuses any other uid, root included, because root-owned 0600 secrets would be
  unreadable by the engine. The panel's own unknown-host refusal and the
  `publication_hosts_none` label say the same.
- **`registry.check` is rendered.** The client draws the server's `registry.check` row with
  `check_row(…, 'publication_hosts')` inside the loud registry note; with no row it shows
  `registry.reason` as text. The wire shape above is unchanged.
- **`busy` on the panel read.** The server never sends a `registry_locked` state. A held
  registry lock fails `get_value` with `publication_host.busy` (`wire.ts` `registryError`,
  logged `registry_reason: locked`); the client keeps that failure on `read_error` and
  shows the `publication_hosts_registry_busy` note with a Reload retry, never the
  "invalid, repair" sentence. It still reads a `registry_locked` state as busy, defensively
  only. `busy` therefore has two causes: the agent (a 409, another change running on that
  host) and the work host's own registry lock (the pairing CLI or another panel write).
- **Gate:** `test/unit/publication_host_door_tripwire.test.ts` (*the operator is told how
  pairing and the panel really work*) holds this addendum, the operator page and the spec
  to the code. No fixture interaction.
