---
title: A generic *Stop* wire for background jobs
type: added
audience: developer
date: 2026-07-23
wc: WC-043
---
`dd_utils_api::stop_process` is registered (the copied client's Stop button
always posted it but no handler existed), owner-gated and job-scoped; the
abort reaches handlers as a per-job `AbortSignal`, and `update_cache` checks
it per record and returns a partial summary.
