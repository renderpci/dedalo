---
title: Duplicating a record now files the history of a transliterable or IRI field in the language it was saved in.
type: fixed
audience: admin
date: 2026-09-30
wc: WC-2026-09-27-bulk-revert-undo-log
---
When a record was duplicated, a field that keeps per-language versions beside a base value (a transliterable field) or an IRI field got its history row in the language-neutral lane, next to an empty extra row, while a normal save of the same field files it in the working language. The Time Machine of the copy therefore listed the change under the wrong language. The copy's history now lands in the working language, exactly where a save puts it, and the empty extra row is gone. The rule that decides which language a history row belongs to is now one rule shared by every door that writes history.
