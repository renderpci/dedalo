# GeoIP test fixture — MaxMind's official test database

Third-party TEST DATA, not code. Loaded only by `test/unit/geoip_resolve.test.ts`
through the `loadReader(path)` seam, never through `config.geoip.dir` (the
installation's downloaded DB-IP database). Nothing under `src/`, `client/` or
`tools/` may load it, and the image build context excludes `test/`.

| Field | Value |
|---|---|
| File | `GeoLite2-City-Test.mmdb` (21088 bytes) |
| Upstream | https://github.com/maxmind/MaxMind-DB — `test-data/GeoLite2-City-Test.mmdb` |
| Commit | `276926d23b4109ca5452709bfb5931c338afb34c` (2026-09-28) |
| Metadata | `database_type` GeoLite2-City, `build_epoch` 1770245369 (2026-02-04T22:49:29Z), description "GeoLite2 City Test Database (fake GeoIP2 data, for example purposes only)" |
| sha256 | `f936702b51dcb6c94b286d77a6f182c31a1601baf4b27e8e896934deb41f49f2` |
| Taken | 2026-10-03, byte-identical from a clone at that commit |
| Licence | MIT (`LICENSE-MIT`), chosen from upstream's Apache-2.0 OR MIT grant; both texts ship |

## Licence

The upstream README states: "This software is Copyright (c) 2013 - 2026 by
MaxMind, Inc. This is free software, licensed under the Apache License, Version
2.0 or the MIT License, at your option." `test-data/` carries no separate terms,
so the file is covered by that grant and redistribution is permitted.
`LICENSE-MIT` and `LICENSE-APACHE` are that commit's repository licence files.

## Why not `vendor/`

`vendor/vendor_manifest.json` is the census of third-party trees that SHIP (the
client-lib registry serves them; `scripts/lib/third_party_census.ts` scans only
shipping trees and a manifest root it cannot see is red). This file ships
nowhere, so its pins live in the consuming gate instead: it asserts the sha256
above, the metadata above, and that `LICENSE-MIT` is present and reads as MIT.
A bump replaces the file, this table and the gate's constants together.

## Known addresses (upstream `source-data/GeoLite2-City-Test.json`)

| Address | Country | City |
|---|---|---|
| `81.2.69.142` | GB | London |
| `89.160.20.128` | SE | Linköping |
| `216.160.83.56` | US | Milton |
| `2001:218::` | JP | — |
| `8.8.8.8` | not in the database | — |
