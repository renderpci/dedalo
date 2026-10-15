---
title: "When `provision apply` is refused and you answer `manual`, the guided install no longer goes on with the steps that need it."
type: fixed
audience: admin
date: 2026-10-09
---
Answering `manual` to a refused `provision.apply` (for example a copy media root whose parent
directory does not exist) let init run the steps that depend on it, which then failed (the API
configuration with *ENOENT*, exit 4, "a change failed"). Those steps are now left out, listed under
*still to do* with what they wait for, and init ends with exit 3 naming them: fix the refusal, then
run init again.
