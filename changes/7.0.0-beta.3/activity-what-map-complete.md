---
title: The full 16-code activity WHAT map is emitted
type: added
audience: admin
date: 2026-07-23
wc: WC-040
---
Eight event
emitters were added (LOG IN / LOG OUT / NEW / UPLOAD COMPLETE / DELETE FILE /
RECOVER SECTION / RECOVER COMPONENT / NEW VERSION), so the `user_activity`
charts are no longer limited to the four previously-instrumented events.
Login failures are recorded too (throttle lockouts and maintenance refusals
included). Known gap, ledgered: the projects dimension (`relation.dd550`) is
not written by the engine, so activity filtered by project shows nothing from
the current era.
