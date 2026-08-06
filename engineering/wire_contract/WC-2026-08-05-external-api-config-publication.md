# WC-2026-08-05-external-api-config-publication — `fields_map` hydration lands; `api_config` is typed, credential-stripped and scheme-validated on BOTH publication paths

- **Date:** 2026-08-05 (with WC-2026-08-05-external-derived-emission and
  -external-source-status).
- **Decision:** — (DEC-12 gate: `test/unit/external_secret_confinement_tripwire.test.ts`
  §(d); behaviour in `test/unit/external_request_config_native.test.ts` and
  `test/parity/request_config_differential.test.ts`).

## 1. `fields_map: true` is HYDRATED (a gap, not a divergence)

The ontology stores the flag `fields_map: true` on an external show ddo,
meaning "the real mapping lives on my own node". PHP step 9
(`trait.request_config_ddo.php:350 resolve_ddo_fields_map`; v6
`class.common.php:3335-3348`) replaced the flag with the node's
`properties.fields_map` and stamped `properties`, `lang` (`lg-nolan` when the
node is not translatable), `model` and `permissions`. TS carried the flag
through unresolved — the DEFERRED item in the explicit parser's header.

That is now implemented, and the hydrated `fields_map` **STAYS ON THE WIRE**.
It is not decoration: `client/dedalo/core/services/service_autocomplete/js/service_autocomplete.js`
reads `fields[j].fields_map[0].remote` when shaping a remote answer (:911) and
again when building `&field[]=` for the search request (:1060), where `fields`
IS `rqo_search.show.ddo_map` (:887). Dropping it asks the service for no
fields and renders an empty picker.

**No divergence:** the emitted shape is field-identical to the frozen harvest
(`request_config_differential.json`, interaction `ca200c…`, rsc368's zenon
item), which is what the new parity case asserts.

## 2. `api_config` is TYPED and SHAPED — the divergence

`api_config` reaches a browser two ways, and both now go through the one
shaper `publishApiConfig` (`src/external/config.ts`):

- **path 1** — `request_config[].api_config`
  (`src/core/relations/request_config/external.ts`), read by the client's
  portal edit handler as `api_config.ui_base_url + section_id`
  (`component_portal.js:2054`) and by the autocomplete as
  `api_config.api_url_search` (`service_autocomplete.js:1039`);
- **path 2** — the structure-context emitted-properties echo
  (`src/core/resolve/structure_context.ts` `sanitizeEmittedProperties`), which
  PHP emitted VERBATIM for every external section (zenon1, test3 — and rsc205,
  whose copy is a stale 2024 duplicate).

### Shape before (PHP)

The raw ontology object, both paths, whatever keys it happened to hold.

### Shape after (TS)

`{ entity, api_url, api_url_search?, ui_base_url?, response_map }` — snake_case
(the client contract), optional keys ABSENT when the ontology declares none.
Differences from the raw echo:

1. **Credential-shaped keys are stripped** (`api_key`, `token`, `secret`,
   `authorization`, …). A credential VALUE comes only from a `scope:'secret'`
   catalog key; the ontology is editable, readable cataloguing data.
2. **Unknown keys are dropped.** An allowlist, not a denylist: the regex catches
   `api_token`, only an allowlist catches a future `internal_admin_url`.
   Measured effect on this installation: rsc205's cataloguer note `info`
   disappears from its context echo. Nothing reads it (grepped over `client/**`).
3. **Every URL must be http(s) with no embedded credentials**, or the WHOLE
   binding is refused — `null` on path 1, key DELETED on path 2. A partly
   published binding is a trap: the client would build a link from a config the
   engine already knows is hostile. `ui_base_url` is the load-bearing one — a
   `javascript:` value stored in the ontology is stored XSS on a curator's click.
4. **`api_config: null` now ships on EVERY item, including the dedalo ones** —
   restoring PHP's shape (previously TS omitted the key entirely).

### What is NOT applied here, deliberately

The **host allowlist** (`DEDALO_EXTERNAL_ALLOWED_HOSTS`). It governs what THIS
SERVER contacts; these URLs are rendered by, and fetched from, the curator's
browser — a different trust boundary. Gating publication on the server's egress
list would silently break a working catalogue link on every install that has not
opted into server-side fetching. `parseApiConfig` (the SERVER binding) still
enforces it; `publishApiConfig` does not.

### The target section binds, always

`api_config` is read from the section the show ddo NAMES (zenon1), never from
the caller. rsc205's duplicate copy is therefore inert — it is the user's
catalogue data and is not deleted; whether to remove it is an open question for
the operator.

## Reason

An `api_config` is cataloguing data: anyone who can edit the ontology can point
the server, and a curator's browser, at a host of their choosing, and can paste
a credential into a field many people can read. A heritage installation cannot
have "who can edit a label" and "who can inject a `javascript:` URL into every
curator's portal" be the same permission. The shaper is the one place that fact
is enforced, and it is enforced on both paths because a control that guarded one
of them would rot on the other.

## Gate reconciliation

`external_secret_confinement_tripwire` §(d) drives the SAME hostile fixture
through both paths and additionally proves no THIRD path exists (a source scan
over `src/**` with three named, inert exemptions).
`external_request_config_native` builds a scratch external section in the test3
playground and covers hydration, the publication shaping, the whole-binding
refusal and the inert-caller-copy case — DB-independent, so it always runs.
`relation_corpus_config` now carries `api_config` and the per-ddo
`fields_map`/`lang` in its compared projection (18 corpus rows).
`request_config_differential` gains the rsc368 external-item case, reported as
an explicit SKIP where the suite DB has no `zenon` ontology.

**No parity fixture was edited.** The full frozen replay was run before and
after with an identical failure set (211, all pre-existing DB drift), including
the seven harvested contexts that echo an external section's properties.
**Re-harvest: NO — impossible by definition.**
