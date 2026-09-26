---
title: A missing language list no longer disables language selection for the rest of the session.
type: fixed
audience: user
date: 2026-08-19
---
The list of languages is fetched once and kept for the whole
page. A failed fetch was kept in exactly the same way: the failure itself was
stored as if it were the list, every later request for languages was answered
with it, and nothing ever tried again. A map field would then fail outright
and the rich-text editor would silently load in the wrong language. Only a
usable list is kept now; anything else leaves nothing behind, so the next
request for languages asks the server again.
