# OUTBOUND_SPEC — how the engine reaches another server

Standing spec for every request that LEAVES the institution. Built 2026-09-29,
when the harvesting door (`src/core/harvest/`) joined the two doors that
already existed. Companions: `engineering/EXTERNAL_SPEC.md` §5 (the external
door's own order, which this file does not repeat), `engineering/ERRORS_SPEC.md`
(the code registry), `engineering/TRIPWIRES.md` (the gates named in §6).

The rule in one line: **the engine has THREE outbound doors, the request's
KIND chooses the door, and all three stand on one guard.** A new outbound need
fits one of the three; a fourth door, or a private copy of any piece of the
guard, is the defect the gates in §6 exist to refuse.

---

## 1. The guard every door stands on

`src/core/security/ssrf_guard.ts` owns the pieces that must exist exactly once,
because every copy of them so far has drifted from the original:

| Piece | What it guarantees |
|---|---|
| `assertPublicUrl` | RESOLVES the host and vets EVERY address it answers. An address is judged by where it reaches (`isPrivateIp`, through `carriedIpv4`): an IPv6 address inside an AUTHORITATIVE carrier — IPv4-mapped, the NAT64 well-known prefix, or a prefix the operator DECLARED (`DEDALO_NAT64_PREFIXES`) — is judged wholly as its embedded IPv4; one inside a prefix only DISCOVERED from the resolver (RFC 7050) is refused when that IPv4 is non-public but otherwise judged by the ordinary IPv6 rules, so a discovered prefix only ever refuses more. Zone ids are refused. `embeddedIpv4` (the exported fold) follows authoritative carriers only; `claimedIpv4s` answers "which IPv4 MAY this reach" for EVERY carrier — the authoritative fold, the discovered claim, the deprecated IPv4-compatible and SIIT embeddings, and the local-use `64:ff9b:1::/48` read in every RFC 6052 layout — for refusing only (tighten-only). The guard is meant to be the ONE owner of that answer: a caller with its own policy (the on-premise transcriber) reads it instead of keeping a carrier table of its own. The transcriber (`src/core/tools/transcription_local_asr.ts`) judges every IPv4 `claimedIpv4s` returns — the metadata refusal and, exemption OFF, the private-host rule — so the deprecated and local-use readings are withheld wherever an authoritative carrier (well-known or DECLARED) already reads the address: the declaration IS the layout, and a spurious reading (the zero suffix of a declared `/48` read as `0.0.0.0` at `/96`) would refuse what the guard accepts. PENDING: it still unions a redundant copy of the deprecated and local-use tables into its metadata check; that copy is to be deleted, and no module outside `src/core/security/` may import a carrier primitive (`extractRfc6052Ipv4`, `packedInBlock`, `packBlocks`, `packCidr`) without a reasoned census row (`ssrf_one_guard_tripwire`). |
| `isAddressRefusal` | Tells a caller "the guard refused the ADDRESS" without the caller copying reason strings. A module other than the guard that spells an address reason is refused (`ssrf_one_guard_tripwire`). |
| `pinToVettedAddress` | Points the socket at the VETTED address, keeping the real host for `Host`, SNI and certificate identity — so a resolver cannot answer "public" to the check and "internal" to the connect (DNS rebinding). Self-checks the result. |
| `readBytesCapped` | The one streamed, capped body reader: over the ceiling the body is CANCELLED (never drained), either refused or truncated-and-flagged; an idle bound drops a peer that goes silent. |
| `untilAborted` | The one "race a promise against a stop" primitive: the awaited work is never cancelled, the listener never outlives the call. Gated by OUTCOME: every harvest wait on a job's signal must leave no abort listener behind (`harvest_door_native`). |
| `parseRetryAfterMs` | The one `Retry-After` reader (digits or an HTTP-date, anything else null), UNCLAMPED — each door applies its own ceiling. Gated by OUTCOME at each door that honours the header: a lenient date `Date.parse` would read (`2099-01-01T00:00:00Z`) must ask no wait (`harvest_door_native`, `external_transport_native`). |
| `fetchPinnedHop` | The shared pinned primitive: ONE request, vetted and pinned, redirect handed back unread (§4). |
| `fetchGuardedText` | `fetchPinnedHop` used ONCE: vetted AND pinned (the name is resolved once, the socket connects to the address that was vetted), bounded, and any 3xx with a `Location` REFUSED as a typed `security.outbound_failed` reason `redirect`. |

Address refusals are `security.ssrf_blocked` at the single-call and harvesting
doors, with OPERATOR disclosure: naming what a host resolved to is the
internal-network oracle the guard exists to deny. The external door classifies
the same refusal in its own taxonomy, as `external.blocked_host`
(`engineering/EXTERNAL_SPEC.md` §5), which discloses no address either. Transport failures at the primitive are
`security.outbound_failed` (reason `timeout` / `idle` / `aborted` / `transport` /
`body_cap`, with the `stage` — resolve / connect / body — where it applies); at the
single-call doors a refused redirect is reason `redirect` and a non-2xx answer
carries its `status` (message `HTTP <n>`), its body cancelled unread — an error
page never costs the ceiling or the deadline, and never turns into a timeout or a
`body_cap`.

## 2. The three doors

| Door | For | Redirects | May be used by |
|---|---|---|---|
| `fetchGuardedText` (`ssrf_guard.ts`) | ONE call to an API: a translation service, a speech-to-text provider — vetted and PINNED | REFUSED — a 3xx re-chooses the target | engine code and tools; a tool only by a reasoned row (§6) |
| `fetchExternalJson` (`src/external/transport.ts`) | an external RECORD SERVICE bound in the ontology | REFUSED | `src/external/` only |
| `harvestFetch` (`src/core/harvest/harvest.ts`) | a page, image or file on ANOTHER SITE, the way a person would reach it | FOLLOWED, one vetted hop at a time (§3) | tools that harvest |

Choosing: a service whose endpoint the operator configured → `fetchGuardedText`.
A record resolved from a third-party catalogue → `src/external/`. Anything a
cataloguer pasted or a crawler found on someone else's website → `harvestFetch`.
`tool_import_rdf` still dereferences the RDF URIs a cataloguer typed through
`fetchGuardedText`: that is a SHRINK-ONLY `TOOL_RAW_DOOR_IMPORTERS` row in
`test/unit/ssrf_one_guard_tripwire.test.ts`, deleted by its move to
`harvestFetch` — not an example of the door's proper use.

`fetchBoundedText` is the SAME transport core as `fetchGuardedText` (the hop's
total deadline composed with the job's signal, the shared capped reader, the same
typed failures, any 3xx refused) with NO pin and NO address policy. It exists for
a destination that is legitimately PRIVATE (an on-premise sidecar on the
institution's LAN), so such a caller never copies a bare `fetch` to get the
timeout and the ceiling. Every caller must apply its OWN named address policy
first, and is censused for it.

**Named residual — the local-ASR door (`isSafeLocalAsrUrl`,
`src/core/tools/transcription_local_asr.ts`).** Its policy is synchronous and
judges only the configured host's LITERAL forms: a transcriber URI whose NAME
resolves to a metadata address (169.254.169.254, `fd00:ec2::254`) or a tunnel
passes the "metadata never, exemption or not" rule, and `fetchBoundedText` then
connects by name, unpinned. The URI is admin tool-config, not client input, so
this is not a client-supplied SSRF — but it is a door that judges without
resolving. Closure: resolve the host through the guard's lookup, refuse when any
answer (or any `claimedIpv4s` form of it) is metadata or a tunnel, and connect
pinned to the vetted address through a private-policy variant of the pinned hop
(the `fetchPinnedHop` core with the policy injected).

The external door's nine-step order (kill switches, breaker, host allowlist
before any DNS, vet + pin, credential attached last, capped read, retry,
breaker update) is `engineering/EXTERNAL_SPEC.md` §5, and its failures are the
external taxonomy there — not repeated here.

## 3. The harvesting door, hop by hop

A harvester needs what an API call must refuse (following redirects) and owes
what an API call does not (robots.txt, a polite pace). `harvestFetch` runs the
whole contract for EVERY hop of a redirect chain, in this order:

1. **URL shape** — http(s) only, no credentials in the URL, never https → http,
   https only when the caller asked for it, no longer than `MAX_URL_LENGTH`.
2. **The caller's host policy** — `'public'`, or an allowlist of sites (a site
   admits its subdomains, never a look-alike).
