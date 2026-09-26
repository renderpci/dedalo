---
title: The diffusion documentation describes only the native engine.
type: changed
audience: developer
date: 2026-07-11
---
The legacy pre-rewrite + external-engine diffusion documentation was **removed**: the
TS server is a new version built from scratch, and its docs describe only the
native engine. Deleted pages: `diffusion/dd_diffusion_api_and_bun.md`,
`diffusion/engine_internals.md`, `diffusion/diffusion_config_properties.md`,
`diffusion/diffusion_multiple_databases.md`,
`api/diffusion_api_documentation.md` and the whole `api/diffusion/` directory
(`README.md`, `architecture.md`, `data_model.md`, `endpoints.md`).

[core/system/diffusion.md](./core/system/diffusion.md) rewritten as the lean
conceptual overview of native diffusion;
[diffusion/diffusion_markdown.md](./diffusion/diffusion_markdown.md) rewritten
for the native Markdown writer;
[diffusion/diffusion_data_flow.md](./diffusion/diffusion_data_flow.md)
cleansed of old-architecture wording and re-anchored to
[diffusion/native_engine.md](./diffusion/native_engine.md), now titled
*The diffusion engine* — the single technical reference.
