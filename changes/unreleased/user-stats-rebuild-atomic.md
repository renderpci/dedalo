---
title: Rebuilding a user's activity statistics can no longer lose them half-way.
type: fixed
audience: admin
date: 2026-10-01
---
"Rebuild user stats" (Database info) used to delete a user's daily statistics first and then recompute and save them day by day, each step on its own. A failure part-way — a database error, a server restart — left that user's statistics deleted or half rebuilt. Now the activity log is read first and the old statistics are replaced in one transaction: if the rebuild fails, the user's previous statistics are kept and the error names the user (and the users already rebuilt before it). A day whose statistics record could not be created is no longer skipped silently. The rebuild still recomputes only from the activity log that exists, so statistics older than the log are still lost when it succeeds.
