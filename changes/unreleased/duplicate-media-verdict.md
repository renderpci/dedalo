---
title: A duplicated record never points at the original record's image or document files.
type: fixed
audience: user
date: 2026-09-30
wc: WC-2026-09-30-media-key-locked-transform
---
Duplicating a record copies its image, audio, video and document files to the new record. If a copy failed, the new record could keep pointing at the ORIGINAL record's files, with no message anywhere — and deleting either record later moved files the other still showed. The duplicate is now saved with no file list of its own, the files are copied (into the record's named folder when the media field stores its files by a folder name taken from another field), and the new record's file list is then built from the files it really has. A copy that did not complete is reported to the administrator (the `duplicate_media_incomplete` counter and a `media.operation_failed` line in the server log); the duplicate itself is still created.
