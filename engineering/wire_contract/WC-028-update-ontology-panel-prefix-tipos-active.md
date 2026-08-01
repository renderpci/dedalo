# WC-028 — `update_ontology` panel: `prefix_tipos` → `active_ontology_tlds`

- **Date:** 2026-07-11 (post-cutover; the first contract edit made with no live
  oracle to answer to — PHP is decommissioned dead code).
- **Why:** the key was a PHP inheritance that named the value wrongly. It is not
  a "prefix" of a "tipo": it is the set of ontology TOP-LEVEL DOMAINS active in
  this installation (`dd`, `rsc`, `oh`, …) — which is the vocabulary the rest of
  the codebase already speaks (`safeTld`, the `tld:` fields across
  `core/install/`, and `el.tld` in the client's own manifest filter).
- **Shape after (TS):** the `update_ontology` `get_value` panel envelope renames
  ONE key — `prefix_tipos` → `active_ontology_tlds` (`string[]`, still the
  configured TLDs unioned with the always-on `ontology`/`ontologytype` pair).
  Every other key in the WC-023 byte list (`servers`, `current_ontology`,
  `structure_from_server`, `body`, `confirm_text`) is unchanged. This SUPERSEDES
  the `prefix_tipos` name in WC-023's panel enumeration.
- **Config key (same rename, un-wired from PHP):** `DEDALO_PREFIX_TIPOS` →
  `ACTIVE_ONTOLOGY_TLDS` (`config.ontologyIo.activeOntologyTlds`). The rename is
  HARD — deliberately NOT added to `env.ts`'s `PHP_KEY_ALIASES` — so the retired
  spelling is enforced by a boot refusal (`RETIRED_ENV_KEYS` in `config.ts`):
  an `.env` still carrying the old key fails loudly instead of falling back to
  the `[]` default, which would silently shrink the update panel's manifest to
  `ontology`/`ontologytype` alone.
- **Client:** `client/` is TS-owned since the cutover, so both sides move in the
  same commit — `render_update_ontology.js` reads `value.active_ontology_tlds`,
  names its form input `active_ontology_tlds`, filters the master's manifest by
  it, and prints the config-grid row as `ACTIVE_ONTOLOGY_TLDS` (the key name is
  rendered verbatim to the operator, so a half-rename would have shown a key
  that no longer exists).
- **Gate:** `test/unit/active_ontology_tlds.test.ts` — the env key (comma-list +
  JSON-array forms), the retired-spelling boot refusal (loud, and NOT an alias),
  and the panel wire key (`active_ontology_tlds` present, `prefix_tipos` gone,
  core pair unioned without duplicates). No frozen parity fixture ever carried
  `prefix_tipos`, so the pinned oracle-harvest store is untouched by this edit.
