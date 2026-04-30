---
description: Master orchestrator for a code-base security audit (XSS, SQLi, command exec, IDOR). Use when the user asks for a security review, vulnerability scan, or pen-test-style code analysis.
---

# Security Audit — Master Playbook

Run the four sub-audits below in this order. Each has its own workflow:

1. `/security-audit-cmdexec` — shell injection
2. `/security-audit-sqli` — SQL injection
3. `/security-audit-xss` — cross-site scripting
4. `/security-audit-idor` — authorization / IDOR

This file holds **shared conventions**. Read it once before running any sub-audit.

## Scope rules (apply to every audit)

- **Audit:** first-party production code (`core/`, `tools/`, `shared/`, app entry points).
- **Skip:** `lib/`, `vendor/`, `test/`, any directory named `acc/`, generated/minified files.
- **Skip:** `*.md`, `*.json` config snapshots unless they execute (no `.htaccess` exception — those DO ship security posture).

## Classification rubric (A/B/C/D)

Every finding gets one letter. Use the same letters across all four audits.

| Class | Meaning | Action |
|---|---|---|
| **A** | Sink uses safe API (`escapeshellarg`, `pg_query_params`, `textContent`, parameterized authz) and all values are constants or already-sanitized server state. | None. Document only if sink looks suspicious at first glance. |
| **B** | Raw sink, but every interpolated value is a constant, server-derived path, `(int)` cast, or comes from a checked-in JSON allowlist. **No taint path from API/CLI boundary.** | Document; revisit only when callers grow. |
| **C** | Raw sink reachable only from authenticated admin / superuser / install / CLI surface. Caller is currently disciplined; helper itself does not enforce safety. | Fix when convenient. Add a trip-wire (sentinel comment + defensive escape). |
| **D** | User-controllable taint reaches sink without parameterization, escaping, or authorization. | **Fix immediately.** Test before/after. |

## Output artifacts (one per sub-audit + a master register)

Always create files under `security-audit/` at repo root:

- `security-audit/<vector>-findings.md` — per-vector audit (one each for cmdexec, sqli, xss, idor).
- `security-audit/security-findings.md` — master register with `SEC-NNN` IDs, severity, status.
- `security-audit/attack-surface.md` — entry-point map (HTTP, CLI, file uploads, install).

### Per-vector findings doc structure

```
# <Vector> Audit — <date>
**Scope:** first-party PHP/JS, excluding lib/vendor/test/acc.
**Method:** A/B/C/D classification per shared rubric (see `.windsurf/workflows/security-audit.md`).

## Inventory
| File | Sites | Hot path? |
|---|---|---|

## Headline classification
| Class | Sites | Action |
|---|---|---|

## Fix log
| ID | Title | Fix |
|---|---|---|

## Class D — fixed
### D-1 — <name>
**File:** `path:line`
**Reachable from:** <surface>
**Pre-fix template:** `code`
**PoC payload:** `…`
**Fix:** `escapeshellarg / pg_query_params / textContent / assert_*`

## Class C — concerning
## Class B — verified safe
## Open helpers worth retiring
## Recommended fix order
## Out of scope (deferred)
```

### Master register row format

```
| SEC-NNN | Severity | One-line description | path:line | status (fixed | open | verified) |
```

## In-code marker convention

Every fix carries a `// SEC-NNN: <one-line rationale>` comment at the call site.
This makes every change traceable via `rg -oI "SEC-0[0-9]+" --type php --type js`.

## Per-fix workflow

For every D-class:

1. **Locate** all call sites with grep (per-vector workflow lists the patterns).
2. **Trace** taint from the entry point (HTTP API, CLI, file upload) to the sink.
3. **Reproduce** the issue mentally (write the PoC payload in the findings doc).
4. **Fix** with the minimal upstream change. Prefer fix at the helper, not at every caller.
5. **Mark** the fix with `SEC-NNN`.
6. **Verify** with `php -l` and the most relevant `phpunit` suite. Run baseline before/after if test count changes.
7. **Record** in both the per-vector findings doc and the master register.

## Verification cadence

After every C/D fix, run:

```bash
php -l <edited file>
vendor/bin/phpunit -c test/server/phpunit.xml <relevant suite>
```

After a batch of fixes, run a baseline comparison:

```bash
git stash push -u -m "audit_baseline" \
  && vendor/bin/phpunit -c test/server/phpunit.xml <suites> 2>&1 | grep -E "^[0-9]+\)" > /tmp/baseline.txt \
  && git stash pop \
  && vendor/bin/phpunit -c test/server/phpunit.xml <suites> 2>&1 | grep -E "^[0-9]+\)" > /tmp/post.txt \
  && diff /tmp/baseline.txt /tmp/post.txt
```

Any new failure must be triaged: pre-existing test order issue, fixture missing `user_login()`, or actual regression.

## Common false positives

- **Comment blocks containing shell/SQL syntax** — grep matches but it's documentation.
- **Server-built paths/constants** (`DEDALO_*`, `__DIR__`, etc.) — pure-config, not taint.
- **`(int)`-cast values** — safe by construction; ignore.
- **String literals inside `pg_query_params(..., array(...))`** — already parameterized.

## When to stop

Stop when:
- All D-class items are closed (fixed or downgraded with a written rationale).
- Master register entries all have `fixed` or `open + reason` status.
- No new D-class shows up after a re-grep with the per-vector patterns.

The audit is **not** "remove every raw interpolation"; it's "no user-controllable taint reaches a sink".

## Anti-patterns to avoid

- ❌ Widening allowlists to accept legitimate server-built fragments. Instead, **split the field** (e.g. `column` vs `column_sql`) so the strict gate stays strict.
- ❌ Fixing every call site one-by-one when a single helper change suffices.
- ❌ Adding "denylist" sanitizers (`str_replace('--', '')`) — always allowlist.
- ❌ Deleting tests because they break after a permission gate. Add `user_login()` instead.
- ❌ Skipping the threat-model recheck. Many findings collapse from D to Low when the entry point is properly traced.
