---
title: A publication job now says when it has moved on to the linked records.
type: changed
audience: admin
date: 2026-10-14
---
A publication job first publishes the records you selected, then every record they link
to (for coin types: their coins, mints, designs…). That second part can be most of
the work, but the progress used to stay at "100% (estimated)" the whole time, as if
the job were finished. Now the job's message says `Publishing linked records: 12345
(coins)...`. In Maintenance → Diffusion server control the bar switches to a moving
"Selection done · linked records: 12,345", and the Live activity band says how many
jobs are in that phase. The linked part has no estimate, so no percentage or time
remaining is shown for it.
