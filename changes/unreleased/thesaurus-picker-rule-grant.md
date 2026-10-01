---
title: The thesaurus term picker grants link mode only from a profile, never from a blanket rule.
type: security
audience: admin
date: 2026-10-01
breaking: false
---
The term picker opens a thesaurus in link mode only for a user who may edit the field that asked for it. That edit right was read without asking where it came from, so a field under the editing-preset section — which every user may edit through a built-in rule, bounded only to their own presets — counted as a link-mode grant for every user. Link mode now requires edit permission granted by the user's profile (or the root account); otherwise the thesaurus opens in ordinary browse mode.
