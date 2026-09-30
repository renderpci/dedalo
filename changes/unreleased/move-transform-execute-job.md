---
title: A move_* data transform can be stopped, and only one runs at a time.
type: fixed
audience: admin
date: 2026-09-30
wc: WC-2026-09-30-move-transform-execute-job
---
Running a move transform for real (Move TLD, Move locator, Move to portal, Move to table, Move lang with `dry_run: false`) used to happen inside the web request. Nothing could stop it except restarting the server. It kept every record it had changed locked until the end of each definition file. If it was sent again it waited behind itself and then reported a failure while the first run carried on unseen. Now the transform runs as a background process that answers at once, reports its progress in the maintenance panel and has no time limit. Stopping it cancels the definition file it is working on and undoes that file completely; the files after it are reported as not run. A second transform started while one is running is refused ("Another move_* transform is running") instead of waiting. A dry run is unchanged: it still answers directly with its report. If a definition file fails at the moment its changes are being saved (a lost database connection, a server shutdown), the report now says what the database actually did with it: applied, undone, or, when that cannot be read back, an unknown outcome that stops the run and asks you to check the data before running that file again. Before, every failed file was reported as undone, and running a Move locator file again after it had in fact been applied moved its locators twice.
