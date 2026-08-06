# Adding an external record service

An external record service is a third party whose records Dédalo shows inside a
section: a bibliographic catalogue, an authority file, a gazetteer. Adding one
is **one file here, one line in `../registry.ts`, one row in the table below**.
No engine edit — `test/unit/external_registry_totality_tripwire.test.ts` fails
if that stops being true.

## Registered services

| Service | Payload shape | Id shape | Egress | Search | Credential key |
|---|---|---|---|---|---|
| `zenon` | `{records:[…]}`, flat keys | `numeric_string` (zero-padded, e.g. `001338683`) | `record_identifiers` | endpoint exists; engine side unported | `DEDALO_EXTERNAL_ZENON_API_KEY` |

## The checklist

1. **Write `services/<name>.ts`** exporting one `ExternalServiceModel`
   (`../descriptor_types.ts`). It is DATA plus pure functions: it must not open
   a socket, read config, or touch the database. Required fields:
   - `service` — the name, identical to the section's `api_config.entity` and to
     the `api_engine` a `request_config` declares.
   - `egress` — what leaves the institution on a RECORD request. No default:
     state it. `record_identifiers` still discloses *which records this install
     holds*.
   - `searchEgress` — what leaves on a SEARCH request. REQUIRED when you
     implement `buildSearchRequest`, FORBIDDEN when you do not, and never
     lighter than `query_terms`: a search sends free text a cataloguer typed,
     which the record class cannot be true of. `external_egress_tripwire`
     enforces all three.
   - `remoteIdShape` — `numeric_string` (digits, **significant leading zeros**)
     or `opaque_token`. The remote id IS the section_id, so the codec must round
     trip byte-for-byte. Never `Number()` an id.
   - `capabilities` — `{ordering, pagination, listColumns, search}`. A caller
     refuses loudly on a missing capability; it never silently degrades.
   - `buildRecordRequest` — the one required function.
   - `buildSearchRequest` + `unwrapSearch` — OPTIONAL, and only as a PAIR.
     Implement both to make the service searchable through
     `dd_external_api::search`; implement neither and the engine refuses by
     name (`ExternalSearchUnsupportedError`, reason `engine`) rather than
     answering an empty result. `buildSearchRequest` receives caller-driven
     `limit`/`offset` — refuse an offset your service cannot express, never
     round it. `unwrapSearch` returns `{rows, total}`, with `total` **null**
     when the service gives no count (never 0, never `rows.length`).
2. **Map the payload.** Everything below is optional because a DEFAULT already
   handles the general case (`../fields_map.ts`):
   - `unwrapRows` — default reads `api_config.response_map`'s `ar_records`
     (fallback `records`); a bare array payload is the row array.
   - `pickRow` — default matches `remoteIdPath` (default `'id'`) against the
     requested id. **Never** return a blind first element: a multi-hit answer
     that does not match is `not_found`.
   - `extract` — default resolves a dotted/indexed PATH, so a cataloguer can map
     `labels.en.value` or `items[0].body.value` with no code. A flat top-level
     key is that path's degenerate case.
   - `formats` — named renderers a `fields_map` entry references by `format`.
     Each returns `{text, kind}`; a `markup` kind goes through the strict
     server-side allowlist sanitiser.
3. **Credentials are KEY NAMES.** Set `credentialCatalogKey` to a catalog key
   with `scope:'secret'` (add it to `src/config/catalog/external.ts`), plus
   `credentialScheme` / `credentialParam`. A value never comes from the
   ontology, and the transport attaches it only after the host allowlist and the
   SSRF guard have accepted the target.
4. **Register it**: one line in `../registry.ts`.
5. **Allow the host**: `DEDALO_EXTERNAL_ALLOWED_HOSTS` in `../private/.env`.
   Empty means every outbound request is refused — the allowlist is the door,
   not a narrowing of an open one.
6. **Add a row to the table above**, and extend the census fixture
   (`test/fixtures/external/ontology_census.json`) if the installation's
   ontology gained nodes naming the new service.

## The worked second case

The design is checked against a service that looks nothing like Zenon — a
nested payload with opaque ids (Wikidata: `Q42`, `labels.en.value`). It needs:
`remoteIdShape:'opaque_token'`, `remoteIdPath:'id'`, a `fields_map` whose
`remote` values are paths, and nothing else. If a real second service ever needs
more than a file here plus a registry line, that is a defect in the design, not
a reason to edit this document.
