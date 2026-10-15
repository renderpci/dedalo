---
title: Local ontology overrides now apply to the node they point at, and change only what they state.
type: fixed
audience: admin
date: 2026-10-01
breaking: false
wc: WC-2026-10-01-ontology-overwrite-scoped
---
A record in the local ontology (`localontology0`) overrides a shared node through
its **Overwrite** field. Before, any link in the record counted as an override (so
its parent was overridden too), and re-parsing the node could move it to the
`localontology` namespace, erase its other translations, drop its layout CSS and
make it translatable. Now only the Overwrite field links an override; the node's
TLD, translatable flag, order and model flag stay as shared; the term merges per
language, and each property the override fills (CSS included) replaces the shared
one whole while the others are kept — set a property to `null` to remove it. Local
records are no longer parsed as nodes of their own. See
[Overriding shared ontology nodes](./core/ontology/local_ontology_overrides.md).
