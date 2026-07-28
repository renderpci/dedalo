# Object identification — specification

**What the system IS.** Permanent definition; the process history lives in
`rewrite/ai/IDENTIFY_PLAN.md` (internal, gitignored).

Status: engine complete and gated (`src/core/identify/`, `src/ai/rag/image_source.ts`),
reachable over the API (`dd_identify_api:find_matches`) with profiles loaded from
the ontology (§3.1). Proposals are served and confirmable: `get_proposals` +
`tools/tool_identify/` close the "AI proposes, human confirms" loop (§8.3), and a
clustered group can be PROMOTED to a canonical Type record its members link to
(§8.4, `resolve_type_link` + the ordinary component save). What is still open is
listed in §9.

---

## 1. The problem

Catalogues repeat themselves. A coin showing Athena with a palm and a star is
the same type as another coin showing Athena with a palm and a star. An amphora
with a given rim profile is the same typology as another with that profile. A
photograph archive repeats people, symbols and places.

Identification decomposes an object into its **elements** and matches those
elements against the corpus — proposing candidates, letting a curator confirm,
and (later) promoting a recurring cluster into a canonical Type record.

## 2. The one idea

**An element is not a special kind of data.** It is whatever a component path
resolves to: a thesaurus term through a portal, a legend reached through the
object's Type, a literal form code, a date.

So **a criterion is an SQO `path`**:

```json
[ { "section_tipo": "numisdata4", "component_tipo": "numisdata161" },
  { "section_tipo": "numisdata3", "component_tipo": "numisdata40" } ]
```

*Coin → Type → Obverse legend.*

Everything follows from that. The picker is the search panel's recursive field
list (`client/dedalo/core/common/js/render_common.js` `render_components_list`,
already reused by `tool_export` and `tool_print`). The storage pattern is the
one presets already use for multi-hop filters. The query engine is
`conform.ts`'s existing LATERAL join chain. None of it is rebuilt.

An earlier draft assumed elements live in one thesaurus reached by indexation.
That is wrong and the design would not survive it: a coin reaches its legends
and mints *through its Type*, not through its own components.

## 3. Profiles are curatorial data

One object section holds ceramics, iron and wood — with and without
iconography, with and without legends. What identifies each is different, and
it changes as a collection is studied. So a profile is **selected by what the
object is**, not by where it is stored, and it is authored, not coded.

| Field | Meaning |
|---|---|
| `sectionTipos` | object sections this profile applies to |
| `typeSectionTipo` | where canonical Types live, or null (a photo archive clusters but has nothing to promote into) |
| `criteria` | the features (below) |
| `thresholds` | `sameType` / `candidate`, both in 0..1 of achievable identifying weight |
| `exactSetIdentity` | see §5 |
| `previewComponent` | the media component whose THUMB illustrates a record, or null |

`previewComponent` is here for the same reason the rest of the profile is:
**identification is a VISUAL task** — a curator deciding whether two coins share
a die reads the breakdown, but looks at the pictures — and nothing else in the
system can answer "which of this section's media components IS the object's
photograph". The candidate's section is arbitrary, so the client cannot know it;
the profile already states what this kind of object is, so it states this too.
It is optional, and a section that declares none simply shows no thumbnails.

Refused at parse time (§3.1's posture, for a failure that is otherwise
INVISIBLE — a wrong tipo produces no picture, forever, and looks exactly like an
unphotographed collection): a tipo that does not exist, is not a media
component, is a media type with no thumb tier (`component_svg`), or is held by
none of the profile's sections.

### Criterion

| Field | Meaning |
|---|---|
| `path` | the picked field path (an SQO `path`) |
| `role` | `identifying` \| `descriptive` \| `ignored` |
| `weight` | contribution to the score; ignored when `required` (§5) |
| `mode` | how two values are compared (§4) |
| `required` | a candidate lacking this is not a match at all — the decision-tree gate |
| `tolerance` | grams, years, or a similarity floor |

`role` is explicit rather than inferred from the component model: the same
portal means "must be the exact same term" in one collection and "anywhere in
this branch" in another, and only a curator knows which.

### 3.1 Where a profile comes from

