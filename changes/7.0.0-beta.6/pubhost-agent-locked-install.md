---
title: Preparing the publication host agent now installs exactly the locked dependency versions, and only the ones it runs with.
type: changed
audience: admin
date: 2026-10-07
---
`bun run hostagent:install` now runs a frozen, production-only install: it uses the committed lock file exactly, stops if the lock and the package list disagree, and leaves out the development tools, so they no longer reach the publication server, and `provision check` refuses an agent copy whose `node_modules/` holds one. Contributors who run the agent's test suite prepare the tree with `bun run hostagent:install:dev` instead. See [Publication host agent](./install/publication_host.md#1-prepare-the-code).
