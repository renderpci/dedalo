---
title: Time-machine date search now filters
type: fixed
audience: user
date: 2026-07-17
wc: WC-036
---
The *When* (`dd547`)
search in Activity (`dd542`) sent a structured object that the builder had
been stringifying to `"[object Object]"` and dropping, so every date search
ran unfiltered; object-q is now normalized. Directional operators are
implemented for the special-table date path: each typed value defines a
precision-sized half-open period and the operator picks the boundary
(`>2026` → strictly after 2026), where the frozen engine left them all
falling through to a range equality.