The first source is the **section's ontology node**, under `properties.identify`
— the same place and posture as `properties.rag.context` (`src/ai/rag/config.ts`):
strict parse, virtual-aware read (the virtual section's own node wins, else the
real section's via `relations[0].tipo`). Loader: `identify/profile_source.ts`
`loadProfileForSection`.

```json
{ "id": "coin_types", "label": "Coin identification",
  "sectionTipos": ["numisdata4"], "typeSectionTipo": "numisdata3",
  "previewComponent": "numisdata21",
  "exactSetIdentity": false,
  "thresholds": { "sameType": 0.85, "candidate": 0.5 },
  "criteria": [
    { "id": "obverse_legend", "label": "Type › Obverse legend",
      "path": [ {"section_tipo":"numisdata4","component_tipo":"numisdata161"},
                {"section_tipo":"numisdata3","component_tipo":"numisdata40"} ],
      "role": "identifying", "mode": "same_locator", "weight": 3, "required": true },
    { "id": "weight_g", "label": "Weight (g)",
      "path": [ {"section_tipo":"numisdata4","component_tipo":"numisdata22"} ],
      "role": "descriptive", "mode": "numeric_tolerance", "tolerance": 0.15 }
  ] }
```

`id` and `sectionTipos` are optional (the descriptor is *located* by section, so
it need not repeat that); everything else is stated explicitly. Path steps are
snake_case because they are literally SQO path steps and reach the search engine
unmodified.

Three answers, never collapsed into one:

- **absent** → `null`. "This section does not do identification" is normal, and
  the API declines cleanly (`no_profile`).
- **malformed** → throws `ProfileError`, including on an **unknown key**:
  `weigth: 5` parses as weight 1, which is a dropped feature wearing a typo. A
  criterion that quietly stops contributing still produces a confident score
  from fewer features than the curator configured, and ranked output hides that
  completely.
- **unreadable** (the ontology read itself failed) → throws. Reporting it as
  "no profile" would cache a transient error as a permanent verdict.

Resolved profiles are cached per section through `createOntologyCache`, so a
curator's edit to the descriptor takes effect on the next request.

**Seam — record-backed profiles.** §3 says profiles are authored, not coded; the
ontology descriptor is the first step because a `dd_ontology` write needs the
operator. The seam is `ProfileSourcePort`: the loader never reads the ontology
itself. A record-backed source is a second port implementation plus a resolution
order — and it must additionally wire record-data invalidation
(`registerSectionDataListener`), because the cache above is ontology-derived
only.

### 3.2 The API

`dd_identify_api:find_matches` (`src/core/api/handlers/dd_identify_api.ts`),
registered in the dispatch `ACTION_REGISTRY` like every other class:

```
{ section_tipo, section_id, limit? }   limit clamped to [1,50], default 20
→ { seed:{section_tipo, section_id, thumb_url},
    profile:{id,label},
    results:[{section_tipo, section_id, thumb_url, score, verdict,
              outcomes:[{criterion_id, label, agreed, weight, detail,
                         restricted?, required?}]}],
    more_available, blind_criteria, restricted_criteria }
```

**The two outcome markers are part of the contract**, and both are emitted only
when true (an ordinary outcome keeps its shape):

- `restricted` — this caller has no grant on the criterion, so it was neither
  compared nor quoted (§6). It arrives with `agreed: null` and a CONSTANT
  detail, and reading that null as "nobody recorded it" would draw a conclusion
  about the DATA from a fact about the READER. `restricted_criteria` says the
  same for the run: **the scores in this answer are partial**, computed over the
  criteria this caller may see. Kept apart from `blind_criteria` at every level
  — panel notice included — because the two are claims about different things.
- `required` — the criterion is the profile's GATE, so its declared `weight`
  travels but contributes nothing to the ratio (§5). Without the marker the
  number is unreadable: it names a contribution that was never made, and a
  weight someone zeroed to "signal" the exclusion renders as *descriptive —
  shown, not scored*, i.e. the weakest thing in the profile, when it is the one
  thing every scored candidate had to agree on. **The signal is the marker, never
  a zeroed weight.**

The request's principal (`requirePrincipal`) is passed to `findMatches` — the
ACL gate of §6, not a parameter. The section read grant is checked **before** the
profile is loaded, so the decline codes cannot become an oracle for which
sections have a descriptor. Absent profile, malformed profile and unreadable
record are DECLINES (`{result:false, errors:[code]}`), never a 500 — a malformed
profile still travels loudly, carrying the parser's exact message.

**`thumb_url` is resolved server-side** (`identify/preview.ts`), for the seed and
for every scored candidate, from the profile's `previewComponent`. Three rules,
each of which is the difference between a picture and a defect:

- The path grammar is the media subsystem's own (`mediaThumbLocation` /
  `mediaThumbUrl` over the ontology-driven `resolveMediaPathOptions`), never a
  concatenated string — one definition of where a derivative lives.
- **A URL is returned only when the file EXISTS.** `mediaThumbUrl` is pure and
  will happily name an ungenerated derivative, which renders as a broken image
  in every row; absent → `null`, and the client paints a neutral placeholder.
- It resolves thumbs ONLY for records the engine already gated (§6) and makes no
  access decision of its own. A thumbnail resolver with its own weaker notion of
  "readable" is how a media URL for a hidden record leaks. Reading the URL back
  is still the web server's media-protection decision — the engine never serves
  media bytes.

A translatable preview component resolves at the request's data lang (the rule
`media/tool_support.ts` already applies), because that component stores one file
per language.

### 3.3 Identifying a PHOTOGRAPH — material with no record yet

`find_matches` answers "what else is like this RECORD?" and needs the record to
exist. A curator holding an object that has just arrived has the other question,
and nothing to seed with. `dd_identify_api:identify_by_image` takes the picture
instead:

