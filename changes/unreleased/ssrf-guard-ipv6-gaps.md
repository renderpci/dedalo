---
title: Outbound fetches now refuse every IPv6 route to an internal address.
type: security
audience: admin
date: 2026-09-29
breaking: true
---
When the server fetches a URL on a user's behalf (an RDF import, an external catalogue
lookup, a translation or transcription service, a harvest), it first checks that the
address is on the public internet, so a user cannot point it at your internal network or
at the cloud metadata endpoint. Until now several IPv6 forms passed that check although
they lead to an internal address: the NAT64 prefix `64:ff9b::/96` (on an IPv6-only host
this reaches `169.254.169.254`), 6to4 `2002::/16`, the IPv4-compatible and IPv4-translated
forms, the old site-local range, multicast, Teredo, and any address carrying a zone
(`%eth0`). The documentation ranges (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`,
`2001:db8::/32`) were also accepted.

Now all of them are refused. An IPv6 address is accepted only inside the global unicast
space. One that carries an IPv4 address through the IPv4-mapped form or NAT64 is judged by
that IPv4 address, so on an IPv6-only install public sites stay reachable. 6to4 and Teredo
are tunnels and are refused whole.

**Action needed on an IPv6-only server behind a NAT64 translator that uses its own
prefix** (a network-specific one, or one taken from the local-use block `64:ff9b:1::/48`
or a unique-local range): IPv4 sites are unreachable from it until you declare the
translator's prefix, exactly as it is configured, in the new setting
`DEDALO_NAT64_PREFIXES` (for example `2001:db8:64::/96` or `64:ff9b:1::/96`). Addresses
inside it are then judged by the IPv4 address they reach. The server also asks the network
for its NAT64 prefix on its own, but uses the answer only to refuse more, never to allow
more. Nothing to configure anywhere else.

With `DEDALO_TRANSCRIBER_ALLOW_PRIVATE_HOSTS` on, an on-premise transcription server may
still not sit on IPv4 link-local (`169.254.0.0/16`) or on another cloud's metadata address
(`100.100.100.200`, `192.0.0.192`, and the IPv6 metadata servers of AWS, `fd00:ec2::254`,
and Google Compute Engine, `fd20:ce::254`), in any spelling — through a local-use NAT64
address (`64:ff9b:1::/48`) included.

**Action needed if an address allowlist** (`DEDALO_INSTALL_ALLOWED_IPS`,
`DEDALO_ERROR_REPORT_ALLOWED_IPS`) **has an IPv4 part with a leading zero**
(`127.0.0.01`, `010.0.0.1`): such an entry is no longer read as a number and matches no
client, because some systems read it as octal — so the installer or the error report
refuses that client until you rewrite the entry without leading zeros. The install
allowlist line the server logs when it starts names such an entry as ignored. An entry now
matches its address in every spelling: `2001:db8:0::1` matches a client reported as
`2001:db8::1`, `127.0.0.1` (or the `loopback` token) matches `::ffff:7f00:1`, the form a
dual-stack listener may report, and a block written in the IPv4-mapped form
(`::ffff:10.0.0.0/104` or `::ffff:a00:0/104`) is the IPv4 block it spells (`10.0.0.0/8`).
