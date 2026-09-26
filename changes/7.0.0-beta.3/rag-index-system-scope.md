---
title: Semantic indexing no longer depends on who saved the record.
type: changed
audience: developer
date: 2026-07-22
---
Index-time resolution always runs under a system scope with explicit data
languages — a record's vectors never depend on which user's save triggered
the re-index (guarded by `rag_index_scope_tripwire`).
