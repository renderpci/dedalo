---
title: A language field whose stored language is no longer a project language shows it again.
type: fixed
audience: user
date: 2026-10-02
wc: WC-2026-10-02-select-lang-missing-entry
---
When a record stores a language that was later removed from the project languages
(for example an "Original language" saved before the list changed), the edit form's
language picker showed no selection, as if the field were empty. The picker now lists
that language as an extra option marked with an asterisk ("French *") and keeps it
selected, also right after a save. The name is shown in the interface language, the
same as in list view.
