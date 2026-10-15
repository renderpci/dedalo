---
title: A tch install no longer asks for crm, a local image build reports its real version, and a production instance keeps its backups in one place.
type: fixed
audience: admin
date: 2026-10-13
---
- **No false "install it too" warnings after the ontology import.** References from an ontology's external-ontology mapping (`tch` maps itself to CIDOC CRM, `crm`) are no longer reported: only the RDF import reads that mapping. References into a thesaurus that the same install creates (for example `dc`), and references from a branch that no tree reaches, are not reported either. A warning that remains now says that the nodes using the missing ontology do not work until it is installed, and to add it only if you use them.
- **A local image build reports the version it is tagged with.** The Docker and Trial routes build from the checkout's last commit (`git archive`), as the production route installs it. `/health` and the page footer show `7.0.0` and the commit date, not `7.0.0.dev`. Changes you have not committed are not in the image.
- **One backup directory per production instance.** The installer writes `DEDALO_BACKUP_DIR=<backup dir>/db` to the instance's `.env`, the directory the backup units write. The server's own backups and its directory check use it too, instead of a second `<dir>/private/backups/db`. Install by hand: pass `--backup-dir "$BACKUP_DIR"` to the engine step.
- **Install by hand, Apache:** the name guard now escapes the dots of the address, as the installer does (`@@SERVER_NAME_RE@@`).
- **Docs:** the socket health checks in Upgrading and Migrating from v6 use `sudo`, because the socket directory is the service group's. The Docker page says that `SERVER_TCP_PORT` listens on the container's loopback unless `SERVER_TCP_HOST` is set.
- **Tests:** the suite declares its own languages (the same as CI) instead of the ones in your `.env`, so a fresh install that declares two languages no longer turns about 25 language gates red.
