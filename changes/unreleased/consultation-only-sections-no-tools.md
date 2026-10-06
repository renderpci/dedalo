---
title: Activity and Time-machine sections no longer offer a section toolbar
type: removed
audience: user
date: 2026-10-06
wc: WC-2026-10-06-consultation-only-no-section-tools
---

The **Activity** and **Time machine** sections are read-only system logs: every
record is written by the engine and never edited by hand. They nevertheless used
to show a section toolbar (export, import, print, update cache, …) whose buttons
all act on records the engine refuses to modify.

Both sections now ship an empty section toolbar, so the dead buttons are gone.
The **Time machine** list also stops showing the collapse/expand buttons toggle
that Activity had already dropped — the two now render the same search-only
toolbar. Components *inside* these sections (for example the time-machine button
on a historical value) are unaffected.
