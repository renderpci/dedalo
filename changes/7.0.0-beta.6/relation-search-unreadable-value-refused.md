---
title: A relation search with an unreadable value now fails with an error instead of quietly matching every record.
type: fixed
audience: developer
date: 2026-09-23
wc: WC-2026-09-23-relation-q-is-a-locator
---
Relation fields (selects, portals,
autocompletes…) take their operator — *is empty*, *has a value*, *is
different* — in `q_operator`, and their value as a record link. When a
request put something else in the value, such as the operator itself
(`"q":"!*"`) or plain text, the condition was silently dropped, and the
search and its count covered the whole section: *records with no author*
counted every record. Such a request is now refused with a `request.invalid`
error that names `q_operator`. The searches the interface builds were never
affected.
