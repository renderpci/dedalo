---
title: "The guided install of a publication host now gives a working command for a newer AppStream PHP on RHEL, Rocky and Alma 10."
type: fixed
audience: admin
date: 2026-10-09
---
On EL 10 the guided install said that no `dnf` command installs a PHP version other than 8.3 as
the system PHP, and offered Remi only. RHEL 10.2 ships PHP 8.4 in AppStream as an alternative
package, `php8.4-fpm`, with the same files as `php-fpm`. When the declared PHP is not installed,
`host.fpm_install` now prints `dnf install php8.4-fpm php8.4-cli`. When an older system PHP is
already installed, the command has `--allowerasing`, and the item says that every pool in
`/etc/php-fpm.d` then runs the new version. Remi and the default 8.3 are still offered. The
guided install has now been tested on RHEL 10.2 with SELinux enforcing, as well as RHEL 9.8. See
[Publication host agent](./install/publication_host.md).
