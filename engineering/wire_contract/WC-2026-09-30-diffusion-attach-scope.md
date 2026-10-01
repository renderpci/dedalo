# WC-2026-09-30-diffusion-attach-scope — a second diffuse attaches only to the caller's own identical run

- **Date:** 2026-09-30, adopted with the change that closes audit row DIFF-3
  (audit 2026-09-26, closure plan Step 6).
- **Decision:** DEC-12 (gates: `test/unit/diffusion_attach_scope_native.test.ts`
  — through `diffuseAction` with two real principals — and the queue-level leg
  of `test/unit/diffusion_jobs.test.ts`).
- **FLAGGED FOR OWNER REVIEW:** owner equality is STRICT — global admins are
  not exempt (an admin cannot attach to, or follow through `diffuse`, another
  user's run; `get_process_status` / `list_processes` keep their admin scope).

## Shape before (TS, to 2026-09-29)

A `diffuse` on an (element, section) with an active run attached to that run
whoever asked and whatever they asked for: the partial unique index answered
the conflict and the action handed the caller the live run's follow stream.
User B received user A's frames (A's counters, A's outcome) as if they were
B's, and B's own request — perhaps another selection — was silently dropped.

## Shape after

- The unique index stays keyed by (element, section) — it is what keeps two
  writers off one target.
- A request ATTACHES only when the active run's owner IS the caller and its
  canonical spec equals the request's (`type`, `sqo`, `options` without the
  display-only `total`; `estimated_total` ignored).
- Anything else is refused: `diffusion.target_busy` — category `conflict`,
  HTTP 409, `retryable: true`, disclosure `public`, label
  `error_diffusion_target_busy` ("The publication target is busy with another
  run; retry when it finishes"). The body names nothing of the live run (no
  job id, owner or label); coordinates carry the element and section only.
- The follow stream reads the job through the owner-scoped
  `getOwnedJobById`; the runner keeps the unscoped getter.
