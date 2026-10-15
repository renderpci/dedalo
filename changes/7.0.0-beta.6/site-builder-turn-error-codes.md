---
title: A failed agent turn in the site builder now says what went wrong, in your language.
type: changed
audience: user
date: 2026-10-11
wc: WC-2026-10-11-site-builder-turn-error-frames
---
Before, when an agent turn of the site builder failed, the chat showed the site builder service's own internal sentence — sometimes a server path, a user id or a raw program error — in English whatever your language, and nothing said whether trying again could help. Now each failure has its own message: the turn ran out of time, it was stopped (by you, or because the service was shutting down), the server could not prepare it, the agent stopped with an error (its own output is shown apart, as the agent's), the session history could not be read, or one of the refusals the site builder already explains (the site is busy, the server cannot run the agent safely, …). The details an administrator needs stay in the site builder's log.

For API consumers: an error record of the `session_stream` event stream is now `{type:'error', error:{code, category, message, label_key, retryable}, agent_output?}`, and the stream's `event: error` frames carry the same error body — never free text. New codes: `site_builder.turn_timeout`, `site_builder.turn_interrupted`, `site_builder.turn_setup_failed`, `site_builder.agent_failed`, `site_builder.replay_failed`.