```
{ image, section_tipo?, limit? }      image: base64 or a data: URL
                                      section_tipo: string | string[] (compare scope)
                                      limit clamped to [1,50], default 20
→ { model, scope:[…],
    results:[{section_tipo, section_id, label, similarity, view, thumb_url,
              media_tipo, context,
              types:[{section_tipo, section_id, label}]}],
    warnings:[…] }
```

It embeds the image with the multimodal provider (§7's own stack: the media
switch, the env-configured provider, the egress policy), queries the IMAGE
partition of the vector store, ACL-filters exactly as `object_retrieval` does,
and collapses to best-per-record. The `types` are the answer's point: when the
candidate's section has a profile with a `typeSectionTipo`, the Type it links to
is resolved and named, so the answer reads "this looks like these coins, which
are all Type X" rather than a list of section ids.

- **It writes nothing and leaves nothing behind.** The image is a QUERY, not a
  document: no record, no vector row, no staged file — the bytes live in memory
  for one request. Indexing the query would put an unaccessioned object into the
  corpus that answers everybody else's searches.
- **The input is bounded before it is trusted.** The base64 STRING length is
  checked before decoding (decoding first has already paid the memory), and the
  decoded bytes are sniffed by magic bytes (`media/engine/mime.ts`, the upload
  path's own sniffer) against a closed list of raster formats. A declared
  MIME/`data:` type is never trusted.
- **`empty_index` is not "no matches".** The ANN returns the nearest rows
  whatever their distance, so an empty answer means the partition holds nothing —
  a decline that says so, never an `ok` with zero results. The two are opposite
  facts about the collection and a curator must not read one as the other.
- Everything else declines cleanly too (HTTP 200, `{result:false,
  errors:[code]}`): `rag_disabled`, `media_disabled`, `missing_image`,
  `invalid_image`, `image_too_large`, `egress_forbidden`,
  `provider_unavailable`, `embed_failed`, `forbidden` (a requested scope the
  caller may not open). The egress refusal carries `buildMultimodalProvider`'s
  own operator message — it is a config answer, not a 500.
- **Reading a label or a Type is a SECOND read**, so each is re-gated per
  (section, component) and each Type record passes the record-scope gate before
  its label is quoted. A malformed profile on a candidate's section becomes a
  `warnings` entry on a valid answer — never a silent "this section has no
  Types".
- Only a Type reached by the FIRST hop of a criterion path is reported: the hop
  component of step `i` is stored on the record of step `i-1`, so a Type two hops
  out is not a component of the object and cannot be read from it.

## 4. Match modes — and what they actually do today

| Mode | Semantics | Status |
|---|---|---|
| `same_locator` | shares any linked record | complete |
| `same_term` | same term or a descendant | **narrowed**: identical to `same_locator` today. The ancestor fragment exists (`builder_relation.ts` `buildRelationSearchAncestorFragment`) but is deliberately unwired from the live dispatch; descendant matching needs it wired plus a `WIRE_CONTRACT` entry. |
| `normalized_text` | equal ignoring case, accents, whitespace | **narrowed**: accent- and whitespace-insensitive only. `f_unaccent` strips accents; no existing search leaf expresses anchored case-insensitive equality (`==` renders `=`; the only case-insensitive matcher is on contains/begins/ends shapes). Closing it is a builder change plus a `WIRE_CONTRACT` entry. In-TS comparison IS case-insensitive, so scoring is correct for whatever reaches the pool. |
| `numeric_tolerance` | within `tolerance` | complete |
| `date_overlap` | ranges overlap | **narrowed at the SQL layer**: the date builder compares `start.time` only and has no handle on `end.time`, so the *pool* leaf means "the candidate's start falls in the seed's window" — a candidate whose span brackets the seed but starts earlier is not fetched. In-TS comparison is real overlap. |
| `image_similarity` | visual similarity | not an SQO leaf; routes to the vector store (§7) |

**These narrowings are recorded, not hidden.** Each is a deliberate scope
boundary with a stated cost; none of them silently degrades a query into
something broader than the curator asked for.

## 5. Scoring

Two stages. **Narrow with the database** — required criteria, plus at least one
identifying agreement, compile into one SQO filter run by the normal assembler.
**Score in TypeScript** over that pool only, because partial agreement,
tolerances and set equality are not expressible as one SQL score without
inventing a second query language.

Load-bearing rules:

- **Absence is not disagreement.** A criterion neither side records is not part
  of what was *achievable*. Otherwise sparse records score low for being sparse
  rather than for being different, and the ranking measures cataloguing effort.
- **The required gate asks about the CANDIDATE.** A seed that lacks a required
  field does not empty the result set — a worn, half-catalogued coin is exactly
  what identification is for. Reported in `blindCriteria`.
- **`exactSetIdentity` is the die-study case.** Two coins struck from one die
  carry the same elements, so identity demands the same set with no extras
  either way. Off by default: brittle whenever one cataloguer records more
  detail than another.
- **A `required` criterion's WEIGHT is ignored — it gates, it does not score.**
  Required criteria build the pool, so every candidate that reaches the scorer
  already agrees on them; counting the weight would add the same constant to
  BOTH sides of the ratio and pull every verdict toward `sameType`. With a
  required legend (weight 6) beside a deity (weight 1), a candidate sharing the
  legend and differing on the deity scores 0/1 → `weak`, not 6/7 = 0.857 →
  `same_type`. The gate decides membership; the remaining weights rank within
  it. **A profile whose ONLY identifying criterion is required** therefore has
  nothing left to divide by: its survivors score 1 (they agreed on everything
  the profile can judge), never an empty result set. The breakdown still reports
  the criterion's declared weight, because that is what the curator authored —
  **and marks the outcome `required`, so the number is not read as a
  contribution** (§3.2). The panel renders that as a third state, GATE, beside
  "weight n" and "descriptive": a gate is the strongest criterion in a profile
  and a descriptive one the weakest, and they must never render alike.
- **Every result carries a per-criterion breakdown.** Not a nicety — an
  unexplained score is either ignored or trusted well past what it means.
- **The pool is bounded and says so.** `moreAvailable` is a flag, not a count:
  the query fetches `cap + 2` to answer "is there more?" cheaply — one spare row
  for the probe, and one for the SEED, which satisfies its own filter by
  construction and comes back in its own result set before being dropped. At
  `cap + 1` the seed consumed the probe's row, leaving exactly `cap` survivors
  and reporting "no more" on a pool the LIMIT had genuinely cut. Reporting a
  number instead of a flag would say "1 more" when there might be thousands.

## 6. Access control

The principal is **required**, not optional — `buildSearchSql` treats an absent
principal as an internal unscoped search, so optional would mean "see
everything" by default.

- The pool query runs with the principal, so the projects filter applies.
- Every candidate is re-checked before its values are read, because outcomes
  quote the other record's values as evidence.
- A denied **seed** raises; denied **candidates** are dropped silently — a
  "n hidden" count is an existence oracle.
- **The record boundary is not the whole gate.** dd774 grants are
  per-(section, component) and a criterion path routinely LEAVES the record (a
  coin's legend lives on its Type), so every criterion also passes the ONE
  shared per-component rule — `core/identify/component_access.ts`
  `criterionReadableOn`, which checks the ENTRY component on the record and the
  LEAF component whose value would be quoted. All four paths run it: matching,
  proposals, clustering and vision.
- **What a denied criterion does to a MATCH** (`match.ts` scoreCandidate states
  the reasoning where the choice is made): it is neither read nor compared, and
  appears in `outcomes` with `agreed: null`, `restricted: true` and a CONSTANT
  detail — never a value. It enters neither side of the ratio, exactly as a
  criterion nobody recorded does, so the score is a well-defined ratio over what
  this caller may see. Because that means a restricted caller sees a DIFFERENT
  score for the same pair than a privileged one, the report says so:
  `restrictedCriteria` names them, and is kept apart from `blindCriteria`
  ("the seed records nothing here" is a claim about the data, not the caller).
  **Both reach the wire** as `outcomes[].restricted` and `restricted_criteria`
  (§3.2) and are rendered as their own row state and their own panel notice — a
  partial answer that does not say it is partial is worse than a bare one.
  Dropping the candidate instead was rejected: a component grant is uniform
  across a section, so it would turn one missing grant into "this feature
  returns nothing", silently, on a corpus full of matches.
- **Three cases still drop the candidate**, because keeping it would make its
  PRESENCE the disclosure: a denied `required` criterion that is the profile's
  gate (the pool was selected by it, and the gate cannot be verified — every
  candidate falls, and `restrictedCriteria` says why the answer is empty); a
  candidate with no readable agreement at all when something was denied (the
  pool's `$or` admitted it on something, so nothing readable agreeing names the
  denied criterion); and, upstream, the SEED's own criteria are gated too, so a
  component this caller may not read never compiles into the pool query.

## 7. The image index

One vector per declared media component, in the multimodal model's partition.

- **Masters are never read.** `original`/`modified` (and install-renamed
  equivalents) come from `masterQualities()` in `core/media/protection.ts` —
  ONE definition shared with the web-serving filter, so an install that renames
  a tier cannot protect one path and not the other.
- **Modality scoping is load-bearing.** Each pass prunes "stored keys I did not
  produce". Without scoping, the text and image halves delete each other's rows
  and both report success, so the queue marks the record converged. Model names
  are not a separator — a joint image+text model is one name by design.
- **Egress is judged by ADDRESS, not by label.** `DEDALO_RAG_IMAGE_EGRESS_POLICY`
  defaults to `local_only`; a provider is external when its label says so *or*
  its endpoint is off-host. Unparseable fails closed. The institution decides
  the policy; the engine does not moralise about it, and does not gate on
  publication state.
- **Staleness** = `sha256(version | encoder-bytes hash | context summary)`. The
  summary rides the row as `source_text` and is the only text an image vector
  carries, so a corrected typology re-embeds the image.
- Translatable media components are **refused loudly** — one file per language
  cannot be honestly represented by one vector per component.

## 8. Invariants

Each has a mechanical gate, per the project's tripwire-or-delete law:

| Invariant | Gate |
|---|---|
| A criterion path is validated against the live ontology; a dangling hop throws | `identify_profile.test.ts` |
| Absence never counts as disagreement; a seed's own gap never empties results | `identify_match.test.ts` |
| A `required` criterion GATES and never enters the ratio (its weight is ignored, per §5), and a profile whose only identifying criterion is required still answers | `identify_match.test.ts` |
| A pool the cap truncated reports it — the seed occupying one of its own rows never turns `moreAvailable` into a false "no more" | `identify_match.test.ts` |
| A denied principal gets nothing, and inaccessible candidates are never read | `identify_match.test.ts` |
| A criterion the caller has no component grant on (entry OR leaf) is never read and never quoted; it leaves the ratio rather than the result, the report labels the run partial, and the three cases where the candidate's mere presence would disclose it drop instead | `identify_match.test.ts` |
| The path walker cannot spin on a self-referential ontology | `identify_path_read.test.ts` (verified by removing the guard) |
| Reader and matcher agree — the seed finds itself through the real assembler | `identify_path_read.test.ts` |
| A master tier is never embeddable, and the master set is shared | `rag_image_source.test.ts` |
| Off-host endpoints are external whatever the label claims | `rag_image_source.test.ts` |
| Feature flags never delete an index; failures never prune | `rag_indexer_images.test.ts` |
| A date stamp agrees with its own fields | `test3_canonical_fixture.test.ts` |
| A wrong `previewComponent` (absent, non-media, thumbless, foreign section) throws at parse time | `identify_profile.test.ts` |
| No `previewComponent` yields no thumbs and no crash; a thumb that is not on disk yields nothing, never a URL | `identify_preview.test.ts` |
| A malformed descriptor (including an unknown key) throws; an absent one answers null; a failed ontology read is not "no profile" | `identify_profile_source.test.ts` |
| A virtual section inherits its real section's descriptor, and its own wins | `identify_profile_source.test.ts` |
| The API declines (never 500s) on absent/malformed profile and unreadable record, and checks the section grant first | `identify_api.test.ts` |
| The request principal is what gates the engine; a denied caller gets nothing | `identify_api.test.ts` |
| A partial answer says it is partial ON THE WIRE: `outcomes[].restricted` and `restricted_criteria` survive the handler's field whitelist | `identify_api.test.ts` |
| The GATE marks itself: `outcomes[].required` reaches the wire, so a declared weight is never read as a contribution | `identify_api.test.ts`, `identify_match.test.ts` |
| An uploaded query image is bounded and sniffed before it is embedded; a non-image is refused | `identify_by_image.test.ts` |
| An EMPTY image index declines distinctly; hits the caller may not see are "no matches", not an empty index | `identify_by_image.test.ts` |
| Identifying by image writes nothing — no record, no vector row, no staged file | `identify_by_image.test.ts` |
| A label or a Type the caller may not read is never quoted, and the gate stops the read | `identify_by_image.test.ts` |
| **Nothing on the proposal path can write** — no write-module import (static, dynamic, `require` or re-export), no DML, no `scheduleBackground`/`enqueueDiffusionJob`, no `api/dispatch` | `identify_propose.test.ts` (the recursive scan of `src/ai/identify/**`, scanner in `test/helpers/no_write_scan.ts`, whose extractor and pattern list have gates of their own) |
| `vision.ts`, the second proposal source, is scanned by that same rule and not merely listed | `identify_vision.test.ts` (runs `scanFileForWriteSeam` on it, with an anti-vacuity probe) |
| A neighbour the caller cannot read casts no vote and appears in no evidence | `identify_propose.test.ts` |
| A criterion the seed already records is never proposed for | `identify_propose.test.ts` |
| A cluster is exactly the connected component of its own shipped edges; chaining is measured, not hidden | `identify_cluster.test.ts` |
| An edge to a record outside the admitted node set is discarded — a hidden record cannot bridge two clusters | `identify_cluster.test.ts` |
| A denied record appears in no member list, no link and no singleton list, and its values are never read | `identify_cluster.test.ts` |
| The pool is capped and the truncation is reported; an explicit record list is capped too | `identify_cluster.test.ts` |
| Absence never becomes a cluster consensus; a component the caller may not read is never quoted | `identify_cluster.test.ts` |
| The clustering action is on the background allowlist and gated at READ level on its section targets | `identify_cluster.test.ts` |
| A profile with no `typeSectionTipo` declines PROMOTION distinctly ("nothing to promote into"), and no criterion reaching the Type section in one hop REFUSES rather than naming a plausible portal | `identify_type_link.test.ts` |
| The Type-link rule has ONE definition, shared by `identify_by_image` and promotion | `identify_type_link.test.ts` (over a section holding a DECOY portal into the Type section that no criterion reveals: the forbidden "first portal aimed at the right section" fallback answers differently, and `identify_by_image` never even reads the decoy) |
| Each section's criteria edges are held to its OWN `thresholds.sameType`, and every applied floor is echoed (`thresholds.criteriaBySection`); a run with several distinct floors states no single one | `identify_cluster.test.ts` |
| The promotion survey re-gates twice (the member's link component, then the Type record) and is capped | `identify_type_link.test.ts` |
| `dd_identify_api` exposes exactly four actions, all reads — promotion adds no write door | `identify_api.test.ts` |

## 8.1 Proposals

`src/ai/identify/propose.ts` fills the criteria a record leaves empty, by
weighted vote over similar records that are already tagged. Every proposal
carries its distribution and cites the neighbours that voted for it.

Neighbours come from the image index when the section has one, and from
structural agreement (`findMatches`) otherwise — **which leg ran is always
reported**, including the case where an index exists but this record has no
indexed image. A fallback nobody can see is a silent change of meaning.

**It cannot write, structurally.** The user's rule is that nothing is written by
a model; this module returns data and has no path to a save, which is gated by
a static scan rather than left to convention. Acceptance is a curator action
that goes through the normal component save.

Proposals reuse the matcher's own `normalizeText` and virtual-calendar constant
rather than copies: two normalizers would split a vote over spellings the
matcher considers one value, and the disagreement would surface as a confidence
that quietly makes no sense rather than as an error.

## 8.2 Clustering — confirming a batch, not a record

`find_matches` asks "what else is like THIS record?", one seed at a time. After
an import the curator has the other question: **"which of these two hundred are
the same thing?"** — and answering it by opening two hundred records is the work
this system exists to remove. `src/ai/identify/cluster.ts` `clusterRecords` takes
a SET and returns the groups inside it.

**The method is threshold-based connected components** over a pairwise
similarity graph, and it is chosen for legibility rather than sophistication:
no centroids, no `k` to guess, no seed, no library. Each record asks both legs
for its neighbours (the image index, and the criteria matcher); a neighbour above
the relevant threshold becomes an EDGE tagged with the signal that produced it
and the sentence that explains it; records joined directly or transitively are
one cluster. **The edges ship with the answer**, so "why are these together?" is
read off the data, not inferred from a score.

**Single linkage chains, and the report says so.** A~B and B~C group A with C
even when A and C share nothing. Every cluster therefore carries
`directEdgeRatio` (linked pairs / possible pairs) and `maxChainHops` (the longest
chain inside it) beside `confidence` (the plain mean of its link strengths) and
`weakestLink`. Folding chaining into one confidence number would remove exactly
what a curator must look at before accepting thirty records at once.

- **Both legs are additive, and which one produced a group is reported.** A
  record with no indexed image still clusters, on criteria alone — the image leg
  simply contributes no edge for it. §8.1's "a fallback nobody can see is a
  silent change of meaning" applies here in the same form.
- **Neither threshold is invented.** Visual edges use
  `DEDALO_RAG_NEAR_DUPLICATE_SIMILARITY` (the RAG layer's own "these two pictures
  are the same thing"); criteria edges use the profile's authored
  `thresholds.sameType`. Both are caller-overridable and both are echoed in the
  report, because a grouping cannot be read without the threshold that made it.
  A run may span SEVERAL sections, each holding its own edges to its own authored
  floor, so the criteria side is echoed PER SECTION (`thresholds.criteriaBySection`)
  and the scalar `thresholds.criteria` collapses only when there is genuinely one
  number — otherwise it is null and a note names each. Reporting the first
  section's floor as if it had produced every edge would state that records were
  compared against a threshold they never saw.
- **The pool is capped** (`core/identify/record_pool.ts`, default 300, cap+1 to
  detect truncation) and `truncated` is a FLAG for §5's reason. Clustering is
  quadratic in the pool; an unbounded run over a collection is not an option that
  exists.
- **ACL, in both directions.** The principal is required. A denied record is
  removed from the node set before any edge exists, and `buildClusterGroups`
  discards edges whose endpoints are not both admitted — so a hidden record can
  neither appear in a cluster nor merge two of them. Consensus values are
  re-gated per (section, component) through `core/identify/component_access.ts`,
  the one copy of that gate (proposals use it too).
- **What the members agree on** is computed with the matcher's own
  `compareValues`, so "agree" means here what it means in a match breakdown.
  Absence stays absence: a criterion only some members record is `partial`, one
  nobody records is `unrecorded`, never a spurious consensus.

**Running it: the background tier.** `tools/tool_identify/server/index.ts`
exposes one action, `cluster`, listed in `backgroundRunnable`. That module exists
for the RUNNER and for nothing else — tool_identify's other actions call
`dd_identify_api` directly and gain nothing from a second door — because a run
over an import batch is minutes of work and needs progress, cancellation and a
job record. Progress publishes per record; `ctx.signal` is honoured at every
record boundary and an aborted run returns its partial clusters marked
`stopped`.

**Confirming a cluster is NOT here.** Accepting a group links every member to a
Type, and that link is an ordinary `component_portal` value: the write is the
standard `change_value` component save, issued per member from the client, on the
precedent of `tools/tool_cataloging/js/tool_cataloging.js` (which does all of its
writes that way and owns no server write path). A bespoke confirm endpoint would
be a second write path into portals with no capability the existing one lacks —
and `src/ai/identify/*.ts` stays inside the §8 no-write static scan because of it.
The flow that does it, and the one READ it needs, are §8.4.

## 8.3 Confirmation — the human half of "AI proposes, human confirms"

Both proposal sources — §8.1's neighbour vote and the vision model
(`src/ai/identify/vision.ts`) — are served by ONE action,
`dd_identify_api:get_proposals`:

```
{ section_tipo, section_id, source?, limit?, model_id? }
   source: 'neighbour_vote' (DEFAULT) | 'vision_model' | 'all'
→ { seed, profile,
    sources:[{source, requested, ran, declined, …}],
    proposals:[{source, criterion_id, label, kind, display, value,
                confidence, votes, distribution, evidence,
                provenance, target}] }
```

- **The vision source never runs by default.** It calls a paid model and, under
  `allow_external`, sends the record's photograph off the host — that is not a
  side effect of opening a panel. An unrequested source still appears in
  `sources` with `declined:{reason:'not_requested'}`, so "no model proposals"
  can never be read as "the model looked and found nothing". An unknown source
  name is REFUSED (`invalid_source`), never narrowed to the default.
- **Provenance is on every proposal, and it is a different SHAPE per source** —
  a vote carries which neighbour leg ran, how many neighbours could vote and the
  records that cite the value; a vision proposal carries the model (id, label,
  egress class), its own stated reason and the photograph it read. "Seven similar
  coins record this" and "a machine looking at a picture suggested this" are
  different claims, and the UI can only keep them apart if the DATA does.
- **A source being unavailable is not a request failure.** Whole-request
  declines are `find_matches`'s (`missing_seed`, `forbidden`, `no_profile`,
  `invalid_profile`) plus `invalid_source`; anything else is that source's own
  `declined` entry (the vision module's reasons, or `source_failed`), and the
  other source's proposals still travel.
- **`target` says where an accepted proposal may land, and the engine decides
  it.** A criterion is an SQO path: a MULTI-HOP path's value belongs to the
  linked record the first hop reaches, so it is `writable:false` with
  `reason:'multi_hop'` and the (ACL-gated) linked records to open instead —
  writing it to the seed would put a curator's confirmation in the wrong record,
  silently. The other refusals are `forbidden_component` (the write grant is
  resolved server-side, never guessed by the client), `unsupported_value_kind`
  (a date range is not one component-dialect value this flow can compose) and
  `foreign_section`.

**Acceptance is the ordinary component save, and nothing else.**
`tools/tool_identify/` (`accept_proposal`) gets a live component instance through
`get_instance` and calls `change_value` — the same call the record's own edit
form makes when the curator types, on the §8.2 precedent. So an accepted value is
indistinguishable from a hand-entered one: same TM audit, same observers, same
server-side permission re-check, same diffusion. There is no tool-side write
endpoint, which is also why the no-write static scan over `src/ai/identify/*.ts`
still holds with the loop closed.

**Rejection is not persisted.** There is no schema for a stored rejection and
inventing one is out of scope, so a dismissed proposal is remembered in the
panel's memory and returns when the panel is reopened — which is honest, since
nothing about the record changed.

Gates: `identify_proposals_api.test.ts` (vision opt-in defaulting OFF asserted at
the seam rather than read off the answer, provenance present on every proposal,
every decline, the principal, and each `target` refusal).

## 8.4 Promotion — a cluster becomes a citable Type

§8.2 groups records; until a curator acts, the grouping is IMPLICIT — nothing in
the catalogue records it, nothing can cite it, nothing can count it. Promotion
ends that: a canonical **Type** record, and every member of the group linked to
it. Two paths, both curator-driven: attach the members to an EXISTING Type (the
common case — the typology is usually already catalogued), or mint a NEW Type
record and attach them.

**The write is the ordinary component save, and there is still no write
endpoint.** Attaching a member is `get_instance` + `change_value` on that
record's own link component — issued per member from
`tools/tool_identify/js/render_tool_identify_clusters.js`, on §8.2's precedent —
so an attached link is indistinguishable from a curator picking the Type by hand
(same TM audit, same observers, same server-side permission re-check, same
diffusion). Minting the Type is `section.create_section()`, the client's own "new
record"; naming it is one more ordinary component save. A bulk "confirm cluster"
endpoint would be a second write path into portals with no capability the first
lacks, and `dd_identify_api` stays four READ actions because of it.

The one thing a client cannot work out for itself is served by
`dd_identify_api:resolve_type_link`:

```
{ section_tipo, records?, check_type_id? }   records: the members (capped at 300)
→ { profile, type_section:{section_tipo, can_create, label_component},
    links:[{component_tipo, component_model, writable, reason, revealed_by:[…]}],
    existing_types:[{section_tipo, section_id, label, member_count}],
    members_surveyed,
    type_record:{section_tipo, section_id, exists, label, reason, detail}|null }
```

- **Only where it is meaningful.** `typeSectionTipo: null` is a photo archive: it
  clusters, and has nothing to promote INTO. That is its own decline
  (`no_type_section`), stated in words, and the panel renders no promote control
  at all — an offered button that cannot work is worse than no button.
- **The link component is DERIVED, never guessed** — `typeLinkCandidates`, the
  same rule §3.3's `types` resolution uses and literally the same function: the
  entry component of a criterion **that enters on the section being promoted**
  and whose FIRST hop lands in `typeSectionTipo`. Both halves are load-bearing: a
  profile covers SEVERAL sections (`sectionTipos`), so a criterion entering
  through a sibling section's component names a field these records do not have,
  and offering it as writable writes thirty locators into nothing. The
  entry-hop test is one function (`entryIsOwnComponent`) shared with the accept
  path's `foreign_section` refusal — one question, one answer, in one file. A
  section normally holds several relation components aimed at the Type section, so
  "no criterion reveals it" REFUSES (`no_link_component`) instead of picking a
  plausible portal, and when several criteria reveal DIFFERENT components the
  panel asks the curator rather than choosing. Every candidate ships the criteria
  that revealed it.
- **The grants are resolved server-side** (the link component, the Type section's
  create right, the Type's label component — which is `writable:false` when the
  section's main term is a thesaurus relation, because a typed string cannot be
  composed into one). A client-side guess about a permission is a guess.
- **The survey is what makes the common case one click**: the Types the given
  members already carry, commonest first. Two gates per value, as everywhere
  else — the component grant on the member, then the record-scope gate on the
  Type before its label is quoted.
- **A hand-typed Type id is VERIFIED, not rendered.** "Attach to another existing
  Type, by record id" is the only place in the flow where a locator is typed, so
  it is the only place a typo becomes a bulk write (`4321` for `432` — and a
  portal insert does not check that its target exists). `check_type_id` answers
  existence AND readability server-side, and the panel's confirm step is armed by
  `exists:true` and nothing else. A title lookup cannot do this: it renders
  "tipo / id" for a hit and a miss alike. Missing and forbidden share one
  `not_found` code, deliberately — splitting them is an existence oracle.
- **Confirm before writing.** The panel's flow is choose → REVIEW (what will be
  written, into which component, on how many records, the records named) →
  confirm, and the confirm button states the number. **A run then locks the whole
  promote block**, not the confirm pair: the review button re-renders the stage
  the outcomes are being written into, and the promote toggle closes the form —
  either one hides a live bulk write and allows a second concurrent one.
- **Partial failure is the normal case.** Thirty members are thirty round trips;
  one failure never stops the rest, every member gets `attached` / `already`
  (linked before we arrived — nothing written) / `failed` WITH the server's
  reason / `unconfirmed`, and the failures stay on screen behind a retry that
  runs only them. Silently attaching 27 of 30 is the worst outcome available —
  and REPORTING 30 attached when 3 were written is worse, so the outcome is the
  server's own answer: the echoed `pagination.total` of the link component,
  compared with the total before the save (the engine DROPS a duplicate locator
  and leaves the total unchanged — `component_portal.link_record`'s level-2
  check). `already` derived from the loaded portal PAGE is a guess, because the
  existing link may sit on page 2; `attached` derived from a truthy response is a
  false report, and `unconfirmed` exists so the honest fourth answer is sayable.
- **`data_limit` is honoured.** It is a client-side guard living inside
  `link_record`, which this path deliberately does not use — so a Type-link
  portal with `data_limit: 1` would silently take a second locator, which by hand
  is refused with an alert. The bulk path refuses per member, with the reason, and
  the refusal is a counted outcome (never a silent skip). The rules that decide
  all of this are pure and tested without a browser:
  `tools/tool_identify/js/promote_rules.js` ↔
  `test/unit/identify_promote_write_path.test.ts`.

## 9. Not built yet

Import triage, profiles as editable RECORDS (§3.1 seam — the ontology descriptor
is the first source, not the destination), an OCR proposal source (it feeds the
same §8.3 acceptance flow the vote and the vision model already feed), and region
annotation. Accepting a proposal whose criterion is MULTI-HOP
is also still manual: §8.3 offers the linked record and refuses to write, rather
than editing a second record on the curator's behalf. The qualifier frame reserves a `region` field from the start so
nothing has to be re-tagged when annotation lands.

Region coordinates are **not yet pinned**: the working assumption is normalised
0–1 against the MASTER image, so regenerating a derivative never invalidates an
annotation. This must be decided before any region is stored.
