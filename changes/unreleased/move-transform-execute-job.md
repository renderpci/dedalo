---
title: A move_* data transform can be stopped, and only one runs at a time.
type: fixed
audience: admin
date: 2026-09-30
wc: WC-2026-09-30-move-transform-execute-job
---
Running a move transform for real (Move TLD, Move locator, Move to portal, Move to table, Move lang with `dry_run: false`) used to happen inside the web request. Nothing could stop it except restarting the server. It kept every record it had changed locked until the end of each definition file. If it was sent again it waited behind itself and then reported a failure while the first run carried on unseen. Now the transform runs as a background process that answers at once, reports its progress in the maintenance panel and has no time limit. Stopping it cancels the definition file it is working on and undoes that file completely; the files after it are reported as not run. A second transform started while one is running is refused ("Another move_* transform is running") instead of waiting. A dry run is unchanged: it still answers directly with its report.
