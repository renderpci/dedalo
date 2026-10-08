---
title: "A publication host can now be installed with one guided command, `provision init`, on Debian, Ubuntu 24.04 and 26.04, and RHEL, Rocky or Alma 9 and 10 with SELinux; the Publication API v1 runs in a FastCGI pool of its own."
type: added
audience: admin
date: 2026-10-08
breaking: true
---
`sh …/publication/host_agent/deploy/install.sh <instance> --source <checkout> --draft <file>`
looks at the publication host, compares it with what the instance needs, prints what is
already right, what it will change (with the exact commands and diffs) and what needs your
decision, and changes nothing until you confirm. It creates the missing accounts, gives the
site's home to root, downloads and verifies the site's Bun against a hash table taken from
Bun's signed checksums, installs the agent's code, writes the declaration, provisions, adds two
lines to the site's virtual host (with a backup, a configuration test and an automatic roll
back), asks for the API database password on the terminal only, checks that the agent answers
and pairs it with the work system on one machine (on two machines it prints the pairing
commands to run on the work host). It never installs a package, never edits a
FastCGI pool of yours, never sets an SELinux boolean or edits one of your files without a typed
answer, and never runs on Ubuntu 22.04 (its polkit cannot read the agent's rules) or on RHEL,
Rocky or Alma 8 (systemd 239 and kernel 4.18 are below what the units and Bun need: `install.sh`
refuses EL 8 before it downloads Bun). Whoever can
write the source it is given can become root through it: give it only a checkout you trust.

On RHEL, Rocky and Alma with SELinux, `provision apply` now labels the instance's own paths and
the v2 port, and the guided install asks before widening any SELinux boolean. A shared media
directory is labelled for the web server only with your consent, kept in the declaration as
`media.selinux_label: true` (the guided install writes it when you answer `act`). A typed
secret (the database passwords, the v1 web user code) may not contain a space, `'`, `\` or `$`. The units need
systemd 247 or newer: `provision apply` refuses an older one.

The site's web server logs stay outside its home: in the home layout `provision apply` creates
`/var/log/apache2/<domain>/` (RHEL `/var/log/httpd/<domain>/`, nginx `/var/log/nginx/<domain>/`),
owned by root, and the rotation file `/etc/logrotate.d/dedalo_<instance>_web` (the distribution's
own rotation does not reach a directory per site); point the virtual host's logs there. On Ubuntu
26.04 a log under `/home` stops Apache from starting, and the guided install says so. The guided
install reads the sudo policy the installed `sudo` uses (`/etc/sudoers-rs` under sudo-rs, when it
exists), accepts a polkit that the system bus starts on demand, and asks for `e2fsprogs` when
`chattr` is missing.

The Publication API v1 now runs in its own FastCGI process pool, `dedalo_<instance>_v1`, under its own
account, which the provisioner writes when the declaration names the new `site` block, with
the site's web include beside it. A hand-run `provision apply` now waits for a running
`provision init` of the same instance, and `provision check` answers exit 5 (busy) instead of
drift while one runs.

**Action needed on an existing publication host:**

- create the host group every agent's service now runs with, once per host:
  `groupadd --system dedalo_pubhost`. Until then `provision apply` refuses and prints that line;
- a declaration whose `v1.user` is `www-data`, `apache`, `nginx`, `www` or `nobody` (the old
  page allowed the web server's user with the web server's own module) is now refused: create an account for v1
  alone, give it the v1 configuration file (`chown <account>`, `chmod 0400`), declare it and the
  `site` block, and run `apply`. See [Publication host agent](./install/publication_host.md#guided-install)
  and its manual steps 2, 3 and 9.
