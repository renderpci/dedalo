---
title: The terminal installer draws full-screen at a capable terminal, and can abort an interrupted install
type: added
audience: admin
date: 2026-10-12
---
Run at a terminal of at least 80×24, `bun run scripts/install.ts` now shows the
installer full-screen: a rail of the route's steps, filtered lists for the
ontologies, thesauri and languages, passwords drawn as dots with the root
password's rules checked as you type, checks shown in place, the Review with the
equivalent command line, the install's steps with their times, and a Done screen
that shows the generated salt once. The questions, defaults, rules and the
install are exactly the plain mode's; `--plain`, a small or `dumb` terminal, or a
machine without the terminal library's native build get the plain mode (one line
says why). Whatever way it ends, the terminal is restored. When an interrupted
install is found, both modes now offer **abort** next to resume and quit (the
database name typed back). See
[the full-screen installer](./install/installer_reference.md#the-full-screen-installer).
