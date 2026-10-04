---
title: Reverting the same bulk run a second time no longer reports records as "not reverted" when nothing changed.
type: fixed
audience: user
date: 2026-09-29
breaking: false
wc: WC-2026-09-27-bulk-revert-undo-log
---
Reverting a bulk revert, or a run whose dataframe removal had emptied a record,
and then repeating that revert used to report some records as
*cascade_delete_not_reverted*, as if someone had edited them. It happened when
the record carried values the run itself had written, even though nothing had
changed. A repeat now reports them unchanged.

A value someone really did edit after the revert is still reported as before:
at the record, and also at the field when the edit touched the very value the
run wrote.
