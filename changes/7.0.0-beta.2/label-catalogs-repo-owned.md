---
title: Program strings are now repo-owned label catalogs
type: changed
audience: developer
date: 2026-07-16
wc: WC-033
---
The
application's buttons, menus, dialogs and error text are served by
committed files (`src/core/labels/master.json` = the complete key set with
source strings; `src/core/labels/catalog/lg-<code>.json` = per-language
translations) merged into the `get_label` dictionary by
`src/core/labels/catalog.ts`. Labels ride **code** deploys, not ontology
updates: a key ships in the same commit as the code that references it. The
served dictionary always carries the full master key set (previously a lang
file missing a key served `undefined`). The prior model — `dd_ontology`
`model='label'` (`dd383`) rows rebuilt into generated JS lang files — is
retired: those rows are inert and the generated lang files are deleted. New
invariant gate: `labels_tripwire`. See
[Internationalization → Program strings](./development/internationalization.md#2b-program-strings-the-repo-label-catalogs-get_label).
