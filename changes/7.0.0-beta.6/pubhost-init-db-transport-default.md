---
title: The guided publication-host install now proposes the v1 database connection it finds on the host.
type: changed
audience: admin
date: 2026-10-09
---
`provision init` asks how the v1 Publication API reaches MariaDB: through its unix socket or over TCP. Until now the proposed answer was always the socket, even on a host without a local MariaDB. Init now looks for a local MariaDB socket (`/run/mysqld/mysqld.sock` on Debian and Ubuntu, `/var/lib/mysql/mysql.sock` on RHEL, Rocky and Alma). It proposes that socket when one exists, and otherwise TCP to `127.0.0.1:3306`, saying whether anything listens there. The question is still yours to answer. For TCP the proposed host is `127.0.0.1`, never `localhost`, because v1's database driver reads `localhost` as "use the socket" whatever the port. See [Publication host agent](./install/publication_host.md#the-three-lists).
