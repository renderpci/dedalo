---
title: Native diffusion engine
type: added
audience: admin
date: 2026-07-11
---
The publication pipeline (publish, not just
delete/status) now runs natively in the TS work server: dd1190 →
`PublicationPlan` compiler, streaming resolver (recursive ddo-chain walk,
publication gate, linked-record frontier), the 33-fn parser registry
(23 runtime + 10 compile-absorbed), 5-rung language projection, format
writers for SQL/Socrata/CSV/JSON/Markdown/RDF/XML, a durable Postgres job
queue (`dedalo_ts_diffusion_jobs`) with spawned runner processes,
checkpointed crash-resume (byte-equivalent), and the complete
`dd_diffusion_api` client action set — the copied `tool_diffusion` client
works with zero edits. 228 tests across 16 suites; oracle spot-check against
old-engine-published rows. Documentation:
[diffusion/native_engine.md](./diffusion/native_engine.md); spec
`engineering/DIFFUSION_SPEC.md`.
