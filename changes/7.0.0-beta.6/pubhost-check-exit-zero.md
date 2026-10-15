---
title: "`provision check` no longer reads as an error when it lists the changes to make."
type: changed
audience: admin
date: 2026-10-07
---
A first `provision check` on a new publication host lists the changes `apply` will make. It
used to exit with code 1, so `bun run` printed *error: script "provision" exited with code 1*
under a perfectly normal report. It now exits 0 and ends with *run 'apply' to make them*.
Scripts that need to know whether changes are pending pass `--exit-code`, which keeps the old
code 1. Refusals (3) and failures (4) are unchanged. See
[Publication host agent](./install/publication_host.md#4-provision).
