---
title: Transcription actions check the audiovisual component and the user's projects before they touch a recording.
type: security
audience: admin
date: 2026-09-30
wc: WC-2026-09-30-transcription-record-tipo
---
Building the audio file for transcription, sending a recording to the transcription server, checking its status and building subtitles checked only the section's permission, and two of them skipped the check when a field was missing from the request. They now check the section, the audiovisual component (or the transcription field they write) and the record's project first, before anything is read, sent or written; every transcription path asks the same thing of the recording — permission to consult it — and write access only to the transcription field it fills, so a transcriber gets the same answer whichever engine they choose, and a user with no access to the recording gets none of them. A transcription that finishes after the user lost access to the record, or after their account was deactivated or deleted, is no longer saved. Checking a server transcription's progress now reaches only the checking user's own job on that recording, and answers its progress alone: it no longer accepts a guessed job number, and it never returns the finished text, which the server saves into the record itself.
