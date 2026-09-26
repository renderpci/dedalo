---
title: Logging in no longer asks for the credentials twice.
type: fixed
audience: user
date: 2026-08-13
---
The login screen
rendered the login panel **twice** — the form itself, dimmed, with a second
one overlaid on top of it — so entering the user and password once appeared to
do nothing and the operator had to type them again.

The second panel was the **re-login overlay**, which exists to recover a
session that died under a working page. The activity tray mounts with the
page, and it mounted on the login screen too: its first act is to read the
caller's own background work, which for a caller who has not logged in yet
is correctly refused with `not_logged` — and any `not_logged` raised the
overlay. The tray now mounts only for a logged-in page and asks nothing
while anonymous, and the overlay refuses to open on a page that never had a
session: it is a *re*-login, never a second login. A session that expires
mid-use still gets the modal, which is the case it was built for.
