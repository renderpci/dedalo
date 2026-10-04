---
title: A slow server shows one quiet progress bar instead of a pile of warning bubbles.
type: changed
audience: user
date: 2026-10-01
---
Before, every request that took more than about 2.5 seconds raised its own
yellow "Awaiting for busy server" bubble. A page that loads several things at
once stacked several identical bubbles, and they stayed on screen after the
answer had already arrived. Now a slow answer shows a thin moving bar along the
top of the window after 1.5 seconds, adds one short sentence ("The server is
taking longer than usual…") only after 8 seconds, and disappears as soon as the
last answer arrives. Background calls never trigger it, and neither do long
operations that show their own progress (backups, rebuilds, updates). Identical notices in the
notification corner now merge into one, with a ×N count. See
[the slow-server cue](./core/client/data_manager.md#the-slow-server-cue).
