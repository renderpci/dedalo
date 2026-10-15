---
title: Installer re-checks, interrupts and messages say things once and at the right moment.
type: fixed
audience: admin
date: 2026-10-14
---
A check made stale by a later answer (the Identity check, once the web server is chosen) runs again right after that step, not at the end. `back` from a failed System check and forward again runs it again, its rows printed once. Ctrl-C during the engine step prints one interruption block. The System check's ok rows say their result once (`ok  Bun  runtime 1.4.3`), the short Docker and Trial check stays visible on the next screen, a typed `quit` in line mode prints the closing line, an unknown word at a failed check gets a plain sentence, the Review's local-build line says how long the build takes, and the Trial's Review points at the Trial page's firewall warning.
