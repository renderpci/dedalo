---
title: A new publication host can be drafted, kitted and paired from the Publication hosts panel.
type: added
audience: admin
date: 2026-10-09
wc: WC-2026-10-09-publication-host-panel-setup
---
As the Dédalo root user, **Maintenance → Publication hosts → New publication host** now makes the draft for a new publication host: type the site's domain, choose one machine or two, and the panel proposes the instance, the accounts, the service and free ports, which you can change before saving. The draft is checked with the publication agent's own rules and against the other instances on the same machine, and a refusal names the field. For two machines the panel builds the install kit from the release the code updater verified, shows its sha256 and lets you download it; then, once the publication host is installed, you upload its sealed pairing package and type the passphrase there. The package must belong to that draft — its instance and the agent address inside it — and the agent must prove it live before anything is stored; the passphrase and the package are never kept. The command-line paths are unchanged. See [New publication host](./install/publication_host.md#new-publication-host).
