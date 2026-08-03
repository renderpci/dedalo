# Server-side observers

> See also: [Events](../events.md) (the client-side `event_manager`) · [SQO](../sqo.md) · [search](search.md) · [tm_record](tm_record.md) · [component_info](../components/component_info.md) · [component_info cookbook R6](../components/component_info_cookbook.md#r6--wire-observers-so-the-widget-recomputes-on-saves) · [component_portal](../components/component_portal.md) · [System hub](index.md)

Some component values are not typed by anyone — they are **derived**. A type
record's *Coins* portal lists every coin that points at it. A thesaurus term's
*Library* portal lists every publication that cites it. A `component_state`
turns a handful of check boxes into one "finished" flag.

Nothing recomputes those values when you edit the record they derive **from**,
because that record is somewhere else entirely. That is what this subsystem is
for: when a component saves, every component that declared an interest in it
**recomputes, server side, after the save commits** — whichever door the save
came through (an editor panel, a CSV import, an API tool, a duplicate).

This page is the configurator's and integrator's reference for that machinery.
Examples are real nodes on the `monedaiberica` install (`dedalo_mib_v7`) and are
labelled with their models; verify tipos against your own ontology before
copying anything.

## The model in one breath

An **observer** declares, in its own ontology node, which components it watches.
That declaration alone is the whole registration — the watched component is not
asked and does not need to know. On every save the engine looks up the watchers
of the saved component, works out **which records** each of them has to
recompute, runs **what** it computes, and then lets the watchers of *those*
components fire in turn — bounded, and never inside the caller's transaction.

| Module | Owns |
|---|---|
| `src/core/section/record/observer_subscriptions.ts` | Edge discovery: the ontology-wide subscription registry, host-section resolution, the contract validator. |
| `src/core/section/record/observers.ts` | Dispatch and the recompute laws: relay, `set_dato_external`, info recompute, the safety guards. |
| `src/core/section/record/observer_reconcile.ts` + `scripts/observer_reconcile.ts` | The operator sweep that heals mirrors left stale by bulk doors. |

Propagation is fired from the component-save chokepoint, so it is not
dispatch-only: imports, tools and record duplication propagate identically.

## Declaring an edge: `observe` is enough

An observer declares what it watches in its own `properties.observe`. Each entry
names one observed component and may carry two independent halves:

- `client` — drives the browser [event manager](../events.md): live UI
  reactivity inside the open tab.
- `server` — drives **this** subsystem: the recompute on save.

> **An edge dispatches if — and only if — the observer's `observe` entry carries
> a `server` object.** The observed component does not declare anything.

This is ordinary observer semantics: the subscriber registers itself. The
canonical single-declaration case, live on this install, is **oh28**
(`component_state`, section `oh1` — *Oral History*), which recomputes whenever
**rsc19** (`component_state`) saves. `rsc19` says nothing about `oh28`. From
`oh28`'s `properties.observe`:

```json
{
    "server": {
        "filter": {
            "$and": [
                {
                    "q": null,
                    "path": [
                        {
                            "name": "digitization",
                            "model": "component_portal",
                            "section_tipo": "oh1",
                            "component_tipo": "oh25"
                        }
                    ],
                    "q_operator": null
                }
            ]
        }
    },
    "component_tipo": "rsc19"
}
```

On every `rsc19` save the engine searches section `oh1` for the interviews that
reference the saved record through the `oh25` portal (*Audiovisual*), and
recomputes `oh28` on each of them.

An entry with **no** `server` key is a client-only observer: the browser
subscribes locally and the server does nothing. Both kinds are common — measured
on this install, 60 of the 136 `observe` entries are client-only, and 39 of the
67 nodes that carry `observe` declare at least one `server` half. A `server`
value that is present but is *not* an object (`"server": null`, a string, a
number) is malformed authoring — it never dispatches, and it is reported as a
contract violation.

!!! note "First match wins"
    When an observer declares several entries, the **first** entry in array
    order whose `component_tipo` equals the observed tipo (or is `"all"`) is the
    one that dispatches. A client-only entry placed before a `server` entry for
    the same tipo shadows it.

### The legacy forward `observers` array

An edge used to require a **second, mirror declaration**: a
`properties.observers` spec (`[{section_tipo, component_tipo}]`) on the
**observed** component, naming its watcher. Half-declared edges were therefore
silent dead configuration, and dropping that requirement is the point of the
2026-08-02 rebuild. Measured on this install: **73 dispatchable edges**, of which
**9** had never dispatched at all despite a perfectly correct `observe`
declaration. Six of those nine do real server-side work; the remaining three
resolve to the terminal no-op described further down, so they now dispatch but
still compute nothing.

The forward array survives for exactly **two jobs**:

1. **Scoping the `"all"` wildcard.** An `observe` entry with
   `component_tipo: "all"` is a *matching rule* with no intrinsic scope — read
   literally it would mean "every save in the system". The forward specs naming
   the observer are the only thing that bounds it: the wildcard compiles to
   exactly that edge set, and a wildcard nobody forward-declares admits **zero**
   edges. Live wildcard observers here: `numisdata250`, `numisdata257` and
   `tch557` (all `component_portal`, all in section `tchi1`), compiled from one
   forward spec each — `numisdata282`, `numisdata1451` and `tch555`.
2. **Host targeting for a reused component.** A component declared once can be
   reused across several sections, and something has to say whose records the
   edge covers. Live case: `rsc387` (`component_autocomplete_hi` —
   *Descriptors*) carries three forward specs naming the same observer
   `hierarchy93`, with `section_tipo` `on1`, `ts1` and `dc1` — three virtual
   faces of section `hierarchy20` (*Thesaurus*), where `hierarchy93` itself is
   defined.

    On *that* edge the scope is not what the save-time recompute searches — it
    is a `set_dato_external` edge, and those take their targets from the saved
    data (see the next section). What the scope buys there is the operator
    sweep: it is the set of sections `scripts/observer_reconcile.ts` walks when
    it rebuilds the mirror offline. A scope that drives dispatch directly is one
    on an SQO-filter edge.

!!! danger "A forward spec with no `observe` half is dead configuration"
    A `properties.observers` spec whose named observer carries **no** matching
    `observe` entry dispatches nothing, on either side. The engine reports every
    such edge **at every boot** and counts it
    (`observers_registry_contract_violations`). Four exist on this install —
    `rsc1139`, `rsc1140`, `rsc1401` and `rsc1403`, each naming `rsc19` — and
    they had been dead for this install's entire life without a single symptom.
    Fix the ontology: add the `observe` half on the observer, or delete the
    stale spec.

### Discovery: the subscription registry

Edges are discovered by a **subscription registry** built over the whole
ontology — every node carrying `observe` or `observers` — not by reading the
saved node alone. The registry is cached process-wide and invalidated
automatically after every ontology write (deferred to the write's commit), and
it is warmed at boot, so each deploy or restart re-validates the real ontology
and prints every violation it finds. Its state is also exposed operationally:
the `observers_registry` gauge and the `observers_*` counters on
`GET /api/v1/counters`.

!!! warning "Out-of-band ontology surgery needs a restart"
    Invalidation is wired to ontology writes **through the engine**. If you edit
    `dd_ontology` directly in the database, restart the server or the registry
    keeps serving the pre-edit picture.

## What runs: targets × performs

Two orthogonal questions decide what a save does: **which records** an observer
recomputes on, and **what** is computed on each.

### Which records (target resolution)

| Targets | Declared as |
| --- | --- |
| The saved record | `server.filter: false`, no `perform` (only an info-model observer recomputes on it; anything else is a no-op — see the perform table) |
| Everything the just-saved data points at | `server.config.use_observable_dato: true` |
| Both of the above | `use_observable_dato` **and** `use_self_section` true |
| Every record referencing the saved one | `server.filter` is an [SQO](../sqo.md) object: a search over the **host section** in which every clause's `q` becomes the saved record's locator, with `from_component_tipo` taken from the first clause's last path step |

The observable-data targets are the locators **in the payload the save door just
handed over**, not a re-read of the record — they are never found by searching a
section. On the portal-deletion door that payload is deliberately the set of
locators that were **removed**, because those are precisely the records whose
mirrors have to be rebuilt. Only the SQO-filter shape needs a host section.

!!! note "On a `set_dato_external` edge, `server.filter` is ignored"
    An external-mirror edge takes its targets from the observable data whatever
    the filter says. Only a
    [component_info](../components/component_info.md) observer (or a
    `component_state` / `component_calculation` alias) uses the filter to
    *select* targets. For every other observer the filter only picks a branch:
    `false` is the terminal no-op, absent-plus-`use_observable_dato` is the
    relay. One playground edge declares a filter **and** `set_dato_external` —
    `test199` (`component_portal`, section `test183`) observing `test188`, a
    `box elements` node — and the filter has no effect there. Read it as a
    demonstration of the rule, not as authoring to copy.

### Host-section resolution

The host section is "whose records do I search / sweep". It is resolved in this
order:

1. the `observe` entry's own `section_tipo` — the authoring home for new edges.
   No shipped entry uses it yet; it is the fix when step 3 fails;
2. a forward spec's `section_tipo` — the reused-component targeting described
   above. The literal `"self"` names no foreign scope and falls through to
   step 3, which is what "self" means;
3. the observer's **own section** (its ontology ancestor), refined by the SQO
   filter path — see the virtual-section rule below;
4. unresolved → the recompute is **refused loudly**, naming the edge, and
   counted as `observers_host_section_unresolved`. Nothing reaches this on the
   current ontology.

Step 3 treats **virtual and real sections as equivalent**. A
[virtual section](../sections/section.md) names its real section in its first
relation, and stored records carry the *virtual* tipo — so when the filter path
names a virtual face of the observer's own real section, the **path's face
wins**. Live example: `numisdata1478` and `numisdata1479` (both
`component_info` — *Composition by period* / *Composition by Era*) observe
`numisdata1373` (`component_autocomplete_hi` — *Period*) through a filter path
naming section `numisdata5` (*Complex*), while their own ontology section is
`numisdata276` (*Location*). `numisdata5` is a virtual face of `numisdata276`,
so the two agree and the search runs against `numisdata5`, where the records
actually live. A path naming a **non**-equivalent section resolves to nothing —
the engine refuses rather than silently retargeting.

### What is computed (the perform)

| Perform | Declared as | Effect |
| --- | --- | --- |
| Info recompute | observer is a `component_info` (or a `component_state` / `component_calculation` alias) with **no** `perform` | Recomputes the widgets on each target and writes **one** `matrix_time_machine` row per target (lang `lg-nolan`). It deliberately never touches the live stored value — live reads compute. Targets equal to the saved record additionally ride the save response, so the open editing panel refreshes. |
| `set_dato_external` | `perform: {function: "set_dato_external"}` **and** `config.use_observable_dato: true` | Recomputes the observer's **external mirror** on each target — the value law below. |
| Relay | no `perform`, no `filter`, `config.use_observable_dato: true`, observer is not an info model | A pure **trigger**. It writes nothing at all: no value change, no Time Machine row, no modified stamps. It exists only to re-enter propagation so a dependency chain can continue. |
| Terminal no-op | `filter: false`, no `perform`, observer is not an info model | Nothing runs server-side; the client half is the whole point of the entry. |

Measured coverage of the 73 dispatchable edges on this install:

| Edges | Shape |
| ---: | --- |
| 33 | info / state / calculation recompute on the saved record (`filter: false`) |
| 20 | `set_dato_external` external-mirror recompute |
| 7 | info recompute through an SQO filter |
| 3 | terminal no-op (`filter: false` on a non-info observer) |
| 2 | relay |
| 8 | declared but **not covered** — see below |

!!! warning "Eight declared edges are skipped loudly, not run"
    The engine never guesses an unimplemented shape: it logs
    `server shape not covered` and does nothing. Seven of the eight declare
    `perform: set_dato_external` without `config.use_observable_dato`, which is
    the key that names the targets — so the entry has nothing to recompute on:

    - **six** carry no `config` block at all — `numisdata563`, `numisdata574`,
      `numisdata575`, `numisdata993`, `numisdata1227` and `numisdata1229`, all
      `component_autocomplete_hi`;
    - **one** carries a `config` block that sets only the inert
      `use_inverse_relations`: `numisdata965` (`component_portal`) observing
      `numisdata11` (`component_portal` — *Ordered coins*).

    The eighth is different: `rsc1214` (`component_select`) observing `rsc1156`
    declares a perfectly well-formed target config **and**
    `perform: {"function": "refresh_data"}`. That perform is **not
    implemented** — a real, dated gap, stated rather than approximated.

!!! danger "None of the eight is fixable by adding `use_observable_dato` alone"
    Adding `"config": {"use_observable_dato": true}` is *necessary* for those
    seven, but on none of these nodes is it *sufficient* — the edge stays dead
    and simply fails one step later:

    - the six `component_autocomplete_hi` nodes have `source.mode: "external"`
      and a `source.section_to_search`, but **no `source.component_to_search`** —
      without it the value law is undefined, and the recompute skips with
      `observers_component_to_search_missing`;
    - `numisdata965` carries `source.source_overwrite`, so it is refused
      wholesale by the unrecognized-derivation-rule guard below, before any
      compute;
    - `rsc1214` already has the target config; what it needs is the
      `refresh_data` perform, which is code, not configuration.

    Wire the missing `source` keys first, and treat the `source_overwrite` case
    as blocked until that rule is ported.

!!! warning "`use_inverse_relations` is INERT"
    One live entry declares `config: {use_inverse_relations: true}` — the
    `numisdata965` ← `numisdata11` edge above. **Nothing reads that key**, so it
    resolves no targets and the edge falls into the not-covered skip. Do not
    copy it expecting an inverse-reference resolver. (`numisdata965`'s *other*
    edge, ← `numisdata656`, is a covered `set_dato_external` shape; that one
    reaches the recompute and is refused there for `source_overwrite`.)

## The value law of `set_dato_external`

An **external mirror** is a relation component — a `component_portal` (or one of
its `component_autocomplete` aliases) with `properties.source.mode: "external"` —
whose stored value is *derived*: the list of every record that references its
host record. `set_dato_external` is the perform that recomputes it:

> The observer's value becomes every record referencing the target record — **or
> any equivalent of the target** — through `source.component_to_search`, limited
> to `source.section_to_search`. Existing entries keep their stored order; new
> references are appended with the next item id. The search is uncapped and
> ordered by `section_tipo`, `section_id`.

The running example is **numisdata77** (`component_portal` — *Coins*, in section
`numisdata3`, *Type*): "which coins are of this type". Its
`properties.source`, display keys omitted:

```json
{
    "mode": "external",
    "data_from_field": ["numisdata36"],
    "section_to_search": ["numisdata4"],
    "component_to_search": ["numisdata161"]
}
```

`numisdata161` (`component_autocomplete` — *Type*) is the coin's link **to** a
type, in section `numisdata4` (*Numismatic object*). The mirror is the inverse of
that link, and it is stored as ordinary relation data — `relation` is singular
and keyed by component tipo, one locator per referencing record. Type record 16
on this install:

```json
{
    "relation": {
        "numisdata77": [
            {
                "id": 1,
                "type": "dd151",
                "section_id": "356",
                "section_tipo": "numisdata4",
                "from_component_tipo": "numisdata77"
            },
            {
                "id": 2,
                "type": "dd151",
                "section_id": "61153",
                "section_tipo": "numisdata4",
                "from_component_tipo": "numisdata77"
            }
        ]
    }
}
```

A mirror does not have to have equivalents. `hierarchy93` (`component_autocomplete`
— *Library*, in section `hierarchy20`) declares only `section_to_search`
`rsc205` and `component_to_search` `rsc387`: it lists the publications citing
the term, and nothing more.

### Equivalents — `source.data_from_field`

The inverse-reference search is seeded with **more** than the target record. For
each component tipo listed in `source.data_from_field`, the target's value in
that peer component — *plus* that peer's relation-type closure — joins the seed,
and every seed entry is re-stamped with `from_component_tipo =
component_to_search` so it matches the referencing component's locators.
Semantically:

> The mirror lists the records referencing this record **or any of its
> equivalents**.

A closure is computed **only when the peer is a
[`component_relation_related`](../components/component_relation_related.md)**. A
peer of any other relation model contributes its stored bag alone, whatever its
`relation_type_rel` says — that is a model-level rule, not a bug, and a peer of
the wrong model is the quiet way to end up with a short mirror. For a related
peer, how far the closure reaches depends on its
`config_relation.relation_type_rel`:

| `relation_type_rel` | Closure |
| --- | --- |
| `dd620` (unidirectional) | none — the stored bag only |
| `dd467` (bidirectional) | one inverse hop |
| `dd621` (multidirectional) | the **full symmetric transitive closure**, in both recursion directions |

`numisdata77`'s peer is `numisdata36`
([`component_relation_related`](../components/component_relation_related.md) —
*Equivalent terms*) with `relation_type_rel: dd621`. So a coin that references
*any* type in an equivalence group appears in the mirror of *every* type in that
group.

!!! info "The closure is the law — measured"
    Recomputing all 19,908 `numisdata3` records that hold a `numisdata77` mirror
    and comparing against the stored, migrated truth: seeding with the target
    alone loses **318,122** locators; adding the peer's stored bag (one hop)
    still loses **247,933**; the full `dd621` transitive closure is exact —
    19,885 of 19,908 records byte-identical, 13 locators residual. A one-hop
    implementation is not an approximation, it is wrong by a quarter of a
    million locators.

A declared peer whose ontology node is missing (a partial install) degrades the
seed to the stored bag — loudly, and counted as
`observers_seed_peer_node_missing`, never silently.

### `references_limit` is never honoured

!!! warning "`perform.params.references_limit` is inert on the write path — deliberately"
    Shipped configs declare it, mostly as `0` (the "no limit" sentinel), a few as
    `200`. Honouring a finite cap on a **write** path would persist a truncated
    mirror: a capped result set is indistinguishable from "these records stopped
    referencing you", and the merge removes by omission. Measured: `numisdata250`
    on record 162 of section `tchi1` stores 1,023 locators against its own
    declared limit of 200 — honouring the cap would destroy 823 of them at the
    next save on that record. The recompute always searches
    uncapped, and a finite non-zero limit is refused outright and counted as
    `observers_references_limit_refused`, never applied. The divergence is
    recorded in the wire-contract ledger under `engineering/wire_contract/`.

### The 2,000-reference freeze

A recompute whose search returns more than 2,000 referencing records computes
the diff for honest reporting but **refuses to persist it**, logged and counted
as `observers_big_result_refused` — a retained safeguard against very expensive
saves. It is reachable here: the widest real case holds 4,547 referencers.

## Safety laws

All four are unconditional. None of them can be switched off.

### Grow-only: no stored entry is dropped

The recompute splits into *kept* entries and *additions*. **Additions always
persist. No stored entry is ever dropped** unless the caller explicitly opts in
— and no production caller does. A withheld drop is logged and counted as
`observers_shrink_refused`. The decision is membership-based, not length-based:
a recompute that wants to drop one entry and add another commits the addition
and withholds the drop.

This is a deliberate, temporary trade. Until the value law is fully settled,
anything the recompute wants to remove is treated as suspect, so **a legitimate
removal is not mirrored automatically**. Operators reconcile deliberately with
the maintenance script `scripts/observer_reconcile.ts` — dry-run by default,
`--apply --allow-shrink` to perform the drops. The same script heals mirrors
after bulk operations that bypass the per-component save door.

### Unrecognized derivation rules are refused

A node whose `properties.source` carries `source_overwrite` or
`set_observed_data` follows a derivation rule this engine has **not**
implemented. Running the default law on such a node is provably wrong — up to
computing an empty mirror against a large stored one — so the recompute refuses
these nodes **before any write**, counted as
`observers_unported_sublaw_refused`.

!!! danger "This refusal is load-bearing"
    Live instances on this install: `numisdata679` and `numisdata965` (both
    `component_portal`, in section `numisdata651` — *Catalog*), which carry
    `source_overwrite`. Dry-run against real records measured stored mirrors of
    1,077, 959 and 766 entries all recomputing to **zero** under the default
    law. Between them the two nodes hold **131,806 locators across 4,688
    records**, and the refusal is what stands between those and a full wipe. Do
    not "unblock" a node by deleting the key; port the rule.

### The bounded cascade

An observer the engine has just acted on is, from the graph's point of view,
itself a save — so **its** observers fire in turn, and a dependency chain
continues. Re-entry is bounded by a visited set shared across the whole
cascade (one dispatch per observer, per hop kind, per record, per propagation)
and a depth budget of **8** hops. A true cycle or a budget overrun is a loud,
counted refusal naming the full chain (`observers_cascade_cycle_refused`,
`observers_cascade_depth_exceeded`) — never a silent truncation, never a hang.
The same node reached along two different branches is a benign diamond,
deduplicated and counted as `observers_cascade_converged_skipped`. The real
graph on this install is depth 2 with zero cycles; the budget is a backstop.

Which branches emit a hop is not uniform, and the asymmetry is deliberate:

- a **`set_dato_external`** recompute emits one only when it actually persisted
  something — a refusal, a withheld shrink or a no-drift result ends the branch;
- a **relay** always emits one. Emitting the hop is the relay's entire purpose;
  it writes nothing else;
- an **info recompute** always emits one, per target.

A hop into an observer that has no subscriptions of its own is a leaf and is
dropped before it is scheduled, so it never appears in the guard or the logs.

Cascade hops run **after the enclosing save commits**. Inside a transaction — a
CSV import row, for instance — the hop is queued on a commit-only lane that
fires on commit and is **discarded on rollback**, so a rolled-back save never
propagates.

### There is no configuration switch

The cascade is unconditional: **the ontology decides, not the deployment.**
Mirrors are stored data, so a deployment flag would let two installs with the
same ontology store different values. (A rollout flag existed briefly during the
rebuild and was removed the day the benchmark cleared it.)

Measured cost: one external-mirror hop p50 1.3 ms, p90 3.1 ms; the widest
records — mirrors up to 1,189 entries — p50 10.6 ms; the worst real case, 4,547
referencers, 22 ms. Cost *per entry* falls as fan-out grows (61.8 ms down to
5.2 ms per 100 entries), so the recompute is sub-linear in practice.

## A real chain, end to end

The intent is documented in the ontology itself — `numisdata161`'s own forward
spec narrates it. Two hops, the deepest chain on this install:

1. **`numisdata161`** (`component_autocomplete` — a coin's *Type* link, in
   section `numisdata4`) saves.
2. **`numisdata36`** (`component_relation_related` — *Equivalent terms*, in
   section `numisdata3`) observes it as a **relay**: no `perform`, targets taken
   from the saved locators.

    ```json
    {
        "info": "Numismatic object update his type data. It's fired to save his data by numisdata161 because it's necesary update all equivalent types",
        "server": {
            "config": {
                "use_self_section": false,
                "use_observable_dato": true
            }
        },
        "component_tipo": "numisdata161"
    }
    ```

    The relay writes nothing. It exists so that step 3 fires for **every
    equivalent type**, not only the one the coin now points at.

3. **`numisdata77`** (the *Coins* mirror above) observes `numisdata36` with
   `perform: set_dato_external` and `use_self_section: true` — so each type in
   the equivalence group recomputes its own mirror.

The same three-stage shape exists for objects: `tch241` → `tch40`
(`component_relation_related`) → `tch33` (`component_portal`).

## Why didn't my observer fire?

Work the list top-down.

1. **Is the edge declared where the engine looks?** The **observer's**
   `properties.observe` must contain an entry whose `component_tipo` is the
   observed tipo (or `"all"` plus a forward spec naming the observer), and that
   entry must carry a `server` **object**. `server: null`, a scalar, or a
   client-only entry never dispatches. Remember first-match: an earlier entry
   for the same tipo shadows a later one.
2. **Read the boot log.** Every restart validates the whole ontology and prints
   one `observer subscription contract violation: …` line per problem —
   forward-only dead specs, dead wildcards, unresolved host sections, malformed
   `server` values — each naming the exact edge and the fix.
3. **Is the shape covered?** A `server` block whose `perform` or target config
   the engine does not implement is skipped with a `server shape not covered`
   log. The eight live cases are enumerated above; the usual cause is a
   `set_dato_external` perform with no `config.use_observable_dato`.
4. **Check the counters.** `GET /api/v1/counters` carries the
   `observers_registry` gauge and the refusal counters. Configuration problems:
   `observers_registry_contract_violations`,
   `observers_host_section_unresolved`, `observers_component_to_search_missing`,
   `observers_unported_sublaw_refused`. Runtime refusals:
   `observers_shrink_refused`, `observers_big_result_refused`,
   `observers_references_limit_refused`, and the `observers_cascade_*` family.
5. **Mirror short by thousands?** Look at the `data_from_field` peer: it must be
   a `component_relation_related` (no other model computes a closure at all),
   its `relation_type_rel` must be `dd621` for the full closure, and its
   ontology node must exist — a missing one degrades the seed to the stored bag
   and counts `observers_seed_peer_node_missing`.
6. **Edited the ontology out-of-band?** Restart the server; the registry only
   invalidates on writes made through the engine.
7. **Expecting a removal to propagate?** It will not, by design. Run
   `scripts/observer_reconcile.ts --apply --allow-shrink`.
