---
title: Stored password hashes are no longer sent to the browser.
type: security
audience: admin
date: 2026-09-30
wc: WC-2026-09-30-password-hash-never-served
---
Until now, anyone able to open a user record received the stored password hash
of that account (and, for accounts not yet migrated from v6, the reversible
legacy value) — material an attacker could try to crack offline. Every screen
and API answer now shows a fixed mask (`****************`) instead: it says only
that a password is set. Logins, password changes and imports are unaffected.
