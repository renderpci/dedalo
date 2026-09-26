---
title: Long text fields are embedded in full, not as their list preview.
type: fixed
audience: admin
date: 2026-07-22
---
Text-area values embedded through list-mode ddos were truncated to the
130-character list preview (a 2.1 MB transcription embedded as 154 chars).
Ddo `mode` in `rag.embed` maps is now honored verbatim when explicit and
defaults to full-value resolution for literals when absent.