3. **robots.txt** for the hop's origin, as RFC 9309 defines it: 4xx allows
   everything, and so do more than `MAX_REDIRECTS` redirects (§2.3.1.2); 5xx /
   429 / no answer — and a 3xx the fetch does not follow (no `Location`, or a
   300 / 304 / 305) — is a COMPLETE disallow, retryable
   (`harvest.robots_unavailable`); a redirect the per-hop URL rules refuse is a
   complete disallow too, but deterministic, so NOT retryable
   (`robots_redirect_refused`, kept for the normal TTL). The file is read to
   `ROBOTS_MAX_BYTES` (512 KiB) and a longer one is TRUNCATED at its last whole
   line, not refused; a file that is not UTF-8 is read byte-wise (`%XX` for every
   byte from 0x80); a file with more than `ROBOTS_MAX_RULES` (4096) rules for us or
   a pattern longer than `ROBOTS_MAX_PATTERN_LENGTH` (2048) is refused whole
   (`robots_too_complex`) — a DELIBERATE deviation from §2.5, whose parsing floor
   is 500 KiB: a short file of 4097 rules is refused although it is well under it.
   The rule text has no bound of its own (the byte ceiling bounds it, the encoding
   at most triples it), so any file within the byte ceiling and the two caps is
   obeyed as written, in any script. The cache of verdicts is bounded by origin
   count and by what it retains (`ROBOTS_CACHE_MAX_WEIGHT`, rule objects counted
   as well as pattern text). Rule and path meet in ONE
   percent-encoding (§2.2.2: unreserved `%XX` decoded, non-ASCII and unsafe ASCII
   encoded); the path is judged in every distinct form — as sent and canonical
   (`/` runs collapsed, `;params` stripped), each also with literal `*` / `$` as
   `%2A` / `%24` (§2.2.3), each also with reserved `%XX` decoded on both sides —
   and any form disallowed refuses. Each match is linear in path + pattern (KMP,
   never the host's `indexOf`), and the WORK of a hop — wildcard rules × the
   length of every form, plus the pattern text per form — is weighed before any
   match: past `ROBOTS_MAX_MATCH_WORK` the hop is refused as `robots_too_complex`
   (the input bounds alone do not compose: measured 610 ms for one hop inside all
   of them). The robots fetch is itself a pinned, vetted, bounded request under
   one fixed policy.
4. **The per-origin pace** — one request at a time per origin (keyed by
   `siteKey`: the origin with a trailing root dot dropped, so `example.org.` is
   not a second server), our own floor between them, the site's `Crawl-delay` and
   `Retry-After` honoured but clamped. The robots cache keys the same way.
5. **`fetchPinnedHop`** — every address public, the socket pinned, a total
   deadline (from the DNS resolution of the address check through the last body
   byte) and an idle one, the job's stop signal (which also ends a resolver that
   never answers), the capped read; with an expected media type, a 2xx of
   another type is refused before its body is read.

