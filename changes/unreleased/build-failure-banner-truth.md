---
title: A section that fails to load says why, and can be reloaded
type: fixed
audience: user
date: 2026-09-28
---

When a section or thesaurus element could not be loaded, the red banner always
suggested a permissions problem, even when the real cause was a failed request
(server restarting, timeout, network). The banner now shows the actual error,
keeps the permissions hint only when the server answered with nothing to show,
and offers a Reload button for temporary failures that rebuilds just that
element.

It also no longer appears after logging back in: when a session expired and the
user re-logged, the page loaded but the "permissions" banner was painted over
it anyway. The request is now re-sent once after re-login and the page builds
normally.
