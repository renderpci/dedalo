---
title: Logging back in as another user no longer saves the previous user's pending edit.
type: security
audience: user
date: 2026-10-11
wc: WC-2026-10-11-session-user-beside-csrf-token
---
When a session expires while you are working, Dédalo shows a login box over the page so you can sign in again without losing your work. Before, if a *different* user signed in on that box, the edit that was waiting to be saved was sent anyway — under the new user's name, so the Time Machine and the "modified by" stamp named the wrong person. Now a pending save, or a page section waiting to load, is resumed only when the same user signs back in. If someone else signs in, nothing is sent: the page reloads, and until it does nothing can be saved, deleted, moved or uploaded from it — only signing in again is allowed. Your unsaved edit stays marked as unsaved. The decision of who signed in is made in one place only, and the login box just passes the answer on, so the check cannot be weakened by changing one copy of it.

The same now holds when the other user signs in somewhere else — in another tab or window of the same browser. Before, the next save from your page was quietly retried with the other user's session and recorded under their name. Now every answer from the server says whose session it is, your page keeps working only with your own session, and an answer from someone else's makes the page reload instead of sending anything. A lock you held on a field is no longer released on the other user's behalf when such a page closes, either.