A 3xx carrying `Location` becomes the next hop and starts again at 1, up to
`MAX_REDIRECTS`; one more is a refusal, never a silent stop on a 3xx. Any other
answer, 4xx and 5xx included, is RETURNED with its status: a missing lot is
information the tool reports, not a transport failure.

The door does not parse, judge what a page means, or detect a bot-challenge
page served with 200. Those are the tool's.

| Code | When |
|---|---|
| `harvest.refused` (public) | a policy said no; `details.reason` is one of `unparseable`, `protocol`, `credentials`, `url_too_long`, `requires_https`, `downgrade`, `host_not_allowed`, `bad_location`, `too_many_redirects`, `robots_too_complex`, `robots_redirect_refused`. `details.site` is the origin the caller asked for — for the two `robots_*` reasons the origin whose robots.txt decided, for `unparseable` a fixed token (never the caller's text) |
| `harvest.robots_disallowed` | the site's robots.txt disallows the path |
| `harvest.robots_unavailable` (retryable) | the site failed to deliver its robots.txt |
| `harvest.too_large` | the body passed the caller's ceiling (the primitive's `body_cap`, mapped at the door) |
| `harvest.unexpected_type` | a 2xx of a media type the caller did not expect |
| `security.ssrf_blocked` | the address refusal of §1 — never softened into a `harvest.*` code |
| `security.outbound_failed` | timeout, idle, stopped job, transport |

## 4. `fetchPinnedHop` — the one pinned primitive

It runs `assertPublicUrl` ITSELF, so it can never be called on an unvetted
target; refuses zone ids; pins; sends with `redirect: 'manual'`; composes its
deadline with the running job's signal (unless detached, for a fetch shared by
many jobs); on a CONNECT-level failure tries the next vetted address — a POST
only when the failure proves nothing was sent (a refused or unreachable route,
never a reset: RFC 9110 §9.2.2, a re-sent `transcribe` is a second, billed job) —
never after an HTTP answer; and returns `location` ONLY for a 301/302/303/307/308
that carries one — that body is cancelled unread, every other status is read
normally. It applies NO other policy: scheme, downgrade, host allowlist,
robots, pacing and the hop limit belong to its caller.

That is why it has exactly ONE production IMPORTER, the harvest redirect loop
(`src/core/harvest/follow.ts`). A second importer is a second redirect loop, and
the first one to forget a per-hop rule is an open redirect into the harvester.
Inside the guard, `fetchGuardedText` uses the hop ONCE and refuses any
`location` it hands back — no loop, so not a second redirect-follower; it is how
the single-call door connects to the address it vetted.

The loop itself, `followVetted`, is held to the same rule one level up. It
vets every hop's URL, but robots.txt and pacing are whatever its caller passes
as `beforeHop`, so it has exactly TWO callers: `harvestFetch` (robots, then the
paced turn) and the robots.txt fetch (which IS the robots check, unpaced). A
tool imports `harvestFetch`, never the loop.

