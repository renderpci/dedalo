---
title: Regenerating the media cache no longer undoes an upload made while it runs.
type: fixed
audience: admin
date: 2026-09-30
wc: WC-2026-09-30-media-key-locked-transform
---
The "Update cache" tool (media components) and the media files repair (`scripts/media_repair_files_info.ts`, and the `files_info` entry of the reconcile tools) rebuild files and then record which files a record has. They used to record that from what they had read at the start, so a file a curator uploaded to the same record while they ran — and its original file name — was silently undone. They now record it from the record as it stands at that moment, so the curator's upload is kept. "Update cache" also reports records deleted while it ran (and rows that stayed locked) instead of counting them as regenerated. The repair now also fixes a record whose media list names another record's files (what a failed duplicate could leave), and reports records it could not write instead of counting them as repaired. It judges each media item on its own: an item whose files are not on this server keeps its record of them (unless you allow shrinking), even when another item of the same field is repaired, and a file named some other way (for example by an image id) is never mistaken for another record's. Both tools now give up on a record another user is holding after a few seconds, report it, and go on with the next one, instead of waiting indefinitely.
