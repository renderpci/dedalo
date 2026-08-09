# WC-2026-08-09-media-restore-no-overwrite — restoring a deleted record's media never clobbers a live file

- **Date:** 2026-08-09, adopted with the M6-lifecycle wave of the
  `audits/2026-08_oh1_beta` remediation (§5.2 (a), delete/restore).
- **Decision:** no DEC- reference. It follows the No-hard-delete law's posture:
  a lifecycle pass may move bytes around, never make bytes unrecoverable.

## Shape before (PHP)

`section_record::restore_deleted_section_media_files()`
(class.section_record.php:2339) fans out to
`component_media_common::restore_component_media_files()`
(class.component_media_common.php:3488), which for each quality takes the newest
entry of `glob("<id>_*.<ext>")` in `deleted/` (natsort + `end()`) and moves it
back with a bare

```php
rename($last_file_path, $new_file_path);
```

`rename()` on POSIX REPLACES an existing destination silently. So a restore run
against a record whose media had already been re-uploaded destroyed the newer
file, with no log line, no backup, and no trace of what the file had been.

## Shape after (TS)

`src/core/media/file_ops.ts restoreDeletedSectionMediaFiles` is otherwise a
faithful port — same census (every managed quality × extension PLUS the AV
posterframe), same newest-wins selection, same "a quality with nothing in
`deleted/` is skipped" tolerance — with one rule added:

> a quality whose LIVE path already holds a file is left alone: nothing is
> moved, the deleted version stays in `deleted/`, and the path is simply absent
> from the outcome's `files`.

`SectionMediaFilesOutcome.files` therefore lists what was actually restored, and
a caller (tool_time_machine's section restore) can see that a file was not.

## Reason

The restore runs AFTER the record's data is back, which means an operator may
already have re-uploaded the missing image or audio — that is the ordinary
recovery workflow, not an edge case. Between the two possible mistakes:

- refusing to restore over a live file: the pre-delete version stays in
  `deleted/`, recoverable by hand forever;
- overwriting: the newer file is gone, and NOTHING can bring it back — the
  upload was the only copy, and the engine has just replaced it with an older
  one that looks equally legitimate.

only the second is unrecoverable, and an archive's whole reason for the
No-hard-delete law is that unrecoverable is the one outcome it does not accept.
The asymmetry decides it.

No API response changes shape: this is filesystem behaviour, reported through
the outcome object of a function PHP's caller ignored entirely.

## Gate reconciliation

No re-harvest, and no parity gate is affected — the oracle harvest contains no
restore, because PHP's live delete crashes mid-flight and never reaches a
recoverable state (see `test/unit/delete_inverse_refs_native.test.ts`'s header).

Gated by `test/unit/media_lifecycle_native.test.ts`, case *"restore NEVER
overwrites a live file"*: a live file plus a deleted version in the same tier
yields `files: []`, the live bytes intact, and the deleted version still on disk.
