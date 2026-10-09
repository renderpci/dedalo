---
title: "Publication API v1 releases install on a publication host with fapolicyd's `allow_filesystem_mark = 1`."
type: fixed
audience: admin
date: 2026-10-09
---
The agent checks the syntax of every v1 file before a release goes live. It did so on a copy
fapolicyd did not trust yet, so with `allow_filesystem_mark = 1` every v1 release was refused
(*Could not open input file*). The check now reads the release in its final place, after fapolicyd
trusts it; a release that fails it is removed and the previous one keeps serving.
