---
title: The full-screen installer's closing lines start on a clean line, and the manual removal list covers Bun and a gpasswd after an abort.
type: fixed
audience: admin
date: 2026-10-14
---
When the full-screen installer ends (done, failed or interrupted), the closing `✔` or `✖` lines now start at column 0 and nothing of the screen is left beside or under them, also on terminals that do not support the alternate screen (`screen` without altscreen, a serial console, a session recording). The manual list for removing an instance ([Removing an instance](install/multi_instance.md#removing-an-instance)) now removes the instance's Bun runtime under `/opt/dedalo/bun/<pin>/` when no other instance uses that pin, and says that `gpasswd` exiting 3 after an `--abort` is harmless.
