# WC-038 — `ip_api` removed from page_globals: IP→country resolution is server-side/offline

- **Date:** 2026-07-17 (task: "section Activity dd542 GeoIP — free, open, reliable").
- **Context:** the IP list view (`view_ip_list_input_text.js`) used to resolve a
  visitor's country by having EACH BROWSER fetch a third-party geolocation API
  described by `page_globals.ip_api` (`{url, href, country_code}`, populated from
  the PHP `IP_API` constant). That was free/open but unreliable — a single
  un-SLA'd third party, per-visitor, rate-limited, CORS/mixed-content-bound — and
  it 404'd on IPv6 loopback `::1` / the `local` sentinel (the IPv4-only client
  filter let them through).
- **Shape before (PHP oracle, frozen):** `page_globals` carries
  `ip_api: {url, href, country_code}`.
- **Shape after (TS):** `page_globals` OMITS `ip_api` entirely. Resolution moved
  server-side and OFFLINE to the native GeoIP subsystem (`src/core/geoip/`,
  DB-IP Country Lite CC-BY-4.0 loaded via mmdb-lib) behind the same-origin
  `dd_core_api::get_ip_country` action; the client no longer reads any geolocation
  descriptor. The `IP_API` config key is RECLASSIFIED DROPPED in `migration_map.ts`
  (superseded), replaced by `DEDALO_GEOIP_*`.
- **Why:** reliability + no runtime third-party dependency, while staying free and
  open. Same "the copied client no longer needs this key" posture as the TS-only
  page_globals divergences (WC-031).
- **Gate reconciliation:** `environment_differential` strips `ip_api` from the
  PHP-side `page_globals` copy before the exact key-set compare (asserting it was
  present PHP-side and is absent TS-side — the mirror of the WC-031
  `is_ontology_server` handling). Frozen fixtures are unchanged (they legitimately
  recorded the PHP value); no re-harvest. TS ground truth pinned in
  `test/unit/geoip_resolve.test.ts`.
