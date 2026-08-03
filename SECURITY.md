# Security policy

Dédalo holds primary research material — interviews, archives, personal data of people
who are often not the archive's own staff. A vulnerability here is rarely "a website
went down"; it is somebody's testimony being readable by the wrong person. Please treat
reports accordingly, and we will.

## Supported versions

| Version | Status |
|---|---|
| **v7 (this repo, TypeScript/Bun)** | Supported — the single engine since the 2026-07-11 cutover. |
| v6 and earlier (PHP) | Unsupported. The PHP engine is decommissioned; the frozen tree is historical reference only. Report anything you find, but the fix will be "upgrade to v7". |

## Reporting a vulnerability

**Do not open a public issue for a security report.** Use either:

- GitHub → the repository's **Security** tab → *Report a vulnerability* (private
  advisory; preferred, since it keeps the discussion and the fix in one place), or
- email **code@dedalo.dev**.

Useful in a first message: the version or commit, what an attacker gains, and the
smallest thing that reproduces it. Proof-of-concept code is welcome, and so is a rough
report you are not sure about — a false alarm costs an afternoon, a missed report costs
somebody's records.

We aim to acknowledge within a few working days. This is a small team on a public
codebase, not a vendor with a 24/7 rota; if you have heard nothing in a week, send a
reminder rather than assuming the report was dismissed.

Please give us reasonable time to ship a fix before publishing, and tell us how you want
to be credited (including "not at all").

## Scope notes for researchers

Things that are known, deliberate, and not findings on their own:

- **`../private/.env` lives outside the repo** and holds every credential. A
  vulnerability that requires read access to it already assumes a compromised host.
- **Media files are protected by the WEB SERVER**, not by the engine's byte path (files
  reach 32 GB) — the engine generates the Apache/nginx rules. A media-access finding
  needs to say which of the three enforcement surfaces disagrees.
- **The publication API and the site builder are separate, read-only daemons**
  (`publication/`), outside the engine's gates by design. They are in scope — just say
  which one you are looking at.
- **Accepted dependency advisories** are recorded in
  `engineering/dependency_audit_baseline.json`. A report that repeats one of those adds
  nothing unless you can show it is reachable in Dédalo's own use of the dependency —
  which would be very welcome.

Automated-scanner output pasted without a reachability argument is usually not
actionable. One concrete exploited path beats fifty "the scanner said so".
