# WC-2026-08-05-external-request-field-union — the remote request asks for the fields the MAP asked for, batched per page

- **Date:** 2026-08-05 (with WC-2026-08-05-multi-engine-ddo-expansion).
- **Decision:** — (DEC-12 gate:
  `test/unit/external_multi_source_native.test.ts`, the batching describe).

## 1. Which fields are requested — the divergence

v6 built the `&field[]=` list from **every `component_external` descendant of
the section**
(`class.component_external.php` → `load_data_from_remote`, over the section's
whole element list). TS builds it from the union of `fields_map[].remote` over
**the ddos actually in the map** for that target section
(`relation_core.collectRemoteFields`).

### Why

v6's rule has two defects and no benefit:

1. it asks the service for fields nobody rendered — needless egress, and the id
   set plus field set is itself a disclosure of what this institution holds;
2. it couples the request — and therefore the row **cache key**, which includes
   the sorted field signature — to unrelated ontology edits. Adding a
   `component_external` anywhere in the section invalidated every cached row and
   changed every outbound URL, for a component that may never be shown.

### Effect on the wire

The outbound URL differs from v6's whenever a section holds a
`component_external` that the current map does not show. On `zenon1` the
`section_list` (`zenon8`) shows `zenon3,4,5,6` while the section also holds
`zenon9,10,11` — so a list read now asks for four fields where v6 asked for
seven. The RESPONSE the user sees is unchanged: the extra fields were fetched
and discarded.

## 2. Merging — no behavioural change, stated for the record

Targets naming the same record are merged and their field sets UNIONED before
anything is fetched (`fetchExternalRows`), so a portal row with four
`component_external` children issues ONE call asking for four fields. v6
coalesced too; this keeps it and makes the field union part of the contract
rather than an accident of call order.

## 3. Batching — the timing contract

The per-locator loop no longer fetches. Every external target of a page is
partitioned out before the emit loop and resolved in ONE
`fetchExternalRows` call, whose parallelism is capped at
`DEDALO_EXTERNAL_MAX_CONCURRENCY` at the transport door.

v6 fetched inside the loop, so an unreachable service cost N × the timeout in
series — a ten-locator page blocked for forty seconds and then rendered
nothing. The gate asserts both halves: the CALL COUNT (two components on one
record share one call) and wall clock under a deliberately slow stub.

The prefetch is an OPTIMISATION, never a precondition: a component whose row is
not parked falls back to fetching its own (coalesced and cached), so a direct
external-section read, a section_list cell, an indexation cell and
`resolve_data` all still render. And the prepass NEVER throws — a wiring error
in it must not cost the dedalo rows sharing the page.

## Gate reconciliation

`external_multi_source_native` (the batching describe) asserts the requested
field set is the UNION the page's maps asked for and that one page issues one
call per record; `external_cache_native` asserts the sorted field signature is
part of the row cache key, so a narrower fetch can never be served to a wider
caller.

**No parity fixture is affected**: no fixture in the frozen oracle-harvest
store carries an outbound external request or a `component_external` data item.
**Re-harvest: NO — impossible by definition.**
