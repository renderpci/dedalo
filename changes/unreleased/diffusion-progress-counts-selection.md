---
title: Publication progress no longer runs past its estimate while a job is still working.
type: fixed
audience: admin
date: 2026-10-14
---
When a section links to other records of the same section (for example types
related to other types), the publication job counted those linked records as part of
the selection. The progress then passed its estimate ("Processing records 42206 of
42137…", "estimate exceeded") while the job was still running. Progress now counts
only the records you selected; linked records are still published as before.
