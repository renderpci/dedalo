---
title: A request to a slow server can no longer wait forever.
type: fixed
audience: user
date: 2026-08-19
---
While a request is
in flight the page asks the server whether it is still alive, so that a slow
answer is not mistaken for a dead server. That check *removed* the request's
time limit instead of extending it: a server that answered the check and then
stopped responding left the page waiting indefinitely — the *awaiting for busy
server* notice dismissed itself, the panel stayed empty, and no error was ever
raised. A busy server now buys the request more time, and the notice stays
visible for as long as the wait it describes.

Long operations keep their own limit. The extra time is added to whatever is
left of the original allowance rather than replacing it, so a database
backup still gets its full hour.
