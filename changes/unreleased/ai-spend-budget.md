---
title: Every AI request now counts against a daily budget per user, and generated answers need their own permission.
type: security
audience: admin
date: 2026-10-01
breaking: true
wc: WC-2026-10-01-ai-spend-budget
---
Until now any logged-in user could run the assistant, ask for generated answers and run semantic searches without any limit, so one session could exhaust an installation's model budget (or its local GPU). Every request that calls a model is now checked against the user's daily budget before the model is called: assistant runs and model tokens, semantic-search queries, and vision calls of the identification tool. When a budget is used up the request is refused with a message saying when it resets (midnight UTC). Nobody is exempt, administrators and root included. The four budgets are `DEDALO_AI_USER_DAILY_RUNS` (50), `DEDALO_AI_USER_DAILY_TOKENS` (1000000), `DEDALO_AI_USER_DAILY_EMBED_QUERIES` (2000) and `DEDALO_AI_USER_DAILY_VISION` (50) — see [the configuration reference](./config/config.md). The day's usage of every user is listed in the new **AI usage** section under Administration.

**Action needed:** generated answers over the collection now require the **Generated answers** tool permission (`tool_rag`). Run *Register tools* after the update to add it, then grant it in the profile editor to the profiles that should use generated answers. Semantic search does not need it.
