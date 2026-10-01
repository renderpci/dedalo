---
title: A publication run that crashes, is cancelled or meets another run now publishes exactly what it should — and large archives no longer exhaust memory.
type: fixed
audience: admin
date: 2026-09-30
wc: WC-2026-09-30-diffusion-run-ledger, WC-2026-09-30-diffusion-target-fence, WC-2026-09-30-diffusion-attach-scope, WC-2026-09-30-diffusion-zip-streamed
---
Four defects of the publication (diffusion) runs are closed:

- **Resume after a crash.** A run that was interrupted and resumed used to lose
  the records its primary records link to, and rebuilt the downloadable archive
  (`diffusion_md.zip`, the merged RDF/XML document and its zip) from only the
  part it did after the restart. Each run now keeps a ledger of what it has
  queued and published, committed with every batch: a resumed run publishes
  byte for byte what an uninterrupted run would, and its report still says
  *Partial success* for problems met before the crash. A run left by a version
  before this one restarts from the beginning. A **cancelled** run no longer
  rewrites the published archive from its partial work. A linked record that
  was unpublished while a run was stopped is not published again when the run
  is resumed: the run checks each linked record's publication state when it
  reaches it.
- **One writer per target.** Two runs, a record deletion and the maintenance
  repairs could write the same publication database or directory at the same
  moment, and a run whose job had been taken over could keep writing. Each
  target is now written by one batch at a time — a waiting run shows
  *Waiting for the publication target (busy)…* — and a record deleted while its
  batch waited is removed from the public site instead of published. A long
  step (adding a column to a large published table, a language sweep) keeps
  its hold on the target for as long as it runs, and a batch that takes longer
  than about 20 seconds no longer makes a healthy run look stopped (it used to
  be restarted, and could end *failed* after its retries). Deleting records while a run
  holds their target no longer waits: the unpublish is queued and retried.
  Deletions never hold each other up: two users deleting records published
  in the same database both have them removed from the public site at once.
  `DB_POOL_MAX` must be at least 2 for a publication run to start. The
  media-file allowlist is covered too: *Rebuild media index* and the startup
  repair wait for a run that is publishing, so the media of a record that was
  just published no longer disappears from the public site until the next
  repair.
- **Another user's publication.** Pressing *Publish* on an element and section
  another user is already publishing used to show you that user's run as if it
  were yours. You now get a clear "the publication target is busy" message;
  pressing *Publish* again on your own running request still reconnects to it.
- **Archives in bounded memory.** Zip archives and merged documents are now
  built from disk one file at a time, with unchanged bytes, instead of loading
  the whole publication into memory at the last step. Two files with the same
  name in one archive are refused instead of one silently replacing the other.
  A file removed while its archive or merged document is being built (a
  record unpublished at that moment) is left out and named in the run's
  report, instead of the whole run failing — including when every file of a
  Markdown run is gone, which now just produces no archive. A file removed
  after the archive started reading it is archived whole.
