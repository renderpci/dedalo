---
title: The assistant no longer proposes changes its own apply step would refuse.
type: security
audience: admin
date: 2026-10-01
breaking: false
wc: WC-2026-10-01-change-plan-write-door
---
In write mode the assistant proposes a change plan that a person confirms before it runs. The check made before the plan was shown was weaker than the one made when it runs: some plans that named a record outside the user's projects, a field the user may not edit, or a read-only section were shown as valid and then failed when applied. Plans are now checked by the same permission rules that apply when they run, so what the person confirms is what the user is allowed to do.
