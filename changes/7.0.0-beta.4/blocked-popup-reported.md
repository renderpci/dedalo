---
title: A blocked pop-up now says so instead of breaking the action that opened it.
type: fixed
audience: user
date: 2026-08-19
---
Opening a tool, a record, an ontology page or a related-records list in
a new window failed silently when the browser refused the pop-up: no window
appeared and the action behind it stopped half way, with nothing on screen to
explain why. The refusal is now reported to the user, and *open related
records* no longer claims success for a list nobody saw.
