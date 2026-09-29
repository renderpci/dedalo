---
title: Outbound fetches now refuse every IPv6 route to an internal address.
type: security
audience: admin
date: 2026-09-29
---
When the server fetches a URL on a user's behalf (an RDF import, an external catalogue
lookup, a translation or transcription service), it first checks that the address is on the public internet, so
a user cannot point it at your internal network or at the cloud metadata endpoint. Until
now several IPv6 forms passed that check although they lead to an internal address: the
NAT64 prefix `64:ff9b::/96` (on an IPv6-only host this reaches `169.254.169.254`), 6to4
`2002::/16`, the IPv4-compatible and IPv4-translated forms, the old site-local range,
multicast and Teredo. The documentation ranges (`192.0.2.0/24`, `198.51.100.0/24`,
`203.0.113.0/24`, `2001:db8::/32`) were also accepted.

Now all of them are refused. An IPv6 address is accepted only inside the global unicast
space, and one that carries an IPv4 address (mapped, NAT64, 6to4) is judged by that
IPv4 address, so on an IPv6-only install public sites stay reachable through NAT64.
Nothing to configure.
