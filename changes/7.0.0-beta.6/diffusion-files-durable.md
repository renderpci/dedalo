---
title: Published files survive a power cut, and deleting a record no longer races a running publication into the same directory.
type: fixed
audience: admin
date: 2026-10-01
wc: WC-2026-09-30-diffusion-run-ledger, WC-2026-09-30-diffusion-target-fence
---
Two gaps in file publications (Markdown, XML, RDF, CSV, JSON) are closed:

- **A power cut no longer leaves a "completed" run with broken files.** A run
  recorded each batch, and finally its *completed* state, in the database
  while the files it had written could still be only in the operating
  system's memory. A power cut (or a kernel crash) could then leave empty or
  missing record files, a deleted record's file back in place, or a truncated
  CSV/JSON export — behind a job that said *completed* and could no longer be
  resumed. Every file, archive and merged document is now forced to disk, and
  its directory with it, before the run records it.
- **Deleting a record waits its turn on file targets too.** When a record is
  deleted, its published file is removed under the same per-target hold the
  publication runs use. It could otherwise be removed just before a running
  batch wrote it again (the deleted record reappeared on the public site), or
  while a run was building its archive. If a run is writing that directory at
  the moment of the deletion, the removal stays pending and the retry queue
  completes it, as it already did for publication databases.
