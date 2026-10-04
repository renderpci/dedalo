---
title: The client-library version table in the manual is generated from the pins, so it can no longer go stale.
type: fixed
audience: developer
date: 2026-10-02
---
[Client library versions](./development/vendored_library_versions.md) listed
outdated versions for five npm-tracked libraries (three, geoman, turf,
highlight.js, mocha). Its npm table is now generated from `package.json` and the
client-library registry (`bun run libs:gen`) and checked byte for byte by a gate,
so a version bump that leaves the page behind fails the build. The vendored
table stays hand-written and is checked against `vendor/vendor_manifest.json`, as
before.