## 5. What is not a door

A few sites dial out without the guard because they cannot use it: a unix
socket on this machine, a loopback health poll of a child this process spawned,
an operator-configured endpoint that is legitimately private (a model sidecar
on the institution's LAN), and the operator-configured downloads still being
moved onto the guard. They
are a SHRINK-ONLY burn-down list with a reason each, in
`test/unit/ssrf_one_guard_tripwire.test.ts` (`EXEMPT`) — that list is the
record, not this file.

## 6. The gates

| Gate | Enforces |
|---|---|
| `test/unit/ssrf_one_guard_tripwire.test.ts` | No outbound socket outside the guard except the burn-down list; `fetchPinnedHop` has one production importer and `followVetted` two; a tool holds a raw door only by a reasoned row. The importer census follows import BINDINGS through re-exports, not spellings. A tool holding ANY outbound door (`harvestFetch` included) reads no error's `.message` (the guard's names the refused address — report `toErrorBody(toDedaloError(error))`); no module but the guard spells an address reason (read them with `isAddressRefusal`). The ATTACKER-AAAA TRUTH TABLE drives every IPv4 carrier (mapped, NAT64, declared at every layout, local-use in every layout, IPv4-compatible, SIIT, 6to4, Teredo, discovered) × non-public/public payloads, special blocks, a first-hextet allowlist sweep and multi-record answers, under three discovery modes, through `assertPublicUrl` (resolved and literal), `isPrivateIp`, `isSafeLocalAsrUrl` (exemption on and off) and `claimedIpv4s`; a DECLARED local-use prefix (`64:ff9b:1::/48`, `/96`) keeps the transcriber with the exemption OFF equal to the guard and `claimedIpv4s` exactly the declared reading; the oracle is the test's own RFC 6052 encoder, and the mutations that must turn it red are recorded in its header. Outside `src/core/security/` a module imports a carrier primitive (`extractRfc6052Ipv4`, `packedInBlock`, `packBlocks`, `packCidr`) only by a reasoned, shrink-only census row (by import binding); that census cannot see a hand-rolled byte comparison, so every holder of ANY address byte primitive (`packIpv6`, `packAddress`, `ipInCidr` …) is registered as an `inbound` (client-IP allowlist) or `outbound` judge, and each outbound judge's exported predicate is DRIVEN through the truth table with every exemption off and must equal the guard (shrink-only rows). A module that parses addresses with no primitive of `ip_address.ts` is outside the census. |
| `test/unit/guarded_text_pin_native.test.ts` | `fetchGuardedText` connects to the address it vetted: a rebinding resolver gets ONE lookup and the socket the vetted IP (Host and SNI kept); a 3xx is refused unfollowed; a non-2xx, a stalled resolver and a failing socket are typed `security.outbound_failed`; a POST reset after sending is not re-sent to the next address (a refused one is, and a GET always); a `URLSearchParams` body reaches the socket unchanged; an unsupported method, body or init key is refused before any socket. On BOTH text doors (`fetchBoundedText` against a loopback peer) a caller's `maxBytes` and the default ceiling end the read as `body_cap`, the stream cancelled, and a non-2xx is `HTTP <n>` with its body cancelled unread (a stalled or oversized error page included). On both doors a caller's `timeoutMs` ends a stall within an upper bound, and with none the 15 s default ends it at exactly 15 s (fake clock). On `fetchBoundedText`, as loopback outcomes: a 302 is refused typed with its `Location` never contacted, a closed port is `transport`/`connect`, and the running job's stop reaches the connect (`aborted`). On `fetchGuardedText` — the door translation and transcription take inside job lanes (PERF-11) — a socket that never answers is released by the job's stop as `aborted`/`connect`, long before the deadline. |
| `test/unit/outbound_fetch_tripwire.test.ts` | Every outbound call carries a signal and every fetching file declares its byte bound; each door's call closure applies what it claims (vetting, pin, shared reader, deadline, redirect mode) and the primitives are driven through their seams; every `fetchBoundedText` caller applies an address policy. |
| `test/unit/external_outbound_tripwire.test.ts` | The external door is the only one under `src/external/`, in its order. |
| `test/unit/harvest_door_native.test.ts` | The harvesting door's rules, driven — and, by OUTCOME, the two guard pieces a spelling census cannot pin: no wait leaves an abort listener behind (`untilAborted`), and a `Retry-After` only `Date.parse` would read asks no wait (`parseRetryAfterMs`). |
| `test/unit/external_transport_native.test.ts` | The external door's order (`EXTERNAL_SPEC.md` §5) — and the same `Retry-After` outcome at that door. |

The three tripwires' and `guarded_text_pin_native`'s full rows are in
`engineering/TRIPWIRES.md`; the other two `_native` gates are behavioural suites,
not index rows.
