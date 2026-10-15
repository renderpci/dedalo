---
title: The maintenance *Unit test area* only offers the JS test runner and the test-table reset where they can work.
type: changed
audience: admin
date: 2026-10-01
wc: WC-2026-10-01-unit-test-widget-dev-gate
---
*Open JS unit test* is shown only on a development server (`DEDALO_DEV_MODE`) whose
dev dependencies are installed. A production install (the default Docker image, or
one kept current by the code updater) does not have the browser test libraries, so
the runner page used to open and fail with unreadable MIME-type errors; the panel now
says which libraries are missing instead. *Truncate test table and Create new empty
test record* is shown only on a development server, and the server refuses it
elsewhere (`maintenance.dev_mode_required`). *Run long process* stays available
everywhere.
