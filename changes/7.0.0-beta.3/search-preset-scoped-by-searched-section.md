---
title: Search preset leaked fields from the wrong section
type: fixed
audience: user
date: 2026-07-21
---
The search panel
restores your in-progress filter from a per-user *temp editing preset*
(`dd655`) plus named presets (`dd623`). These were keyed by the search's
**caller** section (`self.section_tipo`) instead of the section actually being
**searched** (`self.target_section_tipo`, the same source the field list uses).
The two diverge whenever the searched section differs from the host section — an
ontology/thesaurus browser, or a relation/portal/autocomplete picker opened from
inside another section — so a filter built from one section's fields was stored
under a different section's key and later surfaced there (e.g. an `ontologytype0`
filter appearing in the Activity `dd542` search panel). Presets are now scoped by
the searched section (`client/dedalo/core/search/js/preset_scope.js`
`preset_scope_tipo`), and the section-key match is exact (`q_operator: '=='`) so
a tipo that is a substring of another can no longer bleed. Guarded by
`test/unit/search_preset_scope.test.ts`.
