# @dedalo/parity-harness

Golden-master capture + order-sensitive differ — the executable spec for the
PHP→TS rewrite. A component/section/area/action is "done" only when its corpus
slice diffs **byte-green** against the TS engine.

## Why an order-preserving parser

The wire output is byte-significant: PHP associative arrays preserve insertion
order, but JS `JSON.parse` reorders integer-like keys and collapses number tokens.
`json_canonical.ts` parses into an order-preserving tree so the differ catches key
reordering (e.g. a component that used a plain object where it needed a `Map`) and
number-format drift (`1` vs `1.0`) that a naïve deep-equal would miss.

API response encoding flags (from `core/api/v1/json/index.php:448`):
`JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES` (+ `JSON_PRETTY_PRINT` when
`rqo.pretty_print` is set) — i.e. `dedaloJsonEncode(response, 256 | 64)`.

## Capture golden masters from a running instance

```sh
DEDALO_API_URL='http://localhost:8080/dedalo/core/api/v1/json/' \
DEDALO_SESSION_COOKIE='PHPSESSID=…' \
DEDALO_CSRF_TOKEN='…' \
bun run capture --out fixtures/golden --corpus extra-corpus.json
```

- The built-in corpus seeds no-auth bootstrap actions (`get_environment`,
  `get_login_context`, …) plus error-envelope cases, so capture works before login.
- Authenticated, instance-specific cases (real section tipos / ids) layer in via a
  JSON file (`--corpus` / `CORPUS_FILE`) — no code change needed.

## Diff a candidate against the golden masters

```sh
# PHP-vs-PHP determinism baseline (Phase 0 milestone):
bun run diff fixtures/golden 'http://localhost:8080/dedalo/core/api/v1/json/'

# Later: TS engine vs golden masters (the real gate):
bun run diff fixtures/golden 'http://localhost:3000/core/api/v1/json/'
```

Exits non-zero on any divergence after volatile-field redaction
(`csrf_token` normalised; `debug`/`time`/timing blocks dropped — see
`DEFAULT_DIFFER_OPTIONS`). Wire this into CI per changed area.

## What still needs the live instance

The capture client and CLIs are thin I/O over a running Dédalo; they are exercised
once `DEDALO_API_URL` + a session are provided. The pure logic (parser, differ,
redaction) is unit-tested here with no infrastructure.
