---
title: Reverting any bulk process now restores every language, keeps later dataframe edits and never undoes a *Delete data*.
type: changed
audience: user
date: 2026-09-27
wc: WC-2026-09-27-csv-import-append-mode
---
This applies to every bulk-process record the Time Machine can revert — CSV
imports, *Propagate component data* runs and the other importers alike. A revert
now works **one language at a time**: it restores every language of a
translatable field the run changed, not only one of them, and never puts an older
value back into a language the run did not change. Older values stored without a
language are restored instead of emptying the field. A revert never brings back
values a *Delete data* wiped, older wipes included. A revert no longer overwrites
dataframe entries edited after the run: such a row is left unchanged, and the
revert tells the administrator how many rows it skipped and why
(`frames_changed_since_run`). *Delete data* on a record now writes one Time
Machine entry per stored language of each translatable field it empties, instead
of a single entry in the current data language, so each language's history shows
the wipe. See [Time Machine](./tools/using_time_machine.md).
