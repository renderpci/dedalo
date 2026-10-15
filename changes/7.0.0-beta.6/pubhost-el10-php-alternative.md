---
title: "The guided install of a publication host now gives a working command for the newer AppStream runtime of the v1 API on RHEL, Rocky and Alma 10."
type: fixed
audience: admin
date: 2026-10-09
---
On EL 10 the guided install said that no `dnf` command installs a version of the v1 API's
runtime other than 8.3 as the system one, and offered Remi only. RHEL 10.2 ships 8.4 in AppStream
as alternative packages with the same files as the default ones. When the declared version is not
installed, `host.fpm_install` now prints the `dnf install` line for those 8.4 packages (the
FastCGI server and the command-line interpreter). When an older system version is already
installed, the command has `--allowerasing`, and the item says that every pool of the system
FastCGI server then runs the new version. Remi and the default 8.3 are still offered. The guided
install has now been tested on RHEL 10.2 with SELinux enforcing, as well as RHEL 9.8. See
[Publication host agent](./install/publication_host.md).
