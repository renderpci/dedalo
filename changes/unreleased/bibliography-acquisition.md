---
title: A new tool imports journal articles from any OAI-PMH/OJS source directly into Publication records.
type: added
audience: user
date: 2026-10-07
---
Paste a journal's OAI-PMH URL (or a normal OJS article/journal URL) and the tool lists
every publication it found — title, authors, series, year and page range — so you can
narrow the list before committing. Kept publications become real records: the series
is found or created and linked, each author is found or created and linked by name,
the article's abstract is written in each language the source carries that your installation
uses (a variant in any other language, or a second one for a language already written, is left out
and named in the summary rather than stopping the import), and the PDF is
fetched and attached when the source links to one. A publication already imported
before is skipped rather than duplicated. For a journal that blocks automated
fetching, you can instead save its OAI-PMH response from your browser and upload the
file. An article whose metadata cannot be fetched is listed with the reason, and the rest are still
shown. A commit running in the background can be stopped partway through — everything
imported up to that point is kept, and the summary tells you how much of the batch
landed.
