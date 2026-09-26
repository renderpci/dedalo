---
title: IP→country resolution moved server-side and offline
type: changed
audience: admin
date: 2026-07-17
wc: WC-038
---
The
`ip_api` descriptor is removed from `page_globals`; the client no longer has
each browser fetch a third-party geolocation service. Resolution is now the
native GeoIP subsystem (`src/core/geoip/`, DB-IP Country Lite) behind the
same-origin `get_ip_country` action. Config keys: `DEDALO_GEOIP_*` (the old
`IP_API` key is dropped).
