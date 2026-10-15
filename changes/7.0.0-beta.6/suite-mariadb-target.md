---
title: The test suite now runs its diffusion gates against its own MariaDB server, never an installation's.
type: changed
audience: developer
date: 2026-09-30
---
Before, the gates that publish to MariaDB used whatever server the machine's
configuration named. On a developer machine they created and dropped tables in
a real publication database. On a machine without that server they skipped
silently and reported green.

Now `bun test` starts a MariaDB server of its own for each test lane, under
`../private/test_mariadb/<suite database>`. It listens on a private unix socket
and never on the network. The gates check a marker on that server before they
write, and they fail loudly rather than skip when it is missing. The gates
never write to an installation's databases. CI runs each of these gates on its
own and checks that the rows that gate is declared to write really changed on
the suite's server during its run. It also runs every other unit and parity test
that can reach the MariaDB connection code, directly or through other modules,
with the suite's server up. It fails if any of them connects to the server without
first passing the suite's check, or if any of them never really ran. These runs
come last in CI's database tier, after the parity tests, so they cannot change
the data the earlier stages measure. A check fails if they are ever moved
earlier. The tier stops the server when it exits. One gap remains until the engine
itself is fixed: while a lane's server is not running, a test that opens a
MariaDB connection without going through the suite's own check can still make a
login attempt against the machine's default MariaDB server. It cannot write
there, since the attempt uses the suite's own user.

Removing a lane's server is safe against a run that is still using it. The
lane's directory is either fully there, with its marker, or gone, both when it
is created and when it is removed. A test waiting to use a removed lane is told
so instead of carrying on. A removal that was killed halfway is finished by the
next one. A MariaDB command that hangs is killed after a deadline, so it cannot
block the lane for everyone else, and a test waiting for the lane waits long
enough to report the real problem instead of "lane busy". A server that does
not start in time is stopped, not left running. A server that answers with an
error is reported and never restarted. Stopping or sweeping a lane also stops
any stray MariaDB server or installer still running on that lane's data
directory, for example one left behind by a killed run, and waits until it has
really exited; if a process survives, the command fails and names it. The shard
runner (`bun run test:shard`, and its `bun run test:shard:sweep`) removes the
servers of its shard lanes too, and reports a lane it could not remove with the
real error, refusing to run or exiting with an error for it, instead of
claiming the lane was not the suite's.

What this means for you: running the full suite on a development machine now
needs the MariaDB server binaries (`mariadbd`, `mariadb-install-db` and
`mariadb`; on macOS, `brew install mariadb`). Without them the MariaDB gates
fail and name what is missing. Stop a lane's server with
`bun run scripts/ci/suite_mariadb.ts stop`. To remove it together with its data,
use `bun run scripts/ci/suite_mariadb.ts sweep`.
