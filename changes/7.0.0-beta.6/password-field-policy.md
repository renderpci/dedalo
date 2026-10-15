---
title: The password field shows its requirements and says clearly whether a password was saved.
type: changed
audience: user
date: 2026-09-30
wc: WC-2026-09-30-password-policy-enforced
---
Before, the password field of a user record was an opaque box: a rejected password
only turned the border red, without saying why, and nothing confirmed a successful
change. Now the field lists the password requirements and ticks each one as you
type, asks you to repeat the new password, and saves only when you press **Save**
(or Enter) — then says *Password saved*, or why it was not saved. A password typed
but not saved is marked as such, and leaving the record or closing the tab asks
before discarding it — as it now does for any change the automatic save could
not store, which was previously dropped without a word.

The same requirements now apply everywhere a password is set — this field, the
login screen's password recovery and the installer's root password — and the server
enforces them too: at least 8 (and at most 64) characters, with a lowercase letter,
an uppercase letter and a number, no `&`, no common words such as "password", and no
runs like `abcd` or `1234`. Existing passwords keep working; the rules apply when a
password is changed. A program that sets passwords through the API receives a
`validation.password_policy` error naming the first rule the password breaks.
